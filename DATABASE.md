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
   `api_tokens` e as 7 funções que sustentam os endpoints (a Edge Function
   chama 6 delas direto; `agenda_profissionais_livres` é usada por dentro de
   `agenda_marcar` e `agenda_remarcar`, quando o paciente não escolhe
   profissional).
5. `supabase/migrations/0005_catalogo_procedimentos.sql` — os 20 procedimentos
   da clínica, no lugar dos 3 de exemplo do seed inicial. Só dados.
6. `supabase/migrations/0006_informacoes_clinica.sql` — endereço e links da
   clínica: 8 colunas novas em `configuracoes_clinica`, 2 restrições e a view
   `informacoes_clinica_agente`, de coluna única, que o Agente de IA lê.
7. `supabase/migrations/0007_horario_na_view.sql` — a linha `Atendimento:` na
   view, montada de `horario_comercial` por `horario_atendimento_texto()`.
8. `supabase/migrations/0008_procedimentos_view.sql` — a view
   `procedimentos_clinica_agente`, de coluna única, com os procedimentos ativos.
9. `supabase/migrations/0009_profissionais_view.sql` — a view
   `profissionais_clinica_agente`, com a jornada de cada dentista, e a função
   `jornada_texto()`, que unifica a montagem da frase de horário.
10. `supabase/migrations/0010_agente_conversas.sql` — as conversas do WhatsApp:
    a tabela `mensagens_whatsapp`, 3 colunas de "assumir conversa" em
    `crm_clinica_dados` (com a **recriação da view** `crm_clinica`), a tabela
    `configuracoes_agente` de linha única, a função `agente_deve_responder()`,
    1 trigger, as políticas de RLS, o Realtime e o bucket `midias-whatsapp`.
    Detalhes na [seção 4.17](#417-mensagens_whatsapp--configuracoes_agente-migração-0010).
11. `supabase/migrations/0011_procedimentos_detalhados.sql` — a coluna
    `descricao_longa` em `servicos_clinica` e os 20 textos.
12. `supabase/migrations/0012_procedimentos_texto_enxuto.sql` — os mesmos 20
    textos, reescritos mais curtos (~430 caracteres) e sem travessão. Só
    conteúdo; nada de schema. Ver [4.6](#46-servicos_clinica).
13. `supabase/migrations/0013_conversas_lista.sql` — a view
    `conversas_lista`, que sustenta a coluna da esquerda da tela Conversas.
    Ver [4.18](#418-conversas_lista-view-migrações-0013-e-0014).
14. `supabase/migrations/0014_conversas_agendamento.sql` — acrescenta
    `data_agendamento` a essa view, para a etiqueta "Agendada" e o filtro da
    lista. Só `create or replace view`; nada de tabela. Ver
    [4.18](#418-conversas_lista-view-migrações-0013-e-0014).
15. `supabase/migrations/0015_baixa_da_consulta.sql` — o status `faltou` em
    `consultas` e o trigger que **promove o lead a Paciente** quando a consulta
    vira `realizada`. Fecha o funil, que até aqui não fechava. Ver
    [seção 5](#5-status-do-funil).
16. `supabase/migrations/0016_ultima_consulta.sql` — a coluna calculada
    `ultima_consulta` em `crm_clinica`, para a tela Pacientes. Subconsulta
    escalar, **não** join: a view é escrita pela aplicação. Ver a seção 3.
17. `supabase/migrations/0017_provedor_whatsapp.sql` — a coluna
    `provedor_whatsapp` em `configuracoes_agente`: qual ponte com o WhatsApp
    está ativa. Ver [seção 4.17](#417-mensagens_whatsapp--configuracoes_agente-migração-0010).

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
        text endereco
        text cidade
        text estado
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
| `configuracoes_clinica` | tabela | Identidade, endereço e fuso da clínica (linha única) |
| `mensagens_whatsapp` | tabela | Cada mensagem trocada no WhatsApp. É a memória do Agente de IA **e** a fonte da tela de conversas (ver 4.17) |
| `configuracoes_agente` | tabela | Linha única: modelo, prompt, liga/desliga e modo teste do agente (ver 4.17) |
| `informacoes_clinica_agente` | **view** | Os dados da clínica em frases prontas, uma por linha, para o Agente de IA (ver 4.12) |
| `procedimentos_clinica_agente` | **view** | Os procedimentos ativos, um por linha, para o Agente de IA (ver 4.13) |
| `profissionais_clinica_agente` | **view** | Os dentistas ativos e a jornada de cada um, um por linha, para o Agente de IA (ver 4.14) |
| `conversas_lista` | **view** | Uma linha por conversa do WhatsApp, para a tela Conversas (ver 4.18) |
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
                          + ultima_consulta         (calculado na leitura)
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
create or replace view public.crm_clinica
with (security_invoker = true)
as
  select
    -- ... todas as colunas de crm_clinica_dados, uma a uma ...
    case
      when d.ultima_mensagem is null then null
      else floor(extract(epoch from (now() - d.ultima_mensagem)) / 60)::integer
    end as minutos_ultima_mensagem,

    -- migração 0016
    (select max(c.data_consulta) from public.consultas c
      where c.lead_id = d.id and c.status = 'realizada') as ultima_consulta
  from public.crm_clinica_dados d;
```

> A view **não usa mais `d.*`**. A expansão do `*` é congelada na criação, então
> uma coluna nova na tabela não apareceria na view sem recriá-la; e
> `create or replace` exige a lista literal para acrescentar colunas no fim.

### O que isso significa na prática

- **Escrita funciona normalmente.** A view é auto-atualizável pelo Postgres
  (origem única, sem agregação), então `INSERT`, `UPDATE` e `DELETE` em
  `crm_clinica` funcionam igual a uma tabela. A aplicação e a automação não
  precisam saber que é uma view.
- **Nunca escreva nas colunas calculadas** (`minutos_ultima_mensagem` e
  `ultima_consulta`). Gravar nelas causa erro.
- **⚠️ NUNCA acrescente `join` a esta view.** É a armadilha mais cara aqui: uma
  view só é auto-atualizável com **um único item no FROM**. Um `join lateral` —
  que é como `conversas_lista` (4.18) resolve perguntas parecidas — a tornaria
  somente-leitura, e **todo cadastro do sistema quebraria de uma vez**: contato,
  paciente, edição de ficha e o Agente de IA escrevem por aqui.

  `ultima_consulta` é **subconsulta escalar**, não join, exatamente por isso:
  ela fica na lista de seleção e não toca o FROM. Ao mexer nesta view, confira
  depois:

  ```sql
  select is_updatable from information_schema.views where table_name='crm_clinica';
  -- YES = escrita preservada. NO = você acabou de derrubar o cadastro.
  ```

  (`conversas_lista` pode usar `join lateral` porque ninguém escreve nela.)
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
| `ultima_consulta` | `timestamptz` | sim | *calculado* | **Só na view** (`0016`). A última consulta `realizada`. Somente leitura |
| **Funil** ||||
| `status` | `text` | **não** | `'iniciou_conversa'` | `CHECK` — ver seção 5 |
| `follow_up_1` | `timestamptz` | sim | — | Quando o follow-up 1 foi enviado |
| `follow_up_2` | `timestamptz` | sim | — | |
| `follow_up_3` | `timestamptz` | sim | — | |
| **Agendamento** ||||
| `data_agendamento` | `timestamptz` | sim | — | **Quando a consulta acontece** |
| `data_marcacao_agendamento` | `timestamptz` | sim | — | **Quando o lead marcou** |
| `id_agendamento` | `text` | sim | — | ID no sistema de agenda externo |
| **Integração Chatwoot — sem uso** ||||
| `id_conta_chatwoot` | `text` | sim | — | ⚠️ ninguém escreve |
| `id_conversa_chatwoot` | `text` | sim | — | ⚠️ ninguém escreve. Indexado |
| `id_lead_chatwoot` | `text` | sim | — | ⚠️ ninguém escreve |
| `inbox_id_chatwoot` | `text` | sim | — | ⚠️ ninguém escreve |
| **Financeiro** ||||
| `valor_pago_acumulado` | `numeric(10,2)` | sim | `0` | Total já pago pelo paciente |
| `created_at` | `timestamptz` | não | `now()` | |
| **Atendimento humano** (`0010`) ||||
| `agente_pausado` | `boolean` | não | `false` | Ligado, o agente grava e **não responde** nesta conversa |
| `assumido_por` | `uuid` | sim | — | Quem assumiu (`usuarios.id`) |
| `assumido_em` | `timestamptz` | sim | — | Quando assumiu |

> **As quatro colunas `*_chatwoot` estão zeradas em 100% das linhas** e não têm
> quem as escreva: elas são do desenho antigo, com Chatwoot e n8n, que foi
> abandonado (seção 8). Ficaram porque removê-las exigiria dropar e recriar a
> view `crm_clinica` (4.17), e coluna nula não custa nada. **Não construa nada
> em cima delas** — inclusive o índice de `id_conversa_chatwoot`, que hoje não
> serve a ninguém.

#### ⚠️ `whatsapp_lead`: formato canônico e unicidade

O número é gravado **só com dígitos, incluindo o código do país, sem `+`,
espaço ou traço**: `5511987654321`. É o formato em que a Evolution entrega o
número no webhook, e desde a migração `0003` o sistema grava igual.

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
([`src/lib/telefones.ts`](src/lib/telefones.ts)), e o Agente de IA, que copia o
número do JID da Evolution, onde ele já vem completo.

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
| `crm_clinica_conversa_cw_idx` | `id_conversa_chatwoot` | ⚠️ **Sem uso.** Era como o n8n achava o lead da conversa; hoje a busca é por `whatsapp_lead` |
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
| `status` | `text` | não | `'agendada'` | `agendada` \| `realizada` \| `cancelada` \| `faltou` (`0015`). Só `agendada` bloqueia horário |
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

Identidade e endereço da clínica. **Tem no máximo uma linha.**

**Usada em:** `Configuracoes.tsx` (abas Perfil e Clínica), `Sidebar.tsx`, e a view
`informacoes_clinica_agente` (seção 4.12), que o Agente de IA lê.

| Coluna | Tipo | Nulo | Default |
|---|---|:---:|---|
| `id` | `uuid` | não | `gen_random_uuid()` |
| `nome_clinica` | `text` | sim | — |
| `logo_url` | `text` | sim | — |
| `fuso_horario` | `text` | não | `'America/Sao_Paulo'` |
| `endereco` | `text` | sim | — |
| `bairro` | `text` | sim | — |
| `cidade` | `text` | sim | — |
| `estado` | `text` | sim | — |
| `cep` | `text` | sim | — |
| `google_maps_url` | `text` | sim | — |
| `instagram_url` | `text` | sim | — |
| `site_url` | `text` | sim | — |
| `created_at` | `timestamptz` | não | `now()` |
| `updated_at` | `timestamptz` | não | `now()` |

**Restrições:** `configuracoes_clinica_estado_valido` aceita só as 27 UFs (ou
nulo); `configuracoes_clinica_cep_valido` exige `^\d{8}$`.

> **`endereco` é um campo só** — guarda "Rua Samuel Scott, 212 A - bloco 3"
> inteiro. Separar rua, número e complemento obrigaria a remontar a frase na
> leitura, e daria três jeitos diferentes de o mesmo endereço ficar estranho.

> **`cidade` é livre, `estado` é lista.** Cidade escrita à mão é inevitável — são
> milhares. UF é um conjunto fechado de 27, e digitada à mão vira "SP", "sp" e
> "São Paulo" na mesma coluna.

> **`cep` guarda só dígitos** (`88040600`), como `whatsapp_lead`. A pontuação
> existe na tela; o `CHECK` recusa qualquer coisa formatada.

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

**Usada em:** `Procedimentos.tsx` e o endpoint `GET /procedimentos` da API do
Agente de IA — que devolve **só o nome**, sem `id` nem descrição.

| Coluna | Tipo | Nulo | Default |
|---|---|:---:|---|
| `id` | `uuid` | não | `gen_random_uuid()` |
| `nome` | `text` | não | — |
| `descricao` | `text` | não | `''` |
| `descricao_longa` | `text` | sim | — |
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

#### As duas descrições não são a mesma coisa em tamanhos diferentes

Elas têm **destinos diferentes**, e confundi-las custa dinheiro em toda
conversa:

| Coluna | Vai para onde | Quando é lida |
|---|---|---|
| `descricao` | **Dentro do prompt** do agente, via `procedimentos_clinica_agente` | Em **toda** mensagem, junto com a dos outros 19 |
| `descricao_longa` | **Fora do prompt.** A ferramenta `detalhes_do_procedimento` busca direto na tabela | Só quando o paciente pergunta **daquele** procedimento |

Os 20 textos longos somam ~8.600 caracteres. Se estivessem no prompt, seriam
cobrados inclusive de quem só mandou "oi" — para carregar 19 textos que aquela
conversa nunca vai usar. Fora dele, o prompt continua em **1.961 caracteres**,
exatamente o mesmo de antes da coluna existir.

Daí as duas réguas, ambas avisadas na tela de edição:

- **`descricao` até ~120 caracteres.** É o catálogo: serve para o agente saber
  que o procedimento existe, não para explicá-lo.
- **`descricao_longa` em torno de 430, teto sugerido de 600.** Não é limite
  técnico. A Letícia responde em até 50 palavras; acima disso ela para de
  escolher o que dizer e passa a **resumir por conta própria** — e resumo
  automático é onde nasce a frase que nenhum dentista escreveu.

> **Sem travessão (`—`) nos textos longos.** O modelo copia a pontuação do que
> lê, e travessão em mensagem de WhatsApp entrega texto de máquina.

> ⚠️ **Os 20 textos longos são rascunho** e precisam da revisão de um dentista
> da clínica. Prazos, número de sessões e condutas variam por caso — e agora
> isso é dito a paciente.

> **A tabela não guarda duração.** Ao marcar, o agente usa 60 minutos por
> padrão para qualquer procedimento, a menos que quem chama mande
> `duracao_minutos`. Uma carga imediata, que na prática ocupa o dobro disso, precisa
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

**Usada em:** `TokenApi.tsx` (menu do usuário → Token e API), que cria e revoga;
e pela Edge Function, via `api_token_valido()`, a cada chamada.

| Coluna | Tipo | Nulo | Default | Observação |
|---|---|:---:|---|---|
| `id` | `uuid` | não | `gen_random_uuid()` | PK |
| `nome` | `text` | não | — | Como a equipe identifica ("integração da recepção") |
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

### 4.12. `informacoes_clinica_agente` (view)

Os dados da clínica em frases prontas, **uma coluna, uma informação por linha**.
É o que o Agente de IA consulta quando precisa falar do endereço, do
Instagram ou do site com um paciente.

| Coluna | Tipo |
|---|---|
| `informacao` | `text` |

```
Nome: Odonto Clinica
Rua: Rua Samuel Scott, 212 A - bloco 3
Bairro: Carvoeira
Cidade: Florianópolis/SC
CEP: 88040-600
Atendimento: segunda a sexta das 08:00 às 18:00, sábado das 08:00 às 12:00
Link do Google Maps: https://maps.app.goo.gl/...
Instagram: https://instagram.com/clinica
Site: https://clinica.com.br
```

**A linha `Atendimento:` não vem de campo digitado.** Ela é montada de
`horario_comercial` por `jornada_texto(null)` (4.15), a mesma grade que a clínica
preenche em Configurações → Horários de Funcionamento. Mudou a grade, mudou a
frase na leitura seguinte — ninguém digita horário duas vezes.

> ⚠️ **`horario_comercial` é o horário da clínica, não o da agenda** — ver o
> aviso ao fim da seção 4.15.

> **Por que view e não tabela.** Uma segunda tabela precisaria ser mantida em
> sincronia com `configuracoes_clinica`, e um dia não estaria — alguém edita o
> endereço na tela e esquece de propagar, ou o trigger falha em silêncio. A view
> é calculada na leitura: **o estado "desatualizada" não existe**. É o mesmo
> motivo pelo qual `crm_clinica` é view sobre `crm_clinica_dados`.

> **Por que uma coluna só.** Quem lê vai falar com um paciente. Valor sem rótulo
> obriga o agente a adivinhar qual linha é o CEP e qual é o bairro — e uma hora
> ele erra. Frase pronta elimina a adivinhação, na mesma lógica do campo
> `mensagem` da API.

> **Campo vazio não vira linha.** O `||` com `NULL` devolve `NULL` e o `WHERE`
> derruba a linha, então a clínica sem site simplesmente não tem a linha `Site:`
> — em vez de ter uma linha `Site: ` pelada, que o agente leria como "o site da
> clínica é nada". O `nullif(trim(...), '')` cobre o campo salvo com espaço em
> branco, que não é `NULL` mas produziria o mesmo efeito.

**A ordem é fixa** dentro da própria view, via uma coluna `ordem` que não é
selecionada. A saída sai sempre na mesma sequência.

**Acesso:** `security_invoker = true`, então vale o RLS de
`configuracoes_clinica`. Na prática: a `service_role` da Edge Function lê, a equipe logada
lê, e quem não tem sessão não lê nada. **O agente lê a view direto, sem passar
pela API** — ele já entra no banco com a `service_role` para gravar os leads em
`crm_clinica`, e uma leitura a mais pela mesma conexão não acrescenta superfície.

```sql
select informacao from public.informacoes_clinica_agente;
```

---

### 4.13. `procedimentos_clinica_agente` (view)

Os procedimentos que a clínica oferece, **uma coluna, um por linha**, já escrito
como frase. Mesma receita da 4.12, para o agente saber o que existe e não
inventar tratamento.

| Coluna | Tipo |
|---|---|
| `procedimento` | `text` |

```
Avaliação e Planejamento Digital do Sorriso: Primeira consulta com escaneamento e fotos, onde o dentista mostra o resultado simulado antes de começar
Lentes de Contato: Lâminas finíssimas de porcelana coladas na frente dos dentes para mudar cor e formato
Facetas em Resina: Camadas de resina aplicadas sobre o dente para corrigir cor, forma ou pequenas falhas
…
```

> **O nome ocupa a posição do rótulo**, e não há prefixo `Procedimento:`. Aqui
> todas as linhas são da mesma natureza — repetir a palavra em vinte linhas
> seria ruído que o agente leria em voz alta. Na 4.12 o rótulo existe porque
> cada linha é de um tipo diferente.

> **Sem descrição, a linha é só o nome.** O `coalesce` sobre o `||` faz o trecho
> inteiro sumir, em vez de deixar um dois-pontos pendurado no fim.

**Ordem:** `created_at` — a mesma da tela de Configurações, que é a ordem que a
clínica escolheu. Começa pela Avaliação, por onde todo tratamento passa;
alfabética jogaria os Alinhadores para a frente e a Avaliação para o meio.

> Note que **o endpoint `GET /procedimentos` da API ordena por nome**, não por
> cadastro, e devolve só o nome, sem descrição. São superfícies diferentes para
> consumidores diferentes: a API existe desde antes, e o agente agora lê a view.

**Só os ativos.** Desligar o procedimento em Configurações tira ele da boca do
agente, sem ninguém mexer no código.

```sql
select procedimento from public.procedimentos_clinica_agente;
```

---

### 4.14. `profissionais_clinica_agente` (view)

Os dentistas ativos, **uma coluna, um por linha**, com a jornada de cada um —
que é o que o paciente pergunta logo em seguida.

| Coluna | Tipo |
|---|---|
| `profissional` | `text` |

```
Estevão Jorge: atende segunda a sexta das 08:00 às 18:00
Mariana Guedes: atende terça das 13:00 às 19:00, quinta das 13:00 às 19:00
Paulo Lima
```

O nome ocupa a posição do rótulo, como na 4.13. Sem jornada cadastrada, a linha
é só o nome — o `coalesce` sobre o `||` derruba o trecho inteiro em vez de
deixar um "atende" pendurado. Ordem alfabética, que é como se lê lista de gente.
Só os ativos: desligar o dentista na tela Profissionais tira ele da boca do
agente.

> ⚠️ **A view não traz o `id`, de propósito.** Ela é para **conversar**. Para
> marcar com um dentista específico, o `profissional_id` vem de
> `GET /profissionais` da API — um UUID no meio de uma frase falável só serviria
> para o agente ter que extrair de volta, e ninguém lê UUID em voz alta.

```sql
select profissional from public.profissionais_clinica_agente;
```

---

### 4.15. `jornada_texto(profissional)`

A função que transforma grade de horário em frase. Serve às duas coisas:

| Argumento | Lê | Usada por |
|---|---|---|
| `null` | `horario_comercial` | `informacoes_clinica_agente` (4.12) |
| `uuid` | `profissional_horarios` daquele dentista | `profissionais_clinica_agente` (4.14) |

```sql
select public.jornada_texto(null);   -- segunda a sexta das 08:00 às 18:00, sábado das 08:00 às 12:00
```

**O trabalho é agrupar dias seguidos com o mesmo horário.** Sem isso a frase
vira seis linhas repetindo "das 08:00 às 18:00", que ninguém fala assim e o
agente leria inteiro. O agrupamento é a técnica clássica de ilhas:
`ordem - row_number()` fica constante enquanto a sequência não quebra.

**Domingo vira 7 na ordenação.** A semana do banco começa nele, mas a frase em
português começa na segunda — assim sai "segunda a sexta, sábado, domingo", e
não o contrário.

Nenhum dia ativo devolve `NULL`, o `||` propaga e a linha some da view.

> As duas tabelas de horário têm as mesmas colunas relevantes (`dia_semana`,
> `hora_inicio`, `hora_fim`, `ativo`), por isso **uma função só** atende as
> duas. A migração 0007 tinha criado `horario_atendimento_texto()` apenas para a
> clínica; a 0009 unificou e a apagou. Duas cópias da regra de agrupamento seria
> uma a mais do que o necessário, e a segunda envelheceria calada.

---

### 4.16. `n8n_chat_histories` — não existe

**Esta tabela não está no banco.** Conferido:
`select to_regclass('public.n8n_chat_histories')` devolve `null`.

Ela vem do desenho antigo, em que a conversa seria orquestrada pelo **n8n** e a
memória ficaria no nó Postgres Chat Memory, que cria a própria tabela na
primeira mensagem que recebe na vida. Esse caminho foi abandonado antes de rodar
uma mensagem sequer: o agente virou código deste repositório (seção 8), e a
memória dele é `mensagens_whatsapp` (4.17).

A seção continua aqui, e vazia de propósito — o nome aparece em commits antigos,
em documentação anterior e nas quatro colunas `*_chatwoot` de
`crm_clinica_dados` (4.1), que também nunca foram preenchidas. **Quem topar com
a referência precisa achar a resposta em algum lugar**, e a resposta é: não
existe, não vai existir, procure em `mensagens_whatsapp`.

> **Se você está migrando um banco que TEM essa tabela**, ela não pertence a este
> schema. Nada aqui a lê ou escreve, nenhuma migração a cria, e nenhuma tela a
> mostra.

---

### 4.17. `mensagens_whatsapp` · `configuracoes_agente` (migração `0010`)

Criadas para o Agente de IA próprio — a Letícia — que substitui o fluxo do n8n.

**📘 A documentação completa está em
[`agente-ia/README.md`](agente-ia/README.md), seção 6.** Aqui fica só o
resumo, para quem estiver lendo o schema de cima a baixo.

| Objeto | O que é |
|---|---|
| `mensagens_whatsapp` | Cada mensagem trocada. É a memória do agente **e** a fonte da tela Conversas — a mesma, de propósito |
| `configuracoes_agente` | Uma linha: modelo, prompt em uso, liga/desliga, modo teste e o provedor de WhatsApp ativo |
| `agente_deve_responder(text)` | A regra do modo teste, num lugar só |
| `mensagens_whatsapp_atualiza_lead` | Trigger que mantém `ultima_mensagem` — **só conta mensagem do paciente** |
| Bucket `midias-whatsapp` | **Privado**, diferente de `avatars` e `logos` (seção 7) |

Três colunas novas em `crm_clinica_dados`: `agente_pausado`, `assumido_por` e
`assumido_em` — o botão "Assumir conversa".

#### `provedor_whatsapp` (migração `0017`)

Qual ponte com o WhatsApp está ativa: `evolution` ou `uazapi`. **Uma de cada
vez** — o `CHECK` não impede, mas o sistema fala com uma só.

A coluna nasceu com um provedor implementado, de propósito: ela é barata agora
e cara depois. Sem ela, a tela diria "Evolution" em texto fixo, e o dia da
troca viraria caça ao literal espalhado por telas, rotas e mensagens de erro.

> ⚠️ **As credenciais NÃO moram aqui.** Ficam nas secrets do Supabase, fora do
> alcance do navegador. `configuracoes_agente` é lida por `authenticated` com
> acesso total (seção 6): chave de API nessa tabela seria chave visível para
> qualquer pessoa com login no sistema. Esta coluna diz **quem** está ativo,
> nunca **como** se autentica.

> Por que a tela precisa mostrar isso: em 01/09 o servidor da Evolution caiu e o
> único sintoma foi silêncio no WhatsApp. Saber qual provedor está ativo é o que
> diz em qual painel ir olhar — "WhatsApp desconectado", sozinho, não responde
> essa pergunta.

Regra do projeto: mudou o `CHECK`, mude `src/types/index.ts` no mesmo commit.

> ⚠️ **A view `crm_clinica` foi dropada e recriada nessa migração.** Ela é
> `select d.*`, e o Postgres **congela** essa expansão no momento da criação:
> coluna nova na tabela não aparece na view sozinha. `create or replace view`
> também não resolve — as colunas novas entrariam antes de
> `minutos_ultima_mensagem`, mudando a posição de uma coluna existente, o que o
> Postgres recusa.
>
> **Quem acrescentar coluna em `crm_clinica_dados` daqui para frente precisa
> dropar e recriar a view junto**, e refazer o `grant`. Ver `0010`, seção 2.

> ⚠️ **`horario_comercial` é o horário da clínica; `profissional_horarios` é o
> que a agenda realmente oferece.** Os dois podem divergir: anunciar até as
> 18:00 sem nenhum dentista depois das 17:00 faz o agente prometer horário que a
> consulta de disponibilidade recusa em seguida. A Letícia lê o primeiro para
> conversar e o segundo para marcar — e não tem como perceber sozinha que os
> dois discordam.

---

### 4.18. `conversas_lista` (view, migrações `0013` e `0014`)

A coluna da esquerda da tela **Conversas**: uma linha por pessoa que já trocou
mensagem, com a última frase, quantas estão sem ler, quem assumiu e a consulta
marcada.

**Usada por:** [`src/lib/conversas.ts`](src/lib/conversas.ts) e, por ela,
[`ListaConversas.tsx`](src/components/ListaConversas.tsx). O Agente de IA
**não** lê esta view — ela é de tela, não de conversa.

| Coluna | Vem de |
|---|---|
| `lead_id`, `nome_lead`, `whatsapp_lead`, `status` | `crm_clinica_dados` |
| `agente_pausado`, `assumido_por`, `assumido_em` | `crm_clinica_dados` |
| `assumido_por_nome` | join com `usuarios` |
| `ultimo_conteudo`, `ultimo_tipo`, `ultimo_autor`, `ultima_em` | a última linha de `mensagens_whatsapp` |
| `nao_lidas` | contagem em `mensagens_whatsapp`, só `autor = 'paciente'` |
| `data_agendamento` | `crm_clinica_dados` — a consulta ativa mais próxima (`0014`) |

#### Por que é view, e não consulta na tela

O que a lista precisa é **a última mensagem de cada conversa** — um
`distinct on`, que o PostgREST não sabe pedir. Sem a view, a tela teria duas
saídas ruins: uma consulta por conversa (N+1 a cada atualização, e a lista
atualiza a cada mensagem que chega) ou baixar todas as mensagens de todo mundo
para descartar 95% no navegador.

Ela é calculada na leitura, como `crm_clinica` e as três views do agente. O
estado "desatualizada" não existe.

#### "Quem agendou?" se pergunta a `data_agendamento`, nunca ao `status`

É a armadilha desta view, e ela erra **em silêncio**.

A leitura óbvia de "esta pessoa marcou consulta" seria
`status = 'consulta_agendada'`. Mas o trigger `consultas_sincroniza_lead`
(seção 4.7) **preserva** `consulta_realizada` e `paciente_recorrente` quando
alguém marca de novo — de propósito, porque é por esses dois status que
[`src/lib/pessoas.ts`](src/lib/pessoas.ts) separa `/leads` de `/clientes`, e
rebaixá-los jogaria um paciente de volta na lista de contatos a cada retorno.

**Consequência: um paciente que volta e marca continua em
`paciente_recorrente`.** Filtrar por status perderia exatamente quem mais volta
numa clínica de odontologia — tratamento de várias sessões, retorno,
manutenção.

`data_agendamento` não tem esse problema: o mesmo trigger a recalcula para
**qualquer** status, como `min(data_consulta)` das consultas ativas, e a zera
quando não sobra nenhuma. É a única coluna da ficha que responde à pergunta.

A regra vive em `temConsultaMarcada()`, em
[`src/lib/conversas.ts`](src/lib/conversas.ts) — não repita a comparação solta
na tela.

```sql
-- Os que um filtro por status perderia. Toda linha aqui é um erro evitado:
select nome_lead, status, data_agendamento
  from public.crm_clinica_dados
 where data_agendamento is not null
   and status <> 'consulta_agendada';
```

> A coluna entrou **no fim** da lista, e não ao lado de `status`, onde leria
> melhor. `create or replace view` no Postgres só aceita colunas novas no fim;
> reordenar exigiria `drop view`, que derrubaria os grants e deixaria a tela sem
> lista no meio do caminho.

#### Três detalhes que a definem

1. **`join lateral` sem `left`, de propósito.** Quem nunca trocou mensagem não é
   uma conversa, e não aparece na lista. Um lead cadastrado na mão pela recepção
   fica de fora até alguém escrever.
2. **`security_invoker = true`**, pelo mesmo motivo de `crm_clinica`. Sem isso a
   view rodaria com os poderes de quem a criou, e a `anon key` — que é pública,
   vai no bundle do site — leria as conversas de todos os pacientes sem sessão.
3. **Sem `order by` embutido.** A ordem natural é `order=ultima_em.desc`, e quem
   consulta é que pede: `order by` dentro de view é ignorado por qualquer
   consulta que ordene por cima, e dá a falsa impressão de estar garantido.

#### Desempenho

Os três índices que ela usa já vieram da `0010`, e não por acaso:

| Índice | Serve a |
|---|---|
| `mensagens_whatsapp_conversa_idx` (`lead_id, criada_em`) | O `limit 1` da última mensagem |
| `mensagens_whatsapp_nao_lidas_idx` (parcial) | A contagem de não lidas |
| `mensagens_whatsapp_recentes_idx` (`criada_em desc`) | A ordenação da lista |

> ⚠️ **Realtime não assina view.** A tela assina as TABELAS
> `mensagens_whatsapp` e `crm_clinica_dados`, e **relê** esta view quando algo
> chega. Assinar a view não dá erro: simplesmente nunca dispara — a mesma
> armadilha de `crm_clinica` (seção 8.6).

> **Por que reler em vez de remendar com o payload.** O evento traz a linha da
> tabela; a lista precisa da última mensagem, do contador de não lidas e do nome
> de quem assumiu — três coisas calculadas na view. É a mesma decisão da Agenda,
> que recarrega o período em vez de aplicar o payload.

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

`consultas.status` aceita **4** valores (`faltou` entrou na migração `0015`):

| Valor | Significado | Bloqueia horário? |
|---|---|:---:|
| `agendada` | Marcada e ainda de pé *(default)* | **sim** |
| `realizada` | O paciente compareceu | não |
| `cancelada` | Desmarcada, com aviso | não |
| `faltou` | Não compareceu e não avisou | não |

> **`faltou` não é `cancelada`, e a distinção é o motivo de ele existir.** Quem
> liga desmarcando e quem simplesmente não aparece pedem telefonemas
> diferentes, e taxa de falta é métrica de clínica. Jogados na mesma linha, os
> dois viram um número que não responde nada.
>
> No **funil**, porém, os dois caem no mesmo lugar (`consulta_cancelada`): as
> duas situações significam "não tem consulta marcada e precisa reagendar". O
> motivo mora na consulta, que é onde ele pertence.

Só `agendada` participa da restrição de exclusão `consultas_sem_sobreposicao` —
consulta que não aconteceu não segura horário na agenda.

> **`realizada` é a única porta automática para `/clientes`.** Ver a tabela do
> trigger, logo abaixo.

### O funil acompanha a agenda sozinho

O trigger **`consultas_sincroniza_lead`** (função
`public.sincronizar_agendamento_lead`) mantém a ficha do lead coerente com o que
acontece na agenda:

| Escrita em `consultas` | Efeito em `crm_clinica_dados` |
|---|---|
| INSERT com `status = 'agendada'` | `data_agendamento` = a consulta ativa mais próxima do lead; `data_marcacao_agendamento` = agora; `status` → `consulta_agendada` |
| UPDATE de `data_consulta` (remarcação) | `data_agendamento` é recalculada. **`data_marcacao_agendamento` não muda** |
| UPDATE para `status = 'cancelada'` ou `'faltou'`, **restando outra consulta ativa** | `data_agendamento` passa para a próxima. **O `status` não muda** |
| UPDATE para `status = 'cancelada'` ou `'faltou'`, **era a última** | `data_agendamento` = nulo; `status` → `consulta_cancelada` |
| UPDATE para `status = 'realizada'`, **1ª do lead** | `data_agendamento` recalculada; `status` → `consulta_realizada` — **a pessoa vira Paciente aqui** |
| UPDATE para `status = 'realizada'`, **2ª ou mais** | `status` → `paciente_recorrente` |

> ⚠️ **Os dois últimos entraram na `0015`, e antes deles NADA promovia ninguém a
> Paciente.** O trigger só reagia a `agendada` e `cancelada`, e — pior — nenhuma
> tela marcava consulta como realizada: a Agenda só sabia cancelar. O paciente
> era atendido e ficava em "Consulta Agendada" para sempre.

**Recorrente é contado, não digitado.** O trigger faz `count(*)` das consultas
`realizada` do lead na hora, em vez de deduzir do status anterior: assim a regra
é idempotente e se corrige sozinha se alguém editar uma consulta antiga na mão.

Quatro decisões embutidas aí:

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
4. **Quem escreve a baixa é a tela; quem move o funil é o trigger.** A Agenda e
   o aviso de pendências gravam só `consultas.status`. A promoção a Paciente é
   consequência, e é consequência **atômica**: duas telas escrevendo o funil na
   mão divergiriam na primeira falha de rede.

Está num trigger, e não no React, porque a API do Agente de IA (seção 8) não
passa pelo React. Escreveu consulta, o funil acompanha — venha de onde vier.

> **`status = 'realizada'` era deliberadamente ignorado pelo trigger — até a
> `0015`.** A ideia era que marcar comparecimento fosse ato manual na ficha,
> junto com o `valor_pago`. Na prática ninguém fazia: nenhuma tela sequer
> oferecia o botão, e o resultado foi que **ninguém nunca virava Paciente**.
>
> Hoje a baixa é explícita — a recepção responde "compareceu" ou "faltou", e o
> trigger tira a conclusão. Continua não havendo salto automático a partir do
> calendário: alguém precisa confirmar. O que mudou é que agora existe onde
> confirmar, e um aviso que cobra.

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

RLS está **ativo nas 12 tabelas**. São 13 políticas:

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
| `mensagens_whatsapp` | `mensagens_whatsapp_all` | ALL | `authenticated` — acesso total |
| `configuracoes_agente` | `configuracoes_agente_all` | ALL | `authenticated` — acesso total |
| `usuarios` | `usuarios_update_own` | UPDATE | **só o próprio** (`auth.uid() = id`) |

Mais 8 políticas em `storage.objects` (seção 7).

> **As duas Edge Functions usam a `service_role key`, que ignora o RLS** — são
> servidor, não sessão de usuário. O que limita cada uma não é o RLS:
> a `agenda/` é limitada pela superfície dos sete endpoints; a `whatsapp/`,
> pela lista fechada da seção 8.1, que é disciplina de código.

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

Três buckets. Os dois primeiros são **públicos**, porque o código usa
`getPublicUrl()` neles; o terceiro é **privado**, e a diferença não é detalhe.

| Bucket | Público? | Caminho | Conteúdo |
|---|:---:|---|---|
| `avatars` | sim | `{user_id}/avatar.{ext}` | Foto de perfil |
| `logos` | sim | `clinic/logo.{ext}` | Logo da clínica |
| `midias-whatsapp` | **não** | `{lead_id}/{mensagem_id}.{ext}` | O áudio e a foto que o paciente mandou |

| Política | Bucket | Operação | Regra |
|---|---|---|---|
| `avatars_public_read` | avatars | SELECT | público |
| `avatars_own_insert` | avatars | INSERT | só na própria pasta (`auth.uid()`) |
| `avatars_own_update` | avatars | UPDATE | só na própria pasta |
| `logos_public_read` | logos | SELECT | público |
| `logos_team_insert` | logos | INSERT | qualquer autenticado |
| `logos_team_update` | logos | UPDATE | qualquer autenticado |
| `midias_whatsapp_equipe_le` | midias-whatsapp | SELECT | qualquer autenticado |
| `midias_whatsapp_equipe_grava` | midias-whatsapp | INSERT | qualquer autenticado |

> INSERT **e** UPDATE são necessários em `avatars` e `logos` porque o upload usa
> `{ upsert: true }`. Só com INSERT, a segunda troca de foto falha.

> ⚠️ **`midias-whatsapp` é privado de propósito, e precisa continuar assim.**
> Ali ficam áudios e fotos que pacientes mandaram — foto de boca, inclusive. Um
> bucket público entrega isso a quem descobrir a URL, sem login. Por isso a tela
> abre esses arquivos por **signed URL**, e não por `getPublicUrl()`.

> Quem grava é a Edge Function, com a `service_role key`, que não passa por
> política nenhuma. As duas políticas acima existem para a **equipe logada** ver
> a mídia na tela e anexar arquivo ao responder.

---

## 8. Integração com o Agente de IA

O agente é a **Letícia**, e ela **mora dentro deste projeto**: a Edge Function
[`supabase/functions/whatsapp/`](supabase/functions/whatsapp/). Quem entrega as
mensagens é a **Evolution API** (WhatsApp não oficial, v2), que chama a função
por webhook. Quem pensa é a OpenAI.

```
paciente ──▶ Evolution ──webhook──▶ Edge Function `whatsapp` ──▶ OpenAI
                  ▲                        │        ▲               │
                  └──── resposta ──────────┘        └── ferramentas ─┘
                                           │
                                           ▼
                                    ESTE BANCO
```

Tudo o que ela é — prompt, ferramentas, modelo, decisões — está documentado em
[`agente-ia/README.md`](agente-ia/README.md). Esta seção cobre só o que ela
encosta **no banco**.

> **O desenho antigo, com n8n e Chatwoot, foi abandonado.** Não é mais uma
> automação externa apontada para cá: é código deste repositório. Três
> consequências para quem lê o schema:
>
> - **`n8n_chat_histories` não existe** e não vai existir. A memória da conversa
>   é `mensagens_whatsapp` ([4.17](#417-mensagens_whatsapp--configuracoes_agente-migração-0010)).
>   Ver [4.16](#416-n8n_chat_histories--não-existe).
> - **As quatro colunas `*_chatwoot`** de `crm_clinica_dados` continuam no
>   schema e **ninguém escreve nelas** ([4.1](#41-crm_clinica_dados--crm_clinica)).
> - **A chave de acesso não é colada em lugar nenhum.** O Supabase injeta a
>   `service_role key` na Edge Function; ela não passa por configuração de
>   ferramenta externa (8.2).

### 8.1. O que o agente toca no banco

Esta é a lista fechada. Nada fora dela é acessado pela função `whatsapp`.

| Objeto | Tipo | Acesso | Para quê |
|---|---|:---:|---|
| `crm_clinica` | view sobre `crm_clinica_dados` | **lê e grava** | Cria o lead na primeira mensagem, avança `iniciou_conversa` → `conversando`, e grava `nome_lead`, `procedimento_interesse` e `resumo_conversa` pela ferramenta `atualizar_ficha` |
| `mensagens_whatsapp` | tabela (4.17) | **lê e grava** | A memória da conversa: cada mensagem trocada, dos dois lados. Lê as últimas 30 para montar o histórico |
| `consultas` | tabela (4.2) | **grava só por função SQL** | Marcar, remarcar e cancelar passam por `agenda_marcar`, `agenda_remarcar` e `agenda_cancelar` (4.11). Lê direto, **só as daquele lead**: a consulta futura entra na ficha do prompt, e o histórico sai pela ferramenta `historico_do_paciente` |
| Storage `midias-whatsapp` | bucket privado (7) | **grava** | O áudio e a foto que o paciente mandou |
| `informacoes_clinica_agente` | view (4.12) | **só lê** | Nome, endereço, bairro, cidade/UF, CEP, horário de atendimento, Maps, Instagram e site — em frases prontas |
| `procedimentos_clinica_agente` | view (4.13) | **só lê** | Os procedimentos ativos, um por linha, com a descrição curta |
| `profissionais_clinica_agente` | view (4.14) | **só lê** | Os dentistas ativos e a jornada de cada um |
| `servicos_clinica` | tabela (4.6) | **só lê** | A `descricao_longa` de **um** procedimento, pela ferramenta `detalhes_do_procedimento` — nunca a tabela inteira |
| `configuracoes_agente` | tabela (4.17) | **só lê** | Modelo, prompt em vigor, e o `agente_deve_responder()` que decide se aquele número é atendido |
| `configuracoes_clinica` | tabela (4.4) | **só lê** | Só o `fuso_horario`, sem o qual toda data sai errada |

**Fora do alcance dela:** `profissionais`, `profissional_horarios`,
`profissional_bloqueios`, `horario_comercial`, `usuarios` e `api_tokens`. As
tabelas de cadastro alimentam as views acima e as funções da agenda — e é por
ali que a informação chega até ela, já filtrada e já legível.

```sql
-- o que vai dentro do prompt, a cada mensagem
select informacao   from public.informacoes_clinica_agente;
select procedimento from public.procedimentos_clinica_agente;
select profissional from public.profissionais_clinica_agente;
```

> **As três views são para conversar, não para operar.** Nenhuma traz `id`. O
> `profissional_id` que a agenda precisa é resolvido **pelo nome**, dentro do
> código da ferramenta — uuid em prompt é convite para alucinação.

> **`minutos_ultima_mensagem` e `ultima_mensagem` ninguém precisa gravar.** O
> trigger de `mensagens_whatsapp` (4.17) carimba `ultima_mensagem`, e a view
> calcula os minutos na leitura.

> **Os follow-ups (`follow_up_1/2/3`) ainda não têm quem os escreva.** As
> colunas existem desde a `0001` e o Dashboard já as lê; a rotina que carimba
> depende de um agendador, que não foi construído.

### 8.2. A `service_role key` e o RLS

As políticas de RLS liberam apenas o papel `authenticated` — sessões de usuário
logado. **A Edge Function não tem sessão.**

O Supabase entrega a `service_role key` às Edge Functions por variável de
ambiente (`SUPABASE_SERVICE_ROLE_KEY`), e é ela que
[`_shared/db.ts`](supabase/functions/_shared/db.ts) usa em todo `fetch` ao
PostgREST. Essa chave **passa por cima do RLS**: a disciplina de só encostar no
que está na lista de 8.1 é do código, não do banco.

Duas consequências:

- **A chave nunca vai para o frontend.** No navegador roda a `anon key`,
  protegida por RLS. Se algum dia a `service_role` aparecer em `src/`, é
  incidente de segurança, não descuido de estilo.
- **Se alguém apontar outra automação para este banco**, ela precisa da mesma
  chave. Com a `anon key`, as gravações **falham em silêncio**: `200 OK`, zero
  linhas afetadas, nenhum lead no sistema.

### 8.3. O caminho de uma mensagem

1. A Evolution chama `POST /` da função, com o segredo em `x-webhook-segredo`
2. A função descarta grupo, newsletter e status, e **grava a mensagem** em
   `mensagens_whatsapp` — antes de qualquer coisa, para nada se perder
3. Se o número ainda não tem ficha, cria o lead em `crm_clinica` com
   `status = 'iniciou_conversa'`
4. Áudio e foto vão para o bucket `midias-whatsapp`; o áudio ainda é
   transcrito, e a transcrição volta para a coluna `conteudo`
5. **Espera 8 segundos.** Se chegou mensagem nova nesse intervalo, esta execução
   desiste — quem responde é a última. É o que faz a Letícia responder as três
   mensagens picadas de uma vez, como gente
6. `agente_deve_responder()` decide: agente ligado? conversa não assumida por
   um atendente? número liberado no modo teste?
7. Monta o prompt (as três views + a data de hoje) e as últimas 30 mensagens
8. Chama o modelo, executa as ferramentas que ele pedir, e repete até ele
   parar de pedir — no máximo 6 voltas
9. A resposta é quebrada em 2 ou 3 mensagens, cada uma com "digitando…" antes
10. Grava o que respondeu em `mensagens_whatsapp` e avança
    `iniciou_conversa` → `conversando`

### 8.4. O que o agente NÃO faz

**Não insere em `consultas`.** Marcar consulta não é gravar uma linha: é
conferir a jornada do dentista, recusar conflito com o que já existe, escolher
quem está livre e, ao remarcar, mover tudo num passo atômico. Um `INSERT` direto
pularia tudo isso e, ao bater na restrição de sobreposição, devolveria um
`23P01` cru — sem nenhuma frase para dizer a quem está esperando no WhatsApp.
Por isso as ferramentas chamam as funções da seção 4.11, e só elas.

**Não grava `data_agendamento` na ficha do lead.** Era assim antes de a Agenda
existir. Hoje o resultado seria uma consulta que aparece no CRM e não no
calendário — duas telas contando histórias diferentes sobre o mesmo fato. A
fonte da verdade é a linha em `consultas`; `data_agendamento` virou reflexo,
mantido pelo trigger `consultas_sincroniza_lead`.

**Não grava WhatsApp sem o código do país.** O formato canônico é
`5511987654321`, só dígitos. O número local entra, mas passa a ser um segundo
registro do mesmo telefone, invisível para a busca e para a unicidade (4.1). Um
`23505` na volta significa que o lead daquele número já existe: busque por
`whatsapp_lead` e siga com o que voltou.

**Não escreve em cadastro.** Procedimentos, profissionais, jornadas e horários
são da clínica, feitos pelas telas. Ela lê o que precisa pelas views de 8.1.

**Não decide sozinha se responde.** Quem decide é `agente_deve_responder()`, no
banco. Enquanto o modo teste estiver ligado, ela grava e mostra na tela toda
mensagem que chegar — e responde só aos números da lista.

### 8.5. A API da agenda continua existindo — para quem é de fora

A Edge Function [`agenda/`](supabase/functions/agenda/) e seus sete endpoints
não foram substituídos. Contrato e cURLs em [`API_AGENTE.md`](API_AGENTE.md).

A diferença é o caminho, não a regra:

| Quem | Como chega na agenda | Autenticação |
|---|---|---|
| A Letícia (função `whatsapp`) | Chama as funções SQL **direto**, por RPC no PostgREST | A `service_role key` que o Supabase injeta |
| Qualquer integração externa | `POST /marcar`, `GET /disponibilidade`… na função `agenda` | Token próprio, criado em Configurações → Token e API |

**As duas descem para as mesmas funções da 4.11.** A regra de jornada, a escolha
de dentista livre e a trava de sobreposição vivem num lugar só — e é isso que
mantém as duas portas honestas entre si. A `agenda/` acrescenta, para quem está
de fora, o que a Letícia não precisa: conferência de token, tradução de recusa
em frase pronta e HTTP.

O que existe no banco por causa dessa história:

| Peça | Por quê |
|---|---|
| `consultas_sem_sobreposicao` (4.2) | Recepção e agente escrevem ao mesmo tempo; só o banco fecha a janela |
| `chave_externa` UNIQUE (4.2) | Retry não pode virar consulta duplicada. A Letícia usa `wa_{lead}_{data_hora}` |
| `profissional_bloqueios` (4.9) | Sem isso não existe "disponibilidade" confiável |
| `configuracoes_clinica.fuso_horario` (4.4) | Servidor em UTC; sem fixar o fuso, a disponibilidade erra em 3 horas |
| `origem` (4.2) | Sem isso é impossível medir ou auditar o que o agente marcou sozinho |

Duas coisas que valem para as **duas** Edge Functions:

- **Nenhuma delas pode ter dependência externa.** O runtime sobe com
  `--no-remote`; um `import` de `supabase-js` derruba a função inteira com
  `BOOT_ERROR` antes de rodar uma linha. Toda conversa com o banco é `fetch` no
  PostgREST. Import relativo de `_shared/` funciona normalmente.
- **A regra de disponibilidade em SQL espelha [`src/lib/agenda.ts`](src/lib/agenda.ts).**
  Se divergirem, o agente oferece horário que a recepção vê como ocupado. Mudou
  uma, mude a outra.

---

### 8.6. Realtime — atualização automática da tela

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

1. **Recriar qualquer view sem `security_invoker = true`** → o RLS deixa de valer.
   Vale para `crm_clinica` e para as três views do agente (4.12 a 4.14).
2. **Assinar Realtime na view `crm_clinica`** → a inscrição é criada sem erro e
   nunca dispara. Assine sempre `crm_clinica_dados` (seção 8.6).
3. **Tentar escrever em `minutos_ultima_mensagem`** → erro; é coluna calculada.
4. **Automação usando a `anon key`** → gravações falham sem erro visível.
5. **Alterar o `CHECK` de `status` sem atualizar `src/types/index.ts`**
   (ou o contrário) → compila e quebra só em runtime.
6. **Criar a linha em `usuarios` na mão** → conflito com o trigger.
7. **Inserir duas linhas em `configuracoes_clinica`** → bloqueado pelo índice
   singleton; o código não trata esse erro.
8. **Duplicar `dia_semana` em `horario_comercial`** → bloqueado pelo UNIQUE.
9. **Confundir `data_agendamento` com `data_marcacao_agendamento`** → métricas
   do Dashboard erradas, sem nenhum sinal de erro.
10. **Excluir um lead** → apaga em cascata todas as consultas e o histórico
    financeiro dele.
11. **Rodar `0002` sem `0001`** → falha: o `0002` usa `set_updated_at` e altera
    `consultas`, que só existem depois do primeiro arquivo.
12. **Repetir a chamada depois de um `23P01`** → dá exatamente o mesmo erro. Isso
    não é falha transitória: é o banco recusando duas consultas no mesmo horário
    do mesmo profissional. A saída é outro horário.
13. **Automação inserindo em `consultas` sem `chave_externa`** → o retry cria uma
    segunda consulta idêntica e o paciente recebe duas confirmações.
14. **Gravar `data_agendamento` direto na ficha do lead pela automação** → a
    consulta aparece no CRM e some da Agenda. A fonte da verdade é `consultas`.
15. **Cadastrar profissional sem jornada** → ele existe, mas a agenda o trata
    como quem nunca atende, e todo agendamento com ele vira "fora do expediente".
16. **`horario_comercial` e `profissional_horarios` discordando** → é a armadilha
    mais silenciosa desta lista, porque **não há erro nenhum**: os dois cadastros
    estão certos cada um por si. A clínica que anuncia sábado das 08:00 às 12:00
    sem nenhum dentista com sábado na jornada faz o agente dizer que atende no
    sábado — e, na mesma conversa, não achar horário nenhum. O paciente entende
    que a clínica está enrolando. **Conferir sempre que mexer numa das duas**,
    comparando `jornada_texto(null)` com `jornada_texto(id)` de cada dentista
    (4.15).
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
-- Objetos criados (esperado: 12 tabelas + 5 views)
select table_name, table_type from information_schema.tables
where table_schema = 'public' order by table_name;

-- Tabelas de `public` sem RLS (esperado: NENHUMA linha)
select relname from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;

-- Políticas (esperado: 21 — 13 em public + 8 em storage)
select schemaname, count(*) from pg_policies
where schemaname in ('public','storage') group by schemaname;

-- Divergência entre o horário anunciado e o que a agenda oferece (armadilha 16)
select 'clínica' as quem, public.jornada_texto(null) as jornada
union all
select p.nome || ' ' || p.sobrenome, public.jornada_texto(p.id)
  from public.profissionais p where p.ativo;

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
