import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'

/**
 * A conexão com o WhatsApp: está de pé, quem está conectado, e como religar.
 *
 * ── POR QUE ISTO EXISTE ────────────────────────────────────────────────────
 *
 * Em 01/09 o servidor da ponte com o WhatsApp caiu, e o único sintoma foi
 * **silêncio**: mensagem enviada, nenhuma resposta, e nada de anormal em tela
 * nenhuma. A página da Secretária continuou dizendo "está atendendo", porque
 * ela só conhecia o nosso liga/desliga.
 *
 * Atender depende de duas coisas, e a tela só sabia de uma. Este arquivo é a
 * outra.
 *
 * ── TUDO PASSA PELA EDGE FUNCTION ──────────────────────────────────────────
 *
 * A chave da ponte é de servidor. Falar com ela do navegador exigiria pôr a
 * chave no bundle, e quem tem a chave **manda mensagem por aquele WhatsApp**.
 * Mesmo motivo da `fotoDoPerfil()`, em `conversas.ts`.
 */

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp`

/**
 * `desconectado` e `indisponivel` parecem a mesma coisa e **não são** — cada um
 * manda a pessoa para um lugar diferente:
 *
 * - `desconectado` — a ponte respondeu, mas a sessão do WhatsApp caiu.
 *   Resolve aqui mesmo, reconectando.
 * - `indisponivel` — a ponte não respondeu. Nenhum botão desta tela adianta:
 *   quem precisa subir é o servidor, no painel da hospedagem.
 *
 * Confundir os dois faz a pessoa clicar em "Reconectar" dez vezes enquanto o
 * problema está em outro lugar.
 */
export type EstadoConexao =
  | 'verificando'
  | 'conectado'
  | 'conectando'
  | 'desconectado'
  | 'indisponivel'
  | 'nao_implementado'

export interface Conexao {
  /** Chave do provedor no banco: `evolution` ou `uazapi`. */
  provedor: string
  estado: EstadoConexao
  numero: string | null
  perfil: string | null
  foto: string | null
}

/**
 * O nome de cada ponte **como se escreve na tela**.
 *
 * A seção se chama "Conexão do WhatsApp" — o nome do fornecedor não é título,
 * é dado. Mas ele precisa aparecer: quando cai, é ele que diz em qual painel
 * ir olhar. "WhatsApp desconectado", sozinho, não responde essa pergunta.
 */
export const NOME_PROVEDOR: Record<string, string> = {
  evolution: 'Evolution API',
  uazapi: 'uazapi',
}

export function nomeDoProvedor(chave: string): string {
  return NOME_PROVEDOR[chave] ?? chave
}

/** `true` quando a Letícia consegue receber e responder. */
export function conexaoDePe(c: Conexao | null): boolean {
  return c?.estado === 'conectado'
}

async function comSessao(caminho: string, init?: RequestInit): Promise<Response> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('sem_sessao')

  return fetch(`${BASE}${caminho}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  })
}

/** Estado atual. Nunca lança: falha de rede também é uma resposta ('indisponivel'). */
export async function lerConexao(): Promise<Conexao> {
  const cair = (estado: EstadoConexao): Conexao =>
    ({ provedor: 'evolution', estado, numero: null, perfil: null, foto: null })

  try {
    const r = await comSessao('/conexao')
    const d = await r.json()
    if (!d?.ok) return cair('indisponivel')
    return {
      provedor: d.provedor ?? 'evolution',
      estado: (d.estado ?? 'indisponivel') as EstadoConexao,
      numero: d.numero ?? null,
      perfil: d.perfil ?? null,
      foto: d.foto ?? null,
    }
  } catch {
    return cair('indisponivel')
  }
}

/**
 * Abre o pareamento.
 *
 * Com o número, volta um **código de 8 dígitos** para digitar no celular — que
 * é melhor num painel de computador do que apontar a câmera para o monitor. O
 * QR volta junto como reserva: nem toda conta aceita o código.
 */
export async function conectar(
  numero?: string,
): Promise<{ codigo: string | null; qr: string | null }> {
  const r = await comSessao('/conexao/conectar', {
    method: 'POST',
    body: JSON.stringify({ numero: numero ?? '' }),
  })
  const d = await r.json()
  if (!d?.ok) throw new Error(d?.motivo ?? 'falhou')
  return { codigo: d.codigo ?? null, qr: d.qr ?? null }
}

/** Encerra a sessão do WhatsApp. A instância continua de pé, pronta para parear. */
export async function desconectar(): Promise<void> {
  const r = await comSessao('/conexao/desconectar', { method: 'POST' })
  const d = await r.json()
  if (!d?.ok) throw new Error(d?.motivo ?? 'falhou')
}

/**
 * Acompanha a conexão, com atualização automática.
 *
 * **Só consulta com a aba visível.** Cada verificação é uma chamada à ponte;
 * manter isso rodando em aba esquecida em segundo plano é gastar à toa. Ao
 * voltar para a aba, consulta na hora — quem volta quer o estado de agora, não
 * o de meia hora atrás.
 */
export function useConexao(intervaloMs = 30_000) {
  const [conexao, setConexao] = useState<Conexao | null>(null)
  const ocupado = useRef(false)

  const recarregar = useCallback(async () => {
    // Servidor fora demora até o timeout. Sem esta trava, as consultas se
    // empilhariam uma sobre a outra justamente quando ele está lento.
    if (ocupado.current) return
    ocupado.current = true
    try {
      setConexao(await lerConexao())
    } finally {
      ocupado.current = false
    }
  }, [])

  useEffect(() => {
    let vivo = true
    const consultar = () => { if (vivo && !document.hidden) void recarregar() }

    consultar()
    const id = setInterval(consultar, intervaloMs)
    document.addEventListener('visibilitychange', consultar)

    return () => {
      vivo = false
      clearInterval(id)
      document.removeEventListener('visibilitychange', consultar)
    }
  }, [recarregar, intervaloMs])

  return { conexao, recarregar }
}
