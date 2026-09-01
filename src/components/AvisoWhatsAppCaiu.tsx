import { Link } from 'react-router-dom'
import { ServerCrash, PlugZap } from 'lucide-react'
import { useConexao, nomeDoProvedor } from '../lib/whatsappConexao'

/**
 * A faixa que avisa que o WhatsApp caiu — em Conversas, onde a recepção passa
 * o dia.
 *
 * ── POR QUE AQUI, E NÃO SÓ NA PÁGINA DA SECRETÁRIA ─────────────────────────
 *
 * Em 01/09 a ponte com o WhatsApp caiu e o único sintoma foi **silêncio**. Quem
 * teria percebido primeiro é quem fica olhando as conversas o dia inteiro — e
 * não quem abre a página da IA, que ninguém abre sem motivo.
 *
 * **Silenciosa quando está tudo bem.** Não renderiza nada com a conexão de pé,
 * nem enquanto verifica: faixa que vive na tela é faixa que ninguém lê no dia
 * em que ela importa. Mesmo princípio do `AvisoBaixaConsulta`.
 *
 * A cadência é a mesma da página da Secretária (`INTERVALO_PADRAO`). Já foi
 * diferente — 60s aqui, 30s lá —, e a diferença nunca teve razão de ser: as
 * duas fazem a mesma pergunta ao mesmo servidor.
 */

const FONTE = "'Plus Jakarta Sans', sans-serif"

export default function AvisoWhatsAppCaiu() {
  const { conexao } = useConexao()

  // `verificando` também não aparece: piscar "caiu" a cada carregamento de
  // página, antes da primeira resposta, seria alarme falso todo dia.
  const estado = conexao?.estado
  if (!estado || estado === 'conectado' || estado === 'verificando' || estado === 'conectando') {
    return null
  }

  const foraDoAr = estado === 'indisponivel'
  const provedor = nomeDoProvedor(conexao?.provedor ?? 'evolution')

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
      background: '#FEF2F2', borderBottom: '1px solid #FECACA',
      padding: '11px 16px', fontFamily: FONTE,
    }}>
      {foraDoAr
        ? <ServerCrash size={16} color="#DC2626" style={{ flexShrink: 0, marginTop: 1 }} />
        : <PlugZap size={16} color="#DC2626" style={{ flexShrink: 0, marginTop: 1 }} />}

      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#B91C1C' }}>
          O WhatsApp da clínica está desconectado
        </div>
        <div style={{ fontSize: 12, color: '#B91C1C', opacity: 0.9, lineHeight: 1.55, marginTop: 2 }}>
          {foraDoAr
            ? `O servidor da ${provedor} não está respondendo. Nenhuma mensagem entra nem sai enquanto isso.`
            : 'A sessão caiu. Nenhuma mensagem entra nem sai até religar.'}
          {' '}
          <Link to="/secretaria-ia" style={{ color: '#B91C1C', fontWeight: 700 }}>
            Ver a conexão
          </Link>
        </div>
      </div>
    </div>
  )
}
