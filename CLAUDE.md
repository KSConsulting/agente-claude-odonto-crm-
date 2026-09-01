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

E os do Agente de IA (ver [`agente-ia/README.md`](agente-ia/README.md)):

```bash
npm run prompt          # agente-ia/prompt.md → _shared/prompt-oficial.ts
npm run agente:secrets  # sobe as chaves de agente-ia/.env.agente.local
npm run agente:deploy   # regera o prompt e publica a função whatsapp
```

> `agente:deploy` usa `--no-verify-jwt` de propósito: quem chama o webhook é a
> Evolution, que não tem sessão do Supabase. A autenticação é o
> `WEBHOOK_SEGREDO`, conferido dentro da função. Publicar no padrão derruba o
> webhook com um 401 que nem chega no nosso código — mesmo motivo da `agenda/`.

Não existe suíte de testes. Ao mexer em algo, valide com `npm run build`
(que roda o TypeScript) e `npm run lint`.

**O `tsc` do projeto não cobre `supabase/functions/`** (o `tsconfig.app.json`
inclui só `src`). Dá para conferir sem publicar, com o Deno:

```bash
npx --yes deno@2 check supabase/functions/whatsapp/index.ts
```

⚠️ **Ele acusa 6 erros que já existiam** — 4 em `llm.ts`, 1 em `db.ts` e o
`EdgeRuntime` do `whatsapp/index.ts`, que só existe no runtime do Supabase.
**Compare com o número, não com "limpo"**: rode antes de mexer, guarde a
contagem, e confira depois. Sem isso, o erro só aparece na hora de publicar.

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

As migrações executáveis ficam em [`supabase/migrations/`](supabase/migrations/),
e a API do Agente de IA em
[`supabase/functions/agenda/`](supabase/functions/agenda/).

A migração é aplicada em **dezenove arquivos, nesta ordem**:
`0001_schema_inicial.sql`, `0002_agenda_profissionais.sql` (agenda e
profissionais), `0003_whatsapp_unico.sql` (WhatsApp normalizado e único),
`0004_api_agente.sql` (tokens e funções da API),
`0005_catalogo_procedimentos.sql` (os 20 procedimentos da clínica),
`0006_informacoes_clinica.sql` (endereço da clínica e a view do agente),
`0007_horario_na_view.sql` (o horário de atendimento nessa view),
`0008_procedimentos_view.sql` (a view de procedimentos),
`0009_profissionais_view.sql` (a view de profissionais e a `jornada_texto()`),
`0010_agente_conversas.sql` (as conversas do WhatsApp e as configurações do
agente), `0011_procedimentos_detalhados.sql` (a coluna `descricao_longa`) e
`0012_procedimentos_texto_enxuto.sql` (os textos longos, reescritos curtos) e
`0013_conversas_lista.sql` (a view que sustenta a tela Conversas) e
`0014_conversas_agendamento.sql` (o `data_agendamento` nessa view, para a
etiqueta "Agendada") e `0015_baixa_da_consulta.sql` (o status `faltou` e o
trigger que promove o lead a Paciente) e `0016_ultima_consulta.sql` (a coluna
calculada `ultima_consulta`, que a tela Pacientes mostra) e
`0017_provedor_whatsapp.sql` (qual ponte com o WhatsApp está ativa) e
`0018_avaliacao_e_precos.sql` (a avaliação como porta de entrada, o preço
que pode ser dito, e o que o paciente procura gravado na consulta) e
`0019_nome_do_agente.sql` (o nome do agente vira dado, lido pelas telas e pelo
prompt).

Os pontos que mais causam erro:

1. **`crm_clinica` é uma VIEW**, não uma tabela. A tabela física é
   `crm_clinica_dados`. A view acrescenta duas colunas calculadas na leitura,
   `minutos_ultima_mensagem` e `ultima_consulta`. Escrita funciona normalmente
   (view auto-atualizável), mas **nunca grave nas colunas calculadas** — e
   **nunca acrescente `join` a ela**: dois itens no FROM a tornam
   somente-leitura e derrubam todo o cadastro do sistema. Por isso
   `ultima_consulta` é subconsulta escalar, e não `join lateral` como na
   `conversas_lista`. Confira com `select is_updatable from
   information_schema.views where table_name='crm_clinica'`.
2. **Os valores de `status` vivem em dois lugares:** o `CHECK` no banco e os
   tipos `LeadStatus` / `ConsultaStatus` em [`src/types/index.ts`](src/types/index.ts).
   Alterou um, altere o outro — nada sincroniza isso automaticamente.
3. **As Edge Functions escrevem com a `service_role key`.** As políticas de RLS
   só liberam `authenticated`, e função não tem sessão. O Supabase injeta essa
   chave sozinho; ela **nunca** entra em `src/`. Qualquer integração que use a
   `anon key` falha em silêncio (`200 OK`, zero linhas).
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
7. **Ninguém vira Paciente sem a baixa da consulta.** `pessoas.ts` separa
   `/leads` de `/clientes` por `consulta_realizada` / `paciente_recorrente`, e
   **a única porta automática para eles é a consulta virar `realizada`** — o
   trigger promove (e passa a `paciente_recorrente` na 2ª). Quem escreve isso é
   a Agenda ou o `AvisoBaixaConsulta`; a tela nunca escreve o funil na mão.
8. **"Agendou?" não se pergunta ao `status`.** O trigger preserva
   `consulta_realizada` e `paciente_recorrente` quando alguém marca de novo —
   então **um paciente que volta e marca NÃO fica em `consulta_agendada`**.
   Quem responde é `data_agendamento`, recalculada para qualquer status. A
   regra mora em `temConsultaMarcada()`, em
   [`src/lib/conversas.ts`](src/lib/conversas.ts). Filtrar por status erra em
   silêncio, e erra justo com quem mais volta.
