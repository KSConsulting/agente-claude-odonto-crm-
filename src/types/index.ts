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
  /** Rua, número e complemento num campo só: 'Rua Samuel Scott, 212 A - bloco 3'. */
  endereco: string | null
  bairro: string | null
  cidade: string | null
  /** UF de duas letras. O banco recusa qualquer coisa fora das 27. */
  estado: string | null
  /** Só dígitos: '88040600'. A pontuação existe apenas na tela. */
  cep: string | null
  google_maps_url: string | null
  instagram_url: string | null
  site_url: string | null
  created_at: string
  updated_at: string
}

/**
 * Uma linha da view `informacoes_clinica_agente` — frase pronta, coluna única.
 * É o que o Agente de IA lê pelo n8n quando precisa falar da clínica.
 * **Somente leitura:** a view é calculada a partir de `configuracoes_clinica`.
 */
export interface InformacaoClinica {
  informacao: string
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
  /**
   * A frase curta do catálogo. **Vai no prompt do Agente de IA em toda
   * mensagem**, junto com a de todos os outros procedimentos ativos — por isso
   * o editor avisa quando ela passa de ~120 caracteres.
   */
  descricao: string
  /**
   * A explicação completa. **Não** vai no prompt: o agente busca pela
   * ferramenta `detalhes_do_procedimento`, só quando o paciente pergunta
   * daquele procedimento. Vazia, ele cai na `descricao`.
   */
  descricao_longa: string | null
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
  /**
   * Ligado, o Agente de IA salva a mensagem e **não responde** nesta conversa.
   * É o botão "Assumir conversa" da tela Conversas.
   */
  agente_pausado: boolean
  assumido_por: string | null
  assumido_em: string | null
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

/* ===========================================================================
 * Agente de IA — conversas do WhatsApp (migração 0010)
 * Documentação: agente-ia/README.md
 * =========================================================================== */

/** Quem escreveu. Define a cor do balão na tela Conversas. */
export type AutorMensagem = 'paciente' | 'agente' | 'atendente'

export type TipoMensagem = 'texto' | 'audio' | 'imagem' | 'video' | 'documento'

export interface MensagemWhatsapp {
  id: string
  lead_id: string
  autor: AutorMensagem
  tipo: TipoMensagem
  /** O texto. Em áudio, guarda a **transcrição** — é o que o modelo lê. */
  conteudo: string | null
  /** Caminho no bucket privado `midias-whatsapp`. Abrir com signed URL. */
  midia_url: string | null
  /** Id da mensagem na Evolution. Único — impede duplicata em reenvio. */
  id_externo: string | null
  /** Preenchido só quando `autor === 'atendente'`. */
  enviada_por: string | null
  /** Leitura da equipe inteira, não por usuário. */
  lida: boolean
  criada_em: string
}

/**
 * Modelos que a aba "Agente de IA" oferece. Acrescentar um aqui exige
 * acrescentar o tratamento correspondente em
 * `supabase/functions/_shared/llm.ts` — nada sincroniza isso sozinho.
 */
export type ModeloAgente =
  | 'claude-opus-5'
  | 'claude-sonnet-5'
  | 'gpt-4.1'
  | 'gpt-4.1-mini'

export interface ConfiguracoesAgente {
  id: string
  /** Desligado por padrão. Ligar é ato consciente, feito na tela. */
  ativo: boolean
  modelo: ModeloAgente
  /**
   * `null` = está rodando o prompt oficial de `agente-ia/prompt.md`.
   * Preenchido = alguém editou pela tela, e **este** é o que está no ar.
   */
  prompt: string | null
  /**
   * Ligado, o agente só responde aos números de `numeros_teste`. As demais
   * mensagens são gravadas, aparecem na tela, e ficam sem resposta.
   */
  modo_teste: boolean
  /** Formato canônico: só dígitos com DDI (`5511987654321`). */
  numeros_teste: string[]
  atualizado_por: string | null
  created_at: string
  updated_at: string
}

/**
 * Uma linha da view `conversas_lista` (migração 0013) — o que a coluna da
 * esquerda da tela Conversas mostra de cada pessoa.
 *
 * **Somente leitura:** é calculada na leitura, a partir de `crm_clinica_dados`
 * e `mensagens_whatsapp`. Para mudar algo aqui, escreva na tabela de origem.
 */
export interface ConversaResumo {
  lead_id: string
  nome_lead: string | null
  whatsapp_lead: string | null
  status: LeadStatus
  agente_pausado: boolean
  assumido_por: string | null
  assumido_em: string | null
  /** Nome de quem assumiu, já resolvido pelo join com `usuarios`. */
  assumido_por_nome: string | null
  ultimo_conteudo: string | null
  ultimo_tipo: TipoMensagem
  ultimo_autor: AutorMensagem
  ultima_em: string
  /** Só conta mensagem do paciente. É a bolinha azul da lista. */
  nao_lidas: number
  /**
   * A consulta ativa mais próxima do lead. Nula = sem consulta marcada.
   *
   * ⚠️ É ESTA COLUNA que responde "agendou?", **não** o `status`. O trigger
   * `consultas_sincroniza_lead` preserva `consulta_realizada` e
   * `paciente_recorrente` quando alguém marca de novo — então um paciente que
   * volta e marca NÃO fica em `consulta_agendada`. Ver `temConsultaMarcada()`
   * em `src/lib/conversas.ts` e a migração 0014.
   */
  data_agendamento: string | null
}
