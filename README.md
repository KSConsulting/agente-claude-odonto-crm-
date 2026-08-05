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

- **Perfil** — nome e foto do usuário
- **Clínica** — nome e logotipo (aparecem na barra lateral)
- **Horários** — grade de atendimento por dia da semana, usada pelo Dashboard
- **Procedimentos** — catálogo de serviços oferecidos
- **Senha** — troca com medidor de força

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

São **quatro arquivos, nesta ordem** — cada um depende do anterior:

1. [`supabase/migrations/0001_schema_inicial.sql`](supabase/migrations/0001_schema_inicial.sql)
2. [`supabase/migrations/0002_agenda_profissionais.sql`](supabase/migrations/0002_agenda_profissionais.sql)
3. [`supabase/migrations/0003_whatsapp_unico.sql`](supabase/migrations/0003_whatsapp_unico.sql)
4. [`supabase/migrations/0004_api_agente.sql`](supabase/migrations/0004_api_agente.sql)

Copie **todo** o conteúdo de cada um, cole e clique em **Run**.

Ao final você terá:

```
10 tabelas + 1 view      estrutura de dados
17 índices               desempenho e integridade (um deles impede
                         duas pessoas com o mesmo WhatsApp)
17 políticas de RLS      controle de acesso (11 no banco + 6 no Storage)
2 buckets de Storage     fotos de perfil e logotipo
12 funções + 7 triggers  automações internas e as regras da API
1 restrição de exclusão  impede duas consultas no mesmo horário
2 tabelas no Realtime    atualização automática da tela
```

E já deixa cadastrados o horário comercial padrão e alguns procedimentos de
exemplo — todos editáveis depois pela tela de Configurações. Profissionais não
vêm de exemplo: cadastre os seus na tela **Profissionais**, e a agenda de cada
um nasce junto.

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

## Como o banco está organizado

Dez objetos no schema `public`:

| Objeto | Papel |
|---|---|
| `crm_clinica_dados` | Tabela principal — leads e pacientes |
| `crm_clinica` | **View** sobre a tabela acima (leia o aviso abaixo) |
| `consultas` | Agendamentos — ligam um lead a um profissional e a um horário |
| `profissionais` | Dentistas. **A agenda de cada um são as consultas dele** |
| `profissional_horarios` | Jornada de trabalho, por dia da semana |
| `profissional_bloqueios` | Férias, feriados, almoço |
| `usuarios` | Perfis da equipe, espelhando o Auth |
| `configuracoes_clinica` | Nome, logotipo e fuso horário da clínica |
| `horario_comercial` | Grade de atendimento da clínica |
| `servicos_clinica` | Catálogo de procedimentos |

### ⚠️ Não existe tabela de agenda — e é de propósito

A agenda de um profissional é o conjunto de consultas com o `profissional_id`
dele. Cadastrar o dentista já cria a agenda; não há como as duas coisas ficarem
fora de sincronia, porque são a mesma coisa.

### ⚠️ Um WhatsApp, uma pessoa

O `whatsapp_lead` é gravado sempre no mesmo formato — só dígitos, com o código
do país: `5511987654321`, exatamente como o n8n já mandava. Um índice único
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

O RLS está ativo nas 9 tabelas, com 10 políticas (mais 6 no Storage). O modelo
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

O sistema pressupõe um agente atendendo no WhatsApp via **Chatwoot**, orquestrado
por **n8n**, gravando direto neste banco.

A tabela `crm_clinica_dados` já tem as colunas de integração
(`id_conta_chatwoot`, `id_conversa_chatwoot`, `id_lead_chatwoot`,
`inbox_id_chatwoot`) e os carimbos dos três follow-ups.

### Ao agendar, o agente escreve em `consultas`

Não em `data_agendamento` da ficha do lead. Uma consulta gravada só na ficha
apareceria no CRM e sumiria da Agenda. A linha em `consultas` deve trazer
`profissional_id`, `duracao_minutos`, `origem = 'agente_ia'` e uma
`chave_externa` — esta última é o que impede um retry do n8n de criar duas
consultas idênticas. O resto (data na ficha, status no funil) um trigger do banco
mantém sozinho.

### A API da agenda

Sete endpoints para o agente consultar disponibilidade, marcar, consultar,
cancelar e remarcar, além de listar profissionais e procedimentos. Rodam numa
Edge Function do Supabase e são chamados pelo n8n via nó HTTP.

Cada resposta traz uma **frase pronta para o paciente ouvir** — quem consome vai
falar no WhatsApp, não renderizar uma tela. Recusa de negócio ("esse horário está
ocupado") volta com HTTP 200 e a frase correspondente, então o fluxo do n8n só
quebra em bug ou configuração errada.

O acesso é por **token próprio**, guardado hasheado, e não pela `service_role
key`: a camada que fala com o agente é a que mais recebe texto de estranho.

O contrato completo, com cURL de cada endpoint pronto para o **Import cURL** do
n8n, está em [`API_AGENTE.md`](API_AGENTE.md).

### ⚠️ A automação precisa da chave `service_role`

As políticas de RLS liberam apenas o papel `authenticated`, que corresponde a uma
sessão de usuário logado. **A automação não tem sessão.**

Se o n8n usar a chave `anon`, as gravações **falham em silêncio**: a API devolve
`200 OK` com zero linhas afetadas e nenhum lead aparece no sistema. É o erro mais
comum de quem monta essa integração.

O fluxo esperado está descrito na seção 8 do [`DATABASE.md`](DATABASE.md).

---

## Estrutura do projeto

```
odonto-clinica/
├── src/
│   ├── components/       Sidebar, Layout, rota protegida, pessoas, calendário
│   ├── pages/            Login, Dashboard, CRM, Agenda, Profissionais, Leads,
│   │                     Clientes, Ficha, Configurações
│   ├── lib/              Supabase, regra Lead × Paciente, cores, agenda e telefones
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
| [`API_AGENTE.md`](API_AGENTE.md) | Contrato da API que o Agente de IA consome pelo n8n: os sete endpoints, com cURL pronto, e o desenho dos tokens de acesso |
| [`CLAUDE.md`](CLAUDE.md) | Convenções de código, design system, rotas e débito técnico conhecido |
| [`supabase/migrations/`](supabase/migrations/) | O SQL que recria o banco do zero |

---

## Licença

Projeto privado. Todos os direitos reservados.
