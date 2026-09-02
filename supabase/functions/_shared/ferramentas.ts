/**
 * As ferramentas da Letícia.
 *
 * Cada uma chama uma função SQL que JÁ EXISTIA (migração 0004) — a mesma que a
 * API `agenda/` usa. A regra de jornada, a escolha de dentista livre e a trava
 * de horário sobreposto continuam num lugar só.
 *
 * DUAS COISAS QUE O MODELO NÃO PREENCHE, de propósito:
 *
 *   1. O WhatsApp e o id do lead — vêm do contexto da conversa. Se fossem
 *      parâmetro, um dia ele marcaria consulta para um número inventado.
 *   2. O uuid do dentista — o modelo trabalha com NOME, e o código resolve.
 *      Uuid em prompt é convite para alucinação.
 */

import { rpc, selecionar, atualizar } from './db.ts'
import { paraInstante } from './tempo.ts'
import type { DefinicaoFerramenta } from './llm.ts'

export interface Contexto {
  leadId: string
  whatsapp: string
  fuso: string
}

const TEXTO = { type: 'string' }

export const FERRAMENTAS: DefinicaoFerramenta[] = [
  {
    nome: 'ver_horarios_livres',
    descricao:
      'Consulta os horários realmente livres na agenda. Use sempre que o ' +
      'paciente falar de dia, horário ou perguntar se tem vaga. Nunca ' +
      'confirme um horário sem chamar isto antes.',
    parametros: {
      type: 'object',
      properties: {
        data: { type: 'string', description: 'Dia desejado, no formato AAAA-MM-DD.' },
        hora: {
          type: 'string',
          description: 'Hora específica, HH:MM. Só envie se o paciente disse uma hora.',
        },
        dentista: {
          type: 'string',
          description: 'Nome do dentista. Só envie se o paciente pediu alguém específico.',
        },
      },
      required: ['data'],
      additionalProperties: false,
    },
  },
  {
    nome: 'marcar_consulta',
    descricao:
      'Marca a consulta de verdade na agenda. Só chame depois de confirmar o ' +
      'horário com ver_horarios_livres E de ter o nome completo do paciente. ' +
      'A maioria dos tratamentos passa antes pela avaliação — a lista de ' +
      'procedimentos diz quais.',
    parametros: {
      type: 'object',
      properties: {
        nome_completo: TEXTO,
        procedimento: { type: 'string', description: 'O procedimento, como está na lista da clínica.' },
        data_hora: { type: 'string', description: 'AAAA-MM-DDTHH:MM, no horário da clínica.' },
        dentista: {
          type: 'string',
          description: 'Nome do dentista. Deixe vazio para o sistema escolher quem está livre.',
        },
        interesse: {
          type: 'string',
          description:
            'Ao marcar a avaliação, o tratamento que o paciente procura ' +
            '("Lentes de Contato"). É o que o dentista vê na agenda.',
        },
      },
      required: ['nome_completo', 'procedimento', 'data_hora'],
      additionalProperties: false,
    },
  },
  {
    nome: 'ver_minhas_consultas',
    descricao:
      'Lista as consultas já marcadas deste paciente. Use antes de remarcar ' +
      'ou cancelar — é de onde sai o identificador da consulta.',
    parametros: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    nome: 'remarcar_consulta',
    descricao:
      'Muda uma consulta existente para outro dia ou horário. Quando o ' +
      'paciente só tem uma consulta marcada, não precisa do consulta_id.',
    parametros: {
      type: 'object',
      properties: {
        consulta_id: {
          type: 'string',
          description:
            'Só quando ele tiver MAIS DE UMA marcada. Vem de ver_minhas_consultas.',
        },
        nova_data_hora: { type: 'string', description: 'AAAA-MM-DDTHH:MM.' },
      },
      required: ['nova_data_hora'],
      additionalProperties: false,
    },
  },
  {
    nome: 'cancelar_consulta',
    descricao:
      'Desmarca uma consulta. Antes de chamar, pergunte se o paciente ' +
      'prefere remarcar. Quando ele só tem uma marcada, não precisa do ' +
      'consulta_id.',
    parametros: {
      type: 'object',
      properties: {
        consulta_id: {
          type: 'string',
          description:
            'Só quando ele tiver MAIS DE UMA marcada. Vem de ver_minhas_consultas.',
        },
        motivo: TEXTO,
      },
      additionalProperties: false,
    },
  },
  {
    nome: 'detalhes_do_procedimento',
    descricao:
      'Traz a explicação completa de UM procedimento: como funciona, quantas ' +
      'sessões, se dói, como é o pós e quanto tempo dura. Use quando o ' +
      'paciente quiser saber mais do que a frase curta que você já tem — ' +
      'e sempre que ele trouxer medo, dúvida ou objeção sobre um procedimento.',
    parametros: {
      type: 'object',
      properties: {
        procedimento: {
          type: 'string',
          description: 'O nome do procedimento, como está na lista da clínica.',
        },
      },
      required: ['procedimento'],
      additionalProperties: false,
    },
  },
  {
    nome: 'historico_do_paciente',
    descricao:
      'Abre o histórico de atendimento deste paciente: o que ele já fez na ' +
      'clínica, quando, e com qual dentista. Use quando ele falar do passado ' +
      '("da última vez", "o que eu fiz mesmo?", "aquele tratamento") ou quando ' +
      'precisar do que já foi feito para responder. Só traz o que já aconteceu ' +
      '— para consulta futura, use ver_minhas_consultas.',
    parametros: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    nome: 'atualizar_ficha',
    descricao:
      'Guarda o que você descobriu na conversa. Use assim que souber de algo ' +
      'novo, sem esperar o fim do atendimento.',
    parametros: {
      type: 'object',
      properties: {
        nome: {
          type: 'string',
          description:
            'O nome que o PACIENTE disse. Nunca um rótulo genérico como ' +
            '"cliente", "paciente" ou "lead" — sem o nome dito, não mande este campo.',
        },
        procedimento_interesse: TEXTO,
        resumo: {
          type: 'string',
          description:
            'A história do atendimento em TEXTO CORRIDO, na ordem em que as ' +
            'coisas aconteceram — um parágrafo, nunca lista nem tópicos. Fale ' +
            'do paciente na terceira pessoa, pelo nome assim que souber ' +
            '("Rogério procurou a clínica porque…"), e "o paciente" enquanto ' +
            'não souber. Conte o que ele procura, o que contou de si, o que ' +
            'mandou e perguntou, o que o preocupa, e em que pé ficou. O ' +
            'tamanho acompanha a conversa: duas mensagens pedem uma frase. Com ' +
            'MAIS DE 10 MENSAGENS, nunca menos de 4 frases — cada assunto da ' +
            'conversa vira pelo menos uma oração. NÃO pode contradizer a ' +
            'conversa. Reescreva o texto inteiro a cada vez, do começo até ' +
            'agora. Exemplo do tom e da forma: "Rogério procurou a clínica ' +
            'interessado em lentes de contato, porque não gosta dos espaços ' +
            'entre os dentes da frente. Mandou uma foto do sorriso e insistiu ' +
            'para saber minha opinião entre lente e clareamento. Perguntou o ' +
            'endereço e quanto custa a avaliação. Aceitou marcar, escolheu o ' +
            'meio-dia e depois pediu para remarcar por causa de um ' +
            'compromisso. Avaliação marcada para 02/09 às 15h, com o Dr. ' +
            'Alexandre."',
        },
      },
      additionalProperties: false,
    },
  },
]

