-- =============================================================================
-- 0022 — O procedimento vira vocabulário fechado
-- =============================================================================
--
-- O PROBLEMA
--
-- "Procedimento" era texto livre em quatro portas: o modal de Novo Paciente, o
-- modal de Novo Agendamento, a `atualizar_ficha` da Letícia e a `agenda_marcar`.
-- Cada uma aceitava o que chegasse.
--
-- Isso custa duas coisas. A primeira é medível: **não dá para contar**. "Qual o
-- procedimento mais procurado?" não tem resposta quando a mesma coisa aparece
-- como "Lentes de Contato", "lente de contato", "lentes" e "lente pro dente".
--
-- A segunda é pior, e foi encontrada por teste: `agenda_marcar` procurava o
-- nome em `servicos_clinica` e, **quando não achava, seguia em frente** — 60
-- minutos e sem conferir a avaliação. Marcar "Lente de Contato" no singular
-- passava por fora da porta de entrada, em silêncio. A trava existia e escapava
-- pela grafia.
--
-- O QUE MUDA
--
-- 1. `crm_clinica_dados.procedimentos_interesse` (`text[]`) — uma pessoa pode
--    querer lentes E clareamento, e antes só cabia um.
-- 2. `procedimento_interesse` continua existindo **na view `crm_clinica`**,
--    agora calculada: os itens juntados por vírgula. É o que faz CRM,
--    Dashboard, exportação, ficha e a Letícia seguirem sem uma linha de
--    mudança.
-- 3. Duas triggers recusam o que não está em `servicos_clinica` — no array do
--    lead, e no `procedimento`/`interesse` da consulta.
-- 4. `agenda_marcar` devolve `procedimento_desconhecido` em vez de marcar.
--
-- ⚠️ **A coluna calculada mora na VIEW, não na tabela.** Foi tentado como
-- `generated always as (array_to_string(...))` e o Postgres recusou: a função
-- não é `immutable`. E a view já é o lugar onde `minutos_ultima_mensagem` e
-- `ultima_consulta` vivem — o padrão da casa. Vale a regra de sempre: **nunca
-- grave em `procedimento_interesse`**; grave no array.
--
-- POR QUE TRIGGER, E NÃO CHAVE ESTRANGEIRA
--
-- O Postgres não tem FK de elemento de array, e `CHECK` não pode consultar
-- outra tabela. Trigger é o único jeito de amarrar sem trocar a coluna por uma
-- tabela de ligação — que aqui seria pior: `crm_clinica` é VIEW, e um `join` a
-- mais a torna somente-leitura, derrubando todo o cadastro do sistema.
--
-- ⚠️ As triggers exigem **existir**, não estar ativo. Desativar um procedimento
-- não pode quebrar o reagendamento de quem já marcou.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. A coluna nova, e os dados que já existem
-- -----------------------------------------------------------------------------

alter table public.crm_clinica_dados
  add column if not exists procedimentos_interesse text[] not null default '{}';

update public.crm_clinica_dados
   set procedimentos_interesse = array[trim(procedimento_interesse)]
 where nullif(trim(coalesce(procedimento_interesse, '')), '') is not null
   and procedimentos_interesse = '{}';

comment on column public.crm_clinica_dados.procedimentos_interesse is
  'O que a pessoa procura. Cada item TEM que existir em servicos_clinica.nome '
  '(trigger crm_procedimentos_validos, que também normaliza a grafia). É a '
  'coluna que responde "qual o procedimento mais procurado?", com unnest().';

-- -----------------------------------------------------------------------------
-- 2. A coluna de texto sai da tabela e vira cálculo da view
-- -----------------------------------------------------------------------------

drop view if exists public.crm_clinica;

alter table public.crm_clinica_dados drop column procedimento_interesse;