9. **`whatsapp_lead` é único e tem formato canônico**: só dígitos, com o código
   do país (`5511987654321`). Nunca grave formatado — um trigger tira a
   pontuação, mas ninguém adivinha o DDI que faltar. Repetido devolve `23505`.
   É o formato em que a Evolution entrega; a regra dos países vive em
   [`src/lib/telefones.ts`](src/lib/telefones.ts).

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
│   ├── agenda.ts               lógica pura: datas, conflito, layout dos blocos
│   ├── procedimentos.ts        o dinheiro na tela: ler e formatar o "a partir de"
│   ├── telefones.ts            países atendidos, dígitos e formato canônico
│   ├── contatos.ts             busca de pessoa por WhatsApp (duplicidade)
│   ├── conversas.ts            ler, enviar, assumir, devolver; e a etiqueta "Agendada"
│   ├── baixaConsulta.ts        compareceu ou faltou: a baixa que fecha o funil
│   ├── whatsappConexao.ts      a ponte está de pé? quem está conectado? (com polling)
│   ├── apagarPessoa.ts         prever o estrago e apagar tudo de alguém
│   ├── statusLead.ts           cores e rótulos de status (fonte para código novo)
│   ├── agente.ts               como o Agente de IA se chama NA TELA (ver Design system)
│   └── apiTokens.ts            geração/hash do token e catálogo dos endpoints
├── types/
│   └── index.ts                tipos espelhando o schema do banco
├── components/
│   ├── Layout.tsx              casca com Sidebar + <Outlet/> (ver Convenções)
│   ├── Sidebar.tsx             navegação lateral, logo, logout
│   ├── ProtectedRoute.tsx      guarda de sessão
│   ├── PessoasPage.tsx         implementação compartilhada de /leads e /clientes
│   ├── AgendaSemana.tsx        grade semanal (7 colunas × horas)
│   ├── AgendaMes.tsx           grade mensal (semanas inteiras)
│   ├── NovoAgendamentoModal.tsx  criar consulta; cria o paciente se não existir
│   ├── CampoTelefone.tsx       seletor de país + contagem de dígitos
│   ├── TabClinica.tsx          aba "Clínica" de Configurações
│   ├── EditorProcedimento.tsx  modal de edição de um procedimento
│   ├── PortaDeEntrada.tsx      a avaliação: fora da grade, com duração e valor
│   ├── ModalPortal.tsx         leva o modal para o <body> (ver Convenções)
│   ├── ListaConversas.tsx      coluna esquerda de /conversas
│   ├── JanelaConversa.tsx      coluna direita: balões, cabeçalho e resposta
│   ├── PainelLead.tsx          coluna extra: ficha da pessoa, com abrir/esconder
│   ├── AvisoBaixaConsulta.tsx  "compareceu ou faltou?" — nas 3 telas
│   ├── ConexaoWhatsApp.tsx     seção "Conexão do WhatsApp", em Secretária de IA
│   ├── AvisoWhatsAppCaiu.tsx   faixa vermelha em Conversas — só quando cai
│   ├── ApagarPessoa.tsx        zona de perigo: apaga uma pessoa inteira
│   └── ConfirmDeleteModal.tsx  modal de confirmação reutilizável
└── pages/
    ├── Login.tsx               tela dividida (marca + formulário)
    ├── Dashboard.tsx           métricas, gráficos, próximas consultas
    ├── CRM.tsx                 Kanban do funil (drag and drop)
    ├── Conversas.tsx           o WhatsApp da clínica, em duas colunas
    ├── Agenda.tsx              calendário de todas as agendas + filtros
    ├── Profissionais.tsx       dentistas: nome, cor e jornada
    ├── Leads.tsx               invólucro: <PessoasPage mode="leads" />
    ├── Clientes.tsx            invólucro: <PessoasPage mode="clientes" />
    ├── LeadDetail.tsx          ficha do lead + consultas + anotações
    ├── Procedimentos.tsx       o catálogo da clínica
    ├── SecretariaIA.tsx        o Agente de IA: modelo, prompt, liga/desliga
    ├── TokenApi.tsx            chaves de acesso e o contrato da API
    └── Configuracoes.tsx       perfil, clínica e horários
```

### A agenda não é uma entidade

`Agenda.tsx` desenha as consultas agrupadas por `profissional_id`. Não há tabela
`agendas`, nem tela para criar uma: cadastrar o profissional já basta, e a cor
escolhida no cadastro é a cor dos blocos no calendário.

O calendário é desenhado à mão, sem biblioteca. As prontas (FullCalendar e
afins) trazem CSS e sistema de temas próprios, que brigariam com a estilização
inline daqui, e somariam peso a um bundle que já está grande.

### Telefone: um lugar só

Toda pessoa criada pelo sistema passa por
[`CampoTelefone`](src/components/CampoTelefone.tsx) — modal da agenda, novo
contato e novo paciente. O componente existe para que a regra de país e de
contagem de dígitos não se repita (nem divirja) em três telas.

Os países atendidos ficam em [`src/lib/telefones.ts`](src/lib/telefones.ts),
numa lista curta e deliberada: cobrir "todos" com regra escrita à mão é promessa
impossível de manter. Acrescentar país é acrescentar um item nessa lista.

O que vai para o banco é sempre o canônico — dígitos com DDI. O formato bonito
existe só na tela, via `formatarParaExibicao()`.

### A lógica da agenda

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
/conversas          Conversas (WhatsApp)   │
/agenda             Agenda (calendário)    │
/leads              Contatos (Leads)       │ dentro de ProtectedRoute
/clientes           Pacientes (Clientes)   │ e de Layout (Sidebar)
/leads/:id          Detalhe da pessoa      │
/profissionais      Profissionais          │
/procedimentos      Procedimentos          │
/secretaria-ia      Secretária de IA       │
/token-api          Token e API            │
/configuracoes      Configurações          ┘
*                   redireciona para /
```

### O que é barra lateral e o que é menu do usuário

A navegação está dividida por **quem usa e com que frequência**:

| Lugar | O que fica lá |
|---|---|
| **Barra lateral** | O dia a dia da recepção: Dashboard, CRM, Conversas, Agenda, Leads, Clientes, Profissionais, Procedimentos, Configurações |
| **Menu do nome** (rodapé) | O sistema: **Secretária de IA**, **Token e API**, Sair |

