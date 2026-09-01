/**
 * Evolution API — a ponte com o WhatsApp.
 *
 * ⚠️ ESCRITO PARA A **v2** (confirmado 2.3.7 na instância da clínica).
 * A v1 usa outros formatos de corpo — `{ textMessage: { text } }` em vez de
 * `{ text }`, por exemplo. Trocar a versão do servidor quebra este arquivo.
 */

const URL_BASE = (Deno.env.get('EVOLUTION_API_URL') ?? '').replace(/\/+$/, '')
const CHAVE = Deno.env.get('EVOLUTION_API_KEY') ?? ''
const INSTANCIA = Deno.env.get('EVOLUTION_INSTANCIA') ?? ''

const CABECALHOS = {
  apikey: CHAVE,
  'Content-Type': 'application/json',
}

async function chamar<T>(caminho: string, corpo: Record<string, unknown>): Promise<T> {
  const r = await fetch(`${URL_BASE}/${caminho}/${INSTANCIA}`, {
    method: 'POST',
    headers: CABECALHOS,
    body: JSON.stringify(corpo),
  })
  if (!r.ok) throw new Error(`evolution ${caminho}: ${r.status} ${await r.text()}`)
  return await r.json() as T
}

/**
 * "digitando…" no topo da conversa do paciente.
 *
 * Não é enfeite: sem isso a resposta aparece instantânea, e resposta
 * instantânea é a coisa que mais denuncia que não tem gente do outro lado.
 */
export async function digitando(numero: string, ms: number): Promise<void> {
  try {
    await chamar('chat/sendPresence', { number: numero, delay: ms, presence: 'composing' })
  } catch {
    // Presença é cosmética. Se falhar, a mensagem ainda tem que sair.
  }
}

/** Manda uma mensagem de texto. */
export async function enviarTexto(numero: string, texto: string): Promise<string | null> {
  const r = await chamar<{ key?: { id?: string } }>('message/sendText', {
    number: numero,
    text: texto,
  })
  return r?.key?.id ?? null
}

/**
 * Baixa o áudio ou a foto que o paciente mandou.
 *
 * A instância está com `webhookBase64: false`, então a mídia NÃO vem junto do
 * webhook — só a referência. Este é o segundo passo que busca o arquivo.
 */
export async function baixarMidia(
  mensagem: Record<string, unknown>,
): Promise<{ base64: string; tipoMime: string } | null> {
  try {
    const r = await chamar<{ base64?: string; mimetype?: string }>(
      'chat/getBase64FromMediaMessage',
      { message: mensagem, convertToMp4: false },
    )
    if (!r?.base64) return null
    return { base64: r.base64, tipoMime: r.mimetype ?? 'application/octet-stream' }
  } catch {
    return null
  }
}

/** `5511987654321@s.whatsapp.net` → `5511987654321`. */
export function numeroDoJid(jid: string): string {
  return (jid ?? '').split('@')[0].split(':')[0].replace(/\D/g, '')
}

/**
 * A foto de perfil do WhatsApp da pessoa.
 *
 * NÃO GUARDAMOS ESSA FOTO. A URL que a Evolution devolve é do CDN do WhatsApp
 * e expira; e a foto é da pessoa, não da clínica — copiar para o nosso Storage
 * seria guardar retrato de paciente sem ninguém ter pedido.
 *
 * Devolve `null` com frequência, e isso é normal: muita gente esconde a foto
 * nas configurações de privacidade. Quem chama precisa ter um plano B.
 */
