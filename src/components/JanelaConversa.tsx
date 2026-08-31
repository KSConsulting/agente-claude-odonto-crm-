import React, { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Send, UserCheck, Undo2, Bot, ExternalLink, MessagesSquare, FileText,
  PanelRightOpen, PanelRightClose,
} from 'lucide-react'
import { formatarParaExibicao } from '../lib/telefones'
import { urlDaMidia, hora, diaPorExtenso, nomeDoAutor } from '../lib/conversas'
import type { ConversaResumo, MensagemWhatsapp, AutorMensagem } from '../types'

/**
 * A coluna da direita: a conversa aberta.
 *
 * TRÊS CORES DE BALÃO, e a diferença importa: dá para ver de relance onde uma
 * pessoa assumiu o atendimento.
 *
 *   paciente   → esquerda, branco
 *   Letícia    → direita, azul claro
 *   atendente  → direita, azul cheio
 *
 * A CAIXA DE TEXTO SÓ ABRE COM A CONVERSA ASSUMIDA. Sem isso, o atendente
 * responderia junto com a Letícia, e o paciente receberia duas versões da mesma
 * resposta — de duas pessoas que não sabem uma da outra.
 */

const FONTE = "'Plus Jakarta Sans', sans-serif"

const ESTILO_BALAO: Record<AutorMensagem, React.CSSProperties> = {
  paciente: { background: '#fff', border: '1px solid #DCE6EA', color: '#16232B' },
  agente: { background: '#EAF3F6', border: '1px solid #D3E5EC', color: '#16232B' },
  atendente: { background: '#1E6E8C', border: '1px solid #1E6E8C', color: '#fff' },
}

/* ──────────────────────────────────────────────
   A mídia — o bucket é privado, então tudo aqui
   passa por URL assinada, buscada na montagem.
────────────────────────────────────────────── */
function Midia({ mensagem }: { mensagem: MensagemWhatsapp }) {
  const [url, setUrl] = useState<string | null>(null)
  const [falhou, setFalhou] = useState(false)

  useEffect(() => {
    let vivo = true
    if (!mensagem.midia_url) return
    urlDaMidia(mensagem.midia_url)
      .then((u) => { if (vivo) { setUrl(u); setFalhou(!u) } })
      .catch(() => { if (vivo) setFalhou(true) })
    return () => { vivo = false }
  }, [mensagem.midia_url])

  if (falhou) {
    return <div style={{ fontSize: 11.5, opacity: 0.75 }}>Não consegui abrir o arquivo.</div>
  }
  if (!url) {
    return <div style={{ fontSize: 11.5, opacity: 0.75 }}>Carregando…</div>
  }

  if (mensagem.tipo === 'imagem') {
    return (
      <a href={url} target="_blank" rel="noreferrer">
        <img src={url} alt="Foto enviada pelo paciente"
          style={{ maxWidth: 260, maxHeight: 300, borderRadius: 9, display: 'block' }} />
      </a>
    )
  }

  if (mensagem.tipo === 'audio') {
    return <audio controls src={url} style={{ maxWidth: 260, display: 'block' }} />
  }

  return (
    <a href={url} target="_blank" rel="noreferrer"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'inherit' }}>
      <FileText size={14} /> Abrir arquivo
    </a>
  )
}

/* ──────────────────────────────────────────────
   Um balão
────────────────────────────────────────────── */
function Balao({ mensagem, mostrarAutor }: { mensagem: MensagemWhatsapp; mostrarAutor: boolean }) {
  const doPaciente = mensagem.autor === 'paciente'
  const temMidia = !!mensagem.midia_url && mensagem.tipo !== 'texto'

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      alignItems: doPaciente ? 'flex-start' : 'flex-end', marginBottom: 8,
    }}>
      {mostrarAutor && (
        <div style={{ fontSize: 10, fontWeight: 700, color: '#6B818C', margin: '4px 4px 3px' }}>
          {nomeDoAutor(mensagem.autor)}
        </div>
      )}

      <div style={{
        ...ESTILO_BALAO[mensagem.autor],
        maxWidth: '68%', padding: '9px 12px 7px', borderRadius: 12,
        borderBottomLeftRadius: doPaciente ? 3 : 12,
        borderBottomRightRadius: doPaciente ? 12 : 3,
        fontSize: 13.5, lineHeight: 1.55, wordBreak: 'break-word',
      }}>
        {temMidia && (
          <div style={{ marginBottom: mensagem.conteudo ? 7 : 2 }}>
            <Midia mensagem={mensagem} />
          </div>
        )}

        {mensagem.conteudo && (
          <div style={{ whiteSpace: 'pre-wrap' }}>
            {mensagem.tipo === 'audio' && (
              <span style={{ fontSize: 10.5, opacity: 0.7, display: 'block', marginBottom: 2 }}>
                transcrição
              </span>
            )}
            {mensagem.conteudo}
          </div>
        )}

        <div style={{
          fontSize: 9.5, opacity: 0.6, marginTop: 4,
          textAlign: doPaciente ? 'left' : 'right',
        }}>
          {hora(mensagem.criada_em)}
        </div>
      </div>
    </div>
  )
}

