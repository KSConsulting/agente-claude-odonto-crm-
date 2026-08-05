# CLAUDE.md

Orientações para agentes trabalhando neste repositório.

---

## O que é este projeto

Sistema de gestão para **clínica odontológica**, acoplado a um **Agente de IA**
que atende pacientes pelo WhatsApp.

O agente conversa, qualifica e agenda; este sistema é onde a equipe da clínica
acompanha tudo — funil de leads, agendamentos, faturamento e métricas de
desempenho do próprio agente.

> **Histórico que importa:** este código nasceu como sistema para uma clínica de
> **cirurgia plástica** e foi adaptado para odontologia. O histórico do Git vem
> do repositório antigo (`cirurgia-plastica`), então commits anteriores a agosto
> de 2026 falam de outro contexto. O schema já era genérico (`crm_clinica`,
> `servicos_clinica`), então a adaptação foi mais de **conteúdo e identidade
> visual** do que de estrutura.

**Idioma:** todo o produto é em **português do Brasil** — interface, nomes de
colunas, identificadores de status e comentários. Mantenha assim.

---

## Comandos

```bash
npm install       # instalar dependências
npm run dev       # servidor de desenvolvimento (Vite)
npm run build     # tsc -b && vite build
npm run lint      # ESLint
npm run preview   # pré-visualizar o build
```

Não existe suíte de testes. Ao mexer em algo, valide com `npm run build`
(que roda o TypeScript) e `npm run lint`.

---

## Stack

| Camada | Tecnologia |
|---|---|
| UI | React 19 + TypeScript 6 |
| Build | Vite 8 |
| Rotas | react-router-dom 7 |
| Backend | Supabase (PostgreSQL 17 + Auth + Storage) |
| Gráficos | recharts |
| Kanban | @dnd-kit |
| PDF | jspdf + jspdf-autotable |
| Ícones | lucide-react |
| Força de senha | zxcvbn |

---

## Banco de dados

**📘 A documentação completa está em [`DATABASE.md`](DATABASE.md).** Leia antes
de tocar em qualquer coisa relacionada a dados — schema, RLS, Storage,
integração com o agente e armadilhas conhecidas estão todos lá.

A migração executável fica em
[`supabase/migrations/0001_schema_inicial.sql`](supabase/migrations/0001_schema_inicial.sql).

A migração é aplicada em **dois arquivos, nesta ordem**: `0001_schema_inicial.sql`
e depois `0002_agenda_profissionais.sql` (agenda e profissionais).

Os pontos que mais causam erro:

1. **`crm_clinica` é uma VIEW**, não uma tabela. A tabela física é
   `crm_clinica_dados`. A view acrescenta `minutos_ultima_mensagem`, calculado
   na leitura. Escrita funciona normalmente (view auto-atualizável), mas **nunca
   grave na coluna calculada**.
2. **Os valores de `status` vivem em dois lugares:** o `CHECK` no banco e os
   tipos `LeadStatus` / `ConsultaStatus` em [`src/types/index.ts`](src/types/index.ts).
   Alterou um, altere o outro — nada sincroniza isso automaticamente.
3. **A automação (n8n/Chatwoot) precisa da `service_role key`.** As políticas de
   RLS só liberam `authenticated`. Com a `anon key`, as gravações falham em
   silêncio (`200 OK`, zero linhas).
4. **Realtime assina a TABELA, não a view.** Leitura e escrita usam
   `crm_clinica`; as assinaturas de `postgres_changes` usam
   `crm_clinica_dados`. O Postgres só replica tabelas — assinar a view não dá
   erro, apenas nunca dispara. (`consultas` já é tabela, então a Agenda assina
   ela direto.)
5. **Não existe tabela de agenda.** A agenda de um profissional são as consultas
   com o `profissional_id` dele. Cadastrar o profissional já cria a agenda.
6. **`consultas` tem uma restrição de exclusão** (`consultas_sem_sobreposicao`)
   que impede duas consultas ativas se sobrepondo na mesma agenda. Ela devolve
   `23P01`, e a interface precisa traduzir isso — repetir a chamada dá o mesmo
   erro.

---

## Estrutura

