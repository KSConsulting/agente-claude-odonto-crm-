import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useDroppable } from '@dnd-kit/core'
import { Copy, Check, GripVertical, Inbox, ArrowRight, TriangleAlert } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { isPaciente } from '../lib/pessoas'
import FiltroPeriodo from '../components/FiltroPeriodo'
import { getPeriodRange, inRange, type DateRange, type PeriodKey } from '../lib/periodo'
import type { LeadClinica, LeadStatus } from '../types'

/**
 * Quantos cards cada coluna desenha. O resto vira "+ N outros", com link.
 *
 * ── POR QUE UM TETO, E POR QUE ELE NÃO É PERDA ─────────────────────────────
 *
 * Cada card é um alvo de arrastar, e o `closestCorners` compara a posição do
 * card na mão com a de **todos** os alvos registrados a cada movimento do
 * mouse. O custo cresce junto com o número de cards, e quem sente é quem
 * arrasta — não quem abre a página.
 *
 * Mas o motivo principal não é desempenho: **uma coluna com 300 cards já é
 * inútil como interface.** Ninguém rola 300 cards procurando alguém. A coluna
 * serve para ver quantos estão em cada etapa (o número no cabeçalho, que
 * continua sendo o total de verdade) e mexer nos mais recentes. Procurar
 * alguém é trabalho da lista, que tem busca.
 *
 * ⚠️ **O filtro de período NÃO substitui isto.** Ele é escolha de quem usa, e
 * o padrão desta tela é "Todo o período" — sem o teto, o padrão seria o pior
 * caso.
 */
const TETO_POR_COLUNA = 50

/**
 * O limite que o servidor impõe por conta própria (`max_rows`, hoje 1000).
 *
 * Não é uma escolha nossa: pedir "todos os leads" devolve no máximo isso, e
 * **sem avisar** — nem erro, nem marcação, nada. A tela compara o que chegou
 * com a contagem de verdade e diz quando estiver vendo um pedaço.
 */
const TETO_DO_SERVIDOR = 1000

/* ──────────────────────────────────────────────
   Column config
────────────────────────────────────────────── */
interface ColumnConfig {
  status: LeadStatus
  label: string
  color: string
  bg: string
  dot?: string
  pulse?: boolean
}

/**
 * As colunas do Kanban — e **esta ordem é a ordem que aparece na tela**.
 *
 * ── POR QUE O CAMINHO INTEIRO VEM PRIMEIRO ─────────────────────────────────
 *
 * O quadro se lê da esquerda para a direita, e a leitura que importa é a do
 * lead que dá certo: chegou → conversou → marcou → veio → voltou. Antes,
 * "Consulta Cancelada" e os três follow-ups ficavam **no meio** dessa
 * sequência, e "Consulta Realizada" — o desfecho — vinha depois deles. Quem
 * quisesse ver quantos chegaram ao fim precisava rolar por cima do que deu
 * errado.
 *
 * Agora são dois trechos: o caminho completo, sem interrupção, e depois o que
 * saiu dele. Cancelada abre o segundo trecho porque é o que produz os
 * follow-ups — eles são a tentativa de trazer de volta quem cancelou.
 *
 * ⚠️ As outras leituras deste array (`STATUS_MAP`, os `some()` do
 * arrastar-e-soltar) são por chave e não dependem da ordem. Reordenar mexe só
 * na tela.
 */
