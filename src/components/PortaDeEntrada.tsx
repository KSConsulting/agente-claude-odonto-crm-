import { DoorOpen, Clock, Pencil, TriangleAlert, Tag } from 'lucide-react'
import { formatarReais } from '../lib/procedimentos'
import { AGENTE_NOME } from '../lib/agente'
import type { ServicoClinica } from '../types'

/**
 * A porta de entrada da clínica — a Avaliação Odontológica.
 *
 * ── POR QUE ELA NÃO É UM DOS CARDS ─────────────────────────────────────────
 *
 * Ela não é um tratamento: é por onde os tratamentos começam. No meio da grade
 * ela vira o vigésimo card igual aos outros, quando é a consulta que mais vai
 * acontecer na clínica — e a única que a Letícia marca sozinha.
 *
 * Fica em cima, com contorno próprio, e os tratamentos ficam embaixo.
 *
 * ── E POR QUE ELA EXISTE COMO REGISTRO ─────────────────────────────────────
 *
 * Seria mais fácil o agente ter o nome dela escrito no código. Mas aí a duração
 * do bloco, a gratuidade e o próprio nome ficariam presos num deploy. Aqui a
 * clínica muda os três quando quiser, e a mudança chega na conversa seguinte.
 *
 * ── SÓ MOSTRA; QUEM EDITA É O MODAL ────────────────────────────────────────
 *
 * Nome, textos, duração e valor se mudam em **Editar**, no mesmo modal dos
 * outros procedimentos. Ter campo editável aqui e no modal seria a mesma coisa
 * em dois lugares, e um dia os dois discordariam.
 */

const FONTE = "'Plus Jakarta Sans', sans-serif"

interface Props {
  porta: ServicoClinica | null
  onEditar: (p: ServicoClinica) => void
}

export default function PortaDeEntrada({ porta, onEditar }: Props) {
  if (!porta) {
    return (
      <div className="fade-in-2" style={{
        background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 13,
        padding: '16px 18px', marginBottom: 18, fontFamily: FONTE,
        display: 'flex', alignItems: 'flex-start', gap: 10,
      }}>
        <TriangleAlert size={16} color="#DC2626" style={{ flexShrink: 0, marginTop: 2 }} />
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: '#B91C1C' }}>
            Nenhum procedimento está marcado como a avaliação
          </div>
          <div style={{ fontSize: 12.5, color: '#B91C1C', lineHeight: 1.6, marginTop: 4 }}>
            Sem porta de entrada, a {AGENTE_NOME} marca qualquer tratamento direto —
            inclusive os que precisam do dentista olhar antes.
          </div>
        </div>
      </div>
    )
  }

  const gratuita = porta.preco_a_partir_de === 0

  return (
    <div className="fade-in-2" style={{
      background: '#fff', border: '1px solid #DCE6EA', borderRadius: 13,
      borderLeft: '3px solid #1E6E8C',
      padding: '16px 18px', marginBottom: 18, fontFamily: FONTE,
    }}>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
        <DoorOpen size={15} color="#1E6E8C" />
        <span style={{ fontSize: 11.5, fontWeight: 700, color: '#1E6E8C', letterSpacing: 0.3, textTransform: 'uppercase' }}>
          A porta de entrada
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#16232B' }}>{porta.nome}</div>
          <p style={{ fontSize: 12.5, color: '#6B818C', lineHeight: 1.6, margin: '5px 0 0' }}>
            {porta.descricao}
          </p>
          <div style={{ fontSize: 12, color: '#6B818C', lineHeight: 1.6, marginTop: 8 }}>
            É o que a {AGENTE_NOME} marca no lugar de todo procedimento com{' '}
            <strong style={{ color: '#16232B' }}>&ldquo;Passa pela avaliação&rdquo;</strong> ligado.
            O que a pessoa procura fica registrado junto, e aparece na Agenda.
          </div>
        </div>

        <button onClick={() => onEditar(porta)}
          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 11px', borderRadius: 8, border: '1px solid #DCE6EA', background: '#fff', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: '#16232B', fontFamily: FONTE, flexShrink: 0 }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#F7FAFB' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = '#fff' }}>
          <Pencil size={13} color="#6B818C" /> Editar
        </button>
      </div>

      {/* Os dois dados que a Letícia usa. Mudam em Editar. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap', marginTop: 13, paddingTop: 12, borderTop: '1px solid #EDF2F4' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: '#6B818C' }}>
          <Clock size={13} /> {porta.duracao_minutos} minutos
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, color: gratuita ? '#1A7A48' : '#6B818C' }}>
          <Tag size={13} />
          {gratuita
            ? 'Gratuita'
            : porta.preco_a_partir_de
              ? `A partir de ${formatarReais(porta.preco_a_partir_de)}`
              : 'Sem valor cadastrado'}
        </span>
      </div>

      {gratuita && (
        <div style={{ fontSize: 12, color: '#1A7A48', background: '#E8F8EF', border: '1px solid #B7E7CB', borderRadius: 8, padding: '8px 11px', marginTop: 11, lineHeight: 1.6 }}>
          Gratuita não é só um preço zerado: é a frase que a {AGENTE_NOME} usa quando
          alguém trava no valor. Sem ela, a resposta vira &ldquo;o valor a gente vê na
          avaliação&rdquo;, que soa como desconversa.
        </div>
      )}
    </div>
  )
}
