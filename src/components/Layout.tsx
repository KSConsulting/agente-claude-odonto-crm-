import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import AvisoWhatsAppCaiu from './AvisoWhatsAppCaiu'
import { supabase } from '../lib/supabase'
import { definirNomeDoAgente } from '../lib/agente'

/**
 * A casca do sistema: barra lateral fixa + conteúdo que rola.
 *
 * ⚠️ `height: 100vh` COM `overflow: hidden`, e não `minHeight`. A diferença
 * não é sutil:
 *
 * Com `minHeight`, o container cresce junto com a página, a barra lateral
 * estica junto (ela é um item flex, e `stretch` é o padrão) e o rodapé dela —
 * o nome do usuário e o menu — vai parar no fim do DOCUMENTO. Em telas altas
 * como Dashboard, Agenda e Configurações, ele simplesmente sumia abaixo da
 * dobra, e só reaparecia rolando a página até o fim.
 *
 * Fixando a altura, quem rola é o `<main>`. A barra fica onde tem que ficar:
 * do topo ao pé da janela, sempre.
 *
 * ── E É AQUI QUE O NOME DO AGENTE ENTRA ────────────────────────────────────
 *
 * Uma consulta, uma vez por sessão, no único componente por onde toda tela
 * autenticada passa. Alternativa seria cada tela buscar o seu — treze
 * consultas para o mesmo dado, e treze chances de uma delas esquecer.
 *
 * Enquanto ela não volta, vale o `NOME_PADRAO` — a interface nunca fica com
 * frases sem sujeito. Se falhar, o padrão continua valendo: o nome errado é
 * pior que nome nenhum, mas frase quebrada é pior que os dois.
 *
 * ── E O AVISO DE QUEDA DO WHATSAPP TAMBÉM ──────────────────────────────────
 *
 * Pelo mesmo motivo: é o único componente por onde toda tela autenticada passa.
 * A faixa morava dentro de Conversas, apostando que a recepção passa o dia ali
 * — quem estivesse na Agenda ou no CRM não via nada. Aqui, ela alcança quem
 * quer que esteja logado. Ela some sozinha quando está tudo bem, e só aparece
 * depois de um minuto de queda contínua.
 */
export default function Layout() {
  useEffect(() => {
    let vivo = true
    supabase
      .from('configuracoes_agente')
      .select('nome_agente')
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (vivo && data?.nome_agente) definirNomeDoAgente(data.nome_agente)
      })
    return () => { vivo = false }
  }, [])

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: '100vh', overflow: 'hidden', background: '#F2F6F7',
    }}>
      <AvisoWhatsAppCaiu />

      {/* ⚠️ `minHeight: 0` é o que faz o `<main>` rolar por dentro em vez de
          esticar a linha. Sem ele, a faixa empurraria a barra lateral e o
          conteúdo para fora da janela — o mesmo defeito que o `height: 100vh`
          acima existe para evitar. */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <Sidebar />
        <main style={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
