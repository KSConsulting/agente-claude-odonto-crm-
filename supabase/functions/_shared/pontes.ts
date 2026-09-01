/**
 * Qual ponte com o WhatsApp está ativa — e a ponte em si.
 *
 * Fica separado de `whatsapp.ts` porque aquele arquivo define a porta e não
 * pode conhecer as implementações: `evolution.ts` e `uazapi.ts` importam ele,
 * e importá-las de volta fecharia um ciclo.
 *
 * ── UMA DE CADA VEZ, E QUEM DECIDE É O BANCO ───────────────────────────────
 *
 * A coluna `provedor_whatsapp` (migração `0017`) é a única verdade. Ela é lida
 * a cada requisição, de propósito: trocar de ponte na tela vale na mensagem
 * seguinte, sem republicar a função.
 *
 * As credenciais das duas podem conviver preenchidas nas secrets — o que decide
 * não é a presença da chave, é a coluna.
 */

import { selecionar } from './db.ts'
import { EVOLUTION } from './evolution.ts'
import { UAZAPI } from './uazapi.ts'
import type { Ponte } from './whatsapp.ts'

const PONTES: Record<string, Ponte> = {
  evolution: EVOLUTION,
  uazapi: UAZAPI,
}

/**
 * A ponte de um nome. Nome desconhecido cai na Evolution.
 *
 * O `CHECK` do banco já recusa qualquer coisa fora das duas, então isto só
 * dispara se alguém acrescentar um valor lá e esquecer de acrescentar aqui —
 * e nesse caso a Evolution atendendo é melhor que a função inteira quebrando.
 */
export function pontePor(nome: string): Ponte {
  return PONTES[nome] ?? EVOLUTION
}

/** Qual está ativa agora. Uma consulta, lida em toda rota que fala com o WhatsApp. */
export async function ponteAtiva(): Promise<Ponte> {
  const cfg = await selecionar<{ provedor_whatsapp: string }>(
    'configuracoes_agente?select=provedor_whatsapp&limit=1',
  )
  return pontePor(cfg[0]?.provedor_whatsapp ?? 'evolution')
}
