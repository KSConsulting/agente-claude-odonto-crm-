import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Download, FileText, ChevronDown, Users, UserCheck, UserPlus, X, ArrowRight } from 'lucide-react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { supabase } from '../lib/supabase'
import { isPaciente } from '../lib/pessoas'
import { buscarPorWhatsapp, ERRO_DUPLICADO, type PessoaResumo } from '../lib/contatos'
import { apenasDigitos, formatarParaExibicao } from '../lib/telefones'
import CampoTelefone from './CampoTelefone'
import AvisoBaixaConsulta from './AvisoBaixaConsulta'
import type { LeadClinica, LeadStatus } from '../types'

/* ──────────────────────────────────────────────
   Implementação compartilhada entre /leads e /clientes.

   As duas páginas leem a MESMA tabela (`crm_clinica`) e se diferenciam
   apenas pelo status: quem já realizou consulta é Paciente, o resto é
   Contato. Por isso uma única implementação com `mode`, em vez de dois
   arquivos quase idênticos.
────────────────────────────────────────────── */

export type PessoasMode = 'leads' | 'clientes'

interface ModeConfig {
  titulo: string
  subtitulo: string
  explicacao: string
  outraPagina: { rota: string; label: string }
  icone: typeof Users
  corIcone: string
  botaoNovo: string
  tipoPadrao: 'lead' | 'paciente'
  arquivo: string
  vazio: string
  /**
   * A última coluna da tabela, que NÃO é a mesma nas duas páginas.
   *
   * Em Contatos a pergunta é "quem tem consulta marcada?" → `data_agendamento`,
   * a próxima. Em Pacientes essa coluna seria sempre vazia: virar paciente
   * significa que a consulta aconteceu, e o trigger da `0015` zera
   * `data_agendamento` quando não sobra nenhuma ativa. Lá a pergunta é outra —
   * "quando essa pessoa esteve aqui?" — e quem responde é `ultima_consulta`.
   */
  colunaData: { titulo: string; campo: 'data_agendamento' | 'ultima_consulta'; vazio: string }
}

const CONFIG: Record<PessoasMode, ModeConfig> = {
  leads: {
    titulo: 'Contatos (Leads)',
    subtitulo: 'Pessoas que ainda não compareceram a nenhuma consulta.',
    explicacao: 'Estão conversando, aguardando retorno ou já com horário marcado. Quando o status virar “Consulta Realizada”, a pessoa passa sozinha para a outra página.',
    outraPagina: { rota: '/clientes', label: 'Ver Pacientes (Clientes)' },
    icone: Users,
    corIcone: '#1E6E8C',
    botaoNovo: 'Novo Contato',
    tipoPadrao: 'lead',
    arquivo: 'contatos',
    vazio: 'Nenhum contato nesse período.',
    colunaData: { titulo: 'Consulta Marcada', campo: 'data_agendamento', vazio: 'Sem consulta' },
  },
  clientes: {
    titulo: 'Pacientes (Clientes)',
    subtitulo: 'Pessoas que já realizaram pelo menos uma consulta.',
    explicacao: 'Viraram cliente da clínica. Quem agendou mas ainda não foi atendido continua na outra página, como contato.',
    outraPagina: { rota: '/leads', label: 'Ver Contatos (Leads)' },
    icone: UserCheck,
    corIcone: '#1A7A48',
    botaoNovo: 'Novo Paciente',
    tipoPadrao: 'paciente',
    arquivo: 'pacientes',
    vazio: 'Nenhum paciente nesse período.',
    // Paciente sem data aqui é cadastro manual: "Novo Paciente" grava o status
    // direto, sem criar consulta. Dizer isso é melhor que um traço mudo.
    colunaData: { titulo: 'Última Consulta', campo: 'ultima_consulta', vazio: 'Cadastrado à mão' },
  },
}

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

interface NewLeadModalProps {
  titulo: string
  tipoPadrao: 'lead' | 'paciente'
  onClose: () => void
  onSaved: (lead: LeadClinica) => void
}

