# Agente de IA — a Letícia

A secretária que atende os pacientes pelo WhatsApp, 24 horas por dia.

**Esta pasta é o ponto de partida de tudo que diz respeito a ela.**

> ### ⚠️ ESTADO: EM CONSTRUÇÃO — 5 de 6 etapas · **a Letícia já atende**
>
> **A tabela de etapas, logo abaixo, é a única fonte confiável do que já
> existe.** O que está em etapa não concluída **não existe no repositório nem
> no banco** — não procure o arquivo, não escreva código contra a tabela.
>
> **O agente está no ar e respondendo** — ligado, em modo teste, só para os
> números cadastrados. Ligar, desligar, trocar o modelo e editar o prompt já são
> pela tela: **menu do usuário → Secretária de IA**.
>
> A tela **Conversas** existe em `/conversas`: a equipe lê o que a Letícia
> respondeu, assume a conversa quando precisa e responde pelo mesmo WhatsApp.

> Falta a **etapa 6** — a revisão final de ponta a ponta. E o agendamento
> nunca foi exercitado numa conversa de verdade.
>
> Conforme cada etapa for entregue, marque-a e reescreva a seção correspondente
> no tempo presente. Quando as seis estiverem prontas, apague este aviso: o
> documento passa a descrever o sistema, não o plano.

**Última revisão:** 30 de agosto de 2026
**Documentos relacionados:** [`CLAUDE.md`](../CLAUDE.md) · [`DATABASE.md`](../DATABASE.md) · [`API_AGENTE.md`](../API_AGENTE.md)

---

## O mapa — onde fica cada coisa

### Nesta pasta (conteúdo: o que você edita)

```
agente-ia/
├── README.md            📖 este documento
├── prompt.md            ⭐ o prompt da Letícia — quem ela é e como se comporta
├── GUIA-DO-PROMPT.md    🧭 como escrever o prompt de OUTRA clínica
├── gerar-prompt.mjs     ⚙️ `npm run prompt`: o .md vira `_shared/prompt-oficial.ts`
├── .env.agente.example  📋 o molde das chaves — este É versionado
├── .env.agente.local    🔑 as chaves preenchidas (fora do Git)
└── exemplos/            🧪 vazia — conversas de teste, quando existirem
```

### Fora dela (código: onde as ferramentas obrigam)

O código do agente **não pode** morar aqui — o Supabase e o Vite exigem
caminhos próprios. Esta é a lista completa, para ninguém procurar:

| Onde | O que é |
|---|---|
| `supabase/functions/whatsapp/` | O cérebro: recebe a mensagem e responde. E as rotas da conexão (`/conexao`, `/conexao/conectar`, `/conexao/desconectar`) e a de apagar uma pessoa (`/apagar-pessoa`) |
| `supabase/functions/_shared/` | Peças compartilhadas: modelos de IA, as **duas pontes de WhatsApp**, montagem do prompt, conversão de fuso (`tempo.ts`) |
| `supabase/migrations/0010_agente_conversas.sql` | As tabelas e colunas do agente |
| `src/pages/Conversas.tsx` | A tela estilo WhatsApp |
| `src/components/ListaConversas.tsx`<br>`src/components/JanelaConversa.tsx` | As duas colunas dessa tela |
| `src/pages/SecretariaIA.tsx` | A página do menu do usuário: modelo e prompt |
| `src/lib/conversas.ts` | Ler, enviar, assumir e devolver conversa |

> **Regra:** conteúdo (prompt, exemplos, chaves, documentação) fica **nesta
> pasta**. Código fica onde a ferramenta manda, e é sempre listado aqui.

### Onde o prompt vive de verdade

Ele existe em dois lugares, com papéis diferentes — e a tela sempre diz qual
está no ar:

| Lugar | Papel |
|---|---|
| [`prompt.md`](prompt.md) | O prompt **oficial**. Versionado no Git, com histórico de cada mudança |
| Banco de dados | O que está **rodando agora** |
| Página **Secretária de IA** (menu do usuário) | Mostra qual dos dois está ativo, permite ajuste rápido, e traz o botão **"voltar ao prompt oficial"** |

Ajuste de 30 segundos se resolve pela tela. Mudança séria se faz no arquivo,
com revisão e histórico.

---

## Estado das etapas

| # | Etapa | Estado |
|:-:|---|:-:|
| 1 | Prompt reescrito — [`prompt.md`](prompt.md) | ✅ |
| 2 | Banco de dados — [`0010_agente_conversas.sql`](../supabase/migrations/0010_agente_conversas.sql) | ✅ |
| 3 | O cérebro — [`whatsapp/index.ts`](../supabase/functions/whatsapp/index.ts) | ✅ **no ar** |
| 4 | Página Conversas — [`Conversas.tsx`](../src/pages/Conversas.tsx) | ✅ **no ar** |
| 5 | Tela "Secretária de IA" — [`SecretariaIA.tsx`](../src/pages/SecretariaIA.tsx) | ✅ **no ar** |
| 6 | Documentação e verificação | ✅ |

---

## 1. O que é

A clínica já tem o sistema completo — funil de leads, agenda por dentista,
faturamento, métricas. O que falta é alguém atendendo o WhatsApp fora do horário
comercial, e sobrando tempo da recepção dentro dele.

A Letícia é esse alguém. Ela conversa como uma pessoa, consulta os horários
reais dos dentistas, marca a consulta na agenda de verdade e vai preenchendo a
ficha do lead conforme a conversa acontece. Quando a equipe quiser assumir, é um
botão.

**Está de pé.** As funções SQL de disponibilidade e as views que descrevem a
clínica em frases prontas foram construídas esperando este agente; a Edge
Function que conversa com o paciente e chama essas funções está publicada e
respondendo; e a equipe tem onde ler tudo isso, em `/conversas`.

O que falta é uso de verdade: o agendamento ponta a ponta nunca foi exercitado
numa conversa real, e os textos dos procedimentos são rascunho até um dentista
revisar.

### Onde cada peça roda

| Peça | Onde |
|---|---|
| O cérebro do agente | Supabase Edge Function — 24h, sem servidor novo |
| A memória e as mensagens | Postgres do próprio Supabase |
| A tela de Conversas | O mesmo app React que já existe |
| A conexão com o WhatsApp | **Evolution API ou uazapi — servidor próprio, ~R$ 40/mês** |

A Evolution é a única peça de infraestrutura fora do que já se paga hoje.

---

## 2. Como funciona

O caminho de uma mensagem, do celular do paciente até a resposta:

```
        Mensagem chega no WhatsApp
                    │
                    ▼
              Salva no banco
                    │
                    ▼
      A conversa está assumida?  ──── sim ────▶  Só registra ·
                    │                            o atendente responde
                   não
                    ▼
          Espera 8 segundos  ─── chegou outra ───▶  Encerra ·
                    │                               a mais nova responde
           ninguém escreveu
                    ▼
      Transcreve áudio · guarda foto
                    │
                    ▼
       Monta o prompt do momento
                    │
                    ▼
            Modelo de IA  ◀─── pergunta / responde ───▶  Ferramentas
                    │                                     da agenda
                    ▼
      Responde e atualiza a ficha
```

### As duas portas de saída

O agente para sozinho em dois lugares, e os dois são propositais:

1. **Conversa assumida.** Se `agente_pausado` estiver ligado, ele salva a
   mensagem e não responde. Quem responde é a pessoa.
2. **Mensagem nova durante a espera.** Se outra mensagem chegar nos 8 segundos,
   esta execução encerra e a mais nova responde por todas.

### Por que os 8 segundos

Paciente no WhatsApp escreve assim: *"oi"* … *"tudo bem?"* … *"queria saber do
clareamento"*. Três mensagens em cinco segundos. Sem a espera, a Letícia
responderia três vezes, atropelando a própria conversa. Com ela, responde uma
vez, ao tudo junto — como uma pessoa faria.

É o mesmo efeito que um Redis daria, resolvido dentro da própria função. Redis
entra depois, se o volume justificar.

### O lead nasce sem nome — e o `pushName` não entra

