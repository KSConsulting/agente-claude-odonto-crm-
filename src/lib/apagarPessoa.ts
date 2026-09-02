import { supabase } from './supabase'
import { buscarPorWhatsapp, type PessoaResumo } from './contatos'

/**
 * Apagar uma pessoa inteira do sistema.
 *
 * ── O QUE "TUDO" QUER DIZER ────────────────────────────────────────────────
 *
 * A ficha, a conversa inteira, as consultas (inclusive as já realizadas) e os
 * arquivos que ela mandou. **Não tem lixeira e não tem volta.**
 *
 * É o direito ao esquecimento da LGPD, e também a saída prática para número
 * errado e para lixo de teste.
 *
 * Depois disso a Letícia não sabe mais nada dela: a ficha volta a ser "você
 * ainda não sabe nada sobre esta pessoa", e na próxima mensagem ela se
 * apresenta e pergunta o nome, como na primeira vez.
 *
 * ── POR QUE A CONTAGEM VEM ANTES ───────────────────────────────────────────
 *
 * Botão irreversível sem número vira clique automático. Com "68 mensagens · 3
 * consultas (1 já realizada)" na frente, a pessoa **lê** antes de clicar — e é
 * justamente o "1 já realizada" que faz alguém parar a tempo.
 *
 * ── E POR QUE A EXCLUSÃO NÃO ACONTECE AQUI ─────────────────────────────────
 *
 * A ficha o navegador até apagaria: o `ON DELETE CASCADE` levaria conversa e
 * consultas junto. **Os arquivos, não.** O Postgres recusa apagar do Storage
 * por SQL, e a Storage API exige a `service_role key`, que só existe dentro da
 * Edge Function. Então quem apaga é ela.
 */

export interface Previsao {
  pessoa: PessoaResumo
  mensagens: number
  consultas: number
  /** Quantas dessas já aconteceram. É o número que faz alguém pensar duas vezes. */
  realizadas: number
}

/** Quem é, e o que exatamente será destruído. `null` quando o número não é de ninguém. */
export async function preverExclusao(canonico: string): Promise<Previsao | null> {
  const pessoa = await buscarPorWhatsapp(canonico)
  if (!pessoa) return null
  return contar(pessoa)
}

/**
 * A mesma previsão, para quem **já tem a pessoa na mão** — é o caso da ficha,
 * que está aberta nela.
 *
 * Procurar pelo telefone ali seria uma ida ao banco para descobrir o que o
 * componente já sabe, e quebraria justamente em quem não tem número gravado.
 */
export async function preverExclusaoDe(pessoa: PessoaResumo): Promise<Previsao> {
  return contar(pessoa)
}

async function contar(pessoa: PessoaResumo): Promise<Previsao> {
  const [msgs, todas, feitas] = await Promise.all([
    supabase.from('mensagens_whatsapp')
      .select('id', { count: 'exact', head: true }).eq('lead_id', pessoa.id),
    supabase.from('consultas')
      .select('id', { count: 'exact', head: true }).eq('lead_id', pessoa.id),
    supabase.from('consultas')
      .select('id', { count: 'exact', head: true })
      .eq('lead_id', pessoa.id).eq('status', 'realizada'),
  ])

  return {
    pessoa,
    mensagens: msgs.count ?? 0,
    consultas: todas.count ?? 0,
    realizadas: feitas.count ?? 0,
  }
}

/**
 * Apaga de verdade. Devolve quantos arquivos saíram do Storage.
 *
 * A Edge Function apaga a mídia **primeiro** e a ficha depois: o caminho do
 * arquivo é `{lead_id}/...`, então apagar a ficha antes tiraria a única forma
 * de saber quais arquivos eram dela.
 */
export async function apagarPessoa(leadId: string): Promise<number> {
  const { data: sessao } = await supabase.auth.getSession()
  const token = sessao.session?.access_token
  if (!token) throw new Error('sem_sessao')

  const r = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp/apagar-pessoa`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ lead_id: leadId }),
    },
  )
  const d = await r.json().catch(() => null)
  if (!d?.ok) throw new Error(d?.motivo ?? 'falhou')
  return d.midias ?? 0
}

/** `68 mensagens · 3 consultas (1 já realizada) · 1 arquivo` */
export function resumoDoEstrago(p: Previsao, midias?: number): string {
  const partes: string[] = []

  partes.push(p.mensagens === 1 ? '1 mensagem' : `${p.mensagens} mensagens`)

  if (p.consultas > 0) {
    const c = p.consultas === 1 ? '1 consulta' : `${p.consultas} consultas`
    partes.push(p.realizadas > 0
      ? `${c} (${p.realizadas} já realizada${p.realizadas > 1 ? 's' : ''})`
      : c)
  }

  if (midias) partes.push(midias === 1 ? '1 arquivo' : `${midias} arquivos`)

  return partes.join(' · ')
}
