import React from 'react'
import { AlertTriangle, X } from 'lucide-react'

/**
 * Confirmação destrutiva. Os textos são opcionais e caem no padrão de exclusão
 * — que é o uso da maioria das telas. Revogar um token entra aqui trocando só
 * as palavras: o gesto é o mesmo, e revogar também não se desfaz.
 */
interface ConfirmDeleteModalProps {
  itemName: string
  onConfirm: () => void
  onClose: () => void
  loading?: boolean
  error?: string
  title?: string
  /** Substitui a frase inteira. Recebe o nome já destacado por conta própria. */
  message?: React.ReactNode
  confirmLabel?: string
  loadingLabel?: string
}

export default function ConfirmDeleteModal({
  itemName, onConfirm, onClose, loading = false, error = '',
  title = 'Confirmar exclusão',
  message,
  confirmLabel = 'Excluir',
  loadingLabel = 'Excluindo...',
}: ConfirmDeleteModalProps) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #DCE6EA', width: '100%', maxWidth: 420, padding: '28px 28px 24px', boxShadow: '0 8px 48px rgba(0,0,0,0.12)' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: '#FEF2F2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <AlertTriangle size={20} color="#DC2626" />
            </div>
            <span style={{ fontSize: 15, fontWeight: 700, color: '#16232B' }}>{title}</span>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 6, flexShrink: 0 }}
          >
            <X size={18} color="#6B818C" />
          </button>
        </div>

        {/* Message */}
        <p style={{ fontSize: 13.5, color: '#6B818C', lineHeight: 1.6, margin: '0 0 22px' }}>
          {message ?? (
            <>
              Tem certeza que deseja excluir{' '}
              <strong style={{ color: '#16232B' }}>"{itemName}"</strong>?{' '}
              Essa ação não pode ser desfeita.
            </>
          )}
        </p>

        {/* Error */}
        {error && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '8px 12px', fontSize: 12.5, color: '#DC2626', marginBottom: 14 }}>{error}</div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onClose}
            disabled={loading}
            style={{ flex: 1, padding: '10px', borderRadius: 9, border: '1px solid #DCE6EA', background: '#fff', cursor: 'pointer', fontSize: 13.5, fontWeight: 600, color: '#6B818C', fontFamily: "'Plus Jakarta Sans', sans-serif" }}
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            style={{ flex: 2, padding: '10px', borderRadius: 9, border: 'none', background: loading ? '#FCA5A5' : '#DC2626', cursor: loading ? 'not-allowed' : 'pointer', fontSize: 13.5, fontWeight: 600, color: '#fff', fontFamily: "'Plus Jakarta Sans', sans-serif", transition: 'background 0.15s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          >
            {loading && (
              <div style={{ width: 15, height: 15, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
            )}
            {loading ? loadingLabel : confirmLabel}
          </button>
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
