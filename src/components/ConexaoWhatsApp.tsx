import React, { useState } from 'react'
import { Smartphone, RefreshCw, LogOut, ServerCrash, Check } from 'lucide-react'
import CampoTelefone from './CampoTelefone'
import ConfirmDeleteModal from './ConfirmDeleteModal'
import { conectar, desconectar, nomeDoProvedor, type Conexao } from '../lib/whatsappConexao'
import { formatarParaExibicao } from '../lib/telefones'
import { AGENTE_NOME } from '../lib/agente'

/**
 * A seção "Conexão do WhatsApp", na página Secretária de IA.
 *
 * **Seção, e não aba.** A página é uma pilha de cards — Modo teste, Modelo de
 * IA, prompt — e tudo ali é sobre um assunto só: a secretária. Aba serve para
 * separar temas diferentes, que é o caso de Configurações (Perfil, Clínica,
 * Horários). Aqui, aba esconderia justamente o que não pode ficar escondido.
 *
 * **O nome do fornecedor é dado, não é título.** A seção se chama "Conexão do
 * WhatsApp" porque é isso que ela é para quem usa, e o rótulo continua certo no
 * dia em que o fornecedor mudar. Mas o provedor aparece dentro dela, e precisa
 * aparecer: quando cai, é ele que diz em qual painel ir olhar.
 */

const FONTE = "'Plus Jakarta Sans', sans-serif"
const MONO = "ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace"

/** Cada estado com sua cor, sua frase e — o que mais importa — sua saída. */
const VISUAL: Record<string, { cor: string; fundo: string; borda: string; rotulo: string }> = {
  verificando: { cor: '#6B818C', fundo: '#F2F6F7', borda: '#DCE6EA', rotulo: 'Verificando...' },
  conectado: { cor: '#1A7A48', fundo: '#E8F8EF', borda: '#B7E7CB', rotulo: 'Conectado' },
  conectando: { cor: '#D97706', fundo: '#FFFBEB', borda: '#FDE68A', rotulo: 'Conectando...' },
  desconectado: { cor: '#DC2626', fundo: '#FEF2F2', borda: '#FECACA', rotulo: 'Desconectado' },
  indisponivel: { cor: '#DC2626', fundo: '#FEF2F2', borda: '#FECACA', rotulo: 'Servidor fora do ar' },
  nao_implementado: { cor: '#6B818C', fundo: '#F2F6F7', borda: '#DCE6EA', rotulo: 'Ainda sem suporte' },
}

/**
 * `pronto: false` fica visível e desabilitado de propósito. Some da lista seria
 * esconder para onde o sistema está indo; selecionável seria prometer o que
 * ainda não existe.
 */
const PROVEDORES: { valor: string; pronto: boolean }[] = [
  { valor: 'evolution', pronto: true },
  { valor: 'uazapi', pronto: false },
]

const botaoBase: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, borderRadius: 9,
  fontSize: 12.5, fontWeight: 700, fontFamily: FONTE, padding: '8px 13px',
}

interface Props {
  conexao: Conexao | null
  recarregar: () => void
  provedor: string
  /** Troca o provedor ativo. Grava na hora — não passa por "Salvar". */
  onTrocarProvedor: (novo: string) => Promise<void>
}

