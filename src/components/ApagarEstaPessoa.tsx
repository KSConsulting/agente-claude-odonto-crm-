import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Trash2, TriangleAlert } from 'lucide-react'
import ConfirmDeleteModal from './ConfirmDeleteModal'
import { apagarPessoa, preverExclusaoDe, resumoDoEstrago, type Previsao } from '../lib/apagarPessoa'
import { formatarParaExibicao } from '../lib/telefones'
import { isPaciente } from '../lib/pessoas'
import type { LeadClinica } from '../types'

/**
 * "Apagar esta pessoa" — a zona de perigo da ficha do lead.
 *
 * ── POR QUE EXISTE, SE JÁ HÁ UMA EM SECRETÁRIA DE IA ───────────────────────
 *
 * São dois gestos diferentes. Lá é uma **busca**: digite um número, descubra
 * quem é, apague — serve para o número errado que ninguém abriu. Aqui a pessoa
 * já está aberta na tela, e quem chegou até esta página é quem sabe que ela
 * precisa sair. Mandar essa pessoa copiar o telefone, abrir outra página e
 * colar seria um desvio que só existe porque o botão não estava aqui.
 *
 * A regra dos dois cartões é a mesma, e mora em
 * [`apagarPessoa.ts`](../lib/apagarPessoa.ts): a contagem antes, a Edge
 * Function apagando (mídia primeiro, ficha depois) e nenhuma lixeira.
 *
 * ── E POR QUE NO FIM DA PÁGINA ─────────────────────────────────────────────
 *
 * É a ação mais destrutiva que a ficha oferece. Ação destrutiva não fica no
 * caminho do olho de quem só veio conferir um telefone — a mesma razão do
 * interruptor da Letícia ter descido para o fim da página dela.
 */

const FONTE = "'Plus Jakarta Sans', sans-serif"

export default function ApagarEstaPessoa({ pessoa }: { pessoa: LeadClinica }) {
  const navigate = useNavigate()
  const [previsao, setPrevisao] = useState<Previsao | null>(null)
  const [confirmando, setConfirmando] = useState(false)
  const [apagando, setApagando] = useState(false)
  const [erro, setErro] = useState('')

  /* A contagem é buscada na montagem: ela é o texto do botão, não um detalhe
     do modal. Botão irreversível sem número vira clique automático. */
  useEffect(() => {
    let vivo = true
    preverExclusaoDe({
      id: pessoa.id,
      nome_lead: pessoa.nome_lead,
      whatsapp_lead: pessoa.whatsapp_lead,
      status: pessoa.status,
    })
      .then((p) => { if (vivo) setPrevisao(p) })
      .catch(() => { if (vivo) setPrevisao(null) })
    return () => { vivo = false }
  }, [pessoa.id, pessoa.nome_lead, pessoa.whatsapp_lead, pessoa.status])

  const nome = pessoa.nome_lead?.trim() || 'Sem nome'

  async function confirmar() {
    setApagando(true)
    setErro('')
    try {
      await apagarPessoa(pessoa.id)
      /* `replace` de propósito: sem ele, o botão "voltar" do navegador traz a
         pessoa de volta para a ficha de alguém que não existe mais. */
      navigate(isPaciente(pessoa.status) ? '/clientes' : '/leads', { replace: true })
    } catch (e) {
      setErro(e instanceof Error && e.message === 'falha_na_midia'
        ? 'Não consegui apagar os arquivos, então não apaguei nada. Tente de novo.'
        : 'Não consegui apagar. Tente de novo.')
      setApagando(false)
    }
  }

  return (
    <div style={{
      background: '#fff', border: '1px solid #FECACA', borderRadius: 14,
      padding: '20px 22px', marginBottom: 16, fontFamily: FONTE,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <TriangleAlert size={16} color="#DC2626" />
        <div style={{ fontSize: 15, fontWeight: 700, color: '#B91C1C' }}>Apagar esta pessoa</div>
      </div>

      <p style={{ fontSize: 12.5, color: '#6B818C', lineHeight: 1.6, margin: '6px 0 16px' }}>
        Apaga <strong style={{ color: '#3A5560' }}>tudo</strong> de {nome}: a ficha, a conversa
        inteira, as consultas — inclusive as já realizadas — e os arquivos que ela enviou.
        Não tem lixeira, e não pode ser desfeito.
      </p>

      <div style={{
        background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 11,
        padding: '13px 15px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: '#16232B' }}>{nome}</div>
          <div style={{ fontSize: 12, color: '#B91C1C', marginTop: 3 }}>
            {previsao ? resumoDoEstrago(previsao) : 'Contando o que será apagado...'}
          </div>
        </div>
        {/* Trancado enquanto a contagem não chega: o número é a parte que faz
            alguém parar a tempo, e sem ele o botão não deveria estar clicável. */}
        <button
          onClick={() => setConfirmando(true)}
          disabled={!previsao}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 13px', borderRadius: 9, border: 'none',
            background: previsao ? '#DC2626' : '#FCA5A5', color: '#fff',
            fontSize: 12.5, fontWeight: 700, fontFamily: FONTE,
            cursor: previsao ? 'pointer' : 'not-allowed',
          }}>
          <Trash2 size={13} /> Apagar tudo
        </button>
      </div>

      {erro && (
        <div style={{
          marginTop: 14, background: '#FEF2F2', border: '1px solid #FECACA',
          borderRadius: 9, padding: '10px 13px', fontSize: 12.5, color: '#DC2626',
        }}>{erro}</div>
      )}

      {confirmando && previsao && (
        <ConfirmDeleteModal
          itemName={nome}
          title="Apagar esta pessoa?"
          message={
            <>
              Tudo de <strong>{nome}</strong>
              {pessoa.whatsapp_lead && <> ({formatarParaExibicao(pessoa.whatsapp_lead)})</>} será
              destruído: <strong>{resumoDoEstrago(previsao)}</strong>, além dos arquivos que ela enviou.
              {previsao.realizadas > 0 && (
                <><br /><br />⚠️ Há <strong>consulta já realizada</strong> no histórico dela.
                Isso é registro de atendimento, e some junto.</>
              )}
              <br /><br />Não tem lixeira. Isso não pode ser desfeito.
            </>
          }
          confirmLabel="Apagar tudo"
          loadingLabel="Apagando..."
          loading={apagando}
          error={erro}
          onConfirm={confirmar}
          onClose={() => setConfirmando(false)}
        />
      )}
    </div>
  )
}
