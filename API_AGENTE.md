# API da Agenda — para integração externa

Especificação dos sete endpoints HTTP que expõem a agenda da clínica: consultar
disponibilidade, marcar, consultar, cancelar e remarcar consultas.

> **Status: implantada e testada ponta a ponta.** Os catorze cenários deste
> documento foram exercitados por HTTP contra o projeto real — conflito,
> expediente, idempotência, conferência de dono, fuso e token revogado.

> ### ⚠️ A Letícia não usa esta API
>
> O Agente de IA da clínica mora **dentro deste projeto** (a Edge Function
> `whatsapp`) e chama as funções SQL da `0004` **direto, por RPC** — sem passar
> por HTTP nem por token. Ver a seção 8 do [`DATABASE.md`](DATABASE.md).
>
> Esta API existe para **quem está de fora**: outro sistema da clínica, uma
> automação, um parceiro. As duas portas descem para as mesmas funções SQL, e é
> isso que impede uma de oferecer horário que a outra recusa.

- **Quem chama:** qualquer cliente HTTP externo, com token
- **Onde roda:** Supabase Edge Function `agenda`
  ([`supabase/functions/agenda/index.ts`](supabase/functions/agenda/index.ts))
- **Regras de negócio:** funções SQL da migração
  [`0004_api_agente.sql`](supabase/migrations/0004_api_agente.sql)
- **Banco:** as garantias já existem — ver [`DATABASE.md`](DATABASE.md)

> **A Edge Function não tem dependência nenhuma, e isso é obrigatório.** O
> runtime sobe com `--no-remote` e recusa buscar qualquer módulo externo no
> boot — com um `import` de `supabase-js`, a função inteira morre com
> `BOOT_ERROR` antes de executar uma linha. Toda conversa com o banco é `fetch`
> direto no PostgREST. Se for acrescentar biblioteca, saiba que não vai subir.

---

## 1. O princípio que governa todas as respostas

**Quem lê a resposta vai falar com um paciente.** Não é uma tela renderizando um
objeto; é um agente que precisa dizer uma frase no WhatsApp.

Por isso toda resposta traz:

- **`mensagem`** — a frase pronta, em português, com nome de pessoa e de
  profissional dentro. O agente fala isso e acabou.
- **os campos soltos que compõem a frase** — para quem consome usar programaticamente
  (agendar lembrete, gravar log) ou para o agente reescrever com as próprias
  palavras, se você preferir controlar o texto pelo prompt.

Nada além disso. Nenhum endpoint devolve o registro inteiro da consulta.

### Recusa também é resposta

"Esse horário está ocupado" não é erro: é a resposta certa para a pergunta que
foi feita, e o paciente precisa ouvi-la. Por isso **recusa de negócio volta com
HTTP 200**, com `ok: false`, um `motivo` em código e a `mensagem` falável.

| Situação | HTTP | Corpo |
|---|---|---|
| Deu certo | 200 | `ok: true` + campos + `mensagem` |
| Recusa de negócio (ocupado, não encontrado, fora do expediente) | 200 | `ok: false` + `motivo` + `mensagem` |
| Campo obrigatório faltando ou data que não dá para entender | 200 | `ok: false` + `motivo` + `mensagem` |
| Corpo não é JSON válido, ou método HTTP errado na rota | 400 | `ok: false` + `motivo` + `mensagem` |
| Token inválido, revogado ou ausente | 401 | `ok: false` + `motivo` + `mensagem` |
| Rota inexistente | 404 | `ok: false` + `motivo` + `mensagem` |
| Falha inesperada | 500 | `ok: false` + `motivo` + `mensagem` |

Isso mantém o fluxo de quem consome simples: **só quebra o que é problema de configuração
ou bug.** Tudo que o paciente precisa ouvir chega como 200 e segue o caminho
normal do fluxo.

> **Campo faltando volta 200, não 400** — e é de propósito. Quando o agente não
> extraiu a data da conversa, o certo é ele dizer *"faltou alguma informação
> para eu concluir"* e perguntar de novo, não o fluxo de quem chama morrer. O 400 fica
> reservado para o que é erro de quem programou o nó: corpo que não é JSON e
> verbo HTTP trocado.

