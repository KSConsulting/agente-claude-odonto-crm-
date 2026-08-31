import React, { useEffect, useState } from 'react'
import { Plus, X, Check, Copy, Ban, KeyRound } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { ApiToken } from '../types'
import { ENDPOINTS, BASE_API, gerarToken, hashToken, prefixoDe, montarCurl } from '../lib/apiTokens'
import ConfirmDeleteModal from '../components/ConfirmDeleteModal'

/**
 * Aba "Token e API" de Configurações: as chaves de acesso do Agente de IA e a
 * documentação dos endpoints, com os cURLs prontos para o nó HTTP do n8n.
 *
 * As duas coisas moram juntas porque são a mesma tarefa: quem vem aqui vem
 * ligar o agente na agenda, e precisa do token e do cURL na mesma tela.
 *
 * O QUE GOVERNA ESTA TELA: **o valor do token só existe uma vez.** O banco
 * guarda o SHA-256; nem o sistema consegue reconstruí-lo. Por isso ele aparece
 * inteiro no instante da criação, junto dos sete cURLs já preenchidos — depois
 * disso, a documentação só consegue oferecer `SEU_TOKEN_AQUI`.
 */

const FONTE = "'Plus Jakarta Sans', sans-serif"
const MONO = "ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace"

const caixaStyle: React.CSSProperties = {
  background: '#fff', borderRadius: 12, border: '1px solid #DCE6EA',
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid #DCE6EA',
  fontSize: 13.5, fontFamily: FONTE, color: '#16232B',
  outline: 'none', background: '#fff', boxSizing: 'border-box',
}

const erroStyle: React.CSSProperties = {
  background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8,
  padding: '8px 12px', fontSize: 12.5, color: '#DC2626',
}

const rotuloStyle: React.CSSProperties = {
  fontSize: 12.5, fontWeight: 600, color: '#16232B', display: 'block', marginBottom: 6,
}

