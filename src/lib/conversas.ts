import { supabase } from './supabase'
import type { ConversaResumo, MensagemWhatsapp, TipoMensagem, AutorMensagem } from '../types'

/**
 * Tudo que a tela Conversas faz com o banco e com a Edge Function.
 *
 * Fica fora dos componentes pelo mesmo motivo de `agenda.ts`: são regras que
 * três telas diferentes vão querer (a lista, a janela e a ficha do lead), e
 * regra copiada é regra que envelhece em um lugar só.
 */

/** Quantas mensagens a janela carrega de uma vez. */
const HISTORICO = 200

export async function listarConversas(): Promise<ConversaResumo[]> {
  const { data, error } = await supabase
    .from('conversas_lista')
    .select('*')
    .order('ultima_em', { ascending: false })
    .limit(200)

  if (error) throw error
  return (data ?? []) as ConversaResumo[]
}

export async function carregarMensagens(leadId: string): Promise<MensagemWhatsapp[]> {
  const { data, error } = await supabase
    .from('mensagens_whatsapp')
    .select('*')
    .eq('lead_id', leadId)
    .order('criada_em', { ascending: false })
    .limit(HISTORICO)

  if (error) throw error
  // Vem do banco em ordem decrescente (para o `limit` pegar as recentes) e é
  // exibida em ordem crescente.
  return ((data ?? []) as MensagemWhatsapp[]).reverse()
}

/**
 * Manda a mensagem do atendente pelo WhatsApp.
 *
 * **Não grava direto na tabela**, de propósito: quem fala com a Evolution é a
 * Edge Function, e é ela que grava a linha depois de o WhatsApp aceitar. Um
 * `insert` daqui criaria balão na tela para uma mensagem que talvez não tenha
 * saído — o pior tipo de mentira numa tela de atendimento.
 */
export async function enviarMensagem(leadId: string, texto: string): Promise<void> {
  const { data: sessao } = await supabase.auth.getSession()
  const token = sessao.session?.access_token
  if (!token) throw new Error('sessão expirada')

  const r = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp/enviar`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ lead_id: leadId, texto }),
    },
  )

  const dados = await r.json().catch(() => null)
  if (!r.ok || !dados?.ok) throw new Error(dados?.motivo ?? 'falha_no_envio')
}

/**
 * Assume a conversa: a Letícia para de responder ESTA conversa, e só ela.
 * O agente continua atendendo todo mundo.
 */
export async function assumirConversa(leadId: string, usuarioId: string): Promise<void> {
  const { error } = await supabase
    .from('crm_clinica')
    .update({
      agente_pausado: true,
      assumido_por: usuarioId,
      assumido_em: new Date().toISOString(),
    })
    .eq('id', leadId)

  if (error) throw error
}

/** Devolve para a Letícia. */
export async function devolverConversa(leadId: string): Promise<void> {
  const { error } = await supabase
    .from('crm_clinica')
    .update({ agente_pausado: false, assumido_por: null, assumido_em: null })
    .eq('id', leadId)

  if (error) throw error
}

/**
 * Marca como lidas as mensagens do paciente.
 *
 * **A leitura é da equipe inteira, não de cada usuário.** Quem abriu a conversa
 * viu; não faz sentido a mesma mensagem seguir "não lida" para o colega ao
 * lado, que está olhando a mesma tela na mesma recepção.
 */
export async function marcarComoLidas(leadId: string): Promise<void> {
  await supabase
    .from('mensagens_whatsapp')
    .update({ lida: true })
    .eq('lead_id', leadId)
    .eq('autor', 'paciente')
    .eq('lida', false)
}

/**
 * URL temporária de um arquivo do bucket `midias-whatsapp`.
 *
 * O bucket é **privado**: ali ficam áudios e fotos que pacientes mandaram,
 * inclusive foto de boca. `getPublicUrl()` não funciona, e é bom que não
 * funcione — a URL assinada expira.
 */
export async function urlDaMidia(caminho: string): Promise<string | null> {
  const { data } = await supabase.storage
    .from('midias-whatsapp')
    .createSignedUrl(caminho, 60 * 60)

  return data?.signedUrl ?? null
}

/** A frase que representa a mensagem na lista da esquerda. */
export function previaDaMensagem(tipo: TipoMensagem, conteudo: string | null): string {
  const texto = conteudo?.trim()
  if (tipo === 'texto') return texto || 'Mensagem'
  // No áudio, `conteudo` guarda a transcrição — mostrar ela é mais útil do que
  // dizer "Áudio", mas o ícone continua avisando que veio falado.
  if (tipo === 'audio') return texto ? `🎤 ${texto}` : '🎤 Áudio'
  if (tipo === 'imagem') return texto ? `📷 ${texto}` : '📷 Foto'
  if (tipo === 'video') return '🎬 Vídeo'
  return '📎 Arquivo'
}

const AUTORES: Record<AutorMensagem, string> = {
  paciente: 'Paciente',
  agente: 'Letícia',
  atendente: 'Atendente',
}

export function nomeDoAutor(autor: AutorMensagem): string {
  return AUTORES[autor] ?? autor
}

/** `14:32` — a hora que vai embaixo do balão. */
export function hora(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

/**
 * `Hoje`, `Ontem` ou `12 de agosto` — a tarja que separa os dias na conversa.
 */
export function diaPorExtenso(iso: string): string {
  const d = new Date(iso)
  const hoje = new Date()
  const ontem = new Date()
  ontem.setDate(hoje.getDate() - 1)

  const mesmoDia = (a: Date, b: Date) =>
    a.getDate() === b.getDate() && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()

  if (mesmoDia(d, hoje)) return 'Hoje'
  if (mesmoDia(d, ontem)) return 'Ontem'
  return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' })
}

/** `14:32`, `Ontem` ou `12/08` — o carimbo curto da lista da esquerda. */
export function quandoCurto(iso: string): string {
  const d = new Date(iso)
  const hoje = new Date()
  if (d.toDateString() === hoje.toDateString()) return hora(iso)

  const ontem = new Date()
  ontem.setDate(hoje.getDate() - 1)
  if (d.toDateString() === ontem.toDateString()) return 'Ontem'

  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}