// ---------------------------------------------------------------------------

function hora(iso: string, fuso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: fuso, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(iso))
}

function dataHora(iso: string, fuso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: fuso, day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(iso))
}

/**
 * Isto é um rótulo, e não o nome de uma pessoa.
 *
 * O modelo chamou `atualizar_ficha` com `nome: "cliente"` antes de perguntar
 * como a pessoa se chamava — e a partir dali o CRM tinha um lead chamado
 * "cliente", com o nome de verdade ("Rogério Cardoso Albuquerque") dito dez
 * minutos depois e jogado fora.
 *
 * A lista é curta de propósito: ela veta o que é claramente um espaço
 * reservado, e deixa passar qualquer coisa que pareça nome. Um sobrenome raro
 * nunca pode ser recusado aqui.
 */
const NOMES_GENERICOS = new Set([
  'cliente', 'paciente', 'lead', 'contato', 'usuario', 'usuário', 'pessoa',
  'nome', 'sem nome', 'não informado', 'nao informado', 'desconhecido',
  'anonimo', 'anônimo', 'n/a', 'na', '-',
])

function ehNomeGenerico(nome: string): boolean {
  const limpo = nome.trim().toLowerCase().replace(/\s+/g, ' ')

  // ⚠️ `�` É TEXTO JÁ ESTRAGADO, e ele volta pela ficha.
  //
  // O caractere de substituição aparece quando alguma etapa leu bytes UTF-8
  // com a codificação errada — "Rogério" vira "Rog�rio". Aconteceu numa
  // escrita manual pelo terminal do Windows, não pelo agente: as 44 mensagens
  // da conversa estavam intactas.
  //
  // O perigo não é a escrita original, é a CÓPIA. A Letícia lê o nome na ficha
  // e o repete de boa-fé na próxima `atualizar_ficha` — e aí o erro deixa de
  // ter culpado e passa a se manter sozinho. Recusar aqui faz a ficha voltar a
  // ficar vazia, e vazia ela pergunta de novo.
  if (limpo.includes('�')) return true

  // Só dígitos também não é nome: é o telefone voltando pela porta dos fundos.
  return NOMES_GENERICOS.has(limpo) || /^[\d\s()+-]+$/.test(limpo)
}

