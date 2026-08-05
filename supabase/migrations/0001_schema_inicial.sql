-- =============================================================================
-- SISTEMA CLÍNICA — SCHEMA INICIAL
-- Projeto Supabase: Odonto Clinica (xngzwqvhrjyekanpvxzi)
--
-- ✅ APLICADO NO BANCO. Rode este arquivo inteiro num projeto Supabase novo
--    para recriar tudo do zero.
--
-- Reconstruído a partir do código-fonte (src/types/index.ts + chamadas
-- .from() nas páginas), já que o projeto Supabase original do sistema de
-- cirurgia plástica não está disponível nesta conta.
--
-- DECISÕES CONFIRMADAS:
--   • Todo usuário autenticado vê tudo (RLS)
--   • Excluir lead apaga as consultas dele em cascata
--   • minutos_ultima_mensagem é calculado por uma VIEW (seção 6.1)
--   • dia_semana: 0 = domingo ... 6 = sábado
--   • Realtime publica a TABELA, nunca a view (seção 11)
-- =============================================================================


-- =============================================================================
-- 1. FUNÇÃO AUXILIAR — updated_at automático
-- =============================================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- =============================================================================
-- 2. TABELA: usuarios
-- Perfil do usuário, espelhando auth.users.
-- Usada em: Configuracoes.tsx, Dashboard.tsx, Sidebar.tsx
-- =============================================================================

create table public.usuarios (
  id         uuid primary key references auth.users(id) on delete cascade,
  nome       text not null default '',
  avatar_url text,
  created_at timestamptz not null default now()
);

-- DECISÃO: o código sempre busca com .eq('id', user.id) usando o ID do Auth
-- (Dashboard.tsx:231, Sidebar.tsx:35, Configuracoes.tsx:90). Por isso `id` é
-- a MESMA chave de auth.users, e não um UUID independente.

-- Cria automaticamente a linha em `usuarios` quando um usuário se cadastra.
-- DECISÃO: sem isto, todo usuário novo precisa de INSERT manual, e a tela de
-- Configurações quebra (.single() não encontra a linha).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.usuarios (id, nome)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'nome', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- =============================================================================
-- 3. TABELA: configuracoes_clinica
-- Nome e logo da clínica. Linha ÚNICA (singleton).
-- Usada em: Configuracoes.tsx, Sidebar.tsx
-- =============================================================================

