import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import type { ModeloAgente } from '../types'

/**
 * O catálogo de modelos que a Secretária de IA oferece — e quais deles a
 * clínica **pode mesmo** usar hoje.
 *
 * ── POR QUE ISTO NÃO É UMA LISTA NO COMPONENTE ─────────────────────────────
 *
 * Porque a lista sozinha mente. Ela dizia "Claude Opus 5" como se fosse uma
 * opção, e a `ANTHROPIC_API_KEY` nunca foi preenchida: escolher aquilo
 * derrubava a secretária em silêncio — o erro só aparecia no log da função,
 * que ninguém abre. O aviso amarelo embaixo do card contava isso, mas contava
 * DEPOIS de a pessoa já ter clicado, e como advertência, não como impedimento.
 *
 * Agora o modelo sem chave aparece **desligado**, com o motivo escrito nele.
 * Mesmo princípio do painel da conexão: dizer o que se sabe, e não deixar
 * clicar no que não funciona.
 *
 * ── AS CHAVES SÃO DE SERVIDOR, E A RESPOSTA É UM SIM OU NÃO ────────────────
 *
 * `OPENAI_API_KEY` e `ANTHROPIC_API_KEY` moram nas secrets do Supabase, fora
 * do alcance do navegador — e é onde elas têm que ficar. A tela não pergunta
 * "qual é a chave", pergunta "existe chave?", e a Edge Function responde com
 * dois booleanos. Nada além disso atravessa.
 *
 * ⚠️ **ACRESCENTAR UM MODELO exige três lugares**: o tipo `ModeloAgente`
 * (`src/types/index.ts`), a lista daqui, e o `conversar()` de
 * `supabase/functions/_shared/llm.ts`. Nada sincroniza isso sozinho.
 */

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp`

export type FornecedorIA = 'openai' | 'anthropic'

export interface ModeloIA {
  valor: ModeloAgente
  nome: string
  fornecedor: FornecedorIA
  /** Uma linha sobre custo e capacidade. É o que decide a escolha. */
  nota: string
  /**
   * Impedimento que **não é** a falta de chave — a conta tem a chave, mas
   * aquele modelo específico continua fora do alcance.
   *
   * Hoje só o `gpt-5`: a OpenAI passou a exigir verificação da organização
   * para os modelos daquela leva. Ele fica na lista, desligado e com o motivo,
   * em vez de sumir: some da lista, e a pergunta "cadê o GPT-5?" não tem
   * resposta em lugar nenhum do sistema.
   */
  bloqueio?: string
}

export const FORNECEDORES: Record<FornecedorIA, { nome: string; chave: string }> = {
  openai: { nome: 'OpenAI', chave: 'OPENAI_API_KEY' },
  anthropic: { nome: 'Anthropic (Claude)', chave: 'ANTHROPIC_API_KEY' },
}

/**
 * A lista curta, e curta de propósito.
 *
 * A conta da clínica enxerga 47 modelos da OpenAI. Oferecer os 47 seria
 * transformar uma decisão de duas variáveis — quanto custa, quão bem conversa
 * — numa lista de rolagem. Aqui estão os degraus que mudam alguma coisa: dois
 * da geração 4.1, que respondem sem parar para pensar, e a geração 5, que
 * raciocina antes.
 *
 * ⚠️ **Todos foram testados contra a conta de verdade** (01/09/2026), com
 * ferramenta e tudo, antes de entrarem aqui. Modelo que existe na
 * documentação e não responde nesta conta é um card que promete e falha.
 */
export const MODELOS: ModeloIA[] = [
  {
    valor: 'gpt-4.1-mini', nome: 'GPT-4.1 mini', fornecedor: 'openai',
    nota: 'O mais barato. Responde na hora, sem parar para pensar.',
  },
  {
    valor: 'gpt-4.1', nome: 'GPT-4.1', fornecedor: 'openai',
    nota: 'Mesma geração, mais capaz que o mini.',
  },
  {
    valor: 'gpt-5', nome: 'GPT-5', fornecedor: 'openai',
    nota: 'A primeira da geração que raciocina antes de responder.',
    bloqueio: 'A OpenAI exige verificar a organização para liberar este.',
  },
  {
    valor: 'gpt-5.1', nome: 'GPT-5.1', fornecedor: 'openai',
    nota: 'Raciocina antes de responder. Erra menos em conta e em data.',
  },
  {
    valor: 'gpt-5.4-mini', nome: 'GPT-5.4 mini', fornecedor: 'openai',
    nota: 'Geração nova com preço de mini. Bom meio-termo.',
  },
  {
    valor: 'gpt-5.5', nome: 'GPT-5.5', fornecedor: 'openai',
    nota: 'A mais capaz da OpenAI aqui — e a mais cara.',
  },
  {
    valor: 'claude-sonnet-5', nome: 'Claude Sonnet 5', fornecedor: 'anthropic',
    nota: 'Equilíbrio entre custo e conversa. Escreve bem em português.',
  },
  {
    valor: 'claude-opus-5', nome: 'Claude Opus 5', fornecedor: 'anthropic',
    nota: 'O mais capaz da Anthropic. Mais caro.',
  },
]

/** A ordem em que os blocos aparecem na tela. */
export const ORDEM_FORNECEDORES: FornecedorIA[] = ['openai', 'anthropic']

export function modelosDe(fornecedor: FornecedorIA): ModeloIA[] {
  return MODELOS.filter((m) => m.fornecedor === fornecedor)
}

export function acharModelo(valor: string): ModeloIA | undefined {
  return MODELOS.find((m) => m.valor === valor)
}

// ---------------------------------------------------------------------------
// Quais chaves existem no servidor
// ---------------------------------------------------------------------------

/** `null` em um fornecedor = ainda não sabemos. Ver `useChavesIA`. */
export type ChavesIA = Record<FornecedorIA, boolean>

/**
 * Pergunta à Edge Function quais chaves de IA estão configuradas.
 *
 * Nunca lança: falha de rede vira `null`, e `null` significa **não sei** — que
 * é diferente de "não tem". A tela não desliga nada enquanto não souber, pelo
 * mesmo motivo do `webhook: 'desconhecido'`: acusar o que não se sabe é pior
 * que ficar calado.
 */
export async function lerChavesIA(): Promise<ChavesIA | null> {
  try {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (!token) return null

    const r = await fetch(`${BASE}/chaves-ia`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    })
    const d = await r.json()
    if (!d?.ok) return null
    return { openai: !!d.openai, anthropic: !!d.anthropic }
  } catch {
    return null
  }
}

/**
 * As chaves, uma vez por montagem da tela.
 *
 * Sem intervalo, ao contrário do `useConexao`: chave de IA não cai sozinha —
 * ela muda quando alguém publica a função com um secret novo, e aí a página
 * vai ser recarregada de qualquer jeito. Perguntar a cada minuto seria gastar
 * requisição para confirmar o que não mudou.
 */
export function useChavesIA(): ChavesIA | null {
  const [chaves, setChaves] = useState<ChavesIA | null>(null)

  useEffect(() => {
    let vivo = true
    void lerChavesIA().then((c) => { if (vivo) setChaves(c) })
    return () => { vivo = false }
  }, [])

  return chaves
}

/**
 * Este modelo pode ser escolhido agora? E se não, por quê?
 *
 * A ordem importa: **a falta de chave vence o bloqueio do modelo**. Sem chave,
 * nenhum daquele fornecedor funciona, e dizer "verifique a organização" para
 * quem nem chave tem manda a pessoa resolver o segundo problema antes do
 * primeiro.
 */
export function impedimento(modelo: ModeloIA, chaves: ChavesIA | null): string | null {
  // Enquanto não sabemos, nada é impedido. Desligar por desconfiança trancaria
  // a tela inteira numa falha de rede de meio segundo.
  if (chaves && !chaves[modelo.fornecedor]) {
    return `Falta a ${FORNECEDORES[modelo.fornecedor].chave} nos secrets do Supabase.`
  }
  return modelo.bloqueio ?? null
}
