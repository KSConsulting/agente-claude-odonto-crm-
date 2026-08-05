import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  CalendarDays, ChevronLeft, ChevronRight, Plus, X, Clock, User, BriefcaseMedical, ArrowRight, Ban,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import {
  diasDaSemana, fimDaConsulta, gradeDoMes, inicioDaConsulta, limitesDaGrade, rotuloDoPeriodo, somarDias,
} from '../lib/agenda'
import { COR_SEM_PROFISSIONAL } from '../lib/cores'
import AgendaSemana from '../components/AgendaSemana'
import AgendaMes from '../components/AgendaMes'
import NovoAgendamentoModal from '../components/NovoAgendamentoModal'
import type {
  ConsultaAgenda, Profissional, ProfissionalBloqueio, ProfissionalHorario,
} from '../types'

/* ──────────────────────────────────────────────
   Agenda — todas as agendas da clínica no mesmo calendário.

   Não existe tabela de agenda: a agenda de um profissional são as consultas
   com o `profissional_id` dele. Cadastrar o profissional já cria a agenda, e a
   cor escolhida lá é a cor dos blocos aqui.
────────────────────────────────────────────── */

type Modo = 'semana' | 'mes'

/** Chave do filtro das consultas que ainda não têm profissional definido. */
const SEM_PROFISSIONAL = 'sem-profissional'

const SELECT_CONSULTAS = '*, lead:crm_clinica_dados(id, nome_lead, whatsapp_lead)'

