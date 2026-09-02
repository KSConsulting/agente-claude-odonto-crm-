import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Phone, Clock, Save, Plus, X, CalendarDays, ClipboardList, MessagesSquare } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { isPaciente } from '../lib/pessoas'
import { formatarParaExibicao } from '../lib/telefones'
import { useCatalogoProcedimentos } from '../lib/procedimentos'
import { buscarPorWhatsapp, ERRO_DUPLICADO, type PessoaResumo } from '../lib/contatos'
import { STATUS_CONSULTA, ROTULO_CONSULTA } from '../lib/statusLead'
import CampoTelefone from '../components/CampoTelefone'
import ApagarEstaPessoa from '../components/ApagarEstaPessoa'
import type { LeadClinica, LeadStatus, Consulta, ConsultaStatus, Profissional } from '../types'

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
  iniciou_conversa:   { bg: '#EAF3F6', color: '#1E6E8C', pulse: true },
  conversando:        { bg: '#EEF2FF', color: '#4F46E5' },
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
function fmtDate(str: string | null) {
  if (!str) return '—'
  return new Date(str).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const campoStyle: React.CSSProperties = {
  padding: '7px 10px', borderRadius: 8, border: '1px solid #DCE6EA', fontSize: 13.5,
  fontFamily: "'Plus Jakarta Sans', sans-serif", color: '#16232B', outline: 'none',
  background: '#fff',
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
    <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #DCE6EA', padding: '22px 26px', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18, paddingBottom: 14, borderBottom: '1px solid #EDF2F4' }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: '#EAF3F6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon size={16} color="#1E6E8C" />
        </div>
        <span style={{ fontSize: 14, fontWeight: 700, color: '#16232B' }}>{title}</span>
      </div>
      {children}
    </div>
  )
}

/**
 * Uma linha da ficha: rótulo à esquerda, campo à direita.
 *
 * A coluna de 180px é a mesma do resto do cartão, e é ela que faz os campos
 * ficarem alinhados entre si em vez de cada um começar onde seu rótulo acabou.
 * Em tela estreita a linha quebra e o campo desce inteiro.
 */
function LinhaFicha({ rotulo, topo = false, children }: { rotulo: string; topo?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: topo ? 'flex-start' : 'center', flexWrap: 'wrap' }}>
      <span style={{ fontSize: 12.5, color: '#6B818C', minWidth: 180, flexShrink: 0, paddingTop: topo ? 7 : 0 }}>{rotulo}</span>
      <div style={{ flex: 1, minWidth: 240 }}>{children}</div>
    </div>
  )
}

/* ──────────────────────────────────────────────
   New Consulta Modal
────────────────────────────────────────────── */
interface NewConsultaForm {
  procedimento: string
  data_consulta: string
  profissional_id: string
  duracao_minutos: string
  status: ConsultaStatus
  valor_pago: string
  observacoes: string
}

const DURACOES = [15, 30, 45, 60, 90, 120]

