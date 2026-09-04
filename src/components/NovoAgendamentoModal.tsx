import { useEffect, useMemo, useState } from 'react'
import { X, Search, UserPlus, AlertTriangle, Check } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useCatalogoProcedimentos } from '../lib/procedimentos'
import {
  bloqueioNoPeriodo, haConflito, motivoForaDaJornada, paraDatetimeLocal, somarMinutos,
} from '../lib/agenda'
import { buscarPorWhatsapp, ERRO_DUPLICADO } from '../lib/contatos'
import { apenasDigitos, formatarParaExibicao } from '../lib/telefones'
import CampoTelefone from './CampoTelefone'
import type {
  Consulta, ConsultaAgenda, Profissional, ProfissionalBloqueio, ProfissionalHorario,
} from '../types'

/* ──────────────────────────────────────────────
   Novo agendamento.

   Escolhe a agenda (profissional), o horário, o procedimento em texto livre e
   o paciente. Paciente que ainda não existe é criado no CRM na hora — foi a
   decisão de processo da clínica: ninguém entra na agenda sem entrar no funil,
   senão as métricas do Dashboard param de fechar.
────────────────────────────────────────────── */

interface PacienteResumo {
  id: string
  nome_lead: string | null
  whatsapp_lead: string | null
}

const DURACOES = [15, 30, 45, 60, 90, 120]

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid #DCE6EA', fontSize: 13.5,
  fontFamily: "'Plus Jakarta Sans', sans-serif", color: '#16232B', outline: 'none', background: '#fff', boxSizing: 'border-box',
}

const labelStyle: React.CSSProperties = {
  fontSize: 12.5, fontWeight: 600, color: '#16232B', display: 'block', marginBottom: 6,
}

