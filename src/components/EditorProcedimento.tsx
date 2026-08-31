import React, { useState } from 'react'
import { X, Save, Check, Stethoscope } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { ServicoClinica } from '../types'
import ModalPortal from './ModalPortal'

/**
 * Editor de um procedimento — a "página" que abre ao clicar em Editar.
 *
 * AS DUAS DESCRIÇÕES NÃO SÃO A MESMA COISA EM TAMANHOS DIFERENTES. Elas têm
 * destinos distintos, e é isso que a tela precisa deixar claro para quem
 * escreve:
 *
 *   curta  → vai no prompt do Agente de IA, em TODA mensagem, junto com os
 *            outros 19. É o catálogo: serve para ele saber que o procedimento
 *            existe. Cada caractere aqui é cobrado em toda conversa.
 *
 *   longa  → NÃO vai no prompt. O agente busca só quando o paciente pergunta
 *            daquele procedimento. Pode ser longa à vontade.
 *
 * Sem essa distinção na tela, alguém escreve dois parágrafos no campo curto e
 * triplica o custo do sistema sem entender por quê.
 */

const FONTE = "'Plus Jakarta Sans', sans-serif"

const CURTA_IDEAL = 120

/**
 * Teto sugerido da descrição completa. Não é limite técnico — é o tamanho em
 * que o texto ainda é *lido* pela Letícia em vez de resumido por ela: a
 * resposta dela cabe em 50 palavras, então um texto de 1.500 caracteres não
 * vira resposta, vira resumo automático. Os 20 textos da clínica têm ~430.
 */
const LONGA_IDEAL = 600

const rotulo: React.CSSProperties = {
  fontSize: 12.5, fontWeight: 700, color: '#16232B', display: 'block', marginBottom: 5,
}

const ajuda: React.CSSProperties = {
  fontSize: 11.5, color: '#6B818C', lineHeight: 1.55, marginTop: 6,
}

const campo: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid #DCE6EA',
  fontSize: 13.5, fontFamily: FONTE, color: '#16232B', outline: 'none',
  background: '#fff', boxSizing: 'border-box', lineHeight: 1.6,
}

const SUGESTAO =
  'Como funciona, quantas sessões, se dói ou tem anestesia, como é o pós, ' +
  'quanto tempo dura e para quem é indicado.'

interface Props {
  procedimento: ServicoClinica
  onSalvo: (atualizado: ServicoClinica) => void
  onFechar: () => void
}

