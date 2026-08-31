/**
 * Conversa com o banco pelo PostgREST.
 *
 * SEM DEPENDÊNCIA NENHUMA, pelo mesmo motivo da função `agenda/`: este runtime
 * sobe com `--no-remote` e recusa buscar módulo externo no boot — inclusive o
 * `supabase-js`. A função falharia inteira com BOOT_ERROR antes de rodar uma
 * linha. Como tudo que precisamos é falar com o PostgREST, `fetch` resolve.
 *
 * A `service_role key` é entregue automaticamente pelo Supabase às Edge
 * Functions. Ela passa por cima do RLS — a disciplina de só tocar no que está
 * na lista fechada (agente-ia/README.md, seção 7) é do código, não do banco.
 */

const URL_BASE = Deno.env.get('SUPABASE_URL')!
const CHAVE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const CABECALHOS = {
  apikey: CHAVE,
  Authorization: `Bearer ${CHAVE}`,
  'Content-Type': 'application/json',
}

/** Chama uma função SQL. Devolve array (funções TABLE) ou escalar. */
export async function rpc<T>(nome: string, args: Record<string, unknown>): Promise<T> {
  const r = await fetch(`${URL_BASE}/rest/v1/rpc/${nome}`, {
    method: 'POST',
    headers: CABECALHOS,
    body: JSON.stringify(args),
  })
  if (!r.ok) throw new Error(`rpc ${nome}: ${r.status} ${await r.text()}`)
  return await r.json() as T
}

/** Leitura direta. O caminho já vem com os filtros do PostgREST. */
export async function selecionar<T>(caminho: string): Promise<T[]> {
  const r = await fetch(`${URL_BASE}/rest/v1/${caminho}`, { headers: CABECALHOS })
  if (!r.ok) throw new Error(`select ${caminho}: ${r.status} ${await r.text()}`)
  return await r.json() as T[]
}

/**
 * Insere e devolve a linha criada.
 *
 * `ignorarConflito` usa `resolution=ignore-duplicates`: é como a mensagem
 * repetida não vira linha nova quando o WhatsApp reenvia o mesmo webhook —
 * coisa que ele faz. Nesse caso a resposta vem vazia, e quem chamou trata.
 */
export async function inserir<T>(
  tabela: string,
  linha: Record<string, unknown>,
  ignorarConflito = false,
): Promise<T[]> {
  const prefer = ignorarConflito
    ? 'return=representation,resolution=ignore-duplicates'
    : 'return=representation'

  const r = await fetch(`${URL_BASE}/rest/v1/${tabela}`, {
    method: 'POST',
    headers: { ...CABECALHOS, Prefer: prefer },
    body: JSON.stringify(linha),
  })
  if (!r.ok) throw new Error(`insert ${tabela}: ${r.status} ${await r.text()}`)
  return await r.json() as T[]
}

/** Atualiza. `filtro` é a query do PostgREST, ex.: `id=eq.${id}`. */
export async function atualizar(
  tabela: string,
  filtro: string,
  campos: Record<string, unknown>,
): Promise<void> {
  const r = await fetch(`${URL_BASE}/rest/v1/${tabela}?${filtro}`, {
    method: 'PATCH',
    headers: { ...CABECALHOS, Prefer: 'return=minimal' },
    body: JSON.stringify(campos),
  })
  if (!r.ok) throw new Error(`update ${tabela}: ${r.status} ${await r.text()}`)
}

/** Sobe um arquivo para o Storage e devolve o caminho guardado. */
export async function subirMidia(
  caminho: string,
  bytes: Uint8Array,
  tipoMime: string,
): Promise<string> {
  const r = await fetch(`${URL_BASE}/storage/v1/object/midias-whatsapp/${caminho}`, {
    method: 'POST',
    headers: {
      apikey: CHAVE,
      Authorization: `Bearer ${CHAVE}`,
      'Content-Type': tipoMime,
    },
    body: bytes,
  })
  if (!r.ok) throw new Error(`storage: ${r.status} ${await r.text()}`)
  return caminho
}
