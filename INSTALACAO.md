# Instalação — do zero até a Letícia atendendo

Este é o **caminho completo**. O [`README.md`](README.md) conta o que o sistema
faz; este arquivo conta como colocá-lo no ar.

> ### 📌 Só existe um passo a passo, e é este
>
> A instalação já esteve espalhada em três documentos, e eles discordavam entre
> si. Agora **este arquivo manda**: se algum outro texto do repositório
> descrever a instalação de outro jeito, o certo é o que está aqui.

---

## Como este guia é organizado

Instalar não é uma coisa só — são duas, e elas se alternam. Umas você faz
clicando em site de outra empresa; outras a **IA da sua IDE** (Claude Code,
Codex, Cursor) faz sozinha, se você der as chaves a ela.

Cada parte abaixo diz de quem é a vez:

| | Parte | O que acontece | Tempo |
|:-:|---|---|---|
| 👤 | **1. As contas** | Você cria as contas e copia 6 valores | ~20 min |
| 👤 | **2. Os arquivos** | Você cola esses valores em 3 arquivos | ~5 min |
| 🤖 | **3. A IDE trabalha** | Você cola uma frase. Ela faz o banco e publica | ~10 min |
| 👤 | **4. Os cliques** | 4 coisas que só se fazem em painel de terceiro | ~15 min |
| 👤 | **5. A cara da sua clínica** | Dentro do sistema: a clínica, os horários, os procedimentos | ~30 min |
| 👤 | **6. Conferir e encerrar** | O teste final, e revogar o que sobrou | ~10 min |

**O que é opcional:** só o webhook (4.3) e a Vercel (4.4). Sem o webhook, o
sistema de gestão — agenda, CRM, pacientes, faturamento — funciona inteiro, e a
equipe atende o WhatsApp à mão pela tela Conversas. Sem a Vercel, ele roda na
sua máquina com `npm run dev`.

> ⚠️ **A parte 5 não é opcional, e é a que mais se esquece.** O banco nasce com
> o catálogo de procedimentos da clínica que originou este sistema — e é
> exatamente essa lista que a Letícia oferece ao paciente. Instalar sem fazer a
> parte 5 deixa o sistema **funcionando e falando de outra clínica**.

---

## Parte 0 — Antes de começar

### O que precisa estar na máquina

- **Node.js 20.19+ ou 22.12+** — confira com `node -v`. É a exigência do Vite 8;
  um Node 20.0–20.18, ou qualquer 21, falha no `npm install`
- **Git**
- Uma **IDE com IA** — Claude Code, Codex, Cursor. É ela quem monta o banco

### O repositório é privado

`git clone` sozinho **não funciona**: o GitHub pede credencial e falha.

1. **Peça acesso ao autor**, informando o seu usuário do GitHub
2. **Autentique o clone.** Gere um **Personal Access Token do GitHub** com
   permissão de leitura e entregue à sua IA — `git clone` interativo abre um
   diálogo que ela não consegue responder. Fazendo à mão, `gh auth login` ou
   uma chave SSH resolvem igual

```bash
git clone https://github.com/afonsopereiralopes/agente-odonto-crm.git
cd agente-odonto-crm
npm install
```

> ⚠️ **Esse token do GitHub é descartável.** Terminado o clone, revogue em
> **github.com → Settings → Developer settings → Tokens**. É o primeiro de
> dois tokens que morrem no fim desta instalação.

---

## Parte 1 — 👤 As contas

Nesta parte você não roda nenhum comando. Só cria contas e **copia seis
valores** — anote todos num bloco de notas, você vai colar todos na parte 2.

### 1.1. Supabase — o banco e o servidor