```
src/
├── main.tsx                    ponto de entrada
├── App.tsx                     rotas
├── index.css                   ÚNICO css importado: fonte, tailwind, animações
├── App.css                     ⚠️ arquivo morto — não é importado em lugar nenhum
├── lib/
│   ├── supabase.ts             cliente Supabase (lê as env vars)
│   ├── pessoas.ts              regra que separa Lead de Paciente
│   ├── cores.ts                paleta das agendas (cor do profissional)
│   └── agenda.ts               lógica pura: datas, conflito, layout dos blocos
├── types/
│   └── index.ts                tipos espelhando o schema do banco
├── components/
│   ├── Layout.tsx              casca com Sidebar + <Outlet/>
│   ├── Sidebar.tsx             navegação lateral, logo, logout
│   ├── ProtectedRoute.tsx      guarda de sessão
│   ├── PessoasPage.tsx         implementação compartilhada de /leads e /clientes
│   ├── AgendaSemana.tsx        grade semanal (7 colunas × horas)
│   ├── AgendaMes.tsx           grade mensal (semanas inteiras)
│   ├── NovoAgendamentoModal.tsx  criar consulta; cria o paciente se não existir
│   └── ConfirmDeleteModal.tsx  modal de confirmação reutilizável
└── pages/
    ├── Login.tsx               tela dividida (marca + formulário)
    ├── Dashboard.tsx           métricas, gráficos, próximas consultas
    ├── CRM.tsx                 Kanban do funil (drag and drop)
    ├── Agenda.tsx              calendário de todas as agendas + filtros
    ├── Profissionais.tsx       dentistas: nome, cor e jornada
    ├── Leads.tsx               invólucro: <PessoasPage mode="leads" />
    ├── Clientes.tsx            invólucro: <PessoasPage mode="clientes" />
    ├── LeadDetail.tsx          ficha do lead + consultas + anotações
    └── Configuracoes.tsx       perfil, clínica, horários, procedimentos
```

### A agenda não é uma entidade

`Agenda.tsx` desenha as consultas agrupadas por `profissional_id`. Não há tabela
`agendas`, nem tela para criar uma: cadastrar o profissional já basta, e a cor
escolhida no cadastro é a cor dos blocos no calendário.

O calendário é desenhado à mão, sem biblioteca. As prontas (FullCalendar e
afins) trazem CSS e sistema de temas próprios, que brigariam com a estilização
inline daqui, e somariam peso a um bundle que já está grande.

A lógica de datas, conflito e posicionamento fica em
[`src/lib/agenda.ts`](src/lib/agenda.ts), fora de qualquer componente. Isso é
proposital: a API do Agente de IA vai precisar responder "que horários estão
livres?" com estas mesmas regras, só que em SQL. **Mudou uma regra aqui, a outra
implementação precisa acompanhar** — se divergirem, o agente oferece horário que
a recepção vê como ocupado.

### Leads e Clientes são a mesma implementação

`/leads` e `/clientes` leem a **mesma tabela** e se diferenciam só pelo status.
Por isso existe um único [`PessoasPage.tsx`](src/components/PessoasPage.tsx) com
um `mode`, e duas páginas de 4 linhas que o instanciam. A configuração de cada
modo (título, textos, ícone, rótulo do botão, nome do arquivo exportado) fica no
objeto `CONFIG`, no topo do arquivo.

A regra da separação mora em [`src/lib/pessoas.ts`](src/lib/pessoas.ts) —
**só ali**. É usada pelas duas páginas e pela tela de detalhe. Ela precisou sair
do `PessoasPage.tsx` porque exportar função de um arquivo que também exporta
componente quebra o Fast Refresh (o ESLint acusa isso).

---

## Rotas e autenticação

```
/login              público
/                   Dashboard              ┐
/crm                CRM (Kanban)           │
/agenda             Agenda (calendário)    │
/leads              Contatos (Leads)       │ dentro de ProtectedRoute
/clientes           Pacientes (Clientes)   │ e de Layout (Sidebar)
/leads/:id          Detalhe da pessoa      │
/profissionais      Profissionais          │
/configuracoes      Configurações          ┘
*                   redireciona para /
```

> `/leads/:id` atende **tanto leads quanto pacientes** — é a mesma entidade. O
> botão "voltar" da tela de detalhe decide o destino pelo status, para não jogar
> um paciente de volta na lista de contatos.

[`ProtectedRoute.tsx`](src/components/ProtectedRoute.tsx) verifica a sessão com
`supabase.auth.getSession()` e escuta `onAuthStateChange`. Sem sessão, redireciona
para `/login`.

O login tem proteção contra força bruta no cliente: 5 tentativas, depois 30
segundos de bloqueio com contagem regressiva.

---

## Convenções de código

### Estilização: inline, não Tailwind

O Tailwind **está instalado e importado** (`@tailwindcss/vite`, `@import
"tailwindcss"` no `index.css`), mas **nenhuma classe utilitária é usada** no
projeto. Toda a estilização é feita com objetos `style={{ }}` inline.

Os únicos `className` existentes são animações próprias definidas no
[`index.css`](src/index.css) — `fade-in` e `fade-in-1` … `fade-in-6`, que
escalonam a entrada dos blocos da página — mais classes de media query
declaradas localmente no próprio componente.

**Siga o padrão inline.** Misturar Tailwind agora deixaria a base inconsistente.

