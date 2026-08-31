/**
 * O cérebro da Letícia — recebe do WhatsApp, pensa, responde.
 *
 * Documentação: agente-ia/README.md
 *
 * DUAS ROTAS:
 *   POST /whatsapp          webhook da Evolution (autenticado por WEBHOOK_SEGREDO)
 *   POST /whatsapp/enviar   envio manual do atendente (autenticado pela sessão)
 *
 * PUBLICADA COM `--no-verify-jwt`, igual à `agenda/`: quem chama é a Evolution,
 * que não tem sessão do Supabase. A autenticação é nossa. Reimplantar no padrão
 * derruba o webhook com um 401 que nem chega no nosso código.
 *
 * O WEBHOOK RESPONDE 200 NA HORA e faz o trabalho em segundo plano. A Evolution
 * reenvia o que demora — e reenvio vira mensagem duplicada, ou pior, resposta
 * duplicada. Guardar a mensagem é rápido; pensar não.
 */

import { rpc, selecionar, inserir, atualizar, subirMidia } from '../_shared/db.ts'
import { conversar, transcrever, type MensagemLLM, type Parte } from '../_shared/llm.ts'
import { montarPrompt } from '../_shared/prompt.ts'
import { PROMPT_OFICIAL } from '../_shared/prompt-oficial.ts'
import { FERRAMENTAS, executar, type Contexto } from '../_shared/ferramentas.ts'
import { digitando, enviarTexto, baixarMidia, numeroDoJid } from '../_shared/evolution.ts'

const SEGREDO = Deno.env.get('WEBHOOK_SEGREDO') ?? ''
const URL_SUPABASE = Deno.env.get('SUPABASE_URL')!

/** Quanto esperamos o paciente terminar de escrever. */
const ESPERA_MS = 8_000

/** Teto de idas e voltas com as ferramentas numa mesma resposta. */
const MAX_VOLTAS = 6

/** Quantas mensagens da conversa vão para o modelo. */
const HISTORICO = 30

const FUSO_PADRAO = 'America/Sao_Paulo'

interface Lead {
  id: string
  nome_lead: string | null
  agente_pausado: boolean
}

interface Mensagem {
  id: string
  autor: string
  tipo: string
  conteudo: string | null
  criada_em: string
}

// ---------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------

/**
 * A Evolution chama de servidor para servidor e não liga para CORS. A TELA
 * chama do navegador — e sem estes cabeçalhos o preflight barra antes de a
 * requisição existir, com um erro que não aparece no log da função.
 */
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-segredo',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const url = new URL(req.url)
  const rota = url.pathname.replace(/^\/whatsapp/, '').replace(/\/+$/, '')

  try {
    if (req.method === 'POST' && rota === '/enviar') return await rotaEnviar(req)
    if (req.method === 'GET' && rota === '/prompt-oficial') return await rotaPromptOficial(req)
    if (req.method === 'POST' && (rota === '' || rota === '/')) return await rotaWebhook(req)
    return json({ ok: false, motivo: 'rota_desconhecida' }, 404)
  } catch (e) {
    console.error('erro na entrada:', e)
    return json({ ok: false, motivo: 'erro_interno' }, 500)
  }
})

// ---------------------------------------------------------------------------
// Webhook da Evolution
// ---------------------------------------------------------------------------