Crie uma conta em [supabase.com](https://supabase.com) e depois
**New Project**.

- Escolha a região mais perto dos seus usuários — no Brasil,
  `South America (São Paulo)`
- **Guarde a senha do banco num gerenciador de senhas.** Ela aparece uma vez só
- Espere alguns minutos até o projeto ficar pronto

Depois, em **Settings → API Keys**, copie:

| # | Valor | Onde está | Parece com |
|:-:|---|---|---|
| 1️⃣ | **Project URL** | campo "Project URL" | `https://abcdefgh….supabase.co` |
| 2️⃣ | **anon key** | a chave `anon` / `public` | `eyJhbGciOi…` (bem longa) |
| 3️⃣ | **Project ref** | as 20 letras dentro da Project URL | `abcdefghijklmnopqrst` |

> ⚠️ **Existe uma terceira chave na mesma tela, a `service_role`. Não copie.**
> Ela ignora toda a segurança do banco, e o lugar dela não é nenhum arquivo
> deste projeto — o Supabase entrega ela sozinho para as funções que precisam.

### 1.2. O token da conta do Supabase

Este é diferente dos outros: é da **sua conta**, não do projeto — dá acesso a
todos os seus projetos, inclusive os que não têm nada a ver com este sistema.

Em [supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens)
→ **Generate new token**.

| # | Valor | Parece com |
|:-:|---|---|
| 4️⃣ | **Personal Access Token** | `sbp_…` |

- **Dê um nome que você reconheça depois**: `instalacao-odonto-crm`. É por
  esse nome que você vai achá-lo para revogar, mesmo que já tenha apagado o
  arquivo
- Copie o valor agora — ele aparece uma vez só

> **Por que isto existe:** o comando `supabase login` abre o navegador e espera
> alguém colar um código. A IA da IDE não consegue fazer esse passo. Com o
> token num arquivo, ela aplica as migrações e publica as funções sozinha —
> **é a única razão.** Na parte 6 ele é revogado.

### 1.3. A chave da OpenAI

| # | Valor | Onde | Parece com |
|:-:|---|---|---|
| 5️⃣ | **OPENAI_API_KEY** | [platform.openai.com](https://platform.openai.com) → API Keys | `sk-…` |

> ⚠️ **Ela é obrigatória mesmo se você escolher um modelo Claude na tela.** É a
> OpenAI que transcreve os áudios e descreve as fotos — e o paciente brasileiro
> manda áudio na primeira mensagem. Sem ela, a Letícia trava logo no começo.

A da Anthropic (`console.anthropic.com` → API Keys) é **opcional**: ela libera
os dois modelos Claude no seletor. Sem ela, eles aparecem desligados, com o
motivo escrito — e os seis GPT continuam disponíveis.

### 1.4. Uma ponte de WhatsApp — só uma

O WhatsApp não deixa um sistema conversar com ele diretamente. Precisa de um
intermediário, e o sistema aceita dois. **Escolha um:**

| | **Evolution API v2** | **uazapi v2** |
|---|---|---|
| Como é | Você instala num servidor seu | Serviço pronto, você só assina |
| Custo | ~R$ 40/mês do servidor | mensalidade do serviço |
| Dá mais trabalho? | Sim — é você quem sobe | Não |
| Tem teste grátis? | — | Sim: `https://free.uazapi.dev` |

**Se escolher Evolution**, copie três valores:

| # | Valor | O que é |
|:-:|---|---|
| 6️⃣ | `EVOLUTION_API_URL` | O endereço do seu servidor, **sem barra no fim** |
| | `EVOLUTION_API_KEY` | A chave de autenticação da sua instalação |
| | `EVOLUTION_INSTANCIA` | O nome que você deu à instância do número da clínica |

**Se escolher uazapi**, copie dois:

| # | Valor | O que é |
|:-:|---|---|
| 6️⃣ | `UAZAPI_API_URL` | `https://api.uazapi.com` (ou o seu host), **sem barra no fim** |
| | `UAZAPI_TOKEN` | O token **da instância** — o da sua conexão de WhatsApp |

> ⚠️ **Não é o token admin.** A uazapi também dá um token da conta, que cria e
> apaga instâncias. Este sistema **nunca cria instância** — ele conecta a que já
> existe, e o token da instância basta. Chave a mais nos secrets é risco de
> graça.

### 1.5. Invente o segredo do webhook

Não é de site nenhum: **você inventa**. Uma frase longa e aleatória serve.

| # | Valor | Exemplo |
|:-:|---|---|
| | `WEBHOOK_SEGREDO` | `girafa-azul-42-parafuso-lento-domingo` |

> **Para que serve:** a função que recebe as mensagens fica num endereço
> público, e quem chama é a ponte de WhatsApp — que não tem login no Supabase.
> Então a tranca é este segredo, conferido dentro da própria função. Sem ele,
> qualquer pessoa que descubra o endereço faz a Letícia responder por sua conta,
> gastando a sua chave da OpenAI.

---

## Parte 2 — 👤 Os três arquivos

Agora você cola o que anotou. **São só três arquivos, e nenhum comando.**

Primeiro copie os moldes:

```bash
cp .env.example                   .env
cp .supabase-token.example        .supabase-token.local
cp agente-ia/.env.agente.example  agente-ia/.env.agente.local
```

> **Por que eles não vêm prontos no clone:** os três estão no `.gitignore`, e é
> isso que impede a sua chave de subir junto num `push`. O que é versionado é
> o **molde** de cada um — e cada molde tem, dentro dele, o comentário
> explicando de onde vem cada valor.

### `.env` — a tela

```env
VITE_SUPABASE_URL=          ← 1️⃣ Project URL
VITE_SUPABASE_ANON_KEY=     ← 2️⃣ anon key
```

> ⚠️ **Nunca ponha outra chave aqui.** Este arquivo vira JavaScript entregue ao
> navegador: o que estiver nele é visível para qualquer visitante do site. A
> `anon` pode, porque é pública por natureza e o banco a limita. A da OpenAI
> **não** — ela vai no terceiro arquivo.

### `.supabase-token.local` — a instalação

```env
SUPABASE_ACCESS_TOKEN=      ← 4️⃣ o sbp_…
SUPABASE_PROJECT_REF=       ← 3️⃣ as 20 letras
```

⛔ **Este arquivo nasce para morrer.** Ele existe só durante a instalação, e é
apagado na parte 6.

### `agente-ia/.env.agente.local` — a Letícia

São nove linhas, **e você não preenche todas**:

```env
OPENAI_API_KEY=             ← 5️⃣  obrigatória
ANTHROPIC_API_KEY=              opcional (libera os Claude)
WEBHOOK_SEGREDO=            ← o que você inventou

# --- preencha o bloco de UMA ponte, e deixe o outro em branco ---
EVOLUTION_API_URL=          ← 6️⃣ se escolheu Evolution
EVOLUTION_API_KEY=
EVOLUTION_INSTANCIA=

UAZAPI_API_URL=             ← 6️⃣ se escolheu uazapi
UAZAPI_TOKEN=
UAZAPI_ADMIN_TOKEN=             deixe vazio
```

> **Este arquivo fica parado, e é de propósito.** Na parte 3 as chaves **sobem**
> para os secrets do Supabase, e é de lá que a função lê. O arquivo continua
> aqui porque os secrets do Supabase **não podem ser lidos de volta** — ele
> vira o seu único registro do que foi configurado. Guarde.

---

## Parte 3 — 🤖 A vez da IDE

Abra o projeto na sua IDE com IA e **cole esta frase**:

```
Instale este sistema seguindo o INSTALACAO.md.

Os três arquivos de chave já estão preenchidos. Faça a parte 3:

1. Leia o CLAUDE.md e o DATABASE.md antes de tocar no banco.
2. Aplique as 24 migrações de supabase/migrations/, na ordem
   numérica, usando o SUPABASE_ACCESS_TOKEN e o SUPABASE_PROJECT_REF
   que estão em .supabase-token.local.
3. Confira o resultado com as consultas da seção 10 do DATABASE.md
   e me mostre os números.
4. Rode `npm run agente:secrets` para subir as chaves.
5. Publique as duas Edge Functions:
   `npm run agente:deploy` e `npm run agente:deploy-agenda`.
6. Rode `npm run build` para confirmar que a tela compila.

No fim, me diga o que deu certo e o que ainda falta eu fazer à mão.
```

### O que ela vai fazer, para você conferir

| Passo | O que é | Como saber que deu certo |
|---|---|---|
| **As 24 migrações** | Criam tabelas, índices, regras de segurança, as funções da agenda e o catálogo de 20 procedimentos | 12 tabelas + 5 views, 23 índices, 23 políticas, 25 funções, 10 triggers |
| **Os secrets** | Sobem as chaves do arquivo para o servidor | `npm run agente:secrets` termina sem erro |
| **As duas funções** | `whatsapp` (a Letícia) e `agenda` (a API) | Publicadas no painel do Supabase |

> ⚠️ **As duas funções vão com `--no-verify-jwt`, e isso não é descuido.**
> Quem chama a `whatsapp` é a ponte de WhatsApp, e quem chama a `agenda` é uma
> integração externa — nenhuma das duas tem login do Supabase. A autenticação
> delas é própria (o segredo do webhook e o token da API), conferida dentro do
> código. Publicar no padrão derruba as duas com um erro `401` que **nem chega**
> no nosso código, e o sintoma não aponta para a causa.

> **Se a IA travar nas migrações**, dá para fazer à mão: no painel do Supabase,
> **SQL Editor → New query**, e cole o conteúdo de cada arquivo de
> `supabase/migrations/` na ordem, do `0001` ao `0024`, clicando em **Run** a
> cada um. A ordem importa — cada um depende do anterior.

### Já dá para entrar

```bash
npm run dev
```

Mas ainda não tem usuário. Ele é o primeiro item da parte 4.

---

## Parte 4 — 👤 Os cliques que a IA não alcança

**São quatro coisas, e nenhuma delas passa por código.** São cliques em painéis
de outras empresas — por isso não tem como a IA fazer, e por isso elas estão
todas juntas aqui.

### 4.1. O primeiro usuário

Sem isso a tela de login não deixa ninguém entrar. Não existe cadastro público:
é um sistema interno.

No painel do Supabase: **Authentication → Users → Add user**

- Preencha e-mail e senha
- ⚠️ **Marque `Auto Confirm User`** — sem isso o Supabase exige confirmação por
  e-mail e o login falha com "e-mail ou senha incorretos", que manda você
  procurar o problema no lugar errado

O perfil na tabela `usuarios` é criado sozinho por um gatilho do banco. **Não
crie essa linha à mão.**

### 4.2. A política de senha

**Isto não vem em migração** — as regras de senha vivem na configuração do
projeto, não no banco. Um projeto novo nasce aceitando senha de **seis**
caracteres, sem exigência nenhuma, por mais que a tela de Configurações mostre
uma lista de requisitos.

No painel: **Authentication → Sign In / Providers → Password**

| Campo | Valor |
|---|---|
| Minimum password length | `10` |
| Password Requirements | Lowercase, uppercase letters, digits and symbols |

> **Por que importa:** a lista que aparece em Configurações → Perfil é uma cópia
> exata dessa regra, feita para a pessoa saber o que se espera antes de digitar.
> Se as duas divergirem, ela preenche todos os itens verdes e mesmo assim leva
> uma recusa do servidor — **sem saber de qual regra**.

> **Opcional, e vale a pena:** ligue também o **Prevent use of leaked
> passwords**. É o único item que barra `Senha@2026`, que atende a todos os
> requisitos acima e está em qualquer lista de senhas vazadas.

### 4.3. Apontar o webhook — o passo que ninguém adivinha

**Só faça este se você vai usar a Letícia.**

A ponte de WhatsApp não descobre a nossa função sozinha: alguém precisa dizer a
ela para onde mandar as mensagens.

> ⚠️ **É o passo mais fácil de esquecer, e o sintoma é o pior de todos:**
> WhatsApp pareado, o card da tela **verde escrito "Conectado"**, e silêncio
> absoluto. Aconteceu de verdade na estreia da uazapi.

O endereço da função é sempre:

```
https://SEU_REF.supabase.co/functions/v1/whatsapp
```

**Se você escolheu Evolution** — o segredo vai no cabeçalho.
`POST {EVOLUTION_API_URL}/webhook/set/{instancia}`:

```json
{ "webhook": {
    "enabled": true,
    "url": "https://SEU_REF.supabase.co/functions/v1/whatsapp",
    "headers": { "x-webhook-segredo": "O_SEGREDO_QUE_VOCE_INVENTOU" },
    "byEvents": false, "base64": false,
    "events": ["MESSAGES_UPSERT"] } }
```

**Se você escolheu uazapi** — ela **não aceita cabeçalho customizado**, então o
segredo viaja na própria URL. `POST {UAZAPI_API_URL}/webhook`, com o token da
instância no cabeçalho `token`:

```json
{ "enabled": true,
  "url": "https://SEU_REF.supabase.co/functions/v1/whatsapp?segredo=O_SEGREDO_QUE_VOCE_INVENTOU",
  "events": ["messages"],
  "excludeMessages": ["wasSentByApi", "isGroupYes"],
  "addUrlEvents": false, "addUrlTypesMessages": false }
```

> **A função aceita os dois jeitos** — cabeçalho ou `?segredo=`. Não é gambiarra
> para a uazapi: é o mesmo segredo, entrando pela porta que cada ponte permite.

> ⚠️ **Só o webhook da ponte ATIVA deve apontar para cá.** Se as duas apontarem,
> a inativa tem as mensagens descartadas — o que é o certo, mas é desperdício.
> Qual está ativa se escolhe no seletor da tela Secretária de IA.

**E confira pela tela, não pelo painel da ponte.** O card "Conexão do WhatsApp",
em **menu do usuário → Secretária de IA**, pergunta à ponte onde o webhook
aponta e avisa quando não é para cá.

### 4.4. As variáveis na Vercel

**Só faça este quando for colocar o site no ar.** Para usar na própria máquina,
o `npm run dev` basta.

A Vercel detecta tudo sozinha (Vite → `npm run build` → `dist`). Uma coisa só
precisa ser feita à mão, em **Settings → Environment Variables**, para todos os
ambientes:

```
VITE_SUPABASE_URL=https://SEU_REF.supabase.co
VITE_SUPABASE_ANON_KEY=sua_anon_key
```

> ⚠️ **Sem elas o build NÃO falha.** O Vite embute `undefined`, o site sobe, e a
> tela fica em branco no primeiro acesso ao banco. Nada no terminal aponta para
> a causa.

> ⚠️ **Variável do Vite entra no bundle na hora do build.** Mudou uma variável?
> **Reimplante** — só salvar no painel não muda o site que já está no ar.

O `vercel.json` já está no repositório e não precisa de nada. Ele existe por um
motivo: sem o rewrite que ele traz, entrar direto em `/agenda` ou dar F5 dentro
da ficha de um paciente devolve **404 da Vercel**. Navegar pelo menu continuaria
funcionando — então o defeito só apareceria quando alguém compartilhasse um
link, ou seja, na frente de outra pessoa.

---

## Parte 5 — 👤 A cara da sua clínica

Agora você **entra no sistema** e faz dele o da sua clínica. Tudo aqui é pela
tela: nenhum comando, nenhum SQL, nenhuma linha de código.

> ### ⚠️ Faça esta parte inteira ANTES de ligar a Letícia
>
> Ela não inventa nada — ela **lê** o que está aqui. O endereço que ela informa,
> o horário que ela anuncia, os tratamentos que ela oferece e o preço que ela
> fala saem todos destas telas.
>
> Com a parte 5 pela metade, ela atende com a identidade da clínica que
> originou este sistema, e o paciente não tem como saber.

A ordem abaixo importa: cada passo aparece nos seguintes.

### 5.1. Configurações → Clínica

**menu do usuário → Configurações → aba Clínica.**

| Campo | Vira o quê |
|---|---|
| **Nome da clínica** | O nome na barra lateral, e o que a Letícia diz |
| **Endereço**, **bairro**, **cidade/UF**, **CEP** | A resposta de *"onde vocês ficam?"* |
| **Link do Google Maps** | O que ela manda para quem pede como chegar |
| **Instagram** e **site** | Ela cita quando fazem sentido |

**O rodapé dessa aba mostra a prévia do que a Letícia vai falar.** Não é
ilustração — é uma consulta de verdade ao que ela lê. Se a prévia estiver
estranha, o paciente vai ouvir estranho.

> **Campo vazio não vira frase.** Deixar o Instagram em branco faz a linha
> sumir, o que é o certo. Preenchido pela metade é que dá problema.

A **logo** fica nessa mesma tela. Ela aparece na barra lateral e no login.

### 5.2. Configurações → Horários

**A grade de atendimento, e o fuso horário.**

O fuso vem no card **acima** da grade, e não é detalhe: ele decide em que hora
uma consulta cai. A conferência é uma só — **o campo tem que bater com o
relógio do computador da recepção.**

> ⚠️ **Se discordarem, a Letícia e a recepção discordam exatamente naquelas
> horas.** Com jornada das 8h às 18h, um deslocamento para trás joga a manhã
> inteira para fora do expediente, e ela responde *"não tenho horário"* para
> horário livre.

> ⚠️ **Esta grade é o que a clínica ANUNCIA, não o que a agenda oferece.** Quem
> manda na disponibilidade é a jornada de cada dentista (5.4). Anunciar até as
> 18:00 sem nenhum dentista depois das 17:00 faz a Letícia prometer horário que
> a própria agenda recusa em seguida.

### 5.3. Procedimentos — **o passo que muda tudo**

**menu lateral → Procedimentos.**

> ### 🔴 Os 20 procedimentos que você vê ali não são seus
>
> Eles vieram nas migrações, e são o catálogo da clínica que originou este
> sistema. **A Letícia recita essa lista para os seus pacientes** — e desde a
> migração `0022` ela é um **vocabulário fechado**: é o único conjunto de nomes
> que o sistema consegue gravar e agendar.
>
> Um tratamento que a sua clínica faz e não está nessa lista **não pode ser
> marcado por ninguém** — nem pela Letícia, nem pela API — até você cadastrá-lo.

O que fazer, em ordem:

1. **Desligue o que a sua clínica não faz.** O botão de liga/desliga fica no
   próprio card. Desligado, o procedimento some da boca da Letícia na mensagem
   seguinte — sem deploy, sem editar prompt.
2. **Cadastre o que falta.** É o passo que ninguém lembra, e o sintoma de
   esquecer é a Letícia não conseguir marcar algo que está no cartaz da
   recepção.
3. **Revise as descrições**, no botão Editar de cada card. A curta é o que ela
   fala no catálogo; a longa é o que ela responde a *"como funciona?"*.
4. **Confira os preços e as durações.** O preço só é falado quando o
   procedimento **não** passa pela avaliação — a caixa está no mesmo modal.

> ⚠️ **Os textos longos que vieram são rascunho.** Foram escritos para outra
> clínica e **precisam da revisão de um dentista** antes de irem para a boca de
> um paciente.

#### A avaliação vem marcada como GRATUITA

Fora da grade de cards existe a **porta de entrada** — a Avaliação
Odontológica, por onde quase todo tratamento passa antes.

**Ela vem com o valor `0`, e zero não é campo em branco: zero faz a Letícia
dizer que a avaliação é gratuita.** Foi uma decisão comercial da clínica de
origem, e ela vai ser afirmada ao seu paciente na primeira conversa.

| Se na sua clínica ela é… | Preencha |
|---|---|
| **gratuita** | deixe `0` |
| **paga** | o valor — ela passa a dizer *"a partir de R$ X"* |
| **combinada caso a caso** | deixe **vazio** — ela não fala valor nenhum |

#### ⚠️ Desative, não exclua — depois que o sistema estiver em uso

Enquanto o banco está vazio (agora), **excluir é seguro**.

Depois que a Letícia atender alguém, não é mais: o nome do procedimento fica
gravado na ficha de quem se interessou por ele, e o banco recusa salvar uma
ficha que aponte para um procedimento que saiu do catálogo. O sintoma é cruel —
*"algum procedimento escolhido não está mais no catálogo"* **sem nenhuma caixa
marcada na tela para desmarcar**, e a ficha para de aceitar até correção de
nome e de WhatsApp.

> **Se acontecer, dá para sair sem SQL:** recrie o procedimento com o **mesmo
> nome**, abra a ficha, desmarque, salve — e só então apague.

**Desativar não tem esse problema**, e é reversível com um clique. É para isso
que o botão existe.

### 5.4. Profissionais

**menu lateral → Profissionais.** Cadastre os dentistas de verdade.

- **Não existe tela de "criar agenda".** Cadastrar o profissional já cria a
  agenda dele — e a cor escolhida aqui é a cor dos blocos no calendário.
- **A jornada de cada um é o que manda na disponibilidade.** É ela, e não a
  grade de 5.2, que decide o horário que a Letícia oferece.

### 5.5. Configurações → Perfil

Seu nome e sua foto, que aparecem no rodapé da barra lateral.

---

## Parte 6 — 👤 Conferir e encerrar

### O teste de aceite

| # | Faça | Esperado |
|:-:|---|---|
| 1 | Entrar com o usuário criado em 4.1 | Cai no Dashboard |
| 2 | Abrir `/agenda` **digitando na barra de endereço** | Abre (é o teste do rewrite) |
| 3 | Dar F5 dentro da ficha de um paciente | Continua na ficha |
| 4 | **menu → Token e API**, criar o primeiro token | Os cURLs mostram a **sua** URL, não `undefined` |
| 5 | **menu → Secretária de IA** | Conexão "Conectado", webhook apontado |

**E o teste da parte 5 — o que diz se o sistema é o da SUA clínica:**

| # | Faça | Esperado |
|:-:|---|---|
| 6 | **Configurações → Clínica**, olhe a prévia no rodapé | As frases falam da sua clínica, não de outra |
| 7 | **Procedimentos** | Só os que a sua clínica faz estão ligados, e os seus estão lá |
| 8 | Abra a **Avaliação Odontológica** | O valor é o seu (`0` = ela dirá "gratuita") |
| 9 | **Agenda** | A grade da semana bate com a jornada dos seus dentistas |

**Se você ligou a Letícia**, faça também o teste de fogo:

1. Na página **Secretária de IA**, ligue o **modo teste** e cadastre o **seu**
   número
2. Mande uma mensagem para o WhatsApp da clínica, do seu celular
3. Ela responde em alguns segundos
4. Abra `/conversas` e leia a conversa do lado da equipe

> ⚠️ **Deixe o modo teste ligado até confiar nela.** Com ele ligado, ela
> responde **só** aos números cadastrados; qualquer outra pessoa que escrever
> fica sem resposta automática, e a equipe atende pela tela Conversas.
> Desligar o modo teste é o ato que a coloca na frente do público — não é um
> passo de instalação, é uma decisão da clínica.

### Encerrar: revogue o que sobrou

Dois tokens desta instalação não servem para mais nada. **Some com os dois:**

**1. O do Supabase — nesta ordem:**

```bash
# 1º  https://supabase.com/dashboard/account/tokens  →  Revoke
# 2º
rm .supabase-token.local
```

> **A ordem importa.** Apagar primeiro não revoga nada: o token continua vivo na
> sua conta, e você acabou de jogar fora a cópia que dizia qual era. (É por isso
> que o passo 1.2 mandou dar um nome reconhecível — é o que te salva se isso
> acontecer.)

**2. O do GitHub**, usado no clone: **github.com → Settings → Developer settings
→ Tokens → Revoke**.

Precisou publicar de novo depois? **Gere outro.** Leva quinze segundos, e é bem
mais barato que manter um token de acesso total vivo por seis meses dentro de um
arquivo esquecido.

> Ao gerar outro token do Supabase, refaça o `.supabase-token.local` com as
> **duas** linhas — o `SUPABASE_PROJECT_REF` não é credencial e não dá acesso a
> nada sozinho, mas o `npm run agente:deploy` precisa dele.

---

## Deu errado?

<details>
<summary><strong>A tela fica em branco ao abrir</strong></summary>

Falta o `.env` ou os valores estão errados. Confira se as duas variáveis
começam com `VITE_` — sem esse prefixo o Vite não as entrega ao navegador. E
**reinicie o `npm run dev`** depois de editar: ele lê o arquivo só ao subir.
</details>

<details>
<summary><strong>"E-mail ou senha incorretos", mas a senha está certa</strong></summary>

O usuário foi criado sem o `Auto Confirm User` (passo 4.1). No painel, em
**Authentication → Users**, veja se a coluna de confirmação está preenchida.
</details>

<details>
<summary><strong>As telas abrem vazias, mesmo com dados no banco</strong></summary>

Alguma migração não rodou, e as regras de acesso não existem. Confira a
contagem com as consultas da [seção 10 do `DATABASE.md`](DATABASE.md) — é lá
que mora o número esperado.
</details>

<details>
<summary><strong>`npm run agente:deploy` responde 401 Unauthorized</strong></summary>

É o token, não o código. Confira se `.supabase-token.local` existe e se as duas
linhas estão preenchidas — `SUPABASE_ACCESS_TOKEN` e `SUPABASE_PROJECT_REF`.
Se o token já foi revogado (parte 6), gere outro.
</details>

<details>
<summary><strong>O WhatsApp diz "Conectado", mas a Letícia não responde ninguém</strong></summary>

**Quase sempre é o webhook (passo 4.3).** Atender depende de três coisas ao
mesmo tempo, e a tela mostra as três:

1. O agente **ligado** — Secretária de IA
2. O WhatsApp **conectado** — o card de conexão
3. O webhook **apontado para a nossa função** — a linha logo abaixo do card

Se as três estiverem verdes, o suspeito seguinte é o **modo teste**: com ele
ligado, ela só responde os números cadastrados.

E confira se o `WEBHOOK_SEGREDO` não está vazio nos secrets: vazio, a função
recusa **todo** webhook com 401 e o sintoma é exatamente este.
</details>

<details>
<summary><strong>Ela responde texto, mas some quando mando áudio ou foto</strong></summary>

Falta a `OPENAI_API_KEY`, ou ela não tem saldo. É a OpenAI que transcreve o
áudio e descreve a foto — **mesmo com um modelo Claude escolhido na tela.**
</details>

<details>
<summary><strong>"Esse horário acabou de ser ocupado" ao agendar</strong></summary>

Não é erro: o banco recusou duas consultas se sobrepondo na mesma agenda.
Escolha outro horário ou outro profissional. Repetir a mesma tentativa dá
sempre o mesmo resultado.
</details>

---

## Depois de instalar

| Para | Leia |
|---|---|
| Entender o que cada tela faz | [`README.md`](README.md) |
| Mexer no código | [`CLAUDE.md`](CLAUDE.md) |
| Mexer no banco | [`DATABASE.md`](DATABASE.md) |
| Entender a Letícia por dentro | [`agente-ia/README.md`](agente-ia/README.md) |
| **Adaptar o prompt para a sua clínica** | [`agente-ia/GUIA-DO-PROMPT.md`](agente-ia/GUIA-DO-PROMPT.md) |
| Integrar outro sistema à agenda | [`API_AGENTE.md`](API_AGENTE.md) |

> **Não pulou a [parte 5](#parte-5--a-cara-da-sua-clínica), pulou?** É a que
> transforma "o sistema instalou" em "o sistema é da minha clínica". Um sistema
> no ar com o catálogo de outra clínica funciona perfeitamente — e fala coisa
> errada para o seu paciente, sem nada na tela indicando isso.
