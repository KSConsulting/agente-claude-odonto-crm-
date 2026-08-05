/**
 * Tokens da API do Agente de IA: geração, hash e o catálogo de endpoints que
 * alimenta os cURLs da tela.
 *
 * Fica fora do componente de propósito. O hash precisa bater **exatamente** com
 * o que a Edge Function calcula (`supabase/functions/agenda/index.ts`), e uma
 * regra dessas espalhada no meio de JSX é uma regra que ninguém encontra na
 * hora de conferir.
 *
 * Contrato completo dos endpoints: `API_AGENTE.md`, na raiz do repositório.
 */

const PREFIXO = 'odk_'
const ALFABETO = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
const TAMANHO = 40

/**
 * Token novo: `odk_` + 40 caracteres sorteados de um alfabeto de 62.
 * São ~238 bits de entropia — não há o que adivinhar.
 *
 * O descarte dos bytes acima de `LIMITE` existe porque 256 não é múltiplo de
 * 62: sem ele, os oito primeiros símbolos do alfabeto sairiam com probabilidade
 * maior que os demais. O viés seria irrelevante neste tamanho, mas escrever
 * sorteio enviesado num gerador de credencial é o tipo de coisa que envelhece
 * mal quando alguém reaproveita a função em outro lugar.
 */
export function gerarToken(): string {
  const LIMITE = 256 - (256 % ALFABETO.length) // 248
  const buffer = new Uint8Array(TAMANHO)
  let corpo = ''
  while (corpo.length < TAMANHO) {
    crypto.getRandomValues(buffer)
    for (const b of buffer) {
      if (b >= LIMITE) continue
      corpo += ALFABETO[b % ALFABETO.length]
      if (corpo.length === TAMANHO) break
    }
  }
  return PREFIXO + corpo
}

/**
 * SHA-256 em hexadecimal minúsculo.
 *
 * ⚠️ **Precisa ser idêntico ao `sha256()` da Edge Function.** É o único ponto de
 * encontro entre quem cria o token e quem o confere; se os dois divergirem, todo
 * token criado aqui nasce inválido e o sintoma é um 401 sem explicação.
 */
export async function hashToken(valor: string): Promise<string> {
  const bytes = new TextEncoder().encode(valor)
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Os primeiros caracteres, guardados em claro para identificar o token na lista. */
export function prefixoDe(valor: string): string {
  return valor.slice(0, PREFIXO.length + 6)
}

/* ──────────────────────────────────────────────
   Catálogo dos endpoints
────────────────────────────────────────────── */

export interface EndpointApi {
  rota: string
  titulo: string
  metodo: 'GET' | 'POST'
  resumo: string
  precisa: string
  opcionais: string
  /** Corpo de exemplo do cURL. Ausente nos GET. */
  corpo?: Record<string, unknown>
}

export const ENDPOINTS: EndpointApi[] = [
  {
    rota: 'profissionais',
    titulo: 'Listar profissionais',
    metodo: 'GET',
    resumo: 'O agente carrega antes de marcar, para saber quem é quem e poder mandar o profissional_id. Só os ativos, só id e nome.',
    precisa: 'nada',
    opcionais: '—',
  },
  {
    rota: 'procedimentos',
    titulo: 'Listar procedimentos',
    metodo: 'GET',
    resumo: 'Para o agente saber o que a clínica oferece e não inventar tratamento que não existe. Devolve só os nomes, dos que estão ativos.',
    precisa: 'nada',
    opcionais: '—',
  },
  {
    rota: 'disponibilidade',
    titulo: 'Consultar disponibilidade',
    metodo: 'POST',
    resumo: 'Com hora, responde "pode ser quinta às 9?". Sem hora, lista o dia. Se o dia estiver lotado, devolve o próximo com vaga.',
    precisa: 'data',
    opcionais: 'hora, profissional_id, duracao_minutos (padrão 60)',
    corpo: {
      data: '2026-05-15',
      hora: '09:00',
      duracao_minutos: 60,
    },
  },
  {
    rota: 'marcar',
    titulo: 'Marcar consulta',
    metodo: 'POST',
    resumo: 'Sem profissional_id, o sistema escolhe uma agenda livre. O whatsapp é a identidade: se não existir, o contato é criado com o nome informado.',
    precisa: 'nome, whatsapp, procedimento, data_hora',
    opcionais: 'profissional_id, duracao_minutos (padrão 60), chave_externa',
    corpo: {
      nome: 'Maria Pereira',
      whatsapp: '5511987654321',
      procedimento: 'Limpeza e Profilaxia',
      data_hora: '2026-05-15T09:00',
      chave_externa: 'msg_abc123',
    },
  },
  {
    rota: 'consultas',
    titulo: 'Consultar agendamentos do paciente',
    metodo: 'POST',
    resumo: 'Só as consultas ativas e futuras. É daqui que o agente tira o id para cancelar ou remarcar.',
    precisa: 'whatsapp',
    opcionais: '—',
    corpo: {
      whatsapp: '5511987654321',
    },
  },
  {
    rota: 'cancelar',
    titulo: 'Cancelar consulta',
    metodo: 'POST',
    resumo: 'O whatsapp é conferência: se vier, o sistema valida que a consulta é mesmo daquele número. Evita que um id trocado cancele a consulta de outra pessoa.',
    precisa: 'consulta_id',
    opcionais: 'whatsapp, motivo',
    corpo: {
      consulta_id: 'COLE_O_ID_DA_CONSULTA',
      whatsapp: '5511987654321',
      motivo: 'Paciente pediu pelo WhatsApp',
    },
  },
  {
    rota: 'remarcar',
    titulo: 'Remarcar consulta',
    metodo: 'POST',
    resumo: 'Operação atômica — nunca cancela e cria. Se o segundo passo falhasse, o paciente ficaria sem consulta nenhuma e ninguém perceberia.',
    precisa: 'consulta_id, nova_data_hora',
    opcionais: 'profissional_id, whatsapp',
    corpo: {
      consulta_id: 'COLE_O_ID_DA_CONSULTA',
      nova_data_hora: '2026-05-16T14:00',
      whatsapp: '5511987654321',
    },
  },
]

/** Endereço da função implantada, derivado da mesma env var do cliente Supabase. */
export const BASE_API = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/agenda`

/**
 * cURL pronto para o **Import cURL** do nó HTTP do n8n, que monta o nó sozinho.
 *
 * O corpo sai em uma linha só: o importador do n8n aceita, e o que é uma linha
 * sobrevive melhor a copiar e colar do que um JSON indentado.
 */
export function montarCurl(ep: EndpointApi, token: string): string {
  const partes = [
    `curl -X ${ep.metodo} '${BASE_API}/${ep.rota}'`,
    `-H 'X-Api-Key: ${token}'`,
  ]
  if (ep.corpo) {
    partes.push(`-H 'Content-Type: application/json'`)
    partes.push(`-d '${JSON.stringify(ep.corpo)}'`)
  }
  return partes.join(' \\\n  ')
}
