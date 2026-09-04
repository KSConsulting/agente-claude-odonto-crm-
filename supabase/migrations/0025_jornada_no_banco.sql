-- =============================================================================
-- A JORNADA VIRA REGRA DO BANCO
-- Rode este arquivo no SQL Editor DEPOIS de 0024_dashboard_no_banco.sql.
--
-- Tres coisas, e as tres nasceram do mesmo relato: "consegui marcar num
-- domingo, e o correto e o sistema nao deixar".
--
--   1. `dentro_da_jornada()` -- a regra passa a existir UMA vez no SQL. Ela
--      estava copiada em tres funcoes, e as tres tinham o mesmo defeito.
--   2. O defeito da meia-noite, consertado (secao 1).
--   3. Um TRIGGER em `consultas` -- a trava que nao depende de tela nenhuma.
--
-- POR QUE O TRIGGER, SE AS TELAS JA CONFEREM:
-- porque a tela e o lugar errado para uma garantia. A correcao da interface
-- foi publicada as 22:26 de 03/09/2026 e, as 22:43, uma consulta entrou num
-- domingo assim mesmo -- a aba do navegador estava aberta desde antes e
-- continuava rodando o JavaScript velho. Nada no servidor sabia disso.
--
-- E o mesmo argumento da restricao `consultas_sem_sobreposicao` (0002, secao
-- 6): garantia que mora na tela e garantia que uma aba antiga ignora.
-- =============================================================================


-- =============================================================================
-- 1. A REGRA, NUM LUGAR SO
--
-- "Este intervalo cabe inteiro na jornada deste profissional?"
--
-- ATENCAO: ela espelha `motivoForaDaJornada()`, em `src/lib/agenda.ts`. Sao as
-- duas unicas implementacoes que sobraram -- uma para o servidor decidir,
-- outra para a tela avisar antes do clique. MUDOU UMA, MUDE A OUTRA.
--
-- O DEFEITO QUE ISTO CONSERTA -- a consulta que vira o dia:
-- as tres copias comparavam o FIM como hora do dia:
--
--     ((p_data_hora + make_interval(mins => v_dur)) at time zone v_fuso)::time
--       <= h.hora_fim
--
-- Numa jornada das 08:00 as 18:00, uma consulta as 23:30 com 60 minutos
-- termina as 00:30 -- do dia seguinte. Mas `::time` joga fora a data e devolve
-- `00:30`, que E menor que `18:00`. E o comeco, `23:30 >= 08:00`, tambem
-- passa. Resultado: a funcao ACEITAVA. Conferido no banco em 03/09/2026, com
-- a jornada real da clinica:
--
--     select ok, motivo from agenda_marcar(..., '2026-09-10 23:30-03', ...);
--     -- ok = true   <- e a quinta fecha as 18:00
--
-- A conta aqui e em SEGUNDOS DESDE A MEIA-NOITE, somados -- nunca
-- reconvertidos para hora do dia. `84600 + 3600 = 88200` nao e menor que
-- `64800`, e a consulta e recusada. E a mesma conta que o TypeScript faz em
-- minutos.
-- =============================================================================

create or replace function public.dentro_da_jornada(
  p_profissional uuid,
  p_inicio       timestamptz,
  p_duracao      integer
)
returns boolean
language sql
stable
as $$
  with cfg as (
    select coalesce(max(fuso_horario), 'America/Sao_Paulo') as fuso
      from public.configuracoes_clinica
  ),
  -- O fuso da clinica decide QUE DIA e este instante, e que horas sao nele. A
  -- jornada e `time` sem fuso e a consulta e `timestamptz`: sem esta conversao,
  -- a sessao do PostgREST (que roda em UTC) jogaria a manha inteira da clinica
  -- para fora do expediente.
  quando as (
    select (p_inicio at time zone c.fuso) as local from cfg c
  )
  select exists (
    select 1
      from public.profissional_horarios h
     cross join quando q
     where h.profissional_id = p_profissional
       and h.ativo
       and h.dia_semana = extract(dow from q.local)::smallint
       and extract(epoch from q.local::time) >= extract(epoch from h.hora_inicio)
       and extract(epoch from q.local::time) + (p_duracao * 60)
             <= extract(epoch from h.hora_fim)
  );
