import { useEffect, useState, useCallback } from 'react'
import {
  Users, Calendar, TrendingUp, ChevronDown,
} from 'lucide-react'
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { supabase } from '../lib/supabase'
import type { LeadClinica, HorarioComercial, LeadStatus } from '../types'

/* ──────────────────────────────────────────────
   Types
────────────────────────────────────────────── */
type PeriodKey =
  | 'today' | 'yesterday' | 'last7' | 'last14'
  | 'this_month' | 'last_month' | 'this_year' | 'last_year'
  | 'custom'

interface DateRange { start: Date; end: Date }

/* ──────────────────────────────────────────────
   Helpers
────────────────────────────────────────────── */
function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}
function endOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)
}

function getPeriodRange(key: PeriodKey, custom?: DateRange): DateRange {
  const now = new Date()
  const today = startOfDay(now)
  switch (key) {
    case 'today': return { start: today, end: endOfDay(now) }
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
    case 'this_month': {
      const s = new Date(now.getFullYear(), now.getMonth(), 1)
      return { start: s, end: endOfDay(now) }
    }
    case 'last_month': {
      const s = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const e = new Date(now.getFullYear(), now.getMonth(), 0)
      return { start: s, end: endOfDay(e) }
    }
    case 'this_year': {
      const s = new Date(now.getFullYear(), 0, 1)
      return { start: s, end: endOfDay(now) }
    }
    case 'last_year': {
      const s = new Date(now.getFullYear() - 1, 0, 1)
      const e = new Date(now.getFullYear() - 1, 11, 31)
      return { start: s, end: endOfDay(e) }
    }
    case 'custom':
      return custom ?? { start: today, end: endOfDay(now) }
    default: return { start: today, end: endOfDay(now) }
  }
}

function inRange(dateStr: string | null, range: DateRange): boolean {
  if (!dateStr) return false
  const d = new Date(dateStr)
  return d >= range.start && d <= range.end
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

function getDaysArray(range: DateRange): Date[] {
  const days: Date[] = []
  const cur = new Date(startOfDay(range.start))
  while (cur <= range.end) {
    days.push(new Date(cur))
    cur.setDate(cur.getDate() + 1)
  }
  return days
}

const DAY_NAMES = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

const STATUS_LABELS: Record<LeadStatus, string> = {
  iniciou_conversa: 'Iniciou conversa',
  conversando: 'Conversando',
  consulta_agendada: 'Agendada',
  consulta_cancelada: 'Cancelada',
  follow_up_1_feito: 'Follow-up 1',
  follow_up_2_feito: 'Follow-up 2',
  follow_up_3_feito: 'Follow-up 3',
  consulta_realizada: 'Realizada',
  paciente_recorrente: 'Recorrente',
}

const STATUS_COLORS: Record<LeadStatus, { bg: string; text: string; dot?: string }> = {
  iniciou_conversa: { bg: '#F7EDF0', text: '#B85C72', dot: '#B85C72' },
  conversando: { bg: '#EFF6FF', text: '#2563EB' },
  consulta_agendada: { bg: '#E8F8EF', text: '#1A7A48' },
  consulta_cancelada: { bg: '#FEF2F2', text: '#DC2626' },
  follow_up_1_feito: { bg: '#FFFBEB', text: '#D97706' },
  follow_up_2_feito: { bg: '#FFFBEB', text: '#D97706' },
  follow_up_3_feito: { bg: '#FFFBEB', text: '#D97706' },
  consulta_realizada: { bg: '#14532D', text: '#FFFFFF' },
  paciente_recorrente: { bg: '#F3E8FF', text: '#7C3AED' },
}

/* ──────────────────────────────────────────────
   Animated Counter
────────────────────────────────────────────── */
function AnimatedCounter({ value, suffix = '' }: { value: number; suffix?: string }) {
  const [display, setDisplay] = useState(0)

  useEffect(() => {
    let start = 0
    const duration = 900
    const step = Math.ceil(value / (duration / 16))
    const timer = setInterval(() => {
      start += step
      if (start >= value) { setDisplay(value); clearInterval(timer) }
      else setDisplay(start)
    }, 16)
    return () => clearInterval(timer)
  }, [value])

  return <>{display}{suffix}</>
}

/* ──────────────────────────────────────────────
   Custom Tooltip for Line Chart
────────────────────────────────────────────── */
function LineTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: '#fff', border: '1px solid #EBEBEB', borderRadius: 10, padding: '10px 14px', boxShadow: '0 4px 16px rgba(0,0,0,0.08)', fontSize: 13 }}>
      <div style={{ fontWeight: 600, color: '#1A1A1A', marginBottom: 6 }}>{label}</div>
      {payload.map((p: any) => (
        <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 6, color: p.color, marginBottom: 2 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: p.color }} />
          <span style={{ color: '#7A7A7A' }}>{p.name}:</span>
          <span style={{ fontWeight: 600, color: '#1A1A1A' }}>{p.value}</span>
        </div>
      ))}
    </div>
  )
}