A Evolution manda o **nome do perfil do WhatsApp** (`pushName`) em todo webhook.
Ele é ignorado. O nome do paciente vem **da conversa**, gravado pela ferramenta
`atualizar_ficha`, e de mais lugar nenhum.

Aproveitar o `pushName` parece de graça e não é. O perfil é o apelido que a
pessoa escolheu, não quem vai sentar na cadeira:

- o telefone é do marido, e quem se consulta é a esposa
- o perfil é "Casa da Sogra 🏠", "Jô 💅" ou o nome da empresa
- duas pessoas dividem o mesmo número

> **E o pior nem era o nome errado no CRM.** A ficha chegava preenchida, então a
> Letícia lia "já sei o nome" — [`prompt.md`](prompt.md), Etapa 1 — e **nunca
> perguntava**. O palpite entrava calado e ninguém tinha chance de corrigir.
> Descoberto num teste de 01/09, em que o nome dito na conversa foi ignorado em
> favor do nome do perfil.

Enquanto ela não pergunta, o campo fica vazio — e as telas mostram o **número
formatado** no lugar do nome, que é a verdade. Nenhuma delas quebra com nome
nulo: `ListaConversas`, `JanelaConversa` e `PainelLead` já caem no número.

---

## 3. Decisões tomadas

Registradas com o motivo, para ninguém refazer a discussão daqui a três meses.

| Assunto | Decisão | Por quê |
|---|---|---|
| **Orquestração** | Sem n8n — tudo neste repositório | Menos peças, código versionado no Git, e o Supabase já roda 24h |
| **WhatsApp** | Evolution API **ou** uazapi, à escolha da clínica | As duas são não oficiais. É o único ponto que precisa de servidor próprio, e ter duas evita ficar refém de uma |
| **Memória** | Postgres do próprio Supabase | A memória do agente e a tela de Conversas leem a mesma tabela |
| **Modelo de IA** | Selecionável na tela. Começando em **`gpt-4.1-mini`** | A clínica já tinha a chave da OpenAI. Anthropic fica para depois |
| **Áudio** | Transcrito automaticamente | Paciente brasileiro manda áudio. Sem isso o agente trava na primeira mensagem |
| **Foto** | O modelo enxerga, mas **nunca diagnostica** | Acolhe e encaminha para avaliação presencial |
| **Preço** | Fala **só** o que está escrito no catálogo | `preco_a_partir_de` (migração `0018`) tem três estados, e o `0` da avaliação — "é gratuita" — é a melhor resposta que ela tem para quem trava no valor. Ver seção 7 |
| **Assumir conversa** | Qualquer usuário logado | Clínica pequena, equipe conhecida. A tela mostra quem assumiu |
| **Redis** | Fica para depois | A espera de 8 segundos resolve dentro da função |
| **Chaves de API** | Secrets do Supabase, **nunca no `.env`** | O `.env` vira JavaScript no site — a chave ficaria pública |
| **Modo teste** | Nasce ligado, agente nasce desligado | Com a Evolution conectada, qualquer número aciona o agente. Sem trava, o primeiro teste responde a paciente de verdade |

---

## 4. As seis etapas

Nesta ordem, porque cada uma depende da anterior.

### Etapa 1 — Reescrever o prompt

Só texto. Nenhum código, nenhuma mudança no sistema. O prompt da Letícia
adaptado: tom e fluxo mantidos, `sobreClinica` removida, `Agendar` dividida em
quatro, e as regras que faltavam.

### Etapa 2 — Banco de dados

A migração `0010_agente_conversas.sql`: a tabela das mensagens, três colunas
para o botão de assumir, a configuração do agente e o bucket de mídia. Não
depende de chave nenhuma.

### Etapa 3 — O cérebro

A função `whatsapp/`, ao lado da `agenda/` que já está no ar. No fim desta etapa
já dá para conversar com a Letícia pelo WhatsApp de verdade.
**Depende das chaves e da Evolution no ar.**

### Etapa 4 — Página Conversas ✅

Rota `/conversas`, duas colunas, tempo real, e o botão de assumir.

Três decisões que ficaram de pé:

-   **A caixa de resposta só abre com a conversa assumida.** Sem isso o
    atendente escreveria junto com a Letícia, e o paciente receberia duas
    versões da mesma resposta, de duas pessoas que não sabem uma da outra.
-   **Três cores de balão** — paciente, Letícia e atendente. Dá para ver de
    relance onde uma pessoa entrou no atendimento.
-   **Assumir pausa uma conversa, não o agente.** Ela continua atendendo todo
    mundo; só naquele número fica calada. Quem desliga o agente inteiro é a aba
    de Configurações.
-   **Na tela ela é "Secretária IA · Letícia"; no WhatsApp, só "Letícia".** A
    equipe precisa saber de relance que quem respondeu foi a IA; o paciente,
    não — o prompt proíbe que ela se declare IA. O nome de tela vive em
    [`src/lib/agente.ts`](../src/lib/agente.ts), o de conversa no
    [`prompt.md`](prompt.md). Mexer num não mexe no outro.
-   **Três balões que não se parecem:** paciente em branco, Secretária IA no
    azul da marca, atendente em grafite. As duas cores cheias são as mais
    fortes da identidade — contraste grande sem inventar cor.
-   **O painel da direita abre e fecha**, e a escolha fica gravada no navegador.
    Ele mostra a ficha que a Letícia vai preenchendo: nome, interesse, resumo e
    as consultas. **O nome só aparece depois que a pessoa disser como se chama**
    — até lá o painel explica isso, em vez de mostrar um campo vazio que parece
    defeito.
-   **A foto do perfil vem da Evolution, e não é guardada.** A URL é do CDN do
    WhatsApp e expira; e a foto é da pessoa, não da clínica. Falta na maioria
    dos casos, por privacidade — aí fica a inicial. Passa pela rota `GET /foto`
    da função porque a chave da Evolution é de servidor: no navegador, ela iria
    para o bundle, e quem tem essa chave manda mensagem por aquele WhatsApp.

### Etapa 5 — Tela "Secretária de IA"

No menu do usuário, e não em Configurações: escolher o modelo, editar o prompt,
ligar e desligar o agente — sem republicar nada. Depois ela ganhou também a
seção da conexão com o WhatsApp e a zona de perigo (seção 8.5).

### Etapa 6 — Documentação e verificação ✅

`DATABASE.md`, `CLAUDE.md` e este arquivo acompanham o código, e `npm run build`
e `npm run lint` rodam limpos.

Não é etapa que fecha e acaba: **cada mudança no agente reabre ela**. A tabela da
seção 12 diz o que atualizar em cada caso, e a regra 1 do
[`CLAUDE.md`](../CLAUDE.md) é a mesma — documentação entra no commit da mudança,
não depois.

---

## 5. Arquivos

### Novos

