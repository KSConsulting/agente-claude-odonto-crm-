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
import { Copy, Check, GripVertical, Inbox } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { LeadClinica, LeadStatus } from '../types'

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
}

function KanbanColumn({ cfg, leads, isDraggingOver }: KanbanColumnProps) {
  const { setNodeRef } = useDroppable({ id: cfg.status })

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
        <SortableContext items={leads.map((l) => l.id)} strategy={verticalListSortingStrategy}>
          {leads.map((lead) => (
            <LeadCard key={lead.id} lead={lead} />
          ))}
        </SortableContext>

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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  )

  /* Load leads */
  useEffect(() => {
    supabase.from('crm_clinica').select('*').then(({ data }) => {
      setLeads(data ?? [])
      setLoading(false)
    })
  }, [])

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
            setLeads((prev) => [...prev, payload.new as LeadClinica])
          } else if (payload.eventType === 'DELETE') {
            setLeads((prev) => prev.filter((l) => l.id !== payload.old.id))
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

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

    // Optimistic update
    setLeads((prev) =>
      prev.map((l) => l.id === leadId ? { ...l, status: targetStatus } : l)
    )

    // Persist to Supabase
    const { error } = await supabase
      .from('crm_clinica')
      .update({ status: targetStatus })
      .eq('id', leadId)

    if (error) {
      // Rollback
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
