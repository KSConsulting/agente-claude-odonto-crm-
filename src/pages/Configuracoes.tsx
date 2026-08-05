import React, { useEffect, useRef, useState } from 'react'
import {
  User, Clock, Stethoscope, Upload, Save, Plus, Pencil,
  Trash2, ChevronDown, ChevronUp, X, Check, KeyRound, Eye, EyeOff,
} from 'lucide-react'
import zxcvbn from 'zxcvbn'
import { supabase } from '../lib/supabase'
import type { Usuario, ConfiguracoesClinica, HorarioComercial, ServicoClinica } from '../types'
import ConfirmDeleteModal from '../components/ConfirmDeleteModal'

/* ──────────────────────────────────────────────
   Upload validation constants
────────────────────────────────────────────── */
const MAX_FILE_SIZE = 2 * 1024 * 1024 // 2MB
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']

function validateImageFile(file: File): string | null {
  if (file.size > MAX_FILE_SIZE) return 'O arquivo excede o tamanho máximo de 2MB.'
  if (!ALLOWED_MIME.includes(file.type)) return 'Tipo de arquivo não permitido. Use JPG, PNG, WebP ou SVG.'
  return null
}

/* ──────────────────────────────────────────────
   Password strength helpers
────────────────────────────────────────────── */
const STRENGTH_LABELS = ['Muito fraca', 'Fraca', 'Razoável', 'Forte', 'Muito forte']
const STRENGTH_COLORS = ['#DC2626', '#F97316', '#D97706', '#1A7A48', '#1A7A48']

/* ──────────────────────────────────────────────
   Helpers
────────────────────────────────────────────── */
const DAY_NAMES = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado']

type TabKey = 'perfil' | 'horarios' | 'procedimentos'

const TABS: { key: TabKey; label: string; icon: React.ElementType }[] = [
  { key: 'perfil',         label: 'Perfil',                  icon: User },
  { key: 'horarios',       label: 'Horários de Funcionamento', icon: Clock },
  { key: 'procedimentos',  label: 'Procedimentos',            icon: Stethoscope },
]

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #DCE6EA', padding: '22px 26px', marginBottom: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: '#16232B', marginBottom: 18, paddingBottom: 14, borderBottom: '1px solid #EDF2F4' }}>
        {title}
      </div>
      {children}
    </div>
  )
}

function SaveButton({ onClick, saving, saved, disabled = false }: { onClick: () => void; saving: boolean; saved: boolean; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={saving || disabled}
      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 9, border: 'none', background: saved ? '#1A7A48' : (disabled ? '#DCE6EA' : '#1E6E8C'), color: disabled ? '#6B818C' : '#fff', cursor: disabled ? 'default' : 'pointer', fontSize: 13, fontWeight: 600, fontFamily: "'Plus Jakarta Sans', sans-serif", transition: 'background 0.2s' }}>
      {saved ? <Check size={14} /> : <Save size={14} />}
      {saved ? 'Salvo!' : saving ? 'Salvando...' : 'Salvar'}
    </button>
  )
}

