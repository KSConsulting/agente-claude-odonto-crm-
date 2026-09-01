/**
 * A ponte com o WhatsApp — a porta que Evolution e uazapi implementam.
 *
 * ── POR QUE ESTA PORTA EXISTE ──────────────────────────────────────────────
 *
 * A migração `0017` criou a coluna `provedor_whatsapp` e adiou de propósito a
 * abstração: *"com um provedor só, a interface seria inventada por palpite — e
 * a uazapi de verdade ensina mais em uma hora do que o palpite em um dia"*.
 *
 * A uazapi chegou, e ensinou. Esta interface é desenhada contra as **duas**
 * APIs reais, não contra uma e a imaginação.
 *
 * ── O QUE A TROCA DE PROVEDOR NÃO RESOLVE ──────────────────────────────────
 *
 * O seletor da tela manda em **quem a gente chama**. Ele não manda em quem
 * chama a gente: o webhook chega sem pedir licença. Com as duas pontes
 * configuradas e as duas apontadas para a nossa função, a inativa continuaria
 * entregando mensagem — e a resposta sairia pelo número da outra, para um
 * paciente que nunca escreveu para lá.
 *
 * Por isso `lerWebhook` é da ponte ATIVA, e o que ela não reconhece é
 * descartado **com motivo no log**. Só o webhook do provedor ativo deve
 * apontar para a nossa função; isso é um passo manual, no painel de cada uma.
 */

// ---------------------------------------------------------------------------
// O estado da conexão
// ---------------------------------------------------------------------------

/**
 * ── OS CINCO ESTADOS, E POR QUE NENHUM SOBRA ───────────────────────────────
 *
 * - `conectado`       — atendendo.
 * - `conectando`      — pareando agora.
 * - `desconectado`    — a ponte está de pé, a sessão do WhatsApp caiu. Religa
 *                       na própria tela.
 * - `indisponivel`    — o servidor não respondeu. Botão nenhum daqui resolve:
 *                       quem precisa subir é a máquina, no painel da hospedagem.
 * - `nao_configurado` — a ponte escolhida não tem chave nas secrets.
 *
 * Os dois últimos parecem o mesmo e não são, e a diferença é o que a pessoa
 * faz em seguida. Sem `nao_configurado`, escolher a uazapi com o token em
 * branco diria "o servidor não respondeu" — mandando procurar defeito numa
 * máquina quando o que faltou foi preencher um campo.
 */
export type Estado =
  | 'conectado'
  | 'conectando'
  | 'desconectado'
  | 'indisponivel'
  | 'nao_configurado'

export interface Conexao {
  estado: Estado
  numero: string | null
  perfil: string | null
  foto: string | null
}

// ---------------------------------------------------------------------------
// O que chega
// ---------------------------------------------------------------------------

/**
 * De onde buscar o áudio ou a foto que o paciente mandou.
 *
 * As duas pontes entregam mídia de jeitos incompatíveis, e a diferença não dá
 * para esconder atrás de um campo só:
 *
 * - a **Evolution** não manda o arquivo no webhook (`webhookBase64: false`),
 *   só a referência — e quer a mensagem inteira de volta num POST para
 *   devolver o base64;
 * - a **uazapi** já entrega `fileURL` pronto no próprio evento.
 *
 * Então isto é uma referência **opaca**: quem monta é a ponte que leu o
 * webhook, e quem entende é a mesma ponte na hora de baixar. O `index.ts`
 * carrega o valor sem nunca olhar dentro.
 */
export type Midia =
  | { via: 'url'; url: string }
  | { via: 'evolution'; mensagem: Record<string, unknown> }

export interface MensagemRecebida {
  /** Canônico: só dígitos, com DDI. É a chave de `whatsapp_lead`. */
  whatsapp: string
  /** O id da mensagem no WhatsApp. Vira `id_externo`, que é único. */
  idExterno: string | null
  /** `texto` | `audio` | `imagem` | `video` | `documento` */
  tipo: string
  texto: string | null
  /** `null` quando não há o que baixar — inclusive em vídeo e documento. */
  midia: Midia | null
}

/**
 * O resultado de ler um webhook. Descartar é um resultado legítimo, **com
 * motivo** — e o motivo vai para o log.
 *
 * Isto não é preciosismo. A ferida recorrente deste projeto é o silêncio:
 * mensagem enviada, nenhuma resposta, nada no banco, nada no log. Um webhook
 * ignorado sem explicação é a mesma ferida esperando para reabrir.
 */
export type Recebimento =
  | { tipo: 'mensagem'; mensagem: MensagemRecebida }
  | { tipo: 'ignorar'; motivo: string }

// ---------------------------------------------------------------------------
// A porta
// ---------------------------------------------------------------------------

export interface Ponte {
  /** `evolution` ou `uazapi`. É o valor da coluna `provedor_whatsapp`. */
  readonly nome: string

  /** As secrets desta ponte estão preenchidas? Sem elas, nada abaixo funciona. */
  configurada(): boolean

