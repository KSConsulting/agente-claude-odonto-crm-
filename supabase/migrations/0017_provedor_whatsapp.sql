-- =============================================================================
-- 0017 — QUAL PROVEDOR DE WHATSAPP ESTÁ ATIVO
--
-- A clínica fala com o WhatsApp através de um servidor intermediário. Hoje é a
-- Evolution API; a uazapi está no plano. **Um de cada vez** — nunca os dois.
--
-- ── POR QUE A COLUNA NASCE COM UMA OPÇÃO SÓ ──────────────────────────────────
--
-- Porque ela é barata agora e cara depois. Sem ela, a tela teria que dizer
-- "Evolution" em texto fixo, e no dia da troca isso vira caça ao literal
-- espalhado por telas, rotas e mensagens de erro.
--
-- O que NÃO se está fazendo aqui é a abstração de provedor. Com um provedor
-- só, a interface seria inventada por palpite — e a uazapi de verdade ensina
-- mais em uma hora do que o palpite em um dia. O `CHECK` já aceita o segundo
-- nome; o código que fala com ela vem quando ela chegar.
--
-- ── POR QUE ISTO PRECISA APARECER NA TELA ────────────────────────────────────
--
-- Em 01/09 o servidor da Evolution caiu e o único sintoma foi silêncio no
-- WhatsApp: mensagem enviada, nenhuma resposta, nada no banco. Saber QUAL
-- provedor está ativo é o que diz em qual painel ir olhar. "WhatsApp
-- desconectado", sozinho, não responde essa pergunta.
--
-- ⚠️ As credenciais NÃO moram aqui. Continuam nas secrets do Supabase, fora do
-- alcance do navegador — chave de API em tabela lida por `authenticated` é
-- chave visível para qualquer pessoa com login no sistema. Esta coluna diz
-- apenas QUEM está ativo, nunca COMO se autentica.
--
-- Regra do projeto: mudou o CHECK, mude `src/types/index.ts` no mesmo commit.
--
-- Documentação: DATABASE.md seção 4.16
-- =============================================================================

alter table public.configuracoes_agente
  add column if not exists provedor_whatsapp text not null default 'evolution';

alter table public.configuracoes_agente
  drop constraint if exists configuracoes_agente_provedor_whatsapp_check;

alter table public.configuracoes_agente
  add constraint configuracoes_agente_provedor_whatsapp_check
  check (provedor_whatsapp in ('evolution', 'uazapi'));

comment on column public.configuracoes_agente.provedor_whatsapp is
  'Qual ponte com o WhatsApp está ativa: evolution ou uazapi. UMA de cada vez. '
  'As credenciais de cada uma vivem nas secrets do Supabase, nunca nesta tabela.';


-- =============================================================================
-- CONFERÊNCIA
-- =============================================================================

-- Qual está ativo? (esperado: evolution)
--   select provedor_whatsapp from public.configuracoes_agente;

-- O CHECK recusa o que não conhece? (esperado: erro 23514)
--   update public.configuracoes_agente set provedor_whatsapp = 'zap-do-joao';
