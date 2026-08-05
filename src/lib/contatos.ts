import { supabase } from './supabase'
import type { LeadStatus } from '../types'

/**
 * Consultas de contato compartilhadas pelas telas que criam pessoas.
 *
 * Uma pessoa, um WhatsApp. A garantia final é o índice único
 * `crm_clinica_whatsapp_unico` no banco (migração 0003) — daqui sai só o aviso
 * amigável, para a equipe descobrir o problema antes de clicar em salvar e,
 * melhor ainda, ser levada até a pessoa que já existe.
 */

export interface PessoaResumo {
  id: string
  nome_lead: string | null
  whatsapp_lead: string | null
  status: LeadStatus
}

/** SQLSTATE de violação de unicidade — o índice do WhatsApp barrando repetido. */
export const ERRO_DUPLICADO = '23505'

/**
 * Procura alguém com este WhatsApp. Espera o formato canônico (só dígitos com
 * o código do país), que é como a tela e o n8n gravam.
 */
export async function buscarPorWhatsapp(canonico: string): Promise<PessoaResumo | null> {
  if (!canonico) return null
  const { data } = await supabase
    .from('crm_clinica')
    .select('id, nome_lead, whatsapp_lead, status')
    .eq('whatsapp_lead', canonico)
    .limit(1)
  return (data?.[0] as PessoaResumo | undefined) ?? null
}
