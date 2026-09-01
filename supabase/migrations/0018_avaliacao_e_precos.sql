-- =============================================================================
-- 0018 — A AVALIAÇÃO COMO PORTA, E O PREÇO QUE PODE SER DITO
-- Rode depois de 0017.
--
-- Duas decisões da clínica, tomadas em 01/09/2026, que mudam como o agente
-- agenda e como ele responde "quanto custa".
--
-- ── 1. UMA PORTA DE ENTRADA ─────────────────────────────────────────────────
--
-- Quase todo tratamento precisa que o dentista olhe a boca antes: diagnóstico,
-- exame, plano. O paciente que chega dizendo "quero lentes" não deve sair com
-- "Lentes de Contato" marcado — deve sair com a AVALIAÇÃO marcada, e com
-- "Lentes de Contato" registrado como o que ele procura.
--
-- Duas exceções, que a clínica agenda direto: Limpeza e Profilaxia e
-- Clareamento Dental.
--
-- Por que uma coluna e não uma regra no prompt: prompt é pedido, não trava. A
-- Letícia já ignorou regra escrita com o dado na frente dela (o caso de 01/09,
-- na seção 8 do agente-ia/README.md). A recusa mora em `agenda_marcar`, por
-- onde passam as DUAS portas dos agentes — a Letícia por RPC e a API externa
-- pelos endpoints.
--
-- ⚠️ A RECEPÇÃO NÃO É AFETADA. `NovoAgendamentoModal.tsx` grava direto em
-- `consultas`, sem passar por esta função. É de propósito: a regra existe para
-- impedir um AGENTE de tomar decisão clínica, não para impedir a clínica de
-- marcar o que ela quiser.
--
-- ── 2. O PREÇO ──────────────────────────────────────────────────────────────
--
-- Até aqui o prompt proibia falar valor, sem exceção. Agora existe exceção, e
-- ela é dado, não texto: `preco_a_partir_de`, com TRÊS estados e não dois.
--
--     null  →  ela não fala valor. "Isso a gente vê na avaliação"
--     0     →  "é gratuita"  ← a avaliação de hoje
--     > 0   →  "a partir de R$ X"
--
-- ⚠️ ZERO NÃO É VAZIO AQUI. Zero é a informação mais valiosa que ela tem: a
-- objeção "não vou pagar só pra saber o preço" morre com "a avaliação é
-- gratuita". Tratar zero como ausente joga isso fora — e tratá-lo como preço
-- faria ela dizer "a partir de R$ 0,00".
--
-- ⚠️ O NOME DA COLUNA É O CONTRATO. É `preco_a_partir_de`, não `preco`, porque
-- é assim que ela fala: sempre "a partir de". Chamada de `preco`, um dia
-- alguém preenche achando que é valor fechado — e ela diz "a partir de" em
-- cima de um número que era exato.
-- =============================================================================


-- =============================================================================
-- 1. AS COLUNAS NOVAS DE `servicos_clinica`
-- =============================================================================

alter table public.servicos_clinica
  add column if not exists exige_avaliacao   boolean not null default true,
  add column if not exists preco_a_partir_de numeric(10,2),
  add column if not exists duracao_minutos   integer not null default 60,
  add column if not exists e_avaliacao       boolean not null default false;

comment on column public.servicos_clinica.exige_avaliacao is
  'Marcado: o agente NAO agenda este procedimento -- agenda a avaliacao e '
  'guarda este nome em consultas.interesse. Desmarcado: agenda direto. '
  'Quem confere e agenda_marcar, nao o prompt.';

comment on column public.servicos_clinica.preco_a_partir_de is
  'Piso do valor, em reais. null = o agente nao fala preco. 0 = "gratuita". '
  '> 0 = "a partir de R$ X". Ignorado quando exige_avaliacao -- por isso o '
  'campo some do card na tela.';

comment on column public.servicos_clinica.duracao_minutos is
  'Quanto tempo o bloco ocupa na agenda. E o que agenda_marcar usa quando '
  'ninguem manda duracao.';

comment on column public.servicos_clinica.e_avaliacao is
  'A porta de entrada. Exatamente UM procedimento pode ter isto -- e ele que '
  'o agente marca no lugar dos que exigem avaliacao.';

-- Uma porta só. Índice parcial: só as linhas marcadas disputam a unicidade,
-- então as outras continuam livres com `false`.
create unique index if not exists servicos_clinica_avaliacao_unica
  on public.servicos_clinica (e_avaliacao) where e_avaliacao;