### `motivo` é para a máquina, `mensagem` é para o paciente

Os dois campos nunca se misturam, e **`mensagem` existe em toda resposta**,
inclusive nas falhas técnicas:

- **`motivo`** — código curto (`horario_ocupado`, `token_invalido`). Serve para o
  quem consome desviar o fluxo e para você entender o log. O paciente nunca vê.
- **`mensagem`** — o que pode ser dito em voz alta. Em 401 e 500 ela é
  deliberadamente vaga: *"Não consegui acessar a agenda agora. Só um instante."*
  Nada de "token inválido" chegando ao WhatsApp de ninguém.

**Por que falha técnica também tem frase:** sem ela, o agente recebe uma resposta
sem texto e improvisa — ou, pior, repassa o detalhe técnico para o paciente. Uma
frase neutra sempre disponível é o que impede os dois.

**Única exceção:** os endpoints de listagem (3.1 e 3.2) não têm `mensagem` no
sucesso. Ninguém fala "aqui estão os profissionais" — aquilo é dado interno que o
agente usa para montar a chamada seguinte. Em falha, eles têm.

### Datas

Entram em ISO 8601 com fuso (`2026-05-15T09:00:00-03:00`) ou sem
(`2026-05-15T09:00`, interpretado no fuso da clínica, gravado em
`configuracoes_clinica.fuso_horario`).

Saem **sempre em UTC**, no ISO completo que o PostgREST usa para `timestamptz`:
`2026-05-15T12:00:00+00:00` é 09:00 em São Paulo. Vale para `data_hora`,
`horarios[]` e `proxima_data` — todos são `timestamptz` no banco.

> **Se quem consome for formatar a hora sozinho, precisa converter.** Ler `data_hora`
> e mostrar "12:00" para quem marcou às 09:00 é o erro fácil de cometer aqui. A
> `mensagem` já vem convertida para o fuso da clínica e por extenso — é
> exatamente para isso que ela existe.

---

## 2. Autenticação

Cabeçalho próprio, com token gerado no **menu do usuário → Token e API**:

```
X-Api-Key: odk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**Não é a `service_role key`, e isso é o ponto.** A camada que fala com o agente
é a que mais recebe texto de estranho — uma injeção de prompt bem-feita numa
mensagem de WhatsApp, com a `service_role`, viraria acesso total ao banco. Com
este token, o estrago máximo de um agente comprometido é bagunçar a agenda.

O token é guardado **hasheado** (SHA-256). O sistema confere se o que chegou é
válido, mas não consegue reconstruí-lo — por isso ele **só é exibido no momento
da criação**, e é nesse mesmo momento que a tela mostra os cURLs abaixo já
preenchidos com ele.

Token revogado passa a devolver 401 na chamada seguinte — com `motivo:
"token_revogado"` e a `mensagem` neutra, para o paciente não ficar sabendo que a
clínica está com problema de configuração.

---

## 3. Endpoints

Base: `https://SEU_REF.supabase.co/functions/v1/agenda`

Os sete cURLs abaixo são para colar no **Import cURL** de qualquer cliente HTTP, que
monta o nó inteiro sozinho. Na tela de Tokens eles aparecem com a URL e o token
reais já preenchidos.

> **Só o `X-Api-Key` vai no cabeçalho — não existe `Authorization` aqui.** A
> função está publicada com `verify_jwt = false`, justamente para que a
> autenticação seja o nosso token e não a `anon key` do Supabase. Se algum dia
> ela for reimplantada com o padrão (`verify_jwt = true`), **os sete cURLs param
> de funcionar de uma vez**, com 401 vindo da borda do Supabase, antes de chegar
> no nosso código — e a resposta nem vai ter `mensagem`. É a primeira coisa a
> conferir se tudo quebrar junto depois de um deploy.

---

### 3.1. Listar profissionais — `GET /profissionais`

O agente carrega esta lista antes de marcar, para saber quem é quem e poder
mandar o `profissional_id`.

**Precisa:** nada.

**Devolve:** só os ativos, só o que identifica.

```json
{
  "ok": true,
  "profissionais": [
    { "id": "3f2a…", "nome": "Henrique Salles" },
    { "id": "9c81…", "nome": "Marina Andrade" }
  ]
}
```

