/**
 * API da Agenda — consumida pelo Agente de IA via n8n (nó HTTP).
 *
 * Contrato: API_AGENTE.md, na raiz do repositório.
 *
 * Esta camada é fina de propósito. As regras de negócio moram em funções SQL
 * (migração 0004), onde são atômicas e onde o fuso horário funciona de verdade.
 * Aqui só acontecem três coisas: conferir o token, chamar a função certa e
 * montar a frase que o paciente vai ouvir.
 *
 * PRINCÍPIO DAS RESPOSTAS: quem lê isto vai FALAR com alguém no WhatsApp. Toda
 * resposta traz `mensagem`, uma frase pronta — inclusive as falhas técnicas, com
 * texto neutro. Sem isso o agente improvisa, ou repassa detalhe técnico para o
 * paciente. O código do problema fica em `motivo`, que nunca sai da máquina.
 *
 * SEM DEPENDÊNCIA NENHUMA, DE PROPÓSITO: este runtime sobe com `--no-remote` e
 * recusa buscar qualquer módulo externo no boot — inclusive o `supabase-js`. A
 * função falha inteira com BOOT_ERROR antes de rodar uma linha. Como tudo que
 * precisamos é falar com o PostgREST, `fetch` resolve e não há o que quebrar.
 */

const URL_BASE = Deno.env.get('SUPABASE_URL')!
const CHAVE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const CABECALHOS = {
  apikey: CHAVE,
  Authorization: `Bearer ${CHAVE}`,
  'Content-Type': 'application/json',
}

/** Chama uma função SQL. Retorna array (funções TABLE) ou escalar. */
async function rpc<T>(nome: string, args: Record<string, unknown>): Promise<T> {
  const r = await fetch(`${URL_BASE}/rest/v1/rpc/${nome}`, {
    method: 'POST', headers: CABECALHOS, body: JSON.stringify(args),
  })
  if (!r.ok) throw new Error(`rpc ${nome}: ${r.status} ${await r.text()}`)
  return await r.json() as T
}

/** Leitura direta de tabela. O caminho já vem com os filtros do PostgREST. */
async function selecionar<T>(caminho: string): Promise<T[]> {
  const r = await fetch(`${URL_BASE}/rest/v1/${caminho}`, { headers: CABECALHOS })
  if (!r.ok) throw new Error(`select ${caminho}: ${r.status} ${await r.text()}`)
  return await r.json() as T[]
}

const FUSO_PADRAO = 'America/Sao_Paulo'

const MENSAGEM_GENERICA = 'Não consegui acessar a agenda agora. Só um instante, por favor.'

/** Frase falável para cada recusa. O `motivo` é para a máquina; isto, para o ouvido. */
const FRASES: Record<string, string> = {
  horario_ocupado: 'Esse horário já está ocupado.',
  sem_profissional_livre: 'Não tenho nenhum profissional livre nesse horário.',
  fora_expediente: 'Nesse dia e horário a clínica não atende.',
  profissional_inexistente: 'Não encontrei esse profissional.',
  whatsapp_invalido: 'Preciso de um número de WhatsApp válido, com o código do país.',
  dados_invalidos: 'Faltou alguma informação para eu concluir.',
  data_invalida: 'Não entendi a data.',
  nao_encontrada: 'Não encontrei essa consulta.',
  nao_pertence: 'Essa consulta não é desse número de WhatsApp.',
  ja_cancelada: 'Essa consulta já estava cancelada.',
  nao_cancelavel: 'Essa consulta já foi realizada e não pode ser cancelada.',
  paciente_nao_encontrado: 'Não encontrei nenhum cadastro com esse número.',
  token_invalido: MENSAGEM_GENERICA,
  token_ausente: MENSAGEM_GENERICA,
  metodo_invalido: MENSAGEM_GENERICA,
  rota_invalida: MENSAGEM_GENERICA,
  corpo_invalido: 'Faltou alguma informação para eu concluir.',
  erro_interno: MENSAGEM_GENERICA,

  // As duas recusas de NEGÓCIO das migrações 0018 e 0023. Sem elas aqui, o
  // `?? MENSAGEM_GENERICA` respondia "não consegui acessar a agenda agora" —
  // a frase de servidor fora do ar — para quem só tinha escrito o nome de um
  // procedimento fora do catálogo. Manda procurar defeito na máquina, e o
  // defeito está no pedido.
  //
  // A Letícia nunca caiu nisso: ela tem frase própria em `ferramentas.ts`.
  // Foi a porta de fora que ficou para trás quando as regras entraram.
  procedimento_desconhecido:
    'Esse procedimento não está no catálogo da clínica. '
    + 'Confira os nomes exatos em GET /procedimentos.',
  exige_avaliacao:
    'Esse tratamento passa antes por uma consulta de avaliação. '
    + 'Marque a avaliação primeiro.',
}

