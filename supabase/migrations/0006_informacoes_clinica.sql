-- =============================================================================
-- 0006 — DADOS DA CLÍNICA E A VIEW QUE O AGENTE LÊ
-- Rode depois de 0001 … 0005.
--
-- Endereço, bairro, cidade, estado, CEP e os links da clínica, mais a view
-- `informacoes_clinica_agente` — uma coluna, uma informação por linha, já
-- escrita como frase.
--
-- POR QUE UMA VIEW, E NÃO UMA TABELA À PARTE:
--
-- Uma segunda tabela precisaria ser mantida em sincronia com a primeira, e um
-- dia não estaria — alguém edita o endereço na tela e esquece de propagar, ou
-- o trigger falha em silêncio. A view é calculada na leitura: **não existe o
-- estado "desatualizada"**. É o mesmo motivo pelo qual `crm_clinica` é view
-- sobre `crm_clinica_dados`.
--
-- POR QUE UMA COLUNA SÓ:
--
-- Quem lê é o Agente de IA, pelo n8n, e ele vai falar isso com um paciente.
-- Uma coluna de frases prontas não exige que ele descubra qual valor é qual —
-- e um dado sem rótulo é um dado que ele vai adivinhar errado uma hora.
-- =============================================================================


-- =============================================================================
-- 1. COLUNAS NOVAS EM configuracoes_clinica
--
-- Vão na tabela que já existe, e não numa nova: a clínica é uma linha só, e
-- `nome_clinica`, `logo_url` e `fuso_horario` já moram aqui.
-- =============================================================================

alter table public.configuracoes_clinica
  add column if not exists endereco        text,
  add column if not exists bairro          text,
  add column if not exists cidade          text,
  add column if not exists estado          text,
  add column if not exists cep             text,
  add column if not exists google_maps_url text,
  add column if not exists instagram_url   text,
  add column if not exists site_url        text;

-- DECISÃO (`endereco` é um campo só): guarda "Rua Samuel Scott, 212 A - bloco 3"
-- inteiro. Separar rua, número e complemento em três colunas obrigaria a
-- remontar a frase na leitura e daria três jeitos de a mesma coisa ficar
-- estranha ("Rua X, s/n, ").

-- DECISÃO (`cidade` livre, `estado` na lista): cidade escrita à mão é
-- inevitável — são milhares. UF é um conjunto fechado de 27, e digitada à mão
-- vira "SP", "sp", "São Paulo" na mesma coluna.

alter table public.configuracoes_clinica
  drop constraint if exists configuracoes_clinica_estado_valido;

alter table public.configuracoes_clinica
  add constraint configuracoes_clinica_estado_valido
  check (estado is null or estado in (
    'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG',
    'PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'
  ));

-- O CEP é guardado só em dígitos, como o WhatsApp. A pontuação existe na tela,
-- via `formatarCep()`; no banco, "88040600".
alter table public.configuracoes_clinica
  drop constraint if exists configuracoes_clinica_cep_valido;

alter table public.configuracoes_clinica
  add constraint configuracoes_clinica_cep_valido
  check (cep is null or cep ~ '^\d{8}$');


-- =============================================================================
-- 2. VIEW: informacoes_clinica_agente
--
-- Uma coluna (`informacao`), uma linha por dado, na ordem fixa abaixo.
--
-- O `||` com NULL devolve NULL, e o WHERE derruba a linha. É isso que faz o
-- campo vazio **sumir** em vez de virar "Site: " pelado — que o agente leria
-- como "o site da clínica é nada".
--
-- `nullif(trim(...), '')` está aí porque string vazia não é NULL: sem ele, um
-- campo salvo com espaço em branco produziria exatamente a linha pelada.
--
-- `security_invoker` mantém o RLS de `configuracoes_clinica` valendo: a
-- `service_role` do n8n lê, a equipe logada lê, e quem não tem sessão não lê —
-- igual ao resto do banco.
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
      (6, 'Link do Google Maps: ' || nullif(trim(c.google_maps_url), '')),
      (7, 'Instagram: '           || nullif(trim(c.instagram_url), '')),
      (8, 'Site: '                || nullif(trim(c.site_url), ''))
  ) as v (ordem, informacao)
 where v.informacao is not null
 order by v.ordem;

comment on view public.informacoes_clinica_agente is
  'Dados da clínica em frases prontas, uma por linha, para o Agente de IA ler '
  'pelo n8n. Calculada na leitura a partir de configuracoes_clinica — nunca '
  'fica desatualizada. Campo vazio não vira linha.';


-- =============================================================================
-- CONFERÊNCIA
-- =============================================================================
-- select informacao from public.informacoes_clinica_agente;
--
-- Com a clínica preenchida, devolve algo como:
--   Nome: Odonto Clinica
--   Rua: Rua Samuel Scott, 212 A - bloco 3
--   Bairro: Carvoeira
--   Cidade: Florianópolis/SC
--   CEP: 88040-600
--   Link do Google Maps: https://maps.app.goo.gl/...
--   Instagram: https://instagram.com/clinica
--   Site: https://clinica.com.br