As três primeiras eram abas de Configurações. Saíram de lá por motivos
diferentes:

- **Procedimentos** virou página porque não é configuração — é conteúdo da
  clínica, mexido na mesma frequência que Profissionais, e é o texto que a
  Secretária de IA fala com o paciente. Fica logo depois de Profissionais.
- **Secretária de IA** e **Token e API** foram para o menu do nome porque são
  ajustes do sistema, não da clínica: quem liga o agente ou cria uma chave de
  API não é quem atende o telefone. Enterrar as duas numa aba de Configurações
  escondia demais; deixar na barra lateral atrapalharia quem passa o dia na
  Agenda.

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

### A casca tem altura fixa, e quem rola é o conteúdo

[`Layout.tsx`](src/components/Layout.tsx) usa `height: 100vh` com
`overflow: hidden`, e o `<main>` é que rola. **Não troque por `minHeight`.**

Com `minHeight`, o container cresce junto com a página e a barra lateral estica
junto — ela é um item flex, e `stretch` é o padrão. O rodapé dela (o nome do
usuário e o menu do sistema) vai parar no fim do **documento**: em telas altas
como Dashboard, Agenda e Configurações, some abaixo da dobra e só reaparece
rolando até o fim. Foi exatamente o que aconteceu.

Consequência para páginas novas: use `height: '100%'`, não `100vh` — o `main`
já é do tamanho da janela, e `100vh` dentro dele ignora qualquer margem futura.

### Modal vive dentro de `ModalPortal`

`position: fixed` promete "em relação à janela" — e quebra a promessa se
**qualquer** ancestral tiver `transform`. As classes `fade-in-*` do
[`index.css`](src/index.css) animam com `translateY` e `forwards`, o que deixa
`transform: translateY(0)` gravado no elemento para sempre. Não é `none`, então
vira o novo referencial.

Em Configurações isso aparecia: o conteúdo da aba mora dentro de um `fade-in-3`
alto, e o modal se centralizava no meio **daquele bloco** — surgindo lá embaixo,
metade fora da tela.

[`ModalPortal.tsx`](src/components/ModalPortal.tsx) resolve na raiz, jogando o
modal direto no `<body>`. **Todo modal novo nasce dentro dele.** Os modais
antigos das outras páginas escapam por acidente — são irmãos dos blocos
animados, não filhos —, mas basta alguém aninhar um para o sintoma voltar.

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

### Cores dos balões da conversa

Três vozes na tela **Conversas**, e elas precisam ser distinguíveis sem
esforço — principalmente onde uma pessoa entra no lugar da IA.

| Quem | Fundo | Texto | Lado |
|---|---|---|---|
| Paciente | `#FFFFFF` + borda `#DCE6EA` | `#16232B` | esquerda |
| Secretária IA | `#1E6E8C` (Principal) | `#FFFFFF` | direita |
| Atendente da clínica | `#16232B` (Texto) | `#FFFFFF` | direita |

**As duas cores cheias são as duas cores mais fortes da identidade** — nada de
cor nova, e o resultado combina com o resto do sistema. A primeira versão usava
branco contra `#EAF3F6`: dois quase-brancos que, de relance, viravam a mesma
coisa.

Cor não é o único sinal: o rótulo acima do balão traz um ícone (`Bot` para a
IA, `UserCheck` para a pessoa) e aparece sempre que o autor muda.

### O Agente de IA tem dois nomes, e isso é proposital

| Onde | Como aparece |
|---|---|
| Nas telas da equipe | **Secretária IA · Letícia** — o crachá antes do nome |
| Na conversa com o paciente | **Letícia**, e só |

A equipe precisa saber de relance que quem respondeu foi a IA, e não uma colega.
O paciente, não: o prompt proíbe — em regra inegociável — que ela diga ser
assistente virtual, inteligência artificial, bot, robô ou sistema.

**São dois públicos e dois contratos.** Mas são o mesmo **nome**.

### O nome é dado; o cargo é código

Até a migração `0019` os dois lados guardavam o nome separado —
`src/lib/agente.ts` e `agente-ia/prompt.md` —, e renomear exigia editar dois
sistemas que não se falavam, torcendo para nenhum ficar para trás.

Agora:

| O quê | Onde mora | Por quê |
|---|---|---|
| **O nome** (`Letícia`) | `configuracoes_agente.nome_agente` | Cada clínica escolhe o seu. Em código, seria um deploy por clínica |
| **O cargo** (`Secretária IA`) | [`src/lib/agente.ts`](src/lib/agente.ts) | É o que ela faz, não como se chama |
| **O nome da página** (`Secretária de IA`) | idem | Trocar "Letícia" por "Sofia" não deve renomear a tela |

As telas leem pelo `useAgente()` — um `useSyncExternalStore` alimentado uma vez
por sessão pelo [`Layout.tsx`](src/components/Layout.tsx), que é o único
componente por onde toda tela autenticada passa. O prompt lê pelo marcador
`{{NOME_AGENTE}}`.

> ⚠️ **Frase nova que fale dela usa `useAgente()`, nunca a palavra.** Treze
> frases da interface tinham "Letícia" digitado à mão, e elas continuariam
> falando de uma pessoa que não existe mais no dia em que a clínica renomeasse.
> Meia renomeação é pior que nenhuma.

### Lista ou card, e o que decide

As duas listagens da clínica não têm a mesma forma, e a diferença não é gosto:

| Tela | Forma | Por quê |
|---|---|---|
| **Profissionais** | linhas empilhadas | Um dentista é **nome, cor e jornada** — três dados curtos que cabem numa linha. São poucos, e a cor à esquerda já separa um do outro. |
| **Procedimentos** | grade de cards | Um procedimento é **um parágrafo**. São vinte. Vinte linhas com a descrição espremida numa faixa fina viram uma parede que o olho não separa. |

A regra: **quando o item tem texto corrido, ele quer um card**; quando é um
punhado de campos curtos, a linha é mais densa e melhor.

No card, os botões que agem sobre o item ficam **dentro dele** — não numa coluna
à direita, longe do nome, onde é fácil clicar no procedimento vizinho.

