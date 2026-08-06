-- =============================================================================
-- 0007 — O HORÁRIO DE ATENDIMENTO NA VIEW DO AGENTE
-- Rode depois de 0006.
--
-- Acrescenta a linha `Atendimento: ...` em `informacoes_clinica_agente`,
-- montada a partir de `horario_comercial` — a mesma grade que a clínica já
-- preenche em Configurações → Horários de Funcionamento.
--
-- Ninguém digita o horário duas vezes: mudou a grade, mudou a frase na leitura
-- seguinte.
-- =============================================================================


-- =============================================================================
-- 1. FUNÇÃO: horario_atendimento_texto()
--
-- Devolve "segunda a sexta das 08:00 às 18:00, sábado das 08:00 às 12:00".
--
-- O trabalho todo é AGRUPAR DIAS SEGUIDOS com o mesmo horário. Sem isso, a
-- frase vira seis linhas repetindo "das 08:00 às 18:00" — que ninguém fala
-- assim, e o agente leria inteiro para o paciente.
--
-- A técnica é a clássica de ilhas: `ordem - row_number()` dá um valor constante
-- enquanto os dias forem consecutivos e tiverem o mesmo par de horas, e muda
-- assim que a sequência quebra. Agrupar por esse valor devolve as faixas.
--
-- `ordem` existe porque a semana do banco começa no domingo (0), mas a frase
-- em português começa na segunda. Domingo vira 7 e cai no fim — "segunda a
-- sexta, sábado, domingo", que é como se fala.
-- =============================================================================

create or replace function public.horario_atendimento_texto()
returns text
language sql
stable
set search_path = public
as $$
  with dias as (
    select
      case when h.dia_semana = 0 then 7 else h.dia_semana end as ordem,
      h.dia_semana,
      h.hora_inicio,
      h.hora_fim
    from public.horario_comercial h
    where h.ativo
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
      min(i.ordem)                                     as ini_ordem,
      (array_agg(i.dia_semana order by i.ordem))[1]    as dia_ini,
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

comment on function public.horario_atendimento_texto() is
  'Grade de horario_comercial em uma frase falável, agrupando dias seguidos '
  'com o mesmo horário. Usada por informacoes_clinica_agente. NULL se nenhum '
  'dia estiver ativo.';


-- =============================================================================
-- 2. VIEW ATUALIZADA
--
-- `Atendimento:` entra logo depois do endereço, antes dos links: é fato sobre a
-- clínica, não link. Se nenhum dia estiver ativo, a função devolve NULL, o `||`
-- propaga e a linha some — mesma regra dos outros campos.
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
      (6, 'Atendimento: '         || public.horario_atendimento_texto()),
      (7, 'Link do Google Maps: ' || nullif(trim(c.google_maps_url), '')),
      (8, 'Instagram: '           || nullif(trim(c.instagram_url), '')),
      (9, 'Site: '                || nullif(trim(c.site_url), ''))
  ) as v (ordem, informacao)
 where v.informacao is not null
 order by v.ordem;


-- =============================================================================
-- CONFERÊNCIA
-- =============================================================================
-- select public.horario_atendimento_texto();
--   → segunda a sexta das 08:00 às 18:00, sábado das 08:00 às 12:00
--
-- select informacao from public.informacoes_clinica_agente;
--
-- ⚠️ `horario_comercial` é o horário DA CLÍNICA — o que o paciente pergunta.
-- Os horários que a agenda oferece de fato vêm de `profissional_horarios`, a
-- jornada de cada dentista. Os dois podem divergir: a clínica que anuncia até
-- as 18:00 sem nenhum dentista depois das 17:00 faz o agente prometer um
-- horário que a disponibilidade recusa em seguida.
