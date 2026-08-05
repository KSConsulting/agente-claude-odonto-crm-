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

/** Quem criou a consulta. `agente_ia` chega pela API; `equipe`, pela tela. */
export type ConsultaOrigem = 'equipe' | 'agente_ia'

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
  /** IANA (ex.: 'America/Sao_Paulo'). Base do cálculo de disponibilidade. */
  fuso_horario: string
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
  profissional_id: string | null
  procedimento: string
  data_consulta: string
  duracao_minutos: number
  /**
   * Fim da consulta, mantido pelo trigger `consultas_data_fim`.
   * **Somente leitura** — grave `data_consulta` e `duracao_minutos`.
   * Existe como coluna porque a restrição anti-conflito precisa de uma
   * expressão imutável, e `timestamptz + interval` não é.
   */
  data_fim: string
  status: ConsultaStatus
  origem: ConsultaOrigem
  chave_externa: string | null
  valor_pago: number | null
  observacoes: string | null
  cancelado_em: string | null
  motivo_cancelamento: string | null
  created_at: string
  updated_at: string
}

/**
 * Dentista da clínica. NÃO é usuário do sistema — não faz login, é só um
 * recurso de agenda. A agenda dele são as consultas com este `id`; não existe
 * tabela de agenda.
 */
export interface Profissional {
  id: string
  nome: string
  sobrenome: string
  /** Hex de 6 dígitos. Identifica o profissional em toda a agenda. */
  cor: string
  ativo: boolean
  created_at: string
  updated_at: string
}

/** Jornada do profissional. Uma linha por dia — 0 = domingo … 6 = sábado. */
export interface ProfissionalHorario {
  id: string
  profissional_id: string
  dia_semana: number
  hora_inicio: string
  hora_fim: string
  ativo: boolean
}

/** Férias, feriado, almoço. `profissional_id` nulo = clínica inteira. */
export interface ProfissionalBloqueio {
  id: string
  profissional_id: string | null
  inicio: string
  fim: string
  motivo: string
  created_at: string
}

/**
 * Chave de acesso da API do Agente de IA.
 *
 * O valor em claro **não existe aqui, nem em lugar nenhum** — o banco guarda só
 * o `hash` (SHA-256). Por isso o token só pode ser exibido no instante da
 * criação: depois disso, nem o sistema consegue reconstruí-lo.
 *
 * Revogar é `ativo = false`, não `DELETE`: o histórico de quem teve acesso e
 * quando não pode sumir junto.
 */
export interface ApiToken {
  id: string
  nome: string
  /** Primeiros caracteres, visíveis na lista, para saber qual token é qual. */
  prefixo: string
  hash: string
  ativo: boolean
  criado_por: string | null
  /** Carimbado pela API no máximo a cada 5 minutos por token. */
  ultimo_acesso: string | null
  revogado_em: string | null
  created_at: string
}

/**
 * Consulta com os dados que a agenda precisa mostrar no bloco: de quem é a
 * consulta e qual o nome do paciente. Vem do join da Agenda.tsx.
 */
export interface ConsultaAgenda extends Consulta {
  lead: { id: string; nome_lead: string | null; whatsapp_lead: string | null } | null
}