Mas **só o que é ciclo de vida**: ativar, editar, excluir. O que é conteúdo ou
regra — as descrições, o fluxo de agendamento, o valor — mora no modal de
Editar. A diferença é o custo do erro: religar um procedimento desligado por
engano é um clique; mudar o fluxo de agendamento sem perceber muda o que a
Letícia marca para o paciente.

> **O rodapé do card não esmaece junto.** Desligar um procedimento apaga o corpo
> (`opacity: 0.5`), mas não o rodapé: apagar o botão que religa é apagar a saída.

### A avaliação é a porta, e por isso não é um card

Quase todo tratamento passa antes por uma **Avaliação Odontológica**: o dentista
examina, conversa e monta o plano. Duas exceções agendam direto — Limpeza e
Clareamento.

| Decisão | Por quê |
|---|---|
| **A avaliação existe como registro** | Seria mais fácil ter o nome dela no código. Mas aí a duração do bloco, a gratuidade e o próprio nome ficariam presos num deploy. Aqui a clínica muda os três, e a mudança chega na conversa seguinte |
| **Mas fora da grade de cards** | Ela não é um tratamento, é por onde eles começam. No meio dos vinte ela vira o vigésimo card igual — sendo a consulta que mais vai acontecer |
| **Uma caixa, não três categorias** | "Passa pela avaliação", ligado ou desligado. A versão de três níveis foi descartada: duas delas mandavam o agente fazer exatamente a mesma coisa, e categoria que não muda comportamento só serve para ser preenchida errado |
| **A caixa mora no modal de Editar** | É decisão que se toma pensando, uma vez — não coisa para clicar de passagem numa grade de vinte cards, onde é fácil errar o vizinho. O card **mostra** o resultado ("Passa pela avaliação" / "Agenda direto · a partir de R$ 250"), porque senão descobrir quais passam exigiria abrir vinte modais |
| **Uma porta só, garantida por índice** | `servicos_clinica_avaliacao_unica` é parcial (`where e_avaliacao`). Duas portas seriam duas respostas para a mesma pergunta |
| **A trava mora na função SQL** | `agenda_marcar` recusa, e devolve o nome da porta. Prompt é pedido, não trava — a Letícia já ignorou regra escrita com o dado na frente dela. E como as duas portas dos agentes descem para a mesma função, a API externa herda a regra de graça |
| **A recepção passa por fora** | `NovoAgendamentoModal` grava direto em `consultas`. A regra existe para impedir um **agente** de decidir clínica, não para impedir a clínica de marcar o que quiser |

**O preço tem três estados, e o do meio é o que vale.** Vazio, ela não fala
valor; `0`, ela diz **"é gratuita"**; acima de zero, "a partir de R$ X". Zero
não é campo em branco: é a frase que derruba a objeção de quem não quer pagar
só para saber o preço — e sem ela a resposta vira "o valor a gente vê na
avaliação", que soa como desconversa.

> **O campo de valor some do modal quando "passa pela avaliação" está ligado —
> e o salvamento grava `null`.** Preço ali nunca seria falado, e campo que existe
> sem ser usado é campo preenchido errado. É a mesma ideia da caixa única: um
> estado contraditório não deve ser representável, nem na tela nem no banco.

**A porta de entrada também só mostra.** Nome, textos, duração e valor dela se
mudam no mesmo modal dos outros. Campo editável no bloco *e* no modal seria a
mesma coisa em dois lugares, e um dia os dois discordariam.

**E o card não mostra a frase que ela vai falar.** A frase é montada pela view
`procedimentos_clinica_agente`, em SQL. Reimplementá-la no TypeScript daria duas
versões da mesma regra, e um dia a tela mostraria uma coisa e o paciente ouviria
outra. O card mostra o **dado**. (A prévia da aba Clínica escapa disso porque
consulta a view de verdade; uma consulta por card seria absurda.)

### O que a pessoa quer aparece ao lado do que está marcado

Com uma porta só, o dentista abriria a quinta-feira e veria oito "Avaliação
Odontológica" idênticas. Por isso o bloco da Agenda mostra
`Avaliação Odontológica · Lentes de Contato`, montado por
`procedimentoComInteresse()` em [`src/lib/agenda.ts`](src/lib/agenda.ts).

O dado é `consultas.interesse`, **congelado no ato de marcar** — e não o
`procedimento_interesse` do CRM, que é da pessoa e guarda um valor só. Quem veio
por lentes em março e por canal em agosto tem o último; olhar a consulta de
março mostraria "canal", que é falso.

### A conexão do WhatsApp: seção, não aba; e o fornecedor é dado

A ponte com o WhatsApp vive em **Secretária de IA**, como seção da pilha de
cards — não como aba, e não em Configurações.

| Decisão | Por quê |
|---|---|
| **Seção, não aba** | A página inteira é um assunto só: a secretária. Aba separa **temas diferentes** (é o caso de Configurações: Perfil, Clínica, Horários). Aba aqui esconderia o estado da conexão, que é justamente o que precisa ser visto sem clicar |
| **Nome: "Conexão do WhatsApp"** | É o que a coisa é para quem usa. "Evolution API" é nome de fornecedor, e o rótulo teria que mudar junto com ele |
| **Mas o provedor aparece dentro** | Quando cai, é ele que diz **em qual painel ir olhar**. "WhatsApp desconectado", sozinho, não responde isso |
| **Servidor, instância e 4 dígitos da chave, dentro dela** | São as perguntas de quando quebra: em qual painel entrar, qual instância é a nossa, e se a chave é a que se pensa que é. Quatro caracteres de trinta e cinco **identificam** sem servir para usar — padrão de cartão e de Stripe |
| **Nesta página, não em Configurações** | A conexão é o telefone da secretária. Separar as duas coisas seria esconder de quem cuida dela |

**`desconectado` e `indisponivel` são estados diferentes, e a diferença é a
saída:** o primeiro é a ponte de pé com a sessão caída (religa na própria
tela); o segundo é o servidor fora do ar (nenhum botão daqui resolve — quem
sobe é a máquina, no painel da hospedagem). Confundir os dois faz a pessoa
clicar em "Reconectar" enquanto o problema está em outro lugar.

