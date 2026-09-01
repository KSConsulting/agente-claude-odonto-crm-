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
  | 'nao_configurado'

export interface Conexao {
  /** Chave do provedor no banco: `evolution` ou `uazapi`. */
  provedor: string
  estado: EstadoConexao
  numero: string | null
  perfil: string | null
  foto: string | null

  // Como a ponte está configurada. Vem das secrets da Edge Function, nunca do
  // banco — três respostas que só interessam quando algo quebra.
  /** Host da API, sem protocolo. Não é segredo: quem protege é a chave. */
  servidor: string | null
  /** Qual das instâncias do servidor é a nossa. */
  instancia: string | null
  /** Os QUATRO últimos caracteres da chave. Serve para identificar, não para usar. */
  chaveFinal: string | null

  /**
   * A ponte avisa ESTE sistema quando chega mensagem?
   *
   * A TERCEIRA condição para atender, depois do agente ligado e do WhatsApp
   * conectado. Sem ela o card diz "Conectado", em verde, e o paciente recebe
   * silêncio — nada chega no banco, nada aparece em Conversas.
   *
   * `desconhecido` é o servidor não ter respondido: a tela **cala a boca** em
   * vez de acusar um problema que talvez não exista.
   *
   * ⚠️ A URL do webhook **nunca** vem para cá: ela carrega o segredo dentro. O
   * servidor manda só o veredito.
   */
  webhook: VeredictoWebhook
}

export type VeredictoWebhook = 'apontado' | 'outro' | 'ausente' | 'desconhecido'

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
  const cair = (estado: EstadoConexao): Conexao => ({
    provedor: 'evolution', estado, numero: null, perfil: null, foto: null,
    servidor: null, instancia: null, chaveFinal: null, webhook: 'desconhecido',
  })

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
      servidor: d.servidor ?? null,
      instancia: d.instancia ?? null,
      chaveFinal: d.chaveFinal ?? null,
      webhook: (d.webhook ?? 'desconhecido') as VeredictoWebhook,
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
 * De quanto em quanto tempo a tela pergunta se a ponte está de pé.
 *
 * **Um minuto, e o mesmo para as duas telas que olham.** Foram 30s aqui e 60s
 * na faixa de Conversas, sem que nada justificasse a diferença — e dois números
 * para a mesma pergunta são a garantia de que um dia alguém mude só um.
 *
 * Cada verificação são duas chamadas à ponte (estado + webhook). O preço de
 * esticar é a queda demorar até um minuto para aparecer na tela; para uma queda
 * que importa, um minuto não é nada.
 */
export const INTERVALO_PADRAO = 60_000

/**
 * `a cada 1 minuto`, para a frase embaixo do botão.
 *
 * Sai do intervalo de verdade porque a versão digitada à mão já mentiu: a tela
 * dizia "30 segundos" enquanto o valor era outro. Número que aparece em dois
 * lugares só fica certo por acaso.
 */
export function cadenciaEmPalavras(ms: number): string {
  const segundos = Math.round(ms / 1000)
  if (segundos < 60) return `a cada ${segundos} segundos`
  const minutos = Math.round(segundos / 60)
  return minutos === 1 ? 'a cada 1 minuto' : `a cada ${minutos} minutos`
}

/**
 * Acompanha a conexão, com atualização automática.
 *
 * **Só consulta com a aba visível.** Cada verificação é uma chamada à ponte;
 * manter isso rodando em aba esquecida em segundo plano é gastar à toa. Ao
 * voltar para a aba, consulta na hora — quem volta quer o estado de agora, não
 * o de meia hora atrás.
 *
 * ── QUEM CHEGA NO MEIO ESPERA; NÃO É DESCARTADO ────────────────────────────
 *
 * Uma verificação de cada vez, porque servidor fora demora até o timeout e sem
 * trava as consultas se empilhariam justo quando ele está lento. Mas a trava
 * **devolve a que está em voo** em vez de sair calada: era assim que o clique
 * no "Verificar" sumia sem deixar rastro — caía exatamente no meio segundo em
 * que a consulta automática estava rodando, e a tela ficava igual.
 */
export function useConexao(intervaloMs = INTERVALO_PADRAO) {
  const [conexao, setConexao] = useState<Conexao | null>(null)
  const [verificando, setVerificando] = useState(false)
  const [verificadoEm, setVerificadoEm] = useState<Date | null>(null)
  const emVoo = useRef<Promise<void> | null>(null)

  const recarregar = useCallback((): Promise<void> => {
    if (emVoo.current) return emVoo.current

    const tarefa = (async () => {
      setVerificando(true)
      try {
        setConexao(await lerConexao())
        // Falhou também é ter verificado: `lerConexao` nunca lança, devolve
        // 'indisponivel'. O horário é de quando perguntamos, não de quando deu
        // certo — é a informação que a pessoa quer ao clicar de novo.
        setVerificadoEm(new Date())
      } finally {
        setVerificando(false)
      }
    })().finally(() => { emVoo.current = null })

    emVoo.current = tarefa
    return tarefa
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

  return { conexao, recarregar, verificando, verificadoEm, intervaloMs }
}
