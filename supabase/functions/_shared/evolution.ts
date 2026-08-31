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
