# Odonto Clinica — Sistema de Gestão

Sistema web de gestão para clínicas odontológicas, feito para trabalhar em
conjunto com um **Agente de IA que atende pacientes pelo WhatsApp**.

O agente conversa, qualifica e agenda. Este sistema é onde a equipe da clínica
acompanha tudo: o funil de leads, os agendamentos, o faturamento e as métricas
de desempenho do próprio agente.

---

## Índice

- [O que o sistema faz](#o-que-o-sistema-faz)
- [Tecnologias](#tecnologias)
- [Instalação passo a passo](#instalação-passo-a-passo)
- [Como o banco está organizado](#como-o-banco-está-organizado)
- [Segurança](#segurança)
- [Integração com o Agente de IA](#integração-com-o-agente-de-ia)
- [Estrutura do projeto](#estrutura-do-projeto)
- [Problemas comuns](#problemas-comuns)
- [Documentação completa](#documentação-completa)

---

## O que o sistema faz

### 📊 Dashboard

Visão geral da operação, com filtro por período (hoje, últimos 7 dias, este mês,
intervalo personalizado…).

- Novos contatos, consultas agendadas e taxa de conversão
- Distribuição dos leads pelo funil
- Gráfico de contatos por dia da semana
- **Dentro × fora do horário comercial** — mostra quantos pacientes chegaram
  quando a clínica estava fechada e foram atendidos mesmo assim pelo agente
- Lista das próximas consultas

### 🗂️ CRM (Kanban)

Quadro com as 9 etapas do funil e arrastar-e-soltar entre colunas.

- O status é salvo no banco assim que o card é solto
- **Atualiza sozinho**: quando o Agente de IA move um lead pelo WhatsApp, o card
  anda na tela sem precisar recarregar (via Supabase Realtime)
- Cada card mostra há quanto tempo foi a última interação

### 📅 Agenda

Calendário com **todas as agendas da clínica ao mesmo tempo**, cada profissional
na sua cor.

- Visualização **semanal** (grade de horas, estilo Google Calendar) e **mensal**
- Filtro por profissional — ligue e desligue agendas para comparar
- Clique num horário vazio para já abrir o agendamento naquele dia e hora
- **Novo agendamento**: escolhe a agenda, data, horário, duração e procedimento
  em texto livre. Se o paciente ainda não existir, é criado no CRM na hora
- Avisa antes de marcar fora da jornada do profissional ou sobre um bloqueio
- **Atualiza sozinha**: consulta marcada pelo Agente de IA aparece na tela
- Consulta duplicada é **impossível** — quem impede é o próprio banco, não a tela

### 🦷 Profissionais

Os dentistas da clínica: nome, sobrenome, cor e horários de atuação.

Cadastrar um profissional **já cria a agenda dele** — não existe passo separado,
porque a agenda de alguém são as consultas dessa pessoa. A cor escolhida aqui é
a cor dos blocos no calendário.

Profissional com consultas não pode ser excluído (o banco impede, para preservar
o histórico) — pode ser **desativado**, o que o tira da agenda e dos seletores.

### 👥 Leads e 🦷 Clientes

Duas páginas separadas, alimentadas pela mesma base:

| Página | Quem aparece |
|---|---|
| **Leads** | Ainda não compareceram a nenhuma consulta — inclusive quem já agendou |
| **Clientes** | Já realizaram pelo menos uma consulta |

A migração de uma página para a outra é automática, quando o status vira
"Consulta Realizada".

Ambas têm busca por nome ou telefone, filtro por período e **exportação em PDF e
CSV**.

### 📇 Ficha do paciente

- Dados cadastrais, data de nascimento e valor acumulado
- Histórico de consultas, com procedimento, data, status e valor pago
- Resumo da conversa com o Agente de IA
- Anotações livres da equipe
- Troca de status pelo funil

### ⚙️ Configurações

- **Perfil** — nome e foto do usuário, nome e logotipo da clínica
- **Clínica** — endereço, bairro, cidade, UF, CEP, Google Maps, Instagram e
  site, com a prévia exata do que o Agente de IA lê
- **Horários** — grade de atendimento por dia da semana, usada pelo Dashboard
- **Procedimentos** — catálogo de serviços oferecidos
- **Senha** — troca com medidor de força
- **Token e API** — chaves de acesso do Agente de IA e a documentação dos sete
  endpoints, com os cURLs prontos para colar em qualquer cliente HTTP

---

## Tecnologias

| Camada | Tecnologia |
|---|---|
| Interface | React 19 + TypeScript 6 |
| Build | Vite 8 |
| Rotas | React Router 7 |
| Backend | Supabase (PostgreSQL 17 + Auth + Storage + Realtime) |
| Gráficos | Recharts |
| Kanban | dnd-kit |
| PDF | jsPDF + jsPDF-AutoTable |
| Ícones | Lucide |

Não há backend próprio: o front conversa direto com o Supabase, e a segurança
fica a cargo do **Row Level Security** do PostgreSQL.

---

## Instalação passo a passo

### Pré-requisitos

- **Node.js 20 ou superior** — verifique com `node -v`
- Uma conta gratuita no [Supabase](https://supabase.com)
- Git

### 1. Clonar e instalar

```bash
git clone https://github.com/afonsopereiralopes/odonto-clinica.git
cd odonto-clinica
npm install
```

### 2. Criar o projeto no Supabase

Acesse [supabase.com](https://supabase.com) → **New Project**.

- Escolha uma região próxima dos seus usuários (no Brasil, `South America (São Paulo)`)
- Guarde a senha do banco num gerenciador de senhas — ela só aparece uma vez

Aguarde alguns minutos até o projeto ficar pronto.

### 3. Criar as tabelas

No painel do Supabase, abra o **SQL Editor** → **New query**.

São **treze arquivos, nesta ordem** — cada um depende do anterior:

1. [`supabase/migrations/0001_schema_inicial.sql`](supabase/migrations/0001_schema_inicial.sql)
2. [`supabase/migrations/0002_agenda_profissionais.sql`](supabase/migrations/0002_agenda_profissionais.sql)
3. [`supabase/migrations/0003_whatsapp_unico.sql`](supabase/migrations/0003_whatsapp_unico.sql)
4. [`supabase/migrations/0004_api_agente.sql`](supabase/migrations/0004_api_agente.sql)
5. [`supabase/migrations/0005_catalogo_procedimentos.sql`](supabase/migrations/0005_catalogo_procedimentos.sql)
6. [`supabase/migrations/0006_informacoes_clinica.sql`](supabase/migrations/0006_informacoes_clinica.sql)
7. [`supabase/migrations/0007_horario_na_view.sql`](supabase/migrations/0007_horario_na_view.sql)
8. [`supabase/migrations/0008_procedimentos_view.sql`](supabase/migrations/0008_procedimentos_view.sql)
9. [`supabase/migrations/0009_profissionais_view.sql`](supabase/migrations/0009_profissionais_view.sql)
10. [`supabase/migrations/0010_agente_conversas.sql`](supabase/migrations/0010_agente_conversas.sql)
11. [`supabase/migrations/0011_procedimentos_detalhados.sql`](supabase/migrations/0011_procedimentos_detalhados.sql)
12. [`supabase/migrations/0012_procedimentos_texto_enxuto.sql`](supabase/migrations/0012_procedimentos_texto_enxuto.sql)
13. [`supabase/migrations/0013_conversas_lista.sql`](supabase/migrations/0013_conversas_lista.sql)

Copie **todo** o conteúdo de cada um, cole e clique em **Run**.

Ao final você terá:

```
12 tabelas + 5 views     estrutura de dados
21 índices               desempenho e integridade (um deles impede
                         duas pessoas com o mesmo WhatsApp)
21 políticas de RLS      controle de acesso (13 no banco + 8 no Storage)
3 buckets de Storage     perfil, logotipo e as mídias do WhatsApp
15 funções + 8 triggers  automações internas e as regras da agenda
1 restrição de exclusão  impede duas consultas no mesmo horário
3 tabelas no Realtime    atualização automática da tela
```

E já deixa cadastrados o horário comercial padrão e os **20 procedimentos** da
clínica — todos editáveis depois pela tela de Configurações. Profissionais não
vêm de exemplo: cadastre os seus na tela **Profissionais**, e a agenda de cada
um nasce junto. Tokens também começam vazios: crie o primeiro em
**Configurações → Token e API**, senão a API responde 401 para quem chamar.

### 4. Configurar as variáveis de ambiente

Crie um arquivo chamado `.env` na raiz do projeto:

```env
VITE_SUPABASE_URL=https://SEU_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=sua_chave_anon_aqui
```

Os dois valores estão em **Settings → API Keys**, no painel do Supabase:

- `VITE_SUPABASE_URL` → o campo **Project URL**
- `VITE_SUPABASE_ANON_KEY` → a chave **anon / public**

> ⚠️ Use a chave **anon**, nunca a **service_role**. A diferença está explicada
> em [Segurança](#segurança).

### 5. Criar o primeiro usuário

Sem isso a tela de login não deixa ninguém entrar — não existe cadastro público,
por ser um sistema interno.

No painel: **Authentication → Users → Add user**.

- Preencha e-mail e senha
- **Marque a opção `Auto Confirm User`** — sem ela o Supabase exige confirmação
  por e-mail e o login falha

O perfil na tabela `usuarios` é criado automaticamente por um trigger. Não crie
essa linha manualmente.

### 6. Rodar

```bash
npm run dev
```

Acesse o endereço mostrado no terminal (normalmente `http://localhost:5173`) e
entre com o usuário que você acabou de criar.

### Comandos disponíveis

```bash
npm run dev       # servidor de desenvolvimento
npm run build     # build de produção (roda o TypeScript antes)
npm run preview   # pré-visualiza o build
npm run lint      # análise estática
```

---

## Deploy na Vercel

O sistema é uma SPA estática que fala com o Supabase pelo navegador — não há
servidor próprio, então a Vercel serve o `dist/` e pronto. A detecção automática
já acerta o framework (Vite), o comando (`npm run build`) e a pasta (`dist`).

**Duas coisas precisam ser feitas à mão, e sem elas o site sobe quebrado:**

### 1. As variáveis de ambiente, no painel da Vercel

O `.env` está no `.gitignore` — e deve continuar assim. Em
**Settings → Environment Variables**, cadastre as duas, para todos os ambientes:

```
VITE_SUPABASE_URL=https://SEU_REF.supabase.co
VITE_SUPABASE_ANON_KEY=sua_anon_key
```

> ⚠️ **Sem elas o build não falha** — o Vite não reclama de variável ausente.
> Ele embute `undefined`, o site sobe, e a tela fica em branco no primeiro
> acesso ao Supabase. O sintoma não aponta para a causa.

Variável do Vite só entra no bundle durante o build: **mudou a variável,
precisa reimplantar.**

### 2. O `vercel.json` — já está no repositório

```json
{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
```

As rotas são client-side (`BrowserRouter`). Sem esse rewrite, entrar direto em
`/agenda` ou dar F5 em `/leads/algum-id` devolve **404 da Vercel**: não existe
arquivo nesses caminhos. Navegar pela barra lateral funcionaria, o que faz o
problema aparecer só quando alguém compartilha um link — ou seja, na frente de
outra pessoa.

O rewrite não atrapalha os assets: a Vercel serve o arquivo real quando ele
existe, e só cai no `index.html` quando não existe.

### O que **não** precisa

**Configurar Redirect URLs no Supabase Auth.** O login é
`signInWithPassword`, sem OAuth e sem link mágico — nada volta por redirect.

### Depois de subir, confira

1. Entrar com um usuário e chegar no Dashboard
2. Abrir `/agenda` **digitando na barra de endereço** — é o teste do rewrite
3. Dar F5 dentro de uma ficha de paciente
4. Configurações → Token e API: a URL dos cURLs tem que apontar para o seu
   projeto do Supabase, e não para `undefined`

> A Edge Function da API **não** vai para a Vercel — ela roda no Supabase e
> continua onde está. O deploy aqui é só do sistema que a equipe usa.

---

## Como o banco está organizado

Doze tabelas e quatro views no schema `public`:

| Objeto | Papel |
|---|---|
| `crm_clinica_dados` | Tabela principal — leads e pacientes |
| `crm_clinica` | **View** sobre a tabela acima (leia o aviso abaixo) |
| `consultas` | Agendamentos — ligam um lead a um profissional e a um horário |
| `profissionais` | Dentistas. **A agenda de cada um são as consultas dele** |
| `profissional_horarios` | Jornada de trabalho, por dia da semana |
| `profissional_bloqueios` | Férias, feriados, almoço |
| `usuarios` | Perfis da equipe, espelhando o Auth |
| `configuracoes_clinica` | Identidade, endereço e fuso horário da clínica |
| `horario_comercial` | Grade de atendimento da clínica |
| `servicos_clinica` | Catálogo de procedimentos |
| `api_tokens` | Chaves de acesso da API, guardadas hasheadas |
| `mensagens_whatsapp` | Cada mensagem trocada no WhatsApp — a memória do Agente de IA |
| `configuracoes_agente` | Linha única: modelo, prompt, liga/desliga e modo teste do agente |
| `conversas_lista` | **View** — uma linha por conversa do WhatsApp, para a tela Conversas |
| `informacoes_clinica_agente` | **View** — dados da clínica em frases prontas, para o Agente de IA |
| `procedimentos_clinica_agente` | **View** — procedimentos ativos em frases prontas, para o Agente de IA |
| `profissionais_clinica_agente` | **View** — dentistas ativos e a jornada de cada um, para o Agente de IA |

### ⚠️ Não existe tabela de agenda — e é de propósito

A agenda de um profissional é o conjunto de consultas com o `profissional_id`
dele. Cadastrar o dentista já cria a agenda; não há como as duas coisas ficarem
fora de sincronia, porque são a mesma coisa.

### ⚠️ Um WhatsApp, uma pessoa

O `whatsapp_lead` é gravado sempre no mesmo formato — só dígitos, com o código
do país: `5511987654321`, exatamente como a Evolution entrega. Um índice único
impede que duas pessoas fiquem com o mesmo número, e um gatilho tira a
pontuação antes de gravar, para `+55 (11) 98765-4321` e `5511987654321` não
virarem dois registros do mesmo telefone.

Nos formulários, o campo tem seletor de país e trava a quantidade de dígitos de
cada um. Se o número já for de alguém, a tela diz de quem é e leva até essa
pessoa em vez de criar contato repetido.

Contato sem telefone é permitido, e vários deles convivem — o índice ignora
vazios.

### ⚠️ O banco impede agendamento duplo

A restrição `consultas_sem_sobreposicao` não deixa um profissional ter duas
consultas ativas se sobrepondo. Está no banco, e não na tela, porque a recepção
e o Agente de IA marcam ao mesmo tempo: verificar antes e gravar depois deixa uma
janela em que os dois passam — e o resultado é dois pacientes na mesma cadeira.

Consulta cancelada libera o horário automaticamente.

### ⚠️ `crm_clinica` é uma view, não uma tabela

Este é o ponto que mais confunde quem pega o projeto.

A tabela física é `crm_clinica_dados`. A view `crm_clinica` repassa todas as
colunas dela e **acrescenta uma calculada**: `minutos_ultima_mensagem`, o "há X
minutos" que aparece nos cards do CRM.

Ela precisa ser calculada na leitura porque, gravada numa coluna comum, o número
congelaria: um lead parado há 3 horas continuaria exibindo "há 2 minutos" para
sempre, já que ninguém reescreveu a linha nesse meio-tempo.

Na prática:

- **Leitura e escrita usam `crm_clinica`.** A view é auto-atualizável, então
  `insert`, `update` e `delete` funcionam normalmente
- **Nunca grave em `minutos_ultima_mensagem`** — é calculada
- **Realtime assina `crm_clinica_dados`**, a tabela. O PostgreSQL só replica
  tabelas; assinar a view não dá erro, apenas nunca dispara

O detalhamento completo está em [`DATABASE.md`](DATABASE.md).

### Status do funil

A coluna `status` aceita exatamente estes nove valores:

| Valor | Significado | Página |
|---|---|---|
| `iniciou_conversa` | Chegou, sem interação ainda | Leads |
| `conversando` | Em conversa com o agente | Leads |
| `consulta_agendada` | Consulta marcada | Leads |
| `consulta_cancelada` | Consulta cancelada | Leads |
| `follow_up_1_feito` | Primeira retomada enviada | Leads |
| `follow_up_2_feito` | Segunda retomada | Leads |
| `follow_up_3_feito` | Terceira retomada | Leads |
| `consulta_realizada` | Compareceu | **Clientes** |
| `paciente_recorrente` | Voltou mais de uma vez | **Clientes** |

Para alterar essa lista é preciso mexer em **dois lugares**: a restrição `CHECK`
no banco e o tipo `LeadStatus` em [`src/types/index.ts`](src/types/index.ts).
Nada sincroniza os dois automaticamente.

---

## Segurança

### As duas chaves do Supabase

| Chave | Onde pode ficar | O que faz |
|---|---|---|
| `anon` | No frontend, sem problema | Respeita o RLS — só enxerga o que as políticas permitem |
| `service_role` | **Só no servidor** | **Ignora todo o RLS.** Acesso total ao banco |

A chave `anon` é pública por natureza: ela vai embutida no JavaScript entregue ao
navegador. Isso é seguro **porque o RLS está ativo**.

A `service_role` **nunca** pode aparecer no frontend, no `.env` deste projeto,
num print de tela ou numa mensagem de chat. Quem a tiver, lê e escreve tudo.

### Nunca envie o `.env` para o Git

O arquivo já está listado no [`.gitignore`](.gitignore). Confirme antes de
commitar:

```bash
git check-ignore -v .env    # deve responder com a linha do .gitignore
git status                  # o .env não pode aparecer aqui
```

Se algum segredo for commitado por engano, **trocar o arquivo não basta** — ele
continua no histórico do Git. É preciso revogar a credencial e gerar outra.

### Controle de acesso

O RLS está ativo nas 12 tabelas, com 13 políticas (mais 8 no Storage). O modelo
atual é:

- Quem **não** está autenticado não enxerga absolutamente nada
- Quem está autenticado é considerado parte da equipe e enxerga tudo
- Cada usuário só edita o próprio perfil

> Se a sua clínica precisar de níveis de acesso — por exemplo, a recepção não ver
> valores financeiros — as políticas precisam ser reescritas. É bem mais simples
> fazer isso **antes** de haver dados reais.

### Proteção do login

A tela de login bloqueia por 30 segundos após 5 tentativas erradas. É uma
proteção de interface, não substitui as políticas do Supabase.

---

## Integração com o Agente de IA

O agente é a **Letícia**, e ela mora dentro deste repositório: a Edge Function
`supabase/functions/whatsapp/`. Quem entrega as mensagens é a **Evolution API**
(WhatsApp não oficial); quem pensa é a OpenAI.

**📘 Tudo sobre ela está em [`agente-ia/`](agente-ia/)** — comece pelo
[`agente-ia/README.md`](agente-ia/README.md).

> Um desenho anterior usava **Chatwoot** e **n8n**, e foi abandonado antes de
> rodar. Sobraram no schema as colunas `*_chatwoot` de `crm_clinica_dados`, que
> ninguém escreve.

### O que o agente lê e o que ele grava

Esta é a lista fechada.

| Objeto | Acesso | Para quê |
|---|:---:|---|
| `crm_clinica` | **lê e grava** | Cria o lead que chegou pelo WhatsApp, avança o status e preenche nome, procedimento de interesse e resumo |
| `mensagens_whatsapp` | **lê e grava** | A memória da conversa: cada mensagem trocada, para lembrar do que já foi dito |
| `consultas` | **grava só por função SQL** | Marcar, remarcar e cancelar. Lê direto, só as consultas daquele paciente |
| bucket `midias-whatsapp` | **grava** | O áudio e a foto que o paciente mandou. É privado |
| `informacoes_clinica_agente` | **só lê** | Endereço, bairro, cidade/UF, CEP, horário de atendimento, Google Maps, Instagram e site |
| `procedimentos_clinica_agente` | **só lê** | Os procedimentos ativos, com a descrição curta de cada um |
| `profissionais_clinica_agente` | **só lê** | Os dentistas ativos e a jornada de cada um |
| `servicos_clinica` | **só lê** | A explicação completa de **um** procedimento, quando o paciente pergunta |
| `configuracoes_agente` | **só lê** | Modelo, prompt e a regra do modo teste |
| `configuracoes_clinica` | **só lê** | Só o fuso horário |

As três últimas são **views de coluna única**, com uma informação por linha, já
escrita como frase — o agente lê e fala, sem montar texto:

```sql
select informacao   from public.informacoes_clinica_agente;
-- Rua: Av. Eng. Domingos Ferreira, 170
-- Cidade: Recife/PE
-- Atendimento: segunda a sexta das 08:00 às 18:00, sábado das 08:00 às 12:00

select procedimento from public.procedimentos_clinica_agente;
-- Clareamento Dental: Gel clareador que remove manchas e deixa os dentes
-- vários tons mais claros

select profissional from public.profissionais_clinica_agente;
-- Estevão Jorge: atende segunda a sexta das 08:00 às 18:00
```

Elas são **calculadas na leitura**, a partir de `configuracoes_clinica`,
`horario_comercial`, `servicos_clinica`, `profissionais` e
`profissional_horarios`. O que a equipe salva nas telas vale na conversa
seguinte: não há nada para sincronizar, e não existe o estado "desatualizada".

**Nenhum outro objeto do banco é acessado pelo agente** — nem mesmo as tabelas
que alimentam essas views. `profissionais`, jornadas, bloqueios, `usuarios` e
`api_tokens` ficam fora do alcance dele.

> As views são para **conversar**, não para operar: nenhuma traz `id`. Quando o
> paciente pede um dentista pelo nome, é o código da ferramenta que resolve o
> `profissional_id` — uuid em prompt é convite para alucinação.

### Agenda é sempre por função SQL, nunca por `INSERT`

O agente **não** insere em `consultas` e **não** grava `data_agendamento` na
ficha do lead. Ele chama `agenda_marcar`, `agenda_remarcar` e `agenda_cancelar`,
que são as mesmas funções por trás da API.

Marcar consulta não é gravar uma linha: é conferir a jornada do dentista,
recusar conflito com o que já existe, escolher um profissional livre quando o
paciente não tem preferência e, ao remarcar, mover tudo num passo só. Um
`INSERT` direto pularia tudo isso — e, ao bater na restrição de sobreposição,
devolveria um erro cru do Postgres bem na hora de responder alguém que está
esperando no WhatsApp.

O resto (data na ficha, status no funil) um trigger do banco mantém sozinho.

### A API da agenda

Sete endpoints para consultar disponibilidade, marcar, consultar, cancelar e
remarcar, além de listar profissionais e procedimentos. Rodam numa Edge Function
do Supabase, autenticados por token.

**A Letícia não usa esses endpoints** — ela roda no mesmo projeto e chama as
funções SQL direto. A API existe para integração externa: outro sistema da
clínica, uma automação, um parceiro. As duas portas descem para as mesmas
funções, e é isso que impede uma de oferecer horário que a outra recusa.

Cada resposta traz uma **frase pronta para o paciente ouvir** — quem consome vai
falar no WhatsApp, não renderizar uma tela. Recusa de negócio ("esse horário está
ocupado") volta com HTTP 200 e a frase correspondente, então o fluxo de quem
consome só quebra em bug ou configuração errada.

O acesso é por **token próprio**, guardado hasheado, e não pela `service_role
key`: a camada que fala com o agente é a que mais recebe texto de estranho.

O contrato completo, com cURL de cada endpoint pronto para o **Import cURL**,
está em [`API_AGENTE.md`](API_AGENTE.md).

### ⚠️ Automação sem sessão precisa da chave `service_role`

As políticas de RLS liberam apenas o papel `authenticated`, que corresponde a uma
sessão de usuário logado. **Servidor não tem sessão.**

As Edge Functions recebem a `service_role key` do próprio Supabase, então isso já
está resolvido para a Letícia. Vale para qualquer outra automação que alguém
aponte para o banco: com a chave `anon`, as gravações **falham em silêncio** —
`200 OK`, zero linhas afetadas, nenhum lead no sistema.

Essa chave **nunca** vai para o navegador. No frontend roda a `anon key`,
protegida por RLS.

O fluxo completo está na seção 8 do [`DATABASE.md`](DATABASE.md).

---

## Estrutura do projeto

```
odonto-clinica/
├── src/
│   ├── components/       Sidebar, Layout, rota protegida, pessoas, calendário,
│   │                     aba Token e API
│   ├── pages/            Login, Dashboard, CRM, Agenda, Profissionais, Leads,
│   │                     Clientes, Ficha, Configurações
│   ├── lib/              Supabase, regra Lead × Paciente, cores, agenda,
│   │                     telefones e tokens da API
│   ├── types/            tipos espelhando o schema do banco
│   └── index.css         fonte, Tailwind e animações
├── supabase/
│   ├── migrations/       o SQL que cria o banco inteiro (rode em ordem)
│   └── functions/agenda/ a API que o Agente de IA consome
├── public/               favicon
├── DATABASE.md           documentação completa do banco
├── CLAUDE.md             convenções e orientações de desenvolvimento
└── .env                  suas credenciais (NÃO versionado)
```

Toda a estilização é feita com objetos `style` inline. O Tailwind está instalado
mas nenhuma classe utilitária é usada — mantenha o padrão para não deixar a base
inconsistente.

---

## Problemas comuns

<details>
<summary><strong>A tela fica em branco ao abrir</strong></summary>

Falta o arquivo `.env` ou ele tem valores errados. Confira se as duas variáveis
começam com `VITE_` — sem esse prefixo o Vite não as expõe ao navegador. Depois
de criar ou editar o `.env`, **reinicie o `npm run dev`**.
</details>

<details>
<summary><strong>"E-mail ou senha incorretos", mas a senha está certa</strong></summary>

O usuário provavelmente foi criado sem o `Auto Confirm User`. No painel, em
**Authentication → Users**, verifique se a coluna de confirmação está preenchida.
</details>

<details>
<summary><strong>Login funciona, mas a tela de Configurações quebra</strong></summary>

O perfil na tabela `usuarios` não foi criado. Confirme que o trigger
`on_auth_user_created` existe — ele faz parte da migração:

```sql
select tgname from pg_trigger where tgname = 'on_auth_user_created';
```
</details>

<details>
<summary><strong>As telas abrem vazias, mesmo com dados no banco</strong></summary>

Provável falha nas políticas de RLS. Verifique se as 16 políticas foram criadas:

```sql
select tablename, policyname from pg_policies
where schemaname in ('public', 'storage');
```
</details>

<details>
<summary><strong>O Kanban não atualiza sozinho</strong></summary>

A tabela não está publicada no Realtime:

```sql
select tablename from pg_publication_tables
where pubname = 'supabase_realtime';
-- deve retornar: crm_clinica_dados
```

Se voltar vazio, rode:

```sql
alter publication supabase_realtime add table public.crm_clinica_dados;
```
</details>

<details>
<summary><strong>A automação não grava nada, mas também não dá erro</strong></summary>

Ela está usando a chave `anon`. Troque pela `service_role`, que ignora o RLS.
Veja [Integração com o Agente de IA](#integração-com-o-agente-de-ia).
</details>

<details>
<summary><strong>"Esse horário acabou de ser ocupado" ao tentar agendar</strong></summary>

Não é erro do sistema: o banco recusou duas consultas se sobrepondo na agenda do
mesmo profissional. Costuma acontecer quando o Agente de IA marcou naquele
horário com o modal já aberto na tela.

Escolha outro horário, outra agenda, ou cancele a consulta que está ocupando o
espaço — cancelamento libera o horário na hora. Repetir a mesma tentativa dá
sempre o mesmo resultado.
</details>

<details>
<summary><strong>"Esse número já é de outra pessoa" ao cadastrar</strong></summary>

É a proteção contra contato duplicado funcionando. O aviso mostra de quem é o
número e oferece abrir a ficha (ou, no agendamento, marcar direto para essa
pessoa) — normalmente é o que você quer, porque o paciente já estava no sistema.

Se as duas pessoas realmente existem e uma delas está com o telefone errado,
corrija o número na ficha dela antes.
</details>

<details>
<summary><strong>O campo não aceita o telefone que eu digitei</strong></summary>

A quantidade de dígitos precisa bater com a do país escolhido no seletor. O
próprio campo mostra quantos faltam enquanto você digita.

Atenção ao país: Brasil tem 11 dígitos no celular (com o 9) e 10 no fixo, e
celular argentino no WhatsApp leva um 9 antes do código de área. Estados Unidos
e Canadá dividem o código +1 — tanto faz qual dos dois você escolher.
</details>

<details>
<summary><strong>Não consigo excluir um profissional</strong></summary>

Ele tem consultas registradas, e o banco protege o histórico. Use o botão de
**desativar**: ele sai da agenda e dos seletores de agendamento, mas as consultas
antigas continuam íntegras.
</details>

<details>
<summary><strong>A Agenda não mostra o que o Agente de IA marcou</strong></summary>

Duas causas possíveis.

A automação ainda está gravando `data_agendamento` na ficha do lead em vez de
criar a linha em `consultas` — veja
[Integração com o Agente de IA](#integração-com-o-agente-de-ia).

Ou a tabela não está publicada no Realtime, e a tela só atualiza ao recarregar:

```sql
select tablename from pg_publication_tables
where pubname = 'supabase_realtime';
-- deve retornar: crm_clinica_dados e consultas
```
</details>

---

## Documentação completa

| Arquivo | Conteúdo |
|---|---|
| [`DATABASE.md`](DATABASE.md) | Referência completa do banco: todas as colunas, RLS, Storage, Realtime, armadilhas e consultas de verificação |
| [`API_AGENTE.md`](API_AGENTE.md) | Contrato da API da agenda para integração externa: os sete endpoints, com cURL pronto, e o desenho dos tokens de acesso |
| [`CLAUDE.md`](CLAUDE.md) | Convenções de código, design system, rotas e débito técnico conhecido |
| [`supabase/migrations/`](supabase/migrations/) | O SQL que recria o banco do zero |

---

## Licença

Projeto privado. Todos os direitos reservados.