/**
 * O resumo, como texto corrido — mesmo quando o modelo entregou uma lista.
 *
 * O resumo é lido por uma pessoa, na ficha do lead, e a forma dele é
 * **narrativa**: quem chegou, o que queria, o que aconteceu, em que pé ficou.
 * Foi assim que a clínica pediu, e é como se conta um caso para a colega que
 * vai assumir.
 *
 * Mas o modelo às vezes cai na lista — é o formato natural dele para "resuma".
 * Recusar seria perder a memória da conversa por causa de um hífen; pedir de
 * novo depende de ele colaborar na segunda tentativa. **Tirar os marcadores é
 * determinístico.**
 *
 * O que sai daqui não vira uma boa narrativa por mágica: vira uma sequência de
 * frases, que é bem melhor que uma lista solta e bem pior que o parágrafo que
 * o prompt pede. É rede de segurança, não o caminho principal.
 */
function arrumarResumo(bruto: string): string {
  const texto = bruto.trim()
  if (!texto) return ''

  // Só age quando é lista de verdade: duas ou mais linhas com marcador.
  const linhas = texto.split('\n').map((l) => l.trim()).filter(Boolean)
  const comMarcador = linhas.filter((l) => /^[-*•]\s+/.test(l))
  if (comMarcador.length < 2) return texto

  return linhas
    .map((l) => l.replace(/^[-*•]\s+/, ''))
    .map((l) => (/[.!?]$/.test(l) ? l : l + '.'))
    .join(' ')
}

/** Nome digitado pelo paciente → uuid do profissional. Nulo se não achar. */
async function acharDentista(nome?: string): Promise<string | null> {
  if (!nome || !nome.trim()) return null
  const busca = encodeURIComponent(`%${nome.trim().split(/\s+/)[0]}%`)
  const achados = await selecionar<{ id: string }>(
    `profissionais?select=id&ativo=is.true&nome=ilike.${busca}&limit=1`,
  )
  return achados[0]?.id ?? null
}

const RECUSAS: Record<string, string> = {
  horario_ocupado: 'Esse horário já está ocupado.',
  sem_profissional_livre: 'Nenhum profissional livre nesse horário.',
  fora_expediente: 'A clínica não atende nesse dia e horário.',
  profissional_inexistente: 'Esse profissional não foi encontrado.',
  whatsapp_invalido: 'O número de WhatsApp não é válido.',
  dados_invalidos: 'Faltou alguma informação.',
  data_invalida: 'A data não foi entendida.',
  nao_encontrada: 'Essa consulta não foi encontrada.',
  sem_consulta: 'Este paciente não tem consulta marcada.',
  varias_consultas: 'Ele tem mais de uma consulta marcada — pergunte qual.',
}

/** Aceita só o formato de uuid. Qualquer outra coisa é um id que não existe. */
function ehUuid(v: unknown): boolean {
  return typeof v === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v.trim())
}

