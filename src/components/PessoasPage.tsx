import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Search, Download, FileText, Users, UserCheck, UserPlus, X, ArrowRight, CalendarPlus, Filter } from 'lucide-react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { supabase } from '../lib/supabase'
import { isPaciente } from '../lib/pessoas'
import { buscarPorWhatsapp, ERRO_DUPLICADO, type PessoaResumo } from '../lib/contatos'
import { apenasDigitos, formatarParaExibicao } from '../lib/telefones'
import { useCatalogoProcedimentos } from '../lib/procedimentos'
import { motivoForaDaJornada } from '../lib/agenda'
import CampoTelefone from './CampoTelefone'
import AvisoBaixaConsulta from './AvisoBaixaConsulta'
import FiltroPeriodo from './FiltroPeriodo'
import {
  getPeriodRange, inRange,
  type DateRange, type PeriodKey,
} from '../lib/periodo'
import type { LeadClinica, LeadStatus, Profissional, ProfissionalHorario } from '../types'

/* ──────────────────────────────────────────────
   Implementação compartilhada entre /leads e /clientes.

   As duas páginas leem a MESMA tabela (`crm_clinica`) e se diferenciam
   apenas pelo status: quem já realizou consulta é Paciente, o resto é
   Contato. Por isso uma única implementação com `mode`, em vez de dois
   arquivos quase idênticos.
────────────────────────────────────────────── */

export type PessoasMode = 'leads' | 'clientes'

interface ModeConfig {
  titulo: string
  subtitulo: string
  explicacao: string
  outraPagina: { rota: string; label: string }
  icone: typeof Users
  corIcone: string
  botaoNovo: string
  arquivo: string
  vazio: string
  /**
   * A última coluna da tabela, que NÃO é a mesma nas duas páginas.
   *
   * Em Contatos a pergunta é "quem tem consulta marcada?" → `data_agendamento`,
   * a próxima. Em Pacientes essa coluna seria sempre vazia: virar paciente
   * significa que a consulta aconteceu, e o trigger da `0015` zera
   * `data_agendamento` quando não sobra nenhuma ativa. Lá a pergunta é outra —
   * "quando essa pessoa esteve aqui?" — e quem responde é `ultima_consulta`.
   */
  colunaData: { titulo: string; campo: 'data_agendamento' | 'ultima_consulta'; vazio: string }
}

const CONFIG: Record<PessoasMode, ModeConfig> = {
  leads: {
    titulo: 'Contatos (Leads)',
    subtitulo: 'Pessoas que ainda não foram atendidas na clínica.',
    explicacao: 'Aqui você encontra as pessoas que entraram em contato com a clínica, estão em atendimento ou possuem uma consulta agendada.',
    outraPagina: { rota: '/clientes', label: 'Ver Pacientes (Clientes)' },
    icone: Users,
    corIcone: '#1E6E8C',
    botaoNovo: 'Novo Contato',
    arquivo: 'contatos',
    vazio: 'Nenhum contato nesse período.',
    colunaData: { titulo: 'Consulta Marcada', campo: 'data_agendamento', vazio: 'Sem consulta' },
  },
  clientes: {
    titulo: 'Pacientes (Clientes)',
    subtitulo: 'Pessoas que já foram atendidas na clínica.',
    explicacao: 'Aqui você encontra todos os pacientes que já realizaram pelo menos um atendimento na clínica, com acesso às suas informações e histórico.',
    outraPagina: { rota: '/leads', label: 'Ver Contatos (Leads)' },
    icone: UserCheck,
    corIcone: '#1A7A48',
    botaoNovo: 'Novo Paciente',
    arquivo: 'pacientes',
    vazio: 'Nenhum paciente nesse período.',
    // Paciente sem data aqui é ficha ANTIGA: hoje ninguém entra em Pacientes
    // sem uma consulta realizada por trás, então esta linha só descreve o que
    // já estava no banco. Dizer isso é melhor que um traço mudo.
    colunaData: { titulo: 'Última Consulta', campo: 'ultima_consulta', vazio: 'Cadastrado à mão' },
  },
}

/* ──────────────────────────────────────────────
   Types & constants
────────────────────────────────────────────── */
const STATUS_LABELS: Record<LeadStatus, string> = {
  iniciou_conversa: 'Iniciou Conversa',
  conversando: 'Conversando',
  consulta_agendada: 'Consulta Agendada',
  consulta_cancelada: 'Consulta Cancelada',
  follow_up_1_feito: 'Follow-up 1',
  follow_up_2_feito: 'Follow-up 2',
  follow_up_3_feito: 'Follow-up 3',
  consulta_realizada: 'Consulta Realizada',
  paciente_recorrente: 'Paciente Recorrente',
}

const STATUS_STYLE: Record<LeadStatus, { bg: string; color: string; pulse?: boolean }> = {
  iniciou_conversa:   { bg: '#EAF3F6', color: '#1E6E8C', pulse: true },
  conversando:        { bg: '#EEF2FF', color: '#4F46E5' },
  consulta_agendada:  { bg: '#E8F8EF', color: '#1A7A48' },
  consulta_cancelada: { bg: '#FEF2F2', color: '#DC2626' },
  follow_up_1_feito:  { bg: '#FFFBEB', color: '#D97706' },
  follow_up_2_feito:  { bg: '#FFFBEB', color: '#D97706' },
  follow_up_3_feito:  { bg: '#FFFBEB', color: '#D97706' },
  consulta_realizada: { bg: '#14532D', color: '#fff' },
  paciente_recorrente:{ bg: '#F3E8FF', color: '#7C3AED' },
}