-- =============================================================================
-- 2. O QUE O PACIENTE QUERIA, NA PRÓPRIA CONSULTA
--
-- POR QUE NÃO BASTA `crm_clinica.procedimento_interesse`: aquele campo é da
-- PESSOA e guarda um valor só. Quem veio por lentes em março e por canal em
-- agosto tem os dois na mesma linha — o último. Olhar a consulta de março
-- mostraria "canal", que é falso.
--
-- Aqui o valor é congelado no ato de marcar. É o que permite perguntar
-- "quantas avaliações de lentes viraram lentes", que hoje é impossível.
-- =============================================================================

alter table public.consultas
  add column if not exists interesse text;

comment on column public.consultas.interesse is
  'O que o paciente procura, quando a consulta e a avaliacao. Vira '
  '"Avaliacao Odontologica . Lentes de Contato" no bloco da Agenda. '
  'Congelado no ato de marcar -- diferente de procedimento_interesse do CRM, '
  'que e da pessoa e guarda so o ultimo.';


-- =============================================================================
-- 3. REAIS EM PORTUGUÊS
--
-- `to_char` com G e D depende do lc_numeric do servidor, que ninguém controla
-- aqui. Com '.' literal no formato o resultado é sempre o mesmo, e a troca
-- para vírgula acontece depois, à mão.
-- =============================================================================

create or replace function public.reais(v numeric)
returns text
language sql
immutable
as $fn$
  select 'R$ '
      || regexp_replace(to_char(trunc(v), 'FM999999999'), '(\d)(?=(\d{3})+$)', '\1.', 'g')
      || ','
      || to_char(round((v - trunc(v)) * 100), 'FM00');
$fn$;

comment on function public.reais(numeric) is
  'Valor em reais, no formato brasileiro: 1500.5 vira "R$ 1.500,50". '
  'Independente de locale, de proposito.';


-- =============================================================================
-- 4. A AVALIAÇÃO ODONTOLÓGICA
--
-- Ela SUBSTITUI a "Avaliação e Planejamento Digital do Sorriso", que era
-- estética e por isso não servia de porta para quem tem doença de gengiva ou
-- precisa de enxerto ósseo. Renomeando em vez de apagar e recriar, ela guarda
-- o `created_at` e continua sendo a primeira da lista.
-- =============================================================================

update public.servicos_clinica set
  nome              = 'Avaliação Odontológica',
  descricao         = 'Primeira consulta: o dentista examina, conversa sobre o que você quer e monta o plano de tratamento',
  ativo             = true,
  e_avaliacao       = true,
  exige_avaliacao   = false,
  preco_a_partir_de = 0,
  duracao_minutos   = 30
where nome = 'Avaliação e Planejamento Digital do Sorriso';

-- Alguém pode ter renomeado ou apagado a original antes desta migração. Sem
-- porta, o agente não consegue marcar nada que exija avaliação.
insert into public.servicos_clinica
  (nome, descricao, ativo, e_avaliacao, exige_avaliacao, preco_a_partir_de, duracao_minutos, created_at)
select
  'Avaliação Odontológica',
  'Primeira consulta: o dentista examina, conversa sobre o que você quer e monta o plano de tratamento',
  true, true, false, 0, 30,
  coalesce((select min(created_at) from public.servicos_clinica) - interval '1 second', now())
where not exists (select 1 from public.servicos_clinica where e_avaliacao);


-- =============================================================================
-- 5. QUEM PASSA PELA AVALIAÇÃO E QUEM NÃO PASSA
--
-- O default da coluna já é `true`, então os tratamentos já nascem exigindo.
-- Aqui ficam só as duas exceções.
--
-- ⚠️ O PREÇO DELAS FICA VAZIO. Ninguém aqui sabe quanto a clínica cobra, e
-- chutar um piso é pior que não falar: "a partir de R$ 200" ancora a conversa
-- na cadeira. Enquanto estiver vazio, a Letícia agenda direto e não fala valor.
-- Quem preenche é a clínica, na tela de Procedimentos.
-- =============================================================================

update public.servicos_clinica
   set exige_avaliacao = false
 where nome in ('Limpeza e Profilaxia', 'Clareamento Dental');


