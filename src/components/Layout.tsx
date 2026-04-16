import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'

export default function Layout() {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#F4F2EF' }}>
      <Sidebar />
      <main style={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>
        <Outlet />
      </main>
    </div>
  )
}
