-- =============================================================================
-- 0024 — O Dashboard para de trazer pessoas e passa a fazer perguntas
-- =============================================================================
--
-- ── O QUE ESTAVA ERRADO ──────────────────────────────────────────────────────
--
-- `Dashboard.tsx` pedia `select * from crm_clinica` — todas as pessoas, sem
-- limite — e fazia TODAS as contas no navegador.
--
-- O PostgREST deste projeto tem `max_rows = 1000`. A partir do lead 1001 ele
-- devolve mil linhas e **não avisa**: sem erro, sem cabeçalho de aviso, nada.
-- As contas do Dashboard não ficariam incompletas; ficariam **erradas**.
-- "Novos contatos: 1000" com 1240 no banco, e a taxa de conversão calculada em
-- cima disso.
--
-- Erro de contagem não grita. Ele fica na tela parecendo certo.
--
-- ── A SAÍDA ──────────────────────────────────────────────────────────────────
--
-- Uma função por pergunta. Nenhuma delas devolve pessoas: devolvem números
-- **já contados**, dezenas de linhas no máximo, independente de a clínica ter
-- cem ou cem mil leads. Contagem não tem teto — o corte de `max_rows` é para
-- linhas.
--
--   dashboard_numeros        os três KPIs do topo
--   dashboard_por_dia        o gráfico de linha, um ponto por dia
--   dashboard_dia_semana     as 7 barras
--   dashboard_profissionais  NOVO — consultas por dentista
--   dashboard_procedimentos  NOVO — procurado x realizado
--
-- ── ⚠️ O FUSO É O DETALHE QUE DECIDE TUDO ───────────────────────────────────
--
-- Agrupar "por dia" exige saber onde o dia começa. O navegador usava o relógio
-- dele; o Postgres, numa sessão do PostgREST, roda em **UTC**. Um lead criado
-- às 23h de São Paulo é 02h do dia seguinte em UTC — e cairia no dia errado do
-- gráfico, sistematicamente, para todo mundo que escreve à noite.
--
-- Por isso todo agrupamento passa por `at time zone` com o
-- `configuracoes_clinica.fuso_horario`. É o mesmo campo que a `agenda_marcar`
-- usa, e é para isso que ele existe.
--
-- **As bordas do período NÃO precisam disso**: elas chegam como instante
-- absoluto (`timestamptz`), e comparar instantes independe de fuso. Só o
-- BALDE — de que dia é esta linha — precisa do fuso.
--
-- ⚠️ Consequência: se o `fuso_horario` da clínica discordar do relógio do
-- computador da recepção, os baldes do gráfico saem deslocados em relação às
-- bordas escolhidas na tela. A conferência é a mesma da aba Horários: o campo
-- tem que bater com o relógio de quem usa.
--
-- ── SEGURANÇA ────────────────────────────────────────────────────────────────
--
-- Nenhuma é `security definer`. Elas rodam com as permissões de quem chamou, e
-- as políticas de RLS já liberam leitura para `authenticated` — que é quem
-- abre o Dashboard. Elevar privilégio aqui só ampliaria o estrago de uma
-- chamada indevida, sem ganho nenhum.
-- =============================================================================


-- =============================================================================
-- 1. ÍNDICE QUE FALTAVA
--
-- `inicio_atendimento` já tinha o seu (`crm_clinica_inicio_idx`, migração
-- 0001). `data_marcacao_agendamento` não tinha, e passou a ser consultada em
-- toda abertura do Dashboard — é metade do gráfico de linha e um dos três KPIs.
-- =============================================================================

create index if not exists crm_clinica_marcacao_idx
  on public.crm_clinica_dados (data_marcacao_agendamento);


-- =============================================================================
-- 2. O FUSO DA CLÍNICA, NUM LUGAR SÓ
--
-- Cinco funções precisam dele. Repetir o `select ... limit 1` em cada uma seria
-- cinco cópias da mesma regra — e uma delas envelheceria calada no dia em que
-- a tabela ganhasse mais de uma linha ou o padrão mudasse.
--
-- O padrão existe porque instalação nova tem a tabela vazia por alguns minutos,
-- e um Dashboard que quebra nesse intervalo é pior que um Dashboard que assume
-- o fuso de São Paulo.
-- =============================================================================

