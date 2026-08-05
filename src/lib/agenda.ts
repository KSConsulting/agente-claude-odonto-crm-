import type { Consulta, ProfissionalBloqueio, ProfissionalHorario } from '../types'

/**
 * Lógica pura da agenda — nenhum componente, nenhuma chamada ao Supabase.
 *
 * Está separado por um motivo concreto: a API que o Agente de IA vai consumir
 * (fase 2) precisa responder "que horários estão livres?" com exatamente as
 * mesmas regras desta tela, só que em SQL. Ter as regras isoladas aqui deixa as
 * duas implementações comparáveis lado a lado. Se elas divergirem, o agente
 * oferece horário que a recepção vê como ocupado — e ninguém entende por quê.
 *
 * FUSO HORÁRIO: tudo aqui roda no fuso do navegador, que é o da clínica no uso
 * real (a recepção está na clínica). O fuso guardado em
 * `configuracoes_clinica.fuso_horario` existe para o lado do servidor, onde não
 * há navegador nenhum para consultar.
 */

/** Domingo = 0 … Sábado = 6 — mesma convenção do banco e do getDay(). */
export const NOMES_DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
export const NOMES_DIAS_CURTOS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

/** Faixa exibida na visão semanal quando não há jornada cadastrada. */
export const GRADE_PADRAO = { horaInicio: 7, horaFim: 20 }

/* ──────────────────────────────────────────────
   Datas
────────────────────────────────────────────── */

export function inicioDoDia(d: Date): Date {
  const r = new Date(d)
  r.setHours(0, 0, 0, 0)
  return r
}

export function somarDias(d: Date, dias: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + dias)
  return r
}

export function somarMinutos(d: Date, minutos: number): Date {
  return new Date(d.getTime() + minutos * 60000)
}

export function mesmoDia(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

/** Domingo da semana da data — a semana brasileira começa no domingo. */
export function inicioDaSemana(d: Date): Date {
  return somarDias(inicioDoDia(d), -d.getDay())
}

export function diasDaSemana(d: Date): Date[] {
  const dom = inicioDaSemana(d)
  return Array.from({ length: 7 }, (_, i) => somarDias(dom, i))
}

/**
 * Grade do mês em semanas inteiras: começa no domingo anterior ao dia 1 e
 * termina no sábado seguinte ao último dia. Os dias que sobram nas pontas
 * pertencem aos meses vizinhos e são exibidos esmaecidos, como em qualquer
 * calendário.
 */
export function gradeDoMes(d: Date): Date[] {
  const primeiro = new Date(d.getFullYear(), d.getMonth(), 1)
  const ultimo = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  const inicio = inicioDaSemana(primeiro)
  const fim = somarDias(inicioDoDia(ultimo), 6 - ultimo.getDay())
  const dias: Date[] = []
  for (let atual = inicio; atual <= fim; atual = somarDias(atual, 1)) dias.push(atual)
  return dias
}

/** Minutos desde a meia-noite. Base do posicionamento vertical dos blocos. */
export function minutosDoDia(d: Date): number {
  return d.getHours() * 60 + d.getMinutes()
}

/** 'HH:MM' → minutos. Aceita o 'HH:MM:SS' que o Postgres devolve em `time`. */
export function horaParaMinutos(hora: string): number {
  const [h, m] = hora.split(':')
  return Number(h) * 60 + Number(m)
}

export function minutosParaHora(minutos: number): string {
  const h = Math.floor(minutos / 60)
  const m = minutos % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/**
 * Data no formato que o `<input type="datetime-local">` exige.
 * `toISOString()` NÃO serve aqui: ele converte para UTC e o campo passa a
 * mostrar um horário diferente do que a pessoa escolheu.
 */
export function paraDatetimeLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

export function rotuloDoPeriodo(data: Date, modo: 'semana' | 'mes'): string {
  if (modo === 'mes') {
    const s = data.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
    return s.charAt(0).toUpperCase() + s.slice(1)
  }
  const dias = diasDaSemana(data)
  const ini = dias[0]
  const fim = dias[6]
  const mesmoMes = ini.getMonth() === fim.getMonth()
  const fmtIni = ini.toLocaleDateString('pt-BR', mesmoMes ? { day: 'numeric' } : { day: 'numeric', month: 'short' })
  const fmtFim = fim.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })
  return `${fmtIni} – ${fmtFim}`
}

/* ──────────────────────────────────────────────
   Consultas
────────────────────────────────────────────── */

export function inicioDaConsulta(c: Pick<Consulta, 'data_consulta'>): Date {
  return new Date(c.data_consulta)
}

export function fimDaConsulta(c: Pick<Consulta, 'data_consulta' | 'duracao_minutos'>): Date {
  return somarMinutos(new Date(c.data_consulta), c.duracao_minutos)
}

/** Dois intervalos se sobrepõem? Encostar não conta: 9h–10h e 10h–11h convivem. */
export function seSobrepoe(inicioA: Date, fimA: Date, inicioB: Date, fimB: Date): boolean {
  return inicioA < fimB && inicioB < fimA
}

/**
 * Já existe consulta ativa ocupando este horário deste profissional?
 *
 * ⚠️ Isto é conveniência de interface — avisar antes de a pessoa clicar em
 * salvar. NÃO é a garantia. A garantia é a restrição `consultas_sem_sobreposicao`
 * no banco (migração 0002, seção 6): entre esta verificação e o INSERT existe
 * uma janela em que o Agente de IA pode gravar no mesmo horário, e só o banco
 * fecha essa janela. Por isso o modal também trata o erro 23P01.
 */
