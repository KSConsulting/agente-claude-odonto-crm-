-- =============================================================================
-- 0016 — `ultima_consulta` NA VIEW crm_clinica
--
-- A tela Pacientes precisava responder "quando essa pessoa esteve aqui?", e não
-- tinha com quê.
--
-- ── O QUE ESTAVA ERRADO ──────────────────────────────────────────────────────
--
-- A lista mostrava `data_agendamento`, que é a **próxima** consulta marcada.
-- Em Contatos isso é exatamente o que se quer saber. Em Pacientes, não: virar
-- paciente significa que a consulta aconteceu, e a `0015` zera
-- `data_agendamento` quando não sobra nenhuma ativa.
--
-- Resultado: a coluna ficava vazia para **todo paciente**, para sempre. O furo
-- só apareceu depois que a `0015` fez o funil andar — antes ninguém chegava
-- lá para ver.
--
-- ⚠️ POR QUE SUBCONSULTA ESCALAR, E NÃO `join lateral`
--
-- `conversas_lista` (0013) resolve o mesmo tipo de pergunta com `join lateral`.
-- Aqui isso seria um **erro grave**: `crm_clinica` é ESCRITA pela aplicação —
-- cadastro de contato, de paciente, edição da ficha e o próprio Agente de IA
-- passam por ela. Uma view só é auto-atualizável com **um único item no FROM**;
-- o lateral acrescenta o segundo e a view vira somente-leitura. Todo cadastro
-- do sistema quebraria de uma vez.
--
-- A subconsulta escalar fica na lista de seleção e não toca o FROM. Testado
-- antes de escrever, num bloco com rollback: `is_updatable` continua `YES`, e
-- INSERT e UPDATE pela view continuam passando.
--
-- (`conversas_lista` pode usar lateral porque ninguém escreve nela.)
--
-- ⚠️ A coluna vai no FIM da lista, como na 0014: `create or replace view` só
-- aceita colunas novas no fim, e `drop view` derrubaria os grants.
--
-- ⚠️ É COLUNA CALCULADA. Como `minutos_ultima_mensagem`, ela é lida e **nunca
-- gravada**. Escrever nela devolve erro do Postgres.
--
-- Documentação: DATABASE.md seção 4.2
-- =============================================================================

create or replace view public.crm_clinica
with (security_invoker = true)
as
  select
    id, nome_lead, whatsapp_lead, procedimento_interesse, data_nascimento,
    anotacoes, resumo_conversa, inicio_atendimento, ultima_mensagem, status,
    follow_up_1, follow_up_2, follow_up_3, data_agendamento,
    data_marcacao_agendamento, id_agendamento, id_conta_chatwoot,
    id_conversa_chatwoot, id_lead_chatwoot, inbox_id_chatwoot,
    valor_pago_acumulado, created_at, agente_pausado, assumido_por, assumido_em,

    case
      when ultima_mensagem is null then null::integer
      else floor(extract(epoch from now() - ultima_mensagem) / 60::numeric)::integer
    end as minutos_ultima_mensagem,

    -- A última vez que a pessoa ESTEVE na clínica. Só `realizada`: consulta
    -- cancelada ou com falta não é visita, e contá-las faria a tela dizer que
    -- alguém veio num dia em que justamente não veio.
    (
      select max(c.data_consulta)
        from public.consultas c
       where c.lead_id = d.id
         and c.status = 'realizada'
    ) as ultima_consulta

  from public.crm_clinica_dados d;

comment on view public.crm_clinica is
  'A ficha do lead, com duas colunas calculadas na leitura: '
  '`minutos_ultima_mensagem` e `ultima_consulta` (a última consulta realizada). '
  'É auto-atualizável — a aplicação escreve por ela —, então NÃO acrescente '
  'join a esta view: dois itens no FROM a tornariam somente-leitura. '
  'Nunca grave nas duas colunas calculadas.';


-- =============================================================================
-- CONFERÊNCIA
-- =============================================================================

-- A view continua ESCRITÍVEL? (esperado: YES — se vier NO, o cadastro quebrou)
--   select is_updatable from information_schema.views where table_name='crm_clinica';

-- E continua respeitando o RLS? (esperado: {security_invoker=true})
--   select reloptions from pg_class where relname = 'crm_clinica';

-- A coluna responde:
--   select nome_lead, status, data_agendamento, ultima_consulta
--     from public.crm_clinica order by nome_lead;

-- Paciente sem `ultima_consulta` é sinal de cadastro manual (/clientes → Novo
-- Paciente grava o status direto, sem criar consulta). A coluna vem nula, e a
-- tela mostra isso em vez de inventar uma data:
--   select nome_lead from public.crm_clinica
--    where status in ('consulta_realizada','paciente_recorrente')
--      and ultima_consulta is null;