create or replace function public.fuso_da_clinica()
returns text
language sql
stable
as $$
  select coalesce(
    (select nullif(trim(c.fuso_horario), '') from public.configuracoes_clinica c limit 1),
    'America/Sao_Paulo'
  )
$$;

comment on function public.fuso_da_clinica() is
  'O fuso configurado da clínica, com America/Sao_Paulo como padrão. '
  'Usado pelas funções do Dashboard para agrupar por dia e por dia da semana.';


-- =============================================================================
-- 3. OS TRÊS NÚMEROS DO TOPO
--
-- Duas subconsultas em vez de um `count(*) filter` sobre a tabela inteira: com
-- filtro, cada uma usa o seu índice e lê só a faixa. Com `filter`, o Postgres
-- varreria a tabela toda para responder as duas.
--
-- A taxa de conversão NÃO é calculada aqui, de propósito: é divisão de dois
-- números que já estão na resposta, e devolvê-la seria uma terceira versão da
-- mesma verdade — pronta para divergir quando alguém mudar o arredondamento.
-- =============================================================================

create or replace function public.dashboard_numeros(
  p_inicio timestamptz,
  p_fim    timestamptz
)
returns table (novos_contatos bigint, consultas_agendadas bigint)
language sql
stable
as $$
  select
    (select count(*) from public.crm_clinica_dados d
      where d.inicio_atendimento between p_inicio and p_fim),
    (select count(*) from public.crm_clinica_dados d
      where d.data_marcacao_agendamento between p_inicio and p_fim)
$$;

comment on function public.dashboard_numeros(timestamptz, timestamptz) is
  'Novos contatos e consultas marcadas no período. A taxa de conversão sai da '
  'divisão dos dois, na tela.';


-- =============================================================================
-- 4. O GRÁFICO DE LINHA — UM PONTO POR DIA
--
-- Três decisões:
--
-- 1. **Os dias vêm de `generate_series`, e não dos dados.** Dia sem nenhum
--    contato tem que aparecer como zero: um buraco no meio do gráfico é
--    informação, e pular o dia faria a linha mentir sobre a inclinação.
--
-- 2. **Duas agregações e um `left join`, e não subconsulta por dia.** Correlata,
--    seriam trinta varreduras da tabela para desenhar trinta pontos. Assim são
--    duas, e o join acontece sobre algumas dezenas de linhas.
--
-- 3. **A série é limitada a 370 dias.** "Todo o período" começa na origem do
--    tempo: sem teto, seriam vinte mil pontos num gráfico de 260 pixels de
--    altura — e o navegador desenhando cada um. A tela compara o primeiro dia
--    devolvido com o que pediu e avisa quando houve corte; teto silencioso é
--    exatamente o defeito que esta migração existe para tirar do Dashboard.
-- =============================================================================

create or replace function public.dashboard_por_dia(
  p_inicio timestamptz,
  p_fim    timestamptz
)
returns table (dia date, atendimentos bigint, agendamentos bigint)
language plpgsql
stable
as $$
declare
  v_tz  text := public.fuso_da_clinica();
  v_fim date;
  v_ini date;
begin
  v_fim := (p_fim at time zone v_tz)::date;
  v_ini := greatest((p_inicio at time zone v_tz)::date, v_fim - 369);

  return query
  with dias as (
    select generate_series(v_ini, v_fim, interval '1 day')::date as dia
  ),
  atend as (
    select (d.inicio_atendimento at time zone v_tz)::date as dia, count(*) as n
      from public.crm_clinica_dados d
     where d.inicio_atendimento between p_inicio and p_fim
     group by 1
  ),
  agend as (
    select (d.data_marcacao_agendamento at time zone v_tz)::date as dia, count(*) as n
      from public.crm_clinica_dados d
     where d.data_marcacao_agendamento between p_inicio and p_fim
     group by 1
  )
  select s.dia,
         coalesce(a.n, 0)::bigint,
         coalesce(g.n, 0)::bigint
    from dias s
    left join atend a on a.dia = s.dia
    left join agend g on g.dia = s.dia
   order by s.dia;
end;
$$;

comment on function public.dashboard_por_dia(timestamptz, timestamptz) is
  'Um ponto por dia do período: contatos que chegaram e consultas marcadas. '
  'Dia sem movimento vem com zero. A série é limitada aos últimos 370 dias.';