/* ──────────────────────────────────────────────
   ABA PERFIL
────────────────────────────────────────────── */
function TabPerfil({ userId }: { userId: string }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [clinica, setClinica] = useState<ConfiguracoesClinica | null>(null)
  const [nome, setNome] = useState('')
  const [savingNome, setSavingNome] = useState(false)
  const [savedNome, setSavedNome] = useState(false)
  const [nomeError, setNomeError] = useState('')
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [avatarError, setAvatarError] = useState('')
  const [logoError, setLogoError] = useState('')
  // Password change
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showNewPass, setShowNewPass] = useState(false)
  const [showConfirmPass, setShowConfirmPass] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)
  const [savedPassword, setSavedPassword] = useState(false)
  const [passwordError, setPasswordError] = useState('')
  const avatarRef = useRef<HTMLInputElement>(null)
  const logoRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    Promise.all([
      supabase.from('usuarios').select('*').eq('id', userId).single(),
      supabase.from('configuracoes_clinica').select('*').limit(1).single(),
    ]).then(([{ data: u }, { data: c }]) => {
      if (u) { setUsuario(u); setNome(u.nome ?? '') }
      if (c) setClinica(c)
    })
  }, [userId])

  const handleSaveNome = async () => {
    if (!nome.trim()) return
    setSavingNome(true); setNomeError('')
    const { error } = await supabase.from('usuarios').update({ nome: nome.trim() }).eq('id', userId)
    if (error) { setNomeError('Erro ao salvar. Tente novamente.'); setSavingNome(false); return }
    setUsuario((prev) => prev ? { ...prev, nome: nome.trim() } : prev)
    setSavingNome(false); setSavedNome(true)
    setTimeout(() => setSavedNome(false), 2000)
  }

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarError('')
    const validationError = validateImageFile(file)
    if (validationError) { setAvatarError(validationError); e.target.value = ''; return }
    setUploadingAvatar(true)
    const ext = file.name.split('.').pop()
    const path = `${userId}/avatar.${ext}`
    const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
    if (uploadError) { setAvatarError('Erro ao enviar a imagem. Tente novamente.'); setUploadingAvatar(false); e.target.value = ''; return }
    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
    const url = `${publicUrl}?t=${Date.now()}`
    const { error: dbError } = await supabase.from('usuarios').update({ avatar_url: url }).eq('id', userId)
    if (dbError) { setAvatarError('Imagem enviada, mas erro ao salvar no perfil.') }
    else { setUsuario((prev) => prev ? { ...prev, avatar_url: url } : prev) }
    setUploadingAvatar(false); e.target.value = ''
  }

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setLogoError('')
    const validationError = validateImageFile(file)
    if (validationError) { setLogoError(validationError); e.target.value = ''; return }
    setUploadingLogo(true)
    const ext = file.name.split('.').pop()
    const path = `clinic/logo.${ext}`
    const { error: uploadError } = await supabase.storage.from('logos').upload(path, file, { upsert: true })
    if (uploadError) { setLogoError('Erro ao enviar a imagem. Tente novamente.'); setUploadingLogo(false); e.target.value = ''; return }
    const { data: { publicUrl } } = supabase.storage.from('logos').getPublicUrl(path)
    const url = `${publicUrl}?t=${Date.now()}`
    const dbOp = clinica
      ? supabase.from('configuracoes_clinica').update({ logo_url: url }).eq('id', clinica.id)
      : supabase.from('configuracoes_clinica').insert({ logo_url: url })
    const { error: dbError } = await dbOp
    if (dbError) { setLogoError('Logo enviada, mas erro ao salvar configuração.') }
    else {
      setClinica((prev) => prev ? { ...prev, logo_url: url } : { id: '', nome_clinica: null, logo_url: url, fuso_horario: 'America/Sao_Paulo', created_at: '', updated_at: '' })
      window.dispatchEvent(new Event('clinica-logo-updated'))
    }
    setUploadingLogo(false); e.target.value = ''
  }

  const handleSavePassword = async () => {
    setPasswordError('')
    if (!newPassword) { setPasswordError('Digite a nova senha.'); return }
    const score = zxcvbn(newPassword).score
    if (score < 3) { setPasswordError('Senha muito fraca. Use letras maiúsculas, minúsculas, números e símbolos.'); return }
    if (newPassword !== confirmPassword) { setPasswordError('As senhas não coincidem.'); return }
    setSavingPassword(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setSavingPassword(false)
    if (error) { setPasswordError('Erro ao atualizar a senha. Tente novamente.'); return }
    setSavedPassword(true); setNewPassword(''); setConfirmPassword('')
    setTimeout(() => setSavedPassword(false), 3000)
  }

  const initials = usuario?.nome
    ? usuario.nome.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
    : '?'

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid #DCE6EA',
    fontSize: 13.5, fontFamily: "'Plus Jakarta Sans', sans-serif", color: '#16232B',
    outline: 'none', background: '#fff', boxSizing: 'border-box',
  }

  const passwordScore = newPassword ? zxcvbn(newPassword).score : -1
  const strengthColor = passwordScore >= 0 ? STRENGTH_COLORS[passwordScore] : '#DCE6EA'
  const strengthLabel = passwordScore >= 0 ? STRENGTH_LABELS[passwordScore] : ''

  const ErrorMsg = ({ msg }: { msg: string }) => msg ? (
    <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '8px 12px', fontSize: 12.5, color: '#DC2626', marginTop: 8 }}>{msg}</div>
  ) : null

  return (
    <>
      {/* Nome do usuário */}
      <SectionCard title="Nome do Usuário">
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Seu nome completo" style={{ ...inputStyle, flex: 1, minWidth: 200 }}
            onFocus={(e) => (e.target.style.borderColor = '#1E6E8C')}
            onBlur={(e) => (e.target.style.borderColor = '#DCE6EA')} />
          <SaveButton onClick={handleSaveNome} saving={savingNome} saved={savedNome} disabled={!nome.trim()} />
        </div>
        <ErrorMsg msg={nomeError} />
      </SectionCard>

      {/* Foto de perfil */}
      <SectionCard title="Foto de Perfil">
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative' }}>
            {usuario?.avatar_url ? (
              <img src={usuario.avatar_url} alt="Avatar" style={{ width: 80, height: 80, borderRadius: '50%', objectFit: 'cover', border: '2px solid #DCE6EA' }} />
            ) : (
              <div style={{ width: 80, height: 80, borderRadius: '50%', background: '#EAF3F6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, fontWeight: 700, color: '#1E6E8C', border: '2px solid #DCE6EA' }}>
                {initials}
              </div>
            )}
            {uploadingAvatar && (
              <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'rgba(255,255,255,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: 20, height: 20, border: '2px solid #EAF3F6', borderTopColor: '#1E6E8C', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
              </div>
            )}
          </div>
          <div>
            <p style={{ fontSize: 13, color: '#6B818C', margin: '0 0 10px' }}>JPG, PNG ou WebP. Tamanho máximo: 2MB.</p>
            <button onClick={() => { setAvatarError(''); avatarRef.current?.click() }}
              style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 16px', borderRadius: 9, border: '1px solid #DCE6EA', background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#16232B', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
              <Upload size={14} /> {uploadingAvatar ? 'Enviando...' : 'Alterar foto'}
            </button>
            <input ref={avatarRef} type="file" accept="image/jpeg,image/png,image/webp,image/svg+xml" style={{ display: 'none' }} onChange={handleAvatarUpload} />
          </div>
        </div>
        <ErrorMsg msg={avatarError} />
      </SectionCard>

      {/* Logo da clínica */}
      <SectionCard title="Logo da Clínica">
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative' }}>
            {clinica?.logo_url ? (
              <img src={clinica.logo_url} alt="Logo" style={{ width: 80, height: 80, borderRadius: 12, objectFit: 'cover', border: '2px solid #DCE6EA' }} />
            ) : (
              <div style={{ width: 80, height: 80, borderRadius: 12, background: '#EAF3F6', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #DCE6EA' }}>
                <Stethoscope size={30} color="#4C90A8" strokeWidth={1.5} />
              </div>
            )}
            {uploadingLogo && (
              <div style={{ position: 'absolute', inset: 0, borderRadius: 12, background: 'rgba(255,255,255,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: 20, height: 20, border: '2px solid #EAF3F6', borderTopColor: '#1E6E8C', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
              </div>
            )}
          </div>
          <div>
            <p style={{ fontSize: 13, color: '#6B818C', margin: '0 0 10px' }}>A logo aparece na sidebar do sistema. JPG, PNG ou SVG.</p>
            <button onClick={() => { setLogoError(''); logoRef.current?.click() }}
              style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 16px', borderRadius: 9, border: '1px solid #DCE6EA', background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#16232B', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
              <Upload size={14} /> {uploadingLogo ? 'Enviando...' : 'Alterar logo'}
            </button>
            <input ref={logoRef} type="file" accept="image/jpeg,image/png,image/webp,image/svg+xml" style={{ display: 'none' }} onChange={handleLogoUpload} />
          </div>
        </div>
        <ErrorMsg msg={logoError} />
      </SectionCard>

      {/* Alterar Senha */}
      <SectionCard title="Alterar Senha">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 420 }}>
          {/* Nova senha */}
          <div>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: '#16232B', display: 'block', marginBottom: 6 }}>Nova senha</label>
            <div style={{ position: 'relative' }}>
              <input type={showNewPass ? 'text' : 'password'} value={newPassword} onChange={(e) => { setNewPassword(e.target.value); setPasswordError('') }}
                placeholder="••••••••" style={{ ...inputStyle, paddingRight: 40 }}
                onFocus={(e) => (e.target.style.borderColor = '#1E6E8C')} onBlur={(e) => (e.target.style.borderColor = '#DCE6EA')} />
              <button type="button" onClick={() => setShowNewPass((s) => !s)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                {showNewPass ? <EyeOff size={15} color="#6B818C" /> : <Eye size={15} color="#6B818C" />}
              </button>
            </div>
            {/* Strength bar */}
            {newPassword.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                  {[0, 1, 2, 3, 4].map((i) => (
                    <div key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i <= passwordScore ? strengthColor : '#DCE6EA', transition: 'background 0.2s' }} />
                  ))}
                </div>
                <span style={{ fontSize: 11.5, color: strengthColor, fontWeight: 600 }}>{strengthLabel}</span>
              </div>
            )}
          </div>

          {/* Confirmar senha */}
          <div>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: '#16232B', display: 'block', marginBottom: 6 }}>Confirmar nova senha</label>
            <div style={{ position: 'relative' }}>
              <input type={showConfirmPass ? 'text' : 'password'} value={confirmPassword} onChange={(e) => { setConfirmPassword(e.target.value); setPasswordError('') }}
                placeholder="••••••••" style={{ ...inputStyle, paddingRight: 40 }}
                onFocus={(e) => (e.target.style.borderColor = '#1E6E8C')} onBlur={(e) => (e.target.style.borderColor = '#DCE6EA')} />
              <button type="button" onClick={() => setShowConfirmPass((s) => !s)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                {showConfirmPass ? <EyeOff size={15} color="#6B818C" /> : <Eye size={15} color="#6B818C" />}
              </button>
            </div>
          </div>

          <ErrorMsg msg={passwordError} />

          {savedPassword && (
            <div style={{ background: '#E8F8EF', border: '1px solid #BBF7D0', borderRadius: 8, padding: '8px 12px', fontSize: 12.5, color: '#1A7A48' }}>
              Senha alterada com sucesso!
            </div>
          )}

          <button onClick={handleSavePassword} disabled={savingPassword || !newPassword || !confirmPassword}
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px', borderRadius: 9, border: 'none', alignSelf: 'flex-start', background: (!newPassword || !confirmPassword) ? '#DCE6EA' : savingPassword ? '#4C90A8' : '#1E6E8C', color: (!newPassword || !confirmPassword) ? '#6B818C' : '#fff', cursor: (!newPassword || !confirmPassword) ? 'default' : 'pointer', fontSize: 13, fontWeight: 600, fontFamily: "'Plus Jakarta Sans', sans-serif", transition: 'background 0.2s' }}>
            <KeyRound size={14} /> {savingPassword ? 'Salvando...' : 'Alterar senha'}
          </button>
        </div>
      </SectionCard>
    </>
  )
}

