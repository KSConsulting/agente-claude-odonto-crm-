-- =============================================================================
-- 0013 — A LISTA DE CONVERSAS
--
-- A coluna da esquerda da tela Conversas: uma linha por pessoa que já trocou
-- mensagem, com a última frase, quantas estão sem ler e quem assumiu.
--
-- POR QUE UMA VIEW, E NÃO CONSULTA NA TELA. O que a lista precisa é "a última
-- mensagem DE CADA conversa" — um `distinct on`, que o PostgREST não sabe
-- pedir. Sem a view, a tela teria duas saídas ruins: uma consulta por conversa
-- (N+1 a cada atualização, e a lista atualiza a cada mensagem que chega), ou
-- baixar todas as mensagens de todo mundo para descartar 95% no navegador.
--
-- Ela é calculada na leitura, como `crm_clinica` e as views do agente. O estado
-- "desatualizada" não existe.
--
-- ⚠️ REALTIME NÃO ASSINA VIEW. A tela assina a TABELA `mensagens_whatsapp` e
-- relê esta view quando algo chega. Assinar a view não dá erro: simplesmente
-- nunca dispara.
--
-- Documentação: DATABASE.md seção 4.18
-- =============================================================================


create view public.conversas_lista
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
    coalesce(pendentes.total, 0)  as nao_lidas
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
  'lidas e quem assumiu. Calculada na leitura. Ordene na consulta: a ordem '
  'natural da lista é `order=ultima_em.desc`.';

-- `security_invoker = true` pelo mesmo motivo de `crm_clinica`: sem isso a view
-- rodaria com os poderes de quem a criou, e a `anon key` — que é pública, vai
-- no bundle do site — leria as conversas de todos os pacientes sem sessão.
grant select on public.conversas_lista to authenticated, service_role;


-- =============================================================================
-- CONFERÊNCIA
-- =============================================================================

-- A view respeita o RLS? (esperado: security_invoker=true)
--   select relname, reloptions from pg_class
--    where relname = 'conversas_lista';

-- A lista, como a tela pede:
--   select nome_lead, ultimo_autor, nao_lidas, ultima_em
--     from public.conversas_lista
--    order by ultima_em desc;