async function rotaWebhook(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const enviado = req.headers.get('x-webhook-segredo') ?? url.searchParams.get('segredo') ?? ''
  if (!SEGREDO || enviado !== SEGREDO) {
    return json({ ok: false, motivo: 'nao_autorizado' }, 401)
  }

  const corpo = await req.json().catch(() => null)
  if (!corpo) return json({ ok: true, ignorado: 'corpo_invalido' })

  if (corpo.event && String(corpo.event).toUpperCase().replace(/\./g, '_') !== 'MESSAGES_UPSERT') {
    return json({ ok: true, ignorado: 'outro_evento' })
  }

  const dados = Array.isArray(corpo.data) ? corpo.data[0] : corpo.data
  const chave = dados?.key ?? {}

  // Mensagem que nós mesmos mandamos volta pelo webhook. Sem este corte, a
  // Letícia responderia a si mesma, para sempre.
  if (chave.fromMe) return json({ ok: true, ignorado: 'propria' })

  const jid = String(chave.remoteJid ?? '')
  // Grupo não é atendimento. Newsletter e status, muito menos.
  if (!jid.endsWith('@s.whatsapp.net')) return json({ ok: true, ignorado: 'nao_e_conversa' })

  const whatsapp = numeroDoJid(jid)
  if (!whatsapp) return json({ ok: true, ignorado: 'sem_numero' })

  const conteudo = leConteudo(dados)
  const lead = await acharOuCriarLead(whatsapp, dados?.pushName)

  const criadas = await inserir<{ id: string }>('mensagens_whatsapp', {
    lead_id: lead.id,
    autor: 'paciente',
    tipo: conteudo.tipo,
    conteudo: conteudo.texto,
    id_externo: chave.id ?? null,
    lida: false,
  }, true)

  // Vazio = `id_externo` repetido: a Evolution reenviou. Já tratamos.
  if (!criadas.length) return json({ ok: true, ignorado: 'duplicada' })

  const mensagemId = criadas[0].id

  // A partir daqui é demorado — o webhook não espera.
  const trabalho = processar(lead, whatsapp, mensagemId, conteudo, dados)
  if (typeof (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }).EdgeRuntime
      ?.waitUntil === 'function') {
    ;(globalThis as { EdgeRuntime: { waitUntil(p: Promise<unknown>): void } })
      .EdgeRuntime.waitUntil(trabalho)
  } else {
    trabalho.catch((e) => console.error('processar:', e))
  }

  return json({ ok: true })
}

// ---------------------------------------------------------------------------
// O trabalho pesado
// ---------------------------------------------------------------------------

interface ConteudoRecebido {
  tipo: string
  texto: string | null
  temMidia: boolean
}

async function processar(
  lead: Lead,
  whatsapp: string,
  mensagemId: string,
  conteudo: ConteudoRecebido,
  dados: Record<string, unknown>,
): Promise<void> {
  // ---- Mídia: baixar, guardar e transcrever -------------------------------
  let imagem: Parte | null = null

  if (conteudo.temMidia) {
    const midia = await baixarMidia(dados)
    if (midia) {
      const bytes = Uint8Array.from(atob(midia.base64), (c) => c.charCodeAt(0))
      const extensao = (midia.tipoMime.split('/')[1] ?? 'bin').split(';')[0]
      const caminho = `${lead.id}/${mensagemId}.${extensao}`

      try {
        await subirMidia(caminho, bytes, midia.tipoMime)
        await atualizar('mensagens_whatsapp', `id=eq.${mensagemId}`, { midia_url: caminho })
      } catch (e) {
        console.error('storage:', e)
      }

      if (conteudo.tipo === 'audio') {
        const texto = await transcrever(bytes, midia.tipoMime)
        await atualizar('mensagens_whatsapp', `id=eq.${mensagemId}`, {
          conteudo: texto ?? '[áudio que não consegui entender]',
        })
      } else if (conteudo.tipo === 'imagem') {
        imagem = { tipo: 'imagem', tipoMime: midia.tipoMime, base64: midia.base64 }
      }
    }
  }

  // ---- A espera dos 8 segundos -------------------------------------------
  await new Promise((r) => setTimeout(r, ESPERA_MS))

  // Chegou outra mensagem enquanto esperávamos? Então esta execução some, e a
  // mais nova responde por todas. É o que evita três respostas para "oi",
  // "tudo bem?", "queria saber do clareamento".
  const posteriores = await selecionar<{ id: string }>(
    `mensagens_whatsapp?select=id&lead_id=eq.${lead.id}&autor=eq.paciente` +
    `&id=neq.${mensagemId}&criada_em=gt.${encodeURIComponent(await criadaEm(mensagemId))}&limit=1`,
  )
  if (posteriores.length) return

  // ---- As duas travas ----------------------------------------------------
  const atual = await selecionar<Lead>(
    `crm_clinica?select=id,nome_lead,agente_pausado&id=eq.${lead.id}&limit=1`,
  )
  if (atual[0]?.agente_pausado) return

  const podeResponder = await rpc<boolean | null>('agente_deve_responder', {
    p_whatsapp: whatsapp,
  })
  if (podeResponder !== true) return

  // ---- Pensar ------------------------------------------------------------
  const cfg = await selecionar<{ modelo: string; prompt: string | null }>(
    'configuracoes_agente?select=modelo,prompt&limit=1',
  )
  const clinica = await selecionar<{ fuso_horario: string | null }>(
    'configuracoes_clinica?select=fuso_horario&limit=1',
  )
  const fuso = clinica[0]?.fuso_horario || FUSO_PADRAO

  const sistema = await montarPrompt(cfg[0]?.prompt)
  const mensagens = await montarHistorico(lead.id, imagem)
  const ctx: Contexto = { leadId: lead.id, whatsapp, fuso }

  let resposta = ''
  for (let volta = 0; volta < MAX_VOLTAS; volta++) {
    const r = await conversar({
      modelo: cfg[0]?.modelo ?? 'gpt-4.1-mini',
      sistema,
      mensagens,
      ferramentas: FERRAMENTAS,
    })

    if (!r.chamadas.length) {
      resposta = r.texto
      break
    }

    mensagens.push({ papel: 'assistant', conteudo: r.texto, chamadas: r.chamadas })
    for (const c of r.chamadas) {
      const saida = await executar(c.nome, c.argumentos, ctx)
      mensagens.push({
        papel: 'ferramenta',
        chamadaId: c.id,
        conteudo: JSON.stringify(saida),
      })
    }
  }

  if (!resposta.trim()) return

  // ---- Falar -------------------------------------------------------------
  // O prompt pede 2 ou 3 mensagens curtas separadas por linha em branco. Aqui
  // elas viram mensagens de verdade — uma pessoa não manda um bloco só.
  const partes = resposta.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean).slice(0, 4)

  for (const parte of partes) {
    // Uns 45 caracteres por segundo, entre 1,2s e 5s. Resposta instantânea é a
    // coisa que mais denuncia que não tem gente do outro lado.
    const pausa = Math.min(5000, Math.max(1200, parte.length * 22))
    await digitando(whatsapp, pausa)
    await new Promise((r) => setTimeout(r, pausa))

    let idExterno: string | null = null
    try {
      idExterno = await enviarTexto(whatsapp, parte)
    } catch (e) {
      console.error('envio:', e)
      break
    }

    await inserir('mensagens_whatsapp', {
      lead_id: lead.id,
      autor: 'agente',
      tipo: 'texto',
      conteudo: parte,
      id_externo: idExterno,
      lida: true,
    }, true)
  }

  // O lead saiu de "chegou" para "está conversando". Só avança daí — quem
  // passou de `conversando` já foi movido por outra coisa (agendou, cancelou),
  // e voltar seria mentir para o Kanban.
  try {
    await atualizar(
      'crm_clinica',
      `id=eq.${lead.id}&status=eq.iniciou_conversa`,
      { status: 'conversando' },
    )
  } catch (e) {
    console.error('status:', e)
  }
}

