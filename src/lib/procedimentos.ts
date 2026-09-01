/**
 * Dinheiro na tela de Procedimentos.
 *
 * ── POR QUE ISTO NÃO MONTA A FRASE DA LETÍCIA ──────────────────────────────
 *
 * Existe a tentação de o card mostrar "ela vai dizer: a partir de R$ 200". Não
 * mostra, de propósito: a frase é montada pela view `procedimentos_clinica_agente`,
 * em SQL, e reimplementá-la aqui criaria duas versões da mesma regra — um dia a
 * tela mostraria uma coisa e o paciente ouviria outra.
 *
 * A prévia da aba Clínica escapa disso porque consulta a view **de verdade**.
 * Aqui, uma consulta por card seria absurda. Então o card mostra o **dado**, não
 * a frase, e a única regra que ele repete é a que dá para ver a olho nu: campo
 * vazio, ela não fala; zero, é gratuita.
 */

/** `1500.5` → `"R$ 1.500,50"`. Espelha a função `reais()` do banco. */
export function formatarReais(valor: number): string {
  return valor.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/**
 * O que a pessoa digitou vira número — ou `null`, que é um valor de verdade
 * aqui: significa "não fale preço".
 *
 * Aceita os dois jeitos de escrever, porque as duas aparecem: `1.500,50` (como
 * se escreve em português) e `1500.50` (como sai de qualquer teclado numérico).
 * A regra: se tem vírgula, a vírgula é o decimal e os pontos são milhar.
 */
export function lerPreco(texto: string): number | null {
  const limpo = texto.replace(/[^\d.,-]/g, '').trim()
  if (!limpo) return null

  const normalizado = limpo.includes(',')
    ? limpo.replace(/\./g, '').replace(',', '.')
    : limpo

  const n = Number(normalizado)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n * 100) / 100
}

/** O valor como ele entra no campo: `200` → `"200,00"`. Vazio continua vazio. */
export function precoParaCampo(valor: number | null): string {
  if (valor === null || valor === undefined) return ''
  return valor.toFixed(2).replace('.', ',')
}
