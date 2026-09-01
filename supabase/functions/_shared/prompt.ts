/**
 * Monta o prompt do momento.
 *
 * O prompt não é um texto fixo: cinco trechos são preenchidos a cada mensagem,
 * lendo o banco na hora. É o que faz desligar um procedimento em Configurações
 * tirá-lo da boca da Letícia na mensagem seguinte, sem deploy e sem ninguém
 * reescrever prompt.
 *
 * Os marcadores vivem em agente-ia/prompt.md. Mexeu num nome lá, mexa aqui —
 * marcador sem substituição vai cru para o modelo, e ele trata
 * `{{PROCEDIMENTOS}}` como se fosse o catálogo.
 *
 * ⚠️ A ORDEM DENTRO DO PROMPT NÃO É ESTÉTICA. O que é igual para todo mundo
 * (identidade, regras, dados da clínica) vem primeiro; o que muda a cada
 * conversa e a cada minuto (a data e a ficha da pessoa) vem por último. É assim
 * que o cache de prompt da OpenAI funciona: ele reaproveita o PREFIXO comum
 * entre chamadas. Um dado volátil no começo joga fora o desconto do texto
 * inteiro, para todas as conversas de uma vez.
 */

import { selecionar } from './db.ts'
import { PROMPT_OFICIAL } from './prompt-oficial.ts'

const FUSO_PADRAO = 'America/Sao_Paulo'

/**
 * "Hoje é terça-feira, 31/08/2026, e agora são 09:14."
 *
 * Tudo no fuso da clínica, não no do servidor. Sem isso a Letícia erraria
 * "amanhã" toda madrugada — e o servidor do Supabase roda em UTC.
 */
