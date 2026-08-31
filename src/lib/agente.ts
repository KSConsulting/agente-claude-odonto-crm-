/**
 * Como o Agente de IA se chama **dentro do sistema**.
 *
 * ⚠️ ISTO NÃO VALE PARA O WHATSAPP. Aqui a equipe precisa saber, de relance,
 * que quem respondeu foi a IA e não uma colega — por isso o título vem antes do
 * nome. Na conversa com o paciente é o contrário: o prompt proíbe, em regra
 * inegociável, que ela diga ser assistente virtual, inteligência artificial,
 * bot, robô ou sistema.
 *
 * São dois públicos e dois contratos. **Mudar um não é mudar o outro** — quem
 * quiser trocar como ela se apresenta ao paciente mexe em
 * `agente-ia/prompt.md`, não neste arquivo.
 */

/** O nome próprio. É como ela se apresenta ao paciente. */
export const AGENTE_NOME = 'Letícia'

/** O que ela é. Só aparece nas telas da equipe. */
export const AGENTE_TITULO = 'Secretária IA'

/** A etiqueta completa: `Secretária IA · Letícia`. Para rótulos, não para frases. */
export const AGENTE_ROTULO = `${AGENTE_TITULO} · ${AGENTE_NOME}`

/** Para frases: "A Secretária IA Letícia está atendendo". */
export const AGENTE_POR_EXTENSO = `${AGENTE_TITULO} ${AGENTE_NOME}`
