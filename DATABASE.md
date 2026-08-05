# Banco de Dados — Sistema de Gestão para Clínica

Documentação completa do schema. Serve para quem baixar este sistema e precisar
**reconstruir o banco do zero** num projeto Supabase novo.

> Este documento foi gerado a partir da inspeção do banco em produção
> (`information_schema`, `pg_constraint`, `pg_policies`, `pg_indexes`), não de
> memória. Tudo aqui é o que existe de fato.

- **Banco:** PostgreSQL 17.6 (Supabase)
- **Migração completa:** [`supabase/migrations/0001_schema_inicial.sql`](supabase/migrations/0001_schema_inicial.sql)
- **Tipos TypeScript espelhando o schema:** [`src/types/index.ts`](src/types/index.ts)

---

## 1. Setup rápido

Para colocar um projeto novo no ar, na ordem:

### 1.1. Criar o projeto Supabase

Crie um projeto novo em [supabase.com](https://supabase.com). Anote o **project ref**
(o identificador na URL, ex.: `xngzwqvhrjyekanpvxzi`).

### 1.2. Rodar a migração

Abra o **SQL Editor** no painel do Supabase, cole todo o conteúdo de
`supabase/migrations/0001_schema_inicial.sql` e execute.

Isso cria: 6 tabelas, 1 view, 8 índices, 13 políticas de RLS, 2 buckets de
Storage, 2 funções, 2 triggers e os dados iniciais.

### 1.3. Configurar as variáveis de ambiente

Crie um arquivo `.env` na raiz do projeto:

```env
VITE_SUPABASE_URL=https://SEU_REF.supabase.co
VITE_SUPABASE_ANON_KEY=sua_anon_key_aqui
```

Ambos estão em **Settings → API Keys** no painel do Supabase.

> A `anon key` é pública por natureza — ela vai embutida no bundle do frontend e
> é protegida pelo RLS. A `service_role key` **nunca** entra no `.env` deste
> projeto: ela ignora todo o RLS e só deve viver no backend da automação.

O `.env` já está no `.gitignore`. Não o comite.

### 1.4. Criar o primeiro usuário

Sem isso, a tela de login não deixa ninguém entrar.

No painel: **Authentication → Users → Add user**. Informe e-mail e senha e
marque *Auto Confirm User* (senão o Supabase exige confirmação por e-mail).

O perfil em `public.usuarios` é criado **automaticamente** pelo trigger
`on_auth_user_created`. Não crie a linha na mão.

### 1.5. Subir a aplicação

```bash
npm install
npm run dev
```

---

## 2. Visão geral

```mermaid
erDiagram
    auth_users ||--|| usuarios : "id (mesmo UUID)"
    crm_clinica_dados ||--o{ consultas : "lead_id"
    crm_clinica_dados ||--|| crm_clinica : "view calculada"

    usuarios {
        uuid id PK_FK
        text nome
        text avatar_url
    }
    crm_clinica_dados {
        uuid id PK
        text nome_lead
        text status
        timestamptz ultima_mensagem
    }
    crm_clinica {
        int minutos_ultima_mensagem "calculado"
    }
    consultas {
        uuid id PK
        uuid lead_id FK
        timestamptz data_consulta
        numeric valor_pago
    }
    configuracoes_clinica {
        uuid id PK
        text nome_clinica
        text logo_url
    }
    horario_comercial {
        uuid id PK
        smallint dia_semana UK
    }
    servicos_clinica {
        uuid id PK
        text nome
        boolean ativo
    }
```

| Objeto | Tipo | Papel |
|---|---|---|
| `crm_clinica_dados` | tabela | Núcleo — dados dos leads/pacientes |
| `crm_clinica` | **view** | O que a aplicação lê e escreve (ver seção 3) |
| `consultas` | tabela | Agendamentos vinculados a um lead |
| `usuarios` | tabela | Perfil da equipe, espelha `auth.users` |
| `configuracoes_clinica` | tabela | Nome e logo da clínica (linha única) |
| `horario_comercial` | tabela | Grade de atendimento, 1 linha por dia |
| `servicos_clinica` | tabela | Catálogo de procedimentos |

---

## 3. A decisão de arquitetura mais importante

**`crm_clinica` não é uma tabela. É uma view.**

Quem for mexer neste banco precisa entender isso antes de qualquer outra coisa.

```
crm_clinica_dados   →   tabela física (guarda os dados)
        ↓
crm_clinica         →   view que a aplicação usa
                          = todas as colunas da tabela
                          + minutos_ultima_mensagem (calculado na leitura)
```

### Por quê

A interface mostra "última interação há X minutos" nos cards do CRM. Esse número
precisa estar **sempre atualizado**.

Numa coluna comum, ele congelaria no instante da gravação: um lead parado há 3
horas continuaria exibindo "há 2 minutos" para sempre, porque ninguém reescreveu
a linha nesse meio-tempo.

E não pode ser uma coluna `GENERATED` do Postgres, porque essas só aceitam
funções imutáveis — e `now()` não é.

A view resolve os dois problemas: o valor é recalculado **a cada leitura**, sem
job agendado e sem escrita periódica no banco.

### Definição

```sql
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
```

### O que isso significa na prática

- **Escrita funciona normalmente.** A view é auto-atualizável pelo Postgres
  (origem única, sem agregação), então `INSERT`, `UPDATE` e `DELETE` em
  `crm_clinica` funcionam igual a uma tabela. A aplicação e a automação não
  precisam saber que é uma view.
- **Nunca escreva em `minutos_ultima_mensagem`.** É coluna calculada; gravar
  nela causa erro.
- **`security_invoker = true` é obrigatório.** Sem esse parâmetro, views no
  Postgres rodam com os privilégios do dono e **furam o RLS**, expondo todos os
  leads a qualquer requisição. Se recriar a view, mantenha isso.
- **A foreign key de `consultas` aponta para a tabela**
  (`crm_clinica_dados`), não para a view — FKs não podem referenciar views.

---

## 4. Referência das tabelas

### 4.1. `crm_clinica_dados` / `crm_clinica`

O coração do sistema. Cada linha é um lead que conversou com o Agente de IA no
WhatsApp, ou um paciente cadastrado manualmente.

**Usada em:** `CRM.tsx`, `PessoasPage.tsx` (rotas `/leads` e `/clientes`),
`LeadDetail.tsx`, `Dashboard.tsx`

| Coluna | Tipo | Nulo | Default | Observação |
|---|---|:---:|---|---|
| `id` | `uuid` | não | `gen_random_uuid()` | PK |
| **Dados do paciente** ||||
| `nome_lead` | `text` | sim | — | |
| `whatsapp_lead` | `text` | sim | — | Indexado |
| `procedimento_interesse` | `text` | sim | — | Texto livre |
| `data_nascimento` | `date` | sim | — | Só a data, sem hora |
| `anotacoes` | `text` | sim | — | Campo livre da equipe |
| **Conversa / Agente de IA** ||||
| `resumo_conversa` | `text` | sim | — | Preenchido pela IA |
| `inicio_atendimento` | `timestamptz` | sim | `now()` | Base do "Novos Contatos" |
| `ultima_mensagem` | `timestamptz` | sim | — | Momento da última interação |
| `minutos_ultima_mensagem` | `integer` | sim | *calculado* | **Só na view.** Somente leitura |
| **Funil** ||||
| `status` | `text` | **não** | `'iniciou_conversa'` | `CHECK` — ver seção 5 |
| `follow_up_1` | `timestamptz` | sim | — | Quando o follow-up 1 foi enviado |
| `follow_up_2` | `timestamptz` | sim | — | |
| `follow_up_3` | `timestamptz` | sim | — | |
| **Agendamento** ||||
| `data_agendamento` | `timestamptz` | sim | — | **Quando a consulta acontece** |
| `data_marcacao_agendamento` | `timestamptz` | sim | — | **Quando o lead marcou** |
| `id_agendamento` | `text` | sim | — | ID no sistema de agenda externo |
| **Integração Chatwoot** ||||
| `id_conta_chatwoot` | `text` | sim | — | |
| `id_conversa_chatwoot` | `text` | sim | — | Indexado — chave da automação |
| `id_lead_chatwoot` | `text` | sim | — | |
| `inbox_id_chatwoot` | `text` | sim | — | |
| **Financeiro** ||||
| `valor_pago_acumulado` | `numeric(10,2)` | sim | `0` | Total já pago pelo paciente |
| `created_at` | `timestamptz` | não | `now()` | |

> **Cuidado com as duas datas de agendamento.** Elas são diferentes e o
> Dashboard usa cada uma para uma coisa:
> `data_marcacao_agendamento` conta quantas consultas foram *marcadas* no
> período; `data_agendamento` lista as *próximas consultas*. Trocar uma pela
> outra quebra as métricas em silêncio.

**Índices:**

| Índice | Coluna | Para quê |
|---|---|---|
| `crm_clinica_conversa_cw_idx` | `id_conversa_chatwoot` | **Crítico para a automação** — é por aqui que o n8n encontra o lead da conversa que chegou |
| `crm_clinica_created_at_idx` | `created_at DESC` | Listagem em `Leads.tsx` |
| `crm_clinica_status_idx` | `status` | Colunas do Kanban |
| `crm_clinica_inicio_idx` | `inicio_atendimento` | Métricas do Dashboard |
| `crm_clinica_agendamento_idx` | `data_agendamento` | Próximas consultas |
| `crm_clinica_whatsapp_idx` | `whatsapp_lead` | Busca por telefone |

---

### 4.2. `consultas`

Agendamentos de um lead. Um lead tem N consultas.

**Usada em:** `LeadDetail.tsx`

| Coluna | Tipo | Nulo | Default | Observação |
|---|---|:---:|---|---|
| `id` | `uuid` | não | `gen_random_uuid()` | PK |
| `lead_id` | `uuid` | **não** | — | FK → `crm_clinica_dados(id)` **ON DELETE CASCADE** |
| `procedimento` | `text` | não | — | |
| `data_consulta` | `timestamptz` | não | — | |
| `status` | `text` | não | `'agendada'` | `agendada` \| `realizada` \| `cancelada` |
| `valor_pago` | `numeric(10,2)` | sim | — | |
| `observacoes` | `text` | sim | — | |
| `created_at` | `timestamptz` | não | `now()` | |

**Índice:** `consultas_lead_data_idx` em `(lead_id, data_consulta DESC)`.

> **`ON DELETE CASCADE`:** excluir um lead apaga **todas** as consultas dele,
> incluindo o histórico financeiro. Foi uma decisão consciente. Se o seu caso
> exigir preservar histórico, troque para `ON DELETE RESTRICT`.

---

### 4.3. `usuarios`

Perfil da equipe. **Espelha `auth.users`** — a PK é o mesmo UUID.

**Usada em:** `Configuracoes.tsx`, `Sidebar.tsx`

| Coluna | Tipo | Nulo | Default | Observação |
|---|---|:---:|---|---|
| `id` | `uuid` | não | — | PK **e** FK → `auth.users(id)` ON DELETE CASCADE |
| `nome` | `text` | não | `''` | |
| `avatar_url` | `text` | sim | — | URL pública no bucket `avatars` |
| `created_at` | `timestamptz` | não | `now()` | |

**A linha é criada automaticamente.** O trigger `on_auth_user_created` em
`auth.users` chama `public.handle_new_user()`, que insere o perfil. Sem ele,
todo usuário novo derrubaria a tela de Configurações — o código usa `.single()`,
que falha quando não encontra a linha.

```sql
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.usuarios (id, nome)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'nome', ''));
  return new;
end;
$$;
```

---

### 4.4. `configuracoes_clinica`

Nome e logo da clínica. **Tem no máximo uma linha.**

**Usada em:** `Configuracoes.tsx`, `Sidebar.tsx`

| Coluna | Tipo | Nulo | Default |
|---|---|:---:|---|
| `id` | `uuid` | não | `gen_random_uuid()` |
| `nome_clinica` | `text` | sim | — |
| `logo_url` | `text` | sim | — |
| `created_at` | `timestamptz` | não | `now()` |
| `updated_at` | `timestamptz` | não | `now()` |

A unicidade é garantida por um índice sobre uma expressão constante:

```sql
create unique index configuracoes_clinica_singleton
  on public.configuracoes_clinica ((true));
```

Sem ele, um duplo clique no upload de logo criaria uma segunda linha e o
`.limit(1).single()` do código passaria a falhar.

`updated_at` é mantido pelo trigger `configuracoes_clinica_updated_at`.

---

### 4.5. `horario_comercial`

Grade de atendimento — **uma linha por dia da semana**.

**Usada em:** `Configuracoes.tsx` (edição), `Dashboard.tsx` (só os ativos)

| Coluna | Tipo | Nulo | Default | Observação |
|---|---|:---:|---|---|
| `id` | `uuid` | não | `gen_random_uuid()` | PK |
| `dia_semana` | `smallint` | não | — | **UNIQUE**, `CHECK (0..6)` |
| `hora_inicio` | `time` | não | — | Sem fuso |
| `hora_fim` | `time` | não | — | |
| `ativo` | `boolean` | não | `true` | Dia fechado = `false` |

> **`dia_semana`: 0 = domingo … 6 = sábado.** Segue o `getDay()` do JavaScript,
> porque o código compara os dois valores diretamente.

O `UNIQUE (dia_semana)` importa: a interface localiza o dia com um `find()`, e
linhas duplicadas fariam todas menos a primeira serem ignoradas em silêncio.

---

### 4.6. `servicos_clinica`

Catálogo de procedimentos oferecidos.

**Usada em:** `Configuracoes.tsx`

| Coluna | Tipo | Nulo | Default |
|---|---|:---:|---|
| `id` | `uuid` | não | `gen_random_uuid()` |
| `nome` | `text` | não | — |
| `descricao` | `text` | não | `''` |
| `ativo` | `boolean` | não | `true` |
| `created_at` | `timestamptz` | não | `now()` |

**Índice:** `servicos_clinica_created_at_idx` — a listagem ordena por cadastro.

> **Não cadastre marcas registradas** (ClearCorrect, Invisalign e similares).
> Use a descrição genérica do procedimento: "Alinhadores Transparentes".
> Isso vale também para os prompts do Agente de IA, que fala com o público.

---

## 5. Status do funil

`crm_clinica_dados.status` aceita exatamente estes 9 valores, garantidos por
`CHECK`:

| Valor | Significado |
|---|---|
| `iniciou_conversa` | Lead chegou, ainda sem interação real *(default)* |
| `conversando` | Conversa em andamento com o agente |
| `consulta_agendada` | Consulta marcada |
| `consulta_cancelada` | Consulta cancelada |
| `follow_up_1_feito` | Primeira retomada enviada |
| `follow_up_2_feito` | Segunda retomada |
| `follow_up_3_feito` | Terceira retomada |
| `consulta_realizada` | Compareceu |
| `paciente_recorrente` | Voltou mais de uma vez |

> **Estes dois últimos status separam as telas `/leads` e `/clientes`.** Quem
> está em `consulta_realizada` ou `paciente_recorrente` aparece em Clientes;
> todo o resto aparece em Leads. A regra fica em `src/lib/pessoas.ts` — ao
> adicionar um status novo, decida a qual dos dois lados ele pertence.

`consultas.status` aceita: `agendada`, `realizada`, `cancelada`.

> **Ao alterar qualquer um destes valores, mude nos dois lugares:** o `CHECK` no
> banco **e** os tipos `LeadStatus` / `ConsultaStatus` em
> [`src/types/index.ts`](src/types/index.ts). Eles não são sincronizados
> automaticamente — se divergirem, o TypeScript compila e o banco rejeita a
> gravação em runtime.
>
> Foi usado `text + CHECK` em vez de `ENUM` nativo justamente para isso: alterar
> um `CHECK` é um `ALTER` simples; alterar um `ENUM` em uso é bem mais penoso.

---

## 6. Segurança (RLS)

**Premissa: sistema interno.** Todo usuário autenticado é da equipe e enxerga
tudo. Quem não estiver logado não enxerga nada.

RLS está **ativo nas 6 tabelas**. São 13 políticas:

| Tabela | Política | Operação | Regra |
|---|---|---|---|
| `crm_clinica_dados` | `leads_all` | ALL | `authenticated` — acesso total |
| `consultas` | `consultas_all` | ALL | `authenticated` — acesso total |
| `configuracoes_clinica` | `clinica_all` | ALL | `authenticated` — acesso total |
| `horario_comercial` | `horario_all` | ALL | `authenticated` — acesso total |
| `servicos_clinica` | `servicos_all` | ALL | `authenticated` — acesso total |
| `usuarios` | `usuarios_select` | SELECT | `authenticated` — vê todos os perfis |
| `usuarios` | `usuarios_update_own` | UPDATE | **só o próprio** (`auth.uid() = id`) |

Mais 6 políticas em `storage.objects` (seção 7).

A view `crm_clinica` não tem políticas próprias: ela **herda** o RLS de
`crm_clinica_dados` por causa do `security_invoker = true`.

### Se precisar de níveis de acesso

O modelo atual não distingue papéis. Se a clínica precisar que a recepção não
veja valores financeiros, por exemplo, será preciso adicionar uma coluna de
papel em `usuarios` e reescrever as políticas — **mais fácil decidir isso antes
de ter dados** do que depois.

---

## 7. Storage

Dois buckets **públicos**, porque o código usa `getPublicUrl()` nos dois casos.

| Bucket | Caminho | Conteúdo |
|---|---|---|
| `avatars` | `{user_id}/avatar.{ext}` | Foto de perfil |
| `logos` | `clinic/logo.{ext}` | Logo da clínica |

| Política | Bucket | Operação | Regra |
|---|---|---|---|
| `avatars_public_read` | avatars | SELECT | público |
| `avatars_own_insert` | avatars | INSERT | só na própria pasta (`auth.uid()`) |
| `avatars_own_update` | avatars | UPDATE | só na própria pasta |
| `logos_public_read` | logos | SELECT | público |
| `logos_team_insert` | logos | INSERT | qualquer autenticado |
| `logos_team_update` | logos | UPDATE | qualquer autenticado |

> INSERT **e** UPDATE são necessários nos dois buckets porque o upload usa
> `{ upsert: true }`. Só com INSERT, a segunda troca de foto falha.

---

## 8. Integração com o Agente de IA

O sistema pressupõe um agente conversando no WhatsApp via **Chatwoot**, com
orquestração em **n8n**, gravando direto neste banco.

### A automação precisa usar a `service_role key`

As políticas de RLS liberam apenas o papel `authenticated` — ou seja, sessões de
usuário logado. **A automação não tem sessão.**

Se o n8n tentar usar a `anon key`, as gravações **falham em silêncio**: o
PostgREST devolve `200 OK` com zero linhas afetadas, e nenhum lead aparece no
sistema. É o erro mais provável de quem estiver montando essa integração.

Use a `service_role key`, que ignora o RLS por natureza. Ela **nunca** pode ir
para o frontend.

### Fluxo típico

1. Mensagem chega no Chatwoot → webhook para o n8n
2. n8n busca o lead por `id_conversa_chatwoot` *(indexado)*
3. Se não existe, insere em `crm_clinica` com os `id_*_chatwoot` preenchidos
4. A cada mensagem, atualiza `ultima_mensagem = now()` e `resumo_conversa`
5. Ao agendar, grava `data_agendamento`, `data_marcacao_agendamento`,
   `id_agendamento` e muda `status` para `consulta_agendada`
6. Nos follow-ups, carimba `follow_up_1/2/3` e ajusta o `status`

> **`minutos_ultima_mensagem` não precisa de escrita.** Basta manter
> `ultima_mensagem` em dia — a view calcula o resto sozinha.

---

## 8.5. Realtime — atualização automática da tela

O CRM e a tela de detalhe assinam `postgres_changes` para reagir sozinhos
quando o Agente de IA mexe num lead: o card anda de coluna no Kanban sem
ninguém apertar F5.

Para isso funcionar, a tabela precisa estar publicada:

```sql
alter publication supabase_realtime add table public.crm_clinica_dados;
```

### ⚠️ Publique a TABELA, nunca a VIEW

A replicação lógica do Postgres **só funciona com tabelas**. Assinar
`crm_clinica` (a view) não dá erro — a inscrição é criada normalmente e
simplesmente **nunca dispara**. É uma falha silenciosa clássica.

Por isso existe uma assimetria proposital no código:

| Operação | Objeto usado |
|---|---|
| `select` / `insert` / `update` / `delete` | `crm_clinica` (a **view**) |
| Assinatura de Realtime | `crm_clinica_dados` (a **tabela**) |

Ver [`CRM.tsx`](src/pages/CRM.tsx) e [`LeadDetail.tsx`](src/pages/LeadDetail.tsx).

### Consequência para o payload

Eventos de Realtime vêm da tabela física, então **não trazem**
`minutos_ultima_mensagem` — a coluna existe só na view. Os dois handlers fazem
merge (`{ ...anterior, ...payload.new }`), então o valor já carregado é
preservado e só fica defasado até o próximo carregamento. Para um contador em
minutos, é aceitável.

### REPLICA IDENTITY

Fica no padrão (chave primária), e é suficiente: `UPDATE` traz a linha nova
inteira e `DELETE` traz o `id`, que é tudo que o código usa. `FULL` só seria
necessário para ler valores antigos de colunas fora da PK.

### Verificar

```sql
select schemaname, tablename from pg_publication_tables
where pubname = 'supabase_realtime';
-- esperado: public | crm_clinica_dados
```

Se essa consulta voltar vazia, o Realtime está morto — e nada na interface vai
indicar isso.

---

## 9. Armadilhas conhecidas

Lista do que quebra este banco de formas não óbvias:

1. **Recriar a view sem `security_invoker = true`** → o RLS deixa de valer e
   todos os leads ficam expostos publicamente.
2. **Assinar Realtime na view `crm_clinica`** → a inscrição é criada sem erro e
   nunca dispara. Assine sempre `crm_clinica_dados` (seção 8.5).
2. **Tentar escrever em `minutos_ultima_mensagem`** → erro; é coluna calculada.
3. **Automação usando a `anon key`** → gravações falham sem erro visível.
4. **Alterar o `CHECK` de `status` sem atualizar `src/types/index.ts`**
   (ou o contrário) → compila e quebra só em runtime.
5. **Criar a linha em `usuarios` na mão** → conflito com o trigger.
6. **Inserir duas linhas em `configuracoes_clinica`** → bloqueado pelo índice
   singleton; o código não trata esse erro.
7. **Duplicar `dia_semana` em `horario_comercial`** → bloqueado pelo UNIQUE.
8. **Confundir `data_agendamento` com `data_marcacao_agendamento`** → métricas
   do Dashboard erradas, sem nenhum sinal de erro.
9. **Excluir um lead** → apaga em cascata todas as consultas e o histórico
   financeiro dele.

---

## 10. Consultas úteis para verificação

Depois de rodar a migração, confira se está tudo de pé:

```sql
-- Objetos criados (esperado: 6 tabelas + 1 view)
select table_name, table_type from information_schema.tables
where table_schema = 'public' order by table_name;

-- RLS ativo em todas as tabelas (esperado: 6 linhas, todas true)
select relname, relrowsecurity from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' order by relname;

-- Políticas (esperado: 13)
select schemaname, tablename, policyname, cmd from pg_policies
where schemaname in ('public','storage') order by tablename, policyname;

-- A view respeita o RLS? (esperado: security_invoker=true)
select c.relname, c.reloptions from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'v';

-- O cálculo dos minutos funciona? (esperado: 95)
select floor(extract(epoch from (now() - (now() - interval '95 minutes'))) / 60)::integer;
```

Para testar o RLS de verdade, faça uma requisição com a `anon key` sem estar
logado — ela deve devolver lista vazia mesmo havendo dados:

```bash
curl "https://SEU_REF.supabase.co/rest/v1/crm_clinica?select=nome_lead" \
  -H "apikey: SUA_ANON_KEY"
# esperado: []
```