create view public.crm_clinica as
 SELECT id,
    nome_lead,
    whatsapp_lead,
    procedimentos_interesse,
    nullif(array_to_string(procedimentos_interesse, ', '), '') AS procedimento_interesse,
    data_nascimento,
    anotacoes,
    resumo_conversa,
    inicio_atendimento,
    ultima_mensagem,
    status,
    follow_up_1,
    follow_up_2,
    follow_up_3,
    data_agendamento,
    data_marcacao_agendamento,
    id_agendamento,
    id_conta_chatwoot,
    id_conversa_chatwoot,
    id_lead_chatwoot,
    inbox_id_chatwoot,
    valor_pago_acumulado,
    created_at,
    agente_pausado,
    assumido_por,
    assumido_em,
        CASE
            WHEN (ultima_mensagem IS NULL) THEN NULL::integer
            ELSE (floor((EXTRACT(epoch FROM (now() - ultima_mensagem)) / (60)::numeric)))::integer
        END AS minutos_ultima_mensagem,
    ( SELECT max(c.data_consulta) AS max
           FROM consultas c
          WHERE ((c.lead_id = d.id) AND (c.status = 'realizada'::text))) AS ultima_consulta
   FROM crm_clinica_dados d;

grant select, insert, update, delete on public.crm_clinica to authenticated;
grant select, insert, update, delete on public.crm_clinica to service_role;

-- -----------------------------------------------------------------------------
-- 3. As travas
-- -----------------------------------------------------------------------------

create or replace function public.procedimento_existe(p_nome text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.servicos_clinica s
     where lower(trim(s.nome)) = lower(trim(p_nome))
  );
$$;

comment on function public.procedimento_existe(text) is
  'O nome está no catálogo? Compara sem caixa e sem espaço nas pontas. '
  'Não exige ativo: desativar um procedimento não pode quebrar o '
  'reagendamento de quem já tinha marcado.';

-- -- O array do lead ------------------------------------------------------------

create or replace function public.crm_valida_procedimentos()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_item text;
begin
  if new.procedimentos_interesse is null then
    new.procedimentos_interesse := '{}';
    return new;
  end if;

  foreach v_item in array new.procedimentos_interesse loop
    if not public.procedimento_existe(v_item) then
      raise exception
        'procedimento fora do catalogo: %. Cadastre em servicos_clinica antes.',
        v_item
        using errcode = '23514';
    end if;
  end loop;

  -- Grava sempre o nome EXATO do catálogo. Sem isto, "lentes de contato" em
  -- minúsculas passaria na conferência e viraria uma segunda linha no relatório
  -- — que é o defeito inteiro, só que mais difícil de ver.
  select coalesce(array_agg(distinct s.nome order by s.nome), '{}')
    into new.procedimentos_interesse
    from public.servicos_clinica s
   where lower(trim(s.nome)) in (
     select lower(trim(x)) from unnest(new.procedimentos_interesse) x
   );

  return new;
end;
$$;

drop trigger if exists crm_procedimentos_validos on public.crm_clinica_dados;
create trigger crm_procedimentos_validos
  before insert or update of procedimentos_interesse on public.crm_clinica_dados
  for each row execute function public.crm_valida_procedimentos();

-- -- O procedimento e o interesse da consulta ------------------------------------

create or replace function public.consulta_valida_procedimento()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.procedimento_existe(new.procedimento) then
    raise exception
      'procedimento fora do catalogo: %. Cadastre em servicos_clinica antes.',
      new.procedimento
      using errcode = '23514';
  end if;

  select s.nome into new.procedimento
    from public.servicos_clinica s
   where lower(trim(s.nome)) = lower(trim(new.procedimento));

  if nullif(trim(coalesce(new.interesse, '')), '') is not null then
    if not public.procedimento_existe(new.interesse) then
      raise exception
        'interesse fora do catalogo: %. Cadastre em servicos_clinica antes.',
        new.interesse
        using errcode = '23514';
    end if;
    select s.nome into new.interesse
      from public.servicos_clinica s
     where lower(trim(s.nome)) = lower(trim(new.interesse));
  end if;

  return new;
end;
$$;

drop trigger if exists consultas_procedimento_valido on public.consultas;
create trigger consultas_procedimento_valido
  before insert or update of procedimento, interesse on public.consultas
  for each row execute function public.consulta_valida_procedimento();

commit;

-- =============================================================================
-- CONFERÊNCIA
-- =============================================================================
--
--   -- a view continua gravável? (tem que ser YES)
--   select is_updatable from information_schema.views
--    where table_name = 'crm_clinica';
--
--   -- o mais procurado, que é o motivo de tudo isto
--   select p, count(*)
--     from public.crm_clinica_dados, unnest(procedimentos_interesse) p
--    group by p order by count(*) desc;
--
--   -- o mais realizado
--   select procedimento, count(*)
--     from public.consultas where status = 'realizada'
--    group by procedimento order by count(*) desc;