/* ──────────────────────────────────────────────
   ABA HORÁRIOS
────────────────────────────────────────────── */
interface HorarioRow {
  dbId: string | null   // null if not yet in DB
  dia_semana: number
  hora_inicio: string
  hora_fim: string
  ativo: boolean
  saving: boolean
  saved: boolean
  error: string
}

function TabHorarios() {
  const [rows, setRows] = useState<HorarioRow[]>(
    Array.from({ length: 7 }, (_, i) => ({
      dbId: null, dia_semana: i, hora_inicio: '08:00', hora_fim: '18:00', ativo: i >= 1 && i <= 5, saving: false, saved: false, error: '',
    }))
  )

  useEffect(() => {
    supabase.from('horario_comercial').select('*').then(({ data }) => {
      if (!data || data.length === 0) return
      setRows((prev) =>
        prev.map((r) => {
          const db = (data as HorarioComercial[]).find((d) => d.dia_semana === r.dia_semana)
          if (!db) return r
          return { ...r, dbId: db.id, hora_inicio: db.hora_inicio.slice(0, 5), hora_fim: db.hora_fim.slice(0, 5), ativo: db.ativo }
        })
      )
    })
  }, [])

  const update = (dia: number, field: keyof HorarioRow, value: any) =>
    setRows((prev) => prev.map((r) => r.dia_semana === dia ? { ...r, [field]: value } : r))

  const handleSave = async (row: HorarioRow) => {
    update(row.dia_semana, 'saving', true)
    update(row.dia_semana, 'error', '')
    if (row.dbId) {
      const { error } = await supabase.from('horario_comercial').update({ hora_inicio: row.hora_inicio, hora_fim: row.hora_fim, ativo: row.ativo }).eq('id', row.dbId)
      if (error) { update(row.dia_semana, 'saving', false); update(row.dia_semana, 'error', 'Erro ao salvar. Tente novamente.'); return }
    } else {
      const { data, error } = await supabase.from('horario_comercial').insert({ dia_semana: row.dia_semana, hora_inicio: row.hora_inicio, hora_fim: row.hora_fim, ativo: row.ativo }).select().single()
      if (error) { update(row.dia_semana, 'saving', false); update(row.dia_semana, 'error', 'Erro ao salvar. Tente novamente.'); return }
      if (data) update(row.dia_semana, 'dbId', (data as HorarioComercial).id)
    }
    update(row.dia_semana, 'saving', false)
    update(row.dia_semana, 'saved', true)
    setTimeout(() => update(row.dia_semana, 'saved', false), 2000)
  }

  const timeInput: React.CSSProperties = {
    padding: '7px 10px', borderRadius: 8, border: '1px solid #DCE6EA', fontSize: 13.5,
    fontFamily: "'Plus Jakarta Sans', sans-serif", color: '#16232B', outline: 'none', background: '#fff',
  }

  return (
    <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #DCE6EA', overflow: 'hidden' }}>
      <div style={{ padding: '18px 24px', borderBottom: '1px solid #EDF2F4' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#16232B' }}>Horários de Funcionamento</div>
        <div style={{ fontSize: 12.5, color: '#6B818C', marginTop: 4 }}>Esses horários são usados no Dashboard para calcular contatos dentro e fora do horário comercial.</div>
      </div>
      {rows.map((row, idx) => (
        <React.Fragment key={row.dia_semana}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 24px', borderBottom: (idx < 6 && !row.error) ? '1px solid #EDF2F4' : 'none', flexWrap: 'wrap', background: row.ativo ? '#fff' : '#F7FAFB', transition: 'background 0.15s' }}>
            {/* Toggle */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 160 }}>
              <button onClick={() => update(row.dia_semana, 'ativo', !row.ativo)}
                style={{ width: 40, height: 22, borderRadius: 11, background: row.ativo ? '#1E6E8C' : '#DCE6EA', border: 'none', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                <div style={{ width: 16, height: 16, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: row.ativo ? 21 : 3, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
              </button>
              <span style={{ fontSize: 13.5, fontWeight: 600, color: row.ativo ? '#16232B' : '#6B818C' }}>{DAY_NAMES[row.dia_semana]}</span>
            </div>

            {/* Time inputs */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
              <input type="time" value={row.hora_inicio} disabled={!row.ativo}
                onChange={(e) => update(row.dia_semana, 'hora_inicio', e.target.value)}
                style={{ ...timeInput, opacity: row.ativo ? 1 : 0.4, cursor: row.ativo ? 'pointer' : 'not-allowed' }}
                onFocus={(e) => row.ativo && (e.target.style.borderColor = '#1E6E8C')}
                onBlur={(e) => (e.target.style.borderColor = '#DCE6EA')} />
              <span style={{ color: '#6B818C', fontSize: 13 }}>até</span>
              <input type="time" value={row.hora_fim} disabled={!row.ativo}
                onChange={(e) => update(row.dia_semana, 'hora_fim', e.target.value)}
                style={{ ...timeInput, opacity: row.ativo ? 1 : 0.4, cursor: row.ativo ? 'pointer' : 'not-allowed' }}
                onFocus={(e) => row.ativo && (e.target.style.borderColor = '#1E6E8C')}
                onBlur={(e) => (e.target.style.borderColor = '#DCE6EA')} />
            </div>

            {/* Save button */}
            <SaveButton onClick={() => handleSave(row)} saving={row.saving} saved={row.saved} />
          </div>
          {row.error && (
            <div style={{ padding: '4px 24px 12px', fontSize: 12.5, color: '#DC2626', borderBottom: idx < 6 ? '1px solid #EDF2F4' : 'none' }}>{row.error}</div>
          )}
        </React.Fragment>
      ))}
    </div>
  )
}

/* ──────────────────────────────────────────────
   ABA PROCEDIMENTOS
────────────────────────────────────────────── */
interface ProcedimentoRowState {
  data: ServicoClinica
  expanded: boolean
  editing: boolean
  editNome: string
  editDescricao: string
  saving: boolean
  saved: boolean
}

function TabProcedimentos() {
  const [items, setItems] = useState<ProcedimentoRowState[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [newNome, setNewNome] = useState('')
  const [newDescricao, setNewDescricao] = useState('')
  const [savingNew, setSavingNew] = useState(false)
  const [newError, setNewError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<ProcedimentoRowState | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    supabase.from('servicos_clinica').select('*').order('created_at').then(({ data }) => {
      setItems((data ?? []).map((d) => ({ data: d as ServicoClinica, expanded: false, editing: false, editNome: d.nome, editDescricao: d.descricao, saving: false, saved: false })))
      setLoading(false)
    })
  }, [])

  const updateItem = (id: string, patch: Partial<ProcedimentoRowState>) =>
    setItems((prev) => prev.map((item) => item.data.id === id ? { ...item, ...patch } : item))

  const [toggleError, setToggleError] = useState<string | null>(null)
  const [editError, setEditError] = useState<Record<string, string>>({})
  const [deleteError, setDeleteError] = useState('')

  const handleToggleAtivo = async (item: ProcedimentoRowState) => {
    const newAtivo = !item.data.ativo
    setToggleError(null)
    updateItem(item.data.id, { data: { ...item.data, ativo: newAtivo } })
    const { error } = await supabase.from('servicos_clinica').update({ ativo: newAtivo }).eq('id', item.data.id)
    if (error) {
      updateItem(item.data.id, { data: { ...item.data, ativo: item.data.ativo } })
      setToggleError('Erro ao atualizar status. Tente novamente.')
    }
  }

  const handleSaveEdit = async (item: ProcedimentoRowState) => {
    if (!item.editNome.trim() || !item.editDescricao.trim()) return
    updateItem(item.data.id, { saving: true })
    setEditError((prev) => ({ ...prev, [item.data.id]: '' }))
    const { error } = await supabase.from('servicos_clinica').update({ nome: item.editNome.trim(), descricao: item.editDescricao.trim() }).eq('id', item.data.id)
    if (error) {
      updateItem(item.data.id, { saving: false })
      setEditError((prev) => ({ ...prev, [item.data.id]: 'Erro ao salvar. Tente novamente.' }))
      return
    }
    updateItem(item.data.id, { saving: false, saved: true, editing: false, data: { ...item.data, nome: item.editNome.trim(), descricao: item.editDescricao.trim() } })
    setTimeout(() => updateItem(item.data.id, { saved: false }), 2000)
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    setDeleteError('')
    const { error } = await supabase.from('servicos_clinica').delete().eq('id', deleteTarget.data.id)
    if (error) { setDeleting(false); setDeleteError('Erro ao excluir. Tente novamente.'); return }
    setItems((prev) => prev.filter((i) => i.data.id !== deleteTarget.data.id))
    setDeleting(false)
    setDeleteTarget(null)
  }

  const handleAddNew = async () => {
    if (!newNome.trim()) { setNewError('O nome é obrigatório.'); return }
    if (!newDescricao.trim()) { setNewError('A descrição é obrigatória.'); return }
    setSavingNew(true); setNewError('')
    const { data, error } = await supabase.from('servicos_clinica').insert({ nome: newNome.trim(), descricao: newDescricao.trim(), ativo: true }).select().single()
    setSavingNew(false)
    if (error) { setNewError('Erro ao salvar.'); return }
    setItems((prev) => [...prev, { data: data as ServicoClinica, expanded: false, editing: false, editNome: (data as ServicoClinica).nome, editDescricao: (data as ServicoClinica).descricao, saving: false, saved: false, confirmDelete: false }])
    setNewNome(''); setNewDescricao(''); setShowNew(false)
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid #DCE6EA',
    fontSize: 13.5, fontFamily: "'Plus Jakarta Sans', sans-serif", color: '#16232B',
    outline: 'none', background: '#fff', boxSizing: 'border-box',
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#6B818C' }}>Carregando...</div>

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <span style={{ fontSize: 13, color: '#6B818C' }}>{items.length} procedimento{items.length !== 1 ? 's' : ''} cadastrado{items.length !== 1 ? 's' : ''}</span>
        <button onClick={() => setShowNew((s) => !s)}
          style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 16px', borderRadius: 9, border: 'none', background: '#1E6E8C', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#fff', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
          {showNew ? <X size={14} /> : <Plus size={14} />} {showNew ? 'Cancelar' : 'Novo Procedimento'}
        </button>
      </div>

      {/* New form */}
      {showNew && (
        <div style={{ background: '#fff', borderRadius: 14, border: '2px solid #1E6E8C', padding: '20px 22px', marginBottom: 12 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: '#1E6E8C', marginBottom: 14 }}>Novo Procedimento</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: '#16232B', display: 'block', marginBottom: 6 }}>Nome *</label>
              <input value={newNome} onChange={(e) => setNewNome(e.target.value)} placeholder="Nome do procedimento" style={inputStyle}
                onFocus={(e) => (e.target.style.borderColor = '#1E6E8C')} onBlur={(e) => (e.target.style.borderColor = '#DCE6EA')} />
            </div>
            <div>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: '#16232B', display: 'block', marginBottom: 6 }}>Descrição *</label>
              <textarea value={newDescricao} onChange={(e) => setNewDescricao(e.target.value)} rows={3} placeholder="Descrição detalhada do procedimento..." style={{ ...inputStyle, resize: 'vertical' }}
                onFocus={(e) => (e.target.style.borderColor = '#1E6E8C')} onBlur={(e) => (e.target.style.borderColor = '#DCE6EA')} />
            </div>
          </div>
          {newError && <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#DC2626', marginTop: 10 }}>{newError}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button onClick={() => { setShowNew(false); setNewNome(''); setNewDescricao(''); setNewError('') }}
              style={{ padding: '8px 16px', borderRadius: 9, border: '1px solid #DCE6EA', background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#6B818C', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Cancelar</button>
            <button onClick={handleAddNew} disabled={savingNew}
              style={{ padding: '8px 20px', borderRadius: 9, border: 'none', background: savingNew ? '#4C90A8' : '#1E6E8C', cursor: savingNew ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600, color: '#fff', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
              {savingNew ? 'Salvando...' : 'Adicionar'}
            </button>
          </div>
        </div>
      )}

      {toggleError && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '8px 12px', fontSize: 12.5, color: '#DC2626', marginBottom: 10 }}>{toggleError}</div>
      )}

      {/* List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map((item) => (
          <div key={item.data.id} style={{ background: '#fff', borderRadius: 12, border: '1px solid #DCE6EA', overflow: 'hidden', opacity: item.data.ativo ? 1 : 0.65, transition: 'opacity 0.2s' }}>

            {/* Row header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', flexWrap: 'wrap' }}>
              {/* Toggle */}
              <button onClick={() => handleToggleAtivo(item)}
                style={{ width: 36, height: 20, borderRadius: 10, background: item.data.ativo ? '#1E6E8C' : '#DCE6EA', border: 'none', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                <div style={{ width: 14, height: 14, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: item.data.ativo ? 19 : 3, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
              </button>

              <div style={{ flex: 1, minWidth: 0 }}>
                {item.editing ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <input value={item.editNome} onChange={(e) => updateItem(item.data.id, { editNome: e.target.value })}
                      style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid #1E6E8C', fontSize: 13.5, fontFamily: "'Plus Jakarta Sans', sans-serif", color: '#16232B', outline: 'none', width: '100%', boxSizing: 'border-box' }} />
                    <textarea value={item.editDescricao} onChange={(e) => updateItem(item.data.id, { editDescricao: e.target.value })} rows={2}
                      style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid #1E6E8C', fontSize: 13, fontFamily: "'Plus Jakarta Sans', sans-serif", color: '#16232B', outline: 'none', resize: 'vertical', width: '100%', boxSizing: 'border-box' }} />
                    {editError[item.data.id] && (
                      <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '6px 10px', fontSize: 12.5, color: '#DC2626' }}>{editError[item.data.id]}</div>
                    )}
                  </div>
                ) : (
                  <>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: '#16232B' }}>{item.data.nome}</div>
                    <div style={{ fontSize: 12.5, color: '#6B818C', marginTop: 3, overflow: 'hidden', display: item.expanded ? 'block' : '-webkit-box', WebkitLineClamp: item.expanded ? undefined : 2, WebkitBoxOrient: 'vertical' as any }}>
                      {item.data.descricao}
                    </div>
                    {item.data.descricao.length > 100 && (
                      <button onClick={() => updateItem(item.data.id, { expanded: !item.expanded })}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#1E6E8C', fontWeight: 600, padding: '2px 0', display: 'flex', alignItems: 'center', gap: 3, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                        {item.expanded ? <><ChevronUp size={12} /> Ver menos</> : <><ChevronDown size={12} /> Ver mais</>}
                      </button>
                    )}
                  </>
                )}
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                {item.editing ? (
                  <>
                    <button onClick={() => updateItem(item.data.id, { editing: false, editNome: item.data.nome, editDescricao: item.data.descricao })}
                      style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #DCE6EA', background: '#fff', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: '#6B818C', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                      Cancelar
                    </button>
                    <button onClick={() => handleSaveEdit(item)} disabled={item.saving}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px', borderRadius: 8, border: 'none', background: item.saved ? '#1A7A48' : '#1E6E8C', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: '#fff', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                      {item.saved ? <Check size={13} /> : <Save size={13} />} {item.saving ? 'Salvando...' : item.saved ? 'Salvo!' : 'Salvar'}
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={() => updateItem(item.data.id, { editing: true })}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 8, border: '1px solid #DCE6EA', background: '#fff', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: '#16232B', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                      <Pencil size={13} /> Editar
                    </button>
                    <button onClick={() => setDeleteTarget(item)}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 8, border: '1px solid #FECACA', background: '#FEF2F2', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: '#DC2626', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                      <Trash2 size={13} /> Excluir
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {deleteTarget && (
        <ConfirmDeleteModal
          itemName={deleteTarget.data.nome}
          onConfirm={handleDelete}
          onClose={() => { setDeleteTarget(null); setDeleteError('') }}
          loading={deleting}
          error={deleteError}
        />
      )}
    </div>
  )
}

/* ──────────────────────────────────────────────
   Main Page
────────────────────────────────────────────── */
export default function Configuracoes() {
  const [activeTab, setActiveTab] = useState<TabKey>('perfil')
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserId(user.id)
    })
  }, [])

  return (
    <div style={{ padding: '32px 36px', maxWidth: 900, margin: '0 auto' }}>

      {/* Page header */}
      <div className="fade-in-1" style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#16232B', margin: 0 }}>Configurações</h1>
        <p style={{ fontSize: 13, color: '#6B818C', marginTop: 4 }}>Gerencie o perfil, horários e procedimentos da clínica.</p>
      </div>

      {/* Tabs */}
      <div className="fade-in-2" style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid #DCE6EA' }}>
        {TABS.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setActiveTab(key)}
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 18px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13.5, fontWeight: activeTab === key ? 700 : 500, color: activeTab === key ? '#1E6E8C' : '#6B818C', borderBottom: activeTab === key ? '2px solid #1E6E8C' : '2px solid transparent', fontFamily: "'Plus Jakarta Sans', sans-serif", transition: 'color 0.15s', marginBottom: -1 }}>
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="fade-in-3">
        {activeTab === 'perfil' && userId && <TabPerfil userId={userId} />}
        {activeTab === 'horarios' && <TabHorarios />}
        {activeTab === 'procedimentos' && <TabProcedimentos />}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