create table public.configuracoes_clinica (
  id           uuid primary key default gen_random_uuid(),
  nome_clinica text,
  logo_url     text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- DECISÃO: o código lê com .limit(1).single() e insere se não existir
-- (Configuracoes.tsx:141-142). Este índice garante que nunca haja 2 linhas —
-- sem ele, um duplo clique cria uma segunda config e o .single() passa a
-- falhar. Remova se preferir suportar múltiplas clínicas no futuro.
create unique index configuracoes_clinica_singleton
  on public.configuracoes_clinica ((true));

create trigger configuracoes_clinica_updated_at
  before update on public.configuracoes_clinica
  for each row execute function public.set_updated_at();


-- =============================================================================
-- 4. TABELA: horario_comercial
-- Grade de horários de atendimento, uma linha por dia da semana.
-- Usada em: Configuracoes.tsx (edição), Dashboard.tsx (filtro ativo=true)
-- =============================================================================

create table public.horario_comercial (
  id          uuid primary key default gen_random_uuid(),
  dia_semana  smallint not null check (dia_semana between 0 and 6),
  hora_inicio time not null,
  hora_fim    time not null,
  ativo       boolean not null default true,
  unique (dia_semana)
);

-- DECISÃO: `unique (dia_semana)` porque o código procura o dia com
-- .find((d) => d.dia_semana === r.dia_semana) (Configuracoes.tsx:339) —
-- linhas duplicadas para o mesmo dia fariam a UI ignorar silenciosamente
-- todas menos a primeira.
-- ✅ VERIFICADO NO CÓDIGO: 0 = domingo ... 6 = sábado.
-- Dashboard.tsx:291-292 compara `dia_semana` direto com o getDay() do
-- JavaScript, e o DAY_NAMES de Configuracoes.tsx:32 começa em 'Domingo'.


-- =============================================================================
-- 5. TABELA: servicos_clinica
-- Catálogo de procedimentos oferecidos. É AQUI que entram os
-- procedimentos odontológicos no lugar dos de cirurgia plástica.
-- Usada em: Configuracoes.tsx
-- =============================================================================

create table public.servicos_clinica (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null,
  descricao  text not null default '',
  ativo      boolean not null default true,
  created_at timestamptz not null default now()
);

create index servicos_clinica_created_at_idx
  on public.servicos_clinica (created_at);
-- Ordenado por created_at em Configuracoes.tsx:441


-- =============================================================================
-- 6. CRM  ← NÚCLEO DO SISTEMA
-- Usada em: CRM.tsx, PessoasPage.tsx (/leads e /clientes), LeadDetail.tsx,
--           Dashboard.tsx
--
-- Estrutura em DUAS partes:
--   crm_clinica_dados -> tabela física, guarda os dados
--   crm_clinica       -> view que o app enxerga, com o cálculo automático
--                          de `minutos_ultima_mensagem` (ver adiante).
-- O app e a automação continuam usando o nome `crm_clinica` normalmente.
-- =============================================================================

create table public.crm_clinica_dados (
  id                        uuid primary key default gen_random_uuid(),

  -- Dados do paciente
  nome_lead                 text,
  whatsapp_lead             text,
  procedimento_interesse    text,
  data_nascimento           date,
  anotacoes                 text,

  -- Conversa / Agente de IA
  resumo_conversa           text,
  inicio_atendimento        timestamptz default now(),
  ultima_mensagem           timestamptz,
  -- `minutos_ultima_mensagem` NÃO fica aqui — é calculado na view (seção 6.1)

  -- Funil
  status                    text not null default 'iniciou_conversa'
    check (status in (
      'iniciou_conversa',
      'conversando',
      'consulta_agendada',
      'consulta_cancelada',
      'follow_up_1_feito',
      'follow_up_2_feito',
      'follow_up_3_feito',
      'consulta_realizada',
      'paciente_recorrente'
    )),
  follow_up_1               timestamptz,
  follow_up_2               timestamptz,
  follow_up_3               timestamptz,

  -- Agendamento
  data_agendamento          timestamptz,
  data_marcacao_agendamento timestamptz,
  id_agendamento            text,

  -- Integração Chatwoot (Agente de IA no WhatsApp)
  id_conta_chatwoot         text,
  id_conversa_chatwoot      text,
  id_lead_chatwoot          text,
  inbox_id_chatwoot         text,

  -- Financeiro
  valor_pago_acumulado      numeric(10,2) default 0,

  created_at                timestamptz not null default now()
);

-- DECISÃO (status): usei `text + CHECK` em vez de um ENUM nativo do Postgres.
-- Motivo: como vamos adaptar o funil para odontologia, mudar um CHECK é um
-- ALTER simples; alterar um ENUM em uso é bem mais trabalhoso.

-- DECISÃO (minutos_ultima_mensagem): calculado pelo banco, via VIEW.
-- Ver seção 6.1 logo abaixo.

-- DECISÃO (distinção de datas): `data_marcacao_agendamento` = QUANDO o lead
-- marcou; `data_agendamento` = QUANDO a consulta acontece. O Dashboard conta
-- "consultas agendadas" pela primeira (Dashboard.tsx:251) e lista as próximas
-- consultas pela segunda (Dashboard.tsx:313). Confirmar se bate com o
-- entendimento original.

-- Índices conforme os filtros e ordenações realmente usados no código
create index crm_clinica_created_at_idx  on public.crm_clinica_dados (created_at desc);
create index crm_clinica_status_idx      on public.crm_clinica_dados (status);
create index crm_clinica_inicio_idx      on public.crm_clinica_dados (inicio_atendimento);
create index crm_clinica_agendamento_idx on public.crm_clinica_dados (data_agendamento);
create index crm_clinica_whatsapp_idx    on public.crm_clinica_dados (whatsapp_lead);
create index crm_clinica_conversa_cw_idx on public.crm_clinica_dados (id_conversa_chatwoot);
-- O último é o mais importante para a automação: é por ele que o n8n/Chatwoot
-- encontra o lead da conversa que está chegando.


-- =============================================================================
-- 6.1. VIEW: crm_clinica  —  o cálculo automático dos minutos
--
-- É ESTE o objeto que o app e a automação acessam pelo nome `crm_clinica`.
-- Ele repassa todas as colunas da tabela e ACRESCENTA
-- `minutos_ultima_mensagem`, calculado na hora da leitura:
--     (agora - ultima_mensagem), convertido para minutos inteiros.
--
-- POR QUE UMA VIEW, E NÃO UMA COLUNA CALCULADA:
-- uma coluna GENERATED do Postgres só aceita funções imutáveis, e now() não é.
-- Numa coluna comum, o número congelaria no instante da gravação: um lead
-- parado há 3 horas continuaria exibindo "há 2 minutos" para sempre.
-- Com a view, o valor é recalculado a cada leitura e está SEMPRE correto,
-- sem job agendado e sem escrita periódica no banco.
--
-- ESCRITA CONTINUA FUNCIONANDO: a view é auto-atualizável pelo Postgres
-- (uma única tabela na origem, sem agregação), então os INSERT/UPDATE do app
-- e do n8n em `crm_clinica` seguem funcionando sem alterar uma linha de
-- código. Confirmado: o app nunca grava em `minutos_ultima_mensagem`,
-- apenas lê (Leads.tsx:130-137).
-- =============================================================================

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

-- `security_invoker = true` faz a view respeitar o RLS de quem consulta,
-- em vez de rodar com os privilégios do dono. Sem isso, a view seria um
-- buraco no RLS e exporia todos os leads a qualquer requisição.

grant select, insert, update, delete
  on public.crm_clinica
  to authenticated, service_role;


-- =============================================================================
-- 7. TABELA: consultas
-- Agendamentos vinculados a um lead.
-- Usada em: LeadDetail.tsx
-- =============================================================================

create table public.consultas (
  id            uuid primary key default gen_random_uuid(),
  lead_id       uuid not null references public.crm_clinica_dados(id) on delete cascade,
  procedimento  text not null,
  data_consulta timestamptz not null,
  status        text not null default 'agendada'
    check (status in ('agendada', 'realizada', 'cancelada')),
  valor_pago    numeric(10,2),
  observacoes   text,
  created_at    timestamptz not null default now()
);

create index consultas_lead_data_idx
  on public.consultas (lead_id, data_consulta desc);
-- Corresponde exatamente à query de LeadDetail.tsx:203

-- ✅ CONFIRMADO POR VOCÊ: `on delete cascade` — excluir um lead apaga junto
-- todas as consultas dele.


-- =============================================================================
-- 8. ROW LEVEL SECURITY
--
-- ✅ CONFIRMADO POR VOCÊ: sistema INTERNO, todo mundo vê tudo.
-- Qualquer usuário autenticado enxerga todos os leads, consultas e valores.
-- Ninguém sem login enxerga nada.
-- (Única exceção: cada um só edita o PRÓPRIO perfil em `usuarios`.)
-- =============================================================================

alter table public.usuarios              enable row level security;
alter table public.configuracoes_clinica enable row level security;
alter table public.horario_comercial     enable row level security;
alter table public.servicos_clinica      enable row level security;
alter table public.crm_clinica_dados   enable row level security;
alter table public.consultas             enable row level security;

-- usuarios: todos da equipe veem os perfis, mas cada um só edita o SEU.
create policy "usuarios_select" on public.usuarios
  for select to authenticated using (true);

create policy "usuarios_update_own" on public.usuarios
  for update to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);

