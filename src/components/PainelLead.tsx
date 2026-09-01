import React, { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  X, Phone, CalendarDays, Clock, Stethoscope, FileText,
  ExternalLink, MessageCircleQuestion, CircleUser,
} from 'lucide-react'
import { formatarParaExibicao } from '../lib/telefones'
import { STATUS_LEAD, ROTULO_LEAD, STATUS_CONSULTA, ROTULO_CONSULTA } from '../lib/statusLead'
import { carregarLead, carregarConsultas, fotoDoPerfil, type ConsultaComProfissional } from '../lib/conversas'
import { AGENTE_TITULO, useAgente } from '../lib/agente'
import type { LeadClinica } from '../types'
import AvisoBaixaConsulta from './AvisoBaixaConsulta'

/**
 * O painel da direita: quem é a pessoa do outro lado da conversa.
 *
 * ⚠️ **O NOME PODE NÃO EXISTIR, E ISSO É O NORMAL NO COMEÇO.** Ninguém digita
 * esta ficha: ela se preenche sozinha conforme a Letícia descobre as coisas na
 * conversa. Enquanto a pessoa não disser como se chama, o que existe é o
 * número — e o painel diz isso com todas as letras, em vez de mostrar um campo
 * vazio que parece defeito.
 *
 * A FOTO VEM DA EVOLUTION, NÃO DO BANCO. Não guardamos retrato de paciente. Ela
 * falta na maioria dos casos (privacidade do WhatsApp), e aí fica a inicial.
 */

const FONTE = "'Plus Jakarta Sans', sans-serif"

const rotulo: React.CSSProperties = {
  fontSize: 10.5, fontWeight: 700, color: '#6B818C',
  textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 5,
}

const valor: React.CSSProperties = {
  fontSize: 13, color: '#16232B', lineHeight: 1.6,
}

const bloco: React.CSSProperties = {
  padding: '15px 18px', borderBottom: '1px solid #EDF2F4',
}

