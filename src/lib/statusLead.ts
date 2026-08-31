import type { LeadStatus, ConsultaStatus } from '../types'

/**
 * As cores e os rótulos do status de um lead.
 *
 * **Cor de status não é cor de marca.** Ela comunica significado — verde é
 * consulta marcada, vermelho é cancelada — e não muda junto com a identidade
 * visual da clínica.
 *
 * ⚠️ ESTE ARQUIVO É A FONTE, MAS AINDA NÃO É A ÚNICA. O mesmo mapa está
 * repetido em `CRM.tsx` (como array, que também define a ordem das colunas do
 * Kanban), em `Dashboard.tsx` (com rótulos curtos, que cabem no gráfico) e em
 * `PessoasPage.tsx` / `LeadDetail.tsx` (idênticos a este). Unificar os quatro
 * exige decidir o que fazer com os rótulos curtos — e isso é tarefa própria,
 * não um efeito colateral. Enquanto isso: **código novo importa daqui.**
 *
 * Os valores precisam bater com o `CHECK` de `crm_clinica_dados.status` e com
 * `LeadStatus` em `src/types/index.ts`. Nada sincroniza isso sozinho.
 */

export interface EstiloStatus {
  bg: string
  color: string
  /** Pisca. Só o lead recém-chegado, que é quem pede atenção. */
  pulse?: boolean
}

export const STATUS_LEAD: Record<LeadStatus, EstiloStatus> = {
  iniciou_conversa:    { bg: '#EAF3F6', color: '#1E6E8C', pulse: true },
  conversando:         { bg: '#EEF2FF', color: '#4F46E5' },
  consulta_agendada:   { bg: '#E8F8EF', color: '#1A7A48' },
  consulta_cancelada:  { bg: '#FEF2F2', color: '#DC2626' },
  follow_up_1_feito:   { bg: '#FFFBEB', color: '#D97706' },
  follow_up_2_feito:   { bg: '#FFFBEB', color: '#D97706' },
  follow_up_3_feito:   { bg: '#FFFBEB', color: '#D97706' },
  consulta_realizada:  { bg: '#14532D', color: '#FFFFFF' },
  paciente_recorrente: { bg: '#F3E8FF', color: '#7C3AED' },
}

export const ROTULO_LEAD: Record<LeadStatus, string> = {
  iniciou_conversa:    'Iniciou Conversa',
  conversando:         'Conversando',
  consulta_agendada:   'Consulta Agendada',
  consulta_cancelada:  'Consulta Cancelada',
  follow_up_1_feito:   'Follow-up 1 Feito',
  follow_up_2_feito:   'Follow-up 2 Feito',
  follow_up_3_feito:   'Follow-up 3 Feito',
  consulta_realizada:  'Consulta Realizada',
  paciente_recorrente: 'Paciente Recorrente',
}

export const STATUS_CONSULTA: Record<ConsultaStatus, EstiloStatus> = {
  agendada:  { bg: '#E8F8EF', color: '#1A7A48' },
  realizada: { bg: '#14532D', color: '#FFFFFF' },
  cancelada: { bg: '#FEF2F2', color: '#DC2626' },
}

export const ROTULO_CONSULTA: Record<ConsultaStatus, string> = {
  agendada:  'Agendada',
  realizada: 'Realizada',
  cancelada: 'Cancelada',
}
