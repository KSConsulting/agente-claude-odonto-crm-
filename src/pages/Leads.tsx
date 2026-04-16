import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Download, FileText, ChevronDown, Users, UserCheck, UserPlus, X } from 'lucide-react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { supabase } from '../lib/supabase'
import type { LeadClinica, LeadStatus } from '../types'

/* ──────────────────────────────────────────────
   Types & constants
────────────────────────────────────────────── */
type PeriodKey =
  | 'today' | 'yesterday' | 'last7' | 'last14'
  | 'this_month' | 'last_month' | 'this_year' | 'last_year' | 'custom'

interface DateRange { start: Date; end: Date }

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

const STATUS_LABELS: Record<LeadStatus, string> = {
  iniciou_conversa: 'Iniciou Conversa',
  conversando: 'Conversando',
  consulta_agendada: 'Consulta Agendada',
  consulta_cancelada: 'Consulta Cancelada',
  follow_up_1_feito: 'Follow-up 1',
  follow_up_2_feito: 'Follow-up 2',
  follow_up_3_feito: 'Follow-up 3',
  consulta_realizada: 'Consulta Realizada',
  paciente_recorrente: 'Paciente Recorrente',
}

const STATUS_STYLE: Record<LeadStatus, { bg: string; color: string; pulse?: boolean }> = {
  iniciou_conversa:   { bg: '#F7EDF0', color: '#B85C72', pulse: true },
  conversando:        { bg: '#EFF6FF', color: '#2563EB' },
  consulta_agendada:  { bg: '#E8F8EF', color: '#1A7A48' },
  consulta_cancelada: { bg: '#FEF2F2', color: '#DC2626' },
  follow_up_1_feito:  { bg: '#FFFBEB', color: '#D97706' },
  follow_up_2_feito:  { bg: '#FFFBEB', color: '#D97706' },
  follow_up_3_feito:  { bg: '#FFFBEB', color: '#D97706' },
  consulta_realizada: { bg: '#14532D', color: '#fff' },
  paciente_recorrente:{ bg: '#F3E8FF', color: '#7C3AED' },
}

/* ──────────────────────────────────────────────
   Helpers
────────────────────────────────────────────── */
function startOfDay(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()) }
function endOfDay(d: Date)   { return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999) }

function getPeriodRange(key: PeriodKey, custom?: DateRange): DateRange {
  const now = new Date()
  const today = startOfDay(now)
  switch (key) {
    case 'today':      return { start: today, end: endOfDay(now) }
    case 'yesterday':  { const y = new Date(today); y.setDate(y.getDate()-1); return { start: y, end: endOfDay(y) } }
    case 'last7':      { const s = new Date(today); s.setDate(s.getDate()-6); return { start: s, end: endOfDay(now) } }
    case 'last14':     { const s = new Date(today); s.setDate(s.getDate()-13); return { start: s, end: endOfDay(now) } }
    case 'this_month': return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: endOfDay(now) }
    case 'last_month': { const s = new Date(now.getFullYear(), now.getMonth()-1, 1); const e = new Date(now.getFullYear(), now.getMonth(), 0); return { start: s, end: endOfDay(e) } }
    case 'this_year':  return { start: new Date(now.getFullYear(), 0, 1), end: endOfDay(now) }
    case 'last_year':  return { start: new Date(now.getFullYear()-1, 0, 1), end: endOfDay(new Date(now.getFullYear()-1, 11, 31)) }
    case 'custom':     return custom ?? { start: today, end: endOfDay(now) }
    default:           return { start: today, end: endOfDay(now) }
  }
}

function inRange(dateStr: string | null, range: DateRange) {
  if (!dateStr) return false
  const d = new Date(dateStr)
  return d >= range.start && d <= range.end
}