Sem cor, sem jornada, sem horário: nada disso muda o que o agente fala.

```bash
curl -X GET 'https://SEU_REF.supabase.co/functions/v1/agenda/profissionais' \
  -H 'X-Api-Key: SEU_TOKEN_AQUI'
```

---

### 3.2. Listar procedimentos — `GET /procedimentos`

Para o agente saber o que a clínica oferece e não inventar tratamento que não
existe.

**Precisa:** nada.

**Devolve:** apenas os nomes dos procedimentos ativos, em texto.

```json
{
  "ok": true,
  "procedimentos": [
    "Alinhadores Transparentes",
    "Avaliação e Planejamento Digital do Sorriso",
    "Carga Imediata",
    "Clareamento Dental",
    "Enxerto Gengival",
    "Enxerto Ósseo",
    "Extração de Siso",
    "Facetas em Resina",
    "Gengivoplastia",
    "Implante Unitário",
    "Lentes de Contato",
    "Levantamento de Seio Maxilar",
    "Limpeza e Profilaxia",
    "Placa de Bruxismo",
    "Prótese Dentária",
    "Prótese Fixa sobre Implantes",
    "Raspagem",
    "Tratamento de Canal",
    "Tratamento de DTM",
    "Tratamento Periodontal"
  ]
}
```

São os 20 do catálogo atual, **em ordem alfabética** — a consulta ordena por
nome, não por cadastro. Procedimento desativado em Configurações some da lista
sem precisar mexer no agente.

Sem ID de propósito: o campo `procedimento` do endpoint de marcar é texto livre,
então um ID aqui não teria uso nenhum.

```bash
curl -X GET 'https://SEU_REF.supabase.co/functions/v1/agenda/procedimentos' \
  -H 'X-Api-Key: SEU_TOKEN_AQUI'
```

---

### 3.3. Consultar disponibilidade — `POST /disponibilidade`

**Precisa:** `data`.
**Opcionais:** `hora`, `profissional_id`, `duracao_minutos` (padrão 60).

A `hora` é opcional porque o paciente pergunta de dois jeitos, e os dois são
comuns: *"pode ser quinta às 9?"* e *"que horários você tem quinta?"*.

**Com `hora`** — responde à pergunta feita. O campo `horarios` traz o dia
inteiro, livre; `disponivel` responde especificamente pelo horário perguntado.

```json
{
  "ok": true,
  "disponivel": false,
  "horarios": ["2026-05-15T13:30:00+00:00", "2026-05-15T17:00:00+00:00"],
  "mensagem": "quinta, 15/05/2026 às 09:00 já está ocupado, mas tenho 10:30 e 14:00."
}
```

São três frases possíveis aqui, conforme o caso:

| Caso | `mensagem` |
|---|---|
| Livre | `quinta, 15/05/2026 às 09:00 está livre, posso marcar.` |
| Ocupado, com alternativa no dia | `quinta, 15/05/2026 às 09:00 já está ocupado, mas tenho 10:30 e 14:00.` |
| Ocupado, e o dia acabou | `quinta, 15/05/2026 às 09:00 já está ocupado e não tenho outro horário nesse dia.` |

**Sem `hora`** — lista o dia. O campo `disponivel` não aparece, porque não houve
pergunta específica a responder:

```json
{
  "ok": true,
  "horarios": [
    "2026-05-15T12:00:00+00:00",
    "2026-05-15T13:30:00+00:00",
    "2026-05-15T17:00:00+00:00"
  ],
  "mensagem": "quinta, 15/05/2026, tenho 09:00, 10:30 e 14:00."
}
```

**Dia sem vaga** — devolve o dia mais próximo que tem. Sem isso o agente entra
num pinga-pinga de perguntar dia a dia:

```json
{
  "ok": true,
  "horarios": [],
  "proxima_data": "2026-05-16T11:00:00+00:00",
  "mensagem": "Não tenho horário em quinta, 15/05/2026. O mais próximo é sexta, 16/05/2026, às 08:00."
}
```

Se não houver vaga nenhuma na busca (ela varre 60 dias), `proxima_data` vem
`null` e a frase é *"Não encontrei horário disponível nos próximos dias."*

