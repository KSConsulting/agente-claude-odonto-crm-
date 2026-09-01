import { useState } from 'react'
import { Search, UserCheck, MessageSquareDashed, CalendarCheck, CalendarX } from 'lucide-react'
import { formatarParaExibicao } from '../lib/telefones'
import { previaDaMensagem, quandoCurto, temConsultaMarcada, quandoAgendada } from '../lib/conversas'
import { AGENTE_TITULO, useAgente } from '../lib/agente'
import type { ConversaResumo } from '../types'

/**
 * A coluna da esquerda: quem falou com a clínica, em ordem de quem falou por
 * último.
 *
 * A lista vem pronta da view `conversas_lista` (migrações 0013 e 0014) —
 * última mensagem, não lidas, quem assumiu e a consulta marcada já resolvidos
 * no banco. Aqui só se desenha e se filtra.
 */

const FONTE = "'Plus Jakarta Sans', sans-serif"

/**
 * Os filtros da lista. São três, e não um por status do funil, porque a
 * pergunta de quem está na tela Conversas não é "em que etapa este lead está?"
 * — isso é o CRM. Aqui a pergunta é **"de quem eu preciso cuidar agora?"**:
 * quem esperou resposta (não lidas) e quem já converteu (agendadas).
 */
type Filtro = 'todas' | 'agendadas' | 'nao_lidas'

const ROTULO_FILTRO: Record<Filtro, string> = {
  todas: 'Todas',
  agendadas: 'Agendadas',
  nao_lidas: 'Não lidas',
}

interface Props {
  conversas: ConversaResumo[]
  selecionada: string | null
  onSelecionar: (leadId: string) => void
  carregando: boolean
}

export default function ListaConversas({ conversas, selecionada, onSelecionar, carregando }: Props) {
  const { nome: nomeAgente, porExtenso: agentePorExtenso } = useAgente()
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('todas')

  const passaNoFiltro = (c: ConversaResumo) =>
    filtro === 'todas' ? true
      : filtro === 'agendadas' ? temConsultaMarcada(c)
      : c.nao_lidas > 0

  const termo = busca.trim().toLowerCase()
  const passaNaBusca = (c: ConversaResumo) =>
    !termo ||
    (c.nome_lead ?? '').toLowerCase().includes(termo) ||
    (c.whatsapp_lead ?? '').includes(termo.replace(/\D/g, '')) ||
    (c.ultimo_conteudo ?? '').toLowerCase().includes(termo)

  const filtradas = conversas.filter((c) => passaNoFiltro(c) && passaNaBusca(c))

  // Os números das abas contam a lista INTEIRA, não o resultado da busca: eles
  // dizem quanto existe, e um contador que muda ao digitar não serve para isso.
  const totais: Record<Filtro, number> = {
    todas: conversas.length,
    agendadas: conversas.filter(temConsultaMarcada).length,
    nao_lidas: conversas.filter((c) => c.nao_lidas > 0).length,
  }

  const vazioTexto = termo
    ? 'Tente outro nome ou número.'
    : filtro === 'agendadas'
      ? `Ninguém com consulta marcada por aqui ainda. Quando a ${nomeAgente} marcar, a etiqueta verde aparece na conversa.`
      : filtro === 'nao_lidas'
        ? 'Nada esperando resposta. Tudo lido.'
        : 'Assim que alguém mandar mensagem no WhatsApp da clínica, a conversa aparece aqui.'

  return (
    <div style={{
      width: 330, flexShrink: 0, borderRight: '1px solid #DCE6EA', background: '#fff',
      display: 'flex', flexDirection: 'column', height: '100%',
    }}>

      {/* Cabeçalho, busca e filtros */}
      <div style={{ padding: '18px 18px 12px', borderBottom: '1px solid #EDF2F4', flexShrink: 0 }}>
        <h1 style={{ fontSize: 18, fontWeight: 800, color: '#16232B', margin: '0 0 3px' }}>
          Conversas
        </h1>
        <p style={{ fontSize: 12, color: '#6B818C', margin: '0 0 13px' }}>
          O WhatsApp da clínica, com o que a {agentePorExtenso} respondeu.
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

        <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
          {(Object.keys(ROTULO_FILTRO) as Filtro[]).map((f) => {
            const ativo = filtro === f
            return (
              <button
                key={f}
                onClick={() => setFiltro(f)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '4px 9px', borderRadius: 20, cursor: 'pointer',
                  fontSize: 11.5, fontWeight: 600, fontFamily: FONTE,
                  border: `1px solid ${ativo ? '#1E6E8C' : '#DCE6EA'}`,
                  background: ativo ? '#1E6E8C' : '#fff',
                  color: ativo ? '#fff' : '#6B818C',
                  transition: 'background 0.15s, border-color 0.15s',
                }}
                onMouseEnter={(e) => { if (!ativo) e.currentTarget.style.background = '#F7FAFB' }}
                onMouseLeave={(e) => { if (!ativo) e.currentTarget.style.background = '#fff' }}
              >
                {ROTULO_FILTRO[f]}
                <span style={{
                  fontSize: 10.5, fontWeight: 700,
                  color: ativo ? '#BBDDE8' : '#9AAEB6',
                }}>
                  {totais[f]}
                </span>
              </button>
            )
          })}
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
              {termo ? 'Nada encontrado' : filtro === 'todas' ? 'Nenhuma conversa ainda' : 'Nada por aqui'}
            </div>
            <div style={{ fontSize: 11.5, color: '#6B818C', lineHeight: 1.55 }}>
              {vazioTexto}
            </div>
          </div>
        )}

        {filtradas.map((c) => {
          const ativa = c.lead_id === selecionada
          const nome = c.nome_lead?.trim() || formatarParaExibicao(c.whatsapp_lead) || 'Sem nome'
          const naoLidas = ativa ? 0 : c.nao_lidas
          const agendada = temConsultaMarcada(c)
          // Só é "cancelada" quando NÃO sobrou consulta ativa — o trigger
          // mantém o lead em agendada enquanto restar alguma sessão do
          // tratamento. Por isso as duas etiquetas nunca aparecem juntas.
          const cancelada = !agendada && c.status === 'consulta_cancelada'

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

                {/* As etiquetas. Numa linha só, que quebra se precisar. */}
                {(agendada || cancelada || c.agente_pausado) && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 6 }}>

                    {agendada && (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        background: '#E8F8EF', border: '1px solid #B7E7CB', borderRadius: 6,
                        padding: '2px 6px', fontSize: 10, fontWeight: 700, color: '#1A7A48',
                      }}>
                        <CalendarCheck size={10} />
                        Agendada · {quandoAgendada(c.data_agendamento!)}
                      </span>
                    )}

                    {cancelada && (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 6,
                        padding: '2px 6px', fontSize: 10, fontWeight: 700, color: '#DC2626',
                      }}>
                        <CalendarX size={10} />
                        Cancelada
                      </span>
                    )}

                    {c.agente_pausado && (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 6,
                        padding: '2px 6px', fontSize: 10, fontWeight: 600, color: '#92400E',
                      }}>
                        <UserCheck size={10} />
                        {c.assumido_por_nome ? `Com ${c.assumido_por_nome.split(' ')[0]}` : 'Assumida'}
                      </span>
                    )}
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
