import type { Order, ErpScenario } from '../types'

export type CheckoutSuccess = { ok: true; order: Order }
export type CheckoutFailure = { ok: false; code: string; message: string }
export type CheckoutOutcome = CheckoutSuccess | CheckoutFailure

const MESSAGES: Record<string, string> = {
  INSUFFICIENT_STOCK: 'Estoque insuficiente para a quantidade desejada.',
  VALIDATION_ERROR: 'Quantidade inválida. Informe um número inteiro maior que zero.',
  ERP_UNAVAILABLE: 'Falha temporária ao processar. Tente novamente em instantes.',
  PRODUCT_NOT_FOUND: 'Produto não encontrado.',
  UNKNOWN: 'Não foi possível concluir a compra. Tente novamente.',
}

export async function postCheckout(
  body: { productId: string; quantity: number },
  idempotencyKey: string,
  scenario: ErpScenario = 'default',
): Promise<CheckoutOutcome> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'idempotency-key': idempotencyKey,
  }
  if (scenario !== 'default') headers['x-erp-scenario'] = scenario

  const res = await fetch('/api/checkout', { method: 'POST', headers, body: JSON.stringify(body) })
  const data = (await res.json().catch(() => ({}))) as { order?: Order; error?: { code?: string } }

  if (res.ok && data.order) return { ok: true, order: data.order }
  const code = data.error?.code ?? 'UNKNOWN'
  return { ok: false, code, message: MESSAGES[code] ?? MESSAGES.UNKNOWN }
}