-- =============================================================================
-- 5. AS 7 BARRAS — EM QUAL DIA DA SEMANA A CLÍNICA RECEBE MAIS
--
-- ⚠️ **ESTE GRÁFICO IGNORAVA O FILTRO DE PERÍODO.** A tela contava `leads`
-- inteiro, e não a faixa escolhida: trocar de "Este mês" para "Hoje" não mudava
-- uma barra, e nada dizia isso. O filtro estava dois centímetros acima.
--
-- `extract(dow)` devolve 0 = domingo, igual ao `getDay()` do JavaScript — o
-- vetor DAY_NAMES da tela continua valendo sem tradução.
--
-- Os 7 dias vêm de `generate_series` pelo mesmo motivo dos dias do gráfico de
-- linha: uma segunda-feira sem nenhum contato é uma barra zerada, não uma
-- barra ausente.
-- =============================================================================

create or replace function public.dashboard_dia_semana(
  p_inicio timestamptz,
  p_fim    timestamptz
)
returns table (dia_semana int, contatos bigint)
language plpgsql
stable
as $$
declare
  v_tz text := public.fuso_da_clinica();
begin
  return query
  with todos as (
    select generate_series(0, 6) as dia_semana
  ),
  cont as (
    select extract(dow from (d.inicio_atendimento at time zone v_tz))::int as dia_semana,
           count(*) as n
      from public.crm_clinica_dados d
     where d.inicio_atendimento between p_inicio and p_fim
     group by 1
  )
  select t.dia_semana, coalesce(c.n, 0)::bigint
    from todos t
    left join cont c on c.dia_semana = t.dia_semana
   order by t.dia_semana;
end;
$$;

comment on function public.dashboard_dia_semana(timestamptz, timestamptz) is
  'Contatos por dia da semana no período. 0 = domingo, como o getDay() do JS.';


-- =============================================================================
-- 6. CONSULTAS POR PROFISSIONAL  (gráfico novo)
--
-- ── O QUE CONTA, E O QUE NÃO ────────────────────────────────────────────────
--
-- Só `agendada` e `realizada`. Cancelada e falta ficam de fora: um dentista com
-- muitas faltas "lideraria" o ranking sem ter atendido ninguém — e o gráfico
-- responde "quem está atendendo mais", não "quem tem mais linhas na tabela".
--
-- ── QUAL DATA ───────────────────────────────────────────────────────────────
--
-- `data_consulta` — quando a consulta acontece. É a leitura natural de "quem
-- está tendo mais consultas neste mês", e é uma data DIFERENTE da que os
-- outros blocos usam (lá é quando o lead chegou). São duas leituras legítimas
-- de "setembro", e por isso cada bloco da tela diz qual está usando.
--
-- ── DUAS LINHAS QUE PARECEM SOBRAR, E NÃO SOBRAM ────────────────────────────
--
-- 1. **Profissional ativo com zero aparece.** "Ninguém marcou com a Dra. X
--    neste mês" é um achado, não um vazio. Sumir com a barra esconderia
--    justamente o caso que interessa.
--
-- 2. **"Sem profissional" aparece quando existe.** A agenda aceita consulta sem
--    dentista definido. Sem esta linha, a soma das barras não bateria com o
--    total de consultas e ninguém saberia por quê.
--
-- 3. **O INATIVO VOLTA NOS MESES EM QUE ELE ATENDEU** — `p.ativo or cont.n is
--    not null`. Este era um buraco de verdade, e ele engolia justamente a
--    promessa do item 2.
--
--    Desativar não é um caminho exótico: `consultas.profissional_id` é
--    `on delete restrict`, então um dentista que já atendeu **não pode ser
--    apagado** — a tela só oferece desligar. Com `where p.ativo` sozinho, as
--    consultas dele não entravam pelo primeiro ramo (barrado) nem pelo segundo
--    (o `profissional_id` não é nulo): **sumiam**. A dentista que saiu em julho
--    levava as 74 consultas de julho junto, e um relatório de julho passava a
--    mentir para sempre.
--
--    O rótulo ganha ` (inativo)` porque uma barra sem aviso pareceria alguém
--    da equipe de hoje.
--
-- ── E A COR NÃO É INVENTADA AQUI ────────────────────────────────────────────
--
-- A linha "Sem profissional" devolve `null` na cor, e não um hex. Quem é dono
-- desse conceito é [`src/lib/cores.ts`](../../src/lib/cores.ts), com
-- `COR_SEM_PROFISSIONAL` — e as três telas da agenda já resolvem por ele
-- (`profissional?.cor ?? COR_SEM_PROFISSIONAL.hex`). Um hex escrito no SQL
-- seria uma segunda paleta, num lugar onde ninguém procuraria ao trocar a
-- identidade visual.
-- =============================================================================

