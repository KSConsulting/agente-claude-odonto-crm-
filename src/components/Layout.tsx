import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'

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
 */
export default function Layout() {
  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#F2F6F7' }}>
      <Sidebar />
      <main style={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>
        <Outlet />
      </main>
    </div>
  )
}
