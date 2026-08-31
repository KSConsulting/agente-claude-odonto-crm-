/**
 * Uma porta só para dois fornecedores de IA.
 *
 * É este arquivo que permite trocar de modelo na aba "Agente de IA" sem tocar
 * em mais nada: o resto do sistema fala em `conversar()` e não sabe — nem
 * precisa saber — se atrás está a OpenAI ou a Anthropic.
 *
 * ACRESCENTAR UM MODELO exige três lugares: o tipo `ModeloAgente`
 * (src/types/index.ts), a lista da tela, e o `conversar()` daqui. Nada
 * sincroniza isso sozinho.
 */

const CHAVE_OPENAI = Deno.env.get('OPENAI_API_KEY') ?? ''
const CHAVE_ANTHROPIC = Deno.env.get('ANTHROPIC_API_KEY') ?? ''

// ---------------------------------------------------------------------------
// O vocabulário comum
// ---------------------------------------------------------------------------

export interface ParteTexto {
  tipo: 'texto'
  texto: string
}

export interface ParteImagem {
  tipo: 'imagem'
  tipoMime: string
  base64: string
}

export type Parte = ParteTexto | ParteImagem

export interface ChamadaFerramenta {
  id: string
  nome: string
  argumentos: Record<string, unknown>
}

export interface MensagemLLM {
  papel: 'user' | 'assistant' | 'ferramenta'
  /** Texto simples, ou partes quando houver imagem. */
  conteudo: string | Parte[]
  /** Só em `assistant`: o que ele pediu para executar. */
  chamadas?: ChamadaFerramenta[]
  /** Só em `ferramenta`: a qual chamada este resultado responde. */
  chamadaId?: string
}

export interface DefinicaoFerramenta {
  nome: string
  descricao: string
  /** JSON Schema dos argumentos. */
  parametros: Record<string, unknown>
}

export interface RespostaLLM {
  texto: string
  chamadas: ChamadaFerramenta[]
}

export interface PedidoLLM {
  modelo: string
  sistema: string
  mensagens: MensagemLLM[]
  ferramentas: DefinicaoFerramenta[]
  maxTokens?: number
}

export function ehAnthropic(modelo: string): boolean {
  return modelo.startsWith('claude-')
}

/** Despacha para o fornecedor certo. */
export function conversar(pedido: PedidoLLM): Promise<RespostaLLM> {
  return ehAnthropic(pedido.modelo) ? viaAnthropic(pedido) : viaOpenAI(pedido)
}

// ---------------------------------------------------------------------------
// OpenAI — /v1/chat/completions
// ---------------------------------------------------------------------------

function conteudoOpenAI(conteudo: string | Parte[]): unknown {
  if (typeof conteudo === 'string') return conteudo
  return conteudo.map((p) =>
    p.tipo === 'texto'
      ? { type: 'text', text: p.texto }
      : { type: 'image_url', image_url: { url: `data:${p.tipoMime};base64,${p.base64}` } }
  )
}

async function viaOpenAI(pedido: PedidoLLM): Promise<RespostaLLM> {
  if (!CHAVE_OPENAI) throw new Error('OPENAI_API_KEY ausente')

  const mensagens: Record<string, unknown>[] = [
    { role: 'system', content: pedido.sistema },
  ]

  for (const m of pedido.mensagens) {
    if (m.papel === 'ferramenta') {
      mensagens.push({
        role: 'tool',
        tool_call_id: m.chamadaId,
        content: typeof m.conteudo === 'string' ? m.conteudo : JSON.stringify(m.conteudo),
      })
    } else if (m.papel === 'assistant') {
      mensagens.push({
        role: 'assistant',
        content: typeof m.conteudo === 'string' ? m.conteudo : null,
        ...(m.chamadas?.length
          ? {
              tool_calls: m.chamadas.map((c) => ({
                id: c.id,
                type: 'function',
                function: { name: c.nome, arguments: JSON.stringify(c.argumentos) },
              })),
            }
          : {}),
      })
    } else {
      mensagens.push({ role: 'user', content: conteudoOpenAI(m.conteudo) })
    }
  }

  const corpo: Record<string, unknown> = {
    model: pedido.modelo,
    max_tokens: pedido.maxTokens ?? 1024,
    messages: mensagens,
  }
  if (pedido.ferramentas.length) {
    corpo.tools = pedido.ferramentas.map((f) => ({
      type: 'function',
      function: { name: f.nome, description: f.descricao, parameters: f.parametros },
    }))
  }

  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${CHAVE_OPENAI}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(corpo),
  })
  if (!r.ok) throw new Error(`openai: ${r.status} ${await r.text()}`)

  const dados = await r.json()
  const msg = dados?.choices?.[0]?.message ?? {}

  return {
    texto: typeof msg.content === 'string' ? msg.content : '',
    chamadas: (msg.tool_calls ?? []).map((c: Record<string, never>) => ({
      id: (c as { id: string }).id,
      nome: (c as { function: { name: string } }).function.name,
      // SEMPRE com JSON.parse: o escape do argumento varia por modelo, e
      // comparar string crua quebra em acento e em barra.
      argumentos: comoObjeto((c as { function: { arguments: string } }).function.arguments),
    })),
  }
}

