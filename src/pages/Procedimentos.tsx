import React, { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, X, ClipboardList, FileText, DoorOpen, CalendarCheck } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { AGENTE_NOME } from '../lib/agente'
import ConfirmDeleteModal from '../components/ConfirmDeleteModal'
import EditorProcedimento from '../components/EditorProcedimento'
import PortaDeEntrada from '../components/PortaDeEntrada'
import { formatarReais } from '../lib/procedimentos'
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
 *
 * ── Por que card e não linha ─────────────────────────────────────────────
 * Vinte linhas iguais empilhadas viram uma parede: o olho não separa um
 * procedimento do outro, e a descrição — que é justamente o texto que a
 * Letícia fala — fica espremida numa faixa fina no meio da linha.
 *
 * No card cada procedimento é um objeto com contorno próprio, a descrição
 * ganha três linhas de largura confortável, e liga/desliga, editar e excluir
 * ficam **dentro do card que eles afetam** — não numa coluna à direita, longe
 * do nome, onde é fácil clicar na linha errada.
 */

/** Largura mínima do card. Abaixo disso a descrição vira uma coluna de sopa. */
const CARD_MIN = 268

const FONTE = "'Plus Jakarta Sans', sans-serif"

interface ProcedimentoRowState {
  data: ServicoClinica
  saving: boolean
  saved: boolean
}