/* ──────────────────────────────────────────────
   KPI Card
────────────────────────────────────────────── */
function KpiCard({
  icon: Icon, label, value, description, suffix = '', delay,
}: {
  icon: React.ElementType; label: string; value: number
  description: string; suffix?: string; delay: string
}) {
  return (
    <div
      className={`fade-in-${delay}`}
      style={{
        background: '#fff',
        borderRadius: 14,
        border: '1px solid #EBEBEB',
        padding: '22px 24px',
        flex: 1,
        minWidth: 0,
        transition: 'box-shadow 0.2s ease',
        cursor: 'default',
      }}
      onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 20px rgba(0,0,0,0.08)')}
      onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.boxShadow = 'none')}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 12.5, color: '#7A7A7A', fontWeight: 500, marginBottom: 8 }}>{label}</div>
          <div style={{ fontSize: 32, fontWeight: 800, color: '#1A1A1A', lineHeight: 1 }}>
            <AnimatedCounter value={value} suffix={suffix} />
          </div>
          <div style={{ fontSize: 12, color: '#7A7A7A', marginTop: 6 }}>{description}</div>
        </div>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: '#F7EDF0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon size={20} color="#B85C72" strokeWidth={1.8} />
        </div>
      </div>
    </div>
  )
}

/* ──────────────────────────────────────────────
   Período labels
────────────────────────────────────────────── */
const PERIOD_OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: 'today', label: 'Hoje' },
  { key: 'yesterday', label: 'Ontem' },
  { key: 'last7', label: 'Últimos 7 dias' },
  { key: 'last14', label: 'Últimos 14 dias' },
  { key: 'this_month', label: 'Este mês' },
  { key: 'last_month', label: 'Mês passado' },
  { key: 'this_year', label: 'Este ano' },
  { key: 'last_year', label: 'Ano passado' },
  { key: 'custom', label: 'Personalizado' },
]