function dataHora(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function dataCurta(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}

interface Props {
  leadId: string
  onFechar: () => void
}

export default function PainelLead({ leadId, onFechar }: Props) {
  const { nome: nomeAgente } = useAgente()
  const [lead, setLead] = useState<LeadClinica | null>(null)
  const [consultas, setConsultas] = useState<ConsultaComProfissional[]>([])
  const [foto, setFoto] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    // Sem `setCarregando(true)` aqui: a página remonta o painel a cada troca de
    // conversa (pela `key`), então o estado já nasce carregando.
    let vivo = true
    Promise.all([carregarLead(leadId), carregarConsultas(leadId)])
      .then(([l, c]) => {
        if (!vivo) return
        setLead(l)
        setConsultas(c)
        setCarregando(false)
        if (l?.whatsapp_lead) {
          fotoDoPerfil(l.whatsapp_lead).then((u) => { if (vivo) setFoto(u) })
        }
      })
      .catch(() => { if (vivo) setCarregando(false) })

    return () => { vivo = false }
  }, [leadId])

  // Depois de uma baixa a ficha muda inteira: o status vira Paciente, a
  // consulta muda de cor e `data_agendamento` some. Reler é mais barato que
  // remendar cinco pedaços de estado na mão.
  const recarregarFicha = useCallback(() => {
    Promise.all([carregarLead(leadId), carregarConsultas(leadId)])
      .then(([l, c]) => { setLead(l); setConsultas(c) })
      .catch(() => { /* o próprio aviso mostra o erro dele */ })
  }, [leadId])

  const temNome = !!lead?.nome_lead?.trim()
  const titulo = temNome ? lead!.nome_lead!.trim() : formatarParaExibicao(lead?.whatsapp_lead) || 'Sem nome'
  const estilo = lead ? STATUS_LEAD[lead.status] : null

  return (
    <div style={{
      width: 300, flexShrink: 0, borderLeft: '1px solid #DCE6EA', background: '#fff',
      display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto',
    }}>

      {/* Fechar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '13px 18px', borderBottom: '1px solid #EDF2F4', flexShrink: 0,
      }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: '#16232B' }}>Sobre a pessoa</span>
        <button onClick={onFechar} title="Esconder o painel"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6B818C', display: 'flex', padding: 2 }}>
          <X size={16} />
        </button>
      </div>

      {carregando && (
        <div style={{ padding: '26px 18px', fontSize: 12.5, color: '#6B818C', textAlign: 'center' }}>
          Carregando…
        </div>
      )}

      {!carregando && lead && (
        <>
          {/* Identidade */}
          <div style={{ ...bloco, textAlign: 'center', paddingTop: 20, paddingBottom: 18 }}>
            {foto ? (
              <img src={foto} alt=""
                onError={() => setFoto(null)}
                style={{
                  width: 68, height: 68, borderRadius: '50%', objectFit: 'cover',
                  margin: '0 auto 11px', display: 'block', border: '1px solid #DCE6EA',
                }} />
            ) : (
              <div style={{
                width: 68, height: 68, borderRadius: '50%', background: '#EAF3F6', color: '#1E6E8C',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 25, fontWeight: 700, margin: '0 auto 11px',
              }}>
                {temNome ? titulo.charAt(0).toUpperCase() : <CircleUser size={30} />}
              </div>
            )}

            <div style={{ fontSize: 15, fontWeight: 700, color: '#16232B', wordBreak: 'break-word' }}>
              {titulo}
            </div>

            {!temNome && (
              <div style={{
                marginTop: 8, padding: '8px 10px', background: '#F7FAFB',
                border: '1px solid #DCE6EA', borderRadius: 8,
                fontSize: 11, color: '#6B818C', lineHeight: 1.5, textAlign: 'left',
                display: 'flex', gap: 7, alignItems: 'flex-start',
              }}>
                <MessageCircleQuestion size={13} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>
                  Ainda sem nome. Ele aparece aqui <strong>quando a pessoa disser
                  como se chama</strong> na conversa — a {nomeAgente} grava sozinha.
                </span>
              </div>
            )}

            {estilo && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 11,
                padding: '4px 12px', borderRadius: 20, fontSize: 11.5, fontWeight: 600,
                background: estilo.bg, color: estilo.color,
              }}>
                {estilo.pulse && (
                  <span style={{
                    width: 6, height: 6, borderRadius: '50%', background: estilo.color,
                    display: 'inline-block',
                  }} />
                )}
                {ROTULO_LEAD[lead.status]}
              </span>
            )}
          </div>

          {/* Consulta desta pessoa esperando confirmação. Some sozinho
              quando não há nenhuma. */}
          <div style={{ padding: '0 18px' }}>
            <AvisoBaixaConsulta leadId={leadId} compacto onBaixa={recarregarFicha} />
          </div>

          {/* Contato */}
          <div style={bloco}>
            <div style={rotulo}>Contato</div>
            <div style={{ ...valor, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Phone size={13} color="#6B818C" />
              {formatarParaExibicao(lead.whatsapp_lead) || '—'}
            </div>
          </div>

          {/* Interesse */}
          <div style={bloco}>
            <div style={rotulo}>Procedimento de interesse</div>
            <div style={valor}>
              {lead.procedimento_interesse?.trim() || (
                <span style={{ color: '#6B818C' }}>Ainda não disse o que procura.</span>
              )}
            </div>
          </div>

          {/* Resumo da conversa */}
          <div style={bloco}>
            <div style={rotulo}>Resumo da conversa</div>
            <div style={valor}>
              {lead.resumo_conversa?.trim() || (
                <span style={{ color: '#6B818C' }}>A {nomeAgente} ainda não resumiu esta conversa.</span>
              )}
            </div>
          </div>

          {/* Linha do tempo */}
          <div style={bloco}>
            <div style={rotulo}>Linha do tempo</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <div style={{ ...valor, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}>
                <CalendarDays size={13} color="#6B818C" />
                Chegou em {dataCurta(lead.created_at)}
              </div>
              <div style={{ ...valor, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}>
                <Clock size={13} color="#6B818C" />
                Última mensagem: {dataHora(lead.ultima_mensagem)}
              </div>
            </div>
          </div>

          {/* Consultas */}
          <div style={bloco}>
            <div style={{ ...rotulo, display: 'flex', alignItems: 'center', gap: 5 }}>
              <Stethoscope size={11} /> Consultas ({consultas.length})
            </div>

            {consultas.length === 0 ? (
              <div style={{ ...valor, color: '#6B818C' }}>Nenhuma consulta marcada.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 3 }}>
                {consultas.map((c) => {
                  const est = STATUS_CONSULTA[c.status]
                  return (
                    <div key={c.id} style={{
                      border: '1px solid #DCE6EA', borderRadius: 9, padding: '9px 11px',
                      borderLeft: `3px solid ${c.profissional?.cor ?? '#DCE6EA'}`,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                        <span style={{ fontSize: 12.5, fontWeight: 700, color: '#16232B', lineHeight: 1.4 }}>
                          {c.procedimento}
                        </span>
                        <span style={{
                          fontSize: 9.5, fontWeight: 700, padding: '2px 7px', borderRadius: 20,
                          background: est.bg, color: est.color, whiteSpace: 'nowrap', flexShrink: 0,
                        }}>
                          {ROTULO_CONSULTA[c.status]}
                        </span>
                      </div>
                      <div style={{ fontSize: 11.5, color: '#6B818C', marginTop: 4 }}>
                        {dataHora(c.data_consulta)}
                      </div>
                      {c.profissional && (
                        <div style={{ fontSize: 11.5, color: '#6B818C', marginTop: 2 }}>
                          {c.profissional.nome} {c.profissional.sobrenome}
                        </div>
                      )}
                      {c.origem === 'agente_ia' && (
                        <div style={{ fontSize: 10.5, color: '#1E6E8C', marginTop: 4, fontWeight: 600 }}>
                          marcada pela {AGENTE_TITULO}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Anotações */}
          {lead.anotacoes?.trim() && (
            <div style={bloco}>
              <div style={{ ...rotulo, display: 'flex', alignItems: 'center', gap: 5 }}>
                <FileText size={11} /> Anotações da equipe
              </div>
              <div style={{ ...valor, whiteSpace: 'pre-wrap' }}>{lead.anotacoes}</div>
            </div>
          )}

          {/* Ficha completa */}
          <div style={{ padding: '15px 18px' }}>
            <Link to={`/leads/${lead.id}`}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                padding: '9px 14px', borderRadius: 9, border: '1px solid #DCE6EA',
                background: '#fff', fontSize: 12.5, fontWeight: 600, color: '#1E6E8C',
                textDecoration: 'none', fontFamily: FONTE,
              }}>
              Abrir a ficha completa <ExternalLink size={12} />
            </Link>
            <div style={{ fontSize: 10.5, color: '#6B818C', textAlign: 'center', marginTop: 8, lineHeight: 1.5 }}>
              É lá que se edita o status, as anotações e as consultas.
            </div>
          </div>
        </>
      )}
    </div>
  )
}