const COLUMNS: ColumnConfig[] = [
  // O caminho que dá certo, do começo ao fim.
  { status: 'iniciou_conversa',   label: 'Iniciou Conversa',   color: '#1E6E8C', bg: '#EAF3F6', dot: '#1E6E8C', pulse: true },
  { status: 'conversando',        label: 'Conversando',        color: '#4F46E5', bg: '#EEF2FF' },
  { status: 'consulta_agendada',  label: 'Consulta Agendada',  color: '#1A7A48', bg: '#E8F8EF' },
  { status: 'consulta_realizada', label: 'Consulta Realizada', color: '#fff',    bg: '#14532D' },
  { status: 'paciente_recorrente',label: 'Paciente Recorrente',color: '#7C3AED', bg: '#F3E8FF' },
  // E quem saiu dele: o cancelamento, e as três tentativas de trazer de volta.
  { status: 'consulta_cancelada', label: 'Consulta Cancelada', color: '#DC2626', bg: '#FEF2F2' },
  { status: 'follow_up_1_feito',  label: 'Follow-up 1',        color: '#D97706', bg: '#FFFBEB' },
  { status: 'follow_up_2_feito',  label: 'Follow-up 2',        color: '#D97706', bg: '#FFFBEB' },
  { status: 'follow_up_3_feito',  label: 'Follow-up 3',        color: '#D97706', bg: '#FFFBEB' },
]

const STATUS_MAP = Object.fromEntries(COLUMNS.map((c) => [c.status, c])) as Record<LeadStatus, ColumnConfig>

/**
 * Para onde o "+ N outros" de uma coluna leva.
 *
 * ── POR QUE A LISTA, E NÃO UM SEGUNDO EXPORTADOR AQUI ──────────────────────
 *
 * Contatos e Pacientes já são essa lista: têm busca por nome e telefone, e os
 * botões de exportar CSV e PDF — que já respeitam os filtros ligados. O que
 * faltava era poder perguntar "quem está em Follow-up 2?", e isso passou a
 * existir lá (`?etapa=`). Escrever um exportador próprio no CRM seria uma
 * segunda cópia da mesma coisa, para responder pior.
 *
 * ⚠️ **O período viaja junto na URL.** Sem isso o CRM prometeria "+312 outros"
 * e a lista abriria no padrão dela ("Este mês"), mostrando 40 — o número da
 * tela anterior viraria mentira no clique.
 *
 * E o destino muda com a etapa: "Consulta Realizada" e "Paciente Recorrente"
 * moram em Pacientes, não em Contatos. Quem sabe disso é `isPaciente()`, a
 * mesma regra que decide o "voltar" da ficha.
 */
function linkDaEtapa(status: LeadStatus, periodo: PeriodKey, faixa: DateRange): string {
  const base = isPaciente(status) ? '/clientes' : '/leads'
  const p = new URLSearchParams({ etapa: status, periodo })
  if (periodo === 'custom') {
    p.set('de', faixa.start.toISOString())
    p.set('ate', faixa.end.toISOString())
  }
  return `${base}?${p.toString()}`
}