-- =============================================================================
-- 6. A VIEW DO AGENTE, AGORA COM O FLUXO E O VALOR
--
-- Mesma regra de sempre: frase pronta, uma por linha, nada de id. O agente
-- precisa saber ANTES de oferecer que lentes passam pela avaliação — se
-- descobrisse só na recusa, ofereceria horário e teria que voltar atrás na
-- frente do paciente.
--
-- A ordem do `case` é a regra de negócio: exigir avaliação vence o preço. É o
-- que garante que um preço preenchido por engano num procedimento que exige
-- avaliação nunca seja falado.
-- =============================================================================

create or replace view public.procedimentos_clinica_agente
with (security_invoker = true) as
select
  s.nome
  || coalesce(': ' || nullif(trim(s.descricao), ''), '')
  || case
       when s.exige_avaliacao then
         '. Antes deste, marque ' || coalesce(
           (select a.nome from public.servicos_clinica a where a.e_avaliacao and a.ativo limit 1),
           'a avaliação') || '.'
       when s.preco_a_partir_de = 0 then '. Gratuita.'
       when s.preco_a_partir_de > 0 then '. A partir de ' || public.reais(s.preco_a_partir_de) || '.'
       else ''
     end as procedimento
from public.servicos_clinica s
where s.ativo
order by s.created_at;

comment on view public.procedimentos_clinica_agente is
  'Procedimentos ativos em frases prontas, um por linha, para o prompt do '
  'Agente de IA. Traz o fluxo (passa pela avaliacao?) e o valor, quando ha. '
  'Calculada na leitura a partir de servicos_clinica.';


-- =============================================================================
-- 7. `agenda_marcar` PASSA A CONHECER A PORTA
--
-- Três mudanças, e a primeira é a que importa:
--
--   1. RECUSA o procedimento que exige avaliação, devolvendo em `sugestao` o
--      nome da porta. Vale para a Letícia (RPC) e para a API externa (os sete
--      endpoints) — as duas descem para esta função, e é isso que impede as
--      duas de divergirem.
--
--   2. `p_interesse` grava o que a pessoa procura na própria consulta.
--
--   3. `p_duracao` virou opcional. Nulo, sai de `servicos_clinica`: a avaliação
--      ocupa 30 minutos e não 60. Quem manda duração explícita continua mandando.
--
-- ⚠️ PRECISA DE `drop` ANTES. Acrescentar parâmetro e coluna de retorno cria
-- uma SOBRECARGA, não substitui — e com duas versões no catálogo o PostgREST
-- responde "function is not unique" e derruba as duas portas de uma vez.
--
-- ⚠️ PROCEDIMENTO FORA DO CATÁLOGO CONTINUA PASSANDO. `consultas.procedimento`
-- é texto livre e a API externa marca coisas que não estão em
-- `servicos_clinica`. Nome que não casa = nenhuma regra a aplicar, e a consulta
-- é marcada como antes. Trancar isso aqui quebraria integração que já existe.
-- =============================================================================

drop function if exists public.agenda_marcar(text, text, text, timestamptz, uuid, integer, text);

create or replace function public.agenda_marcar(
  p_nome            text,
  p_whatsapp        text,
  p_procedimento    text,
  p_data_hora       timestamptz,
  p_profissional_id uuid    default null,
  p_duracao         integer default null,
  p_chave_externa   text    default null,
  p_interesse       text    default null
)
returns table (
  ok               boolean,
  motivo           text,
  consulta_id      uuid,
  data_hora        timestamptz,
  profissional     text,
  sugestao         text
)
language plpgsql
security definer
set search_path = public
as $fn$
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
  select s.exige_avaliacao, s.duracao_minutos, s.e_avaliacao
    into v_serv
    from public.servicos_clinica s
   where lower(trim(s.nome)) = lower(trim(p_procedimento))
     and s.ativo
   limit 1;

  if found and v_serv.exige_avaliacao then
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
    if not exists (
      select 1 from public.profissional_horarios h
       where h.profissional_id = p_profissional_id and h.ativo
         and h.dia_semana = extract(dow from (p_data_hora at time zone v_fuso))::smallint
         and (p_data_hora at time zone v_fuso)::time >= h.hora_inicio
         and ((p_data_hora + make_interval(mins => v_dur)) at time zone v_fuso)::time <= h.hora_fim
    ) then
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
    select nullif(trim(coalesce(d.procedimento_interesse, '')), '')
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
$fn$;

comment on function public.agenda_marcar is
  'Marca consulta pelos agentes (Leticia por RPC, API externa pelos '
  'endpoints). Recusa procedimento que exige avaliacao, devolvendo o nome da '
  'porta em `sugestao`. A recepcao nao passa por aqui -- grava direto.';