/* ──────────────────────────────────────────────
   Datas

   ⚠️ CÓPIA. As duas funções abaixo existem também em
   `supabase/functions/_shared/tempo.ts`, palavra por palavra, porque a
   Letícia precisa exatamente da mesma conversão antes de chamar as mesmas
   funções SQL. Esta função aqui está publicada SEM NENHUM IMPORT, de
   propósito (o runtime sobe com `--no-remote`), e trocar isso arriscaria os
   sete endpoints por uma dedução não testada.

   **Mudou a regra aqui, mude lá.** Se divergirem, as duas portas passam a
   marcar em horas diferentes — e foi justamente a falta desta conversão do
   outro lado que gravou consulta três horas mais cedo em produção.
────────────────────────────────────────────── */

/** Deslocamento do fuso, em minutos, no instante dado. Cobre horário de verão. */
function offsetDoFuso(instante: Date, fuso: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: fuso, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const p = Object.fromEntries(dtf.formatToParts(instante).map((x) => [x.type, x.value]))
  const comoSeFosseUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second)
  return (comoSeFosseUtc - instante.getTime()) / 60000
}

/**
 * Texto → instante absoluto.
 *
 * Aceita '2026-05-15T09:00' (sem fuso, interpretado no fuso da clínica) e
 * '2026-05-15T09:00:00-03:00'. O primeiro caso é o que o agente costuma mandar,
 * e tratá-lo como UTC deslocaria toda consulta em três horas — silenciosamente.
 */
function paraInstante(texto: string, fuso: string): Date | null {
  if (!texto) return null
  if (/([zZ]|[+-]\d{2}:?\d{2})$/.test(texto)) {
    const d = new Date(texto)
    return isNaN(d.getTime()) ? null : d
  }
  const m = texto.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/)
  if (!m) return null
  const [, y, mo, d, h, mi] = m
  const provisorio = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi))
  const off = offsetDoFuso(provisorio, fuso)
  return new Date(provisorio.getTime() - off * 60000)
}

function hora(iso: string, fuso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: fuso, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(iso))
}