  /**
   * Lê o que chegou no webhook.
   *
   * ⚠️ **Nunca aproveite o nome do perfil**, que as duas pontes mandam (a
   * Evolution em `pushName`, a uazapi em `senderName`). O perfil é o apelido
   * que a pessoa escolheu, não quem vai sentar na cadeira. O caso inteiro está
   * em `acharOuCriarLead`, no `whatsapp/index.ts`.
   */
  lerWebhook(corpo: Record<string, unknown>): Recebimento

  /** "digitando…" no topo da conversa. Cosmético: falhar não pode travar o envio. */
  digitando(numero: string, ms: number): Promise<void>

  /** Manda texto. Devolve o id da mensagem, que vira `id_externo`. */
  enviarTexto(numero: string, texto: string): Promise<string | null>

  /** Busca o arquivo pela referência que o `lerWebhook` desta mesma ponte montou. */
  baixarMidia(midia: Midia): Promise<{ base64: string; tipoMime: string } | null>

  /** A foto do perfil, para a tela. `null` é normal — muita gente esconde. */
  fotoDoPerfil(numero: string): Promise<string | null>

  estadoDaConexao(): Promise<Conexao>

  /** Começa o pareamento. Código de 8 dígitos quando há número; QR sempre que der. */
  iniciarConexao(numero?: string): Promise<{ codigo: string | null; qr: string | null } | null>

  desconectar(): Promise<boolean>

  /**
   * A configuração de webhook da ponte, para saber se ela avisa ESTA função.
   *
   * ⚠️ A URL volta **inteira, com o segredo dentro** quando ele viaja na query.
   * Ela nunca pode chegar na tela: só o veredito de `avaliarWebhook()` sai
   * daqui. Mostrar "webhook: https://…?segredo=abc" entregaria o segredo a
   * qualquer pessoa com login — o mesmo erro que os 4 dígitos da chave evitam.
   */
  webhook(): Promise<WebhookLido | null>

  /**
   * Como esta ponte está configurada — para a tela mostrar quando algo quebra.
   *
   * ⚠️ A chave sai com **quatro caracteres, e nunca mais**: padrão de cartão e
   * de Stripe, e pela mesma razão — quatro de trinta e poucos servem para
   * identificar, não para usar.
   */
  identificacao(): {
    servidor: string | null
    instancia: string | null
    chaveFinal: string | null
  }
}

/** Só dígitos. `5511987654321@s.whatsapp.net` e `5511987654321:41@s...` viram o mesmo. */
export function soDigitos(jid: string): string {
  return (jid ?? '').split('@')[0].split(':')[0].replace(/\D/g, '')
}

/** A resposta de quem não respondeu. As duas pontes caem aqui do mesmo jeito. */
export function foraDoAr(estado: Estado = 'indisponivel'): Conexao {
  return { estado, numero: null, perfil: null, foto: null }
}

// ---------------------------------------------------------------------------
// O webhook está apontado para cá?
//
// ── A TERCEIRA CONDIÇÃO ────────────────────────────────────────────────────
//
// Atender depende de três coisas: o agente ligado, o WhatsApp conectado e o
// webhook apontado para esta função. O card da Secretária aprendeu a segunda
// depois de 01/09 — antes disso afirmou "está atendendo" por horas com a ponte
// fora do ar.
//
// A terceira era o mesmo buraco. Com a sessão de pé e o webhook desligado, o
// card diz **"Conectado"**, em verde, e o paciente recebe silêncio: nada chega
// no banco, nada aparece em Conversas, a Letícia nunca fica sabendo. Painel que
// afirma o que não sabe é pior que painel vazio.
// ---------------------------------------------------------------------------

/** O que a ponte respondeu sobre o webhook dela. `null` = não deu para perguntar. */
export interface WebhookLido {
  url: string | null
  ativo: boolean
}

/**
 * - `apontado`     — está avisando esta função. **Nada aparece na tela.**
 * - `outro`        — tem webhook, mas para outro lugar. Para nós é igual a nenhum,
 *                    e é o caso mais provável de quem já usava a instância.
 * - `ausente`      — desligado ou sem URL.
 * - `desconhecido` — não deu para perguntar. A tela **cala a boca**: acusar um
 *                    problema que talvez não exista é o erro que estamos
 *                    tentando não repetir, ao contrário.
 */
export type VeredictoWebhook = 'apontado' | 'outro' | 'ausente' | 'desconhecido'

/**
 * A comparação mora aqui, e não dentro de cada ponte, para haver **uma** regra.
 *
 * Compara só origem e caminho: o segredo viaja na query em quem não aceita
 * cabeçalho customizado (é o caso da uazapi), e duas URLs iguais com querys
 * diferentes continuam sendo o mesmo destino.
 */
export function avaliarWebhook(
  lido: WebhookLido | null,
  nossaUrl: string,
): VeredictoWebhook {
  if (!lido) return 'desconhecido'
  if (!lido.ativo || !lido.url) return 'ausente'
  try {
    const dele = new URL(lido.url)
    const nosso = new URL(nossaUrl)
    const caminho = (u: URL) => u.pathname.replace(/\/+$/, '')
    return dele.origin === nosso.origin && caminho(dele) === caminho(nosso)
      ? 'apontado'
      : 'outro'
  } catch {
    // URL que nem parseia não está apontada para nós.
    return 'outro'
  }
}