function NewConsultaModal({ leadId, profissionais, onClose, onSaved }: { leadId: string; profissionais: Profissional[]; onClose: () => void; onSaved: (c: Consulta) => void }) {
  const [form, setForm] = useState<NewConsultaForm>({ procedimento: '', data_consulta: '', profissional_id: '', duracao_minutos: '60', status: 'agendada', valor_pago: '', observacoes: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = (field: keyof NewConsultaForm, value: string) => setForm((f) => ({ ...f, [field]: value }))

  const handleSave = async () => {
    if (!form.procedimento.trim() || !form.data_consulta) { setError('Preencha os campos obrigatórios.'); return }
    setSaving(true); setError('')
    const { data, error: err } = await supabase.from('consultas').insert({
      lead_id: leadId,
      profissional_id: form.profissional_id || null,
      procedimento: form.procedimento.trim(),
      data_consulta: form.data_consulta,
      duracao_minutos: Number(form.duracao_minutos),
      status: form.status,
      origem: 'equipe',
      valor_pago: form.valor_pago ? parseFloat(form.valor_pago.replace(',', '.')) : null,
      observacoes: form.observacoes.trim() || null,
    }).select().single()
    setSaving(false)
    if (err) {
      // 23P01 = exclusion_violation: a restrição `consultas_sem_sobreposicao`
      // barrou uma consulta em cima de outra na agenda desse profissional.
      setError(err.code === '23P01'
        ? 'Esse profissional já tem consulta nesse horário. Escolha outro horário ou outra agenda.'
        : 'Erro ao salvar consulta.')
      return
    }
    onSaved(data as Consulta)
    onClose()
  }

  const inputStyle: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid #DCE6EA', fontSize: 13.5, fontFamily: "'Plus Jakarta Sans', sans-serif", color: '#16232B', outline: 'none', background: '#fff', boxSizing: 'border-box' }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #DCE6EA', width: '100%', maxWidth: 480, padding: '28px 28px 24px', boxShadow: '0 8px 48px rgba(0,0,0,0.12)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#16232B' }}>Nova Consulta</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}><X size={18} color="#6B818C" /></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: '#16232B', display: 'block', marginBottom: 6 }}>Procedimento *</label>
            <input value={form.procedimento} onChange={(e) => set('procedimento', e.target.value)} placeholder="Ex: Avaliação inicial, Limpeza, Canal..." style={inputStyle}
              onFocus={(e) => (e.target.style.borderColor = '#1E6E8C')} onBlur={(e) => (e.target.style.borderColor = '#DCE6EA')} />
          </div>
          <div>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: '#16232B', display: 'block', marginBottom: 6 }}>Data da Consulta *</label>
            <input type="datetime-local" value={form.data_consulta} onChange={(e) => set('data_consulta', e.target.value)} style={inputStyle}
              onFocus={(e) => (e.target.style.borderColor = '#1E6E8C')} onBlur={(e) => (e.target.style.borderColor = '#DCE6EA')} />
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 2 }}>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: '#16232B', display: 'block', marginBottom: 6 }}>Profissional</label>
              <select value={form.profissional_id} onChange={(e) => set('profissional_id', e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                <option value="">Sem profissional definido</option>
                {profissionais.filter((p) => p.ativo).map((p) => (
                  <option key={p.id} value={p.id}>{`${p.nome} ${p.sobrenome}`.trim()}</option>
                ))}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: '#16232B', display: 'block', marginBottom: 6 }}>Duração</label>
              <select value={form.duracao_minutos} onChange={(e) => set('duracao_minutos', e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                {DURACOES.map((d) => (
                  <option key={d} value={d}>{d} min</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: '#16232B', display: 'block', marginBottom: 6 }}>Status *</label>
            <select value={form.status} onChange={(e) => set('status', e.target.value as ConsultaStatus)} style={{ ...inputStyle, cursor: 'pointer' }}>
              <option value="agendada">Agendada</option>
              <option value="realizada">Realizada</option>
              <option value="cancelada">Cancelada</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: '#16232B', display: 'block', marginBottom: 6 }}>Valor Pago (opcional)</label>
            <input type="number" min="0" step="0.01" value={form.valor_pago} onChange={(e) => set('valor_pago', e.target.value)} placeholder="0,00" style={inputStyle}
              onFocus={(e) => (e.target.style.borderColor = '#1E6E8C')} onBlur={(e) => (e.target.style.borderColor = '#DCE6EA')} />
          </div>
          <div>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: '#16232B', display: 'block', marginBottom: 6 }}>Observações (opcional)</label>
            <textarea value={form.observacoes} onChange={(e) => set('observacoes', e.target.value)} rows={3} placeholder="Anotações sobre a consulta..." style={{ ...inputStyle, resize: 'vertical' }}
              onFocus={(e) => (e.target.style.borderColor = '#1E6E8C')} onBlur={(e) => (e.target.style.borderColor = '#DCE6EA')} />
          </div>
        </div>

        {error && <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '9px 12px', fontSize: 13, color: '#DC2626', marginTop: 12 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '10px', borderRadius: 9, border: '1px solid #DCE6EA', background: '#fff', cursor: 'pointer', fontSize: 13.5, fontWeight: 600, color: '#6B818C', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Cancelar</button>
          <button onClick={handleSave} disabled={saving} style={{ flex: 2, padding: '10px', borderRadius: 9, border: 'none', background: saving ? '#4C90A8' : '#1E6E8C', cursor: saving ? 'not-allowed' : 'pointer', fontSize: 13.5, fontWeight: 600, color: '#fff', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
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
  const [profissionais, setProfissionais] = useState<Profissional[]>([])
  const [loading, setLoading] = useState(true)

  const [selectedStatus, setSelectedStatus] = useState<LeadStatus>('iniciou_conversa')
  const [savingStatus, setSavingStatus] = useState(false)
  const [statusSaved, setStatusSaved] = useState(false)
  const [statusError, setStatusError] = useState('')

  const [anotacoes, setAnotacoes] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)
  const [notesSaved, setNotesSaved] = useState(false)
  const [notesError, setNotesError] = useState('')

  /* A FICHA EDITÁVEL.

     Nome, WhatsApp e procedimentos eram só leitura aqui: um nome que a Letícia
     entendeu errado, ou um número digitado torto, só tinham conserto no banco.
     Tudo isto entra no MESMO "Salvar Ficha" que já existia — um botão por
     assunto, e não um por campo. */
  const [nome, setNome] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [whatsappValido, setWhatsappValido] = useState(false)
  /* Sem isto não dá para separar "apagou o número" de "está no meio de
     digitar": o CampoTelefone manda '' nos dois casos. Enquanto ninguém tocar
     no campo, o WhatsApp nem entra no update — e não há como zerá-lo sem
     querer. */
  const [whatsappTocado, setWhatsappTocado] = useState(false)
  const [duplicado, setDuplicado] = useState<PessoaResumo | null>(null)
  const [procedimentos, setProcedimentos] = useState<string[]>([])
  const [dataNascimento, setDataNascimento] = useState('')
  const [valorPago, setValorPago] = useState('')
  const [savingFicha, setSavingFicha] = useState(false)
  const [fichaSaved, setFichaSaved] = useState(false)
  const [fichaError, setFichaError] = useState('')

  const catalogo = useCatalogoProcedimentos()

  const [showModal, setShowModal] = useState(false)

  /* Load data */
  useEffect(() => {
    if (!id) return
    Promise.all([
      supabase.from('crm_clinica').select('*').eq('id', id).single(),
      supabase.from('consultas').select('*').eq('lead_id', id).order('data_consulta', { ascending: false }),
      supabase.from('profissionais').select('*').order('nome'),
    ]).then(([{ data: leadData }, { data: consultasData }, { data: profissionaisData }]) => {
      if (leadData) {
        setLead(leadData)
        setSelectedStatus(leadData.status)
        setAnotacoes(leadData.anotacoes ?? '')
        setNome(leadData.nome_lead ?? '')
        setWhatsapp(leadData.whatsapp_lead ?? '')
        setWhatsappValido(!!leadData.whatsapp_lead)
        setProcedimentos(leadData.procedimentos_interesse ?? [])
        setDataNascimento(leadData.data_nascimento ? leadData.data_nascimento.slice(0, 10) : '')
        setValorPago(leadData.valor_pago_acumulado !== null && leadData.valor_pago_acumulado !== undefined ? String(leadData.valor_pago_acumulado) : '')
      }
      setConsultas(consultasData ?? [])
      setProfissionais((profissionaisData ?? []) as Profissional[])
      setLoading(false)
    })
  }, [id])

  /* Supabase Realtime */
  useEffect(() => {
    if (!id) return
    const channel = supabase
      .channel(`lead-detail-${id}`)
      // Realtime escuta a TABELA, não a view: o Postgres só replica tabelas.
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'crm_clinica_dados', filter: `id=eq.${id}` }, (payload) => {
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
    const { error } = await supabase.from('crm_clinica').update({ status: selectedStatus }).eq('id', lead.id)
    setSavingStatus(false)
    if (error) { setStatusError('Erro ao salvar status. Tente novamente.'); return }
    setLead((prev) => prev ? { ...prev, status: selectedStatus } : prev)
    setStatusSaved(true)
    setTimeout(() => setStatusSaved(false), 2000)
  }

  /* O WhatsApp mudou: confere se o número novo já é de outra pessoa antes de
     alguém clicar em salvar e levar um 23505 sem explicação. */
  const handleWhatsapp = (canonico: string, valido: boolean) => {
    setWhatsapp(canonico)
    setWhatsappValido(valido)
    setWhatsappTocado(true)
    setDuplicado(null)
    setFichaError('')
    if (valido && canonico !== lead?.whatsapp_lead) {
      void buscarPorWhatsapp(canonico).then((p) => setDuplicado(p && p.id !== lead?.id ? p : null))
    }
  }

  /* Save ficha */
  const handleSaveFicha = async () => {
    if (!lead) return
    if (whatsappTocado && !whatsappValido) {
      setFichaError('Informe um WhatsApp válido, com o código do país.')
      return
    }
    if (duplicado) { setFichaError('Esse WhatsApp já pertence a outra pessoa.'); return }

    setSavingFicha(true); setFichaError('')
    const valorNum = valorPago ? parseFloat(valorPago.replace(',', '.')) : null
    const campos: Record<string, unknown> = {
      nome_lead: nome.trim() || null,
      // O array é que se grava. `procedimento_interesse` é calculada na view —
      // escrever nela é escrever numa expressão.
      procedimentos_interesse: procedimentos,
      data_nascimento: dataNascimento || null,
      valor_pago_acumulado: valorNum,
    }
    if (whatsappTocado) campos.whatsapp_lead = whatsapp

    /* `.select()` traz a linha DE VOLTA, e é ela que vale — não o que foi
       enviado. A trigger `crm_procedimentos_validos` normaliza a grafia e
       reordena o array, e `procedimento_interesse` é calculada na leitura.
       Espelhar isso à mão daria uma tela que discorda do banco até o F5. */
    const { data: salvo, error } = await supabase.from('crm_clinica')
      .update(campos).eq('id', lead.id).select().single()
    setSavingFicha(false)
    if (error) {
      if (error.code === ERRO_DUPLICADO) {
        setFichaError('Esse WhatsApp acabou de ser cadastrado para outra pessoa.')
        void buscarPorWhatsapp(whatsapp).then(setDuplicado)
        return
      }
      // 23514 = a trigger `crm_procedimentos_validos`, do banco: procedimento
      // que não existe mais no catálogo.
      setFichaError(error.code === '23514'
        ? 'Algum procedimento escolhido não está mais no catálogo da clínica.'
        : 'Erro ao salvar. Tente novamente.')
      return
    }

    const atualizado = salvo as LeadClinica
    setLead(atualizado)
    // E os campos acompanham o que o banco gravou: quem digitou "lentes de
    // contato" vê a caixa certa marcada, sem a ficha continuar "alterada".
    setNome(atualizado.nome_lead ?? '')
    setProcedimentos(atualizado.procedimentos_interesse ?? [])
    setWhatsappTocado(false)
    setFichaSaved(true)
    setTimeout(() => setFichaSaved(false), 2000)
  }

  /* Save notes */
  const handleSaveNotes = async () => {
    if (!lead) return
    setSavingNotes(true); setNotesError('')
    const { error } = await supabase.from('crm_clinica').update({ anotacoes }).eq('id', lead.id)
    setSavingNotes(false)
    if (error) { setNotesError('Erro ao salvar anotações. Tente novamente.'); return }
    setLead((prev) => prev ? { ...prev, anotacoes } : prev)
    setNotesSaved(true)
    setTimeout(() => setNotesSaved(false), 2000)
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '80vh' }}>
        <div style={{ width: 32, height: 32, border: '3px solid #EAF3F6', borderTopColor: '#1E6E8C', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  if (!lead) {
    return (
      <div style={{ padding: '32px 36px' }}>
        <p style={{ color: '#6B818C' }}>Lead não encontrado.</p>
        <button onClick={() => navigate('/leads')} style={{ marginTop: 12, background: 'none', border: 'none', color: '#1E6E8C', cursor: 'pointer', fontWeight: 600, fontSize: 13.5, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>← Voltar</button>
      </div>
    )
  }

  const statusStyle = STATUS_STYLE[lead.status]

  /* O botão só acende quando há o que salvar — e a pendência é comparada com o
     que está GRAVADO, não com um sinalizador de "mexeu". Mexer e voltar ao
     valor original deixa de contar, e o `setLead` do salvar zera tudo sozinho.
     A ordem das caixas não conta como diferença: elas entram na ordem em que
     foram marcadas, e o banco devolve na ordem em que foram gravadas. */
  const fichaAlterada =
    nome.trim() !== (lead.nome_lead ?? '') ||
    (whatsappTocado && whatsapp !== (lead.whatsapp_lead ?? '')) ||
    [...procedimentos].sort().join('|') !== [...(lead.procedimentos_interesse ?? [])].sort().join('|') ||
    dataNascimento !== (lead.data_nascimento ? lead.data_nascimento.slice(0, 10) : '') ||
    valorPago !== (lead.valor_pago_acumulado !== null && lead.valor_pago_acumulado !== undefined ? String(lead.valor_pago_acumulado) : '')

  return (
    <div style={{ padding: '28px 36px', maxWidth: 900, margin: '0 auto' }}>

      {/* Back button */}
      <button className="fade-in" onClick={() => navigate(isPaciente(lead.status) ? '/clientes' : '/leads')}
        style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: '#6B818C', fontSize: 13, fontWeight: 500, fontFamily: "'Plus Jakarta Sans', sans-serif", marginBottom: 20, padding: 0 }}>
        <ArrowLeft size={15} /> Voltar para {isPaciente(lead.status) ? 'Clientes' : 'Leads'}
      </button>

      {/* Header */}
      <div className="fade-in-1" style={{ background: '#fff', borderRadius: 14, border: '1px solid #DCE6EA', padding: '22px 26px', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#16232B', margin: 0 }}>{lead.nome_lead ?? 'Sem nome'}</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10, flexWrap: 'wrap' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: statusStyle.bg, color: statusStyle.color, whiteSpace: 'nowrap' }}>
                {statusStyle.pulse && <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusStyle.color, animation: 'pulse-dot 1.4s ease infinite', display: 'inline-block' }} />}
                {STATUS_OPTIONS.find((o) => o.value === lead.status)?.label}
              </span>
              {lead.whatsapp_lead && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: '#6B818C' }}>
                  <Phone size={13} /> {formatarParaExibicao(lead.whatsapp_lead)}
                </span>
              )}
              {lead.ultima_mensagem && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: '#6B818C' }}>
                  <Clock size={13} /> Última interação: {fmtDate(lead.ultima_mensagem)}
                </span>
              )}
              {lead.inicio_atendimento && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: '#6B818C' }}>
                  <CalendarDays size={13} /> Início do atendimento: {fmtDate(lead.inicio_atendimento)}
                </span>
              )}
            </div>
          </div>

          {lead.whatsapp_lead && (
            <button onClick={() => navigate(`/conversas?lead=${lead.id}`)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 15px', borderRadius: 9, border: '1px solid #DCE6EA', background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#1E6E8C', fontFamily: "'Plus Jakarta Sans', sans-serif", whiteSpace: 'nowrap' }}>
              <MessagesSquare size={14} /> Ver conversa
            </button>
          )}
        </div>
      </div>

      {/* Histórico de Consultas */}
      <div className="fade-in-2">
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #DCE6EA', padding: '22px 26px', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, paddingBottom: 14, borderBottom: '1px solid #EDF2F4' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: '#EAF3F6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CalendarDays size={16} color="#1E6E8C" />
              </div>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#16232B' }}>Histórico de Consultas</span>
            </div>
            <button onClick={() => setShowModal(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 9, border: 'none', background: '#1E6E8C', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#fff', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
              <Plus size={14} /> Nova Consulta
            </button>
          </div>

          {consultas.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '36px 0', color: '#B9C8CE' }}>
              <CalendarDays size={32} strokeWidth={1.2} style={{ marginBottom: 8 }} />
              <div style={{ fontSize: 13.5 }}>Nenhuma consulta registrada</div>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #DCE6EA' }}>
                    {['Procedimento', 'Data', 'Profissional', 'Status', 'Valor Pago', 'Observações'].map((h) => (
                      <th key={h} style={{ textAlign: 'left', padding: '8px 12px', fontSize: 12, fontWeight: 600, color: '#6B818C', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {consultas.map((c, idx) => {
                    const cs = STATUS_CONSULTA[c.status]
                    const prof = profissionais.find((p) => p.id === c.profissional_id)
                    return (
                      <tr key={c.id} style={{ borderBottom: '1px solid #EDF2F4', background: idx % 2 === 0 ? '#fff' : '#F7FAFB' }}>
                        <td style={{ padding: '11px 12px', fontWeight: 600, color: '#16232B' }}>{c.procedimento}</td>
                        <td style={{ padding: '11px 12px', color: '#6B818C', whiteSpace: 'nowrap' }}>
                          {fmtDate(c.data_consulta)}
                          <span style={{ color: '#B9C8CE' }}> · {c.duracao_minutos} min</span>
                        </td>
                        <td style={{ padding: '11px 12px', color: '#6B818C', whiteSpace: 'nowrap' }}>
                          {prof ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ width: 8, height: 8, borderRadius: '50%', background: prof.cor, display: 'inline-block', flexShrink: 0 }} />
                              {`${prof.nome} ${prof.sobrenome}`.trim()}
                            </span>
                          ) : '—'}
                        </td>
                        <td style={{ padding: '11px 12px' }}>
                          <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 11.5, fontWeight: 600, background: cs.bg, color: cs.color, whiteSpace: 'nowrap' }}>
                            {ROTULO_CONSULTA[c.status]}
                          </span>
                        </td>
                        <td style={{ padding: '11px 12px', color: '#6B818C' }}>{fmtCurrency(c.valor_pago)}</td>
                        <td style={{ padding: '11px 12px', color: '#6B818C', maxWidth: 200 }}>{c.observacoes ?? '—'}</td>
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

          {/* O RESUMO CONTINUA SÓ LEITURA: quem escreve é a Letícia, pela
              ferramenta `atualizar_ficha`. Editá-lo aqui seria apagar na mão o
              que ela vai reescrever na próxima mensagem. */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
            <span style={{ fontSize: 12.5, color: '#6B818C', minWidth: 180, flexShrink: 0, paddingTop: 2 }}>Resumo da Conversa</span>
            <span style={{ fontSize: 13.5, color: '#16232B', lineHeight: 1.6 }}>{lead.resumo_conversa || '—'}</span>
          </div>

          <div style={{ borderTop: '1px solid #EDF2F4', margin: '18px 0' }} />

          {/* A FICHA, EDITÁVEL — E COM UM BOTÃO SÓ.

              Um "Salvar" por campo seria seis botões num cartão; o assunto é um
              só ("os dados desta pessoa"), então o botão é um só. É a mesma
              divisão que já valia aqui: Status e Anotações têm o seu, porque
              são outras perguntas. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            <LinhaFicha rotulo="Nome">
              <input
                value={nome}
                onChange={(e) => { setNome(e.target.value); setFichaError('') }}
                placeholder="Nome completo"
                style={{ ...campoStyle, width: '100%', boxSizing: 'border-box' }}
                onFocus={(e) => (e.target.style.borderColor = '#1E6E8C')}
                onBlur={(e) => (e.target.style.borderColor = '#DCE6EA')}
              />
            </LinhaFicha>

            {/* O MESMO CampoTelefone das telas de cadastro: a regra de país e de
                contagem de dígitos mora num lugar só, e o que sai daqui já é o
                canônico do banco (dígitos com DDI). */}
            <LinhaFicha rotulo="WhatsApp" topo>
              <CampoTelefone
                valor={whatsapp}
                onChange={handleWhatsapp}
                rotulo=""
                marcador={false}
                aviso={duplicado && (
                  <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: '10px 12px', fontSize: 12.5, color: '#B45309', lineHeight: 1.5 }}>
                    Esse número já é de <strong>{duplicado.nome_lead ?? 'um contato sem nome'}</strong>.
                    <button
                      onClick={() => navigate(`/leads/${duplicado.id}`)}
                      style={{ display: 'block', marginTop: 6, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 12.5, fontWeight: 700, color: '#1E6E8C', fontFamily: "'Plus Jakarta Sans', sans-serif" }}
                    >
                      Abrir a ficha dessa pessoa →
                    </button>
                  </div>
                )}
              />
            </LinhaFicha>

            {/* Caixas, e não texto livre — a mesma trava do cadastro e da
                Letícia. O banco confere de novo (trigger
                `crm_procedimentos_validos`, migração 0022). */}
            <LinhaFicha rotulo="Procedimentos de Interesse" topo>
              {catalogo.length === 0 ? (
                <div style={{ fontSize: 12.5, color: '#6B818C', paddingTop: 6 }}>Carregando os procedimentos da clínica...</div>
              ) : (
                <div style={{
                  border: '1px solid #DCE6EA', borderRadius: 9, padding: 8, background: '#fff',
                  maxHeight: 180, overflowY: 'auto',
                  display: 'grid', gap: 2,
                  gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                }}>
                  {catalogo.map((p) => {
                    const marcado = procedimentos.includes(p)
                    return (
                      <label key={p} style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '6px 8px', borderRadius: 7, cursor: 'pointer',
                        background: marcado ? '#EAF3F6' : 'transparent',
                        fontSize: 13, color: marcado ? '#16232B' : '#6B818C',
                        fontWeight: marcado ? 600 : 400,
                      }}>
                        <input
                          type="checkbox" checked={marcado}
                          onChange={() => {
                            setProcedimentos((atual) => marcado ? atual.filter((x) => x !== p) : [...atual, p])
                            setFichaError('')
                          }}
                          style={{ accentColor: '#1E6E8C', cursor: 'pointer', flexShrink: 0 }}
                        />
                        {p}
                      </label>
                    )
                  })}
                </div>
              )}
            </LinhaFicha>

            <LinhaFicha rotulo="Data de Nascimento">
              <input
                type="date"
                value={dataNascimento}
                onChange={(e) => { setDataNascimento(e.target.value); setFichaError('') }}
                style={campoStyle}
                onFocus={(e) => (e.target.style.borderColor = '#1E6E8C')}
                onBlur={(e) => (e.target.style.borderColor = '#DCE6EA')}
              />
            </LinhaFicha>

            <LinhaFicha rotulo="Valor Pago Acumulado (R$)">
              <input
                type="number"
                min="0"
                step="0.01"
                value={valorPago}
                onChange={(e) => { setValorPago(e.target.value); setFichaError('') }}
                placeholder="0,00"
                style={{ ...campoStyle, width: 160 }}
                onFocus={(e) => (e.target.style.borderColor = '#1E6E8C')}
                onBlur={(e) => (e.target.style.borderColor = '#DCE6EA')}
              />
            </LinhaFicha>

            {fichaError && (
              <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '8px 12px', fontSize: 12.5, color: '#DC2626' }}>{fichaError}</div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <button onClick={handleSaveFicha} disabled={savingFicha || !fichaAlterada || !!duplicado}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 9, border: 'none', background: fichaSaved ? '#1A7A48' : (!fichaAlterada || duplicado) ? '#DCE6EA' : (savingFicha ? '#4C90A8' : '#1E6E8C'), color: (!fichaSaved && (!fichaAlterada || duplicado)) ? '#6B818C' : '#fff', cursor: (savingFicha || !fichaAlterada || duplicado) ? 'default' : 'pointer', fontSize: 13, fontWeight: 600, fontFamily: "'Plus Jakarta Sans', sans-serif", transition: 'background 0.2s' }}>
                <Save size={13} /> {fichaSaved ? 'Salvo!' : savingFicha ? 'Salvando...' : 'Salvar Ficha'}
              </button>
              {/* Botão apagado sem motivo escrito parece botão quebrado. */}
              {!fichaSaved && !fichaAlterada && (
                <span style={{ fontSize: 12, color: '#6B818C' }}>Nada mudou por aqui.</span>
              )}
            </div>
          </div>

          <div style={{ borderTop: '1px solid #EDF2F4', margin: '18px 0' }} />

          {/* Status do Lead */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              value={selectedStatus}
              onChange={(e) => { setSelectedStatus(e.target.value as LeadStatus); setStatusError('') }}
              style={{ flex: 1, minWidth: 200, padding: '9px 12px', borderRadius: 9, border: '1px solid #DCE6EA', fontSize: 13.5, fontFamily: "'Plus Jakarta Sans', sans-serif", color: '#16232B', outline: 'none', background: '#fff', cursor: 'pointer' }}
              onFocus={(e) => (e.target.style.borderColor = '#1E6E8C')}
              onBlur={(e) => (e.target.style.borderColor = '#DCE6EA')}>
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <button onClick={handleSaveStatus} disabled={savingStatus || selectedStatus === lead.status}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 9, border: 'none', background: statusSaved ? '#1A7A48' : (selectedStatus === lead.status ? '#DCE6EA' : '#1E6E8C'), color: selectedStatus === lead.status ? '#6B818C' : '#fff', cursor: selectedStatus === lead.status ? 'default' : 'pointer', fontSize: 13.5, fontWeight: 600, fontFamily: "'Plus Jakarta Sans', sans-serif", transition: 'background 0.2s' }}>
              <Save size={14} /> {statusSaved ? 'Salvo!' : savingStatus ? 'Salvando...' : 'Salvar Status'}
            </button>
          </div>
          {statusError && (
            <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '8px 12px', fontSize: 12.5, color: '#DC2626', marginTop: 10 }}>{statusError}</div>
          )}

          <div style={{ borderTop: '1px solid #EDF2F4', margin: '18px 0' }} />

          {/* Anotações */}
          <textarea
            value={anotacoes}
            onChange={(e) => setAnotacoes(e.target.value)}
            rows={5}
            placeholder="Escreva suas anotações sobre este lead..."
            style={{ width: '100%', padding: '10px 14px', borderRadius: 9, border: '1px solid #DCE6EA', fontSize: 13.5, fontFamily: "'Plus Jakarta Sans', sans-serif", color: '#16232B', outline: 'none', resize: 'vertical', lineHeight: 1.6, boxSizing: 'border-box' }}
            onFocus={(e) => (e.target.style.borderColor = '#1E6E8C')}
            onBlur={(e) => (e.target.style.borderColor = '#DCE6EA')}
          />
          {notesError && (
            <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '8px 12px', fontSize: 12.5, color: '#DC2626', marginTop: 8 }}>{notesError}</div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
            <button onClick={handleSaveNotes} disabled={savingNotes}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 9, border: 'none', background: notesSaved ? '#1A7A48' : (savingNotes ? '#4C90A8' : '#1E6E8C'), color: '#fff', cursor: savingNotes ? 'not-allowed' : 'pointer', fontSize: 13.5, fontWeight: 600, fontFamily: "'Plus Jakarta Sans', sans-serif", transition: 'background 0.2s' }}>
              <Save size={14} /> {notesSaved ? 'Salvo!' : savingNotes ? 'Salvando...' : 'Salvar Anotações'}
            </button>
          </div>

        </SectionCard>
      </div>

      {/* A ZONA DE PERIGO É A ÚLTIMA COISA DA PÁGINA.

          Não é o fim por descuido: é a ação mais destrutiva que a ficha
          oferece, e ação destrutiva não fica no caminho do olho de quem só
          veio conferir um telefone. */}
      <div className="fade-in-4">
        <ApagarEstaPessoa pessoa={lead} />
      </div>

      {showModal && (
        <NewConsultaModal
          leadId={lead.id}
          profissionais={profissionais}
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