| Arquivo | Etapa | O que faz |
|---|:-:|---|
| `supabase/migrations/0010_agente_conversas.sql` | 2 | Tabela de mensagens, colunas de pausa, configuração e bucket |
| `supabase/functions/whatsapp/index.ts` | 3 | O cérebro: webhook da Evolution e envio manual do atendente |
| `supabase/functions/_shared/llm.ts` | 3 | Fala com Claude e GPT pela mesma porta — é o que permite trocar de modelo |
| `supabase/functions/_shared/whatsapp.ts` | — | **A porta**: a interface que as duas pontes implementam, e o tipo `Midia` |
| `supabase/functions/_shared/pontes.ts` | — | Lê `provedor_whatsapp` e devolve a ponte ativa |
| `supabase/functions/_shared/evolution.ts` | 3 | A ponte Evolution: envia, "digitando…", baixa mídia, lê o webhook e cuida da conexão |
| `supabase/functions/_shared/uazapi.ts` | — | A ponte uazapi, com as mesmas obrigações |
| `supabase/functions/_shared/prompt.ts` | 3 | Monta o prompt: identidade + dados da clínica + data de hoje + histórico |
| `supabase/functions/_shared/prompt-oficial.ts` | 1 | O `prompt.md` embutido na função. **Gerado — não edite à mão** |
| `agente-ia/gerar-prompt.mjs` | 1 | `npm run prompt`: transforma o `.md` no arquivo acima |
| `supabase/functions/_shared/tempo.ts` | 3 | Texto de data vira instante no fuso da clínica. Cópia deliberada da API — ver seção 7 |
| `src/pages/Conversas.tsx` | 4 | A página, em duas colunas |
| `supabase/migrations/0013_conversas_lista.sql` | 4 | A view `conversas_lista`: última mensagem, não lidas e quem assumiu |
| `src/components/ListaConversas.tsx` | 4 | Coluna esquerda: busca, prévia, não lidas, quem assumiu |
| `src/components/JanelaConversa.tsx` | 4 | Coluna direita: balões, cabeçalho e caixa de digitar |
| `src/components/PainelLead.tsx` | 4 | Coluna extra: ficha da pessoa, consultas e a foto do WhatsApp |
| `src/lib/statusLead.ts` | 4 | Cores e rótulos de status, para código novo não fazer a quinta cópia |
| `src/lib/agente.ts` | 4 | Como ela se chama **na tela** — separado de como se apresenta ao paciente |
| `src/pages/SecretariaIA.tsx` | 5 | Página do menu do usuário: modelo, prompt, liga/desliga |
| `src/components/EditorProcedimento.tsx` | 5 | Modal de edição do procedimento: as duas descrições, com as réguas |
| `src/components/ModalPortal.tsx` | 5 | Leva o modal para o `<body>` — ver Convenções no [`CLAUDE.md`](../CLAUDE.md) |
| `supabase/migrations/0011_procedimentos_detalhados.sql` | 5 | A coluna `descricao_longa` e os 20 textos |
| `supabase/migrations/0012_procedimentos_texto_enxuto.sql` | 5 | Os 20 textos, curtos (~430) e sem travessão |
| `supabase/functions/_shared/ferramentas.ts` | 3 | As 8 ferramentas e o `executar()` que despacha |
| `supabase/functions/_shared/db.ts` | 3 | PostgREST por `fetch` puro: ler, gravar e subir mídia |
| `src/lib/conversas.ts` | 4 | Ler, enviar, assumir e devolver — fora dos componentes |
| `agente-ia/prompt.md` | 1 | ⭐ O prompt da Letícia — identidade, tom, fluxo e regras |
| `agente-ia/exemplos/` | 1 | ⬜ **vazia** — conversas de teste, quando existirem |
| `agente-ia/README.md` | — | ✅ **já criado** — este documento |
| `agente-ia/GUIA-DO-PROMPT.md` | — | Como escrever o prompt ao levar o sistema para outra clínica |
| `agente-ia/.env.agente.local` | — | ✅ **já criado** — as 6 chaves a preencher |
| `supabase/migrations/0017_provedor_whatsapp.sql` | — | A coluna `provedor_whatsapp`: qual ponte está ativa |
| `src/lib/whatsappConexao.ts` | — | Consultar, parear e desconectar — e o `useConexao()` que acompanha |
| `src/components/ConexaoWhatsApp.tsx` | — | A seção "Conexão do WhatsApp", em Secretária de IA |
| `src/components/AvisoWhatsAppCaiu.tsx` | — | Faixa vermelha em Conversas, só quando a ponte cai |
| `src/lib/apagarPessoa.ts` | — | Prever o estrago e apagar tudo de uma pessoa |
| `src/components/ApagarPessoa.tsx` | — | A zona de perigo, no fim da página Secretária de IA |
| `supabase/migrations/0018_avaliacao_e_precos.sql` | — | A avaliação como porta, o preço falável e o `interesse` na consulta |
| `src/components/PortaDeEntrada.tsx` | — | A avaliação em bloco próprio, fora da grade de cards |
| `src/lib/procedimentos.ts` | — | Ler e formatar o "a partir de" na tela |

### Alterados

| Arquivo | Etapa | O que muda |
|---|:-:|---|
| `src/App.tsx` | 4 | A rota `/conversas` |
| `src/components/Sidebar.tsx` | 4 | Item novo na navegação |
| `src/types/index.ts` | 2 | Tipos das mensagens e da configuração do agente |
| `src/pages/Procedimentos.tsx` | 5 | Abre o editor de procedimento — o catálogo saiu de Configurações e virou página |
| `src/components/ConfirmDeleteModal.tsx` | 5 | Passou a nascer dentro do `ModalPortal` |
| `src/pages/LeadDetail.tsx` | 4 | Botão "ver conversa" na ficha |
| `DATABASE.md` | 6 | Tabela nova, políticas e Storage |
| `CLAUDE.md` | 6 | Estrutura, rotas e a seção do Agente de IA |
| `README.md` | 6 | O passo de publicar a função nova |

### O que **não** é tocado

A função [`supabase/functions/agenda/`](../supabase/functions/agenda/) que já está
no ar, as nove migrações existentes, e as telas de CRM, Agenda, Leads, Clientes
e Profissionais. O agente se pendura no que existe — não reescreve nada.

---

## 6. O banco

### Tabela `mensagens_whatsapp`

Cada linha é uma mensagem. É a memória do agente **e** o que a tela de Conversas
mostra — a mesma fonte, para nunca divergirem.

| Coluna | Guarda |
|---|---|
| `lead_id` | De quem é a conversa (aponta para `crm_clinica_dados`) |
| `autor` | `paciente`, `agente` ou `atendente` — é o que dá a cor do balão |
| `tipo` | `texto`, `audio`, `imagem`, `video` ou `documento` |
| `conteudo` | O texto — ou a transcrição, quando for áudio |
| `midia_url` | Onde o áudio ou a foto ficou guardado |
| `id_externo` | O código da mensagem na Evolution. **Único** — impede a mesma mensagem entrar duas vezes se o WhatsApp reenviar |
| `enviada_por` | Qual usuário escreveu, quando foi um atendente |
| `lida` | Alimenta a bolinha de não lidas da tela Conversas |
| `criada_em` | Quando chegou |

### Três colunas em `crm_clinica_dados`

| Coluna | Para quê |
|---|---|
| `agente_pausado` | O interruptor. Ligado, o agente fica calado nessa conversa |
| `assumido_por` | Quem da equipe assumiu — aparece na tela |
| `assumido_em` | Desde quando |

### Tabela `configuracoes_agente` — uma linha só

| Coluna | Guarda |
|---|---|
| `ativo` | Liga e desliga o agente inteiro. **Nasce `false`** |
| `modelo` | Qual IA está atendendo |
| `prompt` | `null` = está rodando o [`prompt.md`](prompt.md). Preenchido = alguém editou pela tela |
| `modo_teste` | **Nasce `true`.** Ver abaixo |
| `numeros_teste` | Os números que o agente pode responder no modo teste |

### 🔒 O modo teste

Com a Evolution conectada, **qualquer número que mandar mensagem aciona o
agente**. Sem trava, o primeiro teste responde a paciente de verdade, com um
prompt ainda não validado.

Por isso o modo teste **nasce ligado**, e o agente **nasce desligado**:

| Situação | O que acontece |
|---|---|
| Número na lista de teste | Ela responde normalmente |
| Qualquer outro número | A mensagem é **gravada e aparece na tela**, mas fica sem resposta — a equipe atende à mão |
| `ativo = false` | Ninguém recebe resposta, de número nenhum |

A regra mora numa função só, `agente_deve_responder(whatsapp)`. A Edge Function
pergunta, não decide — assim ela não pode divergir da tela.

Número já cadastrado para os testes: **`5511987654321`**.

### Bucket `midias-whatsapp` — privado

Diferente de `avatars` e `logos`, que são públicos. Aqui entra foto da boca de
paciente: dado de saúde, com URL que não pode ser adivinhada nem indexada. A
tela abre cada arquivo com signed URL.

### Trigger de `ultima_mensagem`

A coluna já existia e alimenta o "há X minutos" do CRM. O trigger a atualiza —
mas **só conta mensagem do paciente**. O agente responde em segundos; se a
resposta dele contasse, a coluna marcaria "0 min" o tempo inteiro e o CRM
perderia justamente o sinal que ela existe para dar.

