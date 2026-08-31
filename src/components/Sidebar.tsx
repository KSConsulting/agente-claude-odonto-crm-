import { useState, useEffect } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  KanbanSquare,
  CalendarDays,
  BriefcaseMedical,
  Users,
  UserCheck,
  Settings,
  ChevronLeft,
  ChevronRight,
  Stethoscope,
  LogOut,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Usuario, ConfiguracoesClinica } from '../types'

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/crm', label: 'CRM', icon: KanbanSquare },
  { to: '/agenda', label: 'Agenda', icon: CalendarDays },
  { to: '/leads', label: 'Leads', icon: Users, end: true },
  { to: '/clientes', label: 'Clientes', icon: UserCheck },
  { to: '/profissionais', label: 'Profissionais', icon: BriefcaseMedical },
  { to: '/configuracoes', label: 'Configurações', icon: Settings },
]

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [clinica, setClinica] = useState<ConfiguracoesClinica | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    async function loadData() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const [{ data: usuarioData }, { data: clinicaData }] = await Promise.all([
        supabase.from('usuarios').select('*').eq('id', user.id).single(),
        supabase.from('configuracoes_clinica').select('*').limit(1).single(),
      ])

      if (usuarioData) setUsuario(usuarioData)
      if (clinicaData) setClinica(clinicaData)
    }
    loadData()

    // Recarrega os dados da clínica quando Configurações avisa que mudou
    // (nome ou logo — a consulta traz a linha inteira).
    const onClinicaAtualizada = () => {
      supabase.from('configuracoes_clinica').select('*').limit(1).single()
        .then(({ data }) => { if (data) setClinica(data) })
    }
    window.addEventListener('clinica-atualizada', onClinicaAtualizada)
    return () => window.removeEventListener('clinica-atualizada', onClinicaAtualizada)
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    navigate('/login')
  }

  const initials = usuario?.nome
    ? usuario.nome.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
    : '?'

  return (
    <aside
      style={{
        width: collapsed ? 64 : 220,
        transition: 'width 0.25s ease',
        minHeight: '100vh',
        background: '#fff',
        borderRight: '1px solid #DCE6EA',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        position: 'relative',
        zIndex: 10,
      }}
    >
      {/* Header: logo + collapse button */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          padding: collapsed ? '20px 0' : '20px 16px',
          borderBottom: '1px solid #DCE6EA',
          minHeight: 64,
        }}
      >
        {!collapsed && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, overflow: 'hidden' }}>
            {clinica?.logo_url ? (
              <img
                src={clinica.logo_url}
                alt="Logo"
                style={{ width: 32, height: 32, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }}
              />
            ) : (
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: '#EAF3F6',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Stethoscope size={18} color="#1E6E8C" />
              </div>
            )}
            <span
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: '#16232B',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {clinica?.nome_clinica ?? 'Clínica'}
            </span>
          </div>
        )}

        {collapsed && (
          clinica?.logo_url ? (
            <img
              src={clinica.logo_url}
              alt="Logo"
              style={{ width: 32, height: 32, borderRadius: 8, objectFit: 'cover' }}
            />
          ) : (
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: '#EAF3F6',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Stethoscope size={18} color="#1E6E8C" />
            </div>
          )
        )}

        <button
          onClick={() => setCollapsed((c) => !c)}
          style={{
            position: collapsed ? 'absolute' : 'static',
            right: collapsed ? -12 : 'auto',
            top: collapsed ? 24 : 'auto',
            width: 24,
            height: 24,
            borderRadius: '50%',
            background: '#fff',
            border: '1px solid #DCE6EA',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            flexShrink: 0,
            boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
          }}
        >
          {collapsed ? <ChevronRight size={13} color="#6B818C" /> : <ChevronLeft size={13} color="#6B818C" />}
        </button>
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: collapsed ? '10px 0' : '10px 12px',
              justifyContent: collapsed ? 'center' : 'flex-start',
              borderRadius: 10,
              textDecoration: 'none',
              background: isActive ? '#EAF3F6' : 'transparent',
              color: isActive ? '#1E6E8C' : '#6B818C',
              fontWeight: isActive ? 600 : 500,
              fontSize: 13.5,
              transition: 'background 0.15s ease, color 0.15s ease',
            })}
            title={collapsed ? label : undefined}
          >
            {({ isActive }) => (
              <>
                <Icon size={18} color={isActive ? '#1E6E8C' : '#6B818C'} strokeWidth={isActive ? 2.2 : 1.8} />
                {!collapsed && <span style={{ whiteSpace: 'nowrap' }}>{label}</span>}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Footer: user info + logout */}
      <div
        style={{
          borderTop: '1px solid #DCE6EA',
          padding: collapsed ? '12px 0' : '12px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          gap: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: '50%',
              background: '#EAF3F6',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 13,
              fontWeight: 700,
              color: '#1E6E8C',
              flexShrink: 0,
            }}
          >
            {initials}
          </div>
          {!collapsed && (
            <div style={{ overflow: 'hidden' }}>
              <div
                style={{
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: '#16232B',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {usuario?.nome ?? 'Usuário'}
              </div>
              <div style={{ fontSize: 11, color: '#6B818C' }}>Secretária</div>
            </div>
          )}
        </div>

        {!collapsed && (
          <button
            onClick={handleLogout}
            title="Sair"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 4,
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
              flexShrink: 0,
            }}
          >
            <LogOut size={16} color="#6B818C" />
          </button>
        )}
      </div>
    </aside>
  )
}
