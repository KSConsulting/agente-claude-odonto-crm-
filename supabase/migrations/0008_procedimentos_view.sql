-- =============================================================================
-- 0008 — A VIEW DE PROCEDIMENTOS PARA O AGENTE
-- Rode depois de 0007.
--
-- Mesma ideia de `informacoes_clinica_agente`: uma coluna, uma linha por
-- procedimento, já escrita como frase. O Agente de IA lê pelo n8n para saber o
-- que a clínica oferece — e para não inventar tratamento que não existe.
-- =============================================================================


-- =============================================================================
-- 1. VIEW: procedimentos_clinica_agente
--
-- FORMATO: "Nome do procedimento: descrição". O nome ocupa a posição do rótulo
-- porque aqui todas as linhas são da mesma natureza — repetir "Procedimento: "
-- em vinte linhas seria ruído que o agente leria em voz alta.
--
-- Sem descrição, a linha é só o nome. O `coalesce` sobre o `||` cuida disso: se
-- a descrição for nula ou vazia, o trecho inteiro some em vez de deixar um
-- dois-pontos pendurado no fim.
--
-- ORDEM: `created_at`, a mesma da tela de Configurações. É a ordem que a
-- clínica escolheu — começa pela Avaliação, que é por onde todo tratamento
-- passa. Alfabética jogaria "Alinhadores Transparentes" para a frente e a
-- avaliação para o meio da lista.
--
-- SÓ OS ATIVOS: desligar o procedimento em Configurações tira ele da boca do
-- agente, sem ninguém mexer no n8n.
-- =============================================================================

create or replace view public.procedimentos_clinica_agente
with (security_invoker = true) as
select
  s.nome || coalesce(': ' || nullif(trim(s.descricao), ''), '') as procedimento
from public.servicos_clinica s
where s.ativo
order by s.created_at;

comment on view public.procedimentos_clinica_agente is
  'Procedimentos ativos em frases prontas, um por linha, para o Agente de IA '
  'ler pelo n8n. Calculada na leitura a partir de servicos_clinica. Sem '
  'descrição, a linha é só o nome.';


-- =============================================================================
-- CONFERÊNCIA
-- =============================================================================
-- select procedimento from public.procedimentos_clinica_agente;
--
--   Avaliação e Planejamento Digital do Sorriso: Primeira consulta com
--   escaneamento e fotos, onde o dentista mostra o resultado simulado antes
--   de começar
--   Lentes de Contato: Lâminas finíssimas de porcelana coladas na frente dos
--   dentes para mudar cor e formato
--   ...