### Duas armadilhas registradas

> ⚠️ **Realtime assina a TABELA, não a view.** A tela assina
> `mensagens_whatsapp` direto. Assinar uma view não dá erro — simplesmente nunca
> dispara. Mesma armadilha já registrada no [`CLAUDE.md`](../CLAUDE.md) para
> `crm_clinica` / `crm_clinica_dados`.

> ⚠️ **A view `crm_clinica` precisou ser recriada.** Ela é `select d.*`, e o
> Postgres **congela** essa expansão na criação: coluna nova na tabela não
> aparece na view sozinha. E `create or replace view` também não resolve — as
> colunas novas entrariam antes de `minutos_ultima_mensagem`, mudando a posição
> de uma coluna existente, o que o Postgres recusa. A migração `0010` dropa e
> recria idêntica. **Quem for acrescentar coluna em `crm_clinica_dados` no
> futuro precisa fazer o mesmo.**

---

## 7. As ferramentas

O que a Letícia consegue fazer no sistema. Oito coisas — nada além.

| Ferramenta | Quando ela usa | Já existe? |
|---|---|---|
| `ver_horarios_livres` | "tem horário na terça?" | Sim — função SQL da migração `0004` |
| `marcar_consulta` | Depois de confirmar dia, hora e nome completo. Recusa o que passa pela avaliação, e diz o nome certo | Sim |
| `remarcar_consulta` | "posso passar para sexta?" | Sim |
| `cancelar_consulta` | "preciso desmarcar" | Sim |
| `ver_minhas_consultas` | Antes de remarcar ou cancelar, e no "que dia mesmo é a minha?" | Sim |
| `detalhes_do_procedimento` | "como funciona o clareamento?", "tenho medo de doer" | Sim — lê `descricao_longa` de `servicos_clinica` |
| `historico_do_paciente` | "da última vez", "o que eu fiz mesmo?" | Sim — as consultas realizadas, canceladas e as faltas (`faltou`, migração 0015) |
| `atualizar_ficha` | Quando descobre nome, procedimento de interesse, ou o funil avança | Escrita direta no CRM |

> ⚠️ **O agente nunca escreve consulta direto no banco.** Sempre pelas funções
> acima. `INSERT` direto pularia a conferência de jornada do dentista, a escolha
> de quem está livre e a trava de horário sobreposto — e o paciente descobriria
> o problema no dia da consulta. Mesma regra da seção "Ao agendar, o agente
> chama a API" do [`CLAUDE.md`](../CLAUDE.md).

### A avaliação é a porta, e a recusa é o fluxo certo

Quase todo tratamento passa antes por uma avaliação com o dentista. Quem sabe
disso é a coluna `exige_avaliacao` de `servicos_clinica`, e quem obedece é a
função SQL — não o prompt.

```
marcar_consulta("Lentes de Contato", quinta 14h)
        │
        ▼
  agenda_marcar vê exige_avaliacao
        │
        ▼
  { ok: false, motivo: "exige_avaliacao",
    marque_no_lugar: "Avaliação Odontológica" }
        │
        ▼
marcar_consulta("Avaliação Odontológica", quinta 14h,
                interesse: "Lentes de Contato")
```

**Por que na função e não no prompt.** Ela já ignorou regra escrita com o dado
na frente dela — é o caso de 01/09, contado na seção 8. Prompt é pedido; função
é trava. E como a Letícia e a API externa descem para a **mesma** função, a
regra não tem como divergir entre as duas portas.

**A recusa carrega o nome, e o nome vem do banco.** Renomear a avaliação na tela
não deixa nenhuma frase para trás.

> **`interesse` é o que salva a agenda de virar uma parede.** Com uma porta só,
> o dentista abriria a quinta-feira e veria oito "Avaliação Odontológica"
> idênticas. Com ele, lê `Avaliação Odontológica · Lentes de Contato`.
>
> E quando ela esquece de mandar, a **própria função** busca o
> `procedimento_interesse` da ficha — mas só quando o que está sendo marcado é a
> avaliação. Numa limpeza o procedimento já é o que a pessoa quer, e copiar a
> ficha encheria a agenda de ruído.

### O preço: três estados, e o do meio é o que vende

Até 01/09 o prompt proibia falar valor, sem exceção. Agora a exceção é **dado**,
não texto — `preco_a_partir_de`, lido pela view que monta o catálogo:

| Valor | A linha do catálogo | O que ela faz |
|---|---|---|
| vazio | *(nada)* | "isso a gente vê na avaliação" |
| `0` | `Gratuita.` | **"a avaliação é gratuita"** |
| `250` | `A partir de R$ 250,00.` | "a partir de R$ 250" |

**O zero é o item mais valioso desta tabela.** Sem ele, a resposta a "quanto
custa?" é sempre "depende, o dentista precisa olhar" — que soa como
desconversa, e é onde mais gente some da conversa. Com ele, a mesma frase
termina em oferta: *"e a avaliação é gratuita, quer que eu veja um horário?"*.

O prompt manda usar isso **uma vez**, na objeção. Repetido em toda mensagem
vira panfleto, pelo mesmo motivo da regra que proíbe repetir o nome do paciente.

### ⚠️ Data sem fuso não é hora: passe por `paraInstante()`

`marcar_consulta` e `remarcar_consulta` descem para funções SQL que recebem
**`timestamptz`**. O modelo escreve hora local (`2026-09-01T14:00`), sem fuso —
e **texto sem fuso não é um instante**. Quem resolve a ambiguidade é o
Postgres, com o fuso da sessão, e a sessão do PostgREST roda em **UTC**.

Resultado: 14:00 da clínica é gravado como 14:00 de Londres, que são **11:00 em
São Paulo**. Foi o que aconteceu no primeiro teste real — o paciente pediu 14h,
ela mandou 14h, e a consulta ficou às 11h. Ela não errou: leu o banco de volta
e anunciou fielmente o horário já estragado.

O deslize de três horas é a parte visível. A pior é silenciosa:

| Paciente pede | Virava | O que ele ouvia |
|---|---|---|
| 8h, 9h, 10h | 5h, 6h, 7h | Fora do expediente: **"não tenho horário"**, para um horário livre |
| 11h às 18h | 8h às 15h | Marcava três horas mais cedo |
| 19h, 20h | 16h, 17h | **Marcava**, com a clínica fechada |

A manhã inteira ficou impossível de agendar, e ninguém percebeu porque o único
teste caiu na faixa que "funcionava".

**A regra:** nada com hora vai para o banco sem passar por `paraInstante()`, de
[`_shared/tempo.ts`](../supabase/functions/_shared/tempo.ts). Ela devolve
`null` no que não entender — e `null` vira a recusa `data_invalida`, não uma
data inválida gravada em silêncio.

> `ver_horarios_livres` e `agenda_proxima_vaga` escapam: recebem `date`, sem
> hora, e comparam com a hora local já formatada. Era por isso que as duas
> ferramentas se contradiziam na mesma conversa — "tem 14h sim", e marcava 11h.

> ⚠️ **A mesma conversão existe duas vezes**, aqui e em
> `supabase/functions/agenda/index.ts`. A função `agenda/` está publicada sem
> nenhum import (o runtime sobe com `--no-remote`) e não vale arriscar os sete
> endpoints por uma dedução não testada. **Mudou uma, mude a outra.**

### A memória dela — duas camadas, e uma delas ela mesma escreve

**Ela não tem "conversas".** Não existe sessão, nem começo, nem fim: é uma linha
do tempo só por número de WhatsApp, para sempre.

| Camada | O que é | Alcance |
|---|---|---|
| **Janela** | As últimas **50 mensagens** da tabela `mensagens_whatsapp` | Curto — umas **16 trocas** |
| **Ficha** | Nome, interesse, resumo e as consultas, montados por `montarFicha()` | **Permanente** |

**Por que 50 mensagens são só 16 trocas:** cada balão é uma linha, e ela responde
em 2 ou 3. Na conversa de teste real, 10 mensagens do paciente geraram 19 dela.

