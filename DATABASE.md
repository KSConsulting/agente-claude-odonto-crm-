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

Crie um projeto novo em [supabase.com](https://supabase.com). Anote o **project
ref** — o identificador que aparece na URL do painel, no formato
`abcdefghijklmnopqrst` (20 letras).

### 1.2. Rodar as migrações

Abra o **SQL Editor** no painel do Supabase e execute os dois arquivos, **nesta
ordem**:

1. `supabase/migrations/0001_schema_inicial.sql` — 6 tabelas, 1 view, 9 índices,
   13 políticas de RLS, 2 buckets de Storage, 2 funções, 2 triggers, a
   publicação de Realtime e os dados iniciais.
2. `supabase/migrations/0002_agenda_profissionais.sql` — agenda e profissionais:
   3 tabelas, 8 colunas novas em `consultas`, a restrição que impede
   agendamento duplo, 3 políticas de RLS, 2 funções, 3 triggers e o fuso horário
   da clínica.
3. `supabase/migrations/0003_whatsapp_unico.sql` — WhatsApp normalizado e único:
   1 função, 1 trigger e o índice que impede duas pessoas com o mesmo número.
4. `supabase/migrations/0004_api_agente.sql` — API do Agente de IA: a tabela
   `api_tokens` e as 7 funções que a Edge Function chama.
5. `supabase/migrations/0005_catalogo_procedimentos.sql` — os 20 procedimentos
   da clínica, no lugar dos 3 de exemplo do seed inicial. Só dados.

A ordem importa: cada arquivo depende do anterior. Rodar fora de ordem falha.

Confira o resultado com as consultas da [seção 10](#10-consultas-úteis-para-verificação).

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
    profissionais ||--o{ consultas : "profissional_id"
    profissionais ||--o{ profissional_horarios : "jornada"
    profissionais ||--o{ profissional_bloqueios : "indisponibilidade"

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
        uuid profissional_id FK
        timestamptz data_consulta
        int duracao_minutos
        numeric valor_pago
    }
    profissionais {
        uuid id PK
        text nome
        text cor
        boolean ativo
    }
    profissional_horarios {
        uuid id PK
        uuid profissional_id FK
        smallint dia_semana
    }
    profissional_bloqueios {
        uuid id PK
        uuid profissional_id FK "nulo = clínica toda"
        timestamptz inicio
        timestamptz fim
    }
    configuracoes_clinica {
        uuid id PK
        text nome_clinica
        text fuso_horario
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
| `consultas` | tabela | Agendamentos — lead + profissional + horário |
| `profissionais` | tabela | Dentistas. **A agenda de cada um são as consultas dele** |
| `profissional_horarios` | tabela | Jornada, 1 linha por dia da semana |
| `profissional_bloqueios` | tabela | Férias, feriado, almoço |
| `usuarios` | tabela | Perfil da equipe, espelha `auth.users` |
| `configuracoes_clinica` | tabela | Nome, logo e fuso da clínica (linha única) |
| `horario_comercial` | tabela | Grade de atendimento, 1 linha por dia |
| `servicos_clinica` | tabela | Catálogo de procedimentos |

> **Não existe tabela `agendas`, e isso é proposital.** A agenda de um
> profissional é o conjunto de consultas com o `profissional_id` dele. Cadastrar
> o profissional já cria a agenda; não há como as duas coisas divergirem, nem
> estado intermediário para consertar.

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
| `whatsapp_lead` | `text` | sim | — | **ÚNICO.** Só dígitos com DDI — ver abaixo |
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

#### ⚠️ `whatsapp_lead`: formato canônico e unicidade

O número é gravado **só com dígitos, incluindo o código do país, sem `+`,
espaço ou traço**: `5511987654321`. É o formato que o n8n já usava ao abrir o
lead da conversa; a partir da migração `0003` o sistema grava igual.

Duas peças garantem isso, ambas no banco:

| Peça | O que faz |
|---|---|
| `crm_clinica_normaliza_whatsapp` (trigger BEFORE) | Remove qualquer pontuação antes de gravar. Protege de colar `+55 11 98765-4321` no campo |
| `crm_clinica_whatsapp_unico` (índice único parcial) | Uma pessoa, um número. Ignora nulos, então vários contatos sem telefone convivem |

**O formato importa tanto quanto a unicidade.** Se a tela gravasse
`+55 (11) 98765-4321` e o agente `5511987654321`, seriam dois textos diferentes
para o mesmo telefone: o índice deixaria os dois entrarem, a busca do
agendamento não acharia o contato criado pelo agente, e a recepção cadastraria a
pessoa de novo — o mesmo bug, por outro caminho.

O trigger **não inventa código de país**. Um número sem DDI continua sem DDI:
adivinhar o país pelo tamanho acertaria no Brasil e erraria em silêncio no resto.
Quem garante o DDI é quem escreve — a tela, pelo seletor de país
([`src/lib/telefones.ts`](src/lib/telefones.ts)), e o n8n, que já manda inteiro.

Violação devolve **`23505`**. As telas traduzem para "esse número já é de
Fulano" e oferecem abrir ou usar o contato existente.

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
| `crm_clinica_whatsapp_unico` | `whatsapp_lead` parcial | **Impede duas pessoas com o mesmo número** e atende a busca por telefone |

---

### 4.2. `consultas`

Agendamentos. Um lead tem N consultas; um profissional tem N consultas — e é
esse segundo vínculo que forma a agenda dele.

**Usada em:** `Agenda.tsx`, `NovoAgendamentoModal.tsx`, `LeadDetail.tsx`

| Coluna | Tipo | Nulo | Default | Observação |
|---|---|:---:|---|---|
| `id` | `uuid` | não | `gen_random_uuid()` | PK |
| `lead_id` | `uuid` | **não** | — | FK → `crm_clinica_dados(id)` **ON DELETE CASCADE** |
| `profissional_id` | `uuid` | sim | — | FK → `profissionais(id)` **ON DELETE RESTRICT** |
| `procedimento` | `text` | não | — | Texto livre |
| `data_consulta` | `timestamptz` | não | — | Quando começa |
| `duracao_minutos` | `integer` | não | `60` | `CHECK` 1..600 |
| `data_fim` | `timestamptz` | não | *trigger* | **Derivada.** Nunca grave nela |
| `status` | `text` | não | `'agendada'` | `agendada` \| `realizada` \| `cancelada` |
| `origem` | `text` | não | `'equipe'` | `equipe` \| `agente_ia` |
| `chave_externa` | `text` | sim | — | Idempotência da API. **UNIQUE** quando preenchida |
| `valor_pago` | `numeric(10,2)` | sim | — | |
| `observacoes` | `text` | sim | — | |
| `cancelado_em` | `timestamptz` | sim | — | |
| `motivo_cancelamento` | `text` | sim | — | |
| `created_at` | `timestamptz` | não | `now()` | |
| `updated_at` | `timestamptz` | não | `now()` | Trigger `consultas_updated_at` |

**Índices:**

| Índice | Colunas | Para quê |
|---|---|---|
| `consultas_lead_data_idx` | `(lead_id, data_consulta DESC)` | Histórico na ficha do paciente |
| `consultas_profissional_data_idx` | `(profissional_id, data_consulta)` | Agenda de um profissional num período |
| `consultas_data_idx` | `(data_consulta)` | Agenda sem filtro de profissional |
| `consultas_chave_externa_idx` | `(chave_externa)` parcial | Idempotência — impede consulta duplicada em retry |

#### ⚠️ `consultas_sem_sobreposicao` — a restrição que impede agendamento duplo

```sql
exclude using gist (
  profissional_id with =,
  tstzrange(data_consulta, data_fim) with &&
) where (status = 'agendada' and profissional_id is not null)
```

Um profissional não pode ter duas consultas **ativas** se sobrepondo. Vale só
para `status = 'agendada'`: cancelada libera o horário, realizada é passado.

#### Por que `data_fim` existe como coluna

O caminho óbvio seria calcular o fim dentro da própria restrição, com
`data_consulta + make_interval(mins => duracao_minutos)`. O PostgreSQL recusa:

```
42P17 -> functions in index expression must be marked IMMUTABLE
```

Não é o `make_interval` — esse é imutável. O problema é o operador
`timestamptz + interval`, que é apenas **STABLE**: um `interval` pode conter dias
e meses, e somar dias a um `timestamptz` depende do fuso e do horário de verão.
Aqui o intervalo é sempre em minutos, o que seria exato, mas o planejador não
tem como saber disso.

Por isso o fim é materializado em `data_fim`, mantido pelo trigger
**`consultas_data_fim`** (BEFORE INSERT/UPDATE — precisa estar preenchido antes
da checagem da restrição, que acontece depois dos triggers BEFORE). A restrição
compara duas colunas, o que é imutável por definição.

Coluna `GENERATED` não resolveria: sofre da mesma exigência de imutabilidade.

> **Isto foi descoberto aplicando a migração no banco real**, não lendo o SQL. É
> o tipo de erro que só aparece na execução.

Está no banco, e não no código, porque a recepção e o Agente de IA escrevem pelo
mesmo caminho ao mesmo tempo. Verificar em JavaScript ("já tem algo nesse
horário?") e depois inserir deixa uma janela entre a leitura e a escrita — e o
resultado é dois pacientes na mesma cadeira. É intermitente e ninguém reproduz.

Quem violar recebe **`23P01` (`exclusion_violation`)**. A interface já traduz
isso ("Esse horário acabou de ser ocupado"); a API deve devolver **409** e nunca
repetir a chamada — repetir dá o mesmo erro.

Exige a extensão `btree_gist` (criada pela migração).

> **`ON DELETE CASCADE` do lead:** excluir um lead apaga **todas** as consultas
> dele, incluindo o histórico financeiro. Decisão consciente.
>
> **`ON DELETE RESTRICT` do profissional:** o oposto — o banco **impede** apagar
> um profissional que tenha consultas. A tela oferece desativar (`ativo = false`),
> que tira da agenda sem destruir histórico.

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
| `fuso_horario` | `text` | não | `'America/Sao_Paulo'` |
| `created_at` | `timestamptz` | não | `now()` |
| `updated_at` | `timestamptz` | não | `now()` |

> **`fuso_horario` não é enfeite.** `profissional_horarios` guarda `time` sem
> fuso e `consultas.data_consulta` é `timestamptz`; cruzar os dois exige saber em
> que fuso "08:00" foi escrito. O servidor do Supabase roda em UTC — sem fixar
> isto, o cálculo de disponibilidade da API erra em 3 horas e o Agente de IA
> passa a oferecer consulta de madrugada. Fica no banco, e não no código, para
> mudar sem novo deploy.

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

**Usada em:** `Configuracoes.tsx` e o endpoint `GET /procedimentos` da API do
Agente de IA — que devolve **só o nome**, sem `id` nem descrição.

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

#### O catálogo da clínica — 20 procedimentos

Definidos em
[`0005_catalogo_procedimentos.sql`](supabase/migrations/0005_catalogo_procedimentos.sql),
que apagou os 3 de exemplo do seed inicial. As descrições completas estão lá;
abaixo, só os nomes, na ordem em que a tela de Configurações os lista.

| # | Procedimento | # | Procedimento |
|---|---|---|---|
| 1 | Avaliação e Planejamento Digital do Sorriso | 11 | Levantamento de Seio Maxilar |
| 2 | Lentes de Contato | 12 | Prótese Dentária |
| 3 | Facetas em Resina | 13 | Tratamento de Canal |
| 4 | Clareamento Dental | 14 | Placa de Bruxismo |
| 5 | Gengivoplastia | 15 | Tratamento de DTM |
| 6 | Alinhadores Transparentes | 16 | Limpeza e Profilaxia |
| 7 | Implante Unitário | 17 | Raspagem |
| 8 | Carga Imediata | 18 | Tratamento Periodontal |
| 9 | Prótese Fixa sobre Implantes | 19 | Enxerto Gengival |
| 10 | Enxerto Ósseo | 20 | Extração de Siso |

> **A `descricao` é a explicação do procedimento em uma linha**, escrita em
> linguagem de paciente, não em jargão clínico. Ela existe para quem lê na tela
> — a API do agente devolve só o nome, e é o nome que o paciente ouve no
> WhatsApp. Por isso os nomes também são os do paciente ("Limpeza e Profilaxia",
> não "profilaxia dentária supragengival").

> **A tabela não guarda duração.** Ao marcar, o agente usa 60 minutos por
> padrão para qualquer procedimento, a menos que o n8n mande `duracao_minutos`
> na chamada. Uma carga imediata, que na prática ocupa o dobro disso, precisa
> vir com a duração explícita — senão a agenda reserva menos tempo do que o
> atendimento consome. Uma coluna `duracao_padrao_minutos` resolveria isso de
> vez; ficou de fora por decisão, não por esquecimento.

---

### 4.7. `profissionais`

Os dentistas da clínica.

**Usada em:** `Profissionais.tsx`, `Agenda.tsx`, `NovoAgendamentoModal.tsx`,
`LeadDetail.tsx`

| Coluna | Tipo | Nulo | Default | Observação |
|---|---|:---:|---|---|
| `id` | `uuid` | não | `gen_random_uuid()` | PK |
| `nome` | `text` | não | — | |
| `sobrenome` | `text` | não | `''` | |
| `cor` | `text` | não | `'#1E6E8C'` | `CHECK` hex de 6 dígitos |
| `ativo` | `boolean` | não | `true` | Inativo some da agenda e dos seletores |
| `created_at` | `timestamptz` | não | `now()` | |
| `updated_at` | `timestamptz` | não | `now()` | Trigger `profissionais_updated_at` |

**Índice:** `profissionais_ativo_idx` em `(ativo, nome)`.

> **O profissional não é usuário do sistema.** Não faz login, não tem linha em
> `usuarios` e não está vinculado a procedimentos — é só um recurso de agenda.
> Se um dia cada dentista precisar ver apenas a própria agenda, será preciso
> acrescentar `usuario_id` aqui e reescrever as políticas da seção 6. Mais fácil
> decidir antes de haver dados.

> **A `cor` é dado, não identidade visual.** Serve para distinguir uma agenda da
> outra no calendário — a mesma lógica das cores de status. Trocar a marca da
> clínica não deve trocar isto. A paleta oferecida na interface é fixa
> (`src/lib/cores.ts`), mas o banco aceita qualquer hex válido, então ampliá-la
> não exige migração.

---

### 4.8. `profissional_horarios`

Jornada de trabalho — **uma linha por dia da semana, por profissional**. Mesma
modelagem de `horario_comercial`, porque cada dentista tem horário diferente.

**Usada em:** `Profissionais.tsx` (edição), `Agenda.tsx` (sombreado fora do
expediente), `NovoAgendamentoModal.tsx` (aviso de encaixe)

| Coluna | Tipo | Nulo | Default | Observação |
|---|---|:---:|---|---|
| `id` | `uuid` | não | `gen_random_uuid()` | PK |
| `profissional_id` | `uuid` | **não** | — | FK → `profissionais(id)` **ON DELETE CASCADE** |
| `dia_semana` | `smallint` | não | — | `CHECK (0..6)` |
| `hora_inicio` | `time` | não | — | Sem fuso — ver `fuso_horario` na seção 4.4 |
| `hora_fim` | `time` | não | — | `CHECK (hora_fim > hora_inicio)` |
| `ativo` | `boolean` | não | `true` | Dia sem atendimento = `false` |

**UNIQUE `(profissional_id, dia_semana)`** — a interface acha o dia com um
`find()`, e linhas duplicadas fariam todas menos a primeira sumirem em silêncio.
Aqui é pior que em `horario_comercial`: a API de disponibilidade leria só a
primeira e ofereceria horário errado ao paciente.

**Índice:** `profissional_horarios_prof_idx` em `(profissional_id)`.

> `dia_semana`: **0 = domingo … 6 = sábado**, igual a `horario_comercial` e ao
> `getDay()` do JavaScript. Manter idêntico é o que permite comparar as duas
> grades sem conversão.

---

### 4.9. `profissional_bloqueios`

Férias, feriado, almoço, congresso, compromisso pessoal.

**Usada em:** `NovoAgendamentoModal.tsx` e, na fase 2, pelo cálculo de
disponibilidade da API.

| Coluna | Tipo | Nulo | Default | Observação |
|---|---|:---:|---|---|
| `id` | `uuid` | não | `gen_random_uuid()` | PK |
| `profissional_id` | `uuid` | **sim** | — | FK → `profissionais(id)` CASCADE. **Nulo = clínica inteira** |
| `inicio` | `timestamptz` | não | — | |
| `fim` | `timestamptz` | não | — | `CHECK (fim > inicio)` |
| `motivo` | `text` | não | `''` | |
| `created_at` | `timestamptz` | não | `now()` | |

**Índices:** `profissional_bloqueios_periodo_idx` em `(inicio, fim)` e
`profissional_bloqueios_prof_idx` em `(profissional_id, inicio)`.

> **Por que `profissional_id` aceita nulo:** feriado, dedetização e
> confraternização valem para todo mundo. Sem isso, marcar um feriado exigiria
> uma linha por dentista — e esquecer um deles significa o Agente de IA
> oferecendo consulta em dia de clínica fechada.

> **Bloqueio não entra na restrição de exclusão da seção 4.2.** Ele impede que a
> agenda *ofereça* o horário, mas não impede a equipe de encaixar alguém por
> cima conscientemente. Emergência odontológica em feriado existe.

---

### 4.10. `api_tokens`

Chaves de acesso da API do Agente de IA. Contrato completo em
[`API_AGENTE.md`](API_AGENTE.md).

| Coluna | Tipo | Nulo | Default | Observação |
|---|---|:---:|---|---|
| `id` | `uuid` | não | `gen_random_uuid()` | PK |
| `nome` | `text` | não | — | Como a equipe identifica ("n8n produção") |
| `prefixo` | `text` | não | — | Início visível (`odk_7f3a…`), para distinguir na lista |
| `hash` | `text` | não | — | **SHA-256 do token. UNIQUE** |
| `ativo` | `boolean` | não | `true` | Revogar é `false` |
| `criado_por` | `uuid` | sim | — | FK → `usuarios(id)` ON DELETE SET NULL |
| `ultimo_acesso` | `timestamptz` | sim | — | Atualizado pela API, no máximo a cada 5 min |
| `revogado_em` | `timestamptz` | sim | — | |
| `created_at` | `timestamptz` | não | `now()` | |

> **O valor do token não existe em lugar nenhum.** Guarda-se só o hash: dá para
> conferir quem chega, não para reconstruir. Por isso ele é exibido uma única
> vez, na criação — e é nesse momento que a tela mostra os cURLs já preenchidos.
> Guardar o valor legível faria de um vazamento do banco a entrega de todos os
> tokens de uma vez.

> **Revogar não apaga.** `ativo = false` preserva o histórico de quem teve
> acesso e quando.

---

### 4.11. Funções da API

Sete funções servem a Edge Function `agenda`. Elas existem **no banco**, e não no
TypeScript, por três motivos: remarcar precisa ser atômico; o cruzamento entre a
jornada (`time` sem fuso) e a consulta (`timestamptz`) só é confiável com o
`AT TIME ZONE` do Postgres; e assim dá para testar tudo com SQL, sem subir nada.

| Função | Papel |
|---|---|
| `api_token_valido(hash)` | Confere o token e carimba `ultimo_acesso` |
| `agenda_profissionais_livres(inicio, duracao)` | Quem está livre num horário |
| `agenda_horarios_disponiveis(data, profissional, duracao, passo)` | Slots livres num dia |
| `agenda_proxima_vaga(a_partir_de, profissional, duracao)` | Próximo dia com vaga (até 60 dias) |
| `agenda_marcar(...)` | Acha ou cria o paciente, escolhe profissional, insere |
| `agenda_cancelar(...)` | Cancela, com conferência opcional pelo WhatsApp |
| `agenda_remarcar(...)` | Move a consulta num `UPDATE` só |

As três últimas devolvem `ok`, `motivo` e os campos da resposta — o `motivo` é o
que vira frase para o paciente na Edge Function.

As de escrita são `security definer` **com `set search_path = public`**. Sem esse
`set`, `security definer` é vetor clássico de escalada de privilégio: quem chama
poderia plantar um schema com objetos de mesmo nome.

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

### O funil acompanha a agenda sozinho

O trigger **`consultas_sincroniza_lead`** (função
`public.sincronizar_agendamento_lead`) mantém a ficha do lead coerente com o que
acontece na agenda:

| Escrita em `consultas` | Efeito em `crm_clinica_dados` |
|---|---|
| INSERT com `status = 'agendada'` | `data_agendamento` = a consulta ativa mais próxima do lead; `data_marcacao_agendamento` = agora; `status` → `consulta_agendada` |
| UPDATE de `data_consulta` (remarcação) | `data_agendamento` é recalculada. **`data_marcacao_agendamento` não muda** |
| UPDATE para `status = 'cancelada'`, **restando outra consulta ativa** | `data_agendamento` passa para a próxima. **O `status` não muda** |
| UPDATE para `status = 'cancelada'`, **era a última** | `data_agendamento` = nulo; `status` → `consulta_cancelada` |

Três decisões embutidas aí:

1. **Remarcar não é marcar de novo.** Se `data_marcacao_agendamento` fosse
   reescrita a cada remarcação, o Dashboard contaria a mesma consulta duas vezes
   — uma no mês original, outra no mês para o qual foi adiada.
2. **Quem já é paciente não volta a ser lead.** Os status `consulta_realizada` e
   `paciente_recorrente` são preservados: são eles que separam `/leads` de
   `/clientes` (`src/lib/pessoas.ts`), e rebaixá-los jogaria um paciente
   recorrente de volta na lista de contatos a cada retorno que marcasse.
3. **Cancelar uma sessão não é desistir do tratamento.** Odontologia trabalha com
   tratamentos de várias sessões marcadas de uma vez. Por isso o trigger sempre
   **recalcula** `data_agendamento` a partir das consultas ativas que restam
   (`min(data_consulta)`), em vez de deduzir da linha que disparou a operação — e
   só muda o funil para `consulta_cancelada` quando não sobra nenhuma.

Está num trigger, e não no React, porque a API do Agente de IA (seção 8) não
passa pelo React. Escreveu consulta, o funil acompanha — venha de onde vier.

> **`status = 'realizada'` é deliberadamente ignorado pelo trigger.** Marcar
> comparecimento continua sendo ato manual, feito na ficha do paciente junto com
> o `valor_pago`. Automatizar o salto de funil a partir do calendário produziria
> mudanças de status que ninguém pediu.

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

RLS está **ativo nas 10 tabelas**. São 11 políticas:

| Tabela | Política | Operação | Regra |
|---|---|---|---|
| `crm_clinica_dados` | `leads_all` | ALL | `authenticated` — acesso total |
| `consultas` | `consultas_all` | ALL | `authenticated` — acesso total |
| `profissionais` | `profissionais_all` | ALL | `authenticated` — acesso total |
| `profissional_horarios` | `profissional_horarios_all` | ALL | `authenticated` — acesso total |
| `profissional_bloqueios` | `profissional_bloqueios_all` | ALL | `authenticated` — acesso total |
| `configuracoes_clinica` | `clinica_all` | ALL | `authenticated` — acesso total |
| `horario_comercial` | `horario_all` | ALL | `authenticated` — acesso total |
| `servicos_clinica` | `servicos_all` | ALL | `authenticated` — acesso total |
| `usuarios` | `usuarios_select` | SELECT | `authenticated` — vê todos os perfis |
| `api_tokens` | `api_tokens_all` | ALL | `authenticated` — acesso total |
| `usuarios` | `usuarios_update_own` | UPDATE | **só o próprio** (`auth.uid() = id`) |

Mais 6 políticas em `storage.objects` (seção 7).

> A Edge Function usa a `service_role key`, que ignora o RLS — ela é servidor, não
> sessão de usuário. O que limita o agente não é o RLS, é a superfície da API:
> sete operações e nada mais.

A função `sincronizar_agendamento_lead` (seção 5) **não** usa `security definer`:
roda com as permissões de quem chamou, que já tem acesso total pelas políticas.
Elevar privilégio ali só ampliaria o estrago de uma chamada indevida da API.

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
5. Ao agendar, **insere uma linha em `consultas`** com `lead_id`,
   `profissional_id`, `data_consulta`, `duracao_minutos`, `origem = 'agente_ia'`
   e `chave_externa`. O trigger da seção 5 cuida sozinho de `data_agendamento`,
   `data_marcacao_agendamento` e do `status` do lead
6. Nos follow-ups, carimba `follow_up_1/2/3` e ajusta o `status`

> **`minutos_ultima_mensagem` não precisa de escrita.** Basta manter
> `ultima_mensagem` em dia — a view calcula o resto sozinha.

### O que o agente NÃO deve fazer

**Gravar o WhatsApp sem o código do país.** O formato canônico
(`5511987654321`) é o que o n8n já usa — nada muda para a automação. Só não vale
mandar o número local: ele entra, mas passa a ser um segundo registro do mesmo
telefone, invisível para a busca e para a unicidade (seção 4.1).

Se o insert do agente devolver **`23505`**, o lead daquele número já existe:
busque por `whatsapp_lead` e siga com o que voltou, em vez de tentar de novo.

**Gravar `data_agendamento` direto na ficha do lead.** Era assim antes de existir
a Agenda, e o resultado agora seria uma consulta que aparece no CRM mas não no
calendário — duas telas contando histórias diferentes sobre o mesmo fato. A
fonte da verdade do agendamento é a linha em `consultas`; `data_agendamento`
virou reflexo, mantido pelo trigger.

### A API da agenda — implantada

Sete endpoints na Edge Function `agenda`, autenticados por token próprio.
Contrato e cURLs em [`API_AGENTE.md`](API_AGENTE.md); funções SQL na seção 4.11.

O que está no banco por causa dela:

| Peça | Por quê |
|---|---|
| `consultas_sem_sobreposicao` (4.2) | Recepção e agente escrevem ao mesmo tempo; só o banco fecha a janela |
| `chave_externa` UNIQUE (4.2) | Retry de automação não pode virar consulta duplicada |
| `profissional_bloqueios` (4.9) | Sem isso não existe "disponibilidade" confiável |
| `configuracoes_clinica.fuso_horario` (4.4) | Servidor em UTC; sem fixar o fuso, a disponibilidade erra em 3 horas |
| `origem` (4.2) | Sem isso é impossível medir ou auditar o que o agente marcou sozinho |

Duas coisas que a implementação confirmou, e que quem for mexer precisa saber:

- **A Edge Function não pode ter dependência externa.** O runtime sobe com
  `--no-remote`; um `import` de `supabase-js` derruba a função inteira com
  `BOOT_ERROR` antes de rodar uma linha. Toda conversa com o banco é `fetch` no
  PostgREST.
- **A regra de disponibilidade em SQL espelha `src/lib/agenda.ts`.** Se
  divergirem, o agente oferece horário que a recepção vê como ocupado. Mudou uma,
  mude a outra.

---

## 8.5. Realtime — atualização automática da tela

O CRM e a tela de detalhe assinam `postgres_changes` para reagir sozinhos
quando o Agente de IA mexe num lead: o card anda de coluna no Kanban sem
ninguém apertar F5.

A Agenda faz o mesmo com `consultas`: a tela fica aberta na recepção o dia
inteiro enquanto o Agente de IA marca pelo WhatsApp.

Para isso funcionar, as tabelas precisam estar publicadas:

```sql
alter publication supabase_realtime add table public.crm_clinica_dados;  -- 0001
alter publication supabase_realtime add table public.consultas;          -- 0002
```

> A Agenda **recarrega o período** a cada evento em vez de aplicar o payload: o
> evento vem da tabela e não traz o nome do paciente, que na tela vem de um join
> com `crm_clinica_dados`.

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
--           public | consultas
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
10. **Rodar `0002` sem `0001`** → falha: o `0002` usa `set_updated_at` e altera
    `consultas`, que só existem depois do primeiro arquivo.
11. **Repetir a chamada depois de um `23P01`** → dá exatamente o mesmo erro. Isso
    não é falha transitória: é o banco recusando duas consultas no mesmo horário
    do mesmo profissional. A saída é outro horário.
12. **Automação inserindo em `consultas` sem `chave_externa`** → o retry cria uma
    segunda consulta idêntica e o paciente recebe duas confirmações.
13. **Gravar `data_agendamento` direto na ficha do lead pela automação** → a
    consulta aparece no CRM e some da Agenda. A fonte da verdade é `consultas`.
14. **Cadastrar profissional sem jornada** → ele existe, mas a agenda o trata
    como quem nunca atende, e todo agendamento com ele vira "fora do expediente".
15. **Apagar um profissional com consultas** → bloqueado pelo `ON DELETE
    RESTRICT` (`23503`). Use `ativo = false`.
16. **Gravar em `consultas.data_fim`** → é coluna derivada, sobrescrita pelo
    trigger na próxima escrita de `data_consulta` ou `duracao_minutos`. Grave
    esses dois e deixe o fim com o banco.
17. **Gravar WhatsApp sem o código do país** → o número entra (o trigger só tira
    pontuação, não inventa DDI) e passa a conviver com o mesmo telefone escrito
    de outra forma. A unicidade não pega, e a busca não acha.
18. **Criar o índice `crm_clinica_whatsapp_unico` com duplicatas no banco** →
    o Postgres recusa. Rode a consulta de duplicados da seção 4.1 e resolva
    antes.
19. **Acrescentar `import` na Edge Function** → `BOOT_ERROR` no boot, com todos
    os endpoints fora do ar de uma vez. O runtime roda com `--no-remote`.
20. **Esquecer `set search_path = public` numa função `security definer`** →
    brecha de escalada de privilégio.

---

## 10. Consultas úteis para verificação

Depois de rodar a migração, confira se está tudo de pé:

```sql
-- Objetos criados (esperado: 9 tabelas + 1 view)
select table_name, table_type from information_schema.tables
where table_schema = 'public' order by table_name;

-- RLS ativo em todas as tabelas (esperado: 9 linhas, todas true)
select relname, relrowsecurity from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' order by relname;

-- Políticas (esperado: 16 — 10 em public + 6 em storage)
select schemaname, count(*) from pg_policies
where schemaname in ('public','storage') group by schemaname;

-- A restrição anti-conflito existe? (esperado: 1 linha, contype = 'x')
select conname, contype from pg_constraint
where conname = 'consultas_sem_sobreposicao';

-- Triggers da agenda (esperado: as 3 linhas)
select tgname from pg_trigger
where tgname in ('consultas_sincroniza_lead', 'consultas_data_fim', 'consultas_updated_at');

-- Algum WhatsApp fora do formato canônico? (esperado: 0 linhas)
select id, nome_lead, whatsapp_lead from public.crm_clinica_dados
where whatsapp_lead is not null
  and whatsapp_lead <> regexp_replace(whatsapp_lead, '[^0-9]', '', 'g');

-- Algum número repetido? (esperado: 0 linhas — se vier alguma, o índice único
-- não existe)
select whatsapp_lead, count(*), string_agg(nome_lead, ' | ')
from public.crm_clinica_dados where whatsapp_lead is not null
group by 1 having count(*) > 1;

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
