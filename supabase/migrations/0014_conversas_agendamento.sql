-- =============================================================================
-- 0014 — A ETIQUETA "AGENDADA" NA LISTA DE CONVERSAS
--
-- Acrescenta `data_agendamento` a `conversas_lista`, para a coluna da esquerda
-- da tela Conversas marcar quem tem consulta marcada — e filtrar por isso.
--
-- ⚠️ POR QUE NÃO DÁ PARA USAR O `status` QUE A VIEW JÁ TINHA.
--
-- A leitura óbvia seria `status = 'consulta_agendada'`. Ela está errada, e o
-- erro é silencioso: o trigger `consultas_sincroniza_lead` (0002) PRESERVA
-- `consulta_realizada` e `paciente_recorrente` quando o lead marca de novo —
-- de propósito, porque `src/lib/pessoas.ts` separa /leads de /clientes por
-- esses dois status, e rebaixá-los jogaria um paciente de volta na lista de
-- contatos a cada retorno.
--
-- Consequência: **um paciente que volta e marca continua em
-- `paciente_recorrente`.** Ele tem consulta marcada e não apareceria na
-- etiqueta nem no filtro. Justamente o caso mais comum numa clínica de
-- odontologia, que trabalha com tratamento de várias sessões e com retorno.
--
-- `data_agendamento`, não. O mesmo trigger a recalcula SEMPRE, para qualquer
-- status, como `min(data_consulta)` das consultas ativas do lead — e a zera
-- quando não sobra nenhuma. É a única coluna da ficha que responde "esta
-- pessoa tem consulta marcada?" sem depender do estágio do funil.
--
-- ⚠️ A COLUNA VAI NO FIM DA LISTA, e não ao lado de `status`, onde ela ficaria
-- melhor de ler. `create or replace view` no Postgres só aceita colunas NOVAS
-- no FIM: mudar a ordem exigiria `drop view`, que derrubaria os grants e
-- deixaria a tela sem lista no meio do caminho.
--
-- Documentação: DATABASE.md seção 4.18
-- =============================================================================


create or replace view public.conversas_lista
with (security_invoker = true)
as
  select
    d.id                          as lead_id,
    d.nome_lead,
    d.whatsapp_lead,
    d.status,
    d.agente_pausado,
    d.assumido_por,
    d.assumido_em,
    u.nome                        as assumido_por_nome,
    ultima.conteudo               as ultimo_conteudo,
    ultima.tipo                   as ultimo_tipo,
    ultima.autor                  as ultimo_autor,
    ultima.criada_em              as ultima_em,
    coalesce(pendentes.total, 0)  as nao_lidas,

    -- A consulta ativa mais próxima, mantida pelo trigger. Nula = sem consulta
    -- marcada. Ver o aviso no cabeçalho: é isto, e não `status`, que responde
    -- "agendou?".
    d.data_agendamento

  from public.crm_clinica_dados d

  -- `join lateral` sem `left` é de propósito: quem nunca trocou mensagem não
  -- é uma conversa, e não aparece na lista.
  join lateral (
    select m.conteudo, m.tipo, m.autor, m.criada_em
      from public.mensagens_whatsapp m
     where m.lead_id = d.id
     order by m.criada_em desc
     limit 1
  ) ultima on true

  left join lateral (
    select count(*) as total
      from public.mensagens_whatsapp m
     where m.lead_id = d.id
       and m.autor = 'paciente'
       and not m.lida
  ) pendentes on true

  left join public.usuarios u on u.id = d.assumido_por;

comment on view public.conversas_lista is
  'Uma linha por conversa do WhatsApp, com a última mensagem, o número de não '
  'lidas, quem assumiu e a consulta marcada. Calculada na leitura. Ordene na '
  'consulta: a ordem natural da lista é `order=ultima_em.desc`. Para "quem '
  'agendou?" use `data_agendamento is not null`, NUNCA `status`.';


-- =============================================================================
-- CONFERÊNCIA
-- =============================================================================

-- A coluna chegou, e o security_invoker sobreviveu ao replace?
--   select relname, reloptions from pg_class where relname = 'conversas_lista';
--   select column_name from information_schema.columns
--    where table_name = 'conversas_lista' order by ordinal_position;

-- Quem tem consulta marcada, como a tela pergunta:
--   select nome_lead, status, data_agendamento
--     from public.conversas_lista
--    where data_agendamento is not null
--    order by data_agendamento;

-- A armadilha, em uma consulta: leads com consulta marcada cujo status NÃO é
-- 'consulta_agendada'. Toda linha aqui é alguém que o filtro por status
-- perderia.
--   select nome_lead, status, data_agendamento
--     from public.crm_clinica_dados
--    where data_agendamento is not null
--      and status <> 'consulta_agendada';