**A ficha é o que sobra quando a janela acaba.** Um paciente que sumiu por um ano
volta e ela lembra do nome, do que ele procurava e do que já fez — não porque
leu a conversa antiga, mas porque a ficha está no fim do prompt.

> ⚠️ **A ficha só existe se ela escrever.** Quem preenche é `atualizar_ficha`,
> chamada por ela mesma. Na primeira conversa de teste ela gravou o nome e
> **nada mais** — interesse e resumo ficaram vazios, mesmo depois de falar de
> lentes e de limpeza. Foi por isso que a regra virou inegociável no prompt.
> **Se a memória longa falhar, o primeiro lugar para olhar é se a ficha do lead
> está preenchida.**

O que entra na ficha, e o que fica de fora:

| No prompt, sempre | Pela ferramenta, quando pedem |
|---|---|
| Nome | O histórico completo de atendimentos (`historico_do_paciente`) |
| Se já é paciente da clínica | |
| Procedimento de interesse | |
| Resumo da conversa | |
| **A consulta já marcada** (data, hora, dentista) | |
| **A ordem de não oferecer agendamento**, quando existe consulta | |
| Uma linha de placar: quantas consultas fez e quando foi a última | |

A consulta marcada é a linha mais importante da ficha: **oferecer agendamento a
quem já tem hora na quinta** é o erro mais constrangedor que ela pode cometer.
E foi exatamente o que ela fez no teste de 01/09 — com o dado na frente dela.

Por isso a ficha é o único lugar do prompt que carrega **ordem junto com dado**:
quando existe consulta, `montarFicha()` acrescenta uma segunda linha mandando
não oferecer agendamento. Parece redundante com as `REGRAS INEGOCIÁVEIS`, e
não é: a ficha é a **última** coisa que o modelo lê antes da conversa, e regra
perto do dado pesa mais que a mesma regra dez seções acima. Também não custa
cache — esta seção já é volátil por natureza. O caso está contado na seção 8.

### O que ela sabe sem precisar perguntar

Endereço, bairro, horário de atendimento, Instagram, os 20 procedimentos e os
dentistas com a jornada de cada um **vão dentro do prompt**, lidos das três
views (`informacoes_clinica_agente`, `procedimentos_clinica_agente`,
`profissionais_clinica_agente`) a cada mensagem. Não são ferramenta.

Isso é diferente do prompt original, e de propósito: como ferramenta, cada
resposta custaria duas idas à IA e uns quatro segundos a mais. Dentro do prompt,
a informação está sempre na frente dela — não dá para "esquecer de consultar".

### E o que ela busca só quando perguntam

Dos 20 procedimentos, o prompt carrega **uma frase de cada** (a `descricao`).
Isso basta para reconhecer o que o paciente quer, e não para explicar.

A explicação completa mora em `descricao_longa`, **fora do prompt**, e sai pela
ferramenta `detalhes_do_procedimento` — que devolve o texto de **um**
procedimento, o que a conversa pediu.

A conta é o motivo: os 20 textos longos somam ~8.600 caracteres. Dentro do
prompt, seriam cobrados de toda mensagem, inclusive a de quem só mandou "oi",
para carregar 19 explicações que aquela conversa nunca vai usar. Fora dele, o
prompt continua **na ordem de dois mil caracteres**, e não de dez mil.

Quem escreve esses textos é a equipe, na página **Procedimentos →
Editar** ([`EditorProcedimento.tsx`](../src/components/EditorProcedimento.tsx)),
onde a tela avisa qual campo é cobrado em toda conversa e qual não é.

> **Ela precisa usar a ferramenta antes de explicar.** O prompt manda, em duas
> regras: na Etapa 3 e na seção da ferramenta. Sem isso, o modelo parafraseia a
> frase de catálogo e soa como quem não conhece o próprio serviço.

---

## 8. O prompt

**O prompt vive em [`prompt.md`](prompt.md), nesta pasta.**

### O arquivo é exatamente o que o modelo recebe

Nada dentro dele é comentário, instrução para humano ou anotação. Tudo o que
estiver ali, a Letícia lê como ordem. Explicação sobre o prompt vem para este
README — nunca para dentro do arquivo.

### Os seis marcadores

Seis trechos são preenchidos pelo sistema, lendo o banco na hora. É o que
mantém o agente sempre atualizado sem ninguém reescrever nada:

| Marcador | Vem de | Muda quando |
|---|---|---|
| `{{NOME_AGENTE}}` | `configuracoes_agente.nome_agente` | Alguém troca o nome dela na tela |
| `{{INFORMACOES_CLINICA}}` | `informacoes_clinica_agente` | Alguém edita a aba Clínica |
| `{{PROCEDIMENTOS}}` | `procedimentos_clinica_agente` | Alguém liga/desliga um procedimento |
| `{{PROFISSIONAIS}}` | `profissionais_clinica_agente` | Alguém muda um dentista ou uma jornada |
| `{{DATA_HOJE}}` | O relógio do servidor | A cada mensagem |
| `{{FICHA_DO_PACIENTE}}` | `montarFicha()` | A cada mensagem, e por pessoa |

A tabela está **na ordem em que aparecem no arquivo**, e essa ordem não é
estética: os quatro primeiros são iguais para todo mundo e os dois últimos mudam
a cada conversa. O cache de prompt reaproveita o **prefixo comum** entre
chamadas — subir a data ou a ficha joga fora o desconto do texto inteiro, de
todas as conversas de uma vez. **Não mova as duas últimas seções para cima.**

> **O `{{NOME_AGENTE}}` fica no topo e isso não fere a regra do cache.** Ele
> muda uma vez por instalação, não a cada conversa — é conteúdo estável, e é aí
> que ele tem que estar. A regra é sobre dado **volátil**, não sobre marcador.

> ⚠️ **Ele é substituído com `replaceAll`, e os outros com `replace`.** O nome
> aparece **duas** vezes no prompt: na identidade e no exemplo de apresentação
> da Etapa 1. Com `replace`, a segunda continuaria sendo o literal
> `{{NOME_AGENTE}}` — e a agente se apresentaria ao paciente com o marcador na
> cara.

Efeito prático: **desligar um procedimento na página Procedimentos tira ele da boca da
Letícia na mensagem seguinte.** Sem deploy, sem editar prompt.

> ⚠️ Mexeu num marcador (nome, quantidade, formato)? A montagem em
> `supabase/functions/_shared/prompt.ts` precisa acompanhar. Marcador sem
> substituição vai para o modelo como texto cru — e ele vai tratar
> `{{PROCEDIMENTOS}}` como se fosse o catálogo.

### Fica igual

- A identidade da Letícia e o tom de voz — incluindo a regra de **não repetir o
  nome do paciente**, que é o detalhe que mais separa agente bom de robô
- O limite de **50 palavras** por resposta
- Tentar agendar até **três vezes** antes de encerrar
- Verificar o horário antes de confirmar, nunca marcar direto

### Muda

| Antes | Agora | Motivo |
|---|---|---|
| Ferramenta `sobreClinica` | Dados da clínica dentro do prompt | Metade do custo, metade do tempo, e impossível de esquecer |
| `Agendar` recebendo uma frase | Quatro ferramentas com campos exatos | A API não interpreta texto — quer data, hora e procedimento separados |
| Exige o dentista para agendar | Dentista é opcional | Nenhuma etapa do fluxo perguntava isso, e a maioria não tem preferência |
| "Você não informa valor. Nunca." | "Só fala o que está escrito no catálogo" | A avaliação virou gratuita, e "gratuita" é a melhor resposta que ela tem para quem trava no preço. A proibição absoluta jogava isso fora |
| Agendava qualquer procedimento | Agenda a avaliação, e guarda o desejado em `interesse` | Ela não pode decidir que alguém precisa de canal. O diagnóstico é do dentista |
| "informações do estúdio" | "informações da clínica" | Sobra de outro negócio — o agente repetiria isso com o paciente |
| Um bloco de 50 palavras | Dois ou três balões curtos | É como gente escreve no WhatsApp |