/** Caracteres que quebram a sintaxe de filtro do PostgREST em um `.or()`. */
function limparTermo(t: string) {
  return t.replace(/[,()"\\]/g, ' ').trim()
}

function Aviso({ tipo, children }: { tipo: 'erro' | 'atencao'; children: React.ReactNode }) {
  const cores = tipo === 'erro'
    ? { bg: '#FEF2F2', borda: '#FECACA', texto: '#DC2626' }
    : { bg: '#FFFBEB', borda: '#FDE68A', texto: '#B45309' }
  return (
    <div style={{ background: cores.bg, border: `1px solid ${cores.borda}`, borderRadius: 8, padding: '9px 12px', fontSize: 12.5, color: cores.texto, display: 'flex', alignItems: 'flex-start', gap: 8, lineHeight: 1.5 }}>
      <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
      <span>{children}</span>
    </div>
  )
}

export default function NovoAgendamentoModal({
  profissionais, horarios, bloqueios, consultas, dataInicial, profissionalInicial, onClose, onSalvo,
}: {
  profissionais: Profissional[]
  horarios: ProfissionalHorario[]
  bloqueios: ProfissionalBloqueio[]
  consultas: Consulta[]
  dataInicial?: Date
  profissionalInicial?: string | null
  onClose: () => void
  onSalvo: (c: ConsultaAgenda) => void
}) {
  const ativos = profissionais.filter((p) => p.ativo)

  const [profissionalId, setProfissionalId] = useState<string>(
    profissionalInicial ?? ativos[0]?.id ?? '',
  )
  const [quando, setQuando] = useState(paraDatetimeLocal(dataInicial ?? proximaHoraCheia()))
  const [duracao, setDuracao] = useState(60)
  const [procedimento, setProcedimento] = useState('')
  const catalogo = useCatalogoProcedimentos()
  const [observacoes, setObservacoes] = useState('')

  const [busca, setBusca] = useState('')
  const [resultados, setResultados] = useState<PacienteResumo[]>([])
  const [buscando, setBuscando] = useState(false)
  const [paciente, setPaciente] = useState<PacienteResumo | null>(null)
  const [modoNovo, setModoNovo] = useState(false)
  const [novoNome, setNovoNome] = useState('')
  const [novoWhatsapp, setNovoWhatsapp] = useState('')
  const [novoWhatsappValido, setNovoWhatsappValido] = useState(false)
  const [duplicado, setDuplicado] = useState<PacienteResumo | null>(null)

  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  /* Busca de paciente — dispara com 2+ caracteres, com respiro entre teclas.
     O estado só é tocado dentro do timer: mexer nele direto no corpo do efeito
     provoca renderização em cascata (e o ESLint reprova). Quem limpa a lista na
     hora é o próprio onChange do campo. */
  useEffect(() => {
    const termo = limparTermo(busca)
    if (paciente || termo.length < 2) return
    let cancelado = false
    const timer = setTimeout(() => {
      // O telefone é procurado por dígitos: o banco guarda '5511987654321' e a
      // pessoa digita '(11) 98765-4321'. Buscar pelo texto cru não acharia.
      const digitos = apenasDigitos(termo)
      const filtros = [`nome_lead.ilike.%${termo}%`]
      if (digitos.length >= 3) filtros.push(`whatsapp_lead.ilike.%${digitos}%`)
      supabase.from('crm_clinica')
        .select('id, nome_lead, whatsapp_lead')
        .or(filtros.join(','))
        .limit(8)
        .then(({ data }) => {
          if (cancelado) return
          setResultados((data ?? []) as PacienteResumo[])
          setBuscando(false)
        })
    }, 300)
    return () => { cancelado = true; clearTimeout(timer) }
  }, [busca, paciente])

  const handleBusca = (valor: string) => {
    setBusca(valor)
    setResultados([])
    setBuscando(limparTermo(valor).length >= 2)
    setErro('')
  }

  const inicio = useMemo(() => (quando ? new Date(quando) : null), [quando])

  const horariosDoProfissional = useMemo(
    () => horarios.filter((h) => h.profissional_id === profissionalId),
    [horarios, profissionalId],
  )

  const conflito = useMemo(
    () => (inicio ? haConflito(consultas, profissionalId || null, inicio, duracao) : null),
    [consultas, profissionalId, inicio, duracao],
  )

  /* O NOME, e não o objeto do profissional: `ativos` é um filtro refeito a
     cada render, e uma dependência que muda de identidade toda vez faz o
     compilador do React desistir da memoização (`preserve-manual-memoization`).
     `profissionais` é prop e `profissionalId` é estado — os dois são estáveis. */
  const nomeDaAgenda = useMemo(() => {
    const p = profissionais.find((x) => x.id === profissionalId)
    return p ? `${p.nome} ${p.sobrenome}`.trim() || 'Esse profissional' : null
  }, [profissionais, profissionalId])

  /* FORA DA JORNADA NÃO É AVISO, É RECUSA.

     Era um aviso âmbar — "dá para marcar assim mesmo, como encaixe" — e o
     botão continuava azul do lado dele. O encaixe quase nunca era o caso; o
     caso era alguém clicar numa coluna de domingo que a grade desenhava igual
     a uma quarta-feira. Agendar para um dia em que o dentista não atende
     deixou de ser possível, e a saída é ajustar a jornada em Profissionais.

     Sem profissional escolhido não há jornada a conferir — acontece só quando
     a clínica não tem nenhum ativo, e aí o modal já avisa isso mais acima. */
  const foraDaJornada = useMemo(
    () => (inicio && !isNaN(inicio.getTime()) && nomeDaAgenda
      ? motivoForaDaJornada(horariosDoProfissional, inicio, duracao, nomeDaAgenda)
      : null),
    [horariosDoProfissional, inicio, duracao, nomeDaAgenda],
  )

  const bloqueio = useMemo(
    () => (inicio ? bloqueioNoPeriodo(bloqueios, profissionalId || null, inicio, duracao) : null),
    [bloqueios, profissionalId, inicio, duracao],
  )

  const handleSalvar = async () => {
    if (!inicio || isNaN(inicio.getTime())) { setErro('Escolha a data e o horário.'); return }
    // O botão já está trancado; esta linha é a trava de verdade, para o caso de
    // o horário virar inválido entre o último render e o clique.
    if (foraDaJornada) { setErro(foraDaJornada); return }
    if (!procedimento.trim()) { setErro('Escolha o procedimento.'); return }
    if (!paciente && !(modoNovo && novoNome.trim())) { setErro('Escolha o paciente ou cadastre um novo.'); return }
    if (!paciente && !novoWhatsappValido) { setErro('Informe um WhatsApp válido, com o código do país.'); return }
    if (!paciente && duplicado) { setErro('Esse WhatsApp já é de outra pessoa — use o contato existente.'); return }

    setSalvando(true); setErro('')

    let leadId = paciente?.id
    let nomePaciente = paciente?.nome_lead ?? null
    let whatsappPaciente = paciente?.whatsapp_lead ?? null

    // Paciente novo entra no CRM antes da consulta — a consulta exige um lead.
    if (!leadId) {
      const { data, error } = await supabase.from('crm_clinica').insert({
        nome_lead: novoNome.trim(),
        whatsapp_lead: novoWhatsapp,
        status: 'iniciou_conversa',
        inicio_atendimento: new Date().toISOString(),
      }).select('id, nome_lead, whatsapp_lead').single()
      if (error || !data) {
        setSalvando(false)
        // Rede de segurança do índice único: entre a checagem e este insert, o
        // Agente de IA pode ter criado a mesma pessoa pelo WhatsApp.
        if (error?.code === ERRO_DUPLICADO) {
          setErro('Esse WhatsApp acabou de ser cadastrado. Use o contato existente.')
          buscarPorWhatsapp(novoWhatsapp).then(setDuplicado)
          return
        }
        setErro('Erro ao cadastrar o paciente. Tente novamente.')
        return
      }
      leadId = (data as PacienteResumo).id
      nomePaciente = (data as PacienteResumo).nome_lead
      whatsappPaciente = (data as PacienteResumo).whatsapp_lead
    }

    const { data: nova, error } = await supabase.from('consultas').insert({
      lead_id: leadId,
      profissional_id: profissionalId || null,
      procedimento: procedimento.trim(),
      data_consulta: inicio.toISOString(),
      duracao_minutos: duracao,
      status: 'agendada',
      origem: 'equipe',
      observacoes: observacoes.trim() || null,
    }).select().single()

    setSalvando(false)

    if (error) {
      // 23P01 = exclusion_violation: a restrição do banco pegou uma sobreposição
      // que a tela não viu — tipicamente o Agente de IA marcou neste horário
      // enquanto o modal estava aberto. Repetir dá o mesmo erro; a saída é
      // escolher outro horário.
      setErro(error.code === '23P01'
        ? 'Esse horário acabou de ser ocupado nessa agenda. Escolha outro.'
        : 'Erro ao salvar o agendamento. Tente novamente.')
      return
    }

    onSalvo({
      ...(nova as Consulta),
      lead: { id: leadId, nome_lead: nomePaciente, whatsapp_lead: whatsappPaciente },
    })
    onClose()
  }

  const termoLimpo = limparTermo(busca)
  /** As duas recusas do modal: horário ocupado e dia/hora fora da jornada. */
  const impedido = !!conflito || !!foraDaJornada

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 150, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, overflowY: 'auto' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #DCE6EA', width: '100%', maxWidth: 540, padding: '28px 28px 24px', boxShadow: '0 8px 48px rgba(0,0,0,0.12)', margin: 'auto' }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#16232B' }}>Novo Agendamento</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
            <X size={18} color="#6B818C" />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>

          {/* Agenda */}
          <div>
            <label style={labelStyle}>Agenda *</label>
            {ativos.length === 0 ? (
              <Aviso tipo="atencao">
                Nenhum profissional ativo. Cadastre um em Profissionais para ter uma agenda onde marcar.
              </Aviso>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                {ativos.map((p) => {
                  const selecionado = p.id === profissionalId
                  return (
                    <button key={p.id} onClick={() => setProfissionalId(p.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 7, padding: '7px 13px', borderRadius: 20, cursor: 'pointer',
                        border: `1.5px solid ${selecionado ? p.cor : '#DCE6EA'}`,
                        background: selecionado ? `${p.cor}14` : '#fff',
                        fontSize: 13, fontWeight: 600, color: selecionado ? p.cor : '#6B818C',
                        fontFamily: "'Plus Jakarta Sans', sans-serif", transition: 'all 0.15s',
                      }}>
                      <span style={{ width: 9, height: 9, borderRadius: '50%', background: p.cor, display: 'inline-block' }} />
                      {p.nome} {p.sobrenome}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Data, hora e duração */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: 2, minWidth: 200 }}>
              <label style={labelStyle}>Data e horário *</label>
              <input type="datetime-local" value={quando} onChange={(e) => { setQuando(e.target.value); setErro('') }} style={inputStyle}
                onFocus={(e) => (e.target.style.borderColor = '#1E6E8C')} onBlur={(e) => (e.target.style.borderColor = '#DCE6EA')} />
            </div>
            <div style={{ flex: 1, minWidth: 120 }}>
              <label style={labelStyle}>Duração</label>
              <select value={duracao} onChange={(e) => setDuracao(Number(e.target.value))} style={{ ...inputStyle, cursor: 'pointer' }}>
                {DURACOES.map((d) => (
                  <option key={d} value={d}>{d} min</option>
                ))}
              </select>
            </div>
          </div>

          {inicio && !isNaN(inicio.getTime()) && (
            <div style={{ fontSize: 12.5, color: '#6B818C', marginTop: -6 }}>
              Termina às {somarMinutos(inicio, duracao).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </div>
          )}

          {/* Avisos de agenda */}
          {conflito && (
            <Aviso tipo="erro">
              Esse profissional já tem <strong>{conflito.procedimento}</strong> às{' '}
              {new Date(conflito.data_consulta).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}. Escolha outro horário.
            </Aviso>
          )}
          {!conflito && foraDaJornada && (
            <Aviso tipo="erro">
              {foraDaJornada} Escolha outro horário, outra agenda, ou ajuste a jornada em <strong>Profissionais</strong>.
            </Aviso>
          )}
          {/* O bloqueio continua sendo aviso, e não recusa: férias e feriado são
              a exceção que a própria equipe criou sabendo o que fazia, e
              emergência odontológica em feriado existe. A jornada é a regra
              permanente — é outra coisa. */}
          {!conflito && !foraDaJornada && bloqueio && (
            <Aviso tipo="atencao">
              Há um bloqueio nesse período{bloqueio.motivo ? ` (${bloqueio.motivo})` : ''}. Dá para marcar assim mesmo, como encaixe.
            </Aviso>
          )}

          {/* Paciente */}
          <div>
            <label style={labelStyle}>Paciente *</label>

            {paciente ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 13px', borderRadius: 9, border: '1px solid #1E6E8C', background: '#EAF3F6' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <Check size={14} color="#1E6E8C" style={{ flexShrink: 0 }} />
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: '#16232B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {paciente.nome_lead ?? 'Sem nome'}
                    {paciente.whatsapp_lead && <span style={{ fontWeight: 500, color: '#6B818C' }}> · {formatarParaExibicao(paciente.whatsapp_lead)}</span>}
                  </span>
                </div>
                <button onClick={() => { setPaciente(null); setBusca('') }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: '#1E6E8C', fontFamily: "'Plus Jakarta Sans', sans-serif", flexShrink: 0, padding: 0 }}>
                  Trocar
                </button>
              </div>
            ) : modoNovo ? (
              <div style={{ border: '1px solid #DCE6EA', borderRadius: 11, padding: 14, display: 'flex', flexDirection: 'column', gap: 11 }}>
                <div style={{ fontSize: 12.5, color: '#6B818C', lineHeight: 1.5 }}>
                  Vai ser criado como contato novo no CRM, com status “Iniciou Conversa”.
                </div>
                <input value={novoNome} onChange={(e) => { setNovoNome(e.target.value); setErro('') }} placeholder="Nome do paciente *" style={inputStyle}
                  onFocus={(e) => (e.target.style.borderColor = '#1E6E8C')} onBlur={(e) => (e.target.style.borderColor = '#DCE6EA')} />

                <CampoTelefone
                  valor={novoWhatsapp}
                  onChange={(canonico, valido) => {
                    setNovoWhatsapp(canonico)
                    setNovoWhatsappValido(valido)
                    setDuplicado(null)
                    setErro('')
                    if (valido) buscarPorWhatsapp(canonico).then((p) => setDuplicado(p as PacienteResumo | null))
                  }}
                  aviso={duplicado && (
                    <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: '10px 12px', fontSize: 12.5, color: '#B45309', lineHeight: 1.5 }}>
                      Esse número já é de <strong>{duplicado.nome_lead ?? 'um contato sem nome'}</strong>.
                      <button
                        onClick={() => {
                          // Era isto que faltava: em vez de recusar e deixar a
                          // equipe travada, leva direto para a pessoa certa.
                          setPaciente(duplicado)
                          setModoNovo(false)
                          setDuplicado(null)
                          setNovoNome(''); setNovoWhatsapp(''); setNovoWhatsappValido(false)
                        }}
                        style={{ display: 'block', marginTop: 6, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 12.5, fontWeight: 700, color: '#1E6E8C', fontFamily: "'Plus Jakarta Sans', sans-serif" }}
                      >
                        Agendar para essa pessoa →
                      </button>
                    </div>
                  )}
                />

                <button onClick={() => { setModoNovo(false); setNovoNome(''); setNovoWhatsapp(''); setNovoWhatsappValido(false); setDuplicado(null) }}
                  style={{ alignSelf: 'flex-start', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: '#1E6E8C', fontFamily: "'Plus Jakarta Sans', sans-serif", padding: 0 }}>
                  ← Buscar um paciente já cadastrado
                </button>
              </div>
            ) : (
              <>
                <div style={{ position: 'relative' }}>
                  <Search size={15} color="#6B818C" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
                  <input value={busca} onChange={(e) => handleBusca(e.target.value)}
                    placeholder="Buscar por nome ou WhatsApp..." style={{ ...inputStyle, paddingLeft: 34 }}
                    onFocus={(e) => (e.target.style.borderColor = '#1E6E8C')} onBlur={(e) => (e.target.style.borderColor = '#DCE6EA')} />
                </div>

                {termoLimpo.length >= 2 && (
                  <div style={{ border: '1px solid #DCE6EA', borderRadius: 10, marginTop: 8, overflow: 'hidden' }}>
                    {buscando ? (
                      <div style={{ padding: '11px 13px', fontSize: 12.5, color: '#6B818C' }}>Buscando...</div>
                    ) : resultados.length > 0 ? (
                      resultados.map((r, idx) => (
                        <button key={r.id} onClick={() => { setPaciente(r); setResultados([]) }}
                          style={{ width: '100%', textAlign: 'left', padding: '10px 13px', border: 'none', borderBottom: idx < resultados.length - 1 ? '1px solid #EDF2F4' : 'none', background: idx % 2 === 0 ? '#fff' : '#F7FAFB', cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                          <div style={{ fontSize: 13.5, fontWeight: 600, color: '#16232B' }}>{r.nome_lead ?? 'Sem nome'}</div>
                          <div style={{ fontSize: 12, color: '#6B818C', marginTop: 2 }}>{formatarParaExibicao(r.whatsapp_lead) || 'Sem WhatsApp'}</div>
                        </button>
                      ))
                    ) : (
                      <div style={{ padding: '11px 13px', fontSize: 12.5, color: '#6B818C' }}>Ninguém encontrado com esse termo.</div>
                    )}
                  </div>
                )}

                <button onClick={() => { setModoNovo(true); setNovoNome(termoLimpo); setErro('') }}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 9, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: '#1E6E8C', fontFamily: "'Plus Jakarta Sans', sans-serif", padding: 0 }}>
                  <UserPlus size={13} /> Cadastrar paciente novo
                </button>
              </>
            )}
          </div>

          {/* PROCEDIMENTO: LISTA FECHADA, SEM CAMPO LIVRE.

              O que a recepção digitava aqui é o que responde "qual o
              procedimento mais realizado?" — e digitado ele não responde nada:
              "limpeza", "Limpeza" e "Limpeza e Profilaxia" viram três coisas.

              Sem escape de "Outro", por escolha: o catálogo é editável em
              Procedimentos, e cadastrar o que falta leva dez segundos. Um campo
              livre de emergência vira o caminho normal em duas semanas.

              O banco confere de novo (trigger `consultas_procedimento_valido`,
              migração 0022) — o select impede o erro, a trigger garante que ele
              não passe por outra porta. */}
          <div>
            <label style={labelStyle}>Procedimento *</label>
            <select
              value={procedimento}
              onChange={(e) => { setProcedimento(e.target.value); setErro('') }}
              style={{ ...inputStyle, cursor: 'pointer' }}
              onFocus={(e) => (e.target.style.borderColor = '#1E6E8C')}
              onBlur={(e) => (e.target.style.borderColor = '#DCE6EA')}
            >
              <option value="">
                {catalogo.length ? 'Escolha o procedimento...' : 'Carregando...'}
              </option>
              {catalogo.map((nome) => (
                <option key={nome} value={nome}>{nome}</option>
              ))}
            </select>
            {catalogo.length > 0 && (
              <div style={{ fontSize: 11.5, color: '#6B818C', marginTop: 5 }}>
                Falta algum? Cadastre em <strong>Procedimentos</strong> e ele aparece aqui.
              </div>
            )}
          </div>

          <div>
            <label style={labelStyle}>Observações (opcional)</label>
            <textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={2}
              placeholder="Algo que a equipe precise saber..." style={{ ...inputStyle, resize: 'vertical' }}
              onFocus={(e) => (e.target.style.borderColor = '#1E6E8C')} onBlur={(e) => (e.target.style.borderColor = '#DCE6EA')} />
          </div>
        </div>

        {erro && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '9px 12px', fontSize: 13, color: '#DC2626', marginTop: 14 }}>{erro}</div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button onClick={onClose}
            style={{ flex: 1, padding: '10px', borderRadius: 9, border: '1px solid #DCE6EA', background: '#fff', cursor: 'pointer', fontSize: 13.5, fontWeight: 600, color: '#6B818C', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
            Cancelar
          </button>
          <button onClick={handleSalvar} disabled={salvando || impedido}
            style={{ flex: 2, padding: '10px', borderRadius: 9, border: 'none', background: impedido ? '#DCE6EA' : salvando ? '#4C90A8' : '#1E6E8C', color: impedido ? '#6B818C' : '#fff', cursor: impedido || salvando ? 'not-allowed' : 'pointer', fontSize: 13.5, fontWeight: 600, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
            {salvando ? 'Salvando...' : 'Agendar'}
          </button>
        </div>
      </div>
    </div>
  )
}

/** Próxima hora cheia — padrão razoável ao abrir o modal pelo botão. */
function proximaHoraCheia(): Date {
  const d = new Date()
  d.setMinutes(0, 0, 0)
  d.setHours(d.getHours() + 1)
  return d
}
