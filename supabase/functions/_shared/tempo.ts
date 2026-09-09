/**
 * Texto de data → instante, no fuso da clínica.
 *
 * ── POR QUE ISTO EXISTE ─────────────────────────────────────────────────────
 *
 * `agenda_marcar` e `agenda_remarcar` recebem `timestamptz`. Mandar
 * `"2026-09-01T14:00"` para elas **não é mandar 14:00 da clínica** — é mandar
 * um texto ambíguo, que o Postgres resolve com o fuso da sessão. A sessão do
 * PostgREST roda em `UTC`, então 14:00 vira 14:00 de Londres, que são **11:00
 * em São Paulo**.
 *
 * Foi exatamente isso que aconteceu em produção: o paciente pediu 14h, a
 * Gabriela mandou 14h, e a consulta foi gravada às 11h. Pior que as três horas:
 * com jornada das 8h às 18h, **toda a manhã ficava impossível de agendar** —
 * um pedido das 9h virava 6h, caía fora do expediente, e ela respondia "não
 * tenho horário" para um horário livre.
 *
 * A cura é não deixar ambiguidade nenhuma: converter para instante aqui e
 * mandar ISO com fuso.
 *
 * ⚠️ ESTE ARQUIVO É CÓPIA FIEL do que está em `supabase/functions/agenda/`
 * (funções `paraInstante` e `offsetDoFuso`). A duplicação é deliberada: a
 * função `agenda/` está publicada **sem nenhum import**, porque o runtime sobe
 * com `--no-remote`, e trocar isso arriscaria os sete endpoints de uma vez por
 * uma dedução não testada. **Mudou a regra aqui, mude lá** — se as duas
 * divergirem, as duas portas passam a marcar em horas diferentes.
 */

/**
 * Quantos minutos aquele fuso está à frente do UTC **naquele instante**.
 *
 * É calculado por instante, e não fixo, porque horário de verão existe. O
 * Brasil não usa mais desde 2019, mas a lista de fusos da clínica não promete
 * ser só brasileira para sempre.
 */
export function offsetDoFuso(instante: Date, fuso: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: fuso, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const p = Object.fromEntries(dtf.formatToParts(instante).map((x) => [x.type, x.value]))
  const comoSeFosseUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second)
  return (comoSeFosseUtc - instante.getTime()) / 60000
}

/**
 * `"2026-09-01T14:00"` → o instante das 14:00 no fuso da clínica.
 *
 * Texto que **já traz fuso** (`Z` ou `±HH:MM`) passa direto: quem escreveu já
 * disse qual instante queria, e reinterpretar seria estragar.
 *
 * Devolve `null` no que não der para entender. Quem chama precisa tratar —
 * data virando `Invalid Date` silenciosamente é como se marca consulta no ano
 * 1970.
 */
export function paraInstante(texto: string, fuso: string): Date | null {
  if (!texto) return null
  if (/([zZ]|[+-]\d{2}:?\d{2})$/.test(texto)) {
    const d = new Date(texto)
    return isNaN(d.getTime()) ? null : d
  }
  const m = texto.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/)
  if (!m) return null
  const [, y, mo, d, h, mi] = m
  const provisorio = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi))
  const off = offsetDoFuso(provisorio, fuso)
  return new Date(provisorio.getTime() - off * 60000)
}
