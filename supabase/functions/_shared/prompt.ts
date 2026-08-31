/**
 * Monta o prompt do momento.
 *
 * O prompt não é um texto fixo: quatro trechos são preenchidos a cada mensagem,
 * lendo o banco na hora. É o que faz desligar um procedimento em Configurações
 * tirá-lo da boca da Letícia na mensagem seguinte, sem deploy e sem ninguém
 * reescrever prompt.
 *
 * Os marcadores vivem em agente-ia/prompt.md. Mexeu num nome lá, mexa aqui —
 * marcador sem substituição vai cru para o modelo, e ele trata
 * `{{PROCEDIMENTOS}}` como se fosse o catálogo.
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

export async function montarPrompt(promptBase?: string | null): Promise<string> {
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
    .replace('{{DATA_HOJE}}', frescoDaData(fuso))
    .replace('{{INFORMACOES_CLINICA}}', emLinhas(clinica) || 'Sem dados cadastrados.')
    .replace('{{PROCEDIMENTOS}}', emLinhas(procedimentos) || 'Nenhum procedimento ativo.')
    .replace('{{PROFISSIONAIS}}', emLinhas(profissionais) || 'Nenhum dentista ativo.')
}