Os horários respeitam a jornada do profissional, os bloqueios (férias, feriado)
e as consultas já marcadas. Sem `profissional_id`, considera todos os ativos.

**A grade anda de 30 em 30 minutos.** É o passo padrão da função SQL, e é o que
faz a lista sair "09:00, 09:30, 10:00" em vez de minuto a minuto. A `duracao_minutos`
é outra coisa: ela diz quanto tempo precisa caber a partir de cada horário
oferecido — com 90 minutos, um vão de uma hora entre duas consultas deixa de
aparecer na lista.

**Recusas:** `data_invalida`, `profissional_inexistente`.

```bash
curl -X POST 'https://SEU_REF.supabase.co/functions/v1/agenda/disponibilidade' \
  -H 'X-Api-Key: SEU_TOKEN_AQUI' \
  -H 'Content-Type: application/json' \
  -d '{
    "data": "2026-05-15",
    "hora": "09:00",
    "profissional_id": "3f2a…",
    "duracao_minutos": 60
  }'
```

---

### 3.4. Marcar consulta — `POST /marcar`

**Precisa:** `nome`, `whatsapp`, `procedimento` (texto livre), `data_hora`.
**Opcionais:** `profissional_id`, `duracao_minutos`, `chave_externa`, `interesse`.

> **`duracao_minutos` deixou de ter padrão fixo.** Omitido, vale a duração
> cadastrada naquele procedimento — a avaliação ocupa 30 minutos, o resto 60.
> Quem já mandava um número continua mandando, e ele continua ganhando.

**Sem `profissional_id`, o sistema escolhe** uma agenda livre naquele horário —
é o caso comum, o paciente sem preferência.

O `whatsapp` é a identidade: o sistema procura por ele e, se não achar, **cria o
contato** com o `nome` informado. É o mesmo comportamento que o Agente de IA já
tem hoje. O número deve vir no formato canônico (só dígitos com código do país,
`5511987654321`) — o mesmo que a automação já grava.

A `chave_externa` é o que impede consulta duplicada quando quem chama repete a
chamada por timeout. Mandando o mesmo valor, a segunda tentativa devolve o
agendamento que já existe em vez de criar outro.

#### A avaliação é a porta de entrada

Quase todo tratamento da clínica passa antes por uma avaliação com o dentista.
**Tentar marcar um deles é recusado**, com o nome da consulta que precisa vir
antes:

```json
{
  "ok": false,
  "motivo": "exige_avaliacao",
  "marque_no_lugar": "Avaliação Odontológica",
  "mensagem": "Esse tratamento passa antes por uma avaliação com o dentista. Posso marcar Avaliação Odontológica para você?"
}
```

A saída é remarcar com `procedimento` valendo o nome devolvido em
`marque_no_lugar`, e o tratamento desejado em **`interesse`** — que é o que faz
o dentista abrir a agenda e já saber do que se trata.

`GET /procedimentos` diz quais passam pela avaliação, então dá para saber antes
de tentar.

> **Procedimento fora do catálogo continua passando.** `procedimento` é texto
> livre, e integração que marca algo que não está em `servicos_clinica` não
> quebra: nome que não casa é nome sem regra a aplicar.

**Sucesso:**

```json
{
  "ok": true,
  "id": "7b4e…",
  "data_hora": "2026-05-15T12:00:00+00:00",
  "profissional": "Henrique Salles",
  "mensagem": "Maria Pereira, seu agendamento foi marcado com sucesso com o profissional Henrique Salles para quinta, 15/05/2026 às 09:00."
}
```

O `id` volta para o agente poder cancelar ou remarcar depois sem ter que
procurar.

**Recusas:** `exige_avaliacao`, `horario_ocupado`, `sem_profissional_livre`,
`fora_expediente`, `whatsapp_invalido`, `dados_invalidos`, `data_invalida` —
cada uma com a frase correspondente.

