import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Mail, Lock, Sparkles, Crown, Layers } from 'lucide-react'
import { supabase } from '../lib/supabase'

const MAX_ATTEMPTS = 5
const LOCKOUT_SECONDS = 30

/* Paleta — azul clínico */
const PRIMARY = '#1E6E8C'
const PRIMARY_DARK = '#17576F'
const PRIMARY_SOFT = '#EAF3F6'
const BG = '#F2F6F7'
const TEXT = '#16232B'
const MUTED = '#6B818C'
const BORDER = '#DCE6EA'

const FONT = "'Plus Jakarta Sans', sans-serif"

/* Ícone de dente — SVG próprio.
   A lucide-react não tem ícone dentário, então desenhamos um no mesmo
   estilo dos demais (viewBox 24, traço arredondado, sem preenchimento). */
function ToothIcon({ size = 24, color = 'currentColor', strokeWidth = 1.7 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3.5c-2.5 0-3.4-.7-5-.7-2.4 0-4 2-4 4.8 0 2.6.9 4 1.4 5.8.5 1.8.6 4 1 5.8.3 1.4.9 2 1.6 2 .9 0 1.4-.8 1.7-2.2.4-2 .7-4.4 3.3-4.4s2.9 2.4 3.3 4.4c.3 1.4.8 2.2 1.7 2.2.7 0 1.3-.6 1.6-2 .4-1.8.5-4 1-5.8.5-1.8 1.4-3.2 1.4-5.8 0-2.8-1.6-4.8-4-4.8-1.6 0-2.5.7-5 .7Z" />
      <path d="M8.2 7.2c.7-.6 1.6-.9 2.5-.9" opacity="0.55" />
    </svg>
  )
}

/* Procedimentos exibidos no painel da marca.
   Ficam fixos aqui de propósito: esta tela é PRÉ-LOGIN, e o RLS bloqueia
   qualquer leitura de `servicos_clinica` sem usuário autenticado. */
