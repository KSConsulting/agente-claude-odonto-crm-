import { useState } from 'react'
import { Search, UserCheck, MessageSquareDashed } from 'lucide-react'
import { formatarParaExibicao } from '../lib/telefones'
import { previaDaMensagem, quandoCurto } from '../lib/conversas'
import { AGENTE_TITULO, AGENTE_POR_EXTENSO } from '../lib/agente'
import type { ConversaResumo } from '../types'

/**
 * A coluna da esquerda: quem falou com a clínica, em ordem de quem falou por
 * último.
 *
 * A lista vem pronta da view `conversas_lista` (migração 0013) — última
 * mensagem, não lidas e quem assumiu já resolvidos no banco. Aqui só se
 * desenha e se filtra.
 */

const FONTE = "'Plus Jakarta Sans', sans-serif"

interface Props {
  conversas: ConversaResumo[]
  selecionada: string | null
  onSelecionar: (leadId: string) => void
  carregando: boolean
}

export default function ListaConversas({ conversas, selecionada, onSelecionar, carregando }: Props) {
  const [busca, setBusca] = useState('')

  const termo = busca.trim().toLowerCase()
  const filtradas = termo
    ? conversas.filter((c) =>
        (c.nome_lead ?? '').toLowerCase().includes(termo) ||
        (c.whatsapp_lead ?? '').includes(termo.replace(/\D/g, '')) ||
        (c.ultimo_conteudo ?? '').toLowerCase().includes(termo))
    : conversas

  return (
    <div style={{
      width: 330, flexShrink: 0, borderRight: '1px solid #DCE6EA', background: '#fff',
      display: 'flex', flexDirection: 'column', height: '100%',
    }}>

      {/* Cabeçalho e busca */}
      <div style={{ padding: '18px 18px 14px', borderBottom: '1px solid #EDF2F4', flexShrink: 0 }}>
        <h1 style={{ fontSize: 18, fontWeight: 800, color: '#16232B', margin: '0 0 3px' }}>
          Conversas
        </h1>
        <p style={{ fontSize: 12, color: '#6B818C', margin: '0 0 13px' }}>
          O WhatsApp da clínica, com o que a {AGENTE_POR_EXTENSO} respondeu.
        </p>

        <div style={{ position: 'relative' }}>
          <Search size={14} color="#6B818C"
            style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)' }} />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, número ou mensagem"
            style={{
              width: '100%', padding: '8px 12px 8px 32px', borderRadius: 9,
              border: '1px solid #DCE6EA', fontSize: 12.5, fontFamily: FONTE,
              color: '#16232B', outline: 'none', boxSizing: 'border-box', background: '#F7FAFB',
            }}
            onFocus={(e) => (e.target.style.borderColor = '#1E6E8C')}
            onBlur={(e) => (e.target.style.borderColor = '#DCE6EA')}
          />
        </div>
      </div>

      {/* A lista */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {carregando && conversas.length === 0 && (
          <div style={{ padding: '28px 20px', textAlign: 'center', fontSize: 12.5, color: '#6B818C' }}>
            Carregando…
          </div>
        )}

        {!carregando && filtradas.length === 0 && (
          <div style={{ padding: '40px 26px', textAlign: 'center' }}>
            <MessageSquareDashed size={26} color="#B6C6CD" style={{ marginBottom: 10 }} />
            <div style={{ fontSize: 13, fontWeight: 600, color: '#16232B', marginBottom: 4 }}>
              {termo ? 'Nada encontrado' : 'Nenhuma conversa ainda'}
            </div>
            <div style={{ fontSize: 11.5, color: '#6B818C', lineHeight: 1.55 }}>
              {termo
                ? 'Tente outro nome ou número.'
                : 'Assim que alguém mandar mensagem no WhatsApp da clínica, a conversa aparece aqui.'}
            </div>
          </div>
        )}

        {filtradas.map((c) => {
          const ativa = c.lead_id === selecionada
          const nome = c.nome_lead?.trim() || formatarParaExibicao(c.whatsapp_lead) || 'Sem nome'
          const naoLidas = ativa ? 0 : c.nao_lidas

          return (
            <button
              key={c.lead_id}
              onClick={() => onSelecionar(c.lead_id)}
              style={{
                width: '100%', display: 'flex', gap: 11, alignItems: 'flex-start',
                padding: '12px 16px', border: 'none', borderBottom: '1px solid #EDF2F4',
                background: ativa ? '#EAF3F6' : 'transparent', cursor: 'pointer',
                textAlign: 'left', fontFamily: FONTE,
                borderLeft: ativa ? '3px solid #1E6E8C' : '3px solid transparent',
              }}
              onMouseEnter={(e) => { if (!ativa) e.currentTarget.style.background = '#F7FAFB' }}
              onMouseLeave={(e) => { if (!ativa) e.currentTarget.style.background = 'transparent' }}
            >
              {/* Inicial */}
              <div style={{
                width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
                background: ativa ? '#1E6E8C' : '#EAF3F6',
                color: ativa ? '#fff' : '#1E6E8C',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14, fontWeight: 700,
              }}>
                {nome.charAt(0).toUpperCase()}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{
                    fontSize: 13, fontWeight: naoLidas > 0 ? 800 : 700, color: '#16232B',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
                  }}>
                    {nome}
                  </span>
                  <span style={{ fontSize: 10.5, color: '#6B818C', flexShrink: 0 }}>
                    {quandoCurto(c.ultima_em)}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 3 }}>
                  <span style={{
                    fontSize: 11.5, color: naoLidas > 0 ? '#16232B' : '#6B818C',
                    fontWeight: naoLidas > 0 ? 600 : 400,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
                  }}>
                    {c.ultimo_autor !== 'paciente' && (
                      <span style={{ color: '#6B818C' }}>
                        {c.ultimo_autor === 'agente' ? `${AGENTE_TITULO}: ` : 'Você: '}
                      </span>
                    )}
                    {previaDaMensagem(c.ultimo_tipo, c.ultimo_conteudo)}
                  </span>

                  {naoLidas > 0 && (
                    <span style={{
                      background: '#1E6E8C', color: '#fff', fontSize: 10, fontWeight: 700,
                      minWidth: 18, height: 18, borderRadius: 9, padding: '0 5px',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                      {naoLidas > 99 ? '99+' : naoLidas}
                    </span>
                  )}
                </div>

                {c.agente_pausado && (
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 6,
                    background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 6,
                    padding: '2px 6px', fontSize: 10, fontWeight: 600, color: '#92400E',
                  }}>
                    <UserCheck size={10} />
                    {c.assumido_por_nome ? `Com ${c.assumido_por_nome.split(' ')[0]}` : 'Assumida'}
                  </div>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