function NewLeadModal({ titulo, tipoPadrao, onClose, onSaved }: NewLeadModalProps) {
  const [form, setForm] = useState<NewLeadForm>({
    tipo: tipoPadrao, nome: '', whatsapp: '', procedimento: '', data_nascimento: '', anotacoes: '',
  })
  const [whatsappValido, setWhatsappValido] = useState(false)
  const [duplicado, setDuplicado] = useState<PessoaResumo | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  const set = (field: keyof NewLeadForm, value: string) => setForm((f) => ({ ...f, [field]: value }))

  const handleWhatsapp = (canonico: string, valido: boolean) => {
    set('whatsapp', canonico)
    setWhatsappValido(valido)
    setDuplicado(null)
    setError('')
    // Só vale procurar quando o número está completo — com número pela metade
    // a busca não acha nada e a equipe acha que está livre.
    if (valido) buscarPorWhatsapp(canonico).then(setDuplicado)
  }

  const handleSave = async () => {
    if (!form.nome.trim()) { setError('O nome é obrigatório.'); return }
    if (!whatsappValido) { setError('Informe um WhatsApp válido, com o código do país.'); return }
    if (duplicado) { setError('Esse WhatsApp já pertence a outra pessoa.'); return }
    setSaving(true); setError('')

    const status: LeadStatus = form.tipo === 'paciente' ? 'consulta_realizada' : 'iniciou_conversa'

    const { data, error: err } = await supabase.from('crm_clinica').insert({
      nome_lead: form.nome.trim(),
      whatsapp_lead: form.whatsapp,
      status,
      procedimento_interesse: form.procedimento.trim() || null,
      data_nascimento: form.data_nascimento || null,
      anotacoes: form.anotacoes.trim() || null,
    }).select().single()

    setSaving(false)
    if (err) {
      // Rede de segurança: entre a busca acima e este insert, o Agente de IA
      // pode ter criado a mesma pessoa. Quem decide é o índice do banco.
      if (err.code === ERRO_DUPLICADO) {
        setError('Esse WhatsApp acabou de ser cadastrado para outra pessoa.')
        buscarPorWhatsapp(form.whatsapp).then(setDuplicado)
        return
      }
      setError('Erro ao cadastrar. Tente novamente.')
      return
    }
    onSaved(data as LeadClinica)
    onClose()
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid #DCE6EA',
    fontSize: 13.5, fontFamily: "'Plus Jakarta Sans', sans-serif", color: '#16232B',
    outline: 'none', background: '#fff', boxSizing: 'border-box',
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #DCE6EA', width: '100%', maxWidth: 500, padding: '28px 28px 24px', boxShadow: '0 8px 48px rgba(0,0,0,0.12)', maxHeight: '90vh', overflowY: 'auto' }}>

        {/* Modal header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: '#EAF3F6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <UserPlus size={17} color="#1E6E8C" />
            </div>
            <span style={{ fontSize: 15, fontWeight: 700, color: '#16232B' }}>{titulo}</span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 6 }}>
            <X size={18} color="#6B818C" />
          </button>
        </div>

        {/* Tipo selector */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12.5, fontWeight: 600, color: '#16232B', display: 'block', marginBottom: 8 }}>Tipo *</label>
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
                  padding: '10px 14px', borderRadius: 10, border: `2px solid ${form.tipo === value ? '#1E6E8C' : '#DCE6EA'}`,
                  background: form.tipo === value ? '#EAF3F6' : '#fff', cursor: 'pointer', textAlign: 'left',
                  transition: 'all 0.15s',
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 700, color: form.tipo === value ? '#1E6E8C' : '#16232B' }}>{label}</div>
                <div style={{ fontSize: 11.5, color: '#6B818C', marginTop: 2 }}>{sub}</div>
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Nome */}
          <div>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: '#16232B', display: 'block', marginBottom: 6 }}>Nome *</label>
            <input value={form.nome} onChange={(e) => set('nome', e.target.value)} placeholder="Nome completo" style={inputStyle}
              onFocus={(e) => (e.target.style.borderColor = '#1E6E8C')} onBlur={(e) => (e.target.style.borderColor = '#DCE6EA')} />
          </div>

          {/* WhatsApp */}
          <CampoTelefone
            valor={form.whatsapp}
            onChange={handleWhatsapp}
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

          {/* Procedimento */}
          <div>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: '#16232B', display: 'block', marginBottom: 6 }}>
              Procedimento de Interesse <span style={{ color: '#6B818C', fontWeight: 400 }}>(opcional)</span>
            </label>
            <input value={form.procedimento} onChange={(e) => set('procedimento', e.target.value)} placeholder="Ex: Prótese Dentária" style={inputStyle}
              onFocus={(e) => (e.target.style.borderColor = '#1E6E8C')} onBlur={(e) => (e.target.style.borderColor = '#DCE6EA')} />
          </div>

          {/* Data de nascimento */}
          <div>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: '#16232B', display: 'block', marginBottom: 6 }}>
              Data de Nascimento <span style={{ color: '#6B818C', fontWeight: 400 }}>(opcional)</span>
            </label>
            <input type="date" value={form.data_nascimento} onChange={(e) => set('data_nascimento', e.target.value)} style={inputStyle}
              onFocus={(e) => (e.target.style.borderColor = '#1E6E8C')} onBlur={(e) => (e.target.style.borderColor = '#DCE6EA')} />
          </div>

          {/* Anotações */}
          <div>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: '#16232B', display: 'block', marginBottom: 6 }}>
              Anotações <span style={{ color: '#6B818C', fontWeight: 400 }}>(opcional)</span>
            </label>
            <textarea value={form.anotacoes} onChange={(e) => set('anotacoes', e.target.value)} rows={3} placeholder="Observações iniciais sobre o contato..." style={{ ...inputStyle, resize: 'vertical' }}
              onFocus={(e) => (e.target.style.borderColor = '#1E6E8C')} onBlur={(e) => (e.target.style.borderColor = '#DCE6EA')} />
          </div>
        </div>

        {error && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '9px 12px', fontSize: 13, color: '#DC2626', marginTop: 12 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '10px', borderRadius: 9, border: '1px solid #DCE6EA', background: '#fff', cursor: 'pointer', fontSize: 13.5, fontWeight: 600, color: '#6B818C', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
            Cancelar
          </button>
          <button onClick={handleSave} disabled={saving || !!duplicado}
            style={{ flex: 2, padding: '10px', borderRadius: 9, border: 'none', background: duplicado ? '#DCE6EA' : saving ? '#4C90A8' : '#1E6E8C', cursor: (saving || duplicado) ? 'not-allowed' : 'pointer', fontSize: 13.5, fontWeight: 600, color: duplicado ? '#6B818C' : '#fff', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
            {saving ? 'Cadastrando...' : 'Cadastrar'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ──────────────────────────────────────────────
   Página
────────────────────────────────────────────── */
export default function PessoasPage({ mode }: { mode: PessoasMode }) {
  const cfg = CONFIG[mode]
  const Icone = cfg.icone
  const navigate = useNavigate()

  const [allLeads, setAllLeads] = useState<LeadClinica[]>([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<PeriodKey>('this_month')
  const [customRange, setCustomRange] = useState<DateRange>({ start: new Date(), end: new Date() })
  const [search, setSearch] = useState('')
  const [showNewLead, setShowNewLead] = useState(false)

  // Extraído para poder ser chamado de novo depois de uma baixa de consulta:
  // confirmar que a pessoa compareceu MUDA ELA DE TELA (vira Paciente), e a
  // lista precisa refletir isso na hora.
  const recarregarPessoas = useCallback(() =>
    supabase.from('crm_clinica').select('*').order('created_at', { ascending: false })
      .then(({ data }) => { setAllLeads(data ?? []); setLoading(false) }),
  [])

  useEffect(() => { recarregarPessoas() }, [recarregarPessoas])

  const handleNewLeadSaved = (lead: LeadClinica) => {
    setAllLeads((prev) => [lead, ...prev])
    // Cadastrou alguém que pertence à outra página? Leva o usuário até lá,
    // senão o registro "some" logo após ser criado.
    const pertenceAqui = mode === 'clientes' ? isPaciente(lead.status) : !isPaciente(lead.status)
    if (!pertenceAqui) navigate(cfg.outraPagina.rota)
  }

  const range = getPeriodRange(period, customRange)

  const periodFiltered = allLeads.filter((l) => inRange(l.created_at, range))

  const searched = periodFiltered.filter((l) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    // O telefone é comparado só por dígitos: quem busca digita "(11) 98525" ou
    // "11985254512", e o banco guarda "5511987654321". Comparar o texto cru
    // faria a busca por telefone nunca achar nada.
    const digitos = apenasDigitos(search)
    return (
      (l.nome_lead ?? '').toLowerCase().includes(q) ||
      (digitos.length > 0 && (l.whatsapp_lead ?? '').includes(digitos))
    )
  })

  const displayed = searched.filter((l) =>
    mode === 'clientes' ? isPaciente(l.status) : !isPaciente(l.status)
  )

  /* ── Export CSV ── */
  const exportCSV = () => {
    const rows = [
      ['Nome', 'Telefone', 'Procedimento', 'Status', 'Início Atendimento', cfg.colunaData.titulo],
      ...displayed.map((l) => [
        l.nome_lead ?? '',
        formatarParaExibicao(l.whatsapp_lead),
        l.procedimento_interesse ?? '',
        STATUS_LABELS[l.status],
        fmtDate(l.inicio_atendimento),
        fmtDate(l[cfg.colunaData.campo]),
      ]),
    ]
    const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url
    a.download = `${cfg.arquivo}_${new Date().toISOString().split('T')[0]}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  /* ── Export PDF ── */
  const exportPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape' })
    doc.setFont('helvetica')
    doc.setFontSize(14)
    doc.text(cfg.titulo, 14, 16)
    doc.setFontSize(10)
    doc.setTextColor(120)
    doc.text(`Exportado em ${new Date().toLocaleString('pt-BR')}`, 14, 22)
    autoTable(doc, {
      startY: 28,
      head: [['Nome', 'Telefone', 'Procedimento', 'Status', 'Início Atendimento', cfg.colunaData.titulo]],
      body: displayed.map((l) => [
        l.nome_lead ?? '—',
        formatarParaExibicao(l.whatsapp_lead) || '—',
        l.procedimento_interesse ?? '—',
        STATUS_LABELS[l.status],
        fmtDate(l.inicio_atendimento),
        fmtDate(l[cfg.colunaData.campo]),
      ]),
      // #1E6E8C e #F7FAFB — a paleta azul, em RGB
      headStyles: { fillColor: [30, 110, 140], fontSize: 9, fontStyle: 'bold' },
      bodyStyles: { fontSize: 8.5 },
      alternateRowStyles: { fillColor: [247, 250, 251] },
      styles: { font: 'helvetica', cellPadding: 4 },
    })
    doc.save(`${cfg.arquivo}_${new Date().toISOString().split('T')[0]}.pdf`)
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '80vh' }}>
        <div style={{ width: 32, height: 32, border: '3px solid #EAF3F6', borderTopColor: '#1E6E8C', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  return (
    <div style={{ padding: '32px 36px' }}>

      {/* Header */}
      <div className="fade-in-1" style={{ marginBottom: 22, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ maxWidth: 660 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: `${cfg.corIcone}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icone size={18} color={cfg.corIcone} strokeWidth={2} />
            </div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#16232B', margin: 0 }}>{cfg.titulo}</h1>
            <span style={{ background: '#EAF3F6', color: '#1E6E8C', borderRadius: 20, fontSize: 12.5, fontWeight: 700, padding: '2px 10px' }}>
              {displayed.length}
            </span>
          </div>

          {/* Mesmo tamanho da copy do Dashboard */}
          <p style={{ fontSize: 16.5, fontWeight: 500, color: '#3A5560', marginTop: 10, marginBottom: 0, lineHeight: 1.45 }}>
            {cfg.subtitulo}
          </p>

          <p style={{ fontSize: 13, color: '#6B818C', marginTop: 8, marginBottom: 0, lineHeight: 1.6 }}>
            {cfg.explicacao}
          </p>

          <button
            onClick={() => navigate(cfg.outraPagina.rota)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 12, padding: '6px 12px', borderRadius: 8, border: '1px solid #DCE6EA', background: '#fff', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: '#1E6E8C', fontFamily: "'Plus Jakarta Sans', sans-serif", transition: 'background 0.15s' }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = '#EAF3F6')}
            onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = '#fff')}
          >
            {cfg.outraPagina.label} <ArrowRight size={13} />
          </button>
        </div>

        <button
          onClick={() => setShowNewLead(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px', borderRadius: 10, border: 'none', background: '#1E6E8C', cursor: 'pointer', fontSize: 13.5, fontWeight: 600, color: '#fff', fontFamily: "'Plus Jakarta Sans', sans-serif", flexShrink: 0, transition: 'background 0.15s' }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = '#17576F')}
          onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = '#1E6E8C')}
        >
          <UserPlus size={16} /> {cfg.botaoNovo}
        </button>
      </div>

      {/* Consultas que já aconteceram e ninguém confirmou. Some sozinho
          quando não há nenhuma. */}
      <div className="fade-in-2">
        <AvisoBaixaConsulta onBaixa={recarregarPessoas} />
      </div>

      {/* Period filter */}
      <div className="fade-in-2" style={{ marginBottom: 20, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
        <div style={{ display: 'inline-flex', background: '#fff', border: '1px solid #DCE6EA', borderRadius: 10, padding: 4, gap: 2, flexWrap: 'wrap' }}>
          {PERIOD_OPTIONS.map(({ key, label }) => (
            <button key={key} onClick={() => setPeriod(key)}
              style={{ padding: '6px 12px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: period === key ? 600 : 500, fontFamily: "'Plus Jakarta Sans', sans-serif", background: period === key ? '#1E6E8C' : 'transparent', color: period === key ? '#fff' : '#6B818C', transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 4 }}>
              {label}{key === 'custom' && <ChevronDown size={12} />}
            </button>
          ))}
        </div>
        {period === 'custom' && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, background: '#fff', border: '1px solid #DCE6EA', borderRadius: 10, padding: '6px 14px', fontSize: 13 }}>
            <span style={{ color: '#6B818C' }}>De</span>
            <input type="date" max={new Date().toISOString().split('T')[0]} value={customRange.start.toISOString().split('T')[0]}
              onChange={(e) => setCustomRange((r) => ({ ...r, start: new Date(e.target.value) }))}
              style={{ border: 'none', outline: 'none', fontSize: 13, fontFamily: "'Plus Jakarta Sans', sans-serif", color: '#16232B', cursor: 'pointer' }} />
            <span style={{ color: '#6B818C' }}>até</span>
            <input type="date" max={new Date().toISOString().split('T')[0]} value={customRange.end.toISOString().split('T')[0]}
              onChange={(e) => setCustomRange((r) => ({ ...r, end: endOfDay(new Date(e.target.value)) }))}
              style={{ border: 'none', outline: 'none', fontSize: 13, fontFamily: "'Plus Jakarta Sans', sans-serif", color: '#16232B', cursor: 'pointer' }} />
          </div>
        )}
      </div>

      {/* Search + Export */}
      <div className="fade-in-3" style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 240, position: 'relative' }}>
          <Search size={15} color="#6B818C" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
          <input
            type="text"
            placeholder="Buscar por nome ou telefone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: '100%', padding: '9px 12px 9px 36px', borderRadius: 10, border: '1px solid #DCE6EA', fontSize: 13.5, fontFamily: "'Plus Jakarta Sans', sans-serif", color: '#16232B', background: '#fff', outline: 'none', transition: 'border-color 0.15s' }}
            onFocus={(e) => (e.target.style.borderColor = '#1E6E8C')}
            onBlur={(e) => (e.target.style.borderColor = '#DCE6EA')}
          />
        </div>
        <button onClick={exportCSV} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 16px', borderRadius: 10, border: '1px solid #DCE6EA', background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#16232B', fontFamily: "'Plus Jakarta Sans', sans-serif", transition: 'background 0.15s' }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = '#F2F6F7')}
          onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = '#fff')}>
          <Download size={15} /> Exportar CSV
        </button>
        <button onClick={exportPDF} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 16px', borderRadius: 10, border: '1px solid #DCE6EA', background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#16232B', fontFamily: "'Plus Jakarta Sans', sans-serif", transition: 'background 0.15s' }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = '#F2F6F7')}
          onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = '#fff')}>
          <FileText size={15} /> Exportar PDF
        </button>
      </div>

      {/* Table */}
      <div className="fade-in-4" style={{ background: '#fff', borderRadius: 14, border: '1px solid #DCE6EA', overflow: 'hidden', marginBottom: 32 }}>
        {displayed.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#6B818C', fontSize: 14 }}>
            {search ? 'Nenhum resultado para a busca.' : cfg.vazio}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #DCE6EA', background: '#F7FAFB' }}>
                  {['Nome / Telefone', 'Procedimento', 'Status', 'Início Atendimento', cfg.colunaData.titulo, ''].map((h, i) => (
                    <th key={i} style={{ textAlign: 'left', padding: '11px 16px', fontSize: 12, fontWeight: 600, color: '#6B818C', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayed.map((lead, idx) => (
                  <tr key={lead.id}
                    style={{ borderBottom: '1px solid #EDF2F4', background: idx % 2 === 0 ? '#fff' : '#F7FAFB', transition: 'background 0.12s' }}
                    onMouseEnter={(e) => ((e.currentTarget as HTMLTableRowElement).style.background = '#EAF3F6')}
                    onMouseLeave={(e) => ((e.currentTarget as HTMLTableRowElement).style.background = idx % 2 === 0 ? '#fff' : '#F7FAFB')}>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontWeight: 600, color: '#16232B' }}>{lead.nome_lead ?? '—'}</div>
                      <div style={{ fontSize: 12, color: '#6B818C', marginTop: 2 }}>{formatarParaExibicao(lead.whatsapp_lead)}</div>
                    </td>
                    <td style={{ padding: '12px 16px', color: '#6B818C' }}>{lead.procedimento_interesse ?? '—'}</td>
                    <td style={{ padding: '12px 16px' }}><StatusBadge status={lead.status} /></td>
                    <td style={{ padding: '12px 16px', color: '#6B818C', whiteSpace: 'nowrap' }}>{fmtDate(lead.inicio_atendimento)}</td>
                    <td style={{ padding: '12px 16px', color: '#6B818C', whiteSpace: 'nowrap' }}>
                      {lead[cfg.colunaData.campo]
                        ? fmtDate(lead[cfg.colunaData.campo])
                        : <span style={{ color: '#B9C8CE' }}>{cfg.colunaData.vazio}</span>}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <button onClick={() => navigate(`/leads/${lead.id}`)}
                        style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #DCE6EA', background: '#fff', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: '#1E6E8C', fontFamily: "'Plus Jakarta Sans', sans-serif", transition: 'background 0.15s, border-color 0.15s', whiteSpace: 'nowrap' }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#EAF3F6'; (e.currentTarget as HTMLButtonElement).style.borderColor = '#4C90A8' }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#fff'; (e.currentTarget as HTMLButtonElement).style.borderColor = '#DCE6EA' }}>
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
          titulo={cfg.botaoNovo}
          tipoPadrao={cfg.tipoPadrao}
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
