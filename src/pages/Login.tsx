import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Stethoscope, Eye, EyeOff } from 'lucide-react'
import { supabase } from '../lib/supabase'

const MAX_ATTEMPTS = 5
const LOCKOUT_SECONDS = 30

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

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#F4F2EF',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: "'Plus Jakarta Sans', sans-serif",
      }}
    >
      <div
        className="fade-in"
        style={{
          background: '#fff',
          borderRadius: 18,
          border: '1px solid #EBEBEB',
          padding: '48px 44px',
          width: '100%',
          maxWidth: 400,
          boxShadow: '0 4px 32px rgba(0,0,0,0.06)',
        }}
      >
        {/* Icon */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 18,
              background: '#F7EDF0',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 16,
            }}
          >
            <Stethoscope size={30} color="#B85C72" strokeWidth={1.8} />
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1A1A1A', margin: 0 }}>
            Bem-vinda de volta
          </h1>
          <p style={{ fontSize: 13.5, color: '#7A7A7A', marginTop: 6 }}>
            Entre na sua conta para continuar
          </p>
        </div>

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#1A1A1A', display: 'block', marginBottom: 6 }}>
              E-mail
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
              required
              disabled={isLocked}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: 10,
                border: '1px solid #EBEBEB',
                fontSize: 14,
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                color: '#1A1A1A',
                outline: 'none',
                transition: 'border-color 0.15s',
                opacity: isLocked ? 0.5 : 1,
              }}
              onFocus={(e) => (e.target.style.borderColor = '#B85C72')}
              onBlur={(e) => (e.target.style.borderColor = '#EBEBEB')}
            />
          </div>

          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#1A1A1A', display: 'block', marginBottom: 6 }}>
              Senha
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                disabled={isLocked}
                style={{
                  width: '100%',
                  padding: '10px 40px 10px 14px',
                  borderRadius: 10,
                  border: '1px solid #EBEBEB',
                  fontSize: 14,
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  color: '#1A1A1A',
                  outline: 'none',
                  transition: 'border-color 0.15s',
                  opacity: isLocked ? 0.5 : 1,
                }}
                onFocus={(e) => (e.target.style.borderColor = '#B85C72')}
                onBlur={(e) => (e.target.style.borderColor = '#EBEBEB')}
              />
              <button
                type="button"
                onClick={() => setShowPass((s) => !s)}
                style={{
                  position: 'absolute',
                  right: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                {showPass ? <EyeOff size={16} color="#7A7A7A" /> : <Eye size={16} color="#7A7A7A" />}
              </button>
            </div>
          </div>

          {error && (
            <div style={{
              background: isLocked ? '#FFF7ED' : '#FEF2F2',
              border: `1px solid ${isLocked ? '#FED7AA' : '#FECACA'}`,
              borderRadius: 8,
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
              background: isLocked ? '#D1D5DB' : loading ? '#D4849A' : '#B85C72',
              color: '#fff',
              border: 'none',
              borderRadius: 10,
              padding: '12px',
              fontSize: 14,
              fontWeight: 600,
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              cursor: loading || isLocked ? 'not-allowed' : 'pointer',
              transition: 'background 0.15s',
              marginTop: 4,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            {isLocked ? (
              `Bloqueado (${lockout}s)`
            ) : loading ? (
              <>
                <div style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                Entrando...
              </>
            ) : 'Entrar'}
          </button>
        </form>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