**E `nao_configurado` é um terceiro**, que só passou a existir com a segunda
ponte: a escolhida não tem chave nas secrets. Sem ele, escolher a uazapi com o
token em branco diria "o servidor não respondeu" — mandando procurar defeito
numa máquina quando o que faltou foi preencher um campo.

### Duas pontes, e o seletor só manda em metade

A clínica escolhe entre **Evolution** e **uazapi** no seletor da Secretária de
IA, e a coluna `provedor_whatsapp` é lida a cada requisição — trocar vale na
mensagem seguinte, sem republicar. As credenciais das duas convivem nas
secrets; o que decide é a coluna, não a presença da chave.

A porta é [`_shared/whatsapp.ts`](supabase/functions/_shared/whatsapp.ts), e
foi escrita **só quando a segunda API chegou**: com um provedor só, a interface
seria palpite. O `whatsapp/index.ts` não conhece nenhuma das duas.

> ⚠️ **O seletor manda em quem a gente chama, não em quem chama a gente.** O
> webhook chega sem pedir licença. Quem lê é a ponte **ativa**; o que ela não
> reconhece é descartado com motivo no log, nunca em silêncio — responder
> mandaria a resposta pelo número da outra ponte, para quem nunca escreveu para
> ele. **Só o webhook do provedor ativo deve apontar para a nossa função**, e
> isso é um passo manual no painel de cada uma.

> **Atender depende de TRÊS condições, e o card demorou a aprender as duas
> últimas.** O agente ligado, o WhatsApp conectado **e o webhook apontado para
> a nossa função**. Até 01/09 o card só conhecia a primeira, e afirmou "está
> atendendo" por horas com a ponte fora do ar.
>
> A terceira era o mesmo buraco, e apareceu na estreia da uazapi: sessão
> pareada, card **verde escrito "Conectado"**, e silêncio absoluto — porque o
> webhook dela nunca tinha sido ligado. Hoje `/conexao` pergunta à ponte
> (`webhook/find/{instancia}` na Evolution, `GET /webhook` na uazapi) e o card
> avisa quando não aponta para cá.
>
> Painel que afirma o que não sabe é pior que painel vazio.

> ⚠️ **O veredito sai; a URL nunca.** Ela carrega o `WEBHOOK_SEGREDO` dentro —
> na uazapi obrigatoriamente, porque ela não aceita cabeçalho customizado e o
> segredo viaja na query. Escrever a URL na tela entregaria o segredo a
> qualquer pessoa com login, que é o erro que os 4 dígitos da chave evitam. Por
> isso `avaliarWebhook()` compara **origem e caminho** e devolve só
> `apontado` / `outro` / `ausente` / `desconhecido` — e `desconhecido` não
> mostra nada, porque acusar o que não se sabe é o mesmo erro ao contrário.

O aviso de queda também aparece em **Conversas**, em faixa vermelha que só
existe quando há problema — mesmo princípio do `AvisoBaixaConsulta`. É lá que a
recepção passa o dia, e é lá que a queda seria notada primeiro.

### Apagar uma pessoa apaga a mídia por fora

`crm_clinica_dados` cascateia para `mensagens_whatsapp` e `consultas`, mas
**não para o Storage** — e o Postgres recusa apagar de `storage.objects` por
SQL, de propósito, para não deixar arquivo órfão.

Por isso a exclusão é a rota `POST /whatsapp/apagar-pessoa`, e não um `delete`
da tela: só a Edge Function tem a `service_role key` que a Storage API exige.
Ela apaga **mídia primeiro, ficha depois** — o caminho do arquivo é
`{lead_id}/...`, então a ordem inversa perderia o rastro. Detalhes na seção 7
do [`DATABASE.md`](DATABASE.md).

**A confirmação conta o que vai destruir** (`68 mensagens · 3 consultas (1 já
realizada)`), e destaca a consulta realizada quando existe. Botão irreversível
sem número vira clique automático.

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

## Deploy

Vercel, SPA estática. A detecção automática acerta tudo (Vite → `npm run build`
→ `dist`), e o [`vercel.json`](vercel.json) tem uma coisa só: o rewrite de
`/(.*)` para `/index.html`.

**Esse rewrite não é enfeite.** As rotas são client-side (`BrowserRouter`); sem
ele, entrar direto em `/agenda` ou dar F5 em `/leads/:id` devolve 404 da Vercel.
Navegar pela Sidebar continuaria funcionando, então o problema só aparece quando
alguém compartilha um link.

As duas variáveis do Supabase precisam estar cadastradas no painel da Vercel — o
`.env` não vai para o Git. **Variável ausente não quebra o build:** o Vite embute
`undefined` e a tela fica em branco no primeiro acesso ao banco. E como variável
de Vite entra no bundle em tempo de build, **mudou a variável, reimplante.**

Passo a passo e checklist pós-deploy no [`README.md`](README.md).

---

## Variáveis de ambiente

```env
VITE_SUPABASE_URL=https://SEU_REF.supabase.co
VITE_SUPABASE_ANON_KEY=sua_anon_key
```

Lidas em [`src/lib/supabase.ts`](src/lib/supabase.ts). O `.env` está no
`.gitignore` — **nunca comite credenciais**.

**Nenhum dos três arquivos de chave vem no clone** — é o `.gitignore` que impede
a chave de subir num `push`. O que é versionado é o molde de cada um, e o passo 1
da instalação é copiar:

| Molde (versionado) | Vira | Vida útil |
|---|---|---|
| [`.env.example`](.env.example) | `.env` | Permanente — o `npm run dev` lê toda vez |
| [`agente-ia/.env.agente.example`](agente-ia/.env.agente.example) | `agente-ia/.env.agente.local` | Permanente, mas parado: sobe para os secrets e fica de registro |
| [`.supabase-token.example`](.supabase-token.example) | `.supabase-token.local` | ⛔ **Descartável** — revogado e apagado quando o sistema sobe |

