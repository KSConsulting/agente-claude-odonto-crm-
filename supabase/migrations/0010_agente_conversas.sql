-- =============================================================================
-- 0010 — AGENTE DE IA: as conversas do WhatsApp
--
-- Cria o que falta para a Letícia atender e para a equipe acompanhar:
--
--   1. mensagens_whatsapp    — cada mensagem trocada (a memória do agente E o
--                              que a tela Conversas mostra: a mesma fonte)
--   2. crm_clinica_dados     — três colunas para "assumir conversa"
--   3. configuracoes_agente  — modelo, prompt, liga/desliga e o MODO TESTE
--   4. agente_deve_responder() — a regra do modo teste, num lugar só
--   5. trigger de ultima_mensagem
--   6. RLS, Realtime e Storage
--
-- Documentação: agente-ia/README.md (seções 6 e 7)
-- =============================================================================


-- =============================================================================
-- 1. TABELA: mensagens_whatsapp
-- Usada em: supabase/functions/whatsapp/, src/pages/Conversas.tsx
-- =============================================================================

create table public.mensagens_whatsapp (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null
                references public.crm_clinica_dados(id) on delete cascade,

  autor       text not null
                check (autor in ('paciente', 'agente', 'atendente')),

  tipo        text not null default 'texto'
                check (tipo in ('texto', 'audio', 'imagem', 'video', 'documento')),

  -- O texto da mensagem. Em áudio, guarda a TRANSCRIÇÃO — é o que o modelo lê
  -- e o que a equipe vê embaixo do player.
  conteudo    text,

  -- Caminho do arquivo no bucket `midias-whatsapp`. Nulo quando é só texto.
  midia_url   text,

  -- O id da mensagem na Evolution. É o que impede a mesma mensagem entrar duas
  -- vezes quando o WhatsApp reenvia o webhook — coisa que ele faz.
  id_externo  text unique,

  -- Qual usuário escreveu, quando `autor = 'atendente'`. Nulo nos outros casos.
  enviada_por uuid references auth.users(id) on delete set null,

  -- Estado de leitura da EQUIPE INTEIRA, não de cada usuário.
  -- DECISÃO: a clínica é pequena e qualquer um pode assumir qualquer conversa
  -- (agente-ia/README.md, seção 3). Leitura por usuário exigiria outra tabela
  -- para ganhar pouco.
  lida        boolean not null default false,

  criada_em   timestamptz not null default now()
);

-- Carregar uma conversa é sempre "as mensagens deste lead, em ordem".
create index mensagens_whatsapp_conversa_idx
  on public.mensagens_whatsapp (lead_id, criada_em);

-- A lista da esquerda ordena por quem falou por último.
create index mensagens_whatsapp_recentes_idx
  on public.mensagens_whatsapp (criada_em desc);

-- Contador de não lidas, só sobre o que o paciente mandou.
create index mensagens_whatsapp_nao_lidas_idx
  on public.mensagens_whatsapp (lead_id)
  where not lida and autor = 'paciente';

comment on table public.mensagens_whatsapp is
  'Mensagens trocadas no WhatsApp. É a memória do Agente de IA e a fonte da '
  'tela Conversas — a mesma, de propósito: o que a equipe lê é o que o agente '
  'lembra.';


-- =============================================================================
-- 2. crm_clinica_dados — colunas de "assumir conversa"
--
-- ⚠️ A VIEW `crm_clinica` PRECISA SER RECRIADA.
--
-- Ela é `select d.*, ...` (0001, linha 252), e o Postgres CONGELA essa
-- expansão no momento da criação: a lista de colunas vira fixa por dentro.
-- Coluna nova na tabela NÃO aparece na view sozinha.
--
-- E `create or replace view` também não resolve: as colunas novas entrariam
-- ANTES de `minutos_ultima_mensagem`, mudando a posição de uma coluna
-- existente — o que o Postgres recusa. Só dropando e recriando.
-- =============================================================================

drop view public.crm_clinica;

alter table public.crm_clinica_dados
  add column agente_pausado boolean not null default false,
  add column assumido_por   uuid references auth.users(id) on delete set null,
  add column assumido_em    timestamptz;

comment on column public.crm_clinica_dados.agente_pausado is
  'Ligado, o Agente de IA salva a mensagem e NÃO responde nesta conversa. '
  'É o botão "Assumir conversa" da tela Conversas.';

