import { gradeDoMes, inicioDaConsulta, mesmoDia, NOMES_DIAS_CURTOS } from '../lib/agenda'
import { COR_SEM_PROFISSIONAL, fundoSuave } from '../lib/cores'
import type { ConsultaAgenda, Profissional } from '../types'

/* ──────────────────────────────────────────────
   Visão mensal — grade de semanas inteiras.

   Aqui não cabe horário desenhado em escala: cada dia vira uma pilha de
   pílulas coloridas pela agenda de origem. Serve para enxergar carga e vazios
   do mês; o detalhe fica na visão semanal.
────────────────────────────────────────────── */

/** Quantas consultas cabem num dia antes do "+N". */
const MAXIMO_POR_DIA = 3

interface Props {
  referencia: Date
  consultas: ConsultaAgenda[]
  profissionaisPorId: Map<string, Profissional>
  onClickConsulta: (c: ConsultaAgenda) => void
  onClickDia: (dia: Date) => void
}

export default function AgendaMes({ referencia, consultas, profissionaisPorId, onClickConsulta, onClickDia }: Props) {
  const dias = gradeDoMes(referencia)
  const hoje = new Date()
  const semanas = Math.ceil(dias.length / 7)

  return (
    <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #DCE6EA', overflow: 'hidden' }}>

      {/* Cabeçalho */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid #DCE6EA' }}>
        {NOMES_DIAS_CURTOS.map((nome) => (
          <div key={nome} style={{ padding: '10px 8px', textAlign: 'center', fontSize: 11.5, fontWeight: 600, color: '#6B818C', textTransform: 'uppercase', letterSpacing: 0.3 }}>
            {nome}
          </div>
        ))}
      </div>

      {/* Grade */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gridTemplateRows: `repeat(${semanas}, minmax(104px, auto))` }}>
        {dias.map((dia, idx) => {
          const doMes = dia.getMonth() === referencia.getMonth()
          const ehHoje = mesmoDia(dia, hoje)
          const doDia = consultas
            .filter((c) => mesmoDia(inicioDaConsulta(c), dia))
            .sort((a, b) => inicioDaConsulta(a).getTime() - inicioDaConsulta(b).getTime())
          const visiveis = doDia.slice(0, MAXIMO_POR_DIA)
          const restantes = doDia.length - visiveis.length

          return (
            <div key={dia.toISOString()}
              onClick={(e) => { if (e.target === e.currentTarget) onClickDia(dia) }}
              style={{
                borderRight: (idx + 1) % 7 === 0 ? 'none' : '1px solid #EDF2F4',
                borderBottom: idx < dias.length - 7 ? '1px solid #EDF2F4' : 'none',
                padding: '7px 8px 8px',
                background: doMes ? '#fff' : '#F7FAFB',
                cursor: 'pointer',
                minWidth: 0,
              }}>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 5, pointerEvents: 'none' }}>
                <span style={{
                  fontSize: 12.5, fontWeight: ehHoje ? 700 : 600,
                  color: ehHoje ? '#fff' : doMes ? '#16232B' : '#B9C8CE',
                  background: ehHoje ? '#1E6E8C' : 'transparent',
                  minWidth: 22, height: 22, lineHeight: '22px', textAlign: 'center', borderRadius: '50%',
                }}>
                  {dia.getDate()}
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {visiveis.map((c) => {
                  const prof = c.profissional_id ? profissionaisPorId.get(c.profissional_id) : undefined
                  const cor = prof?.cor ?? COR_SEM_PROFISSIONAL.hex
                  const cancelada = c.status === 'cancelada'
                  return (
                    <button key={c.id}
                      onClick={(e) => { e.stopPropagation(); onClickConsulta(c) }}
                      title={`${c.lead?.nome_lead ?? 'Sem nome'} · ${c.procedimento}`}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 5, width: '100%',
                        background: cancelada ? 'transparent' : fundoSuave(cor),
                        border: 'none', borderRadius: 5, padding: '3px 6px', cursor: 'pointer',
                        fontFamily: "'Plus Jakarta Sans', sans-serif", textAlign: 'left',
                        opacity: cancelada ? 0.55 : 1, minWidth: 0,
                      }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: cor, flexShrink: 0 }} />
                      <span style={{
                        fontSize: 11, fontWeight: 600, color: '#16232B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        textDecoration: cancelada ? 'line-through' : 'none',
                      }}>
                        {inicioDaConsulta(c).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}{' '}
                        {c.lead?.nome_lead ?? 'Sem nome'}
                      </span>
                    </button>
                  )
                })}

                {restantes > 0 && (
                  <button onClick={(e) => { e.stopPropagation(); onClickDia(dia) }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 10.5, fontWeight: 600, color: '#6B818C', textAlign: 'left', padding: '1px 6px', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                    +{restantes} mais
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
