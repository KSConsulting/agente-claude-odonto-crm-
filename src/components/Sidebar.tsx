import { useState, useEffect, useRef } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  KanbanSquare,
  MessagesSquare,
  ClipboardList,
  Bot,
  KeyRound,
  CalendarDays,
  BriefcaseMedical,
  Users,
  UserCheck,
  Settings,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Stethoscope,
  LogOut,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { AGENTE_PAGINA } from '../lib/agente'
import type { Usuario, ConfiguracoesClinica } from '../types'

/**
 * O que abre ao clicar no nome, no rodapé.
 *
 * Não é navegação da clínica — é **do sistema**: como a secretária de IA se
 * comporta, quem tem chave de acesso, e sair. Por isso não fica na barra junto
 * de Agenda e Pacientes, onde a recepção passa o dia.
 */
const MENU_USUARIO = [
  { to: '/secretaria-ia', label: AGENTE_PAGINA, icon: Bot },
  { to: '/token-api', label: 'Token e API', icon: KeyRound },
]

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/crm', label: 'CRM', icon: KanbanSquare },
  { to: '/conversas', label: 'Conversas', icon: MessagesSquare },
  { to: '/agenda', label: 'Agenda', icon: CalendarDays },
  { to: '/leads', label: 'Leads', icon: Users, end: true },
  { to: '/clientes', label: 'Clientes', icon: UserCheck },
  { to: '/profissionais', label: 'Profissionais', icon: BriefcaseMedical },
  { to: '/procedimentos', label: 'Procedimentos', icon: ClipboardList },
  { to: '/configuracoes', label: 'Configurações', icon: Settings },
]

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [clinica, setClinica] = useState<ConfiguracoesClinica | null>(null)
  const navigate = useNavigate()
  const { pathname } = useLocation()

  // O menu do rodapé. Fecha ao clicar fora, com Esc, e ao escolher um item —
  // não precisa de efeito escutando a rota: sair dele por qualquer caminho
  // passa por um `mousedown` fora, que já fecha.
  const [menuAberto, setMenuAberto] = useState(false)
  const rodape = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!menuAberto) return
    const fora = (e: MouseEvent) => {
      if (rodape.current && !rodape.current.contains(e.target as Node)) setMenuAberto(false)
    }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuAberto(false) }
    document.addEventListener('mousedown', fora)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', fora)
      document.removeEventListener('keydown', esc)
    }
  }, [menuAberto])

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

  // `.trim() ||` e não `??`: o cadastro nasce com `nome = ''`, e string vazia
  // passa direto pelo `??`. O resultado era um nome em branco e um "?" no
  // lugar da inicial, com cara de defeito.
  const nomeUsuario = usuario?.nome?.trim() || 'Sua conta'
  const initials = usuario?.nome?.trim()
    ? nomeUsuario.split(/\s+/).map((n) => n[0]).slice(0, 2).join('').toUpperCase()
    : '?'

  return (
    <aside
      style={{
        width: collapsed ? 64 : 220,
        transition: 'width 0.25s ease',
        // A altura vem do Layout, que fixa a janela. `minHeight: 100vh` fazia
        // a barra crescer com a página e levava o rodapé para fora da tela.
        height: '100%',
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
      <nav style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
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

      {/* Footer: o nome abre o menu do sistema */}
      <div
        ref={rodape}
        style={{
          borderTop: '1px solid #DCE6EA',
          padding: collapsed ? '12px 0' : '12px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          gap: 8,
          position: 'relative',
        }}
      >
        {menuAberto && (
          <div
            style={{
              position: 'absolute',
              bottom: 'calc(100% + 6px)',
              left: collapsed ? 8 : 12,
              right: collapsed ? 'auto' : 12,
              minWidth: 190,
              background: '#fff',
              border: '1px solid #DCE6EA',
              borderRadius: 12,
              boxShadow: '0 8px 28px rgba(0,0,0,0.12)',
              padding: 6,
              zIndex: 60,
            }}
          >
            {MENU_USUARIO.map(({ to, label, icon: Icon }) => (
              <button
                key={to}
                onClick={() => { setMenuAberto(false); navigate(to) }}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 9,
                  padding: '9px 11px',
                  border: 'none',
                  borderRadius: 8,
                  background: pathname === to ? '#EAF3F6' : 'transparent',
                  color: pathname === to ? '#1E6E8C' : '#16232B',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 600,
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => { if (pathname !== to) e.currentTarget.style.background = '#F7FAFB' }}
                onMouseLeave={(e) => { if (pathname !== to) e.currentTarget.style.background = 'transparent' }}
              >
                <Icon size={15} color={pathname === to ? '#1E6E8C' : '#6B818C'} />
                {label}
              </button>
            ))}

            <div style={{ height: 1, background: '#EDF2F4', margin: '5px 4px' }} />

            <button
              onClick={handleLogout}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                padding: '9px 11px',
                border: 'none',
                borderRadius: 8,
                background: 'transparent',
                color: '#DC2626',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 600,
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                textAlign: 'left',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#FEF2F2')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <LogOut size={15} /> Sair
            </button>
          </div>
        )}

        <button
          onClick={() => setMenuAberto((a) => !a)}
          title={collapsed ? nomeUsuario : undefined}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            overflow: 'hidden',
            flex: 1,
            minWidth: 0,
            background: menuAberto ? '#EAF3F6' : 'transparent',
            border: 'none',
            borderRadius: 9,
            padding: collapsed ? 0 : '4px 6px',
            margin: collapsed ? 0 : '-4px -6px',
            cursor: 'pointer',
            textAlign: 'left',
            fontFamily: "'Plus Jakarta Sans', sans-serif",
          }}
        >
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
                {nomeUsuario}
              </div>
              <div style={{ fontSize: 11, color: '#6B818C' }}>Secretária</div>
            </div>
          )}
          {!collapsed && (
            <ChevronUp
              size={14}
              color="#6B818C"
              style={{
                marginLeft: 'auto',
                flexShrink: 0,
                transform: menuAberto ? 'rotate(180deg)' : 'none',
                transition: 'transform 0.15s ease',
              }}
            />
          )}
        </button>

      </div>
    </aside>
  )
}
