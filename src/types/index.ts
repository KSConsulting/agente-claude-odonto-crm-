export type LeadStatus =
  | 'iniciou_conversa'
  | 'conversando'
  | 'consulta_agendada'
  | 'consulta_cancelada'
  | 'follow_up_1_feito'
  | 'follow_up_2_feito'
  | 'follow_up_3_feito'
  | 'consulta_realizada'
  | 'paciente_recorrente'

export type ConsultaStatus = 'agendada' | 'realizada' | 'cancelada'

export interface Usuario {
  id: string
  nome: string
  avatar_url: string | null
  created_at: string
}

export interface ConfiguracoesClinica {
  id: string
  nome_clinica: string | null
  logo_url: string | null
  created_at: string
  updated_at: string
}

export interface HorarioComercial {
  id: string
  dia_semana: number
  hora_inicio: string
  hora_fim: string
  ativo: boolean
}

export interface ServicoClinica {
  id: string
  nome: string
  descricao: string
  ativo: boolean
  created_at: string
}

export interface LeadClinica {
  id: string
  nome_lead: string | null
  whatsapp_lead: string | null
  procedimento_interesse: string | null
  resumo_conversa: string | null
  status: LeadStatus
  inicio_atendimento: string | null
  ultima_mensagem: string | null
  id_conta_chatwoot: string | null
  id_conversa_chatwoot: string | null
  id_lead_chatwoot: string | null
  inbox_id_chatwoot: string | null
  follow_up_1: string | null
  follow_up_2: string | null
  follow_up_3: string | null
  data_agendamento: string | null
  data_marcacao_agendamento: string | null
  id_agendamento: string | null
  anotacoes: string | null
  data_nascimento: string | null
  valor_pago_acumulado: number | null
  minutos_ultima_mensagem: number | null
  created_at: string
}

export interface Consulta {
  id: string
  lead_id: string
  procedimento: string
  data_consulta: string
  status: ConsultaStatus
  valor_pago: number | null
  observacoes: string | null
  created_at: string
}