function frescoDaData(fuso: string): string {
  const agora = new Date()
  const partes = new Intl.DateTimeFormat('pt-BR', {
    timeZone: fuso,
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(agora)

  const p = (tipo: string) => partes.find((x) => x.type === tipo)?.value ?? ''

  return `Hoje é ${p('weekday')}, ${p('day')}/${p('month')}/${p('year')}, ` +
    `e agora são ${p('hour')}:${p('minute')}.`
}

/** Junta as linhas de uma view de coluna única. */
function emLinhas(linhas: Record<string, unknown>[]): string {
  return linhas
    .map((l) => String(Object.values(l)[0] ?? '').trim())
    .filter(Boolean)
    .join('\n')
}

export interface DadosDaPessoa {
  nome_lead: string | null
  status: string
  procedimento_interesse: string | null
  resumo_conversa: string | null
}

interface ConsultaResumo {
  procedimento: string
  data_consulta: string
  status: string
  profissional: { nome: string; sobrenome: string } | null
}

/** `quinta-feira, 04/09, às 10:00` — data falável, no fuso da clínica. */
function quando(iso: string, fuso: string): string {
  const p = new Intl.DateTimeFormat('pt-BR', {
    timeZone: fuso, weekday: 'long', day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date(iso))
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? ''
  return `${v('weekday')}, ${v('day')}/${v('month')}, às ${v('hour')}:${v('minute')}`
}

/**
 * A ficha de quem está falando — o que a Letícia precisa saber ANTES da
 * primeira palavra.
 *
 * O QUE ENTRA AQUI E O QUE NÃO ENTRA. Só cabe o que muda a conversa desde o
 * começo: o nome (para não perguntar de novo), o que a pessoa procura, o
 * resumo, e sobretudo **a consulta já marcada** — oferecer agendamento a quem
 * tem hora na quinta é o erro mais constrangedor que ela pode cometer.
 *
 * O histórico completo de consultas NÃO entra. Um paciente de cinco anos tem
 * dezenas de linhas, que seriam cobradas em toda mensagem para serem usadas
 * quase nunca. Do histórico entra só **uma linha de placar** — quantas fez e
 * quando foi a última —, que serve para ela saber que existe algo a consultar.
 * O resto sai pela ferramenta `historico_do_paciente`. É a mesma divisão dos
 * procedimentos: catálogo no prompt, detalhe sob demanda.
 *
 * Linha vazia não vira linha: `Procura: ` pelado faria ela achar que a pessoa
 * procura nada. Mesma regra da view `informacoes_clinica_agente`.
 */
export async function montarFicha(
  leadId: string,
  pessoa: DadosDaPessoa,
  fuso: string,
): Promise<string> {
  const consultas = await selecionar<ConsultaResumo>(
    `consultas?select=procedimento,data_consulta,status,profissional:profissionais(nome,sobrenome)` +
    `&lead_id=eq.${leadId}&order=data_consulta.desc&limit=50`,
  )

  const agora = Date.now()
  const proxima = consultas
    .filter((c) => c.status === 'agendada' && new Date(c.data_consulta).getTime() > agora)
    .sort((a, b) => a.data_consulta.localeCompare(b.data_consulta))[0]

  const realizadas = consultas.filter((c) => c.status === 'realizada')

  const linhas: string[] = []

  if (pessoa.nome_lead?.trim()) linhas.push(`Nome: ${pessoa.nome_lead.trim()}`)

  if (realizadas.length) {
    linhas.push('Situação: já é paciente da clínica, não é a primeira vez que vem.')
  }

  if (pessoa.procedimento_interesse?.trim()) {
    linhas.push(`Procura: ${pessoa.procedimento_interesse.trim()}`)
  }

  if (pessoa.resumo_conversa?.trim()) {
    linhas.push(`Do que já falaram: ${pessoa.resumo_conversa.trim()}`)
  }

  if (proxima) {
    const dentista = proxima.profissional
      ? ` com ${proxima.profissional.nome} ${proxima.profissional.sobrenome}`
      : ''
    linhas.push(
      `JÁ TEM CONSULTA MARCADA: ${proxima.procedimento}, ` +
      `${quando(proxima.data_consulta, fuso)}${dentista}.`,
    )
    // A INSTRUÇÃO VIAJA COLADA NO DADO, e não só lá no prompt fixo.
    //
    // Não é redundância: o prompt fixo já proíbe oferecer agendamento a quem
    // tem hora, e ela ofereceu assim mesmo — depois de uma foto, trinta
    // segundos antes de recitar o dia da consulta de cor. Ela tinha o dado.
    // O que faltou foi a regra estar perto dele.
    //
    // A ficha é a ÚLTIMA coisa que o modelo lê antes da conversa. Uma
    // instrução aqui vale mais que a mesma instrução dez seções acima, e não
    // custa cache nenhum: esta seção já é volátil por natureza.
    linhas.push(
      'Ela já tem hora: NÃO ofereça agendamento, nem depois de foto, medo, ' +
      'dúvida ou preço. Leve o assunto para essa consulta.',
    )
  }

  if (realizadas.length) {
    const ultima = realizadas[0]
    linhas.push(
      `Histórico: ${realizadas.length} consulta(s) já realizada(s), ` +
      `a última em ${new Date(ultima.data_consulta).toLocaleDateString('pt-BR', { timeZone: fuso })}. ` +
      `Use \`historico_do_paciente\` se a conversa precisar dos detalhes.`,
    )
  }

  if (!linhas.length) {
    return 'Você ainda não sabe nada sobre esta pessoa. É a primeira vez que ela fala com a clínica.'
  }

  return linhas.join('\n')
}

/**
 * O nome quando a linha de configuração não existe — não quando ela está vazia.
 *
 * A coluna é `not null` com `CHECK` de tamanho mínimo (migração `0019`), então
 * "vazio" é impossível. Isto cobre só o banco sem nenhuma linha, e existe para
 * a agente nunca se apresentar como "undefined" a um paciente.
 */
const NOME_PADRAO = 'Letícia'

export async function montarPrompt(
  promptBase?: string | null,
  ficha?: string,
  nomeAgente?: string | null,
): Promise<string> {
  const cfg = await selecionar<{ fuso_horario: string | null }>(
    'configuracoes_clinica?select=fuso_horario&limit=1',
  )
  const fuso = cfg[0]?.fuso_horario || FUSO_PADRAO

  // As três views que descrevem a clínica em frases prontas. Elas já existiam
  // — foram feitas para o agente antes de ele existir.
  const [clinica, procedimentos, profissionais] = await Promise.all([
    selecionar<Record<string, unknown>>('informacoes_clinica_agente?select=*'),
    selecionar<Record<string, unknown>>('procedimentos_clinica_agente?select=*'),
    selecionar<Record<string, unknown>>('profissionais_clinica_agente?select=*'),
  ])

  const texto = promptBase && promptBase.trim() ? promptBase : PROMPT_OFICIAL

  return texto
    // ⚠️ `replaceAll`, e não `replace`: o nome aparece DUAS vezes no prompt (na
    // identidade e no exemplo de apresentação da Etapa 1). Com `replace`, a
    // segunda continuaria sendo o literal `{{NOME_AGENTE}}` — e a agente se
    // apresentaria ao paciente com o marcador na cara.
    .replaceAll('{{NOME_AGENTE}}', (nomeAgente ?? '').trim() || NOME_PADRAO)
    .replace('{{DATA_HOJE}}', frescoDaData(fuso))
    .replace('{{INFORMACOES_CLINICA}}', emLinhas(clinica) || 'Sem dados cadastrados.')
    .replace('{{PROCEDIMENTOS}}', emLinhas(procedimentos) || 'Nenhum procedimento ativo.')
    .replace('{{PROFISSIONAIS}}', emLinhas(profissionais) || 'Nenhum dentista ativo.')
    .replace('{{FICHA_DO_PACIENTE}}', ficha || 'Você ainda não sabe nada sobre esta pessoa.')
}