/**
 * Qual consulta remarcar ou cancelar, quando o modelo não tem o id na mão.
 *
 * ── POR QUE ISTO EXISTE ────────────────────────────────────────────────────
 *
 * **O modelo não guarda resultado de ferramenta entre uma mensagem e outra.**
 * `montarHistorico()` reconstrói a conversa a partir de `mensagens_whatsapp`,
 * que só tem os balões de texto — a chamada de `ver_minhas_consultas` e o que
 * ela devolveu somem no fim da execução.
 *
 * Foi assim que a primeira remarcação falhou. Numa mensagem ela achou a
 * consulta ("Consegui achar sua avaliação marcada para amanhã meio-dia"); na
 * seguinte, o paciente disse "aham" — e o `consulta_id` já não existia. Ela
 * chamou `remarcar_consulta` com o campo vazio, o Postgres recusou o uuid
 * (`22P02`), o `rpc()` levantou, e o paciente ouviu "não consegui acessar a
 * agenda agora". A agenda estava perfeita.
 *
 * Exigir que ele chame `ver_minhas_consultas` de novo, na mesma resposta, é
 * uma regra que depende de o modelo lembrar. **Não precisar do id é uma regra
 * que não depende de ninguém**: o paciente quase sempre tem uma consulta só, e
 * o dono da consulta já é o `lead_id` do contexto.
 */
async function consultaAlvo(
  ctx: Contexto,
  idBruto: unknown,
): Promise<{ id: string } | { erro: string; consultas?: unknown[] }> {
  if (ehUuid(idBruto)) return { id: String(idBruto).trim() }

  const linhas = await selecionar<{ id: string; procedimento: string; data_consulta: string }>(
    `consultas?select=id,procedimento,data_consulta` +
    `&lead_id=eq.${ctx.leadId}&status=eq.agendada` +
    `&order=data_consulta.asc&limit=10`,
  )
  if (!linhas.length) return { erro: 'sem_consulta' }
  if (linhas.length === 1) return { id: linhas[0].id }
  return {
    erro: 'varias_consultas',
    consultas: linhas.map((c) => ({
      consulta_id: c.id,
      procedimento: c.procedimento,
      quando: dataHora(c.data_consulta, ctx.fuso),
    })),
  }
}

// ---------------------------------------------------------------------------

/**
 * Executa uma ferramenta e devolve o resultado que o modelo vai ler.
 *
 * Sempre devolve objeto com `ok`. Recusa de negócio NÃO é exceção — "horário
 * ocupado" é resposta, e o modelo precisa dela para dar a notícia ao paciente.
 */