```bash
curl -X POST 'https://SEU_REF.supabase.co/functions/v1/agenda/marcar' \
  -H 'X-Api-Key: SEU_TOKEN_AQUI' \
  -H 'Content-Type: application/json' \
  -d '{
    "nome": "Maria Pereira",
    "whatsapp": "5511987654321",
    "procedimento": "Limpeza",
    "data_hora": "2026-05-15T09:00",
    "profissional_id": "3f2a…",
    "chave_externa": "msg_abc123"
  }'
```

---

### 3.5. Consultar agendamentos do paciente — `POST /consultas`

**Precisa:** `whatsapp`.

**Devolve:** só as consultas **ativas e futuras**. Histórico o agente não precisa.

```json
{
  "ok": true,
  "consultas": [
    {
      "id": "7b4e…",
      "data_hora": "2026-05-15T12:00:00+00:00",
      "profissional": "Henrique Salles",
      "procedimento": "Limpeza e Profilaxia"
    }
  ],
  "mensagem": "Você tem consulta em quinta, 15/05/2026, às 09:00, com Henrique Salles."
}
```

É daqui que o agente tira o `id` para cancelar ou remarcar.

**Mais de uma:** a lista vem inteira, em ordem de data, mas a frase fala só da
próxima — *"Você tem 3 consultas marcadas. A próxima é em quinta, 15/05/2026,
às 09:00, com Henrique Salles."* Ninguém recita agenda no WhatsApp; se o
paciente quiser o resto, o agente tem a lista para ler.

**Nenhuma consulta:** `consultas` vazio e a frase *"Você não tem nenhuma
consulta marcada no momento."* Continua sendo `ok: true` — a pergunta foi
respondida.

**Recusas:** `whatsapp_invalido`, `paciente_nao_encontrado`.

```bash
curl -X POST 'https://SEU_REF.supabase.co/functions/v1/agenda/consultas' \
  -H 'X-Api-Key: SEU_TOKEN_AQUI' \
  -H 'Content-Type: application/json' \
  -d '{ "whatsapp": "5511987654321" }'
```

---

### 3.6. Cancelar — `POST /cancelar`

**Precisa:** `consulta_id`.
**Opcionais:** `whatsapp`, `motivo`.

O `whatsapp` é **conferência**: se vier, o sistema valida que aquela consulta é
mesmo daquele número e recusa com `nao_pertence` se não for. Barato, e evita que
um ID trocado no fluxo cancele a consulta de outra pessoa.

**Sucesso:**

```json
{
  "ok": true,
  "data_hora": "2026-05-15T12:00:00+00:00",
  "mensagem": "Sua consulta de quinta, 15/05/2026 às 09:00 com Henrique Salles foi cancelada."
}
```

Cancelar libera o horário na agenda imediatamente e move o lead no funil — o
banco cuida disso sozinho, por trigger. Se o paciente tiver outras sessões
marcadas, o funil dele **não** muda: cancelar uma sessão não é desistir do
tratamento.

**Recusas:** `nao_encontrada`, `nao_pertence`, `ja_cancelada`, `nao_cancelavel`
(consulta já realizada), `dados_invalidos` (sem `consulta_id`).

```bash
curl -X POST 'https://SEU_REF.supabase.co/functions/v1/agenda/cancelar' \
  -H 'X-Api-Key: SEU_TOKEN_AQUI' \
  -H 'Content-Type: application/json' \
  -d '{
    "consulta_id": "7b4e…",
    "whatsapp": "5511987654321",
    "motivo": "Paciente pediu pelo WhatsApp"
  }'
```

---

### 3.7. Remarcar — `POST /remarcar`

**Precisa:** `consulta_id`, `nova_data_hora`.
**Opcionais:** `profissional_id`, `whatsapp` (mesma conferência do cancelar).

**Operação atômica** — nunca "cancela e cria". Se o segundo passo falhasse, o
paciente ficaria sem consulta nenhuma e ninguém perceberia.

**Sucesso:**

```json
{
  "ok": true,
  "data_hora": "2026-05-16T17:00:00+00:00",
  "profissional": "Henrique Salles",
  "mensagem": "Sua consulta foi remarcada para sexta, 16/05/2026, às 14:00, com Henrique Salles."
}
```

Remarcar **não** recarimba a data de marcação no CRM — senão o Dashboard
contaria a mesma consulta duas vezes, uma no mês original e outra no mês para o
qual foi adiada.