export default function ConexaoWhatsApp({ conexao, recarregar, provedor, onTrocarProvedor }: Props) {
  const [numero, setNumero] = useState('')
  const [valido, setValido] = useState(false)
  const [pareando, setPareando] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [codigo, setCodigo] = useState<string | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const [confirmando, setConfirmando] = useState(false)
  const [erro, setErro] = useState('')

  const estado = conexao?.estado ?? 'verificando'
  const v = VISUAL[estado] ?? VISUAL.verificando
  const foraDoAr = estado === 'indisponivel'

  async function gerarPareamento() {
    setOcupado(true)
    setErro('')
    setCodigo(null)
    setQr(null)
    try {
      const r = await conectar(valido ? numero : undefined)
      setCodigo(r.codigo)
      setQr(r.qr)
      if (!r.codigo && !r.qr) setErro('A ponte respondeu, mas não devolveu código nem QR.')
    } catch {
      setErro('Não consegui abrir o pareamento. O servidor pode estar fora do ar.')
    }
    setOcupado(false)
    recarregar()
  }

  async function confirmarDesconexao() {
    setOcupado(true)
    setErro('')
    try {
      await desconectar()
      setConfirmando(false)
      setPareando(false)
      setCodigo(null)
      setQr(null)
    } catch {
      setErro('Não consegui desconectar.')
      setConfirmando(false)
    }
    setOcupado(false)
    recarregar()
  }

  /** A frase embaixo do estado. Cada uma aponta para uma saída diferente. */
  function explicacao(): string {
    if (estado === 'conectado' && conexao) {
      const partes = [conexao.perfil, conexao.numero ? formatarParaExibicao(conexao.numero) : null]
      return partes.filter(Boolean).join(' · ') || 'Sessão ativa'
    }
    if (foraDoAr) {
      return `O servidor da ${nomeDoProvedor(provedor)} não respondeu. Botão daqui não resolve — quem precisa subir é ele.`
    }
    if (estado === 'desconectado') {
      return 'A ponte está de pé, mas a sessão do WhatsApp caiu. Dá para religar aqui mesmo.'
    }
    if (estado === 'nao_implementado') {
      return `A ${nomeDoProvedor(provedor)} ainda não está implementada neste sistema.`
    }
    return 'Consultando o servidor...'
  }

  return (
    <div style={{
      background: '#fff', border: '1px solid #DCE6EA', borderRadius: 14,
      padding: '20px 22px', marginBottom: 18, fontFamily: FONTE,
    }}>

      <div style={{ fontSize: 15, fontWeight: 700, color: '#16232B' }}>Conexão do WhatsApp</div>
      <p style={{ fontSize: 12.5, color: '#6B818C', lineHeight: 1.6, margin: '4px 0 16px' }}>
        A ponte entre o WhatsApp da clínica e o sistema. Sem ela, nada chega na {AGENTE_NOME} —
        nem para ela responder, nem para a equipe ver.
      </p>

      {/* ---------------- Provedor ---------------- */}
      <label style={{ fontSize: 12, fontWeight: 700, color: '#16232B', display: 'block', marginBottom: 6 }}>
        Provedor
      </label>
      <select
        value={provedor}
        onChange={(e) => { void onTrocarProvedor(e.target.value) }}
        style={{
          padding: '9px 12px', borderRadius: 9, border: '1px solid #DCE6EA',
          fontSize: 13.5, fontFamily: FONTE, color: '#16232B',
          background: '#fff', outline: 'none', minWidth: 220,
        }}>
        {PROVEDORES.map((p) => (
          <option key={p.valor} value={p.valor} disabled={!p.pronto}>
            {nomeDoProvedor(p.valor)}{p.pronto ? '' : ' (em breve)'}
          </option>
        ))}
      </select>
      <p style={{ fontSize: 11.5, color: '#6B818C', margin: '6px 0 16px' }}>
        Um provedor por vez. As chaves de acesso ficam no servidor, nunca nesta tela.
      </p>

      {/* ---------------- Estado ---------------- */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        background: v.fundo, border: `1px solid ${v.borda}`, borderRadius: 11,
        padding: '12px 14px',
      }}>
        {foraDoAr
          ? <ServerCrash size={18} color={v.cor} style={{ flexShrink: 0 }} />
          : <Smartphone size={18} color={v.cor} style={{ flexShrink: 0 }} />}

        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: v.cor }}>{v.rotulo}</div>
          <div style={{ fontSize: 12, color: '#6B818C', marginTop: 2, lineHeight: 1.5 }}>
            {explicacao()}
          </div>
        </div>

        <button
          onClick={recarregar}
          title="Verificar agora"
          style={{
            ...botaoBase, padding: '7px 12px', border: '1px solid #DCE6EA',
            background: '#fff', color: '#6B818C', fontWeight: 600, fontSize: 12,
            cursor: 'pointer', flexShrink: 0,
          }}>
          <RefreshCw size={13} /> Verificar
        </button>
      </div>

      {/* ---------------- Ações ---------------- */}
      {estado === 'conectado' && (
        <button
          onClick={() => setConfirmando(true)}
          disabled={ocupado}
          style={{
            ...botaoBase, marginTop: 12, border: '1px solid #FECACA',
            background: '#FEF2F2', color: '#DC2626',
            cursor: ocupado ? 'wait' : 'pointer',
          }}>
          <LogOut size={13} /> Desconectar
        </button>
      )}

      {(estado === 'desconectado' || estado === 'conectando') && !pareando && (
        <button
          onClick={() => setPareando(true)}
          style={{
            ...botaoBase, marginTop: 12, border: 'none',
            background: '#1E6E8C', color: '#fff', cursor: 'pointer',
          }}>
          <Smartphone size={13} /> Conectar
        </button>
      )}

      {/* ---------------- Pareamento ---------------- */}
      {pareando && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #EDF2F4' }}>
          <p style={{ fontSize: 12.5, color: '#16232B', lineHeight: 1.6, margin: '0 0 12px' }}>
            Informe o número do WhatsApp da clínica para receber um <strong>código de 8
            dígitos</strong>, que você digita no celular. Sem o número, sai um QR para escanear.
          </p>

          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 240 }}>
              <CampoTelefone
                valor={numero}
                onChange={(canonico, ok) => { setNumero(canonico); setValido(ok) }}
                rotulo="Número da clínica"
                obrigatorio={false}
              />
            </div>
            <button
              onClick={gerarPareamento}
              disabled={ocupado}
              style={{
                ...botaoBase, padding: '9px 14px', border: 'none',
                background: '#1E6E8C', color: '#fff',
                cursor: ocupado ? 'wait' : 'pointer',
              }}>
              {ocupado ? 'Gerando...' : 'Gerar'}
            </button>
          </div>

          {codigo && (
            <div style={{
              marginTop: 14, background: '#EAF3F6', border: '1px solid #C5DDE6',
              borderRadius: 11, padding: '14px 16px', textAlign: 'center',
            }}>
              <div style={{ fontSize: 11.5, color: '#6B818C', marginBottom: 6 }}>
                No celular: WhatsApp → Aparelhos conectados → Conectar com número
              </div>
              <div style={{ fontFamily: MONO, fontSize: 26, fontWeight: 700, color: '#16232B', letterSpacing: 3 }}>
                {codigo}
              </div>
            </div>
          )}

          {!codigo && qr && (
            <div style={{ marginTop: 14, textAlign: 'center' }}>
              <img
                src={qr.startsWith('data:') ? qr : `data:image/png;base64,${qr}`}
                alt="QR code para conectar o WhatsApp"
                style={{ width: 220, height: 220, borderRadius: 11, border: '1px solid #DCE6EA' }}
              />
            </div>
          )}

          <button
            onClick={() => { setPareando(false); setCodigo(null); setQr(null); setErro('') }}
            style={{
              ...botaoBase, marginTop: 12, padding: '7px 12px',
              border: '1px solid #DCE6EA', background: '#fff', color: '#6B818C',
              fontWeight: 600, fontSize: 12, cursor: 'pointer',
            }}>
            Fechar
          </button>
        </div>
      )}

      {estado === 'conectado' && !pareando && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: '#6B818C', marginTop: 10 }}>
          <Check size={12} color="#1A7A48" /> Verificado automaticamente a cada 30 segundos.
        </div>
      )}

      {erro && (
        <div style={{
          marginTop: 12, background: '#FEF2F2', border: '1px solid #FECACA',
          borderRadius: 9, padding: '9px 12px', fontSize: 12.5, color: '#DC2626',
        }}>{erro}</div>
      )}

      {confirmando && (
        <ConfirmDeleteModal
          itemName="a conexão do WhatsApp"
          title="Desconectar o WhatsApp?"
          message={
            <>A {AGENTE_NOME} para de receber e de responder <strong>na hora</strong>, e a equipe
            deixa de ver mensagens novas. Para voltar, é preciso parear o celular de novo.</>
          }
          confirmLabel="Desconectar"
          loadingLabel="Desconectando..."
          loading={ocupado}
          onConfirm={confirmarDesconexao}
          onClose={() => setConfirmando(false)}
        />
      )}
    </div>
  )
}