const PROCEDIMENTOS = [
  { Icon: Sparkles, nome: 'Lentes de Contato', desc: 'Estética e brilho natural' },
  { Icon: Crown, nome: 'Prótese Dentária', desc: 'Reabilitação do sorriso' },
  { Icon: Layers, nome: 'Alinhadores Transparentes', desc: 'Ortodontia sem aparelho fixo' },
]

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [attempts, setAttempts] = useState(0)
  const [lockout, setLockout] = useState(0) // seconds remaining
  const navigate = useNavigate()

  // Countdown timer during lockout
  useEffect(() => {
    if (lockout <= 0) return
    const timer = setInterval(() => {
      setLockout((s) => {
        if (s <= 1) { clearInterval(timer); return 0 }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [lockout])

  const isLocked = lockout > 0

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isLocked) return
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      const newAttempts = attempts + 1
      setAttempts(newAttempts)
      if (newAttempts >= MAX_ATTEMPTS) {
        setAttempts(0)
        setLockout(LOCKOUT_SECONDS)
        setError(`Muitas tentativas. Aguarde ${LOCKOUT_SECONDS} segundos para tentar novamente.`)
      } else {
        setError(`E-mail ou senha incorretos. (${newAttempts}/${MAX_ATTEMPTS} tentativas)`)
      }
      setLoading(false)
      return
    }

    navigate('/')
  }

  const inputWrapStyle: React.CSSProperties = { position: 'relative' }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '12px 14px 12px 42px',
    borderRadius: 11,
    border: `1px solid ${BORDER}`,
    fontSize: 14,
    fontFamily: FONT,
    color: TEXT,
    background: '#fff',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.15s, box-shadow 0.15s',
    opacity: isLocked ? 0.5 : 1,
  }

  const iconInInput: React.CSSProperties = {
    position: 'absolute',
    left: 14,
    top: '50%',
    transform: 'translateY(-50%)',
    pointerEvents: 'none',
    display: 'flex',
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 13,
    fontWeight: 600,
    color: TEXT,
    display: 'block',
    marginBottom: 7,
  }

  const onFocusRing = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.style.borderColor = PRIMARY
    e.target.style.boxShadow = `0 0 0 3px ${PRIMARY}1A`
  }
  const onBlurRing = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.style.borderColor = BORDER
    e.target.style.boxShadow = 'none'
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', fontFamily: FONT, background: BG }}>

      {/* ================= PAINEL DA MARCA (esquerda) ================= */}
      <aside
        className="login-brand"
        style={{
          flex: '1 1 46%',
          background: `linear-gradient(160deg, ${PRIMARY} 0%, ${PRIMARY_DARK} 100%)`,
          padding: '56px 52px',
          flexDirection: 'column',
          justifyContent: 'space-between',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Halos decorativos */}
        <div style={{
          position: 'absolute', width: 420, height: 420, borderRadius: '50%',
          background: 'rgba(255,255,255,0.05)', top: -140, right: -120,
        }} />
        <div style={{
          position: 'absolute', width: 300, height: 300, borderRadius: '50%',
          background: 'rgba(255,255,255,0.04)', bottom: -110, left: -80,
        }} />

        {/* Marca */}
        <div style={{ position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 54, height: 54, borderRadius: 15,
              background: 'rgba(255,255,255,0.14)',
              border: '1px solid rgba(255,255,255,0.22)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <ToothIcon size={28} color="#fff" strokeWidth={1.6} />
            </div>
            <div>
              <div style={{ fontSize: 19, fontWeight: 700, color: '#fff', letterSpacing: -0.2 }}>
                Odonto Clinica
              </div>
              <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.72)', marginTop: 1 }}>
                Gestão de pacientes
              </div>
            </div>
          </div>
        </div>

        {/* Frase + procedimentos */}
        <div style={{ position: 'relative' }}>
          <h2 style={{
            fontSize: 30, lineHeight: 1.25, fontWeight: 700, color: '#fff',
            margin: 0, letterSpacing: -0.6, maxWidth: 380,
          }}>
            Cuidando de cada sorriso, todos os dias.
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 34 }}>
            {PROCEDIMENTOS.map(({ Icon, nome, desc }) => (
              <div key={nome} style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
                <div style={{
                  width: 38, height: 38, borderRadius: 11, flexShrink: 0,
                  background: 'rgba(255,255,255,0.12)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Icon size={18} color="#fff" strokeWidth={1.8} />
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{nome}</div>
                  <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.68)' }}>{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ position: 'relative', fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
          Acesso restrito à equipe da clínica
        </div>
      </aside>

      {/* ================= FORMULÁRIO (direita) ================= */}
      <main style={{
        flex: '1 1 54%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '40px 24px',
      }}>
        <div className="fade-in" style={{ width: '100%', maxWidth: 380 }}>

          {/* Marca compacta — só aparece quando o painel lateral some */}
          <div className="login-mobile-brand" style={{
            alignItems: 'center', gap: 12, marginBottom: 30,
          }}>
            <div style={{
              width: 46, height: 46, borderRadius: 13, background: PRIMARY_SOFT,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <ToothIcon size={25} color={PRIMARY} strokeWidth={1.7} />
            </div>
            <div style={{ fontSize: 17, fontWeight: 700, color: TEXT }}>Odonto Clinica</div>
          </div>

          <h1 style={{ fontSize: 25, fontWeight: 700, color: TEXT, margin: 0, letterSpacing: -0.4 }}>
            Acesse sua conta
          </h1>
          <p style={{ fontSize: 13.5, color: MUTED, marginTop: 7, marginBottom: 30 }}>
            Entre com seus dados para continuar
          </p>

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 17 }}>
            <div>
              <label style={labelStyle}>E-mail</label>
              <div style={inputWrapStyle}>
                <span style={iconInInput}><Mail size={16} color={MUTED} /></span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  required
                  disabled={isLocked}
                  autoComplete="email"
                  style={inputStyle}
                  onFocus={onFocusRing}
                  onBlur={onBlurRing}
                />
              </div>
            </div>

            <div>
              <label style={labelStyle}>Senha</label>
              <div style={inputWrapStyle}>
                <span style={iconInInput}><Lock size={16} color={MUTED} /></span>
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  disabled={isLocked}
                  autoComplete="current-password"
                  style={{ ...inputStyle, paddingRight: 42 }}
                  onFocus={onFocusRing}
                  onBlur={onBlurRing}
                />
                <button
                  type="button"
                  onClick={() => setShowPass((s) => !s)}
                  aria-label={showPass ? 'Ocultar senha' : 'Mostrar senha'}
                  style={{
                    position: 'absolute', right: 12, top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer',
                    padding: 0, display: 'flex', alignItems: 'center',
                  }}
                >
                  {showPass ? <EyeOff size={16} color={MUTED} /> : <Eye size={16} color={MUTED} />}
                </button>
              </div>
            </div>

            {error && (
              <div style={{
                background: isLocked ? '#FFF7ED' : '#FEF2F2',
                border: `1px solid ${isLocked ? '#FED7AA' : '#FECACA'}`,
                borderRadius: 9,
                padding: '10px 14px',
                fontSize: 13,
                color: isLocked ? '#C2410C' : '#DC2626',
              }}>
                {isLocked ? (
                  <span>Acesso bloqueado. Tente novamente em <strong>{lockout}s</strong>.</span>
                ) : error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || isLocked}
              style={{
                background: isLocked ? '#C7D3D8' : loading ? '#4C90A8' : PRIMARY,
                color: '#fff',
                border: 'none',
                borderRadius: 11,
                padding: '13px',
                fontSize: 14.5,
                fontWeight: 600,
                fontFamily: FONT,
                cursor: loading || isLocked ? 'not-allowed' : 'pointer',
                transition: 'background 0.15s',
                marginTop: 5,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
              onMouseEnter={(e) => {
                if (!loading && !isLocked) e.currentTarget.style.background = PRIMARY_DARK
              }}
              onMouseLeave={(e) => {
                if (!loading && !isLocked) e.currentTarget.style.background = PRIMARY
              }}
            >
              {isLocked ? (
                `Bloqueado (${lockout}s)`
              ) : loading ? (
                <>
                  <div style={{
                    width: 16, height: 16,
                    border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff',
                    borderRadius: '50%', animation: 'spin 0.7s linear infinite',
                  }} />
                  Entrando...
                </>
              ) : 'Entrar'}
            </button>
          </form>
        </div>
      </main>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }

        .login-brand { display: flex; }
        .login-mobile-brand { display: none; }

        @media (max-width: 900px) {
          .login-brand { display: none; }
          .login-mobile-brand { display: flex; }
        }
      `}</style>
    </div>
  )
}
