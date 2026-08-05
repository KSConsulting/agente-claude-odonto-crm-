-- =============================================================================
-- 0005 — CATÁLOGO DE PROCEDIMENTOS
--
-- Troca os três procedimentos que vieram do seed inicial pelo catálogo
-- definitivo da clínica: 20 procedimentos, aprovados um a um.
--
-- Por que recriar em vez de completar: os três existentes eram semente de
-- exemplo, ninguém os editou pela tela (conferido no banco antes de rodar) e
-- nada referencia `servicos_clinica` por chave estrangeira — `consultas.
-- procedimento` é texto livre. Recriando, a ordem de cadastro fica igual à
-- ordem aprovada.
--
-- ⚠️ Nenhum nome de marca registrada. É "Alinhadores Transparentes", nunca o
-- nome comercial — o Agente de IA lê estes nomes para o paciente no WhatsApp.
--
-- A descrição é a explicação do procedimento em uma linha, em linguagem de
-- paciente. Ela aparece em Configurações → Procedimentos; a API do agente
-- (`GET /procedimentos`) devolve só o nome.
-- =============================================================================

delete from public.servicos_clinica;

-- O `created_at` recebe um deslocamento crescente de propósito: a listagem de
-- Configurações ordena por ele, e um `now()` idêntico nas 20 linhas deixaria a
-- ordem da tela por conta do acaso.
insert into public.servicos_clinica (nome, descricao, ativo, created_at)
select v.nome, v.descricao, true, now() + (v.ordem * interval '1 millisecond')
from (values
  ( 1, 'Avaliação e Planejamento Digital do Sorriso',
       'Primeira consulta com escaneamento e fotos, onde o dentista mostra o resultado simulado antes de começar'),
  ( 2, 'Lentes de Contato',
       'Lâminas finíssimas de porcelana coladas na frente dos dentes para mudar cor e formato'),
  ( 3, 'Facetas em Resina',
       'Camadas de resina aplicadas sobre o dente para corrigir cor, forma ou pequenas falhas'),
  ( 4, 'Clareamento Dental',
       'Gel clareador que remove manchas e deixa os dentes vários tons mais claros'),
  ( 5, 'Gengivoplastia',
       'Pequena cirurgia que ajusta o contorno da gengiva quando ela cobre demais os dentes'),
  ( 6, 'Alinhadores Transparentes',
       'Placas removíveis e quase invisíveis que alinham os dentes no lugar do aparelho fixo'),
  ( 7, 'Implante Unitário',
       'Pino de titânio fixado no osso para substituir a raiz de um dente perdido, com coroa por cima'),
  ( 8, 'Carga Imediata',
       'Implante e dente provisório instalados na mesma sessão, sem ficar sem o dente'),
  ( 9, 'Prótese Fixa sobre Implantes',
       'Arcada inteira de dentes fixos apoiada em implantes, para quem perdeu todos ou quase todos'),
  (10, 'Enxerto Ósseo',
       'Reconstrói o osso perdido para que a região consiga receber um implante'),
  (11, 'Levantamento de Seio Maxilar',
       'Cria altura óssea no fundo da arcada superior para viabilizar o implante'),
  (12, 'Prótese Dentária',
       'Reposição de dentes perdidos ou danificados, com o tipo definido na avaliação'),
  (13, 'Tratamento de Canal',
       'Remove o nervo inflamado de dentro do dente, acaba com a dor e preserva o dente'),
  (14, 'Placa de Bruxismo',
       'Placa sob medida para dormir, que protege os dentes de quem range ou aperta'),
  (15, 'Tratamento de DTM',
       'Trata a dor na articulação da mandíbula, que causa estalo, travamento e dor de cabeça'),
  (16, 'Limpeza e Profilaxia',
       'Remoção de placa e tártaro com polimento final, indicada a cada seis meses'),
  (17, 'Raspagem',
       'Limpeza profunda que retira o tártaro abaixo da gengiva, onde a escova não alcança'),
  (18, 'Tratamento Periodontal',
       'Trata a gengiva inflamada ou sangrando e o osso afetado, evitando a perda do dente'),
  (19, 'Enxerto Gengival',
       'Recupera a gengiva que retraiu e deixou a raiz do dente exposta e sensível'),
  (20, 'Extração de Siso',
       'Remoção do dente do siso quando nasce torto, fica entalado ou causa dor e infecção')
) as v (ordem, nome, descricao);


-- =============================================================================
-- CONFERÊNCIA
-- =============================================================================
-- select nome, descricao from public.servicos_clinica
--  where ativo order by created_at;   -- deve devolver 20 linhas, nesta ordem
