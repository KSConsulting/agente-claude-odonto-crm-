# API da Agenda — para o Agente de IA

Especificação dos endpoints que o Agente de IA consome pelo **n8n, via nó HTTP**,
para consultar disponibilidade, marcar, consultar, cancelar e remarcar consultas.

> **Status: implantada e testada ponta a ponta.** Os catorze cenários deste
> documento foram exercitados por HTTP contra o projeto real — conflito,
> expediente, idempotência, conferência de dono, fuso e token revogado.

- **Quem chama:** n8n (nó HTTP Request), dentro do fluxo que atende o WhatsApp
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
- **os campos soltos que compõem a frase** — para o n8n usar programaticamente
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
| JSON malformado ou campo obrigatório faltando | 400 | `ok: false` + `motivo` + `mensagem` |
| Token inválido, revogado ou ausente | 401 | `ok: false` + `motivo` + `mensagem` |
| Falha inesperada | 500 | `ok: false` + `motivo` + `mensagem` |

Isso mantém o fluxo do n8n simples: **só quebra o que é problema de configuração
ou bug.** Tudo que o paciente precisa ouvir chega como 200 e segue o caminho
normal do fluxo.

### `motivo` é para a máquina, `mensagem` é para o paciente

Os dois campos nunca se misturam, e **`mensagem` existe em toda resposta**,
inclusive nas falhas técnicas:

- **`motivo`** — código curto (`horario_ocupado`, `token_invalido`). Serve para o
  n8n desviar o fluxo e para você entender o log. O paciente nunca vê.
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

Saem **nos dois formatos**: ISO nos campos, brasileiro por extenso dentro da
`mensagem`.

---

## 2. Autenticação

Cabeçalho próprio, com token gerado na tela de Configurações → Tokens:

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

Os sete cURLs abaixo são para colar no **Import cURL** do nó HTTP do n8n, que
monta o nó inteiro sozinho. Na tela de Tokens eles aparecem com a URL e o token
reais já preenchidos.

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

**Com `hora`** — responde à pergunta feita e já oferece alternativa:

```json
{
  "ok": true,
  "disponivel": false,
  "horarios": ["2026-05-15T10:30", "2026-05-15T14:00"],
  "mensagem": "Quinta, 15/05, às 09:00 já está ocupado, mas tenho 10:30 e 14:00."
}
```

**Sem `hora`** — lista o dia. O campo `disponivel` não aparece, porque não houve
pergunta específica a responder:

```json
{
  "ok": true,
  "horarios": ["2026-05-15T09:00", "2026-05-15T10:30", "2026-05-15T14:00"],
  "mensagem": "Quinta, 15/05, tenho 09:00, 10:30 e 14:00."
}
```

**Dia sem vaga** — devolve o dia mais próximo que tem. Sem isso o agente entra
num pinga-pinga de perguntar dia a dia:

```json
{
  "ok": true,
  "horarios": [],
  "proxima_data": "2026-05-16T08:00",
  "mensagem": "Não tenho horário na quinta. O mais próximo é sexta, 16/05, às 08:00."
}
```

Os horários respeitam a jornada do profissional, os bloqueios (férias, feriado)
e as consultas já marcadas. Sem `profissional_id`, considera todos os ativos.

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
**Opcionais:** `profissional_id`, `duracao_minutos` (padrão 60), `chave_externa`.

**Sem `profissional_id`, o sistema escolhe** uma agenda livre naquele horário —
é o caso comum, o paciente sem preferência.

O `whatsapp` é a identidade: o sistema procura por ele e, se não achar, **cria o
contato** com o `nome` informado. É o mesmo comportamento que o fluxo do n8n já
tem hoje. O número deve vir no formato canônico (só dígitos com código do país,
`5511987654321`) — o mesmo que a automação já grava.

A `chave_externa` é o que impede consulta duplicada quando o n8n repete a
chamada por timeout. Mandando o mesmo valor, a segunda tentativa devolve o
agendamento que já existe em vez de criar outro.

**Sucesso:**

```json
{
  "ok": true,
  "id": "7b4e…",
  "data_hora": "2026-05-15T09:00",
  "profissional": "Henrique Salles",
  "mensagem": "Maria Pereira, seu agendamento foi marcado com sucesso com o profissional Henrique Salles para o dia 15/05/2026 às 09:00."
}
```

O `id` volta para o agente poder cancelar ou remarcar depois sem ter que
procurar.

**Recusas:** `horario_ocupado`, `sem_profissional_livre`, `fora_expediente`,
`whatsapp_invalido`, `dados_invalidos` — cada uma com a frase correspondente.

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
      "data_hora": "2026-05-15T09:00",
      "profissional": "Henrique Salles",
      "procedimento": "Limpeza"
    }
  ],
  "mensagem": "Você tem consulta na quinta, 15/05, às 09:00, com o Henrique Salles."
}
```

É daqui que o agente tira o `id` para cancelar ou remarcar.

**Nenhuma consulta:** `consultas` vazio e a frase dizendo que não há nada
marcado. Continua sendo `ok: true` — a pergunta foi respondida.

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
  "data_hora": "2026-05-15T09:00",
  "mensagem": "Sua consulta de 15/05/2026 às 09:00 com o Henrique Salles foi cancelada."
}
```

Cancelar libera o horário na agenda imediatamente e move o lead no funil — o
banco cuida disso sozinho, por trigger. Se o paciente tiver outras sessões
marcadas, o funil dele **não** muda: cancelar uma sessão não é desistir do
tratamento.

**Recusas:** `nao_encontrada`, `nao_pertence`, `ja_cancelada`, `nao_cancelavel`
(consulta já realizada).

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
  "data_hora": "2026-05-16T14:00",
  "profissional": "Henrique Salles",
  "mensagem": "Sua consulta foi remarcada para sexta, 16/05/2026, às 14:00, com o Henrique Salles."
}
```

Remarcar **não** recarimba a data de marcação no CRM — senão o Dashboard
contaria a mesma consulta duas vezes, uma no mês original e outra no mês para o
qual foi adiada.

**Recusas:** `nao_encontrada`, `nao_pertence`, `horario_ocupado`,
`sem_profissional_livre`, `fora_expediente`.

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
| `nome` | `text` | Como a equipe identifica ("n8n produção") |
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

**`ultimo_acesso`** é atualizado no máximo uma vez a cada poucos minutos por
token, não a cada chamada — senão cada consulta de disponibilidade viraria
também uma escrita.

### Tela: Configurações → Tokens

- Lista com nome, prefixo, status, último acesso e quem criou
- Criar: pede só o nome
- **No momento da criação**, e só nele, a tela mostra o token completo **e os
  sete cURLs desta página já preenchidos** com ele e com a URL do projeto —
  pronto para o Import cURL do n8n
- Revogar, com confirmação
- Depois da criação, escolher um token na documentação preenche o cabeçalho e
  deixa `SEU_TOKEN_AQUI` no lugar do valor, com o aviso de que o caminho para
  quem perdeu é revogar e criar outro

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