/* ──────────────────────────────────────────────
   Detalhe da consulta
────────────────────────────────────────────── */
function DetalheConsulta({
  consulta, profissional, onFechar, onCancelada,
}: {
  consulta: ConsultaAgenda
  profissional: Profissional | undefined
  onFechar: () => void
  onCancelada: (c: ConsultaAgenda) => void
}) {
  const navigate = useNavigate()
  const [cancelando, setCancelando] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const [erro, setErro] = useState('')

  const inicio = inicioDaConsulta(consulta)
  const cor = profissional?.cor ?? COR_SEM_PROFISSIONAL.hex

  const handleCancelar = async () => {
    setCancelando(true); setErro('')
    const { error } = await supabase.from('consultas')
      .update({ status: 'cancelada', cancelado_em: new Date().toISOString() })
      .eq('id', consulta.id)
    setCancelando(false)
    if (error) { setErro('Erro ao cancelar. Tente novamente.'); return }
    // O funil acompanha sozinho: o trigger `consultas_sincroniza_lead` devolve
    // o lead para "Consulta Cancelada" e limpa a data futura da ficha.
    onCancelada({ ...consulta, status: 'cancelada', cancelado_em: new Date().toISOString() })
    onFechar()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 150, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      onClick={(e) => { if (e.target === e.currentTarget) onFechar() }}>
      <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #DCE6EA', width: '100%', maxWidth: 440, overflow: 'hidden', boxShadow: '0 8px 48px rgba(0,0,0,0.12)' }}>

        <div style={{ height: 5, background: cor }} />

        <div style={{ padding: '22px 26px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 18 }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#16232B' }}>{consulta.lead?.nome_lead ?? 'Sem nome'}</div>
              <div style={{ fontSize: 13, color: '#6B818C', marginTop: 3 }}>{consulta.procedimento}</div>
            </div>
            <button onClick={onFechar} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, flexShrink: 0 }}>
              <X size={18} color="#6B818C" />
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, color: '#16232B' }}>
              <Clock size={14} color="#6B818C" />
              {inicio.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}, {' '}
              {inicio.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} – {fimDaConsulta(consulta).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, color: '#16232B' }}>
              <BriefcaseMedical size={14} color="#6B818C" />
              {profissional ? `${profissional.nome} ${profissional.sobrenome}`.trim() : 'Sem profissional definido'}
            </div>
            {consulta.lead?.whatsapp_lead && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, color: '#16232B' }}>
                <User size={14} color="#6B818C" /> {consulta.lead.whatsapp_lead}
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 11.5, fontWeight: 600, marginLeft: 23,
                background: consulta.status === 'cancelada' ? '#FEF2F2' : consulta.status === 'realizada' ? '#14532D' : '#E8F8EF',
                color: consulta.status === 'cancelada' ? '#DC2626' : consulta.status === 'realizada' ? '#fff' : '#1A7A48' }}>
                {consulta.status.charAt(0).toUpperCase() + consulta.status.slice(1)}
              </span>
              {consulta.origem === 'agente_ia' && (
                <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 11.5, fontWeight: 600, background: '#EAF3F6', color: '#1E6E8C' }}>
                  Agente de IA
                </span>
              )}
            </div>
            {consulta.observacoes && (
              <div style={{ fontSize: 12.5, color: '#6B818C', lineHeight: 1.6, background: '#F7FAFB', borderRadius: 8, padding: '9px 12px', marginTop: 2 }}>
                {consulta.observacoes}
              </div>
            )}
          </div>

          {erro && (
            <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '9px 12px', fontSize: 12.5, color: '#DC2626', marginTop: 14 }}>{erro}</div>
          )}

          <div style={{ display: 'flex', gap: 9, marginTop: 20, flexWrap: 'wrap' }}>
            {consulta.lead && (
              <button onClick={() => navigate(`/leads/${consulta.lead!.id}`)}
                style={{ flex: 1, minWidth: 150, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px', borderRadius: 9, border: 'none', background: '#1E6E8C', color: '#fff', cursor: 'pointer', fontSize: 13.5, fontWeight: 600, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                Ver ficha <ArrowRight size={14} />
              </button>
            )}
            {consulta.status === 'agendada' && (
              confirmando ? (
                <button onClick={handleCancelar} disabled={cancelando}
                  style={{ flex: 1, minWidth: 150, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px', borderRadius: 9, border: 'none', background: '#DC2626', color: '#fff', cursor: cancelando ? 'not-allowed' : 'pointer', fontSize: 13.5, fontWeight: 600, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                  {cancelando ? 'Cancelando...' : 'Confirmar cancelamento'}
                </button>
              ) : (
                <button onClick={() => setConfirmando(true)}
                  style={{ flex: 1, minWidth: 150, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px', borderRadius: 9, border: '1px solid #DCE6EA', background: '#fff', color: '#DC2626', cursor: 'pointer', fontSize: 13.5, fontWeight: 600, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                  <Ban size={14} /> Cancelar consulta
                </button>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ──────────────────────────────────────────────
   Página
────────────────────────────────────────────── */
export default function Agenda() {
  const [modo, setModo] = useState<Modo>('semana')
  const [referencia, setReferencia] = useState(new Date())

  const [profissionais, setProfissionais] = useState<Profissional[]>([])
  const [horarios, setHorarios] = useState<ProfissionalHorario[]>([])
  const [bloqueios, setBloqueios] = useState<ProfissionalBloqueio[]>([])
  const [consultas, setConsultas] = useState<ConsultaAgenda[]>([])

  const [visiveis, setVisiveis] = useState<Set<string>>(new Set())
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  const [modalNovo, setModalNovo] = useState<{ quando?: Date } | null>(null)
  const [detalhe, setDetalhe] = useState<ConsultaAgenda | null>(null)

  /* Intervalo carregado: exatamente o que a visão atual desenha. */
  const intervalo = useMemo(() => {
    if (modo === 'semana') {
      const dias = diasDaSemana(referencia)
      return { inicio: dias[0], fim: somarDias(dias[6], 1) }
    }
    const dias = gradeDoMes(referencia)
    return { inicio: dias[0], fim: somarDias(dias[dias.length - 1], 1) }
  }, [modo, referencia])

  /* Profissionais, jornadas e bloqueios — carregam uma vez. */
  useEffect(() => {
    Promise.all([
      supabase.from('profissionais').select('*').order('nome'),
      supabase.from('profissional_horarios').select('*'),
      supabase.from('profissional_bloqueios').select('*'),
    ]).then(([{ data: profs }, { data: hors }, { data: blocs }]) => {
      const lista = (profs ?? []) as Profissional[]
      setProfissionais(lista)
      setHorarios((hors ?? []) as ProfissionalHorario[])
      setBloqueios((blocs ?? []) as ProfissionalBloqueio[])
      setVisiveis(new Set([...lista.map((p) => p.id), SEM_PROFISSIONAL]))
    })
  }, [])

  const carregarConsultas = useCallback(async () => {
    const { data, error } = await supabase.from('consultas')
      .select(SELECT_CONSULTAS)
      .gte('data_consulta', intervalo.inicio.toISOString())
      .lt('data_consulta', intervalo.fim.toISOString())
      .order('data_consulta')
    if (error) { setErro('Erro ao carregar a agenda. Recarregue a página.'); setCarregando(false); return }
    setErro('')
    setConsultas((data ?? []) as unknown as ConsultaAgenda[])
    setCarregando(false)
  }, [intervalo])

  useEffect(() => { carregarConsultas() }, [carregarConsultas])

  /* Realtime: o Agente de IA marca pelo WhatsApp com a agenda aberta na
     recepção. Sem isto, a tela mente até alguém apertar F5.
     Recarrega o período em vez de aplicar o payload: o evento vem da tabela
     `consultas` e não traz o nome do paciente, que vem do join. */
  useEffect(() => {
    const canal = supabase
      .channel('agenda-consultas')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'consultas' }, () => { carregarConsultas() })
      .subscribe()
    return () => { supabase.removeChannel(canal) }
  }, [carregarConsultas])

  const profissionaisPorId = useMemo(
    () => new Map(profissionais.map((p) => [p.id, p])),
    [profissionais],
  )

  const consultasVisiveis = useMemo(
    () => consultas.filter((c) => visiveis.has(c.profissional_id ?? SEM_PROFISSIONAL)),
    [consultas, visiveis],
  )

  /* Uma única agenda visível → dá para sombrear o fora-de-expediente dela. */
  const idsVisiveisReais = [...visiveis].filter((v) => v !== SEM_PROFISSIONAL)
  const jornadaDestaque = idsVisiveisReais.length === 1
    ? horarios.filter((h) => h.profissional_id === idsVisiveisReais[0])
    : undefined

  const limites = useMemo(() => {
    const relevantes = idsVisiveisReais.length > 0
      ? horarios.filter((h) => idsVisiveisReais.includes(h.profissional_id))
      : horarios
    return limitesDaGrade(relevantes)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [horarios, visiveis])

  const alternarVisivel = (id: string) => {
    setVisiveis((prev) => {
      const novo = new Set(prev)
      if (novo.has(id)) novo.delete(id)
      else novo.add(id)
      return novo
    })
  }

  const navegar = (passo: number) => {
    setReferencia((prev) => {
      if (modo === 'semana') return somarDias(prev, passo * 7)
      return new Date(prev.getFullYear(), prev.getMonth() + passo, 1)
    })
  }

  const temSemProfissional = consultas.some((c) => !c.profissional_id)
  const ativos = profissionais.filter((p) => p.ativo)

  const botaoIcone: React.CSSProperties = {
    width: 32, height: 32, borderRadius: 8, border: '1px solid #DCE6EA', background: '#fff',
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
  }

  if (carregando) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '80vh' }}>
        <div style={{ width: 32, height: 32, border: '3px solid #EAF3F6', borderTopColor: '#1E6E8C', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  return (
    <div style={{ padding: '32px 36px', maxWidth: 1300, margin: '0 auto' }}>

      {/* Header */}
      <div className="fade-in-1" style={{ marginBottom: 18, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: '#EAF3F6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <CalendarDays size={18} color="#1E6E8C" strokeWidth={2} />
            </div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#16232B', margin: 0 }}>Agenda</h1>
          </div>
          <p style={{ fontSize: 16.5, fontWeight: 500, color: '#3A5560', marginTop: 10, marginBottom: 0, lineHeight: 1.45 }}>
            As agendas de todos os profissionais, no mesmo calendário.
          </p>
        </div>

        <button onClick={() => setModalNovo({})}
          style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 16px', borderRadius: 9, border: 'none', background: '#1E6E8C', cursor: 'pointer', fontSize: 13.5, fontWeight: 600, color: '#fff', fontFamily: "'Plus Jakarta Sans', sans-serif", flexShrink: 0 }}>
          <Plus size={15} /> Novo Agendamento
        </button>
      </div>

      {/* Barra de controle */}
      <div className="fade-in-2" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => navegar(-1)} style={botaoIcone} title="Anterior"><ChevronLeft size={16} color="#6B818C" /></button>
          <button onClick={() => navegar(1)} style={botaoIcone} title="Próximo"><ChevronRight size={16} color="#6B818C" /></button>
          <button onClick={() => setReferencia(new Date())}
            style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid #DCE6EA', background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#6B818C', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
            Hoje
          </button>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#16232B', marginLeft: 4 }}>
            {rotuloDoPeriodo(referencia, modo)}
          </span>
        </div>

        <div style={{ display: 'inline-flex', background: '#fff', border: '1px solid #DCE6EA', borderRadius: 9, padding: 3, gap: 3 }}>
          {(['semana', 'mes'] as Modo[]).map((m) => (
            <button key={m} onClick={() => setModo(m)}
              style={{ padding: '6px 16px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: "'Plus Jakarta Sans', sans-serif", background: modo === m ? '#1E6E8C' : 'transparent', color: modo === m ? '#fff' : '#6B818C', transition: 'background 0.15s' }}>
              {m === 'semana' ? 'Semana' : 'Mês'}
            </button>
          ))}
        </div>
      </div>

      {/* Filtro por agenda */}
      {(ativos.length > 0 || temSemProfissional) && (
        <div className="fade-in-2" style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 14, flexWrap: 'wrap' }}>
          {ativos.map((p) => {
            const ligado = visiveis.has(p.id)
            return (
              <button key={p.id} onClick={() => alternarVisivel(p.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7, padding: '6px 13px', borderRadius: 20, cursor: 'pointer',
                  border: `1px solid ${ligado ? p.cor : '#DCE6EA'}`,
                  background: ligado ? `${p.cor}14` : '#fff',
                  color: ligado ? p.cor : '#B9C8CE',
                  fontSize: 12.5, fontWeight: 600, fontFamily: "'Plus Jakarta Sans', sans-serif", transition: 'all 0.15s',
                }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: ligado ? p.cor : '#DCE6EA', display: 'inline-block' }} />
                {p.nome} {p.sobrenome}
              </button>
            )
          })}

          {temSemProfissional && (
            <button onClick={() => alternarVisivel(SEM_PROFISSIONAL)}
              style={{
                display: 'flex', alignItems: 'center', gap: 7, padding: '6px 13px', borderRadius: 20, cursor: 'pointer',
                border: `1px dashed ${visiveis.has(SEM_PROFISSIONAL) ? COR_SEM_PROFISSIONAL.hex : '#DCE6EA'}`,
                background: '#fff',
                color: visiveis.has(SEM_PROFISSIONAL) ? COR_SEM_PROFISSIONAL.hex : '#B9C8CE',
                fontSize: 12.5, fontWeight: 600, fontFamily: "'Plus Jakarta Sans', sans-serif",
              }}>
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: COR_SEM_PROFISSIONAL.hex, display: 'inline-block' }} />
              Sem profissional
            </button>
          )}
        </div>
      )}

      {erro && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 9, padding: '10px 14px', fontSize: 13, color: '#DC2626', marginBottom: 14 }}>{erro}</div>
      )}

      {/* Sem profissionais ainda */}
      {profissionais.length === 0 ? (
        <div className="fade-in-3" style={{ background: '#fff', borderRadius: 14, border: '1px solid #DCE6EA', padding: '48px 24px', textAlign: 'center' }}>
          <CalendarDays size={34} strokeWidth={1.2} color="#B9C8CE" style={{ marginBottom: 10 }} />
          <div style={{ fontSize: 14, fontWeight: 600, color: '#16232B' }}>Nenhuma agenda ainda</div>
          <div style={{ fontSize: 13, color: '#6B818C', marginTop: 6, lineHeight: 1.6, maxWidth: 400, marginInline: 'auto' }}>
            A agenda de um profissional nasce junto com o cadastro dele. Cadastre o primeiro dentista para o calendário ganhar conteúdo.
          </div>
          <Link to="/profissionais"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, marginTop: 18, padding: '9px 16px', borderRadius: 9, background: '#1E6E8C', color: '#fff', textDecoration: 'none', fontSize: 13.5, fontWeight: 600 }}>
            <BriefcaseMedical size={15} /> Cadastrar profissional
          </Link>
        </div>
      ) : (
        <div className="fade-in-3">
          {modo === 'semana' ? (
            <AgendaSemana
              dias={diasDaSemana(referencia)}
              consultas={consultasVisiveis}
              profissionaisPorId={profissionaisPorId}
              limites={limites}
              jornadaDestaque={jornadaDestaque}
              onClickConsulta={setDetalhe}
              onClickHorarioVazio={(quando) => setModalNovo({ quando })}
            />
          ) : (
            <AgendaMes
              referencia={referencia}
              consultas={consultasVisiveis}
              profissionaisPorId={profissionaisPorId}
              onClickConsulta={setDetalhe}
              onClickDia={(dia) => { setReferencia(dia); setModo('semana') }}
            />
          )}
        </div>
      )}

      {modalNovo && (
        <NovoAgendamentoModal
          profissionais={profissionais}
          horarios={horarios}
          bloqueios={bloqueios}
          consultas={consultas}
          dataInicial={modalNovo.quando}
          profissionalInicial={idsVisiveisReais.length === 1 ? idsVisiveisReais[0] : null}
          onClose={() => setModalNovo(null)}
          onSalvo={(c) => setConsultas((prev) => [...prev, c])}
        />
      )}

      {detalhe && (
        <DetalheConsulta
          consulta={detalhe}
          profissional={detalhe.profissional_id ? profissionaisPorId.get(detalhe.profissional_id) : undefined}
          onFechar={() => setDetalhe(null)}
          onCancelada={(c) => setConsultas((prev) => prev.map((x) => (x.id === c.id ? c : x)))}
        />
      )}
    </div>
  )
}
