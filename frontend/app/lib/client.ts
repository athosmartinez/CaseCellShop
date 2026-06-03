import type { Order, ErpScenario } from '../types'

export type CheckoutSuccess = { ok: true; order: Order }
export type CheckoutPending = { pending: true; message: string }
export type CheckoutFailure = { ok: false; code: string; message: string }
export type CheckoutOutcome = CheckoutSuccess | CheckoutPending | CheckoutFailure

const PENDING_MESSAGE = 'Pedido em processamento. Aguarde a confirmação.'

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
  const data = (await res.json().catch(() => ({}))) as {
    order?: Order
    idempotent?: boolean
    error?: { code?: string }
  }

  const order = data.order
  const isConfirmed = order?.status === 'CONFIRMED'

  // 202 (em processamento) ou replay idempotente de um pedido ainda não confirmado.
  if (res.status === 202 || (res.ok && data.idempotent && order && !isConfirmed)) {
    return { pending: true, message: PENDING_MESSAGE }
  }
  if (res.ok && isConfirmed) return { ok: true, order: order! }
  // Replay finalizado não-confirmado (caso raro): trata como em processamento.
  if (res.ok && order) return { pending: true, message: PENDING_MESSAGE }

  const code = data.error?.code ?? 'UNKNOWN'
  return { ok: false, code, message: MESSAGES[code] ?? MESSAGES.UNKNOWN }
}