-- Recriada IDÊNTICA à de 0001 — só voltou a enxergar as colunas novas.
create view public.crm_clinica
with (security_invoker = true)
as
  select
    d.*,
    case
      when d.ultima_mensagem is null then null
      else floor(extract(epoch from (now() - d.ultima_mensagem)) / 60)::integer
    end as minutos_ultima_mensagem
  from public.crm_clinica_dados d;

grant select, insert, update, delete
  on public.crm_clinica
  to authenticated, service_role;


-- =============================================================================
-- 3. TABELA: configuracoes_agente
-- Uma linha só. Usada em: src/components/TabAgenteIA.tsx
-- =============================================================================

create table public.configuracoes_agente (
  id             uuid primary key default gen_random_uuid(),

  -- DESLIGADO por padrão. Ninguém liga um agente sem querer: rodar a migração
  -- não coloca a Letícia para falar com paciente.
  ativo          boolean not null default false,

  -- Padrão: GPT-4.1. A clínica começou pela OpenAI porque já tinha a chave.
  -- Trocar é um clique na aba "Agente de IA" — e a lista de modelos aceitos
  -- vive em `ModeloAgente` (src/types/index.ts) e em
  -- `supabase/functions/_shared/llm.ts`. Acrescentar um exige os dois.
  modelo         text not null default 'gpt-4.1',

  -- Nulo = usar o prompt oficial de agente-ia/prompt.md.
  -- Preenchido = alguém editou pela tela, e ESTE é o que está no ar.
  prompt         text,

  -- ---------------------------------------------------------------------
  -- MODO TESTE — ligado por padrão, e isso não é excesso de zelo.
  --
  -- Com a Evolution conectada, QUALQUER número que mandar mensagem aciona o
  -- agente. Sem esta trava, o primeiro teste responde a paciente de verdade,
  -- com um prompt ainda não validado.
  --
  -- Ligado, o agente só responde a quem está em `numeros_teste`. As demais
  -- mensagens são gravadas normalmente (aparecem na tela Conversas), mas
  -- ficam sem resposta — para a equipe atender à mão.
  -- ---------------------------------------------------------------------
  modo_teste     boolean not null default true,

  -- Formato canônico: só dígitos, com o código do país. Mesmo de
  -- `whatsapp_lead` (src/lib/telefones.ts).
  numeros_teste  text[] not null default '{}',

  -- Quem mexeu por último na configuração.
  atualizado_por uuid references auth.users(id) on delete set null,

  -- `created_at` / `updated_at` com estes nomes de propósito: é o que
  -- `set_updated_at()` (0001, linha 25) espera encontrar.
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Mesmo truque de configuracoes_clinica (0001, linha 92): garante linha única.
create unique index configuracoes_agente_singleton
  on public.configuracoes_agente ((true));

create trigger configuracoes_agente_updated_at
  before update on public.configuracoes_agente
  for each row execute function public.set_updated_at();

comment on table public.configuracoes_agente is
  'Configuração do Agente de IA: modelo, prompt em uso, liga/desliga e modo '
  'teste. Uma linha só. O prompt oficial vive em agente-ia/prompt.md; a '
  'coluna `prompt` guarda apenas o que foi editado pela tela.';


-- =============================================================================
-- 4. FUNÇÃO: agente_deve_responder()
--
-- A regra do modo teste em UM lugar só. A Edge Function pergunta, não decide.
-- Se a regra mudar, muda aqui — e não em dois arquivos que envelhecem
-- separados.
-- =============================================================================

create or replace function public.agente_deve_responder(p_whatsapp text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    c.ativo
    and (not c.modo_teste or p_whatsapp = any (c.numeros_teste))
  from public.configuracoes_agente c
  limit 1;
$$;

comment on function public.agente_deve_responder(text) is
  'Responde se o Agente de IA deve atender este número: agente ligado E '
  '(modo teste desligado OU o número está na lista de teste). Devolve NULL '
  'se não houver configuração — a Edge Function trata como "não responder".';


-- =============================================================================
-- 5. TRIGGER: manter `ultima_mensagem` em dia
--
-- A coluna já existia (0001) e alimenta `minutos_ultima_mensagem`, que o CRM
-- mostra para saber há quanto tempo um lead está parado.
--
-- DECISÃO: só conta mensagem DO PACIENTE.
-- O agente responde em segundos. Se a resposta dele contasse, a coluna
-- marcaria "0 min" o tempo inteiro e o CRM perderia justamente o sinal que
-- ela existe para dar — há quanto tempo a PESSOA não fala.
-- Para contar qualquer atividade, tire o `when` do trigger.
-- =============================================================================

create or replace function public.mensagens_atualiza_lead()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.crm_clinica_dados
     set ultima_mensagem = new.criada_em
   where id = new.lead_id;
  return new;
end;
$$;

create trigger mensagens_whatsapp_atualiza_lead
  after insert on public.mensagens_whatsapp
  for each row
  when (new.autor = 'paciente')
  execute function public.mensagens_atualiza_lead();


-- =============================================================================
-- 6. RLS
--
-- Mesmo padrão do resto do projeto: equipe logada pode tudo.
-- Lembrete que vale para as duas tabelas: a Edge Function do agente usa a
-- `service_role key`, que passa por cima destas políticas. Com a `anon key`,
-- as gravações devolvem 200 OK e zero linhas.
-- =============================================================================

alter table public.mensagens_whatsapp   enable row level security;
alter table public.configuracoes_agente enable row level security;

create policy "mensagens_whatsapp_all" on public.mensagens_whatsapp
  for all to authenticated using (true) with check (true);

create policy "configuracoes_agente_all" on public.configuracoes_agente
  for all to authenticated using (true) with check (true);


-- =============================================================================
-- 7. REALTIME
--
-- ⚠️ Assina a TABELA. O Postgres só replica tabelas — assinar uma view não dá
-- erro, simplesmente nunca dispara. Mesma armadilha de crm_clinica /
-- crm_clinica_dados (CLAUDE.md, "Banco de dados", item 4).
-- =============================================================================

alter publication supabase_realtime add table public.mensagens_whatsapp;


-- =============================================================================
-- 8. STORAGE — áudios e fotos que o paciente manda
-- =============================================================================

insert into storage.buckets (id, name, public)
values ('midias-whatsapp', 'midias-whatsapp', false)
on conflict (id) do nothing;

-- DECISÃO: bucket PRIVADO — diferente de `avatars` e `logos`, que são
-- públicos. Aqui entra foto da boca de paciente: dado de saúde, com URL que
-- não pode ser adivinhada nem indexada. A tela Conversas abre cada arquivo
-- com signed URL (createSignedUrl), não com getPublicUrl.

create policy "midias_whatsapp_equipe_le" on storage.objects
  for select to authenticated using (bucket_id = 'midias-whatsapp');

create policy "midias_whatsapp_equipe_grava" on storage.objects
  for insert to authenticated with check (bucket_id = 'midias-whatsapp');


-- =============================================================================
-- 9. DADOS INICIAIS
-- =============================================================================

-- Agente DESLIGADO, modo teste LIGADO, e a lista de números VAZIA.
--
-- Ligar é ato consciente, feito na página Secretária de IA — e cadastrar o
-- próprio número também. A lista nasce vazia de propósito: um número escrito
-- aqui seria o do autor deste repositório, cadastrado na instalação de
-- desconhecidos.
--
-- Vazia + modo teste ligado é o estado mais seguro possível: ela não responde
-- ninguém até alguém escolher, na tela, quem pode receber resposta.
insert into public.configuracoes_agente (ativo, modo_teste, numeros_teste)
values (false, true, array[]::text[])
on conflict do nothing;


-- =============================================================================
-- CONFERÊNCIA — rode depois de aplicar
-- =============================================================================

-- A view voltou com as três colunas novas? Devolve 3 linhas.
--   select column_name from information_schema.columns
--    where table_name = 'crm_clinica'
--      and column_name in ('agente_pausado','assumido_por','assumido_em');

-- E `minutos_ultima_mensagem` continua lá? Devolve 1 linha.
--   select column_name from information_schema.columns
--    where table_name = 'crm_clinica' and column_name = 'minutos_ultima_mensagem';

-- O modo teste responde certo? Deve dar false, false, false —
-- o agente ainda está desligado.
--   select public.agente_deve_responder('5511987654321'),
--          public.agente_deve_responder('5511999999999'),
--          public.agente_deve_responder(null);

-- Depois de ligar o agente E cadastrar o primeiro número na tela, o mesmo
-- select com AQUELE número deve dar true.

-- Realtime ligado na tabela certa? Devolve 1 linha.
--   select tablename from pg_publication_tables
--    where pubname = 'supabase_realtime' and tablename = 'mensagens_whatsapp';
