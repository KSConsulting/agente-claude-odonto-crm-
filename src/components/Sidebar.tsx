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

/**
 * O fundo de um item do menu.
 *
 * O passar do mouse precisa ser **evidente** sem virar sósia do item ativo —
 * por isso o hover usa o cinza neutro da paleta e o ativo usa o azul da marca:
 * um diz "dá para clicar", o outro diz "você está aqui". E o ativo também
 * escurece no hover, senão a página em que você já está seria a única que não
 * responde ao mouse.
 */
function fundoDoItem(ativo: boolean, sobMouse: boolean): string {
  if (ativo) return sobMouse ? '#DCE6EA' : '#EAF3F6'
  return sobMouse ? '#EDF2F4' : 'transparent'
}

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

  // O hover é estado, e não `style.background` mexido na mão como nos botões
  // do menu: ali o elemento não re-renderiza, aqui sim — a cada troca de rota.
  // Mexer no DOM direto deixaria o item clicado com o realce preso.
  const [sobMouse, setSobMouse] = useState<string | null>(null)
  const [rodapeSobMouse, setRodapeSobMouse] = useState(false)

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

    // E o mesmo para o usuário: a barra carrega a linha dele uma vez, quando a
    // sessão abre. Sem este aviso, trocar a foto ou o nome em Configurações só
    // aparecia aqui no próximo F5 — na tela em que a pessoa acabou de mexer.
    const onUsuarioAtualizado = () => {
      void supabase.auth.getUser().then(({ data: { user } }) => {
        if (!user) return
        return supabase.from('usuarios').select('*').eq('id', user.id).single()
          .then(({ data }) => { if (data) setUsuario(data) })
      })
    }

    window.addEventListener('clinica-atualizada', onClinicaAtualizada)
    window.addEventListener('usuario-atualizado', onUsuarioAtualizado)
    return () => {
      window.removeEventListener('clinica-atualizada', onClinicaAtualizada)
      window.removeEventListener('usuario-atualizado', onUsuarioAtualizado)
    }
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
      {/* Header: a logo em cima, o nome embaixo.

          Empilhado, e não lado a lado. A logo é a identidade da clínica e
          merece tamanho de identidade — em linha ela ficava com 32px,
          disputando largura com o nome, e o resultado era do tamanho de um
          ícone de menu.

          E é UM bloco para os dois estados. Eram duas cópias da mesma
          marcação, uma para recolhido e outra para aberto: mudar o tamanho da
          logo pedia mudar nas duas, e um dia mudaria só numa. */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: collapsed ? 0 : 9,
          padding: collapsed ? '18px 0' : '18px 14px',
          borderBottom: '1px solid #DCE6EA',
          position: 'relative',
        }}
      >
        {clinica?.logo_url ? (
          <img
            src={clinica.logo_url}
            alt="Logo"
            style={{
              width: collapsed ? 40 : 48,
              height: collapsed ? 40 : 48,
              borderRadius: 10,
              objectFit: 'cover',
              flexShrink: 0,
            }}
          />
        ) : (
          <div
            style={{
              width: collapsed ? 40 : 48,
              height: collapsed ? 40 : 48,
              borderRadius: 10,
              background: '#EAF3F6',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Stethoscope size={collapsed ? 22 : 26} color="#1E6E8C" />
          </div>
        )}

        {!collapsed && (
          <span
            style={{
              fontSize: 15,
              fontWeight: 700,
              color: '#16232B',
              textAlign: 'center',
              lineHeight: 1.3,
              maxWidth: '100%',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {clinica?.nome_clinica ?? 'Clínica'}
          </span>
        )}

        {/* Absoluto nos dois estados: com a logo centralizada, um botão no
            fluxo puxaria o conteúdo para o lado. */}
        <button
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? 'Expandir a barra' : 'Recolher a barra'}
          style={{
            position: 'absolute',
            right: collapsed ? -12 : 8,
            top: collapsed ? 24 : 14,
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
      <nav style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: 3 }}>
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onMouseEnter={() => { setSobMouse(to) }}
            onMouseLeave={() => { setSobMouse((atual) => (atual === to ? null : atual)) }}
            style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: collapsed ? '11px 0' : '11px 12px',
              justifyContent: collapsed ? 'center' : 'flex-start',
              borderRadius: 10,
              textDecoration: 'none',
              background: fundoDoItem(isActive, sobMouse === to),
              color: isActive ? '#1E6E8C' : sobMouse === to ? '#16232B' : '#6B818C',
              fontWeight: isActive ? 600 : 500,
              fontSize: 14.5,
              transition: 'background 0.15s ease, color 0.15s ease',
            })}
            title={collapsed ? label : undefined}
          >
            {({ isActive }) => (
              <>
                {/* Maior quando recolhido: sem o rótulo ao lado, o ícone é a
                    única coisa que separa Agenda de Conversas. */}
                <Icon
                  size={collapsed ? 22 : 20}
                  color={isActive || sobMouse === to ? '#1E6E8C' : '#6B818C'}
                  strokeWidth={isActive ? 2.2 : 1.8}
                />
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
          onMouseEnter={() => { setRodapeSobMouse(true) }}
          onMouseLeave={() => { setRodapeSobMouse(false) }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 9,
            overflow: 'hidden',
            flex: 1,
            minWidth: 0,
            background: fundoDoItem(menuAberto, rodapeSobMouse),
            transition: 'background 0.15s ease',
            border: 'none',
            borderRadius: 9,
            padding: collapsed ? 0 : '4px 6px',
            margin: collapsed ? 0 : '-4px -6px',
            cursor: 'pointer',
            textAlign: 'left',
            fontFamily: "'Plus Jakarta Sans', sans-serif",
          }}
        >
          {/* A foto do perfil, e a inicial como reserva. `alt` com o nome
              porque na barra recolhida este é o único conteúdo do botão — sem
              ele, o botão fica sem nome para quem usa leitor de tela. */}
          {usuario?.avatar_url ? (
            <img
              src={usuario.avatar_url}
              alt={nomeUsuario}
              style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                objectFit: 'cover',
                flexShrink: 0,
              }}
            />
          ) : (
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                background: '#EAF3F6',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 13.5,
                fontWeight: 700,
                color: '#1E6E8C',
                flexShrink: 0,
              }}
            >
              {initials}
            </div>
          )}
          {!collapsed && (
            <div style={{ overflow: 'hidden' }}>
              <div
                style={{
                  fontSize: 13.5,
                  fontWeight: 600,
                  color: '#16232B',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {nomeUsuario}
              </div>
              <div style={{ fontSize: 11.5, color: '#6B818C' }}>Secretária</div>
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