$$;

-- Profissional sem linha para aquele dia, ou com a linha desativada, devolve
-- `false` -- que e o certo: "nao atende aos domingos" e exatamente a ausencia
-- de uma jornada ativa de domingo, e e assim que a clinica desliga um dia na
-- tela de Profissionais.


-- =============================================================================
-- 2. QUEM ESTA LIVRE -- passa a usar a regra acima
--
-- Reescrita da 0004, secao 3. So o bloco da jornada mudou: o `join` com
-- `profissional_horarios` e as tres comparacoes viraram uma chamada. O `join`
-- saiu junto, e com ele a chance de um profissional aparecer duas vezes.
-- =============================================================================

create or replace function public.agenda_profissionais_livres(
  p_inicio  timestamptz,
  p_duracao integer default 60
)
returns table (profissional_id uuid, nome text)
language sql
stable
as $$
  with janela as (
    select p_inicio as ini, p_inicio + make_interval(mins => p_duracao) as fim
  )
  select p.id, trim(p.nome || ' ' || p.sobrenome)
    from public.profissionais p
   cross join janela j
   where p.ativo
     and public.dentro_da_jornada(p.id, j.ini, p_duracao)
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
-- 3. MARCAR -- mesmo tratamento
--
-- ATENCAO: a funcao vem INTEIRA porque `create or replace` exige o corpo todo,
-- e o texto abaixo foi gerado a partir do `pg_get_functiondef()` do banco --
-- igual ao que a 0021 fez. So as seis linhas do bloco de jornada mudaram, e
-- viraram uma. Reescrever as outras 190 a mao seria copiar e torcer.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.agenda_marcar(p_nome text, p_whatsapp text, p_procedimento text, p_data_hora timestamp with time zone, p_profissional_id uuid DEFAULT NULL::uuid, p_duracao integer DEFAULT NULL::integer, p_chave_externa text DEFAULT NULL::text, p_interesse text DEFAULT NULL::text)
 RETURNS TABLE(ok boolean, motivo text, consulta_id uuid, data_hora timestamp with time zone, profissional text, sugestao text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_whats  text;
  v_lead   uuid;
  v_prof   uuid;
  v_nome   text;
  v_id     uuid;
  v_fuso   text;
  v_dia    date;
  v_serv   record;
  v_porta  text;
  v_dur    integer;
begin
  -- IDEMPOTÊNCIA: mesma chave, mesma consulta. Retry do n8n não duplica.
  if p_chave_externa is not null then
    select c.id, c.data_consulta, trim(coalesce(pr.nome,'') || ' ' || coalesce(pr.sobrenome,''))
      into v_id, data_hora, v_nome
      from public.consultas c
      left join public.profissionais pr on pr.id = c.profissional_id
     where c.chave_externa = p_chave_externa;
    if v_id is not null then
      return query select true, null::text, v_id, data_hora, nullif(v_nome,''), null::text;
      return;
    end if;
  end if;

  v_whats := regexp_replace(coalesce(p_whatsapp, ''), '[^0-9]', '', 'g');
  if length(v_whats) < 10 then
    return query select false, 'whatsapp_invalido', null::uuid, null::timestamptz, null::text, null::text;
    return;
  end if;

  if p_data_hora is null or p_procedimento is null or trim(p_procedimento) = '' then
    return query select false, 'dados_invalidos', null::uuid, null::timestamptz, null::text, null::text;
    return;
  end if;

  -- A PORTA DE ENTRADA. Casa por nome, sem diferenciar maiúscula nem espaço
  -- sobrando: o que chega aqui foi escrito por um modelo de linguagem.
  select s.nome, s.exige_avaliacao, s.duracao_minutos, s.e_avaliacao
    into v_serv
    from public.servicos_clinica s
   where lower(trim(s.nome)) = lower(trim(p_procedimento))
     and s.ativo
   limit 1;

  -- PROCEDIMENTO QUE NÃO EXISTE É RECUSA, NÃO É PADRÃO.
  --
  -- Antes, `not found` seguia adiante com 60 minutos e SEM conferir a
  -- avaliação. Marcar "Lente de Contato" no singular passava por fora da porta
  -- de entrada, calado — a trava existia e escapava pela grafia.
  --
  -- A trigger `consultas_procedimento_valido` já barraria isso, mas com uma
  -- exceção `23514`: para quem chama pela ferramenta, exceção vira "não
  -- consegui acessar a agenda", que manda procurar defeito no lugar errado.
  -- Recusa de negócio tem que voltar como recusa, com motivo.
  if not found then
    return query select false, 'procedimento_desconhecido', null::uuid,
                        null::timestamptz, null::text, null::text;
    return;
  end if;

  -- E o nome vai gravado como está no catálogo, não como veio escrito.
  p_procedimento := v_serv.nome;

  if v_serv.exige_avaliacao then
    select a.nome into v_porta
      from public.servicos_clinica a
     where a.e_avaliacao and a.ativo
     limit 1;
    -- Sem porta cadastrada não há para onde mandar, e recusar deixaria o
    -- paciente sem saída. Marca como antes.
    if v_porta is not null then
      return query select false, 'exige_avaliacao', null::uuid, null::timestamptz, null::text, v_porta;
      return;
    end if;
  end if;

  v_dur := coalesce(p_duracao, v_serv.duracao_minutos, 60);

  select coalesce(max(fuso_horario), 'America/Sao_Paulo') into v_fuso
    from public.configuracoes_clinica;
  v_dia := (p_data_hora at time zone v_fuso)::date;

  -- Escolha do profissional
  if p_profissional_id is null then
    select l.profissional_id, l.nome into v_prof, v_nome
      from public.agenda_profissionais_livres(p_data_hora, v_dur) l
     limit 1;
    if v_prof is null then
      return query select false, 'sem_profissional_livre', null::uuid, null::timestamptz, null::text, null::text;
      return;
    end if;
  else
    if not exists (select 1 from public.profissionais where id = p_profissional_id and ativo) then
      return query select false, 'profissional_inexistente', null::uuid, null::timestamptz, null::text, null::text;
      return;
    end if;
    -- Motivo preciso: o agente precisa saber SE é horário ocupado (oferece
    -- outro) ou fora de expediente (oferece outro dia). "Não deu" não serve.
    if not public.dentro_da_jornada(p_profissional_id, p_data_hora, v_dur) then
      return query select false, 'fora_expediente', null::uuid, null::timestamptz, null::text, null::text;
      return;
    end if;
    if exists (
      select 1 from public.profissional_bloqueios b
       where (b.profissional_id is null or b.profissional_id = p_profissional_id)
         and tstzrange(b.inicio, b.fim)
             && tstzrange(p_data_hora, p_data_hora + make_interval(mins => v_dur))
    ) then
      return query select false, 'fora_expediente', null::uuid, null::timestamptz, null::text, null::text;
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
  else
    -- O NOME, QUANDO A FICHA AINDA NÃO TEM UM.
    --
    -- Antes disto, `p_nome` só era usado na CRIAÇÃO do lead. Quem já vinha
    -- conversando há meia hora -- que é o caso normal, porque a conversa cria
    -- a ficha na primeira mensagem -- tinha o nome perguntado, confirmado e
    -- jogado fora: a linha já existia, e o insert nunca rodava.
    --
    -- E este é o nome mais confiável que o sistema chega a ver. Não é o
    -- `pushName` do WhatsApp (o apelido do perfil, que por isso é ignorado);
    -- é o nome completo que a pessoa ditou para ser registrado numa consulta.
    --
    -- ⚠️ **Só preenche o que está vazio.** Um nome já gravado pode ter sido
    -- digitado pela recepção, e a recepção fala com a pessoa na cadeira. O
    -- agente não sobrescreve isso.
    update public.crm_clinica_dados
       set nome_lead = nullif(trim(coalesce(p_nome, '')), '')
     where id = v_lead
       and nullif(trim(coalesce(nome_lead, '')), '') is null
       and nullif(trim(coalesce(p_nome, '')), '') is not null;
  end if;

  -- O INTERESSE, QUANDO NINGUÉM MANDOU. Só vale para a avaliação: é a única
  -- consulta em que "o que a pessoa quer" é diferente do que está marcado. Numa
  -- limpeza, o procedimento JÁ é o que ela quer, e copiar a ficha para cá
  -- encheria a agenda de "Limpeza · Lentes de Contato".
  --
  -- Vem de `procedimento_interesse`, que a Letícia mantém pela `atualizar_ficha`.
  -- É palpite? Não: é o que ela registrou desta pessoa, e no ato de marcar é o
  -- valor corrente. O que ela mandar explícito continua ganhando.
  if nullif(trim(coalesce(p_interesse, '')), '') is null
     and coalesce(v_serv.e_avaliacao, false) then
    select nullif(trim(coalesce(d.procedimentos_interesse[1], '')), '')
      into p_interesse
      from public.crm_clinica_dados d
     where d.id = v_lead;
  end if;

  begin
    insert into public.consultas (
      lead_id, profissional_id, procedimento, data_consulta,
      duracao_minutos, status, origem, chave_externa, interesse
    ) values (
      v_lead, v_prof, trim(p_procedimento), p_data_hora,
      v_dur, 'agendada', 'agente_ia', p_chave_externa,
      nullif(trim(coalesce(p_interesse, '')), '')
    ) returning id into v_id;
  exception
    -- 23P01: a restrição de exclusão pegou uma sobreposição criada entre a
    -- checagem acima e este insert. É o caso da recepção marcando no mesmo
    -- instante — raro, e exatamente por isso o banco é quem decide.
    when exclusion_violation then
      return query select false, 'horario_ocupado', null::uuid, null::timestamptz, null::text, null::text;
      return;
  end;

  return query select true, null::text, v_id, p_data_hora, v_nome, null::text;
end;
$function$;


-- =============================================================================
-- 4. REMARCAR -- mesmo tratamento, mesma origem (`pg_get_functiondef()`)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.agenda_remarcar(p_consulta_id uuid, p_nova_data_hora timestamp with time zone, p_profissional_id uuid DEFAULT NULL::uuid, p_whatsapp text DEFAULT NULL::text)
 RETURNS TABLE(ok boolean, motivo text, data_hora timestamp with time zone, profissional text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    if not public.dentro_da_jornada(v_prof, p_nova_data_hora, v_dur) then
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
$function$;


-- =============================================================================
-- 5. A TRAVA -- o trigger
--
-- DECISOES, e nenhuma e detalhe:
--
-- - SO `status = 'agendada'`. Uma consulta `realizada` ou `faltou` e REGISTRO
--   DE HISTORICO, nao agendamento: um paciente antigo pode ter sido atendido
--   num sabado que a clinica nao abre mais, e barrar isso tornaria o passado
--   impossivel de lancar -- que e justamente o uso do modal "Nova Consulta" da
--   ficha. Dar baixa (`agendada` -> `realizada`) tambem nao esbarra aqui.
--
-- - SO com profissional. Consulta sem `profissional_id` cai na faixa "Sem
--   profissional definido" da Agenda, e nao ha jornada nenhuma a conferir.
--
-- - `update of` com quatro colunas, e nao `update` seco. Assim, mexer nas
--   OBSERVACOES de uma consulta antiga que ja esta fora da jornada continua
--   funcionando. Sem isso, uma linha herdada viraria uma linha que ninguem
--   consegue mais editar.
--
-- - O BLOQUEIO (ferias, feriado) NAO entra aqui. Ele impede a agenda de
--   OFERECER o horario, mas a equipe pode encaixar por cima conscientemente --
--   a decisao esta na 0002, secao 4, e emergencia odontologica em feriado
--   existe. A jornada e a regra permanente; o bloqueio e a excecao que a
--   propria equipe criou.
--
-- - SQLSTATE PROPRIO (`JOR01`). Reaproveitar `23514` (check_violation) seria
--   colidir com a trigger de procedimento: a ficha do lead ja traduz aquele
--   codigo como "esse procedimento nao esta mais no catalogo", e a recusa da
--   jornada apareceria com a frase de outro erro. Cinco caracteres
--   alfanumericos sao um codigo de usuario valido, e nao colidem com nada do
--   Postgres.
-- =============================================================================

create or replace function public.consultas_confere_jornada()
returns trigger
language plpgsql
as $$
declare
  v_nome text;
begin
  if new.status <> 'agendada' or new.profissional_id is null then
    return new;
  end if;

  if public.dentro_da_jornada(new.profissional_id, new.data_consulta, new.duracao_minutos) then
    return new;
  end if;

  select trim(nome || ' ' || sobrenome) into v_nome
    from public.profissionais where id = new.profissional_id;

  -- A frase sai daqui PRONTA PARA A TELA: as tres telas que criam consulta
  -- mostram o `message` deste erro como ele vem. Por isso ela e escrita em
  -- portugues de verdade, com acento -- quem le e a recepcao, nao um log.
  raise exception '% não atende neste dia e horário.',
        coalesce(nullif(v_nome, ''), 'Esse profissional')
    using errcode = 'JOR01',
          hint = 'Escolha outro horário, outra agenda, ou ajuste a jornada em Profissionais.';
end;
$$;

-- BEFORE, como a `consultas_data_fim`: recusar antes de escrever. A ordem
-- entre as duas nao importa -- esta calcula o fim a partir de `data_consulta`
-- e `duracao_minutos`, e nao le `data_fim`.
drop trigger if exists consultas_jornada on public.consultas;
create trigger consultas_jornada
  before insert or update of data_consulta, duracao_minutos, profissional_id, status
  on public.consultas
  for each row execute function public.consultas_confere_jornada();


-- =============================================================================
-- 6. VERIFICACAO
-- =============================================================================

-- A regra recusa domingo e aceita segunda? (esperado: f, depois t)
-- select public.dentro_da_jornada('<uuid>', timestamptz '2026-09-06 10:00-03', 60);
-- select public.dentro_da_jornada('<uuid>', timestamptz '2026-09-07 10:00-03', 60);

-- O defeito da meia-noite morreu? (esperado: ok = false, fora_expediente)
-- select ok, motivo from public.agenda_marcar(
--   p_nome=>'T', p_whatsapp=>'5511999990000', p_procedimento=>'<do catalogo>',
--   p_data_hora=>timestamptz '2026-09-10 23:30-03', p_profissional_id=>'<uuid>');

-- O trigger existe? (esperado: 1 linha)
-- select tgname from pg_trigger
--  where tgrelid = 'public.consultas'::regclass and tgname = 'consultas_jornada';

-- O insert direto em domingo e recusado? (esperado: erro JOR01)
-- insert into public.consultas (lead_id, profissional_id, procedimento,
--        data_consulta, duracao_minutos, status)
-- select (select id from public.crm_clinica_dados limit 1), '<uuid>',
--        '<do catalogo>', timestamptz '2026-09-06 10:00-03', 60, 'agendada';

-- Consultas JA marcadas fora da jornada -- o trigger nao valida o passado.
-- Em 03/09/2026 havia uma so, criada pela aba antiga do navegador:
-- select c.id, c.data_consulta, c.procedimento
--   from public.consultas c
--  where c.status = 'agendada' and c.profissional_id is not null
--    and not public.dentro_da_jornada(c.profissional_id, c.data_consulta,
--                                     c.duracao_minutos);
