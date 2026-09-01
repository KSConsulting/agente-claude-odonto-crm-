-- =============================================================================
-- 0019 — O NOME DO AGENTE VIRA DADO
--
-- Até aqui a Letícia se chamava Letícia em dois sistemas que não se falam:
-- `src/lib/agente.ts` (as telas da equipe) e `agente-ia/prompt.md` (a conversa
-- com o paciente). Renomear exigia editar os dois, e nada garantia que fossem
-- editados juntos.
--
-- ── POR QUE ISTO É UMA COLUNA, E NÃO UMA CONSTANTE MELHOR ───────────────────
--
-- Porque o sistema vai ser instalado em outras clínicas, e cada uma vai querer
-- o próprio nome. Nome em código significa um deploy por clínica; nome em
-- banco significa um campo na tela.
--
-- ── UMA FONTE, DOIS LEITORES ───────────────────────────────────────────────
--
-- A partir daqui os dois lados leem daqui:
--
--   telas   → `Layout.tsx` carrega e alimenta o `useAgente()` de agente.ts
--   prompt  → `montarPrompt()` substitui o marcador `{{NOME_AGENTE}}`
--
-- ⚠️ O `AGENTE_TITULO` ("Secretária IA") e o `AGENTE_PAGINA` ("Secretária de
-- IA") continuam constantes, de propósito: são o CARGO e o nome da TELA, não o
-- nome dela. Trocar "Letícia" por "Sofia" não deve renomear a página.
--
-- ── POR QUE `not null` COM PADRÃO, E NÃO NULO ──────────────────────────────
--
-- Nome vazio não é um estado que valha a pena existir: a agente se apresenta
-- em toda primeira mensagem. Nulo obrigaria todo leitor a ter um fallback, e
-- um dia um deles esqueceria — e ela se apresentaria como "undefined" para um
-- paciente. O `CHECK` recusa string em branco pelo mesmo motivo.
--
-- Documentação: DATABASE.md seção 4.16, CLAUDE.md (Design system)
-- =============================================================================

alter table public.configuracoes_agente
  add column if not exists nome_agente text not null default 'Letícia';

alter table public.configuracoes_agente
  drop constraint if exists configuracoes_agente_nome_agente_check;

alter table public.configuracoes_agente
  add constraint configuracoes_agente_nome_agente_check
  check (length(trim(nome_agente)) between 1 and 40);

comment on column public.configuracoes_agente.nome_agente is
  'Como o Agente de IA se chama. Lido pelas telas e pelo marcador '
  '{{NOME_AGENTE}} do prompt — uma fonte para os dois. O CARGO ("Secretária '
  'IA") continua no código: é o que ela faz, não como ela se chama.';


-- =============================================================================
-- CONFERÊNCIA
-- =============================================================================

-- Qual é o nome? (esperado: Letícia)
--   select nome_agente from public.configuracoes_agente;

-- O CHECK recusa vazio? (esperado: erro 23514)
--   update public.configuracoes_agente set nome_agente = '   ';