function fmtDate(str: string | null) {
  if (!str) return '—'
  return new Date(str).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function fmtDateOnly(str: string | null) {
  if (!str) return '—'
  return new Date(str).toLocaleDateString('pt-BR')
}

/* ──────────────────────────────────────────────
   StatusBadge
────────────────────────────────────────────── */
function StatusBadge({ status }: { status: LeadStatus }) {
  const s = STATUS_STYLE[status]
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 20, fontSize: 11.5, fontWeight: 600, background: s.bg, color: s.color, whiteSpace: 'nowrap' }}>
      {s.pulse && <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.color, animation: 'pulse-dot 1.4s ease infinite', display: 'inline-block' }} />}
      {STATUS_LABELS[status]}
    </span>
  )
}

/* ──────────────────────────────────────────────
   NewLeadModal
────────────────────────────────────────────── */
interface NewLeadForm {
  tipo: 'lead' | 'paciente'
  nome: string
  whatsapp: string
  procedimento: string
  data_nascimento: string
  anotacoes: string
}

function NewLeadModal({ onClose, onSaved }: { onClose: () => void; onSaved: (lead: LeadClinica) => void }) {
  const [form, setForm] = useState<NewLeadForm>({
    tipo: 'lead', nome: '', whatsapp: '', procedimento: '', data_nascimento: '', anotacoes: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = (field: keyof NewLeadForm, value: string) => setForm((f) => ({ ...f, [field]: value }))

  const handleSave = async () => {
    if (!form.nome.trim()) { setError('O nome é obrigatório.'); return }
    if (!form.whatsapp.trim()) { setError('O WhatsApp é obrigatório.'); return }
    setSaving(true); setError('')

    const status: LeadStatus = form.tipo === 'paciente' ? 'consulta_realizada' : 'iniciou_conversa'

    const { data, error: err } = await supabase.from('leads_clinica').insert({
      nome_lead: form.nome.trim(),
      whatsapp_lead: form.whatsapp.trim(),
      status,
      procedimento_interesse: form.procedimento.trim() || null,
      data_nascimento: form.data_nascimento || null,
      anotacoes: form.anotacoes.trim() || null,
    }).select().single()

    setSaving(false)
    if (err) { setError('Erro ao cadastrar. Tente novamente.'); return }
    onSaved(data as LeadClinica)
    onClose()
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid #EBEBEB',
    fontSize: 13.5, fontFamily: "'Plus Jakarta Sans', sans-serif", color: '#1A1A1A',
    outline: 'none', background: '#fff', boxSizing: 'border-box',
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #EBEBEB', width: '100%', maxWidth: 500, padding: '28px 28px 24px', boxShadow: '0 8px 48px rgba(0,0,0,0.12)', maxHeight: '90vh', overflowY: 'auto' }}>

        {/* Modal header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: '#F7EDF0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <UserPlus size={17} color="#B85C72" />
            </div>
            <span style={{ fontSize: 15, fontWeight: 700, color: '#1A1A1A' }}>Novo Contato</span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 6 }}>
            <X size={18} color="#7A7A7A" />
          </button>
        </div>

        {/* Tipo selector */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12.5, fontWeight: 600, color: '#1A1A1A', display: 'block', marginBottom: 8 }}>Tipo *</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {([
              { value: 'lead', label: 'Lead (Contato)', sub: 'Ainda não realizou consulta' },
              { value: 'paciente', label: 'Paciente (Cliente)', sub: 'Consulta já realizada' },
            ] as const).map(({ value, label, sub }) => (
              <button
                key={value}
                type="button"
                onClick={() => set('tipo', value)}
                style={{
                  padding: '10px 14px', borderRadius: 10, border: `2px solid ${form.tipo === value ? '#B85C72' : '#EBEBEB'}`,
                  background: form.tipo === value ? '#F7EDF0' : '#fff', cursor: 'pointer', textAlign: 'left',
                  transition: 'all 0.15s',
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 700, color: form.tipo === value ? '#B85C72' : '#1A1A1A' }}>{label}</div>
                <div style={{ fontSize: 11.5, color: '#7A7A7A', marginTop: 2 }}>{sub}</div>
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Nome */}
          <div>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: '#1A1A1A', display: 'block', marginBottom: 6 }}>Nome *</label>
            <input value={form.nome} onChange={(e) => set('nome', e.target.value)} placeholder="Nome completo" style={inputStyle}
              onFocus={(e) => (e.target.style.borderColor = '#B85C72')} onBlur={(e) => (e.target.style.borderColor = '#EBEBEB')} />
          </div>

          {/* WhatsApp */}
          <div>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: '#1A1A1A', display: 'block', marginBottom: 6 }}>WhatsApp *</label>
            <input value={form.whatsapp} onChange={(e) => set('whatsapp', e.target.value)} placeholder="(11) 99999-9999" style={inputStyle}
              onFocus={(e) => (e.target.style.borderColor = '#B85C72')} onBlur={(e) => (e.target.style.borderColor = '#EBEBEB')} />
          </div>

          {/* Procedimento */}
          <div>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: '#1A1A1A', display: 'block', marginBottom: 6 }}>
              Procedimento de Interesse <span style={{ color: '#7A7A7A', fontWeight: 400 }}>(opcional)</span>
            </label>
            <input value={form.procedimento} onChange={(e) => set('procedimento', e.target.value)} placeholder="Ex: Lipoaspiração" style={inputStyle}
              onFocus={(e) => (e.target.style.borderColor = '#B85C72')} onBlur={(e) => (e.target.style.borderColor = '#EBEBEB')} />
          </div>

          {/* Data de nascimento */}
          <div>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: '#1A1A1A', display: 'block', marginBottom: 6 }}>
              Data de Nascimento <span style={{ color: '#7A7A7A', fontWeight: 400 }}>(opcional)</span>
            </label>
            <input type="date" value={form.data_nascimento} onChange={(e) => set('data_nascimento', e.target.value)} style={inputStyle}
              onFocus={(e) => (e.target.style.borderColor = '#B85C72')} onBlur={(e) => (e.target.style.borderColor = '#EBEBEB')} />
          </div>

          {/* Anotações */}
          <div>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: '#1A1A1A', display: 'block', marginBottom: 6 }}>
              Anotações <span style={{ color: '#7A7A7A', fontWeight: 400 }}>(opcional)</span>
            </label>
            <textarea value={form.anotacoes} onChange={(e) => set('anotacoes', e.target.value)} rows={3} placeholder="Observações iniciais sobre o contato..." style={{ ...inputStyle, resize: 'vertical' }}
              onFocus={(e) => (e.target.style.borderColor = '#B85C72')} onBlur={(e) => (e.target.style.borderColor = '#EBEBEB')} />
          </div>
        </div>

        {error && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '9px 12px', fontSize: 13, color: '#DC2626', marginTop: 12 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '10px', borderRadius: 9, border: '1px solid #EBEBEB', background: '#fff', cursor: 'pointer', fontSize: 13.5, fontWeight: 600, color: '#7A7A7A', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
            Cancelar
          </button>
          <button onClick={handleSave} disabled={saving}
            style={{ flex: 2, padding: '10px', borderRadius: 9, border: 'none', background: saving ? '#D4849A' : '#B85C72', cursor: saving ? 'not-allowed' : 'pointer', fontSize: 13.5, fontWeight: 600, color: '#fff', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
            {saving ? 'Cadastrando...' : 'Cadastrar'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ──────────────────────────────────────────────
   Main Component
────────────────────────────────────────────── */
export default function Leads() {
  const navigate = useNavigate()
  const [allLeads, setAllLeads] = useState<LeadClinica[]>([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<PeriodKey>('this_month')
  const [customRange, setCustomRange] = useState<DateRange>({ start: new Date(), end: new Date() })
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<'leads' | 'pacientes'>('leads')
  const [showNewLead, setShowNewLead] = useState(false)

  useEffect(() => {
    supabase.from('leads_clinica').select('*').order('created_at', { ascending: false })
      .then(({ data }) => { setAllLeads(data ?? []); setLoading(false) })
  }, [])

  const handleNewLeadSaved = (lead: LeadClinica) => {
    setAllLeads((prev) => [lead, ...prev])
    // Switch to the correct tab so the new record is immediately visible
    const isPatient = lead.status === 'consulta_realizada' || lead.status === 'paciente_recorrente'
    setTab(isPatient ? 'pacientes' : 'leads')
  }

  const range = getPeriodRange(period, customRange)

  // Period-filtered
  const periodFiltered = allLeads.filter((l) => inRange(l.created_at, range))

  // Search-filtered
  const searched = periodFiltered.filter((l) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      (l.nome_lead ?? '').toLowerCase().includes(q) ||
      (l.whatsapp_lead ?? '').toLowerCase().includes(q)
    )
  })

  // Tab-filtered
  const PATIENT_STATUS: LeadStatus[] = ['consulta_realizada', 'paciente_recorrente']
  const leadsOnly = searched.filter((l) => !PATIENT_STATUS.includes(l.status))
  const patientsOnly = searched.filter((l) => PATIENT_STATUS.includes(l.status))
  const displayed = tab === 'leads' ? leadsOnly : patientsOnly

  /* ── Export CSV ── */
  const exportCSV = () => {
    const rows = [
      ['Nome', 'Telefone', 'Procedimento', 'Status', 'Início Atendimento', 'Data Consulta'],
      ...displayed.map((l) => [
        l.nome_lead ?? '',
        l.whatsapp_lead ?? '',
        l.procedimento_interesse ?? '',
        STATUS_LABELS[l.status],
        fmtDate(l.inicio_atendimento),
        fmtDate(l.data_agendamento),
      ]),
    ]
    const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url
    a.download = `leads_${new Date().toISOString().split('T')[0]}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  /* ── Export PDF ── */
  const exportPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape' })
    doc.setFont('helvetica')
    doc.setFontSize(14)
    doc.text(tab === 'leads' ? 'Contatos (Leads)' : 'Pacientes (Clientes)', 14, 16)
    doc.setFontSize(10)
    doc.setTextColor(120)
    doc.text(`Exportado em ${new Date().toLocaleString('pt-BR')}`, 14, 22)
    autoTable(doc, {
      startY: 28,
      head: [['Nome', 'Telefone', 'Procedimento', 'Status', 'Início Atendimento', 'Data Consulta']],
      body: displayed.map((l) => [
        l.nome_lead ?? '—',
        l.whatsapp_lead ?? '—',
        l.procedimento_interesse ?? '—',
        STATUS_LABELS[l.status],
        fmtDate(l.inicio_atendimento),
        fmtDate(l.data_agendamento),
      ]),
      headStyles: { fillColor: [184, 92, 114], fontSize: 9, fontStyle: 'bold' },
      bodyStyles: { fontSize: 8.5 },
      alternateRowStyles: { fillColor: [250, 249, 247] },
      styles: { font: 'helvetica', cellPadding: 4 },
    })
    doc.save(`leads_${new Date().toISOString().split('T')[0]}.pdf`)
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '80vh' }}>
        <div style={{ width: 32, height: 32, border: '3px solid #F7EDF0', borderTopColor: '#B85C72', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  return (
    <div style={{ padding: '32px 36px' }}>

      {/* Header */}
      <div className="fade-in-1" style={{ marginBottom: 20, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#1A1A1A', margin: 0 }}>Leads / Clientes</h1>
          <p style={{ fontSize: 13, color: '#7A7A7A', marginTop: 6, lineHeight: 1.6 }}>
            <strong style={{ color: '#1A1A1A' }}>Contatos (Leads):</strong> pessoas que entraram em contato mas ainda não realizaram uma consulta. &nbsp;
            <strong style={{ color: '#1A1A1A' }}>Pacientes (Clientes):</strong> pessoas que já tiveram a consulta realizada.
          </p>
        </div>
        <button
          onClick={() => setShowNewLead(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px', borderRadius: 10, border: 'none', background: '#B85C72', cursor: 'pointer', fontSize: 13.5, fontWeight: 600, color: '#fff', fontFamily: "'Plus Jakarta Sans', sans-serif", flexShrink: 0, transition: 'background 0.15s' }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = '#8F3F55')}
          onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = '#B85C72')}
        >
          <UserPlus size={16} /> Novo Contato
        </button>
      </div>

      {/* Period filter */}
      <div className="fade-in-2" style={{ marginBottom: 20, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
        <div style={{ display: 'inline-flex', background: '#fff', border: '1px solid #EBEBEB', borderRadius: 10, padding: 4, gap: 2, flexWrap: 'wrap' }}>
          {PERIOD_OPTIONS.map(({ key, label }) => (
            <button key={key} onClick={() => setPeriod(key)}
              style={{ padding: '6px 12px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: period === key ? 600 : 500, fontFamily: "'Plus Jakarta Sans', sans-serif", background: period === key ? '#B85C72' : 'transparent', color: period === key ? '#fff' : '#7A7A7A', transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 4 }}>
              {label}{key === 'custom' && <ChevronDown size={12} />}
            </button>
          ))}
        </div>
        {period === 'custom' && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, background: '#fff', border: '1px solid #EBEBEB', borderRadius: 10, padding: '6px 14px', fontSize: 13 }}>
            <span style={{ color: '#7A7A7A' }}>De</span>
            <input type="date" max={new Date().toISOString().split('T')[0]} value={customRange.start.toISOString().split('T')[0]}
              onChange={(e) => setCustomRange((r) => ({ ...r, start: new Date(e.target.value) }))}
              style={{ border: 'none', outline: 'none', fontSize: 13, fontFamily: "'Plus Jakarta Sans', sans-serif", color: '#1A1A1A', cursor: 'pointer' }} />
            <span style={{ color: '#7A7A7A' }}>até</span>
            <input type="date" max={new Date().toISOString().split('T')[0]} value={customRange.end.toISOString().split('T')[0]}
              onChange={(e) => setCustomRange((r) => ({ ...r, end: endOfDay(new Date(e.target.value)) }))}
              style={{ border: 'none', outline: 'none', fontSize: 13, fontFamily: "'Plus Jakarta Sans', sans-serif", color: '#1A1A1A', cursor: 'pointer' }} />
          </div>
        )}
      </div>

      {/* Search + Export */}
      <div className="fade-in-3" style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 240, position: 'relative' }}>
          <Search size={15} color="#7A7A7A" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
          <input
            type="text"
            placeholder="Buscar por nome ou telefone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: '100%', padding: '9px 12px 9px 36px', borderRadius: 10, border: '1px solid #EBEBEB', fontSize: 13.5, fontFamily: "'Plus Jakarta Sans', sans-serif", color: '#1A1A1A', background: '#fff', outline: 'none', transition: 'border-color 0.15s' }}
            onFocus={(e) => (e.target.style.borderColor = '#B85C72')}
            onBlur={(e) => (e.target.style.borderColor = '#EBEBEB')}
          />
        </div>
        <button onClick={exportCSV} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 16px', borderRadius: 10, border: '1px solid #EBEBEB', background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#1A1A1A', fontFamily: "'Plus Jakarta Sans', sans-serif", transition: 'background 0.15s' }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = '#F4F2EF')}
          onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = '#fff')}>
          <Download size={15} /> Exportar CSV
        </button>
        <button onClick={exportPDF} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 16px', borderRadius: 10, border: '1px solid #EBEBEB', background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#1A1A1A', fontFamily: "'Plus Jakarta Sans', sans-serif", transition: 'background 0.15s' }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = '#F4F2EF')}
          onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = '#fff')}>
          <FileText size={15} /> Exportar PDF
        </button>
      </div>

      {/* Tabs */}
      <div className="fade-in-4" style={{ display: 'flex', gap: 4, marginBottom: 0, borderBottom: '1px solid #EBEBEB' }}>
        {([
          { key: 'leads', label: 'Contatos (Leads)', icon: Users, count: leadsOnly.length },
          { key: 'pacientes', label: 'Pacientes (Clientes)', icon: UserCheck, count: patientsOnly.length },
        ] as const).map(({ key, label, icon: Icon, count }) => (
          <button key={key} onClick={() => setTab(key)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 18px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13.5, fontWeight: tab === key ? 700 : 500, color: tab === key ? '#B85C72' : '#7A7A7A', borderBottom: tab === key ? '2px solid #B85C72' : '2px solid transparent', fontFamily: "'Plus Jakarta Sans', sans-serif", transition: 'color 0.15s', marginBottom: -1 }}>
            <Icon size={15} /> {label}
            <span style={{ background: tab === key ? '#F7EDF0' : '#F4F2EF', color: tab === key ? '#B85C72' : '#7A7A7A', borderRadius: 20, fontSize: 11.5, fontWeight: 700, padding: '1px 7px' }}>{count}</span>
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="fade-in-5" style={{ background: '#fff', borderRadius: '0 0 14px 14px', border: '1px solid #EBEBEB', borderTop: 'none', overflow: 'hidden', marginBottom: 32 }}>
        {displayed.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#7A7A7A', fontSize: 14 }}>
            {search ? 'Nenhum resultado para a busca.' : 'Nenhum registro nesse período.'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #EBEBEB', background: '#FAFAFA' }}>
                  {['Nome / Telefone', 'Procedimento', 'Status', 'Início Atendimento', 'Data Consulta', ''].map((h, i) => (
                    <th key={i} style={{ textAlign: 'left', padding: '11px 16px', fontSize: 12, fontWeight: 600, color: '#7A7A7A', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayed.map((lead, idx) => (
                  <tr key={lead.id}
                    style={{ borderBottom: '1px solid #F5F5F5', background: idx % 2 === 0 ? '#fff' : '#FAFAFA', transition: 'background 0.12s' }}
                    onMouseEnter={(e) => ((e.currentTarget as HTMLTableRowElement).style.background = '#F7EDF0')}
                    onMouseLeave={(e) => ((e.currentTarget as HTMLTableRowElement).style.background = idx % 2 === 0 ? '#fff' : '#FAFAFA')}>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontWeight: 600, color: '#1A1A1A' }}>{lead.nome_lead ?? '—'}</div>
                      <div style={{ fontSize: 12, color: '#7A7A7A', marginTop: 2 }}>{lead.whatsapp_lead ?? ''}</div>
                    </td>
                    <td style={{ padding: '12px 16px', color: '#7A7A7A' }}>{lead.procedimento_interesse ?? '—'}</td>
                    <td style={{ padding: '12px 16px' }}><StatusBadge status={lead.status} /></td>
                    <td style={{ padding: '12px 16px', color: '#7A7A7A', whiteSpace: 'nowrap' }}>{fmtDate(lead.inicio_atendimento)}</td>
                    <td style={{ padding: '12px 16px', color: '#7A7A7A', whiteSpace: 'nowrap' }}>{fmtDate(lead.data_agendamento)}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <button onClick={() => navigate(`/leads/${lead.id}`)}
                        style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #EBEBEB', background: '#fff', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: '#B85C72', fontFamily: "'Plus Jakarta Sans', sans-serif", transition: 'background 0.15s, border-color 0.15s', whiteSpace: 'nowrap' }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#F7EDF0'; (e.currentTarget as HTMLButtonElement).style.borderColor = '#D4849A' }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#fff'; (e.currentTarget as HTMLButtonElement).style.borderColor = '#EBEBEB' }}>
                        Detalhes
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showNewLead && (
        <NewLeadModal
          onClose={() => setShowNewLead(false)}
          onSaved={handleNewLeadSaved}
        />
      )}

      <style>{`
        @keyframes pulse-dot { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.4; transform: scale(1.4); } }
      `}</style>
    </div>
  )
}
