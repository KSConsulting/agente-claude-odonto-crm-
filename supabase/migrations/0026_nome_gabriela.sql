-- =============================================================================
-- 0026 — A SECRETÁRIA PASSA A SE CHAMAR GABRIELA
--
-- A `0019` tirou o nome do código e o pôs numa coluna, justamente para que
-- trocá-lo fosse um `update` e não um deploy.
--
-- ── POR QUE ISTO É UMA MIGRAÇÃO, E NÃO UM `UPDATE` COLADO NO SQL EDITOR ─────
--
-- Porque o `update` avulso acerta ESTE banco e nenhum outro. A `0019` nasceu
-- com `default 'Letícia'`, então uma instalação nova — a mesma clínica num
-- projeto novo, ou o banco restaurado de um backup — voltaria a se chamar
-- Letícia, e o erro apareceria na primeira mensagem a um paciente.
--
-- ⚠️ **E ISSO JÁ TINHA ACONTECIDO, EM SILÊNCIO.** Quando esta migração foi
-- escrita, a coluna deste banco não estava em `Letícia`: estava em `Julia`,
-- posta à mão por um `update` avulso que nunca virou arquivo. Nenhum documento
-- do repositório sabia disso — todos ainda diziam "Letícia" —, e um banco
-- recriado teria voltado para Letícia sem ninguém entender por quê. É
-- exatamente o defeito que este arquivo existe para não repetir.
--
-- Aqui a troca é reproduzível: quem aplicar as 26 migrações em ordem termina
-- com Gabriela, sempre.
--
-- ⚠️ **A `0019` NÃO foi editada.** O `default 'Letícia'` continua lá, e é
-- assim que tem que ser: migração aplicada é registro do que rodou, não
-- rascunho. Quem corrige o passado editando o arquivo que já rodou fica com
-- dois bancos diferentes contando a mesma história.
--
-- ── O QUE ESTA MIGRAÇÃO **NÃO** MUDA ───────────────────────────────────────
--
-- O CARGO. "Secretária IA" (o crachá das telas da equipe) e "Secretária de IA"
-- (o nome da página) continuam constantes em `src/lib/agente.ts` — são o que
-- ela faz e como a tela se chama, não como ela se chama. É exatamente a
-- separação que a `0019` desenhou.
--
-- ── DEPOIS DE RODAR, NADA PRECISA SER REPUBLICADO ──────────────────────────
--
-- As telas leem a coluna no `Layout` a cada sessão (F5 basta), e a Edge
-- Function a relê a cada mensagem para trocar o `{{NOME_AGENTE}}`. Não há
-- `agente:deploy` neste caminho.
--
-- ⚠️ **Mas vale para conversa em andamento.** Quem fala com ela há semanas vê
-- o nome mudar no meio da conversa, e o histórico anterior continua com o nome
-- antigo nos balões já enviados. É o motivo de o campo ser só leitura na tela:
-- a troca é ato deliberado, não clique de passagem.
--
-- Documentação: DATABASE.md seção 4.16, CLAUDE.md (Design system)
-- =============================================================================

update public.configuracoes_agente
   set nome_agente = 'Gabriela';


-- =============================================================================
-- CONFERÊNCIA
-- =============================================================================

-- Como ela se chama agora? (esperado: Gabriela)
--   select nome_agente from public.configuracoes_agente;
