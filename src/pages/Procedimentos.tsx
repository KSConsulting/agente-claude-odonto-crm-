import React, { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, ChevronDown, ChevronUp, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { AGENTE_POR_EXTENSO } from '../lib/agente'
import ConfirmDeleteModal from '../components/ConfirmDeleteModal'
import EditorProcedimento from '../components/EditorProcedimento'
import type { ServicoClinica } from '../types'

/**
 * O catalogo de procedimentos da clinica.
 *
 * Era uma aba de Configuracoes. Virou pagina porque nao e configuracao: e o
 * conteudo que a clinica oferece, mexido com a mesma frequencia que
 * Profissionais -- e e o texto que a Secretaria de IA fala com o paciente.
 *
 * A edicao abre o EditorProcedimento, onde as duas descricoes sao explicadas:
 * a curta vai no prompt em toda mensagem, a longa so quando alguem pergunta.
 */

interface ProcedimentoRowState {
  data: ServicoClinica
  expanded: boolean
  saving: boolean
  saved: boolean
}

export default function Procedimentos() {
  // A edição agora abre um editor próprio: a descrição completa não cabe num
  // campo de duas linhas espremido dentro do card.
  const [editando, setEditando] = useState<ServicoClinica | null>(null)
  const [items, setItems] = useState<ProcedimentoRowState[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [newNome, setNewNome] = useState('')
  const [newDescricao, setNewDescricao] = useState('')
  const [savingNew, setSavingNew] = useState(false)
  const [newError, setNewError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<ProcedimentoRowState | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    supabase.from('servicos_clinica').select('*').order('created_at').then(({ data }) => {
      setItems((data ?? []).map((d) => ({ data: d as ServicoClinica, expanded: false, saving: false, saved: false })))
      setLoading(false)
    })
  }, [])

  const updateItem = (id: string, patch: Partial<ProcedimentoRowState>) =>
    setItems((prev) => prev.map((item) => item.data.id === id ? { ...item, ...patch } : item))

  const [toggleError, setToggleError] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState('')

  const handleToggleAtivo = async (item: ProcedimentoRowState) => {
    const newAtivo = !item.data.ativo
    setToggleError(null)
    updateItem(item.data.id, { data: { ...item.data, ativo: newAtivo } })
    const { error } = await supabase.from('servicos_clinica').update({ ativo: newAtivo }).eq('id', item.data.id)
    if (error) {
      updateItem(item.data.id, { data: { ...item.data, ativo: item.data.ativo } })
      setToggleError('Erro ao atualizar status. Tente novamente.')
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    setDeleteError('')
    const { error } = await supabase.from('servicos_clinica').delete().eq('id', deleteTarget.data.id)
    if (error) { setDeleting(false); setDeleteError('Erro ao excluir. Tente novamente.'); return }
    setItems((prev) => prev.filter((i) => i.data.id !== deleteTarget.data.id))
    setDeleting(false)
    setDeleteTarget(null)
  }

  const handleAddNew = async () => {
    if (!newNome.trim()) { setNewError('O nome é obrigatório.'); return }
    if (!newDescricao.trim()) { setNewError('A descrição é obrigatória.'); return }
    setSavingNew(true); setNewError('')
    const { data, error } = await supabase.from('servicos_clinica').insert({ nome: newNome.trim(), descricao: newDescricao.trim(), ativo: true }).select().single()
    setSavingNew(false)
    if (error) { setNewError('Erro ao salvar.'); return }
    setItems((prev) => [...prev, { data: data as ServicoClinica, expanded: false, saving: false, saved: false }])
    setNewNome(''); setNewDescricao(''); setShowNew(false)
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid #DCE6EA',
    fontSize: 13.5, fontFamily: "'Plus Jakarta Sans', sans-serif", color: '#16232B',
    outline: 'none', background: '#fff', boxSizing: 'border-box',
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#6B818C' }}>Carregando...</div>

  return (
    <div style={{ padding: '32px 36px', maxWidth: 900, margin: '0 auto' }}>

      <div className="fade-in-1" style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#16232B', margin: 0 }}>Procedimentos</h1>
        <p style={{ fontSize: 13, color: '#6B818C', marginTop: 4 }}>
          O que a clínica faz. Esta lista é o catálogo que a {AGENTE_POR_EXTENSO} usa
          para reconhecer o que o paciente procura.
        </p>
      </div>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <span style={{ fontSize: 13, color: '#6B818C' }}>{items.length} procedimento{items.length !== 1 ? 's' : ''} cadastrado{items.length !== 1 ? 's' : ''}</span>
        <button onClick={() => setShowNew((s) => !s)}
          style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 16px', borderRadius: 9, border: 'none', background: '#1E6E8C', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#fff', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
          {showNew ? <X size={14} /> : <Plus size={14} />} {showNew ? 'Cancelar' : 'Novo Procedimento'}
        </button>
      </div>

      {/* New form */}
      {showNew && (
        <div style={{ background: '#fff', borderRadius: 14, border: '2px solid #1E6E8C', padding: '20px 22px', marginBottom: 12 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: '#1E6E8C', marginBottom: 14 }}>Novo Procedimento</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: '#16232B', display: 'block', marginBottom: 6 }}>Nome *</label>
              <input value={newNome} onChange={(e) => setNewNome(e.target.value)} placeholder="Nome do procedimento" style={inputStyle}
                onFocus={(e) => (e.target.style.borderColor = '#1E6E8C')} onBlur={(e) => (e.target.style.borderColor = '#DCE6EA')} />
            </div>
            <div>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: '#16232B', display: 'block', marginBottom: 6 }}>Descrição *</label>
              <textarea value={newDescricao} onChange={(e) => setNewDescricao(e.target.value)} rows={3} placeholder="Descrição detalhada do procedimento..." style={{ ...inputStyle, resize: 'vertical' }}
                onFocus={(e) => (e.target.style.borderColor = '#1E6E8C')} onBlur={(e) => (e.target.style.borderColor = '#DCE6EA')} />
            </div>
          </div>
          {newError && <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#DC2626', marginTop: 10 }}>{newError}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button onClick={() => { setShowNew(false); setNewNome(''); setNewDescricao(''); setNewError('') }}
              style={{ padding: '8px 16px', borderRadius: 9, border: '1px solid #DCE6EA', background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#6B818C', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Cancelar</button>
            <button onClick={handleAddNew} disabled={savingNew}
              style={{ padding: '8px 20px', borderRadius: 9, border: 'none', background: savingNew ? '#4C90A8' : '#1E6E8C', cursor: savingNew ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600, color: '#fff', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
              {savingNew ? 'Salvando...' : 'Adicionar'}
            </button>
          </div>
        </div>
      )}

      {toggleError && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '8px 12px', fontSize: 12.5, color: '#DC2626', marginBottom: 10 }}>{toggleError}</div>
      )}

      {/* List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map((item) => (
          <div key={item.data.id} style={{ background: '#fff', borderRadius: 12, border: '1px solid #DCE6EA', overflow: 'hidden', opacity: item.data.ativo ? 1 : 0.65, transition: 'opacity 0.2s' }}>

            {/* Row header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', flexWrap: 'wrap' }}>
              {/* Toggle */}
              <button onClick={() => handleToggleAtivo(item)}
                style={{ width: 36, height: 20, borderRadius: 10, background: item.data.ativo ? '#1E6E8C' : '#DCE6EA', border: 'none', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                <div style={{ width: 14, height: 14, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: item.data.ativo ? 19 : 3, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
              </button>

              <div style={{ flex: 1, minWidth: 0 }}>
                <>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: '#16232B' }}>{item.data.nome}</div>
                    <div style={{ fontSize: 12.5, color: '#6B818C', marginTop: 3, overflow: 'hidden', display: item.expanded ? 'block' : '-webkit-box', WebkitLineClamp: item.expanded ? undefined : 2, WebkitBoxOrient: 'vertical' as any }}>
                      {item.data.descricao}
                    </div>
                    {item.data.descricao.length > 100 && (
                      <button onClick={() => updateItem(item.data.id, { expanded: !item.expanded })}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#1E6E8C', fontWeight: 600, padding: '2px 0', display: 'flex', alignItems: 'center', gap: 3, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                        {item.expanded ? <><ChevronUp size={12} /> Ver menos</> : <><ChevronDown size={12} /> Ver mais</>}
                      </button>
                    )}
                </>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <>
                    <button onClick={() => setEditando(item.data)}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 8, border: '1px solid #DCE6EA', background: '#fff', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: '#16232B', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                      <Pencil size={13} /> Editar
                    </button>
                    <button onClick={() => setDeleteTarget(item)}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 8, border: '1px solid #FECACA', background: '#FEF2F2', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: '#DC2626', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                      <Trash2 size={13} /> Excluir
                    </button>
                </>
              </div>
            </div>
          </div>
        ))}
      </div>

      {editando && (
        <EditorProcedimento
          procedimento={editando}
          onSalvo={(novo) => updateItem(novo.id, { data: novo })}
          onFechar={() => setEditando(null)}
        />
      )}

      {deleteTarget && (
        <ConfirmDeleteModal
          itemName={deleteTarget.data.nome}
          onConfirm={handleDelete}
          onClose={() => { setDeleteTarget(null); setDeleteError('') }}
          loading={deleting}
          error={deleteError}
        />
      )}
    </div>
  )
}