export async function executar(
  nome: string,
  args: Record<string, unknown>,
  ctx: Contexto,
): Promise<Record<string, unknown>> {
  try {
    switch (nome) {
      case 'ver_horarios_livres': {
        const data = String(args.data ?? '')
        const dentista = await acharDentista(args.dentista as string)

        const slots = await rpc<{ horario: string }[]>('agenda_horarios_disponiveis', {
          p_data: data,
          p_profissional: dentista,
          p_duracao: 60,
        })
        const horarios = slots.map((s) => hora(s.horario, ctx.fuso))

        if (!horarios.length) {
          const proxima = await rpc<string | null>('agenda_proxima_vaga', {
            p_a_partir_de: data,
            p_profissional: dentista,
            p_duracao: 60,
          })
          return proxima
            ? { ok: true, horarios: [], proxima_vaga: dataHora(proxima, ctx.fuso) }
            : { ok: true, horarios: [], proxima_vaga: null }
        }

        // Se o paciente pediu uma hora, responda especificamente por ela.
        const pedida = typeof args.hora === 'string' ? args.hora.slice(0, 5) : null
        return {
          ok: true,
          data,
          ...(pedida ? { hora_pedida: pedida, disponivel: horarios.includes(pedida) } : {}),
          horarios,
        }
      }

      case 'marcar_consulta': {
        // O modelo manda hora local ("2026-09-01T14:00"), sem fuso. Texto sem
        // fuso NÃO é um instante: `agenda_marcar` recebe `timestamptz`, e a
        // sessão do PostgREST roda em UTC — sem esta conversão, 14:00 da
        // clínica é gravado como 14:00 de Londres, ou seja, 11:00 aqui.
        // Ver `_shared/tempo.ts` para o estrago que isso já causou.
        const quando = paraInstante(String(args.data_hora ?? ''), ctx.fuso)
        if (!quando) {
          return { ok: false, motivo: 'data_invalida', mensagem: RECUSAS.data_invalida }
        }

        const dentista = await acharDentista(args.dentista as string)
        const linhas = await rpc<{
          ok: boolean; motivo: string | null; consulta_id: string | null
          data_hora: string | null; profissional: string | null; sugestao: string | null
        }[]>('agenda_marcar', {
          p_nome: String(args.nome_completo ?? ''),
          p_whatsapp: ctx.whatsapp,
          p_procedimento: String(args.procedimento ?? ''),
          p_data_hora: quando.toISOString(),
          p_profissional_id: dentista,
          // O que a pessoa procura, para o dentista ver na agenda. Só faz
          // sentido quando o que está sendo marcado é a avaliação — e quando
          // ela esquece, a própria função busca na ficha.
          p_interesse: String(args.interesse ?? '') || null,
          // Nulo de propósito: a duração sai de `servicos_clinica`. A avaliação
          // ocupa 30 minutos, e chumbar 60 aqui desperdiçaria meia hora de
          // agenda em toda primeira consulta.
          p_duracao: null,
          // Idempotência: se esta execução repetir por timeout, devolve o
          // agendamento que já existe em vez de criar um segundo.
          //
          // A chave é o INSTANTE, não o texto que o modelo escreveu: "14:00" e
          // "14:00:00-03:00" são o mesmo horário, e com o texto cru virariam
          // duas consultas.
          p_chave_externa: `wa_${ctx.leadId}_${quando.toISOString()}`,
        })
        const r = linhas[0]

        // A PORTA DE ENTRADA. Esta recusa não é um erro — é o fluxo certo, e
        // ela precisa saber para onde ir. A instrução vem junto com o nome da
        // avaliação, que sai do banco: renomear a porta na tela não deixa esta
        // frase para trás.
        if (r?.motivo === 'exige_avaliacao') {
          const porta = r.sugestao ?? 'a avaliação'
          return {
            ok: false,
            motivo: 'exige_avaliacao',
            marque_no_lugar: porta,
            mensagem:
              `${args.procedimento} passa antes pela ${porta}. Marque ` +
              `"${porta}" no mesmo horário, com interesse="${args.procedimento}".`,
          }
        }

        if (!r?.ok) {
          return { ok: false, motivo: r?.motivo, mensagem: RECUSAS[r?.motivo ?? ''] ?? 'Não consegui marcar.' }
        }
        return {
          ok: true,
          consulta_id: r.consulta_id,
          quando: dataHora(r.data_hora!, ctx.fuso),
          dentista: r.profissional,
        }
      }

      case 'ver_minhas_consultas': {
        const linhas = await selecionar<{
          id: string; procedimento: string; data_consulta: string; status: string
        }>(
          `consultas?select=id,procedimento,data_consulta,status` +
          `&lead_id=eq.${ctx.leadId}&status=eq.agendada` +
          `&order=data_consulta.asc&limit=10`,
        )
        return {
          ok: true,
          consultas: linhas.map((c) => ({
            consulta_id: c.id,
            procedimento: c.procedimento,
            quando: dataHora(c.data_consulta, ctx.fuso),
          })),
        }
      }

      case 'remarcar_consulta': {
        // Mesma conversão do marcar_consulta, e pelo mesmo motivo.
        const quando = paraInstante(String(args.nova_data_hora ?? ''), ctx.fuso)
        if (!quando) {
          return { ok: false, motivo: 'data_invalida', mensagem: RECUSAS.data_invalida }
        }

        const alvo = await consultaAlvo(ctx, args.consulta_id)
        if ('erro' in alvo) {
          return {
            ok: false, motivo: alvo.erro, mensagem: RECUSAS[alvo.erro],
            ...(alvo.consultas ? { consultas: alvo.consultas } : {}),
          }
        }

        const linhas = await rpc<{
          ok: boolean; motivo: string | null; data_hora: string | null; profissional: string | null
        }[]>('agenda_remarcar', {
          p_consulta_id: alvo.id,
          p_nova_data_hora: quando.toISOString(),
          p_profissional_id: null,
          p_whatsapp: ctx.whatsapp,
        })
        const r = linhas[0]
        if (!r?.ok) {
          return { ok: false, motivo: r?.motivo, mensagem: RECUSAS[r?.motivo ?? ''] ?? 'Não consegui remarcar.' }
        }
        return { ok: true, quando: dataHora(r.data_hora!, ctx.fuso), dentista: r.profissional }
      }

      case 'cancelar_consulta': {
        const alvo = await consultaAlvo(ctx, args.consulta_id)
        if ('erro' in alvo) {
          return {
            ok: false, motivo: alvo.erro, mensagem: RECUSAS[alvo.erro],
            ...(alvo.consultas ? { consultas: alvo.consultas } : {}),
          }
        }

        const linhas = await rpc<{
          ok: boolean; motivo: string | null; data_hora: string | null
        }[]>('agenda_cancelar', {
          p_consulta_id: alvo.id,
          p_whatsapp: ctx.whatsapp,
          p_motivo: (args.motivo as string) ?? null,
        })
        const r = linhas[0]
        if (!r?.ok) {
          return { ok: false, motivo: r?.motivo, mensagem: RECUSAS[r?.motivo ?? ''] ?? 'Não consegui cancelar.' }
        }
        return { ok: true, cancelada: r.data_hora ? dataHora(r.data_hora, ctx.fuso) : null }
      }

      case 'detalhes_do_procedimento': {
        const pedido = String(args.procedimento ?? '').trim()
        if (!pedido) return { ok: false, mensagem: 'Preciso saber qual procedimento.' }

        // Busca pelo nome, sem exigir escrita exata — o modelo às vezes
        // abrevia ("clareamento" em vez de "Clareamento Dental").
        const busca = encodeURIComponent(`%${pedido}%`)
        const achados = await selecionar<{
          nome: string; descricao: string | null; descricao_longa: string | null
        }>(
          `servicos_clinica?select=nome,descricao,descricao_longa` +
          `&ativo=is.true&nome=ilike.${busca}&limit=1`,
        )

        if (!achados.length) {
          return {
            ok: false,
            motivo: 'nao_encontrado',
            mensagem: 'A clínica não trabalha com esse procedimento.',
          }
        }

        const p = achados[0]
        return {
          ok: true,
          procedimento: p.nome,
          // Sem texto longo, devolve o curto. Nunca "não tenho informação" —
          // isso faria a Letícia dizer que não sabe do que a clínica faz.
          detalhes: p.descricao_longa?.trim() || p.descricao || '',
        }
      }

      case 'historico_do_paciente': {
        // Só o que JÁ ACONTECEU. A consulta futura é assunto de
        // `ver_minhas_consultas`, que devolve o id que remarcar e cancelar
        // precisam — e misturar as duas faria ela tentar cancelar uma
        // consulta de 2023.
        const linhas = await selecionar<{
          procedimento: string; data_consulta: string; status: string
          profissional: { nome: string; sobrenome: string } | null
        }>(
          `consultas?select=procedimento,data_consulta,status,profissional:profissionais(nome,sobrenome)` +
          `&lead_id=eq.${ctx.leadId}&status=in.(realizada,cancelada,faltou)` +
          `&order=data_consulta.desc&limit=20`,
        )

        if (!linhas.length) {
          return { ok: true, historico: [], mensagem: 'Este paciente ainda não tem atendimento concluído aqui.' }
        }

        return {
          ok: true,
          historico: linhas.map((c) => ({
            procedimento: c.procedimento,
            quando: dataHora(c.data_consulta, ctx.fuso),
            situacao: c.status,
            dentista: c.profissional
              ? `${c.profissional.nome} ${c.profissional.sobrenome}`
              : null,
          })),
        }
      }

      case 'atualizar_ficha': {
        const campos: Record<string, unknown> = {}

        // ⚠️ NOME DE MENTIRA É PIOR QUE NOME VAZIO.
        //
        // Gravado "cliente", a ficha passa a parecer preenchida: a Letícia lê
        // "já sei o nome" e nunca mais pergunta, e as telas mostram um lead
        // chamado "cliente" para sempre. Vazio, o número formatado aparece na
        // tela e ela continua perguntando — que é o certo. Mesma razão pela
        // qual o `pushName` do WhatsApp é ignorado.
        const nome = String(args.nome ?? '').trim()
        if (nome && !ehNomeGenerico(nome)) campos.nome_lead = nome.slice(0, 120)
        if (args.procedimento_interesse) {
          campos.procedimento_interesse = String(args.procedimento_interesse).slice(0, 120)
        }
        const resumo = arrumarResumo(String(args.resumo ?? ''))
        if (resumo) campos.resumo_conversa = resumo.slice(0, 2000)
        if (!Object.keys(campos).length) return { ok: true, nada_a_fazer: true }

        // `crm_clinica` é view auto-atualizável. Nunca escrever em
        // `minutos_ultima_mensagem`, que é calculada na leitura.
        await atualizar('crm_clinica', `id=eq.${ctx.leadId}`, campos)
        return { ok: true }
      }

      default:
        return { ok: false, mensagem: 'Ferramenta desconhecida.' }
    }
  } catch (e) {
    // Falha técnica nunca vai crua para o paciente: o modelo recebe uma frase
    // neutra e o detalhe fica no log.
    console.error(`ferramenta ${nome}:`, e)
    return { ok: false, mensagem: 'Não consegui acessar a agenda agora.' }
  }
}