export async function fotoDoPerfil(numero: string): Promise<string | null> {
  try {
    const r = await chamar<{ profilePictureUrl?: string | null }>(
      'chat/fetchProfilePictureUrl',
      { number: numero },
    )
    return r?.profilePictureUrl ?? null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// A conexão em si: está de pé? reconectar? desconectar?
//
// Estas quatro funções não são usadas para conversar — são para a tela
// "Conexão do WhatsApp", em Secretária de IA.
//
// ⚠️ TIMEOUT CURTO, E É O PONTO PRINCIPAL DAQUI. Quando o servidor da Evolution
// cai, um `fetch` sem prazo fica pendurado mais de 20 segundos. A tela consulta
// a cada 30s, então sem isso ela viveria travada em "verificando…" justamente
// no momento em que precisa avisar que caiu.
// ---------------------------------------------------------------------------

/** Prazo para o servidor responder. Passou disso, tratamos como fora do ar. */
const PRAZO_MS = 8_000

/**
 * `desconectado` e `indisponivel` são coisas MUITO diferentes, e a tela precisa
 * dos dois nomes:
 *
 * - `desconectado` — o servidor respondeu, mas a sessão do WhatsApp caiu.
 *   Resolve reconectando por aqui, com código de pareamento.
 * - `indisponivel` — o servidor não respondeu. Não adianta botão nenhum nesta
 *   tela: quem tem que subir é a máquina, no painel da hospedagem.
 *
 * Foi exatamente a segunda situação que aconteceu em 01/09, e o único sintoma
 * era silêncio no WhatsApp.
 */
export type Estado = 'conectado' | 'conectando' | 'desconectado' | 'indisponivel'

export interface Conexao {
  estado: Estado
  numero: string | null
  perfil: string | null
  foto: string | null
}

async function buscar<T>(caminho: string, metodo = 'GET'): Promise<T | null> {
  try {
    const r = await fetch(`${URL_BASE}/${caminho}`, {
      method: metodo,
      headers: CABECALHOS,
      signal: AbortSignal.timeout(PRAZO_MS),
    })
    if (!r.ok) return null
    return await r.json() as T
  } catch {
    // Timeout, DNS, recusa de conexão: para quem chama, é tudo "não respondeu".
    return null
  }
}

interface InstanciaBruta {
  name?: string
  instanceName?: string
  connectionStatus?: string
  state?: string
  ownerJid?: string
  profileName?: string
  profilePicUrl?: string
  instance?: InstanciaBruta
}

/**
 * Quem está conectado, e como.
 *
 * Usa `fetchInstances` em vez de `connectionState` porque devolve o estado E o
 * perfil numa ida só — e a tela mostra os dois juntos. Duas chamadas custariam
 * o dobro do prazo justo quando o servidor está lento.
 */
export async function estadoDaConexao(): Promise<Conexao> {
  const lista = await buscar<InstanciaBruta[] | InstanciaBruta>('instance/fetchInstances')
  if (lista === null) {
    return { estado: 'indisponivel', numero: null, perfil: null, foto: null }
  }

  const todas = (Array.isArray(lista) ? lista : [lista]).map((i) => i.instance ?? i)
  const nossa = todas.find((i) => (i.name ?? i.instanceName) === INSTANCIA)

  if (!nossa) {
    // Servidor de pé, mas a instância não existe mais lá dentro.
    return { estado: 'desconectado', numero: null, perfil: null, foto: null }
  }

  const bruto = (nossa.connectionStatus ?? nossa.state ?? '').toLowerCase()
  const estado: Estado =
    bruto === 'open' ? 'conectado' : bruto === 'connecting' ? 'conectando' : 'desconectado'

  return {
    estado,
    numero: nossa.ownerJid ? numeroDoJid(nossa.ownerJid) : null,
    perfil: nossa.profileName ?? null,
    foto: nossa.profilePicUrl ?? null,
  }
}

/**
 * Começa uma conexão nova e devolve o que o usuário precisa digitar ou ler.
 *
 * Com o número em mãos, a Evolution devolve um **código de pareamento** de 8
 * dígitos, e é o que preferimos: quem está no computador digita o código no
 * celular. QR num monitor obriga a pessoa a apontar a câmera para a tela, o que
 * é desconfortável e falha com brilho baixo.
 *
 * O QR volta junto como reserva — nem toda conta aceita pareamento por código.
 */
export async function iniciarConexao(
  numero?: string,
): Promise<{ codigo: string | null; qr: string | null } | null> {
  const limpo = (numero ?? '').replace(/\D/g, '')
  const r = await buscar<{ pairingCode?: string; code?: string; base64?: string }>(
    `instance/connect/${INSTANCIA}${limpo ? `?number=${limpo}` : ''}`,
  )
  if (!r) return null

  // `code` é o QR em texto; `base64` é o mesmo QR já em imagem. O pareamento
  // vem em `pairingCode`, e só quando mandamos o número.
  return { codigo: r.pairingCode ?? null, qr: r.base64 ?? r.code ?? null }
}

/**
 * Encerra a sessão do WhatsApp.
 *
 * É `logout`, e NÃO `delete`: logout derruba a sessão e deixa a instância de
 * pé, pronta para parear de novo. `delete` apagaria a instância e o histórico
 * junto — e não há botão nesta tela que justifique esse estrago.
 */
export async function desconectar(): Promise<boolean> {
  return await buscar<unknown>(`instance/logout/${INSTANCIA}`, 'DELETE') !== null
}

/**
 * Como esta ponte está configurada — para a tela mostrar.
 *
 * Responde três perguntas que só aparecem quando algo quebra: **em qual painel
 * entrar** (servidor), **qual das instâncias é a nossa** (instância) e **se a
 * chave configurada é a que se pensa que é** (os quatro últimos caracteres).
 *
 * ⚠️ QUATRO CARACTERES, E NUNCA MAIS. É o padrão de cartão, AWS e Stripe, e
 * pela mesma razão: quatro de trinta e poucos servem para **identificar**, não
 * para usar. A chave inteira nunca sai daqui — quem a tem manda mensagem pelo
 * WhatsApp da clínica.
 *
 * O endereço, ao contrário, não é segredo: o que protege a API é a chave, não o
 * host ser desconhecido. Vai inteiro, porque um pedaço cortado não serviria
 * para copiar no navegador.
 */
export function identificacao(): {
  servidor: string | null
  instancia: string | null
  chaveFinal: string | null
} {
  return {
    servidor: URL_BASE ? URL_BASE.replace(/^https?:\/\//i, '') : null,
    instancia: INSTANCIA || null,
    chaveFinal: CHAVE.length >= 4 ? CHAVE.slice(-4) : null,
  }
}