// ---------------------------------------------------------------------------
// Anthropic — /v1/messages
// ---------------------------------------------------------------------------

function conteudoAnthropic(conteudo: string | Parte[]): unknown {
  if (typeof conteudo === 'string') return conteudo
  return conteudo.map((p) =>
    p.tipo === 'texto'
      ? { type: 'text', text: p.texto }
      : {
          type: 'image',
          source: { type: 'base64', media_type: p.tipoMime, data: p.base64 },
        }
  )
}

async function viaAnthropic(pedido: PedidoLLM): Promise<RespostaLLM> {
  if (!CHAVE_ANTHROPIC) throw new Error('ANTHROPIC_API_KEY ausente')

  const mensagens: Record<string, unknown>[] = []

  for (const m of pedido.mensagens) {
    if (m.papel === 'ferramenta') {
      mensagens.push({
        role: 'user',
        content: [{
          type: 'tool_result',
          tool_use_id: m.chamadaId,
          content: typeof m.conteudo === 'string' ? m.conteudo : JSON.stringify(m.conteudo),
        }],
      })
    } else if (m.papel === 'assistant') {
      const blocos: Record<string, unknown>[] = []
      if (typeof m.conteudo === 'string' && m.conteudo) {
        blocos.push({ type: 'text', text: m.conteudo })
      }
      for (const c of m.chamadas ?? []) {
        blocos.push({ type: 'tool_use', id: c.id, name: c.nome, input: c.argumentos })
      }
      if (blocos.length) mensagens.push({ role: 'assistant', content: blocos })
    } else {
      mensagens.push({ role: 'user', content: conteudoAnthropic(m.conteudo) })
    }
  }

  const corpo: Record<string, unknown> = {
    model: pedido.modelo,
    max_tokens: pedido.maxTokens ?? 1024,
    // O prompt do sistema é grande e estável: os dados da clínica, os
    // procedimentos e os dentistas se repetem em toda mensagem. Em cache, o
    // trecho custa por volta de 10% a partir da segunda chamada.
    system: [{ type: 'text', text: pedido.sistema, cache_control: { type: 'ephemeral' } }],
    messages: mensagens,
    // Conversa de WhatsApp é curta e o paciente está esperando. Esforço baixo
    // responde mais rápido e mais barato, sem perda visível aqui.
    output_config: { effort: 'low' },
  }
  if (pedido.ferramentas.length) {
    corpo.tools = pedido.ferramentas.map((f) => ({
      name: f.nome,
      description: f.descricao,
      input_schema: f.parametros,
    }))
  }

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': CHAVE_ANTHROPIC,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(corpo),
  })
  if (!r.ok) throw new Error(`anthropic: ${r.status} ${await r.text()}`)

  const dados = await r.json()
  const blocos: Record<string, unknown>[] = dados?.content ?? []

  return {
    texto: blocos
      .filter((b) => b.type === 'text')
      .map((b) => (b as { text: string }).text)
      .join('\n')
      .trim(),
    chamadas: blocos
      .filter((b) => b.type === 'tool_use')
      .map((b) => {
        const t = b as { id: string; name: string; input: Record<string, unknown> }
        return { id: t.id, nome: t.name, argumentos: t.input ?? {} }
      }),
  }
}

// ---------------------------------------------------------------------------
// Transcrição de áudio — sempre pela OpenAI
// ---------------------------------------------------------------------------

/**
 * Transcreve o áudio do paciente.
 *
 * Usa a chave da OpenAI **mesmo quando o modelo de conversa é o Claude**:
 * nenhum dos dois aceita áudio cru na API de mensagens, então a transcrição é
 * um passo separado de qualquer jeito.
 */
export async function transcrever(bytes: Uint8Array, tipoMime: string): Promise<string | null> {
  if (!CHAVE_OPENAI) return null

  const extensao = tipoMime.includes('mp4') || tipoMime.includes('m4a') ? 'm4a' : 'ogg'
  const formulario = new FormData()
  formulario.append('file', new Blob([bytes], { type: tipoMime }), `audio.${extensao}`)
  formulario.append('model', 'whisper-1')
  formulario.append('language', 'pt')

  try {
    const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${CHAVE_OPENAI}` },
      body: formulario,
    })
    if (!r.ok) return null
    const dados = await r.json()
    const texto = (dados?.text ?? '').trim()
    return texto || null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------

function comoObjeto(bruto: string): Record<string, unknown> {
  try {
    const v = JSON.parse(bruto || '{}')
    return v && typeof v === 'object' ? v as Record<string, unknown> : {}
  } catch {
    return {}
  }
}