### Faltava

- **Foto** — o prompt dizia que recebia imagem, mas não dizia o que fazer. Regra
  dura: acolhe e **nunca diagnostica**. O fim da resposta depende da ficha
  (ver abaixo).
- **Áudio** — nenhuma instrução existia.
- **Passar para um humano** — dor forte, trauma, sangramento, reclamação, ou
  pedido explícito. Ela avisa e pausa sozinha.
- **Fora do horário** — ela atende às 3 da manhã e precisa saber que a clínica
  está fechada, sem prometer retorno imediato.
- **A data de hoje** — sem isso ela não resolve "amanhã" nem "terça". Injetada
  automaticamente a cada mensagem.

### O que o primeiro teste real quebrou (01/09/2026)

Uma conversa de teste no WhatsApp derrubou duas coisas de uma vez, e as duas
tinham **a mesma causa: o exemplo da seção Foto.**

O paciente já tinha consulta marcada, mandou uma foto do sorriso, e a Letícia
ofereceu agendar uma avaliação. Trinta segundos depois, perguntada, ela recitou
dia, hora, procedimento e dentista de cor. Ou seja: **o dado estava na ficha e
ela sabia.** O que ela fez foi copiar o exemplo, quase palavra por palavra:

| O exemplo no prompt | O que ela mandou |
|---|---|
| "Obrigada por mandar! Pelo que dá pra ver aqui não consigo te dizer nada com certeza — isso o dentista precisa olhar de perto. Quer que eu veja um horário pra avaliação?" | "Obrigada por mandar a foto! Pelo que vejo aqui, não consigo dar um diagnóstico certinho — isso o dentista precisa olhar de perto. Quer que eu veja algum horário pra você vir fazer uma avaliação?" |

**Exemplo concreto vence regra abstrata em outra seção.** A regra "não ofereça
agendar a quem já tem hora" existia, mas morava na última seção do prompt. E o
texto empurrava para agendar em quatro lugares (Etapa 3, Etapa 4, exemplo do
Preço, exemplo da Foto) e freava em um. Numericamente o prompt torcia contra a
resposta certa — ainda mais com um modelo pequeno, que copia exemplo e ignora
regra distante muito mais que um grande.

**O travessão veio no mesmo pacote: ele estava no exemplo.**

O que mudou:

1. **O exemplo da Foto ganhou dois caminhos**, com e sem consulta marcada.
2. **Seção nova: `QUANDO A PESSOA JÁ TEM CONSULTA MARCADA`.** Proibir não
   basta — sem um movimento no lugar, ela volta ao gesto mais treinado. A seção
   dá nome ao movimento certo: **leve o assunto para a consulta que já existe.**
3. **Duas regras novas em `REGRAS INEGOCIÁVEIS`**, que é a lista que ela
   demonstravelmente respeita: na mesma conversa não falou um preço nem deu um
   diagnóstico.
4. **Travessão proibido**, e removido dos dois exemplos que o traziam. A regra
   separa **travessão entre orações** (proibido) de **hífen dentro da palavra**
   (normal). Sem essa distinção ela escreveria "pos operatorio" e "raio x".
5. **A ficha passou a levar a ordem junto do dado.** Ver a seção 7.

> Só os **exemplos** foram limpos; a prosa do prompt ainda usa travessão. É de
> propósito: o que ela imita é a fala entre aspas, não a instrução. Se ainda
> escapar travessão, o passo seguinte é filtrar no envio
> (`supabase/functions/whatsapp/index.ts`, onde a resposta é quebrada em
> mensagens) — prompt acerta quase sempre, código acerta sempre.

---

## 8.5. A conexão com o WhatsApp

São **duas pontes implementadas**, e a clínica escolhe na tela: a **Evolution
API** (v2.3.7) e a **uazapi** (v2.1.9), cada uma num servidor próprio. Quem
decide é a coluna `provedor_whatsapp` (migração `0017`), lida a cada
requisição — **uma de cada vez**, e trocar vale na mensagem seguinte, sem
republicar a função.

### As duas pontes, e a porta entre elas

`supabase/functions/_shared/whatsapp.ts` define a interface; `evolution.ts` e
`uazapi.ts` implementam; `pontes.ts` lê a coluna e devolve a certa. O
`whatsapp/index.ts` não conhece nenhuma das duas.

A abstração **não** foi escrita junto com a `0017`, de propósito: com um
provedor só ela seria inventada por palpite. Foi escrita contra as duas APIs
reais, e três diferenças justificaram cada decisão dela:

| | Evolution | uazapi |
|---|---|---|
| **O texto** | a árvore do Baileys (`message.conversation`, `extendedTextMessage.text`, `imageMessage.caption`…) | `text`, plano |
| **Grupo** | só o sufixo do jid (`@g.us`) | `isGroup`, booleano |
| **Mídia** | POST devolvendo base64 — o evento não traz o arquivo | `fileURL` pronto no evento |

A terceira é a que moldou o tipo `Midia`: uma **referência opaca**, montada por
quem leu o webhook e entendida pela mesma ponte na hora de baixar. O `index.ts`
carrega o valor sem olhar dentro.

> ⚠️ **O seletor manda em quem a gente chama, não em quem chama a gente.** O
> webhook chega sem pedir licença. Com as duas configuradas e as duas apontadas
> para a nossa função, a inativa continuaria entregando mensagem — e a resposta
> sairia pelo número da outra, para um paciente que nunca escreveu para lá.
>
> Por isso quem lê o webhook é a ponte **ativa**, e o que ela não reconhece é
> descartado **com motivo no log** (`webhook ignorado (uazapi): …`), nunca em
> silêncio. **Só o webhook do provedor ativo deve apontar para a nossa
> função** — isso é um passo manual, no painel de cada uma.

> ⚠️ **`desconectar()` da uazapi é a única rota do arquivo não testada.**
> Escrita por simetria com `/instance/connect`, que foi verificada. Testar
> significaria derrubar a sessão do WhatsApp da clínica de verdade. O primeiro
> clique no botão é o teste.

### O que cada rota da uazapi faz

Header `token` com o token **da instância** — o de admin não entra no sistema,
porque nunca criamos instância.

| Nossa função | uazapi |
|---|---|
| `enviarTexto` | `POST /send/text` — `{ number, text }`. O campo é `text`; `message` devolve 400 |
| `digitando` | `POST /message/presence` — `{ number, presence: 'composing', delay }` |
| `estadoDaConexao` | `GET /instance/status` — estado, dono, perfil e foto numa ida só |
| `iniciarConexao` | `POST /instance/connect` — `paircode` e `qrcode` na resposta |
| `desconectar` | `POST /instance/disconnect` — ⬜ não testada |
| `fotoDoPerfil` | `POST /chat/details` — `{ number }`, a URL vem em `image` |
| `baixarMidia` | o `fileURL` do próprio evento |

A referência foi levantada **contra o servidor**, e não pela documentação:
`docs.uazapi.com` monta a página por JavaScript e os markdown por trás dela são
rascunho de template.

### O dia em que ela caiu, e o que isso mudou

Em 01/09 o servidor da Evolution saiu do ar. O sintoma foi **silêncio**:
mensagem enviada pelo WhatsApp, nenhuma resposta, e nada de anormal em tela
nenhuma. Pior: a página da Secretária continuava dizendo **"está atendendo"**,
porque só olhava o nosso liga/desliga.

Atender depende de duas coisas, e a tela conhecia uma. Daí saíram três peças:

| Peça | Onde | O que faz |
|---|---|---|
| O card de estado | Secretária de IA | Passou a exigir **as duas** condições. Sem WhatsApp, diz "Ligada, mas o WhatsApp está desconectado" |
| Seção "Conexão do WhatsApp" | Secretária de IA | Provedor, quem está conectado, reconectar e desconectar |
| Faixa vermelha | Conversas | Aparece **só** quando cai. É lá que a recepção passa o dia |
| Aviso de webhook | Secretária de IA | A **terceira** condição — ver abaixo |