/* ──────────────────────────────────────────────
   Helpers
────────────────────────────────────────────── */
function fmtDate(str: string | null) {
  if (!str) return '—'
  return new Date(str).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/* ──────────────────────────────────────────────
   StatusBadge
────────────────────────────────────────────── */
function StatusBadge({ status }: { status: LeadStatus }) {
  const s = STATUS_STYLE[status]
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 20, fontSize: 11.5, fontWeight: 600, background: s.bg, color: s.color, whiteSpace: 'nowrap' }}>
      {s.pulse && <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.color, animation: 'pulse-dot 1.4s ease infinite', display: 'inline-block' }} />}
      {STATUS_LABELS[status]}
    </span>
  )
}

/* ──────────────────────────────────────────────
   NewLeadModal
────────────────────────────────────────────── */
interface NewLeadForm {
  nome: string
  whatsapp: string
  procedimentos: string[]
  data_nascimento: string
  anotacoes: string
}

/**
 * A consulta que o cadastro pode criar junto com a pessoa.
 *
 * Note que NÃO há aqui um campo dizendo se ela já aconteceu ou vai acontecer.
 * **Quem responde isso é a própria data**: no passado, aconteceu; no futuro,
 * vai acontecer. Um seletor ao lado de um campo que já responde a pergunta é
 * pedir para os dois discordarem — e o perdedor era sempre quem digitou.
 */
interface NewConsulta {
  quando: string
  procedimento: string
  profissional_id: string
  duracao: string
}

const DURACOES = [15, 30, 45, 60, 90, 120]

interface NewLeadModalProps {
  titulo: string
  onClose: () => void
  onSaved: (lead: LeadClinica) => void
}

