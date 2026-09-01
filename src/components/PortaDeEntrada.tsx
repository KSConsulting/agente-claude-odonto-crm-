import { useState } from 'react'
import { DoorOpen, Clock, Pencil, TriangleAlert } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatarReais, lerPreco, precoParaCampo } from '../lib/procedimentos'
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
 * Fica em cima, com contorno próprio, e os vinte tratamentos ficam embaixo.
 *
 * ── E POR QUE ELA EXISTE COMO REGISTRO ─────────────────────────────────────
 *
 * Seria mais fácil o agente ter o nome dela escrito no código. Mas aí a duração
 * do bloco, a gratuidade e o próprio nome ficariam presos num deploy. Aqui a
 * clínica muda os três quando quiser, e a mudança chega na conversa seguinte.
 *
 * ── GRATUITA É DADO, NÃO ROTULO ────────────────────────────────────────────
 *
 * `preco_a_partir_de = 0` é o que faz a Letícia dizer "a avaliação é gratuita"
 * — a frase que derruba a objeção de quem não quer pagar só para saber o preço.
 * Campo vazio é outra coisa: ela não fala valor nenhum. Por isso os dois
 * estados aparecem escritos aqui, e não como um campo em branco ambíguo.
 */

const FONTE = "'Plus Jakarta Sans', sans-serif"

interface Props {
  porta: ServicoClinica | null
  onMudou: (novo: ServicoClinica) => void
  onEditar: (p: ServicoClinica) => void
}

export default function PortaDeEntrada({ porta, onMudou, onEditar }: Props) {
  const [preco, setPreco] = useState(precoParaCampo(porta?.preco_a_partir_de ?? null))
  const [duracao, setDuracao] = useState(String(porta?.duracao_minutos ?? 30))
  const [erro, setErro] = useState('')

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
            inclusive os que precisam do dentista olhar antes. Marque um procedimento
            como avaliação para restabelecer a regra.
          </div>
        </div>
      </div>
    )
  }

  async function salvar(campos: Partial<ServicoClinica>) {
    setErro('')
    const { data, error } = await supabase
      .from('servicos_clinica')
      .update(campos)
      .eq('id', porta!.id)
      .select()
      .single()
    if (error || !data) { setErro('Não consegui salvar. Tente de novo.'); return }
    onMudou(data as ServicoClinica)
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
          <Pencil size={13} color="#6B818C" /> Editar textos
        </button>
      </div>

      {/* Duração e valor: os dois dados que a Letícia usa */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 18, flexWrap: 'wrap', marginTop: 14, paddingTop: 13, borderTop: '1px solid #EDF2F4' }}>

        <div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 600, color: '#6B818C', marginBottom: 5 }}>
            <Clock size={12} /> Duração do bloco
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              value={duracao}
              onChange={(e) => setDuracao(e.target.value.replace(/\D/g, ''))}
              onBlur={() => {
                const n = Number(duracao)
                if (!n || n < 5) { setDuracao(String(porta.duracao_minutos)); return }
                if (n !== porta.duracao_minutos) salvar({ duracao_minutos: n })
              }}
              style={{ width: 62, padding: '7px 10px', borderRadius: 8, border: '1px solid #DCE6EA', fontSize: 13, fontFamily: FONTE, color: '#16232B', outline: 'none', textAlign: 'right' }}
              onFocus={(e) => (e.target.style.borderColor = '#1E6E8C')}
            />
            <span style={{ fontSize: 12.5, color: '#6B818C' }}>minutos</span>
          </div>
        </div>

        <div>
          <label style={{ fontSize: 11.5, fontWeight: 600, color: '#6B818C', marginBottom: 5, display: 'block' }}>
            Valor
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #DCE6EA', borderRadius: 8, paddingLeft: 9, background: '#fff' }}>
              <span style={{ fontSize: 12.5, color: '#9AAEB6' }}>R$</span>
              <input
                value={preco}
                onChange={(e) => setPreco(e.target.value)}
                onBlur={() => {
                  const v = lerPreco(preco)
                  setPreco(precoParaCampo(v))
                  if (v !== porta.preco_a_partir_de) salvar({ preco_a_partir_de: v })
                }}
                placeholder="vazio"
                style={{ width: 86, padding: '7px 9px', border: 'none', fontSize: 13, fontFamily: FONTE, color: '#16232B', outline: 'none', background: 'transparent' }}
              />
            </div>
            <span style={{ fontSize: 12, fontWeight: 600, color: gratuita ? '#1A7A48' : '#6B818C' }}>
              {gratuita
                ? 'Gratuita — ela diz isso'
                : porta.preco_a_partir_de
                  ? `Ela diz "a partir de ${formatarReais(porta.preco_a_partir_de)}"`
                  : 'Vazio — ela não fala valor'}
            </span>
          </div>
        </div>
      </div>

      {gratuita && (
        <div style={{ fontSize: 12, color: '#1A7A48', background: '#E8F8EF', border: '1px solid #B7E7CB', borderRadius: 8, padding: '8px 11px', marginTop: 11, lineHeight: 1.6 }}>
          Zero aqui não é campo em branco: é a frase que a {AGENTE_NOME} usa quando
          alguém trava no preço. Sem ela, a resposta vira &ldquo;o valor a gente vê na
          avaliação&rdquo;, que soa como desconversa.
        </div>
      )}

      {erro && (
        <div style={{ fontSize: 12.5, color: '#DC2626', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '8px 11px', marginTop: 11 }}>{erro}</div>
      )}
    </div>
  )
}