### A terceira condição: o webhook

Conectar resolve um lado — o sistema falando com o WhatsApp. O webhook é o
outro: como a ponte avisa o sistema de que chegou mensagem.

Isso apareceu na estreia da uazapi, em 01/09: sessão pareada, card **verde
escrito "Conectado"**, e silêncio absoluto. O webhook dela nunca tinha sido
ligado, então nada chegava no banco — e a tela afirmava que estava tudo bem.
A mesma falha de horas antes, com outra roupa.

`/conexao` agora pergunta à ponte ativa e devolve um veredito:

| Ponte | Como se pergunta |
|---|---|
| Evolution | `GET webhook/find/{instancia}` — devolve `url`, `enabled` e os cabeçalhos |
| uazapi | `GET /webhook` — devolve uma **lista**, porque ela aceita mais de um destino |

| Veredito | O card |
|---|---|
| `apontado` | **nada** — aviso só existe quando há problema |
| `outro` | avisa: tem webhook, mas para outro endereço. É o caso mais provável de quem já usava a instância |
| `ausente` | avisa: desligado ou sem URL |
| `desconhecido` | **nada** — não deu para perguntar, e acusar o que não se sabe é o mesmo erro ao contrário |

> ⚠️ **A URL nunca chega na tela.** Ela leva o `WEBHOOK_SEGREDO` dentro — na
> uazapi obrigatoriamente, já que ela não tem campo de cabeçalho customizado e
> o segredo precisa viajar na query. Por isso `avaliarWebhook()` compara só
> **origem e caminho** (query diferente continua sendo o mesmo destino) e o que
> sai da função é o veredito, nunca o endereço.

### `desconectado` ≠ `indisponivel`

A distinção mais útil do módulo, porque cada estado manda a pessoa para um
lugar diferente:

- **`desconectado`** — a ponte respondeu, mas a sessão do WhatsApp caiu. Religa
  na própria tela, com código de pareamento.
- **`indisponivel`** — a ponte não respondeu. **Nenhum botão da tela adianta:**
  quem precisa subir é o servidor, no painel da hospedagem.

Sem essa separação, a pessoa clica em "Reconectar" dez vezes enquanto o
problema está em outra máquina.

### Detalhes que não são detalhe

**Timeout de 8 segundos** em toda chamada de conexão. Servidor fora do ar deixa
um `fetch` pendurado mais de 20s; a tela consulta em intervalos curtos, então
sem prazo ela viveria em "verificando…" justo quando precisa avisar que caiu.

**Só consulta com a aba visível**, e a cada minuto — `INTERVALO_PADRAO`, em
[`src/lib/whatsappConexao.ts`](../src/lib/whatsappConexao.ts). Cada verificação
são duas chamadas à ponte (estado + webhook), e por isso ela é uma constante e
não um número digitado em cada tela: foram 30s na Secretária e 60s na faixa de
Conversas, sem que nada justificasse a diferença. A frase "verificado
automaticamente a cada 1 minuto" também sai dela, por `cadenciaEmPalavras()` —
digitada à mão, ela já mentiu.

**Uma verificação de cada vez, e quem chega no meio espera.** A trava existe
porque servidor fora do ar demora até o timeout e as consultas se empilhariam
justo quando ele está lento — mas ela **devolve a que está em voo** em vez de
descartar o pedido. Descartando, o clique no botão "Verificar" sumia sem deixar
rastro sempre que caía no meio de uma consulta automática.

**O botão "Verificar" precisa dizer que verificou.** Entre um clique e o
seguinte o estado quase nunca muda, então a tela ficava idêntica — e tela
idêntica é indistinguível de botão morto. Hoje o ícone gira enquanto a consulta
acontece, o botão tranca, e o rodapé mostra "Verificado agora" por dois
segundos e meio antes de voltar para o horário da última. Essa linha aparece em
**todos** os estados: quem clica três vezes seguidas é quem está esperando o
servidor voltar, e era exatamente ali que ela não existia.

**`logout`, nunca `delete`.** O primeiro derruba a sessão e deixa a instância de
pé para parear de novo; o segundo apagaria a instância e o histórico junto. Não
há botão nesta tela que justifique esse estrago.

**Código de pareamento antes do QR.** Num painel de computador, digitar 8
dígitos no celular é melhor do que apontar a câmera para o monitor. O QR volta
como reserva, porque nem toda conta aceita o código.

**A chave nunca vai para o navegador.** As três rotas passam pela Edge Function
e exigem sessão do Supabase — mesmo motivo da `/foto`. Quem tem a chave da
Evolution manda mensagem por aquele WhatsApp.

### A tela mostra como está configurado

Quatro linhas cinzas acima do estado, e cada uma responde uma pergunta que só
aparece quando algo quebra:

| Campo | Responde |
|---|---|
| **Servidor** `sua-evolution.exemplo.…` | Em qual painel entrar. Foi a pergunta de 01/09 |
| **Instância** `clinica-principal` | Qual das instâncias do servidor é a nossa |
| **Chave** `····949B` | Se a chave configurada é a que se pensa que é — útil depois de um `agente:secrets` |
| **WhatsApp** `+55 (11) 98765-4321` | **Qual número está atendendo.** Inteiro, e não os últimos dígitos |

Os três primeiros saem de `identificacao()` da ponte ativa, e vêm das **secrets
da função** — nunca do banco. O quarto é de outra natureza: sai do
`estadoDaConexao()`, que é sessão e não configuração. Ele está nesse bloco
mesmo assim porque a pergunta que responde é da mesma família — *o que exatamente
está ligado aí?* — e porque ali ele aparece também quando a sessão cai, o que a
linha verde do estado não faz.

> **O número não é repetido no cartão verde.** Ele já esteve nos dois lugares,
> a oitenta pixels de distância: a mesma string duas vezes é ruído, não reforço.
> O verde ficou com o nome do perfil.

Todos só saem pela rota `/conexao`, que exige sessão.

> ⚠️ **Quatro caracteres da chave, e nunca mais.** É o padrão de cartão, AWS e
> Stripe, pela mesma razão: quatro de trinta e cinco servem para **identificar**,
> não para usar.
>
> O endereço, ao contrário, vai inteiro e sem problema: quem protege a API é a
> chave, não o host ser desconhecido — e um pedaço cortado não serviria para
> copiar no navegador. Ele **não vira link**: a Evolution anuncia o manager dela
> em `http://`, e link que rebaixa de https para http é mau hábito para deixar
> no código.
>
> **E o número do WhatsApp vai inteiro pela mesma lógica, ao contrário.** A
> diferença entre ele e a chave é o que cada um faz na mão errada: com a chave
> se manda mensagem por aquele WhatsApp; o número é o que a clínica imprime em
> cartão e publica no Instagram. Cobrir o que está na fachada não protege nada
> e custa a única conferência que interessa — *é este o número que está
> atendendo?*

### Apagar uma pessoa — a zona de perigo

`POST /whatsapp/apagar-pessoa` apaga **tudo** de quem tem aquele número: ficha,
conversa inteira, consultas (inclusive as já realizadas) e os arquivos que ela
mandou. Sem lixeira, sem volta.

Serve para três coisas: direito ao esquecimento da LGPD, número errado, e lixo
de teste.

**A contagem é a parte importante.** A tela mostra o que vai destruir antes de
liberar o botão:

> **Afonso** — +55 (11) 98765-4321
> 68 mensagens · 3 consultas (1 já realizada)

Botão irreversível que só pergunta "tem certeza?" vira clique automático na
terceira vez. É o "1 já realizada" que faz alguém parar — e o pop-up destaca
essa linha quando ela existe, porque é registro de atendimento sumindo.

**Por que é rota de função, e não `delete` da tela.** A ficha o navegador
apagaria: o `CASCADE` levaria conversa e consultas junto. Os **arquivos**, não
— ver "O Storage não cascateia", na seção 7 do
[`DATABASE.md`](../DATABASE.md). A Storage API exige a `service_role key`, que
só existe dentro da função.

