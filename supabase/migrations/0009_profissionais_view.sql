-- =============================================================================
-- 0009 — A VIEW DE PROFISSIONAIS PARA O AGENTE
-- Rode depois de 0008.
--
-- Mesma receita das outras duas: uma coluna, uma linha por dentista, já escrita
-- como frase — com a jornada dele junto, que é o que o paciente pergunta em
-- seguida ("e ele atende que dias?").
--
-- De quebra, unifica a montagem da frase de horário. A 0007 criou
-- `horario_atendimento_texto()` só para `horario_comercial`; agora a mesma
-- lógica serve para a jornada do dentista, que tem exatamente as mesmas
-- colunas. Duas cópias da regra de agrupamento seria uma a mais do que o
-- necessário — e a segunda envelheceria calada.
-- =============================================================================


-- =============================================================================
-- 1. FUNÇÃO ÚNICA: jornada_texto(profissional)
--
-- `null` = a clínica (lê `horario_comercial`).
-- uuid    = aquele dentista (lê `profissional_horarios`).
--
-- Devolve "segunda a sexta das 08:00 às 18:00, sábado das 08:00 às 12:00", ou
-- NULL se nenhum dia estiver ativo.
--
-- O agrupamento de dias seguidos é a técnica clássica de ilhas:
-- `ordem - row_number()` fica constante enquanto a sequência não quebra e muda
-- assim que quebra. Sem ele, a frase vira seis linhas repetindo o mesmo horário
-- — que ninguém fala assim, e o agente leria inteiro para o paciente.
--
-- `ordem` existe porque a semana do banco começa no domingo (0) e a frase em
-- português começa na segunda. Domingo vira 7 e cai no fim.
-- =============================================================================

create or replace function public.jornada_texto(p_profissional uuid default null)
returns text
language sql
stable
set search_path = public
as $$
  with dias as (
    select
      case when h.dia_semana = 0 then 7 else h.dia_semana end as ordem,
      h.dia_semana, h.hora_inicio, h.hora_fim
    from public.horario_comercial h
    where p_profissional is null and h.ativo

    union all

    select
      case when j.dia_semana = 0 then 7 else j.dia_semana end as ordem,
      j.dia_semana, j.hora_inicio, j.hora_fim
    from public.profissional_horarios j
    where j.profissional_id = p_profissional and j.ativo
  ),
  ilhas as (
    select
      d.*,
      d.ordem - (row_number() over (
        partition by d.hora_inicio, d.hora_fim order by d.ordem
      ))::int as grupo
    from dias d
  ),
  faixas as (
    select
      min(i.ordem)                                       as ini_ordem,
      (array_agg(i.dia_semana order by i.ordem))[1]      as dia_ini,
      (array_agg(i.dia_semana order by i.ordem desc))[1] as dia_fim,
      i.hora_inicio,
      i.hora_fim
    from ilhas i
    group by i.grupo, i.hora_inicio, i.hora_fim
  )
  select string_agg(
    case
      when f.dia_ini = f.dia_fim
        then (array['domingo','segunda','terça','quarta','quinta','sexta','sábado'])[f.dia_ini + 1]
      else (array['domingo','segunda','terça','quarta','quinta','sexta','sábado'])[f.dia_ini + 1]
           || ' a ' ||
           (array['domingo','segunda','terça','quarta','quinta','sexta','sábado'])[f.dia_fim + 1]
    end
    || ' das ' || substring(f.hora_inicio::text from 1 for 5)
    || ' às '  || substring(f.hora_fim::text    from 1 for 5),
    ', ' order by f.ini_ordem
  )
  from faixas f;
$$;

comment on function public.jornada_texto(uuid) is
  'Grade de horários em uma frase falável, agrupando dias seguidos iguais. '
  'NULL como argumento lê horario_comercial (a clínica); um uuid lê a jornada '
  'daquele profissional. Devolve NULL se nenhum dia estiver ativo.';


-- =============================================================================
-- 2. A VIEW DA CLÍNICA PASSA A USAR A FUNÇÃO ÚNICA
--
-- Recriada só para trocar `horario_atendimento_texto()` por `jornada_texto()`.
-- O resultado é idêntico; muda quem calcula.
-- =============================================================================

create or replace view public.informacoes_clinica_agente
with (security_invoker = true) as
select v.informacao
  from public.configuracoes_clinica c
  cross join lateral (
    values
      (1, 'Nome: '                || nullif(trim(c.nome_clinica), '')),
      (2, 'Rua: '                 || nullif(trim(c.endereco), '')),
      (3, 'Bairro: '              || nullif(trim(c.bairro), '')),
      (4, 'Cidade: '              || nullif(concat_ws('/',
                                       nullif(trim(c.cidade), ''),
                                       nullif(trim(c.estado), '')), '')),
      (5, 'CEP: '                 || regexp_replace(nullif(trim(c.cep), ''),
                                       '^(\d{5})(\d{3})$', '\1-\2')),
      (6, 'Atendimento: '         || public.jornada_texto(null)),
      (7, 'Link do Google Maps: ' || nullif(trim(c.google_maps_url), '')),
      (8, 'Instagram: '           || nullif(trim(c.instagram_url), '')),
      (9, 'Site: '                || nullif(trim(c.site_url), ''))
  ) as v (ordem, informacao)
 where v.informacao is not null
 order by v.ordem;

drop function if exists public.horario_atendimento_texto();


-- =============================================================================
-- 3. VIEW: profissionais_clinica_agente
--
-- FORMATO: "Nome Sobrenome: atende <jornada>". O nome ocupa a posição do
-- rótulo, como na view de procedimentos — todas as linhas são da mesma
-- natureza, e repetir "Profissional: " seria ruído lido em voz alta.
--
-- Sem jornada cadastrada, a linha é só o nome. O `coalesce` sobre o `||` faz o
-- trecho inteiro sumir em vez de deixar um "atende" pendurado.
--
-- SÓ OS ATIVOS: desligar o dentista em Profissionais tira ele da boca do
-- agente. A ordem é alfabética, que é como se lê uma lista de gente.
--
-- ⚠️ **A view não traz o `id`, de propósito.** Ela é para CONVERSAR. Para marcar
-- com um dentista específico, o `profissional_id` vem de `GET /profissionais`
-- da API — um UUID no meio de uma frase falável só serviria para o agente ter
-- que extrair de volta.
-- =============================================================================

create or replace view public.profissionais_clinica_agente
with (security_invoker = true) as
select
  trim(p.nome || ' ' || coalesce(p.sobrenome, ''))
  || coalesce(': atende ' || public.jornada_texto(p.id), '') as profissional
from public.profissionais p
where p.ativo
order by p.nome, p.sobrenome;

comment on view public.profissionais_clinica_agente is
  'Dentistas ativos em frases prontas, um por linha, com a jornada de cada um. '
  'Para o Agente de IA ler pelo n8n. Não traz o id: para marcar com alguém '
  'específico, use GET /profissionais da API.';


-- =============================================================================
-- CONFERÊNCIA
-- =============================================================================
-- select profissional from public.profissionais_clinica_agente;
--   → Estevão Jorge: atende segunda a sexta das 08:00 às 18:00
--
-- select public.jornada_texto(null);   -- a clínica
-- select public.jornada_texto(id) from public.profissionais;