function NewLeadModal({ titulo, onClose, onSaved }: NewLeadModalProps) {
  const [form, setForm] = useState<NewLeadForm>({
    nome: '', whatsapp: '', procedimentos: [], data_nascimento: '', anotacoes: '',
  })
  const [whatsappValido, setWhatsappValido] = useState(false)
  const [duplicado, setDuplicado] = useState<PessoaResumo | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const catalogo = useCatalogoProcedimentos()

  const [consulta, setConsulta] = useState<NewConsulta>({
    quando: '', procedimento: '', profissional_id: '', duracao: '60',
  })
  const [agora, setAgora] = useState(() => Date.now())
  const [profissionais, setProfissionais] = useState<Profissional[]>([])
  const [horarios, setHorarios] = useState<ProfissionalHorario[]>([])
  /* A pessoa que JÁ foi criada, quando só a consulta falhou. Sem guardar isto,
     tentar de novo bateria no WhatsApp duplicado — e o erro apontaria para o
     lugar errado, culpando o número de quem acabou de ser cadastrado. */
  const [jaCriado, setJaCriado] = useState<LeadClinica | null>(null)

  useEffect(() => {
    // A jornada vem junto com os profissionais: uma consulta no futuro é um
    // agendamento, e agendamento fora da jornada deixou de ser possível.
    void Promise.all([
      supabase.from('profissionais').select('*').eq('ativo', true).order('nome'),
      supabase.from('profissional_horarios').select('*'),
    ]).then(([{ data: profs }, { data: hors }]) => {
      setProfissionais((profs ?? []) as Profissional[])
      setHorarios((hors ?? []) as ProfissionalHorario[])
    })
  }, [])

  /* A DATA DECIDE — E É A ÚNICA COISA QUE DECIDE.

     No passado, a consulta aconteceu (`realizada`, e a pessoa vira Paciente);
     no futuro, vai acontecer (`agendada`, e ela fica em Contatos com "Consulta
     Agendada"); sem data, nenhuma consulta é criada e ela entra como Contato.

     Havia aqui um seletor "Lead / Paciente", e ele foi removido: com a data
     respondendo à mesma pergunta, ele não decidia mais nada — e quando os dois
     discordavam (Paciente + data no futuro), quem levava um erro na cara era
     quem tinha digitado a informação certa. */
  const instante = (() => {
    if (!consulta.quando) return null
    const d = new Date(consulta.quando)
    return isNaN(d.getTime()) ? null : d
  })()
  /* `Date.now()` durante a renderização é impuro, e o ESLint reprova com razão:
     o resultado mudaria sozinho a cada re-render. O relógio é lido na abertura
     do modal e relido a cada mexida no campo de data — que é o único momento em
     que a resposta pode ter mudado para quem está olhando. */
  const jaAconteceu = instante !== null && instante.getTime() <= agora

  /* A MESMA REGRA DA AGENDA, PELA MESMA FUNÇÃO — e só para o que está sendo
     MARCADO. No passado a consulta é histórico (`realizada`), e a jornada de
     hoje não tem o que dizer sobre um atendimento que já aconteceu; no futuro
     ela é agendamento, e vale a recusa. É a mesma divisão da ficha do lead. */
  const profissionalDaConsulta = profissionais.find((p) => p.id === consulta.profissional_id) ?? null
  const foraDaJornada = !jaAconteceu && instante && profissionalDaConsulta
    ? motivoForaDaJornada(
        horarios.filter((h) => h.profissional_id === consulta.profissional_id),
        instante,
        Number(consulta.duracao),
        `${profissionalDaConsulta.nome} ${profissionalDaConsulta.sobrenome}`.trim(),
      )
    : null

  const set = <C extends keyof NewLeadForm>(field: C, value: NewLeadForm[C]) =>
    setForm((f) => ({ ...f, [field]: value }))

  const setC = <C extends keyof NewConsulta>(field: C, value: NewConsulta[C]) =>
    setConsulta((c) => ({ ...c, [field]: value }))

  const handleWhatsapp = (canonico: string, valido: boolean) => {
    set('whatsapp', canonico)
    setWhatsappValido(valido)
    setDuplicado(null)
    setError('')
    // Só vale procurar quando o número está completo — com número pela metade
    // a busca não acha nada e a equipe acha que está livre.
    if (valido) buscarPorWhatsapp(canonico).then(setDuplicado)
  }

  const handleSave = async () => {
    if (!form.nome.trim()) { setError('O nome é obrigatório.'); return }
    if (!whatsappValido) { setError('Informe um WhatsApp válido, com o código do país.'); return }
    if (duplicado) { setError('Esse WhatsApp já pertence a outra pessoa.'); return }

    // A consulta é opcional. Com data preenchida, ela passa a ter exigências
    // próprias — e `procedimento` é `not null` no banco.
    if (consulta.quando && !instante) { setError('A data da consulta não é válida.'); return }
    if (instante && !consulta.procedimento) { setError('Escolha o procedimento da consulta.'); return }
    if (foraDaJornada) { setError(foraDaJornada); return }

    setSaving(true); setError('')

    /* QUEM TORNA ALGUÉM PACIENTE É A CONSULTA, E NÃO O BOTÃO.

       Antes, marcar "Paciente" gravava `consulta_realizada` na hora — e a
       pessoa ficava com a etiqueta verde "Consulta Realizada" sem uma consulta
       sequer por trás dela. A tela afirmava um atendimento que o sistema não
       tinha como mostrar.

       Sem data — ou com data no futuro — ela entra como Contato. É a mesma
       regra que já vale no resto do sistema (ninguém vira Paciente sem uma
       consulta realizada); o cadastro manual era a única exceção, e era ela
       que produzia a etiqueta vazia.

       Para a consulta no futuro quem grava o funil nem é esta linha: o trigger
       `consultas_sincroniza_lead` move para `consulta_agendada` logo depois. */
    const status: LeadStatus = jaAconteceu ? 'consulta_realizada' : 'iniciou_conversa'

    let pessoa = jaCriado
    if (!pessoa) {
      const { data, error: err } = await supabase.from('crm_clinica').insert({
        nome_lead: form.nome.trim(),
        whatsapp_lead: form.whatsapp,
        status,
        procedimentos_interesse: form.procedimentos,
        data_nascimento: form.data_nascimento || null,
        anotacoes: form.anotacoes.trim() || null,
      }).select().single()

      if (err) {
        setSaving(false)
        // Rede de segurança: entre a busca acima e este insert, o Agente de IA
        // pode ter criado a mesma pessoa. Quem decide é o índice do banco.
        if (err.code === ERRO_DUPLICADO) {
          setError('Esse WhatsApp acabou de ser cadastrado para outra pessoa.')
          buscarPorWhatsapp(form.whatsapp).then(setDuplicado)
          return
        }
        setError('Erro ao cadastrar. Tente novamente.')
        return
      }
      pessoa = data as LeadClinica
      setJaCriado(pessoa)
    }

    if (instante) {
      const { error: errConsulta } = await supabase.from('consultas').insert({
        lead_id: pessoa.id,
        profissional_id: consulta.profissional_id || null,
        procedimento: consulta.procedimento,
        data_consulta: instante.toISOString(),
        duracao_minutos: Number(consulta.duracao),
        // A data decide, e é a única coisa que decide.
        status: jaAconteceu ? 'realizada' : 'agendada',
        origem: 'equipe',
      })

      if (errConsulta) {
        setSaving(false)
        // A PESSOA JÁ ESTÁ NO BANCO. Dizer só "erro ao cadastrar" mandaria
        // alguém cadastrar de novo e bater no WhatsApp duplicado, procurando
        // defeito no número de quem acabou de entrar.
        const nome = form.nome.trim()
        setError(errConsulta.code === 'JOR01'
          // JOR01 = a trava de jornada do banco (migração 0025). Ver o
          // comentário gêmeo em NovoAgendamentoModal: é sinal de aba antiga.
          ? `${nome} foi cadastrado, mas a consulta não: ${errConsulta.message} Recarregue a página (Ctrl+F5) e marque pela Agenda.`
          : errConsulta.code === '23P01'
          // 23P01 = a restrição `consultas_sem_sobreposicao`.
          ? `${nome} foi cadastrado, mas a consulta não: esse profissional já tem consulta nesse horário. Marque pela Agenda.`
          : `${nome} foi cadastrado, mas a consulta não foi salva. Marque pela Agenda.`)
        return
      }

      // Consulta agendada move o funil pelo trigger `consultas_sincroniza_lead`.
      // Reler é o que impede a lista de mostrar o status de antes — e de deixar
      // a pessoa na página errada. É o caminho normal de quem marca para o
      // futuro: sai daqui como `iniciou_conversa` e volta `consulta_agendada`.
      const { data: atualizado } = await supabase.from('crm_clinica')
        .select('*').eq('id', pessoa.id).single()
      if (atualizado) pessoa = atualizado as LeadClinica
    }

    setSaving(false)
    onSaved(pessoa)
    onClose()
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid #DCE6EA',
    fontSize: 13.5, fontFamily: "'Plus Jakarta Sans', sans-serif", color: '#16232B',
    outline: 'none', background: '#fff', boxSizing: 'border-box',
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #DCE6EA', width: '100%', maxWidth: 500, padding: '28px 28px 24px', boxShadow: '0 8px 48px rgba(0,0,0,0.12)', maxHeight: '90vh', overflowY: 'auto' }}>

        {/* Modal header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: '#EAF3F6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <UserPlus size={17} color="#1E6E8C" />
            </div>
            <span style={{ fontSize: 15, fontWeight: 700, color: '#16232B' }}>{titulo}</span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 6 }}>
            <X size={18} color="#6B818C" />
          </button>
        </div>

        {/* O SELETOR "Lead / Paciente" MORAVA AQUI, E FOI REMOVIDO.

            Ele perguntava "já realizou consulta?" ao lado de um campo de data
            que responde a mesma coisa melhor — e quando os dois discordavam,
            quem levava o erro era quem tinha digitado a informação certa.

            Controle que não decide mais nada não é inofensivo: ele promete uma
            escolha e o sistema faz outra coisa. Hoje quem decide é a data, e
            o botão de salvar diz o que vai sair. */}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Nome */}
          <div>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: '#16232B', display: 'block', marginBottom: 6 }}>Nome *</label>
            <input value={form.nome} onChange={(e) => set('nome', e.target.value)} placeholder="Nome completo" style={inputStyle}
              onFocus={(e) => (e.target.style.borderColor = '#1E6E8C')} onBlur={(e) => (e.target.style.borderColor = '#DCE6EA')} />
          </div>

          {/* WhatsApp */}
          <CampoTelefone
            valor={form.whatsapp}
            onChange={handleWhatsapp}
            aviso={duplicado && (
              <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: '10px 12px', fontSize: 12.5, color: '#B45309', lineHeight: 1.5 }}>
                Esse número já é de <strong>{duplicado.nome_lead ?? 'um contato sem nome'}</strong>.
                <button
                  onClick={() => navigate(`/leads/${duplicado.id}`)}
                  style={{ display: 'block', marginTop: 6, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 12.5, fontWeight: 700, color: '#1E6E8C', fontFamily: "'Plus Jakarta Sans', sans-serif" }}
                >
                  Abrir a ficha dessa pessoa →
                </button>
              </div>
            )}
          />

          {/* PROCEDIMENTOS: CAIXAS, E NÃO TEXTO LIVRE.

              Digitado, o mesmo tratamento vira "Lentes de Contato", "lente de
              contato" e "lente pro dente" — três linhas do mesmo no relatório,
              e a pergunta "qual o mais procurado?" fica sem resposta.

              Caixas e não lista suspensa porque uma pessoa quer mais de uma
              coisa: lentes E clareamento é o caso normal, não a exceção. */}
          <div>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: '#16232B', display: 'block', marginBottom: 6 }}>
              Procedimentos de Interesse <span style={{ color: '#6B818C', fontWeight: 400 }}>(opcional)</span>
            </label>
            {catalogo.length === 0 ? (
              <div style={{ ...inputStyle, color: '#6B818C', display: 'flex', alignItems: 'center' }}>
                Carregando os procedimentos da clínica...
              </div>
            ) : (
              <div style={{
                border: '1px solid #DCE6EA', borderRadius: 9, padding: 8,
                maxHeight: 190, overflowY: 'auto',
                display: 'grid', gap: 2,
                gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
              }}>
                {catalogo.map((nome) => {
                  const marcado = form.procedimentos.includes(nome)
                  return (
                    <label key={nome} style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '6px 8px', borderRadius: 7, cursor: 'pointer',
                      background: marcado ? '#EAF3F6' : 'transparent',
                      fontSize: 13, color: marcado ? '#16232B' : '#6B818C',
                      fontWeight: marcado ? 600 : 400,
                    }}>
                      <input
                        type="checkbox" checked={marcado}
                        onChange={() => set('procedimentos', marcado
                          ? form.procedimentos.filter((p) => p !== nome)
                          : [...form.procedimentos, nome])}
                        style={{ accentColor: '#1E6E8C', cursor: 'pointer', flexShrink: 0 }}
                      />
                      {nome}
                    </label>
                  )
                })}
              </div>
            )}
            <div style={{ fontSize: 11.5, color: '#6B818C', marginTop: 5 }}>
              {form.procedimentos.length === 0
                ? 'Pode marcar mais de um, ou nenhum.'
                : `${form.procedimentos.length} marcado${form.procedimentos.length > 1 ? 's' : ''}.`}
            </div>
          </div>

          {/* A CONSULTA, DENTRO DO CADASTRO.

              Cadastrar um Paciente gravava "consulta realizada" sem dizer
              QUANDO: a coluna "Última Consulta" ficava em "Cadastrado à mão"
              para sempre, e a pessoa não tinha uma linha sequer no histórico.

              Só a data e a hora aparecem em repouso; o resto nasce quando ela é
              preenchida. Um formulário de agendamento inteiro sempre aberto num
              campo opcional é peso cobrado de quem não vai usá-lo.

              Vazio não cria nada, e esse caso é real: quem migra uma ficha
              antiga quase nunca sabe a data. */}
          <div style={{ border: '1px solid #DCE6EA', borderRadius: 10, background: '#F7FAFB', padding: '14px 14px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8, flexWrap: 'wrap' }}>
              <CalendarPlus size={14} color="#1E6E8C" />
              <span style={{ fontSize: 12.5, fontWeight: 700, color: '#16232B' }}>
                Consulta
              </span>
              <span style={{ fontSize: 11.5, color: '#6B818C' }}>(opcional)</span>
            </div>

            <input
              type="datetime-local"
              value={consulta.quando}
              onChange={(e) => {
                setAgora(Date.now())
                setC('quando', e.target.value)
                // Quem marcou UM interesse quase sempre vai marcar a consulta
                // dele. É sugestão, não trava — a lista continua aberta.
                if (e.target.value && !consulta.procedimento && form.procedimentos.length === 1) {
                  setC('procedimento', form.procedimentos[0])
                }
                setError('')
              }}
              style={inputStyle}
              onFocus={(e) => (e.target.style.borderColor = '#1E6E8C')}
              onBlur={(e) => (e.target.style.borderColor = '#DCE6EA')}
            />

            {!consulta.quando ? (
              <div style={{ fontSize: 11.5, color: '#6B818C', marginTop: 6, lineHeight: 1.5 }}>
                Sem data, nenhuma consulta é criada — e a pessoa entra como <strong>Contato</strong>.
                Quem torna alguém paciente é a consulta, não a etiqueta.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#16232B', display: 'block', marginBottom: 5 }}>
                    Procedimento *
                  </label>
                  <select
                    value={consulta.procedimento}
                    onChange={(e) => { setC('procedimento', e.target.value); setError('') }}
                    style={{ ...inputStyle, cursor: 'pointer' }}
                  >
                    <option value="">{catalogo.length ? 'Escolha o procedimento...' : 'Carregando...'}</option>
                    {catalogo.map((nome) => (
                      <option key={nome} value={nome}>{nome}</option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <div style={{ flex: 2, minWidth: 0 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#16232B', display: 'block', marginBottom: 5 }}>
                      Profissional
                    </label>
                    <select value={consulta.profissional_id} onChange={(e) => setC('profissional_id', e.target.value)}
                      style={{ ...inputStyle, cursor: 'pointer' }}>
                      <option value="">Sem profissional definido</option>
                      {profissionais.map((p) => (
                        <option key={p.id} value={p.id}>{`${p.nome} ${p.sobrenome}`.trim()}</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#16232B', display: 'block', marginBottom: 5 }}>
                      Duração
                    </label>
                    <select value={consulta.duracao} onChange={(e) => setC('duracao', e.target.value)}
                      style={{ ...inputStyle, cursor: 'pointer' }}>
                      {DURACOES.map((d) => (
                        <option key={d} value={d}>{d} min</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* A tela dizendo o que vai fazer, e a frase muda no instante em
                    que a data cruza o presente. Sem isto, "passado vira Paciente
                    e futuro não" seria uma regra que só se descobre depois. */}
                <div style={{ fontSize: 11.5, color: '#6B818C', lineHeight: 1.5 }}>
                  {jaAconteceu
                    ? <>Está no passado: entra no histórico como <strong>realizada</strong>, e a pessoa vira <strong>Paciente</strong>.</>
                    : <>Está no futuro: entra na agenda como <strong>marcada</strong>, e a pessoa fica em Contatos com a etiqueta "Consulta Agendada".</>}
                </div>

                {foraDaJornada && (
                  <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '9px 12px', fontSize: 11.5, color: '#DC2626', lineHeight: 1.5 }}>
                    {foraDaJornada} Escolha outro horário, outro profissional, ou ajuste a jornada em <strong>Profissionais</strong>.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Data de nascimento */}
          <div>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: '#16232B', display: 'block', marginBottom: 6 }}>
              Data de Nascimento <span style={{ color: '#6B818C', fontWeight: 400 }}>(opcional)</span>
            </label>
            <input type="date" value={form.data_nascimento} onChange={(e) => set('data_nascimento', e.target.value)} style={inputStyle}
              onFocus={(e) => (e.target.style.borderColor = '#1E6E8C')} onBlur={(e) => (e.target.style.borderColor = '#DCE6EA')} />
          </div>

          {/* Anotações */}
          <div>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: '#16232B', display: 'block', marginBottom: 6 }}>
              Anotações <span style={{ color: '#6B818C', fontWeight: 400 }}>(opcional)</span>
            </label>
            <textarea value={form.anotacoes} onChange={(e) => set('anotacoes', e.target.value)} rows={3} placeholder="Observações iniciais sobre o contato..." style={{ ...inputStyle, resize: 'vertical' }}
              onFocus={(e) => (e.target.style.borderColor = '#1E6E8C')} onBlur={(e) => (e.target.style.borderColor = '#DCE6EA')} />
          </div>
        </div>

        {error && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '9px 12px', fontSize: 13, color: '#DC2626', marginTop: 12 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '10px', borderRadius: 9, border: '1px solid #DCE6EA', background: '#fff', cursor: 'pointer', fontSize: 13.5, fontWeight: 600, color: '#6B818C', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
            Cancelar
          </button>
          <button onClick={handleSave} disabled={saving || !!duplicado || !!foraDaJornada}
            style={{ flex: 2, padding: '10px', borderRadius: 9, border: 'none', background: (duplicado || foraDaJornada) ? '#DCE6EA' : saving ? '#4C90A8' : '#1E6E8C', cursor: (saving || duplicado || foraDaJornada) ? 'not-allowed' : 'pointer', fontSize: 13.5, fontWeight: 600, color: (duplicado || foraDaJornada) ? '#6B818C' : '#fff', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
            {/* O botão diz o que vai SAIR, não o que a página se chama: quem
                abriu "Novo Paciente" e não deu data leva um Contato, e precisa
                saber disso antes de clicar. */}
            {saving ? 'Cadastrando...' : jaAconteceu ? 'Cadastrar como Paciente' : 'Cadastrar como Contato'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ──────────────────────────────────────────────
   Página
────────────────────────────────────────────── */
export default function PessoasPage({ mode }: { mode: PessoasMode }) {
  const cfg = CONFIG[mode]
  const Icone = cfg.icone
  const navigate = useNavigate()

  const [allLeads, setAllLeads] = useState<LeadClinica[]>([])
  const [loading, setLoading] = useState(true)

  /* O FILTRO POR ETAPA VEM DA URL, e não de um estado solto.

     Quem chega aqui pelo "+ N outros" de uma coluna do CRM chega com
     `?etapa=follow_up_2_feito&periodo=all`. Guardar isso na URL é o que faz o
     link funcionar, o F5 preservar o recorte, e o "voltar" do navegador
     desfazer o filtro sem precisar de um botão para isso.

     ⚠️ O PERÍODO TAMBÉM VEM DE LÁ. Sem isso o CRM prometeria "+312 outros" e
     esta tela abriria no padrão dela ("Este mês"), mostrando 40 — o número da
     tela anterior viraria mentira no clique. */
  const [params, setParams] = useSearchParams()
  const etapa = params.get('etapa') as LeadStatus | null

  const [period, setPeriod] = useState<PeriodKey>(
    () => (params.get('periodo') as PeriodKey | null) ?? 'this_month',
  )
  const [customRange, setCustomRange] = useState<DateRange>(() => {
    const de = params.get('de')
    const ate = params.get('ate')
    return de && ate
      ? { start: new Date(de), end: new Date(ate) }
      : { start: new Date(), end: new Date() }
  })
  const [search, setSearch] = useState('')
  const [showNewLead, setShowNewLead] = useState(false)

  /* Limpar a etapa tira só ela da URL — o período escolhido continua valendo,
     que é o que a pessoa esperaria de um "✕" na etiqueta da etapa. */
  const limparEtapa = () => {
    const novo = new URLSearchParams(params)
    novo.delete('etapa')
    setParams(novo, { replace: true })
  }

  /* A etapa pedida pertence a esta página? "Consulta Realizada" e "Paciente
     Recorrente" moram em Pacientes; o resto, em Contatos. O CRM já manda para
     o lugar certo — isto cobre a URL digitada à mão, que sem aviso daria uma
     lista vazia sem explicação. */
  const etapaEhDaqui = etapa === null
    || (mode === 'clientes' ? isPaciente(etapa) : !isPaciente(etapa))

  // Extraído para poder ser chamado de novo depois de uma baixa de consulta:
  // confirmar que a pessoa compareceu MUDA ELA DE TELA (vira Paciente), e a
  // lista precisa refletir isso na hora.
  const recarregarPessoas = useCallback(() =>
    supabase.from('crm_clinica').select('*').order('created_at', { ascending: false })
      .then(({ data }) => { setAllLeads(data ?? []); setLoading(false) }),
  [])

  useEffect(() => { recarregarPessoas() }, [recarregarPessoas])

  const handleNewLeadSaved = (lead: LeadClinica) => {
    setAllLeads((prev) => [lead, ...prev])
    // Cadastrou alguém que pertence à outra página? Leva o usuário até lá,
    // senão o registro "some" logo após ser criado.
    const pertenceAqui = mode === 'clientes' ? isPaciente(lead.status) : !isPaciente(lead.status)
    if (!pertenceAqui) navigate(cfg.outraPagina.rota)
  }

  const range = getPeriodRange(period, customRange)

  const periodFiltered = allLeads.filter((l) => inRange(l.created_at, range))

  const searched = periodFiltered.filter((l) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    // O telefone é comparado só por dígitos: quem busca digita "(11) 98765" ou
    // "11987654321", e o banco guarda "5511987654321". Comparar o texto cru
    // faria a busca por telefone nunca achar nada.
    const digitos = apenasDigitos(search)
    return (
      (l.nome_lead ?? '').toLowerCase().includes(q) ||
      (digitos.length > 0 && (l.whatsapp_lead ?? '').includes(digitos))
    )
  })

  const displayed = searched
    .filter((l) => (mode === 'clientes' ? isPaciente(l.status) : !isPaciente(l.status)))
    .filter((l) => (etapa ? l.status === etapa : true))

  /* ── Export CSV ── */
  const exportCSV = () => {
    const rows = [
      ['Nome', 'Telefone', 'Procedimento', 'Status', 'Início Atendimento', cfg.colunaData.titulo],
      ...displayed.map((l) => [
        l.nome_lead ?? '',
        formatarParaExibicao(l.whatsapp_lead),
        l.procedimento_interesse ?? '',
        STATUS_LABELS[l.status],
        fmtDate(l.inicio_atendimento),
        fmtDate(l[cfg.colunaData.campo]),
      ]),
    ]
    const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url
    a.download = `${cfg.arquivo}_${new Date().toISOString().split('T')[0]}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  /* ── Export PDF ── */
  const exportPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape' })
    doc.setFont('helvetica')
    doc.setFontSize(14)
    doc.text(cfg.titulo, 14, 16)
    doc.setFontSize(10)
    doc.setTextColor(120)
    doc.text(`Exportado em ${new Date().toLocaleString('pt-BR')}`, 14, 22)
    autoTable(doc, {
      startY: 28,
      head: [['Nome', 'Telefone', 'Procedimento', 'Status', 'Início Atendimento', cfg.colunaData.titulo]],
      body: displayed.map((l) => [
        l.nome_lead ?? '—',
        formatarParaExibicao(l.whatsapp_lead) || '—',
        l.procedimento_interesse ?? '—',
        STATUS_LABELS[l.status],
        fmtDate(l.inicio_atendimento),
        fmtDate(l[cfg.colunaData.campo]),
      ]),
      // #1E6E8C e #F7FAFB — a paleta azul, em RGB
      headStyles: { fillColor: [30, 110, 140], fontSize: 9, fontStyle: 'bold' },
      bodyStyles: { fontSize: 8.5 },
      alternateRowStyles: { fillColor: [247, 250, 251] },
      styles: { font: 'helvetica', cellPadding: 4 },
    })
    doc.save(`${cfg.arquivo}_${new Date().toISOString().split('T')[0]}.pdf`)
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
    <div style={{ padding: '32px 36px' }}>

      {/* Header */}
      <div className="fade-in-1" style={{ marginBottom: 22, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ maxWidth: 660 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: `${cfg.corIcone}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icone size={18} color={cfg.corIcone} strokeWidth={2} />
            </div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#16232B', margin: 0 }}>{cfg.titulo}</h1>
            <span style={{ background: '#EAF3F6', color: '#1E6E8C', borderRadius: 20, fontSize: 12.5, fontWeight: 700, padding: '2px 10px' }}>
              {displayed.length}
            </span>
          </div>

          {/* Mesmo tamanho da copy do Dashboard */}
          <p style={{ fontSize: 16.5, fontWeight: 500, color: '#3A5560', marginTop: 10, marginBottom: 0, lineHeight: 1.45 }}>
            {cfg.subtitulo}
          </p>

          <p style={{ fontSize: 13, color: '#6B818C', marginTop: 8, marginBottom: 0, lineHeight: 1.6 }}>
            {cfg.explicacao}
          </p>

          <button
            onClick={() => navigate(cfg.outraPagina.rota)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 12, padding: '6px 12px', borderRadius: 8, border: '1px solid #DCE6EA', background: '#fff', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: '#1E6E8C', fontFamily: "'Plus Jakarta Sans', sans-serif", transition: 'background 0.15s' }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = '#EAF3F6')}
            onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = '#fff')}
          >
            {cfg.outraPagina.label} <ArrowRight size={13} />
          </button>
        </div>

        <button
          onClick={() => setShowNewLead(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px', borderRadius: 10, border: 'none', background: '#1E6E8C', cursor: 'pointer', fontSize: 13.5, fontWeight: 600, color: '#fff', fontFamily: "'Plus Jakarta Sans', sans-serif", flexShrink: 0, transition: 'background 0.15s' }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = '#17576F')}
          onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = '#1E6E8C')}
        >
          <UserPlus size={16} /> {cfg.botaoNovo}
        </button>
      </div>

      {/* Consultas que já aconteceram e ninguém confirmou. Some sozinho
          quando não há nenhuma. */}
      <div className="fade-in-2">
        <AvisoBaixaConsulta onBaixa={recarregarPessoas} />
      </div>

      {/* Period filter */}
      <div className="fade-in-2" style={{ marginBottom: 20, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
        <FiltroPeriodo
          periodo={period}
          onPeriodo={setPeriod}
          faixa={customRange}
          onFaixa={setCustomRange}
        />

        {/* A ETAPA APARECE COMO ETIQUETA, e não como mais uma lista suspensa.

            Ela não é um filtro que se escolhe aqui: é um recorte que veio de
            outra tela. Etiqueta com "✕" diz as duas coisas de uma vez — o que
            está valendo, e como sair. Uma lista com "Todas as etapas" ocuparia
            espaço permanente por algo que quase nunca é escolhido daqui. */}
        {etapa && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: '#EAF3F6', border: '1px solid #C6D6DC', borderRadius: 10,
            padding: '7px 10px 7px 12px', fontSize: 13, fontWeight: 600, color: '#1E6E8C',
          }}>
            <Filter size={13} />
            {STATUS_LABELS[etapa] ?? etapa}
            <button
              onClick={limparEtapa}
              title="Tirar o filtro de etapa"
              style={{
                display: 'flex', alignItems: 'center', background: 'none', border: 'none',
                padding: 2, borderRadius: 5, cursor: 'pointer', color: '#1E6E8C',
              }}
            >
              <X size={13} />
            </button>
          </div>
        )}
      </div>

      {/* Etapa que não é desta página: acontece com URL digitada à mão. Sem
          esta linha o resultado seria uma lista vazia sem motivo aparente. */}
      {!etapaEhDaqui && etapa && (
        <div className="fade-in-2" style={{
          marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
          background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10,
          padding: '10px 13px', fontSize: 12.5, color: '#B45309',
        }}>
          <span>
            <strong>{STATUS_LABELS[etapa] ?? etapa}</strong> não aparece nesta página.
          </span>
          <button
            onClick={() => navigate(`${cfg.outraPagina.rota}?${new URLSearchParams({ etapa, periodo: period })}`)}
            style={{
              background: 'none', border: 'none', padding: 0, cursor: 'pointer',
              fontSize: 12.5, fontWeight: 700, color: '#1E6E8C',
              fontFamily: "'Plus Jakarta Sans', sans-serif",
            }}
          >
            Ver em {cfg.outraPagina.label.replace('Ver ', '')} →
          </button>
        </div>
      )}

      {/* Search + Export */}
      <div className="fade-in-3" style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 240, position: 'relative' }}>
          <Search size={15} color="#6B818C" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
          <input
            type="text"
            placeholder="Buscar por nome ou telefone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: '100%', padding: '9px 12px 9px 36px', borderRadius: 10, border: '1px solid #DCE6EA', fontSize: 13.5, fontFamily: "'Plus Jakarta Sans', sans-serif", color: '#16232B', background: '#fff', outline: 'none', transition: 'border-color 0.15s' }}
            onFocus={(e) => (e.target.style.borderColor = '#1E6E8C')}
            onBlur={(e) => (e.target.style.borderColor = '#DCE6EA')}
          />
        </div>
        <button onClick={exportCSV} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 16px', borderRadius: 10, border: '1px solid #DCE6EA', background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#16232B', fontFamily: "'Plus Jakarta Sans', sans-serif", transition: 'background 0.15s' }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = '#F2F6F7')}
          onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = '#fff')}>
          <Download size={15} /> Exportar CSV
        </button>
        <button onClick={exportPDF} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 16px', borderRadius: 10, border: '1px solid #DCE6EA', background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#16232B', fontFamily: "'Plus Jakarta Sans', sans-serif", transition: 'background 0.15s' }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = '#F2F6F7')}
          onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = '#fff')}>
          <FileText size={15} /> Exportar PDF
        </button>
      </div>

      {/* Table */}
      <div className="fade-in-4" style={{ background: '#fff', borderRadius: 14, border: '1px solid #DCE6EA', overflow: 'hidden', marginBottom: 32 }}>
        {displayed.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#6B818C', fontSize: 14 }}>
            {search ? 'Nenhum resultado para a busca.' : cfg.vazio}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #DCE6EA', background: '#F7FAFB' }}>
                  {['Nome / Telefone', 'Procedimento', 'Status', 'Início Atendimento', cfg.colunaData.titulo, ''].map((h, i) => (
                    <th key={i} style={{ textAlign: 'left', padding: '11px 16px', fontSize: 12, fontWeight: 600, color: '#6B818C', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayed.map((lead, idx) => (
                  <tr key={lead.id}
                    style={{ borderBottom: '1px solid #EDF2F4', background: idx % 2 === 0 ? '#fff' : '#F7FAFB', transition: 'background 0.12s' }}
                    onMouseEnter={(e) => ((e.currentTarget as HTMLTableRowElement).style.background = '#EAF3F6')}
                    onMouseLeave={(e) => ((e.currentTarget as HTMLTableRowElement).style.background = idx % 2 === 0 ? '#fff' : '#F7FAFB')}>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontWeight: 600, color: '#16232B' }}>{lead.nome_lead ?? '—'}</div>
                      <div style={{ fontSize: 12, color: '#6B818C', marginTop: 2 }}>{formatarParaExibicao(lead.whatsapp_lead)}</div>
                    </td>
                    <td style={{ padding: '12px 16px', color: '#6B818C' }}>{lead.procedimento_interesse ?? '—'}</td>
                    <td style={{ padding: '12px 16px' }}><StatusBadge status={lead.status} /></td>
                    <td style={{ padding: '12px 16px', color: '#6B818C', whiteSpace: 'nowrap' }}>{fmtDate(lead.inicio_atendimento)}</td>
                    <td style={{ padding: '12px 16px', color: '#6B818C', whiteSpace: 'nowrap' }}>
                      {lead[cfg.colunaData.campo]
                        ? fmtDate(lead[cfg.colunaData.campo])
                        : <span style={{ color: '#B9C8CE' }}>{cfg.colunaData.vazio}</span>}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <button onClick={() => navigate(`/leads/${lead.id}`)}
                        style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #DCE6EA', background: '#fff', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: '#1E6E8C', fontFamily: "'Plus Jakarta Sans', sans-serif", transition: 'background 0.15s, border-color 0.15s', whiteSpace: 'nowrap' }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#EAF3F6'; (e.currentTarget as HTMLButtonElement).style.borderColor = '#4C90A8' }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#fff'; (e.currentTarget as HTMLButtonElement).style.borderColor = '#DCE6EA' }}>
                        Detalhes
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showNewLead && (
        <NewLeadModal
          titulo={cfg.botaoNovo}
          onClose={() => setShowNewLead(false)}
          onSaved={handleNewLeadSaved}
        />
      )}

      <style>{`
        @keyframes pulse-dot { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.4; transform: scale(1.4); } }
      `}</style>
    </div>
  )
}