/* ──────────────────────────────────────────────
   Main Component
────────────────────────────────────────────── */
export default function Dashboard() {
  const [userName, setUserName] = useState('')
  const [leads, setLeads] = useState<LeadClinica[]>([])
  const [horarios, setHorarios] = useState<HorarioComercial[]>([])
  const [period, setPeriod] = useState<PeriodKey>('this_month')
  const [customRange, setCustomRange] = useState<DateRange>({ start: new Date(), end: new Date() })
  const [showCustom, setShowCustom] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadData() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data } = await supabase.from('usuarios').select('nome').eq('id', user.id).single()
        if (data) setUserName(data.nome?.split(' ')[0] ?? '')
      }

      const [{ data: leadsData }, { data: horariosData }] = await Promise.all([
        supabase.from('leads_clinica').select('*'),
        supabase.from('horario_comercial').select('*').eq('ativo', true),
      ])

      setLeads(leadsData ?? [])
      setHorarios(horariosData ?? [])
      setLoading(false)
    }
    loadData()
  }, [])

  const range = getPeriodRange(period, customRange)

  /* KPIs */
  const novosContatos = leads.filter((l) => inRange(l.created_at, range)).length
  const consultasAgendadas = leads.filter((l) => inRange(l.data_marcacao_agendamento, range)).length
  const taxaConversao = novosContatos > 0 ? Math.round((consultasAgendadas / novosContatos) * 100) : 0

  /* Chart 1: Atendimentos vs Agendamentos */
  const days = getDaysArray(range)
  const lineData = days.map((day) => {
    const label = formatDate(day)
    const dayStart = startOfDay(day)
    const dayEnd = endOfDay(day)
    const atendimentos = leads.filter((l) => {
      if (!l.inicio_atendimento) return false
      const d = new Date(l.inicio_atendimento)
      return d >= dayStart && d <= dayEnd
    }).length
    const agendamentos = leads.filter((l) => {
      if (!l.data_marcacao_agendamento) return false
      const d = new Date(l.data_marcacao_agendamento)
      return d >= dayStart && d <= dayEnd
    }).length
    return { date: label, Atendimentos: atendimentos, Agendamentos: agendamentos }
  })

  /* Chart 2: Dias da semana */
  const dayOfWeekCounts = Array(7).fill(0)
  leads.forEach((l) => {
    if (!l.inicio_atendimento) return
    const d = new Date(l.inicio_atendimento)
    dayOfWeekCounts[d.getDay()]++
  })
  const maxDayCount = Math.max(...dayOfWeekCounts)
  const barData = DAY_NAMES.map((name, i) => ({
    name,
    Contatos: dayOfWeekCounts[i],
    isMax: dayOfWeekCounts[i] === maxDayCount && maxDayCount > 0,
  }))

  /* Chart 3: Dentro/Fora do horário comercial */
  const isWithinBusinessHours = useCallback((dateStr: string | null): boolean => {
    if (!dateStr || horarios.length === 0) return false
    const d = new Date(dateStr)
    const diaSemana = d.getDay()
    const horario = horarios.find((h) => h.dia_semana === diaSemana)
    if (!horario) return false
    const hh = d.getHours()
    const mm = d.getMinutes()
    const totalMin = hh * 60 + mm
    const [sh, sm] = horario.hora_inicio.split(':').map(Number)
    const [eh, em] = horario.hora_fim.split(':').map(Number)
    return totalMin >= sh * 60 + sm && totalMin <= eh * 60 + em
  }, [horarios])

  const leadsComAtendimento = leads.filter((l) => l.inicio_atendimento)
  const dentroHorario = leadsComAtendimento.filter((l) => isWithinBusinessHours(l.inicio_atendimento)).length
  const foraHorario = leadsComAtendimento.length - dentroHorario
  const donutData = [
    { name: 'Dentro do horário', value: dentroHorario, color: '#1A7A48' },
    { name: 'Fora do horário', value: foraHorario, color: '#E8955A' },
  ]

  /* Próximas consultas */
  const now = new Date()
  const proximasConsultas = leads
    .filter((l) => l.data_agendamento && new Date(l.data_agendamento) > now)
    .sort((a, b) => new Date(a.data_agendamento!).getTime() - new Date(b.data_agendamento!).getTime())

  const greeting = () => {
    const h = new Date().getHours()
    if (h < 12) return 'Bom dia'
    if (h < 18) return 'Boa tarde'
    return 'Boa noite'
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div style={{ width: 32, height: 32, border: '3px solid #F7EDF0', borderTopColor: '#B85C72', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  return (
    <div style={{ padding: '32px 36px', maxWidth: 1300, margin: '0 auto' }}>

      {/* Header */}
      <div className="fade-in-1" style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: '#1A1A1A', margin: 0 }}>
          {greeting()}{userName ? `, ${userName}` : ''}! 👋
        </h1>
        <p style={{ fontSize: 13.5, color: '#7A7A7A', marginTop: 4 }}>
          Aqui está o resumo da sua clínica.
        </p>
      </div>

      {/* Period Filter */}
      <div className="fade-in-2" style={{ marginBottom: 28 }}>
        <div style={{
          display: 'inline-flex',
          background: '#fff',
          border: '1px solid #EBEBEB',
          borderRadius: 10,
          padding: 4,
          gap: 2,
          flexWrap: 'wrap',
        }}>
          {PERIOD_OPTIONS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => { setPeriod(key); if (key === 'custom') setShowCustom(true) }}
              style={{
                padding: '6px 12px',
                borderRadius: 7,
                border: 'none',
                cursor: 'pointer',
                fontSize: 12.5,
                fontWeight: period === key ? 600 : 500,
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                background: period === key ? '#B85C72' : 'transparent',
                color: period === key ? '#fff' : '#7A7A7A',
                transition: 'all 0.15s ease',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              {label}
              {key === 'custom' && <ChevronDown size={12} />}
            </button>
          ))}
        </div>

        {/* Custom date picker */}
        {period === 'custom' && showCustom && (
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            marginLeft: 12,
            background: '#fff',
            border: '1px solid #EBEBEB',
            borderRadius: 10,
            padding: '6px 14px',
            fontSize: 13,
          }}>
            <span style={{ color: '#7A7A7A' }}>De</span>
            <input
              type="date"
              max={new Date().toISOString().split('T')[0]}
              value={customRange.start.toISOString().split('T')[0]}
              onChange={(e) => setCustomRange((r) => ({ ...r, start: new Date(e.target.value) }))}
              style={{ border: 'none', outline: 'none', fontSize: 13, fontFamily: "'Plus Jakarta Sans', sans-serif", color: '#1A1A1A', cursor: 'pointer' }}
            />
            <span style={{ color: '#7A7A7A' }}>até</span>
            <input
              type="date"
              max={new Date().toISOString().split('T')[0]}
              value={customRange.end.toISOString().split('T')[0]}
              onChange={(e) => setCustomRange((r) => ({ ...r, end: endOfDay(new Date(e.target.value)) }))}
              style={{ border: 'none', outline: 'none', fontSize: 13, fontFamily: "'Plus Jakarta Sans', sans-serif", color: '#1A1A1A', cursor: 'pointer' }}
            />
          </div>
        )}
      </div>

      {/* KPI Cards */}
      <div className="fade-in-3" style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
        <KpiCard icon={Users} label="Novos Contatos" value={novosContatos} description="Pessoas que entraram em contato no período" delay="3" />
        <KpiCard icon={Calendar} label="Consultas Agendadas" value={consultasAgendadas} description="Total de consultas marcadas no período" delay="4" />
        <KpiCard icon={TrendingUp} label="Taxa de Conversão" value={taxaConversao} suffix="%" description="Contatos que viraram consulta agendada" delay="5" />
      </div>

      {/* Chart 1: Line Chart */}
      <div className="fade-in-4" style={{ background: '#fff', borderRadius: 14, border: '1px solid #EBEBEB', padding: '24px', marginBottom: 24 }}
        onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 20px rgba(0,0,0,0.06)')}
        onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.boxShadow = 'none')}
      >
        <div style={{ marginBottom: 4 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1A1A1A', margin: 0 }}>Atendimentos vs Agendamentos</h3>
          <p style={{ fontSize: 12.5, color: '#7A7A7A', marginTop: 4 }}>Compare quantas pessoas entraram em contato e quantas marcaram consulta por dia no período selecionado</p>
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={lineData} margin={{ top: 10, right: 10, bottom: 0, left: -10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#7A7A7A' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: '#7A7A7A' }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip content={<LineTooltip />} />
            <Legend
              wrapperStyle={{ fontSize: 12, paddingTop: 12 }}
              iconType="circle"
              iconSize={8}
            />
            <Line type="monotone" dataKey="Atendimentos" stroke="#B85C72" strokeWidth={2.5} dot={{ r: 3, fill: '#B85C72' }} activeDot={{ r: 5 }} />
            <Line type="monotone" dataKey="Agendamentos" stroke="#1A7A48" strokeWidth={2.5} dot={{ r: 3, fill: '#1A7A48' }} activeDot={{ r: 5 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Charts 2 & 3 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>

        {/* Bar Chart */}
        <div className="fade-in-5"
          style={{ background: '#fff', borderRadius: 14, border: '1px solid #EBEBEB', padding: '24px', transition: 'box-shadow 0.2s' }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 20px rgba(0,0,0,0.06)')}
          onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.boxShadow = 'none')}
        >
          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1A1A1A', margin: 0 }}>Dias com Mais Movimento</h3>
          <p style={{ fontSize: 12.5, color: '#7A7A7A', marginTop: 4, marginBottom: 16 }}>Veja em quais dias a clínica recebe mais contatos</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={barData} barSize={28} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#7A7A7A' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#7A7A7A' }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{ borderRadius: 10, border: '1px solid #EBEBEB', fontSize: 13, fontFamily: "'Plus Jakarta Sans', sans-serif" }}
                cursor={{ fill: '#F4F2EF' }}
              />
              <Bar dataKey="Contatos" radius={[6, 6, 0, 0]}>
                {barData.map((entry, i) => (
                  <Cell key={i} fill={entry.isMax ? '#B85C72' : '#F7EDF0'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Donut Chart */}
        <div className="fade-in-6"
          style={{ background: '#fff', borderRadius: 14, border: '1px solid #EBEBEB', padding: '24px', transition: 'box-shadow 0.2s' }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 20px rgba(0,0,0,0.06)')}
          onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.boxShadow = 'none')}
        >
          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1A1A1A', margin: 0 }}>Horário dos Contatos</h3>
          <p style={{ fontSize: 12.5, color: '#7A7A7A', marginTop: 4, marginBottom: 8 }}>Contatos dentro e fora do horário de funcionamento da clínica</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
            <ResponsiveContainer width={160} height={160}>
              <PieChart>
                <Pie
                  data={donutData}
                  cx="50%"
                  cy="50%"
                  innerRadius={48}
                  outerRadius={72}
                  paddingAngle={3}
                  dataKey="value"
                  animationBegin={0}
                  animationDuration={800}
                >
                  {donutData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ borderRadius: 10, border: '1px solid #EBEBEB', fontSize: 13 }}
                />
              </PieChart>
            </ResponsiveContainer>

            <div style={{ flex: 1 }}>
              {donutData.map((entry) => (
                <div key={entry.name} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: entry.color, flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: '#1A1A1A' }}>{entry.name}</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: entry.color, lineHeight: 1.2 }}>{entry.value}</div>
                  </div>
                </div>
              ))}
              <div style={{ fontSize: 11, color: '#7A7A7A', marginTop: 8, lineHeight: 1.4 }}>
                * Horários geridos em <span style={{ color: '#B85C72', fontWeight: 600 }}>Configurações</span>
              </div>
            </div>
          </div>

          {foraHorario > 0 && (
            <div style={{ marginTop: 16, background: '#F7EDF0', borderRadius: 10, padding: '12px 16px', borderLeft: '3px solid #B85C72' }}>
              <span style={{ fontSize: 13.5, fontWeight: 800, color: '#B85C72' }}>{foraHorario} {foraHorario === 1 ? 'lead atendido' : 'leads atendidos'} fora do expediente.</span>
              <span style={{ fontSize: 13, color: '#5A3A44', fontWeight: 400 }}> Cada um deles poderia ter ido para a concorrência — o Agente de IA garantiu que não fossem.</span>
            </div>
          )}
        </div>
      </div>

      {/* Próximas Consultas */}
      <div className="fade-in-6"
        style={{ background: '#fff', borderRadius: 14, border: '1px solid #EBEBEB', padding: '24px', marginBottom: 32, transition: 'box-shadow 0.2s' }}
        onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 20px rgba(0,0,0,0.06)')}
        onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.boxShadow = 'none')}
      >
        <div style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1A1A1A', margin: 0 }}>Próximas Consultas</h3>
          <p style={{ fontSize: 12.5, color: '#7A7A7A', marginTop: 4 }}>Consultas já agendadas que ainda estão por acontecer</p>
        </div>

        {proximasConsultas.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 0', color: '#7A7A7A', fontSize: 13.5 }}>
            Nenhuma consulta futura agendada.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #EBEBEB' }}>
                  {['Paciente', 'Procedimento', 'Status', 'Data da Consulta'].map((h) => (
                    <th key={h} style={{ textAlign: 'left', padding: '8px 12px', fontSize: 12, fontWeight: 600, color: '#7A7A7A', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {proximasConsultas.map((lead) => {
                  const statusStyle = STATUS_COLORS[lead.status]
                  const isPulse = lead.status === 'iniciou_conversa'
                  return (
                    <tr
                      key={lead.id}
                      style={{ borderBottom: '1px solid #F5F5F5', transition: 'background 0.15s' }}
                      onMouseEnter={(e) => ((e.currentTarget as HTMLTableRowElement).style.background = '#FAFAFA')}
                      onMouseLeave={(e) => ((e.currentTarget as HTMLTableRowElement).style.background = 'transparent')}
                    >
                      <td style={{ padding: '12px 12px' }}>
                        <div style={{ fontWeight: 600, color: '#1A1A1A' }}>{lead.nome_lead ?? '—'}</div>
                        <div style={{ fontSize: 12, color: '#7A7A7A' }}>{lead.whatsapp_lead ?? ''}</div>
                      </td>
                      <td style={{ padding: '12px 12px', color: '#7A7A7A' }}>{lead.procedimento_interesse ?? '—'}</td>
                      <td style={{ padding: '12px 12px' }}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          padding: '3px 10px',
                          borderRadius: 20,
                          fontSize: 11.5,
                          fontWeight: 600,
                          background: statusStyle.bg,
                          color: statusStyle.text,
                          whiteSpace: 'nowrap',
                        }}>
                          {isPulse && (
                            <span style={{
                              width: 6, height: 6, borderRadius: '50%',
                              background: statusStyle.dot,
                              display: 'inline-block',
                              animation: 'pulse-badge 1.4s ease infinite',
                            }} />
                          )}
                          {STATUS_LABELS[lead.status]}
                        </span>
                      </td>
                      <td style={{ padding: '12px 12px', color: '#1A1A1A', fontWeight: 500, whiteSpace: 'nowrap' }}>
                        {lead.data_agendamento
                          ? new Date(lead.data_agendamento).toLocaleString('pt-BR', {
                            day: '2-digit', month: '2-digit', year: 'numeric',
                            hour: '2-digit', minute: '2-digit',
                          })
                          : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse-badge { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.5; transform: scale(1.3); } }
      `}</style>
    </div>
  )
}