export function haConflito(
  consultas: Consulta[],
  profissionalId: string | null,
  inicio: Date,
  duracaoMinutos: number,
  ignorarConsultaId?: string,
): Consulta | null {
  if (!profissionalId) return null
  const fim = somarMinutos(inicio, duracaoMinutos)
  return consultas.find((c) =>
    c.status === 'agendada' &&
    c.profissional_id === profissionalId &&
    c.id !== ignorarConsultaId &&
    seSobrepoe(inicio, fim, inicioDaConsulta(c), fimDaConsulta(c)),
  ) ?? null
}

/* ──────────────────────────────────────────────
   Jornada e bloqueios
────────────────────────────────────────────── */

/**
 * O horário cabe inteiro dentro da jornada do profissional naquele dia?
 * Uma consulta que começa às 17h40 e dura 40 minutos NÃO cabe num expediente
 * que fecha às 18h — por isso a checagem é sobre o intervalo, não sobre o
 * instante inicial.
 */
export function dentroDoExpediente(
  horarios: ProfissionalHorario[],
  inicio: Date,
  duracaoMinutos: number,
): boolean {
  const doDia = horarios.find((h) => h.dia_semana === inicio.getDay() && h.ativo)
  if (!doDia) return false
  const ini = minutosDoDia(inicio)
  return ini >= horaParaMinutos(doDia.hora_inicio) && ini + duracaoMinutos <= horaParaMinutos(doDia.hora_fim)
}

/**
 * Bloqueio cobrindo este intervalo. Considera tanto os do profissional quanto
 * os da clínica inteira (`profissional_id` nulo) — feriado vale para todos.
 */
export function bloqueioNoPeriodo(
  bloqueios: ProfissionalBloqueio[],
  profissionalId: string | null,
  inicio: Date,
  duracaoMinutos: number,
): ProfissionalBloqueio | null {
  const fim = somarMinutos(inicio, duracaoMinutos)
  return bloqueios.find((b) =>
    (b.profissional_id === null || b.profissional_id === profissionalId) &&
    seSobrepoe(inicio, fim, new Date(b.inicio), new Date(b.fim)),
  ) ?? null
}

/**
 * Faixa de horas que a visão semanal desenha: da abertura mais cedo ao
 * fechamento mais tarde entre todos os profissionais visíveis, com uma folga de
 * uma hora de cada lado para caber encaixe fora do expediente.
 *
 * Sem isso, a grade seria fixa em 00h–24h e a semana inteira caberia numa tela
 * só à custa de blocos ilegíveis.
 */
export function limitesDaGrade(horarios: ProfissionalHorario[]): { horaInicio: number; horaFim: number } {
  const ativos = horarios.filter((h) => h.ativo)
  if (ativos.length === 0) return GRADE_PADRAO
  const inicio = Math.min(...ativos.map((h) => horaParaMinutos(h.hora_inicio)))
  const fim = Math.max(...ativos.map((h) => horaParaMinutos(h.hora_fim)))
  return {
    horaInicio: Math.max(0, Math.floor(inicio / 60) - 1),
    horaFim: Math.min(24, Math.ceil(fim / 60) + 1),
  }
}

/* ──────────────────────────────────────────────
   Layout dos blocos
────────────────────────────────────────────── */

export interface BlocoPosicionado<T> {
  item: T
  /** Coluna que o bloco ocupa dentro do grupo de sobrepostos. */
  coluna: number
  /** Quantas colunas o grupo tem — o bloco ocupa 1/colunas da largura. */
  colunas: number
}

/**
 * Distribui blocos sobrepostos em colunas lado a lado, como o Google Calendar.
 *
 * Sem isto, duas consultas no mesmo horário se desenham uma exatamente sobre a
 * outra e a de baixo fica invisível — o que num calendário é pior do que não
 * mostrar nada, porque parece que só existe uma.
 *
 * Trabalha em grupos: uma corrente de blocos que se tocam divide a largura
 * entre si; assim que aparece um vão livre, o grupo fecha e o próximo bloco
 * volta a ocupar a largura inteira.
 */
export function distribuirEmColunas<T>(
  itens: T[],
  inicioDe: (i: T) => number,
  fimDe: (i: T) => number,
): BlocoPosicionado<T>[] {
  const ordenados = [...itens].sort((a, b) => inicioDe(a) - inicioDe(b) || fimDe(a) - fimDe(b))
  const resultado: BlocoPosicionado<T>[] = []

  let grupo: BlocoPosicionado<T>[] = []
  let fimDoGrupo = -Infinity
  /** Fim do último bloco de cada coluna, para saber qual está livre. */
  let fimPorColuna: number[] = []

  const fecharGrupo = () => {
    const colunas = fimPorColuna.length || 1
    grupo.forEach((b) => resultado.push({ ...b, colunas }))
    grupo = []
    fimPorColuna = []
    fimDoGrupo = -Infinity
  }

  for (const item of ordenados) {
    const ini = inicioDe(item)
    const fim = fimDe(item)

    if (ini >= fimDoGrupo && grupo.length > 0) fecharGrupo()

    let coluna = fimPorColuna.findIndex((f) => f <= ini)
    if (coluna === -1) {
      coluna = fimPorColuna.length
      fimPorColuna.push(fim)
    } else {
      fimPorColuna[coluna] = fim
    }

    grupo.push({ item, coluna, colunas: 1 })
    fimDoGrupo = Math.max(fimDoGrupo, fim)
  }
  if (grupo.length > 0) fecharGrupo()

  return resultado
}