function formatarData(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export default function TokenApi() {
  const [tokens, setTokens] = useState<ApiToken[]>([])
  const [criadores, setCriadores] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')

  const [showNew, setShowNew] = useState(false)
  const [novoNome, setNovoNome] = useState('')
  const [criando, setCriando] = useState(false)
  const [erroNovo, setErroNovo] = useState('')

  /* Tokens criados nesta sessão. Some ao sair da página, e é isso mesmo: é o
     único intervalo em que o valor em claro existe em algum lugar. Enquanto
     dura, a documentação consegue preencher os cURLs de verdade. */
  const [emMemoria, setEmMemoria] = useState<Record<string, string>>({})
  const [recemCriado, setRecemCriado] = useState<ApiToken | null>(null)

  const [alvoRevogar, setAlvoRevogar] = useState<ApiToken | null>(null)
  const [revogando, setRevogando] = useState(false)
  const [erroRevogar, setErroRevogar] = useState('')

  const [selecionado, setSelecionado] = useState('')
  const [copiado, setCopiado] = useState('')

  useEffect(() => {
    let vivo = true
    Promise.all([
      supabase.from('api_tokens').select('*').order('created_at', { ascending: false }),
      supabase.from('usuarios').select('id, nome'),
    ]).then(([resTokens, resUsuarios]) => {
      if (!vivo) return
      if (resTokens.error) setErro('Não foi possível carregar os tokens.')
      setTokens((resTokens.data ?? []) as ApiToken[])
      const mapa: Record<string, string> = {}
      for (const u of (resUsuarios.data ?? []) as { id: string; nome: string }[]) mapa[u.id] = u.nome
      setCriadores(mapa)
      setLoading(false)
    })
    return () => { vivo = false }
  }, [])

  const criar = async () => {
    const nome = novoNome.trim()
    if (!nome) { setErroNovo('Dê um nome ao token — é como a equipe vai saber qual é qual.'); return }
    setCriando(true)
    setErroNovo('')

    const valor = gerarToken()
    const hash = await hashToken(valor)
    const { data: { user } } = await supabase.auth.getUser()

    const { data, error } = await supabase.from('api_tokens')
      .insert({ nome, prefixo: prefixoDe(valor), hash, criado_por: user?.id ?? null })
      .select().single()

    setCriando(false)
    if (error || !data) { setErroNovo('Não foi possível criar o token. Tente novamente.'); return }

    const criado = data as ApiToken
    setTokens((prev) => [criado, ...prev])
    setEmMemoria((prev) => ({ ...prev, [criado.id]: valor }))
    setRecemCriado(criado)
    setSelecionado(criado.id)
    setNovoNome('')
    setShowNew(false)
  }

  const revogar = async () => {
    if (!alvoRevogar) return
    setRevogando(true)
    setErroRevogar('')
    const agora = new Date().toISOString()
    const { error } = await supabase.from('api_tokens')
      .update({ ativo: false, revogado_em: agora })
      .eq('id', alvoRevogar.id)
    setRevogando(false)
    if (error) { setErroRevogar('Não foi possível revogar. Tente novamente.'); return }

    setTokens((prev) => prev.map((t) => t.id === alvoRevogar.id ? { ...t, ativo: false, revogado_em: agora } : t))
    setEmMemoria((prev) => {
      const copia = { ...prev }
      delete copia[alvoRevogar.id]
      return copia
    })
    if (selecionado === alvoRevogar.id) setSelecionado('')
    if (recemCriado?.id === alvoRevogar.id) setRecemCriado(null)
    setAlvoRevogar(null)
  }

  const copiar = async (texto: string, marca: string) => {
    try {
      await navigator.clipboard.writeText(texto)
      setCopiado(marca)
      setTimeout(() => setCopiado(''), 2000)
    } catch {
      setErro('O navegador bloqueou a cópia. Selecione o texto e copie à mão.')
    }
  }

  const ativos = tokens.filter((t) => t.ativo)
  const valorDoCurl = emMemoria[selecionado] ?? 'SEU_TOKEN_AQUI'
  const escolhido = tokens.find((t) => t.id === selecionado) ?? null

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#6B818C' }}>Carregando...</div>

  return (
    <div style={{ padding: '32px 36px', maxWidth: 900, margin: '0 auto' }}>

      <div className="fade-in-1" style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#16232B', margin: 0 }}>Token e API</h1>
        <p style={{ fontSize: 13, color: '#6B818C', marginTop: 4 }}>As chaves de acesso da agenda para sistemas de fora, e o contrato dos sete endpoints.</p>
      </div>

      {/* ═══════════════ TOKENS ═══════════════ */}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, color: '#6B818C' }}>
          {ativos.length} token{ativos.length !== 1 ? 's' : ''} ativo{ativos.length !== 1 ? 's' : ''}
          {tokens.length > ativos.length && ` · ${tokens.length - ativos.length} revogado${tokens.length - ativos.length !== 1 ? 's' : ''}`}
        </span>
        <button onClick={() => { setShowNew((s) => !s); setErroNovo('') }}
          style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 16px', borderRadius: 9, border: 'none', background: '#1E6E8C', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#fff', fontFamily: FONTE }}>
          {showNew ? <X size={14} /> : <Plus size={14} />} {showNew ? 'Cancelar' : 'Novo Token'}
        </button>
      </div>

      {/* Criar */}
      {showNew && (
        <div style={{ ...caixaStyle, borderRadius: 14, border: '2px solid #1E6E8C', padding: '20px 22px', marginBottom: 12 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: '#1E6E8C', marginBottom: 14 }}>Novo Token</div>
          <label style={rotuloStyle}>Nome *</label>
          <input value={novoNome} onChange={(e) => { setNovoNome(e.target.value); setErroNovo('') }}
            onKeyDown={(e) => { if (e.key === 'Enter') criar() }}
            placeholder="Ex: n8n produção" style={inputStyle}
            onFocus={(e) => (e.target.style.borderColor = '#1E6E8C')}
            onBlur={(e) => (e.target.style.borderColor = '#DCE6EA')} />
          <p style={{ fontSize: 12, color: '#6B818C', margin: '8px 0 0', lineHeight: 1.6 }}>
            O nome é só para a equipe se localizar na lista. O token em si é sorteado aqui
            e <strong style={{ color: '#16232B' }}>aparece uma única vez</strong>, agora na criação.
          </p>
          {erroNovo && <div style={{ ...erroStyle, marginTop: 10 }}>{erroNovo}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button onClick={() => { setShowNew(false); setNovoNome(''); setErroNovo('') }}
              style={{ padding: '8px 16px', borderRadius: 9, border: '1px solid #DCE6EA', background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#6B818C', fontFamily: FONTE }}>Cancelar</button>
            <button onClick={criar} disabled={criando}
              style={{ padding: '8px 20px', borderRadius: 9, border: 'none', background: criando ? '#4C90A8' : '#1E6E8C', cursor: criando ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600, color: '#fff', fontFamily: FONTE }}>
              {criando ? 'Criando...' : 'Criar Token'}
            </button>
          </div>
        </div>
      )}

      {/* Token recém-criado — a única vez que o valor aparece */}
      {recemCriado && emMemoria[recemCriado.id] && (
        <div style={{ background: '#fff', borderRadius: 14, border: '2px solid #1A7A48', padding: '20px 22px', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: '#E8F8EF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <KeyRound size={16} color="#1A7A48" />
              </div>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: '#1A7A48' }}>
                Token "{recemCriado.nome}" criado
              </span>
            </div>
            <button onClick={() => setRecemCriado(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 6, flexShrink: 0 }}>
              <X size={17} color="#6B818C" />
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#F7FAFB', border: '1px solid #DCE6EA', borderRadius: 9, padding: '11px 13px', flexWrap: 'wrap' }}>
            <code style={{ flex: 1, minWidth: 220, fontFamily: MONO, fontSize: 12.5, color: '#16232B', wordBreak: 'break-all' }}>
              {emMemoria[recemCriado.id]}
            </code>
            <button onClick={() => copiar(emMemoria[recemCriado.id], 'valor')}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 13px', borderRadius: 8, border: 'none', background: copiado === 'valor' ? '#1A7A48' : '#1E6E8C', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: '#fff', fontFamily: FONTE, flexShrink: 0 }}>
              {copiado === 'valor' ? <><Check size={13} /> Copiado</> : <><Copy size={13} /> Copiar</>}
            </button>
          </div>

          <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: '9px 12px', fontSize: 12.5, color: '#92400E', marginTop: 11, lineHeight: 1.6 }}>
            <strong>Guarde agora.</strong> O banco só tem o hash — quando você sair desta página,
            nem o sistema consegue mostrar esse valor de novo. Quem perde o token não recupera:
            revoga e cria outro.
          </div>

          <p style={{ fontSize: 12.5, color: '#6B818C', margin: '11px 0 0', lineHeight: 1.6 }}>
            Os sete cURLs da documentação, aqui embaixo, já estão preenchidos com ele.
          </p>
        </div>
      )}

      {erro && <div style={{ ...erroStyle, marginBottom: 10 }}>{erro}</div>}

      {/* Lista */}
      {tokens.length === 0 ? (
        <div style={{ ...caixaStyle, padding: '30px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: '#16232B' }}>Nenhum token criado</div>
          <p style={{ fontSize: 12.5, color: '#6B818C', margin: '6px 0 0', lineHeight: 1.6 }}>
            Sem token, a API responde 401 para qualquer chamada — inclusive as do n8n.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {tokens.map((t) => (
            <div key={t.id} style={{ ...caixaStyle, padding: '14px 18px', opacity: t.ativo ? 1 : 0.65 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13.5, fontWeight: 700, color: '#16232B' }}>{t.nome}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, color: t.ativo ? '#1A7A48' : '#DC2626', background: t.ativo ? '#E8F8EF' : '#FEF2F2' }}>
                      {t.ativo ? 'Ativo' : 'Revogado'}
                    </span>
                    <code style={{ fontFamily: MONO, fontSize: 12, color: '#6B818C' }}>{t.prefixo}…</code>
                  </div>
                  <div style={{ fontSize: 12, color: '#6B818C', marginTop: 5, lineHeight: 1.7 }}>
                    Último acesso: {t.ultimo_acesso ? formatarData(t.ultimo_acesso) : 'nunca usado'}
                    {' · '}Criado em {formatarData(t.created_at)}
                    {t.criado_por && criadores[t.criado_por] ? ` por ${criadores[t.criado_por]}` : ''}
                    {!t.ativo && t.revogado_em ? ` · Revogado em ${formatarData(t.revogado_em)}` : ''}
                  </div>
                </div>
                {t.ativo && (
                  <button onClick={() => setAlvoRevogar(t)}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 8, border: '1px solid #FECACA', background: '#FEF2F2', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: '#DC2626', fontFamily: FONTE, flexShrink: 0 }}>
                    <Ban size={13} /> Revogar
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ═══════════════ DOCUMENTAÇÃO ═══════════════ */}

      <div style={{ marginTop: 34, paddingTop: 26, borderTop: '1px solid #DCE6EA' }}>
        <h2 style={{ fontSize: 16, fontWeight: 800, color: '#16232B', margin: 0 }}>Documentação da API</h2>
        <p style={{ fontSize: 13, color: '#6B818C', margin: '5px 0 18px', lineHeight: 1.6 }}>
          Os sete endpoints que o Agente de IA usa para ver disponibilidade, marcar, consultar,
          cancelar e remarcar. Cada cURL é para colar no <strong style={{ color: '#16232B' }}>Import
          cURL</strong> do nó HTTP do n8n, que monta o nó sozinho.
        </p>

        {/* Como funciona */}
        <div style={{ ...caixaStyle, padding: '16px 18px', marginBottom: 14 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: '#16232B', marginBottom: 9 }}>Endereço e autenticação</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#F7FAFB', border: '1px solid #DCE6EA', borderRadius: 8, padding: '9px 12px', flexWrap: 'wrap' }}>
            <code style={{ flex: 1, minWidth: 200, fontFamily: MONO, fontSize: 12, color: '#16232B', wordBreak: 'break-all' }}>{BASE_API}</code>
            <button onClick={() => copiar(BASE_API, 'base')}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 11px', borderRadius: 7, border: '1px solid #DCE6EA', background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: copiado === 'base' ? '#1A7A48' : '#16232B', fontFamily: FONTE, flexShrink: 0 }}>
              {copiado === 'base' ? <><Check size={12} /> Copiado</> : <><Copy size={12} /> Copiar</>}
            </button>
          </div>
          <ul style={{ fontSize: 12.5, color: '#6B818C', lineHeight: 1.75, margin: '11px 0 0', paddingLeft: 18 }}>
            <li>A autenticação é o cabeçalho <code style={{ fontFamily: MONO, fontSize: 11.5, color: '#16232B' }}>X-Api-Key</code>, com um token desta página — nunca a chave do Supabase.</li>
            <li><strong style={{ color: '#16232B' }}>Recusa de negócio volta com HTTP 200</strong> e <code style={{ fontFamily: MONO, fontSize: 11.5, color: '#16232B' }}>ok: false</code>. "Horário ocupado" é resposta, não erro — com 4xx o nó do n8n quebraria o fluxo justamente na hora de dar a notícia.</li>
            <li><strong style={{ color: '#16232B' }}>Toda resposta traz uma frase pronta</strong> no campo <code style={{ fontFamily: MONO, fontSize: 11.5, color: '#16232B' }}>mensagem</code>, para o agente falar com o paciente. Os campos de data saem em UTC; a frase já vem no fuso da clínica.</li>
          </ul>
        </div>

        {/* Seletor de token */}
        <div style={{ ...caixaStyle, padding: '16px 18px', marginBottom: 14 }}>
          <label style={rotuloStyle}>Preencher os cURLs com o token</label>
          <select value={selecionado} onChange={(e) => setSelecionado(e.target.value)}
            style={{ ...inputStyle, cursor: 'pointer' }}>
            <option value="">— sem token, usar SEU_TOKEN_AQUI —</option>
            {ativos.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nome} ({t.prefixo}…){emMemoria[t.id] ? ' — criado agora' : ''}
              </option>
            ))}
          </select>

          {escolhido && !emMemoria[escolhido.id] && (
            <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: '9px 12px', fontSize: 12.5, color: '#92400E', marginTop: 10, lineHeight: 1.6 }}>
              O valor de <strong>{escolhido.nome}</strong> não fica guardado em lugar nenhum — só o
              hash. Os cURLs abaixo saem com <code style={{ fontFamily: MONO, fontSize: 11.5 }}>SEU_TOKEN_AQUI</code>;
              troque à mão pelo valor que você anotou na criação. Se ele se perdeu, o caminho é
              revogar e criar outro.
            </div>
          )}
          {escolhido && emMemoria[escolhido.id] && (
            <div style={{ background: '#E8F8EF', border: '1px solid #A7E3C3', borderRadius: 8, padding: '9px 12px', fontSize: 12.5, color: '#14532D', marginTop: 10, lineHeight: 1.6 }}>
              Os cURLs abaixo estão com o valor real de <strong>{escolhido.nome}</strong>, porque ele
              foi criado nesta sessão. Ao sair da página, voltam a mostrar o marcador.
            </div>
          )}
        </div>

        {/* Endpoints */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {ENDPOINTS.map((ep) => {
            const curl = montarCurl(ep, valorDoCurl)
            return (
              <div key={ep.rota} style={{ ...caixaStyle, padding: '16px 18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6, color: '#fff', background: ep.metodo === 'GET' ? '#1A7A48' : '#1E6E8C', fontFamily: MONO }}>
                    {ep.metodo}
                  </span>
                  <code style={{ fontFamily: MONO, fontSize: 12.5, fontWeight: 700, color: '#16232B' }}>/{ep.rota}</code>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#16232B' }}>· {ep.titulo}</span>
                </div>

                <p style={{ fontSize: 12.5, color: '#6B818C', margin: '8px 0 0', lineHeight: 1.65 }}>{ep.resumo}</p>

                <div style={{ fontSize: 12, color: '#6B818C', marginTop: 8, lineHeight: 1.7 }}>
                  <strong style={{ color: '#16232B' }}>Precisa:</strong> {ep.precisa}
                  <br />
                  <strong style={{ color: '#16232B' }}>Opcionais:</strong> {ep.opcionais}
                </div>

                <div style={{ position: 'relative', marginTop: 11 }}>
                  <pre style={{ background: '#F7FAFB', border: '1px solid #DCE6EA', borderRadius: 9, padding: '12px 13px', margin: 0, overflowX: 'auto', fontFamily: MONO, fontSize: 11.5, lineHeight: 1.7, color: '#16232B' }}>
                    {curl}
                  </pre>
                  <button onClick={() => copiar(curl, ep.rota)}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 11px', borderRadius: 7, border: '1px solid #DCE6EA', background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: copiado === ep.rota ? '#1A7A48' : '#16232B', fontFamily: FONTE, position: 'absolute', top: 8, right: 8 }}>
                    {copiado === ep.rota ? <><Check size={12} /> Copiado</> : <><Copy size={12} /> Copiar</>}
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        <p style={{ fontSize: 12, color: '#6B818C', margin: '16px 0 0', lineHeight: 1.7 }}>
          O contrato completo — todas as respostas, cada motivo de recusa e as frases que o agente
          fala — está em <code style={{ fontFamily: MONO, fontSize: 11.5, color: '#16232B' }}>API_AGENTE.md</code>, no repositório.
        </p>
      </div>

      {alvoRevogar && (
        <ConfirmDeleteModal
          itemName={alvoRevogar.nome}
          title="Revogar token"
          message={
            <>
              Revogar <strong style={{ color: '#16232B' }}>"{alvoRevogar.nome}"</strong>? A próxima
              chamada feita com ele já responde 401 — se for o token do n8n, o agente para de
              agendar na hora. O registro fica na lista, para o histórico de acesso não sumir.
            </>
          }
          confirmLabel="Revogar"
          loadingLabel="Revogando..."
          onConfirm={revogar}
          onClose={() => { setAlvoRevogar(null); setErroRevogar('') }}
          loading={revogando}
          error={erroRevogar}
        />
      )}
    </div>
  )
}
