import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Phone, Clock, Save, Plus, X, CalendarDays, ClipboardList } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { LeadClinica, LeadStatus, Consulta, ConsultaStatus } from '../types'

/* ──────────────────────────────────────────────
   Constants
────────────────────────────────────────────── */
const STATUS_OPTIONS: { value: LeadStatus; label: string }[] = [
  { value: 'iniciou_conversa',    label: 'Iniciou Conversa' },
  { value: 'conversando',         label: 'Conversando' },
  { value: 'consulta_agendada',   label: 'Consulta Agendada' },
  { value: 'consulta_cancelada',  label: 'Consulta Cancelada' },
  { value: 'follow_up_1_feito',   label: 'Follow-up 1 Feito' },
  { value: 'follow_up_2_feito',   label: 'Follow-up 2 Feito' },
  { value: 'follow_up_3_feito',   label: 'Follow-up 3 Feito' },
  { value: 'consulta_realizada',  label: 'Consulta Realizada' },
  { value: 'paciente_recorrente', label: 'Paciente Recorrente' },
]

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

const CONSULTA_STYLE: Record<ConsultaStatus, { bg: string; color: string }> = {
  agendada:  { bg: '#E8F8EF', color: '#1A7A48' },
  realizada: { bg: '#14532D', color: '#fff' },
  cancelada: { bg: '#FEF2F2', color: '#DC2626' },
}