/** 'quinta, 15/05/2026' */
function dataPorExtenso(iso: string, fuso: string): string {
  const d = new Date(iso)
  const semana = new Intl.DateTimeFormat('pt-BR', { timeZone: fuso, weekday: 'long' }).format(d)
  const curta = new Intl.DateTimeFormat('pt-BR', {
    timeZone: fuso, day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(d)
  return `${semana.replace('-feira', '')}, ${curta}`
}

/** '09:00, 10:30 e 14:00' */
function listarHoras(horarios: string[], fuso: string): string {
  const hs = horarios.map((h) => hora(h, fuso))
  if (hs.length === 1) return hs[0]
  return `${hs.slice(0, -1).join(', ')} e ${hs[hs.length - 1]}`
}

/* ──────────────────────────────────────────────
   Respostas
────────────────────────────────────────────── */

function json(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
}

function recusa(motivo: string, status = 200, mensagem?: string): Response {
  return json({ ok: false, motivo, mensagem: mensagem ?? FRASES[motivo] ?? MENSAGEM_GENERICA }, status)
}

/** Formato das funções SQL de escrita: marcar, cancelar e remarcar. */
interface Resultado {
  ok: boolean
  motivo: string | null
  consulta_id?: string
  data_hora: string
  profissional: string | null
  /** Só em `exige_avaliacao`: o nome da consulta que precisa vir antes. */
  sugestao?: string | null
}

/* ──────────────────────────────────────────────
   Autenticação
────────────────────────────────────────────── */

async function sha256(texto: string): Promise<string> {
  const bytes = new TextEncoder().encode(texto)
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/* ──────────────────────────────────────────────
   Handler
────────────────────────────────────────────── */

Deno.serve(async (req) => {
  try {
    // ── Token ──────────────────────────────────────────────────────────────
    const chave = req.headers.get('x-api-key') ?? ''
    if (!chave) return recusa('token_ausente', 401)

    const tokenId = await rpc<string | null>('api_token_valido', { p_hash: await sha256(chave) })
    if (!tokenId) return recusa('token_invalido', 401)

    // ── Fuso da clínica ────────────────────────────────────────────────────
    const cfg = await selecionar<{ fuso_horario: string }>('configuracoes_clinica?select=fuso_horario&limit=1')
    const fuso = cfg[0]?.fuso_horario ?? FUSO_PADRAO

    // ── Rota ───────────────────────────────────────────────────────────────
    const rota = new URL(req.url).pathname.split('/').filter(Boolean).pop() ?? ''

    let corpo: Record<string, unknown> = {}
    if (req.method === 'POST') {
      try {
        corpo = await req.json()
      } catch {
        return recusa('corpo_invalido', 400)
      }
    }

    switch (rota) {
      /* ─────────────────────────────────────────────────────────────────── */
      case 'profissionais': {
        if (req.method !== 'GET') return recusa('metodo_invalido', 400)
        const data = await selecionar<{ id: string; nome: string; sobrenome: string }>(
          'profissionais?select=id,nome,sobrenome&ativo=eq.true&order=nome',
        )
        return json({
          ok: true,
          profissionais: data.map((p) => ({
            id: p.id,
            nome: `${p.nome} ${p.sobrenome ?? ''}`.trim(),
          })),
        })
      }

      /* ─────────────────────────────────────────────────────────────────── */
      case 'procedimentos': {
        if (req.method !== 'GET') return recusa('metodo_invalido', 400)
        const data = await selecionar<{ nome: string }>(
          'servicos_clinica?select=nome&ativo=eq.true&order=nome',
        )
        return json({ ok: true, procedimentos: data.map((s) => s.nome) })
      }

      /* ─────────────────────────────────────────────────────────────────── */
      case 'disponibilidade': {
        if (req.method !== 'POST') return recusa('metodo_invalido', 400)
        const data = String(corpo.data ?? '')
        if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return recusa('data_invalida')

        const duracao = Number(corpo.duracao_minutos ?? 60)
        const profissional = (corpo.profissional_id as string) ?? null

        if (profissional) {
          const existe = await selecionar<{ id: string }>(
            `profissionais?select=id&id=eq.${encodeURIComponent(profissional)}&ativo=eq.true&limit=1`,
          )
          if (existe.length === 0) return recusa('profissional_inexistente')
        }

        const slots = await rpc<{ horario: string }[]>('agenda_horarios_disponiveis', {
          p_data: data, p_profissional: profissional, p_duracao: duracao,
        })

        const horarios: string[] = (slots ?? []).map((s) => s.horario)

        // Dia lotado: devolve o próximo com vaga. Sem isso o agente pergunta
        // dia a dia até acertar.
        if (horarios.length === 0) {
          const proxima = await rpc<string | null>('agenda_proxima_vaga', {
            p_a_partir_de: data, p_profissional: profissional, p_duracao: duracao,
          })
          return json({
            ok: true,
            horarios: [],
            proxima_data: proxima ?? null,
            mensagem: proxima
              ? `Não tenho horário em ${dataPorExtenso(`${data}T12:00`, fuso)}. O mais próximo é ${dataPorExtenso(proxima, fuso)}, às ${hora(proxima, fuso)}.`
              : 'Não encontrei horário disponível nos próximos dias.',
          })
        }

        // Com `hora`, responde à pergunta que foi feita e já oferece alternativa.
        if (corpo.hora) {
          const pedido = paraInstante(`${data}T${String(corpo.hora).slice(0, 5)}`, fuso)
          if (!pedido) return recusa('data_invalida')
          const alvo = pedido.toISOString()
          const livre = horarios.some((h) => new Date(h).toISOString() === alvo)
          const outros = horarios.filter((h) => new Date(h).toISOString() !== alvo)
          return json({
            ok: true,
            disponivel: livre,
            horarios,
            mensagem: livre
              ? `${dataPorExtenso(alvo, fuso)} às ${hora(alvo, fuso)} está livre, posso marcar.`
              : outros.length > 0
                ? `${dataPorExtenso(alvo, fuso)} às ${hora(alvo, fuso)} já está ocupado, mas tenho ${listarHoras(outros, fuso)}.`
                : `${dataPorExtenso(alvo, fuso)} às ${hora(alvo, fuso)} já está ocupado e não tenho outro horário nesse dia.`,
          })
        }

        return json({
          ok: true,
          horarios,
          mensagem: `${dataPorExtenso(horarios[0], fuso)}, tenho ${listarHoras(horarios, fuso)}.`,
        })
      }

      /* ─────────────────────────────────────────────────────────────────── */
      case 'marcar': {
        if (req.method !== 'POST') return recusa('metodo_invalido', 400)
        const quando = paraInstante(String(corpo.data_hora ?? ''), fuso)
        if (!quando) return recusa('data_invalida')

        const data = await rpc<Resultado[]>('agenda_marcar', {
          p_nome: corpo.nome ?? null,
          p_whatsapp: corpo.whatsapp ?? '',
          p_procedimento: corpo.procedimento ?? '',
          p_data_hora: quando.toISOString(),
          p_profissional_id: corpo.profissional_id ?? null,
          // Sem duração explícita, vale a do procedimento em servicos_clinica.
          // Quem já mandava um número continua mandando.
          p_duracao: corpo.duracao_minutos ? Number(corpo.duracao_minutos) : null,
          p_chave_externa: corpo.chave_externa ?? null,
          p_interesse: corpo.interesse ?? null,
        })

        const r = data?.[0]

        // A porta de entrada. A frase precisa do NOME da avaliação, que vem do
        // banco — por isso não cabe no mapa fixo de FRASES.
        if (r?.motivo === 'exige_avaliacao') {
          const porta = r.sugestao ?? 'a avaliação'
          return json({
            ok: false,
            motivo: 'exige_avaliacao',
            marque_no_lugar: porta,
            mensagem:
              `Esse tratamento passa antes por uma avaliação com o dentista. ` +
              `Posso marcar ${porta} para você?`,
          })
        }

        if (!r?.ok) return recusa(r?.motivo ?? 'erro_interno')

        const nome = String(corpo.nome ?? '').trim()
        return json({
          ok: true,
          id: r.consulta_id,
          data_hora: r.data_hora,
          profissional: r.profissional,
          mensagem: `${nome ? `${nome}, s` : 'S'}eu agendamento foi marcado com sucesso${r.profissional ? ` com o profissional ${r.profissional}` : ''} para ${dataPorExtenso(r.data_hora, fuso)} às ${hora(r.data_hora, fuso)}.`,
        })
      }

      /* ─────────────────────────────────────────────────────────────────── */
      case 'consultas': {
        if (req.method !== 'POST') return recusa('metodo_invalido', 400)
        const whats = String(corpo.whatsapp ?? '').replace(/\D/g, '')
        if (whats.length < 10) return recusa('whatsapp_invalido')

        const lead = await selecionar<{ id: string }>(
          `crm_clinica_dados?select=id&whatsapp_lead=eq.${whats}&limit=1`,
        )
        if (lead.length === 0) return recusa('paciente_nao_encontrado')

        type Linha = {
          id: string; data_consulta: string; procedimento: string
          profissionais: { nome: string; sobrenome: string } | null
        }
        const data = await selecionar<Linha>(
          'consultas?select=id,data_consulta,procedimento,profissionais(nome,sobrenome)' +
          `&lead_id=eq.${lead[0].id}&status=eq.agendada` +
          `&data_consulta=gte.${encodeURIComponent(new Date().toISOString())}` +
          '&order=data_consulta',
        )

        const consultas = data.map((c) => ({
          id: c.id,
          data_hora: c.data_consulta,
          profissional: c.profissionais
            ? `${c.profissionais.nome} ${c.profissionais.sobrenome ?? ''}`.trim()
            : null,
          procedimento: c.procedimento,
        }))

        if (consultas.length === 0) {
          return json({ ok: true, consultas: [], mensagem: 'Você não tem nenhuma consulta marcada no momento.' })
        }

        const p = consultas[0]
        return json({
          ok: true,
          consultas,
          mensagem: consultas.length === 1
            ? `Você tem consulta em ${dataPorExtenso(p.data_hora, fuso)}, às ${hora(p.data_hora, fuso)}${p.profissional ? `, com ${p.profissional}` : ''}.`
            : `Você tem ${consultas.length} consultas marcadas. A próxima é em ${dataPorExtenso(p.data_hora, fuso)}, às ${hora(p.data_hora, fuso)}${p.profissional ? `, com ${p.profissional}` : ''}.`,
        })
      }

      /* ─────────────────────────────────────────────────────────────────── */
      case 'cancelar': {
        if (req.method !== 'POST') return recusa('metodo_invalido', 400)
        if (!corpo.consulta_id) return recusa('dados_invalidos')

        const data = await rpc<Resultado[]>('agenda_cancelar', {
          p_consulta_id: corpo.consulta_id,
          p_whatsapp: corpo.whatsapp ?? null,
          p_motivo: corpo.motivo ?? null,
        })

        const r = data?.[0]
        if (!r?.ok) return recusa(r?.motivo ?? 'erro_interno')

        return json({
          ok: true,
          data_hora: r.data_hora,
          mensagem: `Sua consulta de ${dataPorExtenso(r.data_hora, fuso)} às ${hora(r.data_hora, fuso)}${r.profissional ? ` com ${r.profissional}` : ''} foi cancelada.`,
        })
      }

      /* ─────────────────────────────────────────────────────────────────── */
      case 'remarcar': {
        if (req.method !== 'POST') return recusa('metodo_invalido', 400)
        if (!corpo.consulta_id) return recusa('dados_invalidos')
        const quando = paraInstante(String(corpo.nova_data_hora ?? ''), fuso)
        if (!quando) return recusa('data_invalida')

        const data = await rpc<Resultado[]>('agenda_remarcar', {
          p_consulta_id: corpo.consulta_id,
          p_nova_data_hora: quando.toISOString(),
          p_profissional_id: corpo.profissional_id ?? null,
          p_whatsapp: corpo.whatsapp ?? null,
        })

        const r = data?.[0]
        if (!r?.ok) return recusa(r?.motivo ?? 'erro_interno')

        return json({
          ok: true,
          data_hora: r.data_hora,
          profissional: r.profissional,
          mensagem: `Sua consulta foi remarcada para ${dataPorExtenso(r.data_hora, fuso)}, às ${hora(r.data_hora, fuso)}${r.profissional ? `, com ${r.profissional}` : ''}.`,
        })
      }

      /* ─────────────────────────────────────────────────────────────────── */
      default:
        return recusa('rota_invalida', 404)
    }
  } catch (e) {
    console.error('erro inesperado:', e)
    return recusa('erro_interno', 500)
  }
})
