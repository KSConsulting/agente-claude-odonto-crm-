import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import CRM from './pages/CRM'
import Conversas from './pages/Conversas'
import Agenda from './pages/Agenda'
import Profissionais from './pages/Profissionais'
import Leads from './pages/Leads'
import Clientes from './pages/Clientes'
import LeadDetail from './pages/LeadDetail'
import Configuracoes from './pages/Configuracoes'
import Procedimentos from './pages/Procedimentos'
import SecretariaIA from './pages/SecretariaIA'
import TokenApi from './pages/TokenApi'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route element={<ProtectedRoute />}>
          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/crm" element={<CRM />} />
            <Route path="/conversas" element={<Conversas />} />
            <Route path="/agenda" element={<Agenda />} />
            <Route path="/profissionais" element={<Profissionais />} />
            <Route path="/procedimentos" element={<Procedimentos />} />
            <Route path="/secretaria-ia" element={<SecretariaIA />} />
            <Route path="/token-api" element={<TokenApi />} />
            <Route path="/leads" element={<Leads />} />
            <Route path="/clientes" element={<Clientes />} />
            <Route path="/leads/:id" element={<LeadDetail />} />
            <Route path="/configuracoes" element={<Configuracoes />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