-- Demais tabelas: acesso total para a equipe autenticada.
create policy "clinica_all" on public.configuracoes_clinica
  for all to authenticated using (true) with check (true);

create policy "horario_all" on public.horario_comercial
  for all to authenticated using (true) with check (true);

create policy "servicos_all" on public.servicos_clinica
  for all to authenticated using (true) with check (true);

create policy "leads_all" on public.crm_clinica_dados
  for all to authenticated using (true) with check (true);
-- A view `crm_clinica` herda esta política, graças ao security_invoker.

create policy "consultas_all" on public.consultas
  for all to authenticated using (true) with check (true);

-- ⚠️ ATENÇÃO — INTEGRAÇÃO COM O AGENTE DE IA:
-- As políticas acima liberam apenas o papel `authenticated`. O n8n/Chatwoot,
-- que grava os leads das conversas do WhatsApp, deve usar a chave
-- `service_role`, que ignora RLS por natureza. Se a automação tentar usar a
-- anon key, TODAS as gravações vão falhar silenciosamente.


-- =============================================================================
-- 9. STORAGE — buckets de imagens
-- Usados em: Configuracoes.tsx:117 (avatars) e :136 (logos)
-- =============================================================================

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true),
       ('logos',   'logos',   true)
on conflict (id) do nothing;