O terceiro guarda um Personal Access Token da **conta** do Supabase, não do
projeto: acesso total, todos os projetos. Ele existe porque o `supabase login` é
interativo e a IA da IDE não consegue fazer esse passo — é a única razão. Cada
molde carrega dentro dele de onde vem cada valor e quando ele morre.

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
| Prompt do Agente de IA | [`agente-ia/prompt.md`](agente-ia/prompt.md) — e confira se a seção 8 do README da pasta ainda descreve ele, e se o [`GUIA-DO-PROMPT.md`](agente-ia/GUIA-DO-PROMPT.md) ainda classifica certo a seção mexida |
| Ferramentas, modelo ou etapas do Agente de IA | [`agente-ia/README.md`](agente-ia/README.md) (a seção correspondente **e** a tabela de estado) |

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

### ESLint acusa 9 erros

- **4x — `ErrorMsg` declarado dentro do render** em
  [`Configuracoes.tsx:192`](src/pages/Configuracoes.tsx#L192). Não é só estilo:
  componentes criados durante o render são recriados a cada renderização e
  **perdem o estado**. É um bug esperando acontecer. A correção é mover a
  declaração para fora do componente.
- **4x — uso de `any`** em `CRM.tsx` e `Dashboard.tsx`, além de uma variável
  não utilizada (`_e` em `CRM.tsx:123`).

### Bundle de 2.2 MB (812 KB gzip)

Acima do recomendado. `jspdf`, `html2canvas` e `recharts` são carregados sempre,
mas só usados em telas específicas. Resolve-se com `import()` dinâmico e code
splitting.

### Duplicação das cores de status

[`src/lib/statusLead.ts`](src/lib/statusLead.ts) é a fonte, e **código novo
importa de lá**. As quatro cópias antigas continuam de pé:

| Arquivo | Formato | Por que ainda não migrou |
|---|---|---|
| `LeadDetail.tsx` | `{bg, color, pulse}` | Idêntico ao módulo — migração mecânica |
| `PessoasPage.tsx` | `{bg, color, pulse}` | Idêntico ao módulo — migração mecânica |
| `Dashboard.tsx` | `{bg, text, dot}` + rótulos **curtos** | "Agendada" em vez de "Consulta Agendada", porque o rótulo longo estoura o gráfico |
| `CRM.tsx` | array | Também define a **ordem das colunas** do Kanban |

Os dois primeiros trocam por um `import`. Os dois últimos exigem decidir o que
fazer com os rótulos curtos e com a ordem do Kanban — e isso é tarefa própria,
não efeito colateral de outra.

### Arquivos mortos

- **`src/App.css`** — o único CSS importado é o `index.css` (em `main.tsx`).
- **`public/icons.svg`** — não é referenciado em lugar nenhum.
- **`src/assets/react.svg` e `src/assets/vite.svg`** — sobras do template.

Nenhum deles quebra nada — mas confundem quem procura onde algo está definido.

---

## Integração com o Agente de IA

**📘 Tudo sobre o agente do WhatsApp vive em [`agente-ia/`](agente-ia/)** —
comece pelo [`agente-ia/README.md`](agente-ia/README.md): quem ele é, como
funciona, as decisões tomadas, o estado de cada etapa e **o mapa de onde fica
cada arquivo**. Leia antes de mexer em qualquer coisa ligada a ele.

A pasta guarda o **conteúdo** (o prompt em `prompt.md` e as chaves). O
**código** fica onde as ferramentas obrigam — `supabase/functions/` e `src/` —
e está todo listado no mapa daquele README.

> **Levar o sistema para outra clínica?** O
> [`agente-ia/GUIA-DO-PROMPT.md`](agente-ia/GUIA-DO-PROMPT.md) diz o que no
> `prompt.md` é conteúdo da clínica e o que é **contrato com o código** — os
> marcadores, a ordem das duas seções finais e os nomes das ferramentas quebram
> em silêncio. E a primeira instrução dele é que o prompt se edita **pela IA da
> IDE**, que lê este repositório antes de escrever.

> ⚠️ **A tabela de estado daquele README diz o que já foi construído.** O que
> estiver em etapa não concluída não existe — não procure o arquivo.

**Ela não usa n8n nem Chatwoot.** Esse era o desenho antigo, abandonado antes de
rodar. Hoje a Letícia é a Edge Function
[`supabase/functions/whatsapp/`](supabase/functions/whatsapp/), chamada por
webhook pela ponte de WhatsApp ativa — **Evolution API v2** ou **uazapi v2**,
à escolha da clínica no seletor de Secretária de IA. Duas heranças ficaram no
schema, ambas
mortas: as colunas `*_chatwoot` de `crm_clinica_dados` e a tabela
`n8n_chat_histories`, que **nunca chegou a existir** neste banco.

**O que ela toca no banco — lista fechada:**

| Objeto | Acesso |
|---|:---:|
| `crm_clinica` | **lê e grava** — cria o lead, avança o status e preenche a ficha |
| `mensagens_whatsapp` | **lê e grava** — a memória da conversa, e a fonte da futura tela Conversas |
| `consultas` | **grava só pelas funções SQL** `agenda_marcar` / `agenda_remarcar` / `agenda_cancelar`. Lê direto, só as do próprio lead |
| bucket `midias-whatsapp` | **grava** — o áudio e a foto que o paciente mandou. Privado |
| `informacoes_clinica_agente` | **só lê** — dados da clínica em frases prontas |
| `procedimentos_clinica_agente` | **só lê** — procedimentos ativos |
| `profissionais_clinica_agente` | **só lê** — dentistas ativos e a jornada de cada um |
| `servicos_clinica` | **só lê** — a `descricao_longa` de **um** procedimento, pela ferramenta `detalhes_do_procedimento`. E `agenda_marcar` lê `exige_avaliacao` e `duracao_minutos` para decidir o agendamento |
| `consultas` | **só lê** para a memória — a consulta futura e o histórico do paciente. Escrita é sempre por função SQL |
| `configuracoes_agente` | **só lê** — modelo, prompt e a regra do modo teste |
| `configuracoes_clinica` | **só lê** — só o `fuso_horario` |

Nada mais. Detalhes na **seção 8 do [`DATABASE.md`](DATABASE.md)**.

> ⚠️ **O lead nasce sem nome, e o `pushName` não entra.** A Evolution manda o
> nome do perfil do WhatsApp em todo webhook; ele é **ignorado de propósito**. O
> perfil é o apelido que a pessoa escolheu, não quem vai sentar na cadeira — o
> telefone do marido, "Casa da Sogra", o número dividido entre duas pessoas. E o
> estrago não era só o nome errado no CRM: com a ficha já preenchida, a Letícia
> lia "já sei o nome" e **nunca perguntava**, então ninguém corrigia. O nome vem
> da conversa, por `atualizar_ficha`, e de mais lugar nenhum. Até ela perguntar,
> as telas mostram o número formatado.

O Dashboard exibe métricas de impacto do agente: contatos dentro e fora do
horário comercial, distribuição por dia da semana e taxa de conversão do funil.

### A memória dela tem duas camadas

**Ela não tem "conversas".** Não há sessão nem começo: é uma linha do tempo só
por número de WhatsApp, para sempre.

| Camada | O que é | Alcance |
|---|---|---|
| **Janela** | As últimas **50 mensagens** de `mensagens_whatsapp` | Curto. Cada balão conta uma linha, e ela responde em 2 ou 3 — 50 mensagens são umas **16 trocas** |
| **Ficha** | `nome_lead`, `procedimento_interesse`, `resumo_conversa` e as consultas, montados por `montarFicha()` no fim do prompt | **Permanente.** É o que ela lembra de um paciente que sumiu por um ano |

> **A ficha só existe se ela escrever.** Quem preenche é a ferramenta
> `atualizar_ficha`, chamada por ela mesma durante a conversa. Prompt fraco nesse
> ponto = ficha vazia = nenhuma memória longa. Por isso a regra virou
> inegociável: *"nunca termine uma resposta em que descobriu algo novo sem usar
> `atualizar_ficha`"*.

**A ficha é o único lugar do prompt que carrega ordem, e não só dado.** Quando
existe consulta marcada, `montarFicha()` acrescenta uma segunda linha mandando
não oferecer agendamento. Parece repetir as `REGRAS INEGOCIÁVEIS`, e não é: num
teste real a Letícia ofereceu agendar a quem tinha hora no dia seguinte — com
o dado na frente dela, e recitando esse mesmo dado trinta segundos depois.
Regra colada no dado, na **última** coisa que o modelo lê, pesa mais que a mesma
regra dez seções acima. E não custa cache: esta seção já é volátil. O caso
inteiro está na seção 8 do [`agente-ia/README.md`](agente-ia/README.md).

**O histórico de consultas não entra no prompt.** Um paciente de cinco anos tem
dezenas de linhas, cobradas em toda mensagem para serem usadas quase nunca. Da
ficha sai só uma linha de placar — quantas fez e quando foi a última —, e o
detalhe vem pela ferramenta `historico_do_paciente`. **É a mesma divisão dos
procedimentos:** catálogo no prompt, detalhe sob demanda.

### A ordem do prompt não é estética

O que é igual para todo mundo (identidade, regras, clínica) vem **primeiro**; o
que muda a cada conversa e a cada minuto (`{{DATA_HOJE}}` e
`{{FICHA_DO_PACIENTE}}`) vem **por último**.

É assim que o cache de prompt funciona: ele reaproveita o **prefixo comum** entre
chamadas. Um dado volátil no começo joga fora o desconto do texto inteiro — de
todas as conversas de uma vez. **Não mova as duas seções finais para cima.**

### Ao agendar, o agente chama função SQL — nunca `INSERT`

Antes da Agenda existir, o agente gravava `data_agendamento` direto na ficha do
lead. **Isso não vale mais.** A consulta vira linha em `consultas`, com
`profissional_id`, `duracao_minutos`, `origem = 'agente_ia'` e `chave_externa` —
e quem grava é `agenda_marcar`, chamada pela ferramenta.

`INSERT` direto pula a conferência de jornada, a escolha de profissional livre e
a idempotência da `chave_externa`; ao bater na restrição de sobreposição, devolve
um `23P01` cru, sem frase para dizer a quem está esperando no WhatsApp.

> **Duas portas, uma regra.** A Letícia chama as funções SQL **direto**, por RPC,
> porque roda dentro do mesmo projeto. Quem está de fora usa os sete endpoints da
> função `agenda/`, com token. As duas descem para as mesmas funções da migração
> `0004` — é isso que impede as duas de divergirem.
>
> ⚠️ **Mas a mesma função SQL não garante o mesmo resultado.** As duas portas já
> divergiram: `agenda_marcar` recebe `timestamptz`, e o que chega antes disso é
> texto. A API pública convertia o texto no fuso da clínica; a Letícia mandava
> cru. Sem fuso, quem resolve é o Postgres, e a sessão do PostgREST roda em UTC
> — 14:00 da clínica virava 14:00 de Londres, gravado às **11:00**. A conversão
> agora é `paraInstante()`, e existe **duas vezes**: em
> `supabase/functions/_shared/tempo.ts` (Letícia) e dentro de
> `supabase/functions/agenda/index.ts` (API), que não pode ter import. **Mudou
> uma, mude a outra.** O caso está contado na seção 7 do
> [`agente-ia/README.md`](agente-ia/README.md).

`data_agendamento` continua existindo, mas virou reflexo — quem o mantém é o
trigger `consultas_sincroniza_lead`.

### A API da agenda — implantada

**Contrato e cURLs em [`API_AGENTE.md`](API_AGENTE.md)** — sete endpoints
(profissionais, procedimentos, disponibilidade, marcar, consultas, cancelar,
remarcar), para **integração externa**, autenticados por token próprio e não
pela `service_role key`.

> **A Letícia não usa esses endpoints.** Ela mora no mesmo projeto e chama as
> funções SQL direto. A API existe para quem está de fora.

Quatro coisas para não descobrir do jeito difícil:

1. **A Edge Function não pode ter `import` de nada.** O runtime sobe com
   `--no-remote` e um import externo derruba a função inteira com `BOOT_ERROR`,
   antes de rodar uma linha. A conversa com o banco é `fetch` no PostgREST.
2. **Ela está publicada com `verify_jwt = false`**, de propósito: a autenticação
   é o nosso token, não a `anon key`. Reimplantar no padrão derruba os sete
   endpoints de uma vez, com um 401 que nem chega no nosso código.
3. **Recusa de negócio volta com HTTP 200** (`ok: false` + `motivo` +
   `mensagem`). "Horário ocupado" é resposta, não erro — com 4xx, quem consome
   quebraria o fluxo justamente na hora de dar a notícia.
4. **Toda resposta traz frase pronta**, inclusive 401 e 500, onde ela é neutra.
   Quem consome vai falar com um paciente; sem frase, o agente improvisa.

A lógica pesada mora em funções SQL (`0004`), não no TypeScript: remarcar precisa
ser atômico e o cruzamento entre jornada e consulta só é confiável com o
`AT TIME ZONE` do Postgres. A Edge Function confere o token, chama a função e
monta a frase.

**A regra de disponibilidade em SQL espelha [`src/lib/agenda.ts`](src/lib/agenda.ts).**
Mudou uma, mude a outra — se divergirem, o agente oferece horário que a recepção
vê como ocupado.

### Os tokens saem do menu do usuário → Token e API

A página é [`TokenApi.tsx`](src/pages/TokenApi.tsx), com a geração e o
catálogo de endpoints em [`src/lib/apiTokens.ts`](src/lib/apiTokens.ts). Ela
cria, revoga, mostra status e último acesso, e traz a documentação dos sete
endpoints com os cURLs prontos para colar em qualquer cliente HTTP.

**O `hashToken()` da tela e o `sha256()` da Edge Function precisam ser o mesmo
cálculo** — SHA-256 em hexadecimal minúsculo. É o único ponto de encontro entre
quem cria o token e quem o confere; se divergirem, todo token nasce inválido e o
sintoma é um 401 sem explicação.

O valor em claro nunca é gravado: o banco guarda só o hash, e a tela mantém o
valor em memória apenas enquanto a página está aberta, para os cURLs saírem
preenchidos logo depois da criação.

### O que o agente lê direto do banco, sem API

`informacoes_clinica_agente` é uma view de **coluna única**, com uma informação
por linha, já escrita como frase — endereço, bairro, cidade/UF, CEP, horário de
atendimento, Maps, Instagram e site. A Edge Function lê com a mesma
`service_role key` que já usa para gravar os leads em `crm_clinica`; não há
endpoint para isso, de propósito.

A linha `Atendimento:` **não é campo digitado**: sai de `horario_comercial` pela
função `jornada_texto(null)`, que agrupa dias seguidos com o mesmo horário
("segunda a sexta das 08:00 às 18:00, sábado das 08:00 às 12:00"). A grade é a
mesma da aba Horários — mudou lá, mudou a frase.

**`jornada_texto()` é uma função só, para os dois usos.** Com `null` lê
`horario_comercial`; com um uuid lê a jornada daquele dentista. As duas tabelas
têm as mesmas colunas relevantes, e duas cópias da regra de agrupamento seria
uma a mais do que o necessário — a segunda envelheceria calada.

> ⚠️ **A grade da clínica não é a da agenda.** `horario_comercial` é o que a
> clínica anuncia; quem manda na disponibilidade é `profissional_horarios`.
> Anunciar até as 18:00 sem dentista depois das 17:00 faz o agente prometer
> horário que a própria API recusa em seguida.

Três coisas que a definem (detalhes na seção 4.12 do
[`DATABASE.md`](DATABASE.md)):

1. **É view, não tabela.** Calculada na leitura a partir de
   `configuracoes_clinica` — o estado "desatualizada" não existe. Mesmo motivo
   de `crm_clinica`.
2. **Uma coluna só, com rótulo dentro da frase.** Valor sem rótulo obriga o
   agente a adivinhar qual linha é o CEP e qual é o bairro.
3. **Campo vazio não vira linha.** `Site: ` pelado faria o agente dizer que o
   site da clínica é nada.

Quem preenche é a aba **Clínica** ([`TabClinica.tsx`](src/components/TabClinica.tsx)),
que mostra no rodapé a prévia do que o agente lê — e essa prévia é **uma consulta
real à view**, não uma reimplementação. Se ela fosse montada no TypeScript,
haveria duas versões da mesma regra e um dia a tela mostraria uma coisa e o
paciente ouviria outra.

`procedimentos_clinica_agente` segue a mesma receita, com os procedimentos
ativos — um por linha, na ordem da tela de Procedimentos. Sem prefixo
`Procedimento:`, porque aqui todas as linhas são da mesma natureza e a palavra
repetida vinte vezes viraria ruído lido em voz alta.

A linha é `Nome: descrição`, e ganha uma frase final quando há o que dizer:

```
Avaliação Odontológica: primeira consulta, o dentista examina... Gratuita.
Lentes de Contato: lâminas finíssimas de porcelana... Antes deste, marque Avaliação Odontológica.
Limpeza e Profilaxia: remoção de placa e tártaro... A partir de R$ 250,00.
Clareamento Dental: gel clareador que remove manchas...
```

**A ordem do `case` é a regra de negócio:** exigir avaliação vence o preço, e é
o que garante que um valor preenchido por engano num procedimento que passa pela
avaliação nunca seja falado. Sem descrição, a linha é só o nome; sem nada a
dizer sobre fluxo ou valor, termina na descrição.

`profissionais_clinica_agente` faz o mesmo com os dentistas ativos, trazendo a
jornada de cada um: `Estevão Jorge: atende segunda a sexta das 08:00 às 18:00`.

> **As três views são para conversar, não para operar — nenhuma traz `id`.** Para
> marcar com um dentista específico, o `profissional_id` vem de
> `GET /profissionais` da API. Os endpoints `GET /procedimentos` e
> `GET /profissionais` continuam existindo e respondem às mesmas perguntas por
> outro caminho: ordenam por nome e devolvem menos. Mexeu numa superfície,
> confira a outra.