### Outras convenções

- Componentes: `export default function NomeDoComponente()`
- Sem ponto e vírgula no fim das linhas
- Aspas simples
- Media queries: bloco `<style>` dentro do componente (ver `Login.tsx`)
- Estados de erro: mensagem inline em caixa vermelha, sem `alert()`
- Feedback de sucesso: estado `saved` temporário, limpo com `setTimeout` de ~2s

---

## Design system

### Paleta — azul clínico

Migrada do rosé original (que era de cirurgia plástica) em toda a aplicação.

| Papel | Cor | Uso |
|---|---|---|
| Principal | `#1E6E8C` | botões, links, ícones, destaques |
| Principal escuro | `#17576F` | hover |
| Principal claro | `#4C90A8` | estado de carregamento |
| Fundo suave | `#EAF3F6` | blocos de ícone, realces |
| Fundo da página | `#F2F6F7` | corpo |
| Texto | `#16232B` | títulos e texto principal |
| Texto secundário | `#6B818C` | legendas, rótulos |
| Borda | `#DCE6EA` | bordas de card e input |
| Divisória | `#EDF2F4` | linhas de tabela |
| Fundo alternado | `#F7FAFB` | zebra de tabela, hover |

Fonte: **Plus Jakarta Sans**, carregada do Google Fonts por `@import` na
primeira linha do [`index.css`](src/index.css). Como a estilização é inline,
cada componente repete `fontFamily: "'Plus Jakarta Sans', sans-serif"` — é
verboso, mas é o padrão da base.

### Cores de status — não são cores de marca

Comunicam significado e **não devem ser trocadas** junto com a identidade
visual. Definidas de forma duplicada em `CRM.tsx`, `Dashboard.tsx`, `Leads.tsx`
e `LeadDetail.tsx`.

| Status | Cor | Fundo |
|---|---|---|
| `iniciou_conversa` | `#1E6E8C` | `#EAF3F6` |
| `conversando` | `#4F46E5` | `#EEF2FF` |
| `consulta_agendada` | `#1A7A48` | `#E8F8EF` |
| `consulta_cancelada` | `#DC2626` | `#FEF2F2` |
| `follow_up_1/2/3_feito` | `#D97706` | `#FFFBEB` |
| `consulta_realizada` | `#FFFFFF` | `#14532D` |
| `paciente_recorrente` | `#7C3AED` | `#F3E8FF` |

> `iniciou_conversa` usa deliberadamente a cor da marca (lead novo = destaque).
> Por isso `conversando` foi movido para índigo: os dois eram azuis e ficavam
> indistinguíveis no Kanban.

### Cores das agendas — também são dado

A cor de cada profissional segue a mesma lógica: distingue uma agenda da outra
no calendário, não comunica a marca. A paleta fica em
[`src/lib/cores.ts`](src/lib/cores.ts) — dez cores separáveis entre si e
legíveis com texto branco.

É uma lista fixa de propósito. Um seletor de cor livre garante que, mais cedo ou
mais tarde, alguém escolha amarelo-limão e o bloco suma no fundo branco. O banco
aceita qualquer hex válido, então ampliar a paleta não exige migração — e
`fundoSuave()` tem fallback para cores fora da lista.

### Ícones

`lucide-react`. **Ela não tem ícone de dente** — foram verificados os 1.943
ícones do pacote. O dente é um SVG próprio em
[`Login.tsx`](src/pages/Login.tsx), seguindo o mesmo estilo (viewBox 24, traço
~1.7, pontas arredondadas, sem preenchimento). Reaproveite esse componente em
vez de desenhar outro.

O **favicon** (`public/favicon.svg`) usa o mesmo dente, em versão preenchida
(branco sobre quadrado arredondado `#1E6E8C`) — traço fino some em 16×16. Se o
desenho do dente mudar, mude nos dois lugares.

A aba do navegador é `Odonto Clinica` e o documento é `lang="pt-BR"`, definidos
em [`index.html`](index.html).

---

## Variáveis de ambiente

```env
VITE_SUPABASE_URL=https://SEU_REF.supabase.co
VITE_SUPABASE_ANON_KEY=sua_anon_key
```

Lidas em [`src/lib/supabase.ts`](src/lib/supabase.ts). O `.env` está no
`.gitignore` — **nunca comite credenciais**.

A `anon key` é pública por natureza (vai no bundle, protegida por RLS). A
`service_role key` **jamais** entra neste projeto.

---

## Regras do projeto

### 1. A documentação faz parte da entrega — sempre

**Nenhuma mudança está concluída enquanto a documentação não refletir ela.**
Isto não é opcional nem "quando der tempo": é parte da mesma tarefa, no mesmo
commit.