**Mídia primeiro, ficha depois.** O caminho do arquivo é `{lead_id}/...`:
apagar a ficha antes destruiria a única forma de saber quais arquivos eram
dela. E se a mídia falhar, a rota **para e não apaga nada** — meio-apagado com
arquivo órfão é o pior dos dois mundos.

Depois disso a Letícia não reconhece mais a pessoa: a ficha volta a ser "você
ainda não sabe nada sobre esta pessoa", e ela se apresenta de novo na próxima
mensagem.

---

## 9. Custos

Aproximado, para uma conversa completa até o agendamento — algo como 15
mensagens.

| Item | Por conversa | 300 conversas/mês |
|---|---|---|
| **Claude Opus 5** — o mais capaz | US$ 0,15 – 0,40 | US$ 45 – 120 |
| **Claude Sonnet 5** — equilíbrio | US$ 0,06 – 0,16 | US$ 18 – 48 |
| **GPT-4.1** | faixa parecida | confirme no painel da OpenAI |
| Transcrição de áudio | ~US$ 0,006 / minuto | poucos dólares |
| Servidor da Evolution | — | ~R$ 40 / mês |
| Supabase | — | o que já se paga |

Os valores já contam o desconto de cache: o texto fixo do prompt (dados da
clínica, procedimentos, dentistas) é cobrado cheio na primeira mensagem e por
volta de 10% disso nas seguintes.

**Sugestão:** começar no Claude Opus 5 para a Letícia nascer boa, e só depois —
com conversas reais na mão — testar se o Sonnet 5 ou o GPT-4.1 dão conta. A aba
de Configurações existe exatamente para essa comparação ser um clique.

---

## 10. Riscos e limites

### A Evolution é WhatsApp não oficial

Funciona bem e é barata, mas o WhatsApp pode bloquear o número — principalmente
com disparo em massa. **Use um chip separado, nunca o número principal da
clínica.** Se a operação passar a depender disso, o caminho seguro depois é a
API oficial da Meta.

### Nenhum prompt nasce pronto

As primeiras 20 ou 30 conversas reais vão mostrar onde a Letícia trava, responde
demais ou insiste na hora errada. Ajustar faz parte — e a partir da etapa 5 isso
é feito pela tela, sem depender de código.

### A Letícia não pode dar diagnóstico

Nem por foto, nem por descrição de sintoma. A regra vai dura no prompt e ela
encaminha para a avaliação. Isso é limite profissional, não limitação técnica.

### Ela se apresenta como pessoa

É uma decisão do cliente, e é o que faz o atendimento funcionar. Fica registrado
que, se um paciente perguntar direto e insistir, o mais seguro costuma ser não
negar de forma enfática.

### O horário anunciado e a agenda real são coisas diferentes

Se a clínica anuncia atendimento até as 18h mas nenhum dentista trabalha depois
das 17h, a Letícia promete horário que a própria agenda recusa em seguida. Mesma
armadilha já descrita no [`CLAUDE.md`](../CLAUDE.md): `horario_comercial` é o que a
clínica anuncia, `profissional_horarios` é quem manda na disponibilidade.
**Confira as duas grades antes de ligar o agente.**

---

## 10.5. Como publicar (o que funcionou)

Precisa de um **Personal Access Token** do Supabase
(https://supabase.com/dashboard/account/tokens), exportado como
`SUPABASE_ACCESS_TOKEN`. Ele dá acesso total à conta — **revogue depois de usar.**

```bash
npm run agente:secrets   # sobe as chaves de agente-ia/.env.agente.local
npm run agente:deploy    # regera o prompt e publica a função
```

> **Deploy com 401 `Unauthorized` quer dizer token, não código.** O CLI usa a
> sessão do `supabase login`, que expira; o token do arquivo não entra sozinho.
> Exporte antes:
>
> ```bash
> export SUPABASE_ACCESS_TOKEN=$(grep '^SUPABASE_ACCESS_TOKEN=' .supabase-token.local | cut -d= -f2-)
> ```
>
> Esse arquivo é **da instalação, e descartável** — o molde
> [`.supabase-token.example`](../.supabase-token.example) explica como criar o
> token, e como revogar e apagar quando o sistema estiver no ar.

Depois, apontar o webhook da Evolution para a função, com o segredo no
cabeçalho (`POST {EVOLUTION_API_URL}/webhook/set/{instancia}`):

```json
{ "webhook": {
    "enabled": true,
    "url": "https://SEU_REF.supabase.co/functions/v1/whatsapp",
    "headers": { "x-webhook-segredo": "O_MESMO_DO_SECRET" },
    "byEvents": false, "base64": false,
    "events": ["MESSAGES_UPSERT"] } }
```

### Três coisas descobertas do jeito difícil

1. **`WEBHOOK_SEGREDO` vazio derruba tudo em silêncio.** A função rejeita todo
   webhook com 401 e o sintoma é "o agente não responde", sem pista nenhuma.
   Confira com `supabase secrets list`: o hash
   `e3b0c442…7852b855` é o SHA-256 da string vazia.
2. **O `_shared/` funciona.** O `--no-remote` do runtime bloqueia módulo
   **remoto**; import relativo local sobe normalmente — os 7 arquivos vão
   juntos no deploy.
3. **A Management API do Supabase exige `User-Agent`.** Sem um de verdade, o
   Cloudflare devolve `error code: 1010` antes de chegar na API.

### Como saber se subiu

```bash
# sem o segredo → 401 NOSSO (prova que bootou; BOOT_ERROR daria 500)
curl -i -X POST https://SEU_REF.supabase.co/functions/v1/whatsapp -d '{}'
```

---

## 11. Chaves e secrets

As seis chaves ficam em `.env.agente.local`, nesta pasta. Ele **não vem no
clone** — está no `.gitignore`. O que vem é o molde
[`.env.agente.example`](.env.agente.example), com o comentário de onde achar
cada chave:

```bash
cp agente-ia/.env.agente.example agente-ia/.env.agente.local
# preencha, e então:
npm run agente:secrets
```

O `agente:secrets` **sobe** as chaves para os secrets do Supabase, e é de lá que
a Edge Function lê. O arquivo local continua sendo o seu único registro do que
foi configurado — os secrets do Supabase não podem ser lidos de volta.

| Chave | Para quê |
|---|---|
| `ANTHROPIC_API_KEY` | Claude |
| `OPENAI_API_KEY` | GPT **e** a transcrição dos áudios — usada mesmo quando o modelo escolhido é o Claude |
| `EVOLUTION_API_URL` | Endereço do servidor da Evolution |
| `EVOLUTION_API_KEY` | Autenticação da Evolution |
| `EVOLUTION_INSTANCIA` | Nome da instância do número da clínica |
| `WEBHOOK_SEGREDO` | Impede que alguém que descubra o endereço faça o agente responder de graça |

`SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` **não** precisam ser configuradas —
o Supabase já as entrega às Edge Functions, como acontece hoje na `agenda/`.

> ⚠️ **Nunca no `.env`.** O `.env` da raiz é do Vite: o que está lá é embutido
> no bundle e fica legível para qualquer visitante do site. Ele continua com as
> duas `VITE_SUPABASE_*` e nada mais.

---

## 12. Manutenção deste documento

Vale aqui a mesma regra 1 do [`CLAUDE.md`](../CLAUDE.md) — **a documentação faz
parte da entrega**:

| Mexeu em… | Atualize |
|---|---|
| Uma etapa concluída | A tabela de estado (topo) **e** reescreva a seção no tempo presente |
| Tabela, coluna ou bucket do agente | Seção 6 **e** o [`DATABASE.md`](../DATABASE.md) |
| Ferramentas do agente | Seção 7 |
| O prompt | Seção 8 — e confira se o [`GUIA-DO-PROMPT.md`](GUIA-DO-PROMPT.md) ainda classifica certo a seção que você mexeu |
| Modelo ou preço | Seção 9 |
| Chave nova | Seção 11 **e** [`.env.agente.local`](.env.agente.local) |

Quando as seis etapas estiverem concluídas, **apague o aviso do topo** e
transforme os "vai ser" em "é".