export default function EditorProcedimento({ procedimento, onSalvo, onFechar }: Props) {
  const [nome, setNome] = useState(procedimento.nome)
  const [curta, setCurta] = useState(procedimento.descricao ?? '')
  const [longa, setLonga] = useState(procedimento.descricao_longa ?? '')
  const [salvando, setSalvando] = useState(false)
  const [salvo, setSalvo] = useState(false)
  const [erro, setErro] = useState('')

  const curtaLonga = curta.length > CURTA_IDEAL
  const longaLonga = longa.length > LONGA_IDEAL

  async function salvar() {
    if (!nome.trim()) { setErro('O nome não pode ficar vazio.'); return }
    if (!curta.trim()) { setErro('A descrição curta não pode ficar vazia — é ela que vai para o agente.'); return }

    setSalvando(true)
    setErro('')

    const { data, error } = await supabase.from('servicos_clinica')
      .update({
        nome: nome.trim(),
        descricao: curta.trim(),
        descricao_longa: longa.trim() || null,
      })
      .eq('id', procedimento.id).select().single()

    setSalvando(false)
    if (error) { setErro('Erro ao salvar. Tente novamente.'); return }

    setSalvo(true)
    setTimeout(() => { onSalvo(data as ServicoClinica); onFechar() }, 700)
  }

  const foco = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    (e.target.style.borderColor = '#1E6E8C')
  const desfoco = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    (e.target.style.borderColor = '#DCE6EA')

  return (
    <ModalPortal>
      <div
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 200,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
        }}
        onClick={(e) => { if (e.target === e.currentTarget) onFechar() }}
      >
        <div style={{
          background: '#fff', borderRadius: 16, border: '1px solid #DCE6EA',
          width: '100%', maxWidth: 640, maxHeight: '90vh', overflowY: 'auto',
          padding: '26px 28px 24px', boxShadow: '0 8px 48px rgba(0,0,0,0.12)',
        }}>

          {/* Cabeçalho */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10, background: '#EAF3F6',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <Stethoscope size={20} color="#1E6E8C" />
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#16232B' }}>Editar procedimento</div>
                <div style={{ fontSize: 12, color: '#6B818C' }}>
                  O que você salvar vale para a Letícia na conversa seguinte.
                </div>
              </div>
            </div>
            <button onClick={onFechar}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6B818C', display: 'flex', padding: 4 }}>
              <X size={18} />
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Nome */}
            <div>
              <label style={rotulo}>Nome do procedimento</label>
              <input value={nome} onChange={(e) => setNome(e.target.value)}
                style={campo} onFocus={foco} onBlur={desfoco} />
              <div style={ajuda}>
                É o nome que a Letícia usa ao falar com o paciente. Nada de marca
                registrada — prefira a descrição genérica.
              </div>
            </div>

            {/* Curta */}
            <div>
              <label style={rotulo}>
                Descrição curta
                <span style={{ fontWeight: 400, color: '#6B818C' }}> — o catálogo</span>
              </label>
              <textarea value={curta} onChange={(e) => setCurta(e.target.value)} rows={2}
                placeholder="Uma frase que explique o procedimento em poucas palavras."
                style={{ ...campo, fontSize: 13, resize: 'vertical' }} onFocus={foco} onBlur={desfoco} />
              <div style={{
                display: 'flex', justifyContent: 'space-between', gap: 12,
                marginTop: 6, alignItems: 'flex-start',
              }}>
                <div style={{ ...ajuda, marginTop: 0, flex: 1 }}>
                  Esta frase vai junto de <strong>toda mensagem</strong> que a Letícia
                  responde, ao lado dos outros procedimentos. Mantenha curta.
                </div>
                <span style={{
                  fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap',
                  color: curtaLonga ? '#D97706' : '#6B818C',
                }}>
                  {curta.length}/{CURTA_IDEAL}
                </span>
              </div>
              {curtaLonga && (
                <div style={{
                  marginTop: 8, padding: '9px 12px', background: '#FFFBEB',
                  border: '1px solid #FDE68A', borderRadius: 9, fontSize: 12,
                  color: '#92400E', lineHeight: 1.55,
                }}>
                  Esta descrição está longa para o catálogo. Ela é cobrada em toda
                  conversa, mesmo com quem só mandou "oi". O texto detalhado cabe
                  melhor no campo abaixo, que só é buscado quando alguém pergunta.
                </div>
              )}
            </div>

            {/* Longa */}
            <div>
              <label style={rotulo}>
                Descrição completa
                <span style={{ fontWeight: 400, color: '#6B818C' }}> — só quando o paciente pergunta</span>
              </label>
              <textarea value={longa} onChange={(e) => setLonga(e.target.value)} rows={8}
                placeholder={SUGESTAO}
                style={{ ...campo, fontSize: 13, resize: 'vertical' }} onFocus={foco} onBlur={desfoco} />
              <div style={{
                display: 'flex', justifyContent: 'space-between', gap: 12,
                marginTop: 6, alignItems: 'flex-start',
              }}>
                <div style={{ ...ajuda, marginTop: 0, flex: 1 }}>
                  A Letícia busca este texto <strong>só quando o paciente quer saber mais</strong>.
                  Sugestões do que incluir: {SUGESTAO.toLowerCase()}
                  <br />
                  <strong>Sem preço</strong>, e sem nada que substitua a avaliação do dentista.
                  Vazio, ela usa a descrição curta.
                </div>
                <span style={{
                  fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap',
                  color: longaLonga ? '#D97706' : '#6B818C',
                }}>
                  {longa.length}/{LONGA_IDEAL}
                </span>
              </div>
              {longaLonga && (
                <div style={{
                  marginTop: 8, padding: '9px 12px', background: '#FFFBEB',
                  border: '1px solid #FDE68A', borderRadius: 9, fontSize: 12,
                  color: '#92400E', lineHeight: 1.55,
                }}>
                  Texto longo. A Letícia responde em até 50 palavras, então daqui
                  para cima ela para de escolher o que dizer e passa a resumir por
                  conta própria. Os procedimentos da clínica têm cerca de 430
                  caracteres.
                </div>
              )}
            </div>

            {erro && (
              <div style={{
                padding: '10px 14px', background: '#FEF2F2', border: '1px solid #FECACA',
                borderRadius: 9, fontSize: 12.5, color: '#DC2626',
              }}>{erro}</div>
            )}
          </div>

          {/* Ações */}
          <div style={{
            display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 22,
            paddingTop: 18, borderTop: '1px solid #EDF2F4',
          }}>
            <button onClick={onFechar}
              style={{
                padding: '8px 16px', borderRadius: 9, border: '1px solid #DCE6EA',
                background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                color: '#6B818C', fontFamily: FONTE,
              }}>
              Cancelar
            </button>
            <button onClick={salvar} disabled={salvando}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px',
                borderRadius: 9, border: 'none', background: salvo ? '#1A7A48' : '#1E6E8C',
                color: '#fff', cursor: salvando ? 'not-allowed' : 'pointer',
                fontSize: 13, fontWeight: 600, fontFamily: FONTE,
              }}>
              {salvo ? <Check size={14} /> : <Save size={14} />}
              {salvo ? 'Salvo!' : salvando ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  )
}