| Se você mexeu em… | Atualize |
|---|---|
| Tabela, coluna, índice, política de RLS, trigger, view | [`DATABASE.md`](DATABASE.md) **e** o SQL em `supabase/migrations/` |
| Valores de `status` | `DATABASE.md` (seção 5) + [`src/types/index.ts`](src/types/index.ts) + os mapas de cor nas 4 páginas |
| Bucket ou política de Storage | `DATABASE.md` (seção 7) |
| Paleta, fonte, convenção de estilo | `CLAUDE.md` (Design system) |
| Rota, página, componente novo | `CLAUDE.md` (Estrutura / Rotas) |
| Dependência, script do `package.json` | `CLAUDE.md` (Stack / Comandos) |
| Correção de algo listado em Débito técnico | Remova o item de `CLAUDE.md` |
| Variável de ambiente | `CLAUDE.md` + `DATABASE.md` (seção 1.3) |

Ao mudar o banco, **prefira verificar contra o banco real** (consultas da seção
10 do `DATABASE.md`) em vez de assumir que o SQL escrito foi o que rodou.

### 2. Demais regras

1. **Nada de marcas registradas** em nomes de procedimento. Nem no banco, nem na
   interface, nem nos prompts do Agente de IA. Use a descrição genérica:
   "Alinhadores Transparentes", não "ClearCorrect" ou "Invisalign".
2. **Tipos e banco andam juntos.** Mudou o `CHECK` de `status`? Mude
   `src/types/index.ts` no mesmo commit.
3. **A tela de login é pré-autenticação.** O RLS bloqueia qualquer leitura sem
   sessão — não tente carregar `servicos_clinica` ali. A lista de procedimentos
   exibida no login é fixa no código, de propósito.
4. **Não comite `.env`, chaves ou tokens.**

---

## Débito técnico conhecido

Problemas reais que já existiam e ainda não foram tratados. Não são regressões.

### ESLint acusa 10 erros

- **5x — `ErrorMsg` declarado dentro do render** em
  [`Configuracoes.tsx:180`](src/pages/Configuracoes.tsx#L180). Não é só estilo:
  componentes criados durante o render são recriados a cada renderização e
  **perdem o estado**. É um bug esperando acontecer. A correção é mover a
  declaração para fora do componente.
- **5x — uso de `any`** em `CRM.tsx`, `Configuracoes.tsx` e `Dashboard.tsx`,
  além de uma variável não utilizada (`_e` em `CRM.tsx:123`).

### Bundle de 2.2 MB (812 KB gzip)

Acima do recomendado. `jspdf`, `html2canvas` e `recharts` são carregados sempre,
mas só usados em telas específicas. Resolve-se com `import()` dinâmico e code
splitting.

### Duplicação das cores de status

O mesmo mapa está repetido em quatro arquivos. Deveria ser um módulo único
compartilhado.

### Arquivos mortos

- **`src/App.css`** — o único CSS importado é o `index.css` (em `main.tsx`).
- **`public/icons.svg`** — não é referenciado em lugar nenhum.
- **`src/assets/react.svg` e `src/assets/vite.svg`** — sobras do template.

Nenhum deles quebra nada — mas confundem quem procura onde algo está definido.

---

## Integração com o Agente de IA

A tabela `crm_clinica_dados` guarda os identificadores do **Chatwoot**
(`id_conta_chatwoot`, `id_conversa_chatwoot`, `id_lead_chatwoot`,
`inbox_id_chatwoot`) e os carimbos de follow-up (`follow_up_1/2/3`).

O fluxo esperado — mensagem no Chatwoot → webhook → n8n → banco — está detalhado
na **seção 8 do [`DATABASE.md`](DATABASE.md)**, junto com o motivo pelo qual a
automação precisa da `service_role key`.

O Dashboard exibe métricas de impacto do agente: contatos dentro e fora do
horário comercial, distribuição por dia da semana e taxa de conversão do funil.

### Ao agendar, o agente escreve em `consultas`

Antes da Agenda existir, o agente gravava `data_agendamento` direto na ficha do
lead. **Isso não vale mais:** a consulta precisa virar linha em `consultas`, com
`profissional_id`, `duracao_minutos`, `origem = 'agente_ia'` e `chave_externa`.
`data_agendamento` continua existindo, mas virou reflexo — quem o mantém é o
trigger `consultas_sincroniza_lead`.

### A API da agenda ainda não existe

A fase seguinte é expor cinco operações ao agente (consultar disponibilidade,
criar, consultar, cancelar, reagendar), chamadas pelo **n8n via nó HTTP**. O
schema já foi desenhado para isso — restrição anti-conflito, idempotência,
bloqueios e fuso da clínica estão no banco justamente porque a API não passa
pela interface. Os detalhes e as recomendações estão na **seção 8 do
`DATABASE.md`**.