export default function Procedimentos() {
  // A edição abre um editor próprio: a descrição completa não cabe num campo
  // de duas linhas espremido dentro do card.
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
      setItems((data ?? []).map((d) => ({ data: d as ServicoClinica, saving: false, saved: false })))
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
    setItems((prev) => [...prev, { data: data as ServicoClinica, saving: false, saved: false }])
    setNewNome(''); setNewDescricao(''); setShowNew(false)
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid #DCE6EA',
    fontSize: 13.5, fontFamily: FONTE, color: '#16232B',
    outline: 'none', background: '#fff', boxSizing: 'border-box',
  }

  /**
   * Corta a descrição em três linhas. Só o `-webkit-box` faz isso sem medir
   * texto no JavaScript, e é suportado em todo navegador atual — inclusive nos
   * que não são WebKit.
   */
  const descricaoCortada: React.CSSProperties = {
    fontSize: 12.5, color: '#6B818C', lineHeight: 1.6, margin: 0,
    display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  }

  const ativos = items.filter((i) => i.data.ativo).length

  // A avaliação sai da grade: ela não é um tratamento, é por onde eles começam.
  const porta = items.find((i) => i.data.e_avaliacao) ?? null
  const tratamentos = items.filter((i) => !i.data.e_avaliacao)

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#6B818C' }}>Carregando...</div>

  return (
    <div style={{ padding: '32px 36px', maxWidth: 1080, margin: '0 auto' }}>

      {/* Cabeçalho */}
      <div className="fade-in-1" style={{ marginBottom: 22, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ maxWidth: 620 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: '#EAF3F6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <ClipboardList size={18} color="#1E6E8C" strokeWidth={2} />
            </div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#16232B', margin: 0 }}>Procedimentos</h1>
            <span style={{ background: '#EAF3F6', color: '#1E6E8C', borderRadius: 20, fontSize: 12.5, fontWeight: 700, padding: '2px 10px' }}>{items.length}</span>
          </div>
          <p style={{ fontSize: 16.5, fontWeight: 500, color: '#3A5560', marginTop: 10, marginBottom: 0, lineHeight: 1.45 }}>
            O que a clínica oferece.
          </p>
          <p style={{ fontSize: 13, color: '#6B818C', marginTop: 8, marginBottom: 0, lineHeight: 1.6 }}>
            Cadastre aqui os procedimentos oferecidos pela clínica. A {AGENTE_NOME} usa
            essas informações para entender o que cada paciente procura e responder
            corretamente. Você pode ativar ou desativar um procedimento a qualquer momento.
          </p>
        </div>

        <button onClick={() => setShowNew((s) => !s)}
          style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 16px', borderRadius: 9, border: 'none', background: '#1E6E8C', cursor: 'pointer', fontSize: 13.5, fontWeight: 600, color: '#fff', fontFamily: FONTE, flexShrink: 0 }}>
          {showNew ? <X size={15} /> : <Plus size={15} />} {showNew ? 'Cancelar' : 'Novo Procedimento'}
        </button>
      </div>

      {/* Novo procedimento */}
      {showNew && (
        <div className="fade-in-1" style={{ background: '#fff', borderRadius: 14, border: '2px solid #1E6E8C', padding: '20px 22px', marginBottom: 16 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: '#1E6E8C', marginBottom: 14 }}>Novo Procedimento</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: '#16232B', display: 'block', marginBottom: 6 }}>Nome *</label>
              <input value={newNome} onChange={(e) => setNewNome(e.target.value)} placeholder="Nome do procedimento" style={inputStyle}
                onFocus={(e) => (e.target.style.borderColor = '#1E6E8C')} onBlur={(e) => (e.target.style.borderColor = '#DCE6EA')} />
            </div>
            <div>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: '#16232B', display: 'block', marginBottom: 6 }}>Descrição *</label>
              <textarea value={newDescricao} onChange={(e) => setNewDescricao(e.target.value)} rows={3} placeholder="Uma frase que explique o procedimento em poucas palavras." style={{ ...inputStyle, resize: 'vertical' }}
                onFocus={(e) => (e.target.style.borderColor = '#1E6E8C')} onBlur={(e) => (e.target.style.borderColor = '#DCE6EA')} />
              <div style={{ fontSize: 11.5, color: '#6B818C', marginTop: 6, lineHeight: 1.55 }}>
                Esta é a descrição curta, a do catálogo. O texto detalhado —
                o que a {AGENTE_NOME} conta quando o paciente pergunta — se escreve
                depois, em Editar.
              </div>
            </div>
          </div>
          {newError && <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#DC2626', marginTop: 10 }}>{newError}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button onClick={() => { setShowNew(false); setNewNome(''); setNewDescricao(''); setNewError('') }}
              style={{ padding: '8px 16px', borderRadius: 9, border: '1px solid #DCE6EA', background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#6B818C', fontFamily: FONTE }}>Cancelar</button>
            <button onClick={handleAddNew} disabled={savingNew}
              style={{ padding: '8px 20px', borderRadius: 9, border: 'none', background: savingNew ? '#4C90A8' : '#1E6E8C', cursor: savingNew ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600, color: '#fff', fontFamily: FONTE }}>
              {savingNew ? 'Salvando...' : 'Adicionar'}
            </button>
          </div>
        </div>
      )}

      {toggleError && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 9, padding: '10px 14px', fontSize: 13, color: '#DC2626', marginBottom: 16 }}>{toggleError}</div>
      )}

      {/* Placar: quantos a Letícia realmente enxerga */}
      {items.length > 0 && (
        <div className="fade-in-2" style={{ fontSize: 12.5, color: '#6B818C', marginBottom: 12 }}>
          {ativos === items.length
            ? <>Todos os {items.length} estão ativos e no catálogo da {AGENTE_NOME}.</>
            : <><strong style={{ color: '#16232B', fontWeight: 700 }}>{ativos}</strong> {ativos === 1 ? 'ativo' : 'ativos'} no catálogo da {AGENTE_NOME}, {items.length - ativos} {items.length - ativos === 1 ? 'desligado' : 'desligados'}.</>}
        </div>
      )}

      {/* A porta de entrada, fora da grade */}
      {items.length > 0 && (
        <PortaDeEntrada
          porta={porta?.data ?? null}
          onEditar={(p) => setEditando(p)}
        />
      )}

      {/* Os cards */}
      <div className="fade-in-2">
        {tratamentos.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 10px' }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: '#6B818C', letterSpacing: 0.3, textTransform: 'uppercase' }}>
              Tratamentos
            </span>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: '#6B818C' }}>{tratamentos.length}</span>
          </div>
        )}
        {items.length === 0 ? (
          <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #DCE6EA', padding: '48px 24px', textAlign: 'center' }}>
            <ClipboardList size={34} strokeWidth={1.2} color="#B9C8CE" style={{ marginBottom: 10 }} />
            <div style={{ fontSize: 14, fontWeight: 600, color: '#16232B' }}>Nenhum procedimento cadastrado</div>
            <div style={{ fontSize: 13, color: '#6B818C', marginTop: 6, lineHeight: 1.6, maxWidth: 400, marginInline: 'auto' }}>
              Sem catálogo, a {AGENTE_NOME} não tem como reconhecer o que o paciente
              está pedindo — nem como falar do que a clínica faz.
            </div>
            <button onClick={() => setShowNew(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 7, marginTop: 18, padding: '9px 16px', borderRadius: 9, border: 'none', background: '#1E6E8C', cursor: 'pointer', fontSize: 13.5, fontWeight: 600, color: '#fff', fontFamily: FONTE }}>
              <Plus size={15} /> Cadastrar o primeiro
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${CARD_MIN}px, 1fr))`, gap: 12, alignItems: 'stretch' }}>
            {tratamentos.map((item) => {
              const p = item.data
              const temDetalhe = !!p.descricao_longa?.trim()
              return (
                <div key={p.id}
                  style={{
                    background: '#fff', borderRadius: 13,
                    border: `1px solid ${p.ativo ? '#DCE6EA' : '#E6EDF0'}`,
                    display: 'flex', flexDirection: 'column',
                    transition: 'border-color 0.2s, box-shadow 0.2s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 3px 14px rgba(22,35,43,0.07)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'none' }}
                >

                  {/*
                    O corpo esmaece quando o procedimento está desligado — mas o
                    rodapé NÃO. Apagar junto o botão que religa é apagar a saída.
                  */}
                  <div style={{ padding: '16px 18px 14px', flex: 1, display: 'flex', flexDirection: 'column', gap: 7, opacity: p.ativo ? 1 : 0.5, transition: 'opacity 0.2s' }}>
                    <div style={{ fontSize: 14.5, fontWeight: 700, color: '#16232B', lineHeight: 1.35 }}>
                      {p.nome}
                    </div>

                    <p style={descricaoCortada} title={p.descricao ?? undefined}>
                      {p.descricao}
                    </p>

                    {/*
                      O FLUXO, SÓ PARA LER.

                      A caixa que muda isto mora no modal de Editar: é decisão
                      que se toma pensando, uma vez, e não coisa para clicar de
                      passagem numa grade de vinte cards.

                      Mas o card PRECISA mostrar o resultado. Sem isso, saber
                      quais passam pela avaliação exigiria abrir vinte modais.
                    */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 600, color: p.exige_avaliacao ? '#1E6E8C' : '#6B818C' }}>
                      {p.exige_avaliacao ? <DoorOpen size={12} /> : <CalendarCheck size={12} />}
                      {p.exige_avaliacao
                        ? 'Passa pela avaliação'
                        : p.preco_a_partir_de === 0
                          ? 'Agenda direto · gratuito'
                          : p.preco_a_partir_de
                            ? `Agenda direto · a partir de ${formatarReais(p.preco_a_partir_de)}`
                            : 'Agenda direto · sem valor'}
                    </div>

                    <div
                      title={temDetalhe
                        ? `A ${AGENTE_NOME} busca este texto quando o paciente quer saber mais.`
                        : `Sem texto detalhado: se perguntarem, a ${AGENTE_NOME} responde com a descrição acima.`}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 'auto', paddingTop: 4, fontSize: 11.5, fontWeight: 600, color: temDetalhe ? '#1E6E8C' : '#9AAEB6' }}
                    >
                      <FileText size={12} />
                      {temDetalhe ? 'Com texto detalhado' : 'Só o resumo'}
                    </div>
                  </div>

                  {/* Rodapé: o que liga, edita e apaga este procedimento */}
                  <div style={{ borderTop: '1px solid #EDF2F4', padding: '10px 14px 10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>

                    <button onClick={() => handleToggleAtivo(item)}
                      title={p.ativo ? 'Desativar — sai do catálogo da Letícia' : 'Ativar — volta para o catálogo da Letícia'}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: FONTE, minWidth: 0 }}>
                      <span style={{ width: 34, height: 19, borderRadius: 10, background: p.ativo ? '#1E6E8C' : '#DCE6EA', position: 'relative', transition: 'background 0.2s', flexShrink: 0, display: 'block' }}>
                        <span style={{ width: 13, height: 13, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: p.ativo ? 18 : 3, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', display: 'block' }} />
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: p.ativo ? '#1E6E8C' : '#6B818C' }}>
                        {p.ativo ? 'Ativo' : 'Inativo'}
                      </span>
                    </button>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      <button onClick={() => setEditando(p)} title="Editar"
                        style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 11px', borderRadius: 8, border: '1px solid #DCE6EA', background: '#fff', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: '#16232B', fontFamily: FONTE }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = '#F7FAFB' }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = '#fff' }}>
                        <Pencil size={13} color="#6B818C" /> Editar
                      </button>
                      <button onClick={() => { setDeleteTarget(item); setDeleteError('') }} title="Excluir"
                        style={{ display: 'flex', alignItems: 'center', padding: '7px 9px', borderRadius: 8, border: '1px solid #DCE6EA', background: '#fff', cursor: 'pointer' }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = '#FEF2F2'; e.currentTarget.style.borderColor = '#FECACA' }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = '#DCE6EA' }}>
                        <Trash2 size={14} color="#DC2626" />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
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