**Recusas:** `nao_encontrada`, `nao_pertence`, `horario_ocupado`,
`sem_profissional_livre`, `fora_expediente`, `dados_invalidos`, `data_invalida`.

```bash
curl -X POST 'https://SEU_REF.supabase.co/functions/v1/agenda/remarcar' \
  -H 'X-Api-Key: SEU_TOKEN_AQUI' \
  -H 'Content-Type: application/json' \
  -d '{
    "consulta_id": "7b4e…",
    "nova_data_hora": "2026-05-16T14:00",
    "whatsapp": "5511987654321"
  }'
```

---

## 4. Tokens de acesso

### Tabela `api_tokens`

| Coluna | Tipo | Observação |
|---|---|---|
| `id` | `uuid` | PK |
| `nome` | `text` | Como a equipe identifica ("integração da recepção") |
| `prefixo` | `text` | Primeiros caracteres visíveis (`odk_7f3a…`), para saber qual é qual |
| `hash` | `text` | **SHA-256 do token.** O valor original não existe em lugar nenhum |
| `ativo` | `boolean` | Revogar é `false`, não `DELETE` |
| `criado_por` | `uuid` | FK → `usuarios` |
| `ultimo_acesso` | `timestamptz` | Preenchido pela API a cada chamada válida |
| `created_at` | `timestamptz` | |
| `revogado_em` | `timestamptz` | |

**Por que hash e não o valor:** guardar o token legível significa que um
vazamento do banco entrega todos os tokens de uma vez, e o "só aparece uma vez"
vira encenação — o valor continua lá, visível para quem tiver acesso.

**Revogar não apaga.** A linha fica com `ativo = false`, para o histórico de quem
teve acesso e quando não desaparecer.

**`ultimo_acesso`** é atualizado no máximo uma vez a cada **5 minutos** por
token, não a cada chamada — senão cada consulta de disponibilidade viraria
também uma escrita.

### Tela: menu do usuário → Token e API

Implementada em [`TokenApi.tsx`](src/pages/TokenApi.tsx), com a
geração e o catálogo de endpoints em
[`src/lib/apiTokens.ts`](src/lib/apiTokens.ts).

- Lista com nome, prefixo, status, último acesso, data e quem criou
- Criar: pede só o nome. O valor é sorteado no navegador — `odk_` + 40
  caracteres de um alfabeto de 62, cerca de 238 bits — e o que vai para o banco
  é o SHA-256
- **No momento da criação**, e só nele, a tela mostra o token completo com botão
  de copiar e o aviso de que ele não volta a aparecer
- Revogar, com confirmação que avisa o efeito: a próxima chamada já responde 401
- A documentação dos sete endpoints fica na mesma aba, com o cURL de cada um e
  um seletor de token. Escolhido um token **criado nesta sessão**, os cURLs saem
  com o valor real; para qualquer outro, saem com `SEU_TOKEN_AQUI` e o aviso de
  que o caminho para quem perdeu o valor é revogar e criar outro

> **O valor em claro só existe enquanto a página está aberta.** Ele fica na
> memória do componente para os cURLs poderem sair preenchidos logo depois da
> criação, e some ao sair da tela. Não é gravado em lugar nenhum — nem no banco,
> nem no navegador.

> **O `hashToken()` da tela e o `sha256()` da Edge Function precisam ser o mesmo
> cálculo** — SHA-256 em hexadecimal minúsculo. É o único ponto de encontro
> entre quem cria o token e quem o confere. Se divergirem, todo token nasce
> inválido e o sintoma é um 401 sem explicação nenhuma.

---

## 5. O que esta API não faz

Decisões conscientes, para não crescer sem motivo:

- **Não marca como realizada.** Comparecimento é ato da equipe, feito na ficha do
  paciente junto com o valor pago.
- **Não cadastra nem edita profissionais, procedimentos ou horários.** Isso é da
  clínica, pelas telas.
- **Não lê dados financeiros.** Nada do que o agente precisa falar envolve valor.
- **Não tem escopos por token.** Todos os tokens podem tudo que está aqui. Se um
  dia houver mais de um consumidor com necessidades diferentes, aí sim.