create or replace function public.dashboard_profissionais(
  p_inicio timestamptz,
  p_fim    timestamptz
)
returns table (profissional_id uuid, nome text, cor text, consultas bigint)
language sql
stable
as $$
  with cont as (
    select c.profissional_id, count(*) as n
      from public.consultas c
     where c.data_consulta between p_inicio and p_fim
       and c.status in ('agendada', 'realizada')
     group by 1
  )
  select p.id,
         trim(p.nome || ' ' || coalesce(p.sobrenome, ''))
           || case when p.ativo then '' else ' (inativo)' end,
         p.cor,
         coalesce(cont.n, 0)::bigint
    from public.profissionais p
    left join cont on cont.profissional_id = p.id
   where p.ativo or cont.n is not null

  union all

  select null::uuid, 'Sem profissional', null::text, cont.n
    from cont
   where cont.profissional_id is null

  order by 4 desc, 2
$$;

comment on function public.dashboard_profissionais(timestamptz, timestamptz) is
  'Consultas por dentista no período, pela data DA CONSULTA. Conta agendada e '
  'realizada; cancelada e falta ficam de fora. Profissional ativo sem consulta '
  'aparece zerado; o inativo volta nos períodos em que atendeu, marcado '
  '(inativo); e as consultas sem dentista viram uma linha de cor nula.';


-- =============================================================================
-- 7. PROCEDIMENTOS: PROCURADO x REALIZADO  (gráfico novo)
--
-- **A pergunta que não tinha resposta antes da 0022.** Enquanto o campo era
-- texto livre, "Lentes de Contato", "lentes" e "lente pro dente" eram três
-- tratamentos diferentes num relatório. Fechado o vocabulário, a soma passou a
-- significar alguma coisa — e este gráfico é o motivo daquela migração.
--
-- ── POR QUE DUAS BARRAS, E NÃO DUAS TELAS ───────────────────────────────────
--
-- Sozinho, "procurado" não diz nada acionável: cem pessoas querendo lentes é
-- ótimo ou terrível dependendo de quantas fizeram. **A distância entre as duas
-- barras é a informação** — "120 procuraram, 14 fizeram" é uma conversa sobre
-- preço, agenda ou argumento de venda que nenhum dos dois números sozinho
-- inicia.
--
-- ── AS DUAS DATAS SÃO DIFERENTES, E TÊM QUE SER ─────────────────────────────
--
--   procurado → `inicio_atendimento` do lead: quando a PESSOA chegou.
--               Mesmo campo do KPI "Novos Contatos", então os dois blocos
--               falam do mesmo conjunto de gente.
--   realizado → `data_consulta`: quando a consulta ACONTECEU.
--
-- Não são o mesmo recorte, e não deveriam ser: quem chegou em agosto pode ter
-- feito em setembro. Forçar a mesma data faria uma das duas barras responder a
-- pergunta errada.
--
-- ── `full outer join`, E NÃO `left` ─────────────────────────────────────────
--
-- Procedimento realizado por quem nunca declarou interesse (o dentista indicou
-- na avaliação) existe, e é o caso mais interessante do gráfico. Um `left join`
-- a partir de "procurado" apagaria essa linha.
-- =============================================================================

create or replace function public.dashboard_procedimentos(
  p_inicio timestamptz,
  p_fim    timestamptz
)
returns table (procedimento text, procurado bigint, realizado bigint)
language sql
stable
as $$
  with procurado as (
    select p as nome, count(*) as n
      from public.crm_clinica_dados d,
           unnest(d.procedimentos_interesse) as p
     where d.inicio_atendimento between p_inicio and p_fim
     group by 1
  ),
  realizado as (
    select c.procedimento as nome, count(*) as n
      from public.consultas c
     where c.status = 'realizada'
       and c.data_consulta between p_inicio and p_fim
     group by 1
  )
  select coalesce(pr.nome, re.nome),
         coalesce(pr.n, 0)::bigint,
         coalesce(re.n, 0)::bigint
    from procurado pr
    full outer join realizado re on re.nome = pr.nome
   -- ORDENA PELO MAIOR DOS DOIS, e não só por "procurado".
   --
   -- A tela corta no décimo. Ordenando só pela primeira barra, um procedimento
   -- com 40 realizados e 1 procurado — o que o dentista indica na avaliação, e
   -- que ninguém pede pelo nome — ficaria abaixo de nove itens com 2 interesses
   -- e nenhuma consulta, e sumiria do corte. É justamente a linha que o gráfico
   -- de duas barras existe para mostrar.
   order by greatest(coalesce(pr.n, 0), coalesce(re.n, 0)) desc,
            coalesce(pr.n, 0) desc, coalesce(re.n, 0) desc, 1