-- DECISÃO: buckets PÚBLICOS, porque o código usa getPublicUrl() nos dois
-- casos (Configuracoes.tsx:119 e :138). URLs privadas exigiriam signed URLs
-- e mudança no código.

-- Leitura pública (necessária para as imagens aparecerem na tela)
create policy "avatars_public_read" on storage.objects
  for select using (bucket_id = 'avatars');

create policy "logos_public_read" on storage.objects
  for select using (bucket_id = 'logos');

-- Avatar: cada usuário só grava na PRÓPRIA pasta.
-- O caminho no código é `${userId}/avatar.ext` (Configuracoes.tsx:116).
create policy "avatars_own_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatars_own_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
-- INSERT + UPDATE são ambos necessários por causa do { upsert: true }.

-- Logo da clínica: qualquer usuário da equipe pode trocar.
-- Caminho no código: `clinic/logo.ext` (Configuracoes.tsx:135).
create policy "logos_team_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'logos');

create policy "logos_team_update" on storage.objects
  for update to authenticated using (bucket_id = 'logos');


-- =============================================================================
-- 10. DADOS INICIAIS
-- =============================================================================

-- Nome da clínica (editável na tela Configurações → Perfil)
insert into public.configuracoes_clinica (nome_clinica)
values ('Odonto Clinica');

-- Horário comercial: seg–sex 08:00–18:00, sábado 08:00–12:00, domingo fechado.
-- ⚠️ VALORES PADRÃO — não foram confirmados por você. São totalmente editáveis
-- na tela Configurações → Horários. Importam para o Dashboard, que classifica
-- os contatos em "dentro" e "fora do horário".
insert into public.horario_comercial (dia_semana, hora_inicio, hora_fim, ativo) values
  (0, '08:00', '12:00', false),  -- domingo  (desativado)
  (1, '08:00', '18:00', true),   -- segunda
  (2, '08:00', '18:00', true),   -- terça
  (3, '08:00', '18:00', true),   -- quarta
  (4, '08:00', '18:00', true),   -- quinta
  (5, '08:00', '18:00', true),   -- sexta
  (6, '08:00', '12:00', true);   -- sábado

-- ✅ Procedimentos informados por você.
-- Novos podem ser cadastrados na tela Configurações → Procedimentos.
-- ⚠️ Sem nomes de marca registrada (ClearCorrect, Invisalign e similares).
-- Usar sempre a descrição genérica do procedimento.
insert into public.servicos_clinica (nome, descricao, ativo) values
  ('Lentes de Contato',         '',                             true),
  ('Prótese Dentária',          '',                             true),
  ('Alinhadores Transparentes', 'Ortodontia sem aparelho fixo',  true);


-- =============================================================================
-- 11. REALTIME
--
-- O CRM e a tela de detalhe assinam `postgres_changes` para atualizar a tela
-- sozinhos quando o Agente de IA mexe num lead. Sem o comando abaixo, o
-- Postgres não emite evento nenhum e a atualização automática simplesmente
-- não acontece — sem erro, sem aviso.
--
-- ⚠️ PUBLIQUE A TABELA, NUNCA A VIEW.
-- Replicação lógica do Postgres só funciona com tabelas. Assinar `crm_clinica`
-- (a view) cria a inscrição sem erro, mas ela nunca dispara. No código, as
-- assinaturas usam `table: 'crm_clinica_dados'` justamente por isso —
-- veja CRM.tsx e LeadDetail.tsx.
-- =============================================================================

alter publication supabase_realtime add table public.crm_clinica_dados;

-- REPLICA IDENTITY fica no padrão (chave primária). É o bastante: os eventos
-- de UPDATE trazem a linha nova completa, e os de DELETE trazem o `id` — que é
-- tudo que o código usa. `FULL` só seria necessário para ler valores antigos de
-- colunas que não são a PK.
