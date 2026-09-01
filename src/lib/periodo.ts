/**
 * O período que os filtros de Dashboard, Leads e Pacientes recortam.
 *
 * ── POR QUE ISTO SAIU DAS PÁGINAS ──────────────────────────────────────────
 *
 * [`Dashboard.tsx`](../pages/Dashboard.tsx) e
 * [`PessoasPage.tsx`](../components/PessoasPage.tsx) tinham **a mesma**
 * `getPeriodRange` — palavra por palavra, e já com formatação diferente uma da
 * outra, que é como duas cópias começam a divergir. As três telas respondem
 * "quantos no mês passado?" e precisam responder igual.
 *
 * ⚠️ **Os nomes aqui estão em inglês**, ao contrário do resto de `src/lib/`.
 * É código **mudado de lugar**, não reescrito: renomear na mesma mexida faria
 * o diff parecer uma reescrita e esconderia que o comportamento é idêntico.
 */

export type PeriodKey =
  | 'today' | 'yesterday' | 'last7' | 'last14'
  | 'this_month' | 'last_month' | 'this_year' | 'last_year'
  | 'custom'

export interface DateRange { start: Date; end: Date }

/**
 * Os oito períodos prontos, na ordem em que aparecem na lista.
 *
 * **`custom` não está aqui, de propósito.** Ele não é um período: é um modo.
 * Como nona opção da lista, escolher "Personalizado" fechava a lista e obrigava
 * a abrir de novo para ver o que tinha sido escolhido — e a lista passava a
 * mostrar uma palavra que não diz de quando até quando. Na tela ele é um botão
 * ao lado, com as datas do lado dele.
 */
export const PERIODOS_FIXOS: { chave: Exclude<PeriodKey, 'custom'>; rotulo: string }[] = [
  { chave: 'today', rotulo: 'Hoje' },
  { chave: 'yesterday', rotulo: 'Ontem' },
  { chave: 'last7', rotulo: 'Últimos 7 dias' },
  { chave: 'last14', rotulo: 'Últimos 14 dias' },
  { chave: 'this_month', rotulo: 'Este mês' },
  { chave: 'last_month', rotulo: 'Mês passado' },
  { chave: 'this_year', rotulo: 'Este ano' },
  { chave: 'last_year', rotulo: 'Ano passado' },
]

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

export function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)
}

export function getPeriodRange(key: PeriodKey, custom?: DateRange): DateRange {
  const now = new Date()
  const today = startOfDay(now)
  switch (key) {
    case 'today':
      return { start: today, end: endOfDay(now) }
    case 'yesterday': {
      const y = new Date(today); y.setDate(y.getDate() - 1)
      return { start: y, end: endOfDay(y) }
    }
    case 'last7': {
      const s = new Date(today); s.setDate(s.getDate() - 6)
      return { start: s, end: endOfDay(now) }
    }
    case 'last14': {
      const s = new Date(today); s.setDate(s.getDate() - 13)
      return { start: s, end: endOfDay(now) }
    }
    case 'this_month':
      return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: endOfDay(now) }
    case 'last_month': {
      const s = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const e = new Date(now.getFullYear(), now.getMonth(), 0)
      return { start: s, end: endOfDay(e) }
    }
    case 'this_year':
      return { start: new Date(now.getFullYear(), 0, 1), end: endOfDay(now) }
    case 'last_year': {
      const s = new Date(now.getFullYear() - 1, 0, 1)
      const e = new Date(now.getFullYear() - 1, 11, 31)
      return { start: s, end: endOfDay(e) }
    }
    case 'custom':
      return custom ?? { start: today, end: endOfDay(now) }
    default:
      return { start: today, end: endOfDay(now) }
  }
}

export function inRange(dateStr: string | null, range: DateRange): boolean {
  if (!dateStr) return false
  const d = new Date(dateStr)
  return d >= range.start && d <= range.end
}
