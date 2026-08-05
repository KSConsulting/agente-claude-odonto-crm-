import type { LeadStatus } from '../types'

/**
 * Regra única que separa as páginas /leads e /clientes.
 *
 * Leads e Pacientes vivem na MESMA tabela (`crm_clinica`) e se distinguem
 * apenas pelo status. Quem já compareceu a uma consulta é Paciente; todo o
 * resto — inclusive quem já agendou mas ainda não foi atendido — é Contato.
 *
 * Mantenha esta regra AQUI e só aqui: ela é usada pelas duas páginas e pela
 * tela de detalhe.
 */
export const PATIENT_STATUS: LeadStatus[] = ['consulta_realizada', 'paciente_recorrente']

export function isPaciente(status: LeadStatus) {
  return PATIENT_STATUS.includes(status)
}