$$;

comment on function public.dashboard_procedimentos(timestamptz, timestamptz) is
  'Ranking de procedimentos: quantos declararam interesse (pela chegada do '
  'lead) e quantos foram realizados (pela data da consulta). São recortes '
  'diferentes de propósito — quem chegou em agosto pode ter feito em setembro.';


-- =============================================================================
-- 8. `anon` NÃO PRECISA CHAMAR NADA DISTO
--
-- O Postgres dá `EXECUTE` a `public` por padrão, e no Supabase isso alcança o
-- papel `anon` — o da chave pública que vai no bundle do navegador.
--
-- **Não havia vazamento**, e foi conferido: as funções são `security invoker`,
-- o RLS das quatro tabelas só libera `authenticated`, e rodando `set role anon`
-- todas devolvem zero. Mas "não vaza porque outra camada segura" é uma camada a
-- menos do que se pode ter. Quem abre o Dashboard tem sessão; ninguém mais
-- precisa dessas funções.
--
-- ⚠️ **`revoke ... from anon` NÃO RESOLVE, e parece resolver.** O privilégio do
-- `anon` não vem de um grant direto a ele: vem do `EXECUTE` que o Postgres dá a
-- `PUBLIC` em toda função nova. Revogar de `anon` roda sem erro, devolve `ok`, e
-- `has_function_privilege('anon', ...)` continua `true`. É preciso revogar de
-- **`public`** e devolver o acesso a quem precisa.
-- =============================================================================

revoke execute on function public.fuso_da_clinica() from public;
revoke execute on function public.dashboard_numeros(timestamptz, timestamptz) from public;
revoke execute on function public.dashboard_por_dia(timestamptz, timestamptz) from public;
revoke execute on function public.dashboard_dia_semana(timestamptz, timestamptz) from public;
revoke execute on function public.dashboard_profissionais(timestamptz, timestamptz) from public;
revoke execute on function public.dashboard_procedimentos(timestamptz, timestamptz) from public;

grant execute on function public.fuso_da_clinica() to authenticated;
grant execute on function public.dashboard_numeros(timestamptz, timestamptz) to authenticated;
grant execute on function public.dashboard_por_dia(timestamptz, timestamptz) to authenticated;
grant execute on function public.dashboard_dia_semana(timestamptz, timestamptz) to authenticated;
grant execute on function public.dashboard_profissionais(timestamptz, timestamptz) to authenticated;
grant execute on function public.dashboard_procedimentos(timestamptz, timestamptz) to authenticated;

-- ⚠️ `service_role` NÃO é afetada, e foi conferida: ela continua com EXECUTE
-- depois do revoke, porque não recebe o privilégio por `PUBLIC`. Isso é o certo
-- — é a chave das Edge Functions —, mas quer dizer que este bloco fecha uma
-- porta só: a do navegador sem sessão.
--
-- Resultado, medido em 02/09/2026:
--   authenticated = true   anon = false   service_role = true


-- =============================================================================
-- CONFERÊNCIA
-- =============================================================================
--
-- Os números batem com o que a tela calculava?
--   select * from public.dashboard_numeros(now() - interval '1 year', now());
--   select count(*) from public.crm_clinica_dados
--    where inicio_atendimento between now() - interval '1 year' and now();
--
-- O balde do dia respeita o fuso? (deve cair no dia de São Paulo, não no de UTC)
--   select public.fuso_da_clinica();
--   select (timestamptz '2026-09-01 23:30-03' at time zone public.fuso_da_clinica())::date;
--   -- esperado: 2026-09-01
--
-- A série tem teto?
--   select count(*) from public.dashboard_por_dia('1970-01-01', now());
--   -- esperado: 370