/* ──────────────────────────────────────────────
   A janela
────────────────────────────────────────────── */
interface Props {
  conversa: ConversaResumo | null
  mensagens: MensagemWhatsapp[]
  carregando: boolean
  enviando: boolean
  erro: string
  onEnviar: (texto: string) => void
  onAssumir: () => void
  onDevolver: () => void
  painelAberto: boolean
  onAlternarPainel: () => void
}

export default function JanelaConversa({
  conversa, mensagens, carregando, enviando, erro, onEnviar, onAssumir, onDevolver,
  painelAberto, onAlternarPainel,
}: Props) {
  const [texto, setTexto] = useState('')
  const fim = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    fim.current?.scrollIntoView({ block: 'end' })
  }, [mensagens, conversa?.lead_id])

  if (!conversa) {
    return (
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', gap: 10, padding: 40, textAlign: 'center',
      }}>
        <MessagesSquare size={30} color="#B6C6CD" />
        <div style={{ fontSize: 14, fontWeight: 700, color: '#16232B' }}>
          Escolha uma conversa
        </div>
        <div style={{ fontSize: 12.5, color: '#6B818C', maxWidth: 320, lineHeight: 1.6 }}>
          Aqui você lê o que a Letícia respondeu e, quando precisar, assume a
          conversa para falar você mesmo.
        </div>
      </div>
    )
  }

  const nome = conversa.nome_lead?.trim() || formatarParaExibicao(conversa.whatsapp_lead) || 'Sem nome'
  const assumida = conversa.agente_pausado

  function enviar() {
    const limpo = texto.trim()
    if (!limpo || enviando) return
    onEnviar(limpo)
    setTexto('')
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, height: '100%' }}>

      {/* Cabeçalho */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '13px 20px',
        borderBottom: '1px solid #DCE6EA', background: '#fff', flexShrink: 0,
      }}>
        <div style={{
          width: 38, height: 38, borderRadius: '50%', background: '#EAF3F6', color: '#1E6E8C',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, fontWeight: 700, flexShrink: 0,
        }}>
          {nome.charAt(0).toUpperCase()}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              fontSize: 14, fontWeight: 700, color: '#16232B',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {nome}
            </span>
            <Link to={`/leads/${conversa.lead_id}`}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11,
                color: '#1E6E8C', textDecoration: 'none', fontWeight: 600, flexShrink: 0,
              }}>
              ficha <ExternalLink size={10} />
            </Link>
          </div>
          <div style={{ fontSize: 11.5, color: '#6B818C' }}>
            {formatarParaExibicao(conversa.whatsapp_lead)}
          </div>
        </div>

        {assumida ? (
          <button onClick={onDevolver}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '7px 13px',
              borderRadius: 9, border: '1px solid #DCE6EA', background: '#fff',
              cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: '#16232B',
              fontFamily: FONTE, flexShrink: 0,
            }}>
            <Undo2 size={13} /> Devolver para a Letícia
          </button>
        ) : (
          <button onClick={onAssumir}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '7px 13px',
              borderRadius: 9, border: 'none', background: '#1E6E8C', color: '#fff',
              cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
              fontFamily: FONTE, flexShrink: 0,
            }}>
            <UserCheck size={13} /> Assumir conversa
          </button>
        )}

        <button onClick={onAlternarPainel}
          title={painelAberto ? 'Esconder os dados da pessoa' : 'Ver os dados da pessoa'}
          style={{
            display: 'flex', alignItems: 'center', padding: 8, borderRadius: 9,
            border: '1px solid #DCE6EA', background: painelAberto ? '#EAF3F6' : '#fff',
            cursor: 'pointer', color: painelAberto ? '#1E6E8C' : '#6B818C', flexShrink: 0,
          }}>
          {painelAberto ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />}
        </button>
      </div>

      {/* Quem está atendendo */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 7, padding: '7px 20px',
        background: assumida ? '#FFFBEB' : '#F7FAFB',
        borderBottom: `1px solid ${assumida ? '#FDE68A' : '#EDF2F4'}`,
        fontSize: 11.5, color: assumida ? '#92400E' : '#6B818C', flexShrink: 0,
      }}>
        {assumida ? <UserCheck size={12} /> : <Bot size={12} />}
        {assumida
          ? <span>
              <strong>Você está atendendo.</strong> A Letícia não responde nesta
              conversa{conversa.assumido_por_nome ? ` — assumida por ${conversa.assumido_por_nome}` : ''}.
            </span>
          : <span><strong>A Letícia está atendendo.</strong> Assuma a conversa para responder você mesmo.</span>}
      </div>

      {/* Mensagens */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', background: '#F2F6F7' }}>
        {carregando && mensagens.length === 0 && (
          <div style={{ textAlign: 'center', fontSize: 12.5, color: '#6B818C', padding: 20 }}>
            Carregando a conversa…
          </div>
        )}

        {mensagens.map((m, i) => {
          const anterior = mensagens[i - 1]
          const dia = diaPorExtenso(m.criada_em)
          const novoDia = !anterior || diaPorExtenso(anterior.criada_em) !== dia

          return (
            <div key={m.id}>
              {novoDia && (
                <div style={{ textAlign: 'center', margin: '14px 0 12px' }}>
                  <span style={{
                    background: '#DCE6EA', color: '#16232B', fontSize: 10.5, fontWeight: 600,
                    padding: '3px 11px', borderRadius: 20,
                  }}>
                    {dia}
                  </span>
                </div>
              )}
              <Balao mensagem={m} mostrarAutor={!anterior || anterior.autor !== m.autor} />
            </div>
          )
        })}
        <div ref={fim} />
      </div>

      {/* Caixa de resposta */}
      <div style={{ borderTop: '1px solid #DCE6EA', background: '#fff', padding: '12px 20px', flexShrink: 0 }}>
        {erro && (
          <div style={{
            marginBottom: 9, padding: '8px 12px', background: '#FEF2F2',
            border: '1px solid #FECACA', borderRadius: 8, fontSize: 12, color: '#DC2626',
          }}>
            {erro}
          </div>
        )}

        {assumida ? (
          <div style={{ display: 'flex', gap: 9, alignItems: 'flex-end' }}>
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar() }
              }}
              rows={1}
              placeholder="Escreva a resposta… (Enter envia, Shift+Enter quebra a linha)"
              style={{
                flex: 1, padding: '10px 13px', borderRadius: 10, border: '1px solid #DCE6EA',
                fontSize: 13.5, fontFamily: FONTE, color: '#16232B', outline: 'none',
                resize: 'none', minHeight: 40, maxHeight: 140, lineHeight: 1.5,
                boxSizing: 'border-box', background: '#fff',
              }}
              onFocus={(e) => (e.target.style.borderColor = '#1E6E8C')}
              onBlur={(e) => (e.target.style.borderColor = '#DCE6EA')}
            />
            <button
              onClick={enviar}
              disabled={enviando || !texto.trim()}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '10px 17px',
                borderRadius: 10, border: 'none',
                background: enviando || !texto.trim() ? '#B6C6CD' : '#1E6E8C',
                color: '#fff', cursor: enviando || !texto.trim() ? 'not-allowed' : 'pointer',
                fontSize: 13, fontWeight: 600, fontFamily: FONTE, flexShrink: 0,
              }}>
              <Send size={14} /> {enviando ? 'Enviando…' : 'Enviar'}
            </button>
          </div>
        ) : (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 14, flexWrap: 'wrap',
          }}>
            <span style={{ fontSize: 12.5, color: '#6B818C', lineHeight: 1.55 }}>
              Para escrever para esta pessoa, <strong>assuma a conversa</strong> — assim
              a Letícia para de responder e vocês dois não falam ao mesmo tempo.
            </span>
            <button onClick={onAssumir}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px',
                borderRadius: 10, border: 'none', background: '#1E6E8C', color: '#fff',
                cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: FONTE,
              }}>
              <UserCheck size={14} /> Assumir conversa
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
