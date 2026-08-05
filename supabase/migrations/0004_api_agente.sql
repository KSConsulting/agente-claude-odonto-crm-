-- =============================================================================
-- API DO AGENTE DE IA — tokens e regras de negócio
-- Rode depois de 0001, 0002 e 0003.
--
-- ✅ APLICADO E VERIFICADO NO BANCO (projeto Odonto Clinica).
--    Cada função foi testada com dados reais: conflito, expediente,
--    idempotência, conferência de dono e revogação de token.
--
-- Contrato dos endpoints: API_AGENTE.md
--
-- POR QUE A LÓGICA ESTÁ AQUI, E NÃO NA EDGE FUNCTION:
--
--   1. Atomicidade. Remarcar precisa mover a consulta num passo só; se fosse
--      "cancela e cria" no TypeScript e o segundo passo falhasse, o paciente
--      ficaria sem consulta nenhuma e ninguém perceberia.
--   2. Fuso horário. A jornada é `time` sem fuso e a consulta é `timestamptz`.
--      O Postgres cruza os dois com `AT TIME ZONE` e acerta o horário de verão;
--      refazer isso em JavaScript é onde essas coisas costumam errar em uma hora.
--   3. Verificável. Dá para testar cada função com SQL, sem subir nada.
--
-- A Edge Function fica fina: confere o token, chama estas funções e monta a
-- frase que o paciente vai ouvir.
-- =============================================================================


-- =============================================================================
-- 1. TABELA: api_tokens
-- Chaves de acesso da API. Criadas e revogadas em Configurações → Tokens.
-- =============================================================================

create table public.api_tokens (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null,
  prefixo       text not null,
  hash          text not null unique,
  ativo         boolean not null default true,
  criado_por    uuid references public.usuarios(id) on delete set null,
  ultimo_acesso timestamptz,
  revogado_em   timestamptz,
  created_at    timestamptz not null default now()
);

-- DECISÃO (hash, não o valor): guardar o token legível significa que um
-- vazamento do banco entrega todos de uma vez, e o "só aparece na criação" vira
-- encenação — o valor continuaria lá, visível para quem tivesse acesso. Guarda-se
-- o SHA-256; dá para conferir quem chega, não para reconstruir.

-- DECISÃO (`prefixo`): os primeiros caracteres, visíveis na lista, para a equipe
-- saber qual token é qual sem precisar do valor inteiro.

-- DECISÃO (revogar é `ativo = false`, não DELETE): o histórico de quem teve
-- acesso e quando não pode sumir junto.

create index api_tokens_ativo_idx on public.api_tokens (ativo);

alter table public.api_tokens enable row level security;

create policy "api_tokens_all" on public.api_tokens
  for all to authenticated using (true) with check (true);


-- =============================================================================
-- 2. VALIDAÇÃO DO TOKEN
--
-- Recebe o SHA-256 do que chegou no cabeçalho e devolve o id do token, ou nulo.
-- O valor em claro nunca entra no banco.
-- =============================================================================