// ---------------------------------------------------------------------------
// O prompt oficial, para a aba "Agente de IA" mostrar e deixar editar
//
// Ele mora embutido na função (gerado de agente-ia/prompt.md), e a tela não
// enxerga o repositório. Sem esta rota, o botão "carregar o oficial" teria que
// guardar uma segunda cópia do texto no front — e as duas divergiriam.
// ---------------------------------------------------------------------------

async function rotaPromptOficial(req: Request): Promise<Response> {
  const usuario = await usuarioDaSessao(req)
  if (!usuario) return json({ ok: false, motivo: 'sem_sessao' }, 401)
  return json({ ok: true, prompt: PROMPT_OFICIAL })
}

// ---------------------------------------------------------------------------
// Envio manual, pelo atendente que assumiu a conversa
// ---------------------------------------------------------------------------

/** Confere a sessão do usuário. A função sobe com `--no-verify-jwt`. */
async function usuarioDaSessao(req: Request): Promise<{ id: string } | null> {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token) return null
  const r = await fetch(`${URL_SUPABASE}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    },
  })
  if (!r.ok) return null
  return await r.json()
}

async function rotaEnviar(req: Request): Promise<Response> {
  const usuario = await usuarioDaSessao(req)
  if (!usuario) return json({ ok: false, motivo: 'sem_sessao' }, 401)

  const corpo = await req.json().catch(() => ({}))
  const leadId = String(corpo.lead_id ?? '')
  const texto = String(corpo.texto ?? '').trim()
  if (!leadId || !texto) return json({ ok: false, motivo: 'dados_invalidos' }, 400)

  const leads = await selecionar<{ whatsapp_lead: string | null }>(
    `crm_clinica?select=whatsapp_lead&id=eq.${leadId}&limit=1`,
  )
  const whatsapp = leads[0]?.whatsapp_lead
  if (!whatsapp) return json({ ok: false, motivo: 'lead_sem_whatsapp' }, 400)

  const idExterno = await enviarTexto(whatsapp, texto)

  await inserir('mensagens_whatsapp', {
    lead_id: leadId,
    autor: 'atendente',
    tipo: 'texto',
    conteudo: texto,
    id_externo: idExterno,
    enviada_por: usuario?.id ?? null,
    lida: true,
  }, true)

  return json({ ok: true })
}

// ---------------------------------------------------------------------------
// Apoio
// ---------------------------------------------------------------------------

/** Descobre o que veio na mensagem, seja qual for o tipo. */
function leConteudo(dados: Record<string, unknown>): ConteudoRecebido {
  const m = (dados?.message ?? {}) as Record<string, Record<string, unknown>>

  const texto = (m.conversation as unknown as string) ??
    (m.extendedTextMessage?.text as string) ??
    (m.imageMessage?.caption as string) ??
    (m.videoMessage?.caption as string) ?? null

  if (m.audioMessage) return { tipo: 'audio', texto: null, temMidia: true }
  if (m.imageMessage) return { tipo: 'imagem', texto: texto ?? null, temMidia: true }
  if (m.videoMessage) return { tipo: 'video', texto: texto ?? null, temMidia: false }
  if (m.documentMessage) return { tipo: 'documento', texto: texto ?? null, temMidia: false }

  return { tipo: 'texto', texto: texto ?? null, temMidia: false }
}

async function criadaEm(mensagemId: string): Promise<string> {
  const linhas = await selecionar<{ criada_em: string }>(
    `mensagens_whatsapp?select=criada_em&id=eq.${mensagemId}&limit=1`,
  )
  return linhas[0]?.criada_em ?? new Date(0).toISOString()
}

async function acharOuCriarLead(whatsapp: string, nome?: string): Promise<Lead> {
  const achados = await selecionar<Lead>(
    `crm_clinica?select=id,nome_lead,agente_pausado&whatsapp_lead=eq.${whatsapp}&limit=1`,
  )
  if (achados.length) return achados[0]

  const criados = await inserir<Lead>('crm_clinica', {
    whatsapp_lead: whatsapp,
    nome_lead: nome?.trim() || null,
    status: 'iniciou_conversa',
  }, true)
  if (criados.length) return criados[0]

  // Corrida: outra execução criou entre o select e o insert.
  const denovo = await selecionar<Lead>(
    `crm_clinica?select=id,nome_lead,agente_pausado&whatsapp_lead=eq.${whatsapp}&limit=1`,
  )
  return denovo[0]
}

/**
 * A conversa como o modelo vê.
 *
 * A foto acompanha só a mensagem ATUAL. Fotos antigas viram "[foto enviada]" —
 * reenviar imagem a cada volta multiplicaria o custo sem mudar a resposta.
 */
async function montarHistorico(leadId: string, imagem: Parte | null): Promise<MensagemLLM[]> {
  const linhas = await selecionar<Mensagem>(
    `mensagens_whatsapp?select=id,autor,tipo,conteudo,criada_em&lead_id=eq.${leadId}` +
    `&order=criada_em.desc&limit=${HISTORICO}`,
  )
  linhas.reverse()

  const saida: MensagemLLM[] = []
  linhas.forEach((l, i) => {
    const ultima = i === linhas.length - 1
    const rotulo = l.tipo === 'audio'
      ? (l.conteudo ?? '[áudio]')
      : l.tipo === 'imagem'
      ? (l.conteudo ? `[foto enviada] ${l.conteudo}` : '[foto enviada]')
      : l.tipo === 'video'
      ? '[vídeo enviado]'
      : l.tipo === 'documento'
      ? '[documento enviado]'
      : (l.conteudo ?? '')

    if (!rotulo.trim()) return

    if (l.autor === 'paciente') {
      if (ultima && imagem) {
        saida.push({ papel: 'user', conteudo: [{ tipo: 'texto', texto: rotulo }, imagem] })
      } else {
        saida.push({ papel: 'user', conteudo: rotulo })
      }
    } else {
      // O que o atendente humano escreveu entra como fala da própria Letícia:
      // para o paciente foi a mesma pessoa, e ela precisa saber o que "disse".
      saida.push({ papel: 'assistant', conteudo: rotulo })
    }
  })

  return saida.length ? saida : [{ papel: 'user', conteudo: 'oi' }]
}

function json(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