/* ──────────────────────────────────────────────
   Helpers
────────────────────────────────────────────── */
function formatLastContact(minutes: number | null): string {
  if (minutes === null || minutes < 0) return '—'
  if (minutes < 1) return 'Agora mesmo'
  if (minutes < 60) return `${minutes}min atrás`
  const h = Math.floor(minutes / 60)
  if (h < 24) return `${h}h atrás`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d atrás`
  const mo = Math.floor(d / 30)
  return `${mo}m atrás`
}

/* ──────────────────────────────────────────────
   CopyBadge
────────────────────────────────────────────── */
function CopyBadge({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  const copy = (e: React.MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#F2F6F7', border: '1px solid #DCE6EA', borderRadius: 5, padding: '2px 6px', fontSize: 10.5, color: '#6B818C', fontFamily: 'monospace', maxWidth: '100%', overflow: 'hidden' }}>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
      <button
        onClick={copy}
        title="Copiar status"
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', flexShrink: 0 }}
      >
        {copied
          ? <Check size={10} color="#1A7A48" />
          : <Copy size={10} color="#6B818C" />}
      </button>
    </span>
  )
}

/* ──────────────────────────────────────────────
   Lead Card (sortable)
────────────────────────────────────────────── */
interface LeadCardProps {
  lead: LeadClinica
  isDragging?: boolean
  overlay?: boolean
}

function LeadCard({ lead, isDragging = false, overlay = false }: LeadCardProps) {
  const navigate = useNavigate()
  const cfg = STATUS_MAP[lead.status]

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({ id: lead.id, disabled: overlay })

  const style = overlay
    ? { boxShadow: '0 8px 32px rgba(0,0,0,0.15)', transform: 'rotate(1.5deg)', opacity: 1 }
    : {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isSortableDragging ? 0.35 : 1,
      }

  const handleClick = (_e: React.MouseEvent) => {
    // Only navigate if not dragging
    if (!isDragging) {
      navigate(`/leads/${lead.id}`)
    }
  }

  return (
    <div
      ref={overlay ? undefined : setNodeRef}
      style={{
        background: '#fff',
        borderRadius: 12,
        border: '1px solid #DCE6EA',
        padding: '12px 14px',
        cursor: overlay ? 'grabbing' : 'pointer',
        userSelect: 'none',
        ...style,
        transition: overlay ? undefined : style.transition,
        boxShadow: overlay ? style.boxShadow : undefined,
        transform: overlay ? style.transform : (CSS.Transform.toString(transform) ?? undefined),
      }}
      onClick={handleClick}
      onMouseEnter={(e) => { if (!overlay) (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 12px rgba(0,0,0,0.07)' }}
      onMouseLeave={(e) => { if (!overlay) (e.currentTarget as HTMLDivElement).style.boxShadow = 'none' }}
    >
      {/* Drag handle + name */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
        <span
          {...(overlay ? {} : { ...attributes, ...listeners })}
          onClick={(e) => e.stopPropagation()}
          style={{ cursor: overlay ? 'grabbing' : 'grab', marginTop: 2, flexShrink: 0, color: '#B9C8CE' }}
        >
          <GripVertical size={14} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: '#16232B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {lead.nome_lead ?? 'Sem nome'}
          </div>
          {lead.procedimento_interesse && (
            <div style={{ fontSize: 12, color: '#6B818C', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {lead.procedimento_interesse}
            </div>
          )}
        </div>
      </div>

      {/* Status badge visual */}
      <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 5 }}>
        {cfg.pulse && (
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: cfg.dot ?? cfg.color, display: 'inline-block', animation: 'pulse-dot 1.4s ease infinite', flexShrink: 0 }} />
        )}
        <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: cfg.bg, color: cfg.color, border: cfg.status === 'consulta_realizada' ? 'none' : `1px solid ${cfg.bg}` }}>
          {cfg.label}
        </span>
      </div>

      {/* Bottom row: copy badge + time */}
      <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, flexWrap: 'wrap' }}>
        <CopyBadge value={lead.status} />
        <span style={{ fontSize: 11, color: '#6B818C', whiteSpace: 'nowrap', flexShrink: 0 }}>
          {formatLastContact(lead.minutos_ultima_mensagem)}
        </span>
      </div>
    </div>
  )
}

/* ──────────────────────────────────────────────
   Kanban Column (droppable)
────────────────────────────────────────────── */
interface KanbanColumnProps {
  cfg: ColumnConfig
  leads: LeadClinica[]
  isDraggingOver: boolean
  /** Para onde o "+ N outros" leva: a lista, já filtrada nesta etapa. */
  verTodos: string
}

function KanbanColumn({ cfg, leads, isDraggingOver, verTodos }: KanbanColumnProps) {
  const { setNodeRef } = useDroppable({ id: cfg.status })
  const navigate = useNavigate()

  // O que a coluna desenha, e o que ficou de fora.
  const visiveis = leads.slice(0, TETO_POR_COLUNA)
  const escondidos = leads.length - visiveis.length

  return (
    <div
      style={{
        width: 260,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        maxHeight: 'calc(100vh - 140px)',
      }}
    >
      {/* Column header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 14px',
        background: '#fff',
        borderRadius: '12px 12px 0 0',
        border: '1px solid #DCE6EA',
        borderBottom: 'none',
        gap: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: cfg.status === 'consulta_realizada' ? cfg.bg : cfg.color, flexShrink: 0, display: 'block', border: cfg.status === 'consulta_realizada' ? '2px solid #1A7A48' : 'none' }} />
          <span style={{ fontSize: 12.5, fontWeight: 700, color: '#16232B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cfg.label}</span>
        </div>
        <span style={{ background: '#F2F6F7', color: '#6B818C', borderRadius: 20, fontSize: 11.5, fontWeight: 700, padding: '2px 8px', flexShrink: 0 }}>
          {leads.length}
        </span>
      </div>

      {/* Drop zone */}
      <div
        ref={setNodeRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          background: isDraggingOver ? '#EAF3F6' : '#F4F8F9',
          border: `1px solid ${isDraggingOver ? '#4C90A8' : '#DCE6EA'}`,
          borderTop: 'none',
          borderRadius: '0 0 12px 12px',
          padding: '8px 8px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          transition: 'background 0.15s, border-color 0.15s',
          minHeight: 80,
        }}
      >
        {/* A lista do SortableContext tem que ser EXATAMENTE a que está na
            tela: registrar como arrastável um card que não foi desenhado faz o
            dnd-kit medir um elemento que não existe. */}
        <SortableContext items={visiveis.map((l) => l.id)} strategy={verticalListSortingStrategy}>
          {visiveis.map((lead) => (
            <LeadCard key={lead.id} lead={lead} />
          ))}
        </SortableContext>

        {/* "+ N outros" — e ele é um caminho, não um aviso de que falta coisa.
            Leva para a lista já filtrada nesta etapa, onde há busca e os
            botões de exportar. O número do cabeçalho continua sendo o total. */}
        {escondidos > 0 && (
          <button
            onClick={() => navigate(verTodos)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              width: '100%', padding: '9px 10px', borderRadius: 9,
              border: '1px dashed #C6D6DC', background: '#fff', cursor: 'pointer',
              fontSize: 12, fontWeight: 600, color: '#1E6E8C',
              fontFamily: "'Plus Jakarta Sans', sans-serif", flexShrink: 0,
              transition: 'background 0.15s, border-color 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#EAF3F6'; e.currentTarget.style.borderColor = '#4C90A8' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = '#C6D6DC' }}
          >
            + {escondidos} {escondidos === 1 ? 'outro' : 'outros'} <ArrowRight size={13} />
          </button>
        )}

        {leads.length === 0 && (
          <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            padding: '24px 0',
            color: '#B9C8CE',
          }}>
            <Inbox size={22} strokeWidth={1.5} />
            <span style={{ fontSize: 11.5 }}>Nenhum lead</span>
          </div>
        )}
      </div>
    </div>
  )
}

/* ──────────────────────────────────────────────
   Main CRM Page
────────────────────────────────────────────── */
export default function CRM() {
  const [leads, setLeads] = useState<LeadClinica[]>([])
  const [loading, setLoading] = useState(true)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [overId, setOverId] = useState<LeadStatus | null>(null)
  const dragStartColumnRef = useRef<LeadStatus | null>(null)

  /* O PADRÃO AQUI É "TODO O PERÍODO", E NÃO "ESTE MÊS" COMO NAS OUTRAS TELAS.

     Dashboard, Contatos e Pacientes são relatório: recortar um mês é a
     pergunta normal. O CRM é quadro de trabalho — e um lead que chegou em
     junho e ainda está em "Follow-up 2" é exatamente quem precisa ser
     lembrado. Abrir escondendo essa pessoa seria esconder o trabalho.

     Isto só é seguro por causa do TETO_POR_COLUNA: sem ele, o padrão seria o
     pior caso possível para o desempenho. */
  const [periodo, setPeriodo] = useState<PeriodKey>('all')
  const [faixa, setFaixa] = useState<DateRange>(() => ({ start: new Date(), end: new Date() }))
  /** Quantos existem no banco no período — para saber se o que veio é tudo. */
  const [totalNoBanco, setTotalNoBanco] = useState(0)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  )

  /* Load leads

     O RECORTE VAI NA CONSULTA, e não só na memória. As outras telas trazem
     tudo e filtram depois — aqui isso seria trazer o ano inteiro para desenhar
     uma semana. E `order` explícito não é enfeite: quando o servidor corta em
     `max_rows`, é ele que decide QUAIS sobram. Sem ordem, sobram linhas
     arbitrárias; com ela, sobram as mais recentes. */
  useEffect(() => {
    let vivo = true
    const range = getPeriodRange(periodo, faixa)
    supabase.from('crm_clinica')
      .select('*', { count: 'exact' })
      .gte('created_at', range.start.toISOString())
      .lte('created_at', range.end.toISOString())
      .order('created_at', { ascending: false })
      .then(({ data, count }) => {
        if (!vivo) return
        setLeads(data ?? [])
        setTotalNoBanco(count ?? 0)
        setLoading(false)
      })
    return () => { vivo = false }
  }, [periodo, faixa])

  /* Supabase Realtime */
  useEffect(() => {
    const channel = supabase
      .channel('crm-leads-realtime')
      .on(
        'postgres_changes',
        // Realtime escuta a TABELA, não a view: o Postgres só replica tabelas.
        { event: '*', schema: 'public', table: 'crm_clinica_dados' },
        (payload) => {
          if (payload.eventType === 'UPDATE') {
            setLeads((prev) =>
              prev.map((l) => l.id === payload.new.id ? { ...l, ...payload.new } as LeadClinica : l)
            )
          } else if (payload.eventType === 'INSERT') {
            // O recorte vale também para quem chega agora: olhando "Junho", um
            // lead criado neste instante não pertence à tela.
            const novo = payload.new as LeadClinica
            if (!inRange(novo.created_at, getPeriodRange(periodo, faixa))) return
            setLeads((prev) => [novo, ...prev])
          } else if (payload.eventType === 'DELETE') {
            setLeads((prev) => prev.filter((l) => l.id !== payload.old.id))
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [periodo, faixa])

  /* Derived: leads grouped by status */
  const grouped = Object.fromEntries(
    COLUMNS.map((c) => [c.status, leads.filter((l) => l.status === c.status)])
  ) as Record<LeadStatus, LeadClinica[]>

  const activeLead = activeId ? leads.find((l) => l.id === activeId) ?? null : null

  /* Find which column a lead belongs to */
  const findColumn = (id: string): LeadStatus | null => {
    const lead = leads.find((l) => l.id === id)
    return lead?.status ?? null
  }

  /* DnD handlers */
  const handleDragStart = (event: DragStartEvent) => {
    const id = event.active.id as string
    setActiveId(id)
    dragStartColumnRef.current = findColumn(id)
  }

  const handleDragOver = (event: any) => {
    const ovr = event.over
    if (!ovr) { setOverId(null); return }
    // over could be a column id (droppable) or a lead id (sortable inside column)
    const isColumn = COLUMNS.some((c) => c.status === ovr.id)
    if (isColumn) {
      setOverId(ovr.id as LeadStatus)
    } else {
      const col = findColumn(ovr.id as string)
      setOverId(col)
    }
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)
    setOverId(null)
    dragStartColumnRef.current = null

    if (!over) return

    const leadId = active.id as string
    const lead = leads.find((l) => l.id === leadId)
    if (!lead) return

    // Determine target column
    let targetStatus: LeadStatus
    const isColumnDrop = COLUMNS.some((c) => c.status === over.id)
    if (isColumnDrop) {
      targetStatus = over.id as LeadStatus
    } else {
      const col = findColumn(over.id as string)
      if (!col) return
      targetStatus = col
    }

    if (lead.status === targetStatus) return

    /* Optimistic update — E O CARD VAI PARA O TOPO DA LISTA.

       A ordem da lista é a ordem dentro da coluna, e a lista vem por
       `created_at` decrescente. Só trocar o status colocaria um lead antigo na
       posição 150 da coluna de destino — atrás do teto de 50, ou seja, ele
       **sumiria da tela** logo depois de você soltá-lo. Indo para o topo, o
       card aparece onde a mão o deixou. */
    setLeads((prev) => [
      { ...lead, status: targetStatus },
      ...prev.filter((l) => l.id !== leadId),
    ])

    // Persist to Supabase
    const { error } = await supabase
      .from('crm_clinica')
      .update({ status: targetStatus })
      .eq('id', leadId)

    if (error) {
      // Rollback: só o status volta. A posição no topo fica, e é o certo — o
      // card precisa continuar visível para a pessoa ver que ele não andou.
      setLeads((prev) =>
        prev.map((l) => l.id === leadId ? { ...l, status: lead.status } : l)
      )
    }
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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {/* Page header */}
      <div style={{ padding: '28px 32px 20px', flexShrink: 0 }}>
        <div className="fade-in" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#16232B', margin: 0 }}>CRM</h1>
            <p style={{ fontSize: 16.5, fontWeight: 500, color: '#3A5560', marginTop: 10, marginBottom: 0, lineHeight: 1.45 }}>
              Acompanhe cada contato até ele se tornar paciente.
            </p>
            <p style={{ fontSize: 13, color: '#6B818C', marginTop: 8, marginBottom: 0, lineHeight: 1.6 }}>
              Visualize em qual etapa do atendimento cada pessoa está.
            </p>
          </div>
        </div>

        {/* O recorte é por QUANDO O LEAD CHEGOU (`created_at`), igual às outras
            três telas. É a leitura de funil: "dos que entraram em agosto, onde
            eles estão agora?". */}
        <div className="fade-in-2" style={{ marginTop: 18 }}>
          <FiltroPeriodo
            periodo={periodo}
            onPeriodo={setPeriodo}
            faixa={faixa}
            onFaixa={setFaixa}
          />
        </div>

        {/* O TETO DO SERVIDOR, DITO EM VOZ ALTA.

            Ele corta em silêncio: sem erro, sem marcação, sem nada. A tela
            compara o que chegou com a contagem de verdade — e prefere um aviso
            feio a um quadro que esconde gente sem avisar. */}
        {totalNoBanco > leads.length && (
          <div style={{
            marginTop: 12, display: 'flex', alignItems: 'flex-start', gap: 8,
            background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10,
            padding: '10px 13px', fontSize: 12.5, color: '#B45309', lineHeight: 1.55,
          }}>
            <TriangleAlert size={14} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>
              Mostrando os <strong>{leads.length}</strong> mais recentes de{' '}
              <strong>{totalNoBanco}</strong> — o servidor não entrega mais de{' '}
              {TETO_DO_SERVIDOR} de uma vez. Escolha um período menor para ver o resto.
            </span>
          </div>
        )}
      </div>

      {/* Kanban board */}
      <div style={{ flex: 1, overflowX: 'auto', overflowY: 'hidden', padding: '0 32px 32px' }}>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div style={{ display: 'flex', gap: 12, minWidth: 'max-content', height: '100%', alignItems: 'flex-start' }}>
            {COLUMNS.map((cfg) => (
              <KanbanColumn
                key={cfg.status}
                cfg={cfg}
                leads={grouped[cfg.status]}
                isDraggingOver={overId === cfg.status}
                verTodos={linkDaEtapa(cfg.status, periodo, faixa)}
              />
            ))}
          </div>

          {/* Drag overlay */}
          <DragOverlay dropAnimation={{ duration: 180, easing: 'ease' }}>
            {activeLead && (
              <LeadCard lead={activeLead} isDragging overlay />
            )}
          </DragOverlay>
        </DndContext>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse-dot { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.4; transform: scale(1.4); } }
      `}</style>
    </div>
  )
}