/* ──────────────────────────────────────────────
   Helpers
────────────────────────────────────────────── */
function fmtDate(str: string | null) {
  if (!str) return '—'
  return new Date(str).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
function fmtDateOnly(str: string | null) {
  if (!str) return '—'
  return new Date(str).toLocaleDateString('pt-BR')
}
function fmtCurrency(v: number | null) {
  if (v === null || v === undefined) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

/* ──────────────────────────────────────────────
   Section Card
────────────────────────────────────────────── */
function SectionCard({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #EBEBEB', padding: '22px 26px', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18, paddingBottom: 14, borderBottom: '1px solid #F5F5F5' }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: '#F7EDF0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon size={16} color="#B85C72" />
        </div>
        <span style={{ fontSize: 14, fontWeight: 700, color: '#1A1A1A' }}>{title}</span>
      </div>
      {children}
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string | React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
      <span style={{ fontSize: 12.5, color: '#7A7A7A', minWidth: 180, flexShrink: 0, paddingTop: 1 }}>{label}</span>
      <span style={{ fontSize: 13.5, color: '#1A1A1A', fontWeight: 500 }}>{value || '—'}</span>
    </div>
  )
}

/* ──────────────────────────────────────────────
   New Consulta Modal
────────────────────────────────────────────── */
interface NewConsultaForm {
  procedimento: string
  data_consulta: string
  status: ConsultaStatus
  valor_pago: string
  observacoes: string
}

function NewConsultaModal({ leadId, onClose, onSaved }: { leadId: string; onClose: () => void; onSaved: (c: Consulta) => void }) {
  const [form, setForm] = useState<NewConsultaForm>({ procedimento: '', data_consulta: '', status: 'agendada', valor_pago: '', observacoes: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = (field: keyof NewConsultaForm, value: string) => setForm((f) => ({ ...f, [field]: value }))

  const handleSave = async () => {
    if (!form.procedimento.trim() || !form.data_consulta) { setError('Preencha os campos obrigatórios.'); return }
    setSaving(true); setError('')
    const { data, error: err } = await supabase.from('consultas').insert({
      lead_id: leadId,
      procedimento: form.procedimento.trim(),
      data_consulta: form.data_consulta,
      status: form.status,
      valor_pago: form.valor_pago ? parseFloat(form.valor_pago.replace(',', '.')) : null,
      observacoes: form.observacoes.trim() || null,
    }).select().single()
    setSaving(false)
    if (err) { setError('Erro ao salvar consulta.'); return }
    onSaved(data as Consulta)
    onClose()
  }

  const inputStyle: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid #EBEBEB', fontSize: 13.5, fontFamily: "'Plus Jakarta Sans', sans-serif", color: '#1A1A1A', outline: 'none', background: '#fff', boxSizing: 'border-box' }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #EBEBEB', width: '100%', maxWidth: 480, padding: '28px 28px 24px', boxShadow: '0 8px 48px rgba(0,0,0,0.12)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#1A1A1A' }}>Nova Consulta</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}><X size={18} color="#7A7A7A" /></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: '#1A1A1A', display: 'block', marginBottom: 6 }}>Procedimento *</label>
            <input value={form.procedimento} onChange={(e) => set('procedimento', e.target.value)} placeholder="Ex: Lipoaspiração" style={inputStyle}
              onFocus={(e) => (e.target.style.borderColor = '#B85C72')} onBlur={(e) => (e.target.style.borderColor = '#EBEBEB')} />
          </div>
          <div>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: '#1A1A1A', display: 'block', marginBottom: 6 }}>Data da Consulta *</label>
            <input type="datetime-local" value={form.data_consulta} onChange={(e) => set('data_consulta', e.target.value)} style={inputStyle}
              onFocus={(e) => (e.target.style.borderColor = '#B85C72')} onBlur={(e) => (e.target.style.borderColor = '#EBEBEB')} />
          </div>
          <div>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: '#1A1A1A', display: 'block', marginBottom: 6 }}>Status *</label>
            <select value={form.status} onChange={(e) => set('status', e.target.value as ConsultaStatus)} style={{ ...inputStyle, cursor: 'pointer' }}>
              <option value="agendada">Agendada</option>
              <option value="realizada">Realizada</option>
              <option value="cancelada">Cancelada</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: '#1A1A1A', display: 'block', marginBottom: 6 }}>Valor Pago (opcional)</label>
            <input type="number" min="0" step="0.01" value={form.valor_pago} onChange={(e) => set('valor_pago', e.target.value)} placeholder="0,00" style={inputStyle}
              onFocus={(e) => (e.target.style.borderColor = '#B85C72')} onBlur={(e) => (e.target.style.borderColor = '#EBEBEB')} />
          </div>
          <div>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: '#1A1A1A', display: 'block', marginBottom: 6 }}>Observações (opcional)</label>
            <textarea value={form.observacoes} onChange={(e) => set('observacoes', e.target.value)} rows={3} placeholder="Anotações sobre a consulta..." style={{ ...inputStyle, resize: 'vertical' }}
              onFocus={(e) => (e.target.style.borderColor = '#B85C72')} onBlur={(e) => (e.target.style.borderColor = '#EBEBEB')} />
          </div>
        </div>

        {error && <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '9px 12px', fontSize: 13, color: '#DC2626', marginTop: 12 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '10px', borderRadius: 9, border: '1px solid #EBEBEB', background: '#fff', cursor: 'pointer', fontSize: 13.5, fontWeight: 600, color: '#7A7A7A', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Cancelar</button>
          <button onClick={handleSave} disabled={saving} style={{ flex: 2, padding: '10px', borderRadius: 9, border: 'none', background: saving ? '#D4849A' : '#B85C72', cursor: saving ? 'not-allowed' : 'pointer', fontSize: 13.5, fontWeight: 600, color: '#fff', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
            {saving ? 'Salvando...' : 'Salvar Consulta'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ──────────────────────────────────────────────
   Main Component
────────────────────────────────────────────── */
export default function LeadDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [lead, setLead] = useState<LeadClinica | null>(null)
  const [consultas, setConsultas] = useState<Consulta[]>([])
  const [loading, setLoading] = useState(true)

  const [selectedStatus, setSelectedStatus] = useState<LeadStatus>('iniciou_conversa')
  const [savingStatus, setSavingStatus] = useState(false)
  const [statusSaved, setStatusSaved] = useState(false)
  const [statusError, setStatusError] = useState('')

  const [anotacoes, setAnotacoes] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)
  const [notesSaved, setNotesSaved] = useState(false)
  const [notesError, setNotesError] = useState('')

  const [dataNascimento, setDataNascimento] = useState('')
  const [valorPago, setValorPago] = useState('')
  const [savingFicha, setSavingFicha] = useState(false)
  const [fichaSaved, setFichaSaved] = useState(false)
  const [fichaError, setFichaError] = useState('')

  const [showModal, setShowModal] = useState(false)

  /* Load data */
  useEffect(() => {
    if (!id) return
    Promise.all([
      supabase.from('leads_clinica').select('*').eq('id', id).single(),
      supabase.from('consultas').select('*').eq('lead_id', id).order('data_consulta', { ascending: false }),
    ]).then(([{ data: leadData }, { data: consultasData }]) => {
      if (leadData) {
        setLead(leadData)
        setSelectedStatus(leadData.status)
        setAnotacoes(leadData.anotacoes ?? '')
        setDataNascimento(leadData.data_nascimento ? leadData.data_nascimento.slice(0, 10) : '')
        setValorPago(leadData.valor_pago_acumulado !== null && leadData.valor_pago_acumulado !== undefined ? String(leadData.valor_pago_acumulado) : '')
      }
      setConsultas(consultasData ?? [])
      setLoading(false)
    })
  }, [id])

  /* Supabase Realtime */
  useEffect(() => {
    if (!id) return
    const channel = supabase
      .channel(`lead-detail-${id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'leads_clinica', filter: `id=eq.${id}` }, (payload) => {
        setLead((prev) => prev ? { ...prev, ...payload.new } as LeadClinica : prev)
        setSelectedStatus((payload.new as LeadClinica).status)
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [id])

  /* Save status */
  const handleSaveStatus = async () => {
    if (!lead || selectedStatus === lead.status) return
    setSavingStatus(true); setStatusError('')
    const { error } = await supabase.from('leads_clinica').update({ status: selectedStatus }).eq('id', lead.id)
    setSavingStatus(false)
    if (error) { setStatusError('Erro ao salvar status. Tente novamente.'); return }
    setLead((prev) => prev ? { ...prev, status: selectedStatus } : prev)
    setStatusSaved(true)
    setTimeout(() => setStatusSaved(false), 2000)
  }

  /* Save ficha */
  const handleSaveFicha = async () => {
    if (!lead) return
    setSavingFicha(true); setFichaError('')
    const valorNum = valorPago ? parseFloat(valorPago.replace(',', '.')) : null
    const { error } = await supabase.from('leads_clinica').update({
      data_nascimento: dataNascimento || null,
      valor_pago_acumulado: valorNum,
    }).eq('id', lead.id)
    setSavingFicha(false)
    if (error) { setFichaError('Erro ao salvar. Tente novamente.'); return }
    setLead((prev) => prev ? { ...prev, data_nascimento: dataNascimento || null, valor_pago_acumulado: valorNum } : prev)
    setFichaSaved(true)
    setTimeout(() => setFichaSaved(false), 2000)
  }

  /* Save notes */
  const handleSaveNotes = async () => {
    if (!lead) return
    setSavingNotes(true); setNotesError('')
    const { error } = await supabase.from('leads_clinica').update({ anotacoes }).eq('id', lead.id)
    setSavingNotes(false)
    if (error) { setNotesError('Erro ao salvar anotações. Tente novamente.'); return }
    setLead((prev) => prev ? { ...prev, anotacoes } : prev)
    setNotesSaved(true)
    setTimeout(() => setNotesSaved(false), 2000)
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '80vh' }}>
        <div style={{ width: 32, height: 32, border: '3px solid #F7EDF0', borderTopColor: '#B85C72', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  if (!lead) {
    return (
      <div style={{ padding: '32px 36px' }}>
        <p style={{ color: '#7A7A7A' }}>Lead não encontrado.</p>
        <button onClick={() => navigate('/leads')} style={{ marginTop: 12, background: 'none', border: 'none', color: '#B85C72', cursor: 'pointer', fontWeight: 600, fontSize: 13.5, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>← Voltar</button>
      </div>
    )
  }

  const statusStyle = STATUS_STYLE[lead.status]

  return (
    <div style={{ padding: '28px 36px', maxWidth: 900, margin: '0 auto' }}>

      {/* Back button */}
      <button className="fade-in" onClick={() => navigate('/leads')}
        style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: '#7A7A7A', fontSize: 13, fontWeight: 500, fontFamily: "'Plus Jakarta Sans', sans-serif", marginBottom: 20, padding: 0 }}>
        <ArrowLeft size={15} /> Voltar para Leads / Clientes
      </button>

      {/* Header */}
      <div className="fade-in-1" style={{ background: '#fff', borderRadius: 14, border: '1px solid #EBEBEB', padding: '22px 26px', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#1A1A1A', margin: 0 }}>{lead.nome_lead ?? 'Sem nome'}</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10, flexWrap: 'wrap' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: statusStyle.bg, color: statusStyle.color, whiteSpace: 'nowrap' }}>
                {statusStyle.pulse && <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusStyle.color, animation: 'pulse-dot 1.4s ease infinite', display: 'inline-block' }} />}
                {STATUS_OPTIONS.find((o) => o.value === lead.status)?.label}
              </span>
              {lead.whatsapp_lead && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: '#7A7A7A' }}>
                  <Phone size={13} /> {lead.whatsapp_lead}
                </span>
              )}
              {lead.ultima_mensagem && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: '#7A7A7A' }}>
                  <Clock size={13} /> Última interação: {fmtDate(lead.ultima_mensagem)}
                </span>
              )}
              {lead.inicio_atendimento && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: '#7A7A7A' }}>
                  <CalendarDays size={13} /> Início do atendimento: {fmtDate(lead.inicio_atendimento)}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Histórico de Consultas */}
      <div className="fade-in-2">
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #EBEBEB', padding: '22px 26px', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, paddingBottom: 14, borderBottom: '1px solid #F5F5F5' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: '#F7EDF0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CalendarDays size={16} color="#B85C72" />
              </div>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#1A1A1A' }}>Histórico de Consultas</span>
            </div>
            <button onClick={() => setShowModal(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 9, border: 'none', background: '#B85C72', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#fff', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
              <Plus size={14} /> Nova Consulta
            </button>
          </div>

          {consultas.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '36px 0', color: '#CCCCCC' }}>
              <CalendarDays size={32} strokeWidth={1.2} style={{ marginBottom: 8 }} />
              <div style={{ fontSize: 13.5 }}>Nenhuma consulta registrada</div>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #EBEBEB' }}>
                    {['Procedimento', 'Data', 'Status', 'Valor Pago', 'Observações'].map((h) => (
                      <th key={h} style={{ textAlign: 'left', padding: '8px 12px', fontSize: 12, fontWeight: 600, color: '#7A7A7A', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {consultas.map((c, idx) => {
                    const cs = CONSULTA_STYLE[c.status]
                    return (
                      <tr key={c.id} style={{ borderBottom: '1px solid #F5F5F5', background: idx % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                        <td style={{ padding: '11px 12px', fontWeight: 600, color: '#1A1A1A' }}>{c.procedimento}</td>
                        <td style={{ padding: '11px 12px', color: '#7A7A7A', whiteSpace: 'nowrap' }}>{fmtDate(c.data_consulta)}</td>
                        <td style={{ padding: '11px 12px' }}>
                          <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 11.5, fontWeight: 600, background: cs.bg, color: cs.color, whiteSpace: 'nowrap' }}>
                            {c.status.charAt(0).toUpperCase() + c.status.slice(1)}
                          </span>
                        </td>
                        <td style={{ padding: '11px 12px', color: '#7A7A7A' }}>{fmtCurrency(c.valor_pago)}</td>
                        <td style={{ padding: '11px 12px', color: '#7A7A7A', maxWidth: 200 }}>{c.observacoes ?? '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Visão Completa do Contato */}
      <div className="fade-in-3">
        <SectionCard title="Visão Completa do Contato" icon={ClipboardList}>

          {/* Informações da IA */}
          <InfoRow label="Procedimento de Interesse" value={lead.procedimento_interesse} />
          <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
            <span style={{ fontSize: 12.5, color: '#7A7A7A', minWidth: 180, flexShrink: 0, paddingTop: 2 }}>Resumo da Conversa</span>
            <span style={{ fontSize: 13.5, color: '#1A1A1A', lineHeight: 1.6 }}>{lead.resumo_conversa || '—'}</span>
          </div>

          <div style={{ borderTop: '1px solid #F5F5F5', margin: '18px 0' }} />

          {/* Ficha Adicional */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12.5, color: '#7A7A7A', minWidth: 180, flexShrink: 0 }}>Data de Nascimento</span>
              <input
                type="date"
                value={dataNascimento}
                onChange={(e) => { setDataNascimento(e.target.value); setFichaError('') }}
                style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid #EBEBEB', fontSize: 13.5, fontFamily: "'Plus Jakarta Sans', sans-serif", color: '#1A1A1A', outline: 'none', background: '#fff' }}
                onFocus={(e) => (e.target.style.borderColor = '#B85C72')}
                onBlur={(e) => (e.target.style.borderColor = '#EBEBEB')}
              />
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12.5, color: '#7A7A7A', minWidth: 180, flexShrink: 0 }}>Valor Pago Acumulado (R$)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={valorPago}
                onChange={(e) => { setValorPago(e.target.value); setFichaError('') }}
                placeholder="0,00"
                style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid #EBEBEB', fontSize: 13.5, fontFamily: "'Plus Jakarta Sans', sans-serif", color: '#1A1A1A', outline: 'none', background: '#fff', width: 160 }}
                onFocus={(e) => (e.target.style.borderColor = '#B85C72')}
                onBlur={(e) => (e.target.style.borderColor = '#EBEBEB')}
              />
            </div>
            {fichaError && (
              <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '8px 12px', fontSize: 12.5, color: '#DC2626' }}>{fichaError}</div>
            )}
            <div>
              <button onClick={handleSaveFicha} disabled={savingFicha}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 9, border: 'none', background: fichaSaved ? '#1A7A48' : (savingFicha ? '#D4849A' : '#B85C72'), color: '#fff', cursor: savingFicha ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600, fontFamily: "'Plus Jakarta Sans', sans-serif", transition: 'background 0.2s' }}>
                <Save size={13} /> {fichaSaved ? 'Salvo!' : savingFicha ? 'Salvando...' : 'Salvar Ficha'}
              </button>
            </div>
          </div>

          <div style={{ borderTop: '1px solid #F5F5F5', margin: '18px 0' }} />

          {/* Status do Lead */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              value={selectedStatus}
              onChange={(e) => { setSelectedStatus(e.target.value as LeadStatus); setStatusError('') }}
              style={{ flex: 1, minWidth: 200, padding: '9px 12px', borderRadius: 9, border: '1px solid #EBEBEB', fontSize: 13.5, fontFamily: "'Plus Jakarta Sans', sans-serif", color: '#1A1A1A', outline: 'none', background: '#fff', cursor: 'pointer' }}
              onFocus={(e) => (e.target.style.borderColor = '#B85C72')}
              onBlur={(e) => (e.target.style.borderColor = '#EBEBEB')}>
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <button onClick={handleSaveStatus} disabled={savingStatus || selectedStatus === lead.status}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 9, border: 'none', background: statusSaved ? '#1A7A48' : (selectedStatus === lead.status ? '#EBEBEB' : '#B85C72'), color: selectedStatus === lead.status ? '#7A7A7A' : '#fff', cursor: selectedStatus === lead.status ? 'default' : 'pointer', fontSize: 13.5, fontWeight: 600, fontFamily: "'Plus Jakarta Sans', sans-serif", transition: 'background 0.2s' }}>
              <Save size={14} /> {statusSaved ? 'Salvo!' : savingStatus ? 'Salvando...' : 'Salvar Status'}
            </button>
          </div>
          {statusError && (
            <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '8px 12px', fontSize: 12.5, color: '#DC2626', marginTop: 10 }}>{statusError}</div>
          )}

          <div style={{ borderTop: '1px solid #F5F5F5', margin: '18px 0' }} />

          {/* Anotações */}
          <textarea
            value={anotacoes}
            onChange={(e) => setAnotacoes(e.target.value)}
            rows={5}
            placeholder="Escreva suas anotações sobre este lead..."
            style={{ width: '100%', padding: '10px 14px', borderRadius: 9, border: '1px solid #EBEBEB', fontSize: 13.5, fontFamily: "'Plus Jakarta Sans', sans-serif", color: '#1A1A1A', outline: 'none', resize: 'vertical', lineHeight: 1.6, boxSizing: 'border-box' }}
            onFocus={(e) => (e.target.style.borderColor = '#B85C72')}
            onBlur={(e) => (e.target.style.borderColor = '#EBEBEB')}
          />
          {notesError && (
            <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '8px 12px', fontSize: 12.5, color: '#DC2626', marginTop: 8 }}>{notesError}</div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
            <button onClick={handleSaveNotes} disabled={savingNotes}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 9, border: 'none', background: notesSaved ? '#1A7A48' : (savingNotes ? '#D4849A' : '#B85C72'), color: '#fff', cursor: savingNotes ? 'not-allowed' : 'pointer', fontSize: 13.5, fontWeight: 600, fontFamily: "'Plus Jakarta Sans', sans-serif", transition: 'background 0.2s' }}>
              <Save size={14} /> {notesSaved ? 'Salvo!' : savingNotes ? 'Salvando...' : 'Salvar Anotações'}
            </button>
          </div>

        </SectionCard>
      </div>

      {showModal && (
        <NewConsultaModal
          leadId={lead.id}
          onClose={() => setShowModal(false)}
          onSaved={(c) => setConsultas((prev) => [c, ...prev])}
        />
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse-dot { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.4; transform: scale(1.4); } }
      `}</style>
    </div>
  )
}
