import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import ListaConversas from '../components/ListaConversas'
import JanelaConversa from '../components/JanelaConversa'
import PainelLead from '../components/PainelLead'
import {
  listarConversas, carregarMensagens, enviarMensagem,
  assumirConversa, devolverConversa, marcarComoLidas,
} from '../lib/conversas'
import type { ConversaResumo, MensagemWhatsapp } from '../types'

/**
 * A tela Conversas — o WhatsApp da clínica dentro do sistema.
 *
 * ⚠️ REALTIME ASSINA A TABELA, NUNCA A VIEW. A lista vem de `conversas_lista`,
 * mas a assinatura é em `mensagens_whatsapp` e `crm_clinica_dados`: o Postgres
 * só replica tabela. Assinar a view não dá erro — simplesmente nunca dispara.
 *
 * Chega evento, a lista é RELIDA em vez de remendada com o payload. O payload
 * traz a linha da tabela; a lista precisa da última mensagem, do contador de
 * não lidas e do nome de quem assumiu, que são calculados na view.
 */
export default function Conversas() {
  const [params, setParams] = useSearchParams()

  const [conversas, setConversas] = useState<ConversaResumo[]>([])
  const [selecionada, setSelecionada] = useState<string | null>(params.get('lead'))
  const [mensagens, setMensagens] = useState<MensagemWhatsapp[]>([])

  const [carregandoLista, setCarregandoLista] = useState(true)
  const [carregandoConversa, setCarregandoConversa] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [usuarioId, setUsuarioId] = useState<string | null>(null)

  // Aberto ou fechado é preferência de quem usa, e sobrevive ao F5. Se falhar
  // (navegador anônimo, site data bloqueado), abre — que é o padrão útil.
  const [painelAberto, setPainelAberto] = useState(() => {
    try { return localStorage.getItem('conversas.painel') !== 'fechado' } catch { return true }
  })

  function alternarPainel() {
    setPainelAberto((antes) => {
      const agora = !antes
      try { localStorage.setItem('conversas.painel', agora ? 'aberto' : 'fechado') } catch { /* segue */ }
      return agora
    })
  }

  // O callback do Realtime é criado uma vez e enxergaria para sempre o valor
  // inicial de `selecionada`. O ref é o que o mantém em dia.
  const abertaRef = useRef<string | null>(selecionada)
  useEffect(() => { abertaRef.current = selecionada }, [selecionada])

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUsuarioId(data.user?.id ?? null))
  }, [])

  // Escritas em `.then()`, e não com `await`, porque estas duas rodam dentro de
  // efeito: o React avisa que `setState` no corpo do efeito encadeia render em
  // cima de render. Dentro do callback não encadeia — é o mesmo padrão do CRM.
  const recarregarLista = useCallback(() =>
    listarConversas()
      .then((c) => { setConversas(c); setCarregandoLista(false) })
      .catch(() => { setErro('Não consegui carregar as conversas.'); setCarregandoLista(false) }),
  [])

  const recarregarMensagens = useCallback((leadId: string) =>
    carregarMensagens(leadId)
      .then((m) => { setMensagens(m); setCarregandoConversa(false) })
      .catch(() => { setErro('Não consegui carregar esta conversa.'); setCarregandoConversa(false) }),
  [])

  useEffect(() => { recarregarLista() }, [recarregarLista])

  // Abrir uma conversa: carrega e zera as não lidas.
  useEffect(() => {
    if (!selecionada) return
    recarregarMensagens(selecionada)
    marcarComoLidas(selecionada).then(recarregarLista)
  }, [selecionada, recarregarMensagens, recarregarLista])

  // Realtime.
  useEffect(() => {
    const canal = supabase
      .channel('conversas')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'mensagens_whatsapp' },
        (payload) => {
          const linha = (payload.new ?? payload.old) as { lead_id?: string } | null
          recarregarLista()
          if (linha?.lead_id && linha.lead_id === abertaRef.current) {
            recarregarMensagens(linha.lead_id)
          }
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'crm_clinica_dados' },
        () => recarregarLista(),
      )
      .subscribe()

    return () => { supabase.removeChannel(canal) }
  }, [recarregarLista, recarregarMensagens])

  const aberta = conversas.find((c) => c.lead_id === selecionada) ?? null

  function selecionar(leadId: string) {
    if (leadId === selecionada) return
    // Limpar aqui, e não no efeito: trocar de conversa mostraria por um
    // instante as mensagens da anterior debaixo do nome da nova.
    setMensagens([])
    setCarregandoConversa(true)
    setErro('')
    setSelecionada(leadId)
    setParams({ lead: leadId }, { replace: true })
  }

  async function aoEnviar(texto: string) {
    if (!selecionada) return
    setEnviando(true)
    setErro('')
    try {
      await enviarMensagem(selecionada, texto)
      await recarregarMensagens(selecionada)
      await recarregarLista()
    } catch {
      setErro('A mensagem não saiu. Confira se a Evolution está conectada e tente de novo.')
    }
    setEnviando(false)
  }

  async function aoAssumir() {
    if (!selecionada || !usuarioId) return
    setErro('')
    try {
      await assumirConversa(selecionada, usuarioId)
      await recarregarLista()
    } catch {
      setErro('Não consegui assumir a conversa.')
    }
  }

  async function aoDevolver() {
    if (!selecionada) return
    setErro('')
    try {
      await devolverConversa(selecionada)
      await recarregarLista()
    } catch {
      setErro('Não consegui devolver a conversa.')
    }
  }

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#fff' }}>
      <ListaConversas
        conversas={conversas}
        selecionada={selecionada}
        onSelecionar={selecionar}
        carregando={carregandoLista}
      />
      <JanelaConversa
        conversa={aberta}
        mensagens={mensagens}
        carregando={carregandoConversa}
        enviando={enviando}
        erro={erro}
        onEnviar={aoEnviar}
        onAssumir={aoAssumir}
        onDevolver={aoDevolver}
        painelAberto={painelAberto}
        onAlternarPainel={alternarPainel}
      />
      {painelAberto && aberta && (
        // A `key` força a remontagem ao trocar de conversa: sem ela, o painel
        // reaproveitaria o estado anterior e mostraria a foto de quem já saiu.
        <PainelLead key={aberta.lead_id} leadId={aberta.lead_id} onFechar={alternarPainel} />
      )}
    </div>
  )
}