create or replace function public.api_token_valido(p_hash text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  select id into v_id from public.api_tokens where hash = p_hash and ativo;
  if v_id is null then
    return null;
  end if;

  -- `ultimo_acesso` no máximo a cada 5 minutos: sem essa trava, cada consulta
  -- de disponibilidade viraria também uma escrita, e o agente consulta muito.
  update public.api_tokens
     set ultimo_acesso = now()
   where id = v_id
     and (ultimo_acesso is null or ultimo_acesso < now() - interval '5 minutes');

  return v_id;
end;
$$;


-- =============================================================================
-- 3. QUEM ESTÁ LIVRE NESTE HORÁRIO
--
-- Base de tudo: um profissional está livre quando o horário cabe inteiro na
-- jornada dele naquele dia, não bate em consulta ativa e não cai em bloqueio.
-- =============================================================================

create or replace function public.agenda_profissionais_livres(
  p_inicio  timestamptz,
  p_duracao integer default 60
)
returns table (profissional_id uuid, nome text)
language sql
stable
as $$
  with cfg as (
    select coalesce(max(fuso_horario), 'America/Sao_Paulo') as fuso
      from public.configuracoes_clinica
  ),
  janela as (
    select p_inicio as ini, p_inicio + make_interval(mins => p_duracao) as fim
  )
  select p.id, trim(p.nome || ' ' || p.sobrenome)
    from public.profissionais p
    join public.profissional_horarios h
      on h.profissional_id = p.id and h.ativo
   cross join cfg
   cross join janela j
   where p.ativo
     and h.dia_semana = extract(dow from (j.ini at time zone cfg.fuso))::smallint
     and (j.ini at time zone cfg.fuso)::time >= h.hora_inicio
     and (j.fim at time zone cfg.fuso)::time <= h.hora_fim
     and not exists (
       select 1 from public.consultas c
        where c.profissional_id = p.id
          and c.status = 'agendada'
          and tstzrange(c.data_consulta, c.data_fim) && tstzrange(j.ini, j.fim)
     )
     and not exists (
       select 1 from public.profissional_bloqueios b
        where (b.profissional_id is null or b.profissional_id = p.id)
          and tstzrange(b.inicio, b.fim) && tstzrange(j.ini, j.fim)
     )
   order by p.nome;
$$;


-- =============================================================================
-- 4. HORÁRIOS DISPONÍVEIS NUM DIA
--
-- Varre a jornada de cada profissional em passos e devolve o que está livre.
-- Um horário aparece uma vez só, mesmo que dois profissionais o tenham.
-- =============================================================================

create or replace function public.agenda_horarios_disponiveis(
  p_data         date,
  p_profissional uuid default null,
  p_duracao      integer default 60,
  p_passo        integer default 30
)
returns table (horario timestamptz)
language sql
stable
as $$
  with cfg as (
    select coalesce(max(fuso_horario), 'America/Sao_Paulo') as fuso
      from public.configuracoes_clinica
  ),
  jornada as (
    select h.profissional_id, h.hora_inicio, h.hora_fim
      from public.profissional_horarios h
      join public.profissionais p on p.id = h.profissional_id
     where h.ativo
       and p.ativo
       and h.dia_semana = extract(dow from p_data)::smallint
       and (p_profissional is null or h.profissional_id = p_profissional)
  ),
  slots as (
    select j.profissional_id,
           (s at time zone cfg.fuso) as inicio
      from jornada j
     cross join cfg
     cross join lateral generate_series(
       (p_data + j.hora_inicio)::timestamp,
       (p_data + j.hora_fim)::timestamp - make_interval(mins => p_duracao),
       make_interval(mins => p_passo)
     ) as s
  )
  select distinct s.inicio
    from slots s
   where s.inicio > now()
     and not exists (
       select 1 from public.consultas c
        where c.profissional_id = s.profissional_id
          and c.status = 'agendada'
          and tstzrange(c.data_consulta, c.data_fim)
              && tstzrange(s.inicio, s.inicio + make_interval(mins => p_duracao))
     )
     and not exists (
       select 1 from public.profissional_bloqueios b
        where (b.profissional_id is null or b.profissional_id = s.profissional_id)
          and tstzrange(b.inicio, b.fim)
              && tstzrange(s.inicio, s.inicio + make_interval(mins => p_duracao))
     )
   order by 1;
$$;

-- `s.inicio > now()` porque oferecer horário que já passou é pior do que não
-- oferecer nada: o paciente aceita e a recusa vem depois.


-- =============================================================================
-- 5. PRÓXIMO DIA COM VAGA
--
-- Sem isto, o agente pergunta dia a dia até acertar. Procura até 60 dias.
-- =============================================================================

create or replace function public.agenda_proxima_vaga(
  p_a_partir_de  date,
  p_profissional uuid default null,
  p_duracao      integer default 60
)
returns timestamptz
language plpgsql
stable
as $$
declare
  v_dia date;
  v_horario timestamptz;
begin
  for i in 0..60 loop
    v_dia := p_a_partir_de + i;
    select h.horario into v_horario
      from public.agenda_horarios_disponiveis(v_dia, p_profissional, p_duracao) h
     limit 1;
    if v_horario is not null then
      return v_horario;
    end if;
  end loop;
  return null;
end;
$$;


-- =============================================================================
-- 6. MARCAR
--
-- Acha ou cria o paciente pelo WhatsApp, escolhe o profissional quando não vier
-- informado, e insere. Tudo numa chamada só.
-- =============================================================================

create or replace function public.agenda_marcar(
  p_nome           text,
  p_whatsapp       text,
  p_procedimento   text,
  p_data_hora      timestamptz,
  p_profissional_id uuid default null,
  p_duracao        integer default 60,
  p_chave_externa  text default null
)
returns table (
  ok               boolean,
  motivo           text,
  consulta_id      uuid,
  data_hora        timestamptz,
  profissional     text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_whats  text;
  v_lead   uuid;
  v_prof   uuid;
  v_nome   text;
  v_id     uuid;
  v_fuso   text;
  v_dia    date;
begin
  -- IDEMPOTÊNCIA: mesma chave, mesma consulta. Retry do n8n não duplica.
  if p_chave_externa is not null then
    select c.id, c.data_consulta, trim(coalesce(pr.nome,'') || ' ' || coalesce(pr.sobrenome,''))
      into v_id, data_hora, v_nome
      from public.consultas c
      left join public.profissionais pr on pr.id = c.profissional_id
     where c.chave_externa = p_chave_externa;
    if v_id is not null then
      return query select true, null::text, v_id, data_hora, nullif(v_nome,'');
      return;
    end if;
  end if;

  v_whats := regexp_replace(coalesce(p_whatsapp, ''), '[^0-9]', '', 'g');
  if length(v_whats) < 10 then
    return query select false, 'whatsapp_invalido', null::uuid, null::timestamptz, null::text;
    return;
  end if;

  if p_data_hora is null or p_procedimento is null or trim(p_procedimento) = '' then
    return query select false, 'dados_invalidos', null::uuid, null::timestamptz, null::text;
    return;
  end if;

  select coalesce(max(fuso_horario), 'America/Sao_Paulo') into v_fuso
    from public.configuracoes_clinica;
  v_dia := (p_data_hora at time zone v_fuso)::date;

  -- Escolha do profissional
  if p_profissional_id is null then
    select l.profissional_id, l.nome into v_prof, v_nome
      from public.agenda_profissionais_livres(p_data_hora, p_duracao) l
     limit 1;
    if v_prof is null then
      return query select false, 'sem_profissional_livre', null::uuid, null::timestamptz, null::text;
      return;
    end if;
  else
    if not exists (select 1 from public.profissionais where id = p_profissional_id and ativo) then
      return query select false, 'profissional_inexistente', null::uuid, null::timestamptz, null::text;
      return;
    end if;
    -- Motivo preciso: o agente precisa saber SE é horário ocupado (oferece
    -- outro) ou fora de expediente (oferece outro dia). "Não deu" não serve.
    if not exists (
      select 1 from public.profissional_horarios h
       where h.profissional_id = p_profissional_id and h.ativo
         and h.dia_semana = extract(dow from (p_data_hora at time zone v_fuso))::smallint
         and (p_data_hora at time zone v_fuso)::time >= h.hora_inicio
         and ((p_data_hora + make_interval(mins => p_duracao)) at time zone v_fuso)::time <= h.hora_fim
    ) then
      return query select false, 'fora_expediente', null::uuid, null::timestamptz, null::text;
      return;
    end if;
    if exists (
      select 1 from public.profissional_bloqueios b
       where (b.profissional_id is null or b.profissional_id = p_profissional_id)
         and tstzrange(b.inicio, b.fim)
             && tstzrange(p_data_hora, p_data_hora + make_interval(mins => p_duracao))
    ) then
      return query select false, 'fora_expediente', null::uuid, null::timestamptz, null::text;
      return;
    end if;
    v_prof := p_profissional_id;
    select trim(nome || ' ' || sobrenome) into v_nome from public.profissionais where id = v_prof;
  end if;

  -- Paciente: acha pelo WhatsApp, cria se não existir.
  select id into v_lead from public.crm_clinica_dados where whatsapp_lead = v_whats;
  if v_lead is null then
    insert into public.crm_clinica_dados (nome_lead, whatsapp_lead, status, inicio_atendimento)
    values (nullif(trim(coalesce(p_nome,'')), ''), v_whats, 'iniciou_conversa', now())
    returning id into v_lead;
  end if;

  begin
    insert into public.consultas (
      lead_id, profissional_id, procedimento, data_consulta,
      duracao_minutos, status, origem, chave_externa
    ) values (
      v_lead, v_prof, trim(p_procedimento), p_data_hora,
      p_duracao, 'agendada', 'agente_ia', p_chave_externa
    ) returning id into v_id;
  exception
    -- 23P01: a restrição de exclusão pegou uma sobreposição criada entre a
    -- checagem acima e este insert. É o caso da recepção marcando no mesmo
    -- instante — raro, e exatamente por isso o banco é quem decide.
    when exclusion_violation then
      return query select false, 'horario_ocupado', null::uuid, null::timestamptz, null::text;
      return;
  end;

  return query select true, null::text, v_id, p_data_hora, v_nome;
end;
$$;


-- =============================================================================
-- 7. CANCELAR
-- =============================================================================

create or replace function public.agenda_cancelar(
  p_consulta_id uuid,
  p_whatsapp    text default null,
  p_motivo      text default null
)
returns table (
  ok           boolean,
  motivo       text,
  data_hora    timestamptz,
  profissional text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c record;
  v_whats text;
begin
  select c.id, c.status, c.data_consulta, c.lead_id,
         trim(coalesce(pr.nome,'') || ' ' || coalesce(pr.sobrenome,'')) as prof,
         d.whatsapp_lead
    into v_c
    from public.consultas c
    join public.crm_clinica_dados d on d.id = c.lead_id
    left join public.profissionais pr on pr.id = c.profissional_id
   where c.id = p_consulta_id;

  if v_c is null then
    return query select false, 'nao_encontrada', null::timestamptz, null::text;
    return;
  end if;

  -- Conferência: com o WhatsApp em mãos, um ID trocado no fluxo não cancela a
  -- consulta de outra pessoa.
  if p_whatsapp is not null then
    v_whats := regexp_replace(p_whatsapp, '[^0-9]', '', 'g');
    if v_c.whatsapp_lead is distinct from v_whats then
      return query select false, 'nao_pertence', null::timestamptz, null::text;
      return;
    end if;
  end if;

  if v_c.status = 'cancelada' then
    return query select false, 'ja_cancelada', v_c.data_consulta, nullif(v_c.prof,'');
    return;
  end if;
  if v_c.status = 'realizada' then
    return query select false, 'nao_cancelavel', v_c.data_consulta, nullif(v_c.prof,'');
    return;
  end if;

  update public.consultas
     set status = 'cancelada',
         cancelado_em = now(),
         motivo_cancelamento = p_motivo
   where id = p_consulta_id;
  -- O funil acompanha sozinho, pelo trigger consultas_sincroniza_lead.

  return query select true, null::text, v_c.data_consulta, nullif(v_c.prof,'');
end;
$$;


-- =============================================================================
-- 8. REMARCAR
--
-- Um UPDATE só. Nunca "cancela e cria": se o segundo passo falhasse, o paciente
-- ficaria sem consulta nenhuma e ninguém perceberia.
-- =============================================================================

create or replace function public.agenda_remarcar(
  p_consulta_id     uuid,
  p_nova_data_hora  timestamptz,
  p_profissional_id uuid default null,
  p_whatsapp        text default null
)
returns table (
  ok           boolean,
  motivo       text,
  data_hora    timestamptz,
  profissional text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c record;
  v_whats text;
  v_prof uuid;
  v_nome text;
  v_fuso text;
  v_dur integer;
begin
  select c.id, c.status, c.duracao_minutos, c.profissional_id, d.whatsapp_lead
    into v_c
    from public.consultas c
    join public.crm_clinica_dados d on d.id = c.lead_id
   where c.id = p_consulta_id;

  if v_c is null then
    return query select false, 'nao_encontrada', null::timestamptz, null::text;
    return;
  end if;

  if p_whatsapp is not null then
    v_whats := regexp_replace(p_whatsapp, '[^0-9]', '', 'g');
    if v_c.whatsapp_lead is distinct from v_whats then
      return query select false, 'nao_pertence', null::timestamptz, null::text;
      return;
    end if;
  end if;

  if v_c.status <> 'agendada' then
    return query select false, 'nao_encontrada', null::timestamptz, null::text;
    return;
  end if;

  v_dur := v_c.duracao_minutos;
  select coalesce(max(fuso_horario), 'America/Sao_Paulo') into v_fuso
    from public.configuracoes_clinica;

  v_prof := coalesce(p_profissional_id, v_c.profissional_id);

  if v_prof is null then
    select l.profissional_id, l.nome into v_prof, v_nome
      from public.agenda_profissionais_livres(p_nova_data_hora, v_dur) l
     limit 1;
    if v_prof is null then
      return query select false, 'sem_profissional_livre', null::timestamptz, null::text;
      return;
    end if;
  else
    if not exists (
      select 1 from public.profissional_horarios h
       where h.profissional_id = v_prof and h.ativo
         and h.dia_semana = extract(dow from (p_nova_data_hora at time zone v_fuso))::smallint
         and (p_nova_data_hora at time zone v_fuso)::time >= h.hora_inicio
         and ((p_nova_data_hora + make_interval(mins => v_dur)) at time zone v_fuso)::time <= h.hora_fim
    ) then
      return query select false, 'fora_expediente', null::timestamptz, null::text;
      return;
    end if;
    -- A própria consulta fica de fora da checagem: ela está sendo movida, e
    -- adiar em 30 minutos faria o horário antigo brigar com o novo.
    if exists (
      select 1 from public.consultas c
       where c.profissional_id = v_prof
         and c.status = 'agendada'
         and c.id <> p_consulta_id
         and tstzrange(c.data_consulta, c.data_fim)
             && tstzrange(p_nova_data_hora, p_nova_data_hora + make_interval(mins => v_dur))
    ) then
      return query select false, 'horario_ocupado', null::timestamptz, null::text;
      return;
    end if;
    select trim(nome || ' ' || sobrenome) into v_nome from public.profissionais where id = v_prof;
  end if;

  begin
    update public.consultas
       set data_consulta = p_nova_data_hora,
           profissional_id = v_prof
     where id = p_consulta_id;
  exception
    when exclusion_violation then
      return query select false, 'horario_ocupado', null::timestamptz, null::text;
      return;
  end;

  return query select true, null::text, p_nova_data_hora, v_nome;
end;
$$;


-- =============================================================================
-- 9. NOTA SOBRE `security definer`
--
-- As funções chamadas pela API rodam como donas para poderem escrever mesmo
-- sendo invocadas por um papel sem sessão. `set search_path = public` está em
-- todas: sem isso, `security definer` é um vetor clássico de escalada, porque
-- quem chama poderia plantar um schema com objetos de mesmo nome.
--
-- `agenda_profissionais_livres` e `agenda_horarios_disponiveis` são apenas
-- leitura e ficam sem elevação.
-- =============================================================================
