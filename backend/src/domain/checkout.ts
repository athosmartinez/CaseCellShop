import type { Logger } from 'pino'
import type { DB } from '../db/connection'
import { ProductRepository } from '../repositories/products'
import { OrderRepository } from '../repositories/orders'
import { IdempotencyRepository, type StoredOutcome } from '../repositories/idempotency'
import { type SimulatedErp, type ErpScenario } from '../erp/simulatedErp'
import { billWithResilience } from '../erp/billing'
import { env } from '../config/env'
import type { Order } from '../types'

export interface CheckoutInput {
  productId: string
  quantity: number
  idempotencyKey: string
  scenario?: ErpScenario
}

export type CheckoutResult =
  | { kind: 'created'; order: Order }
  | { kind: 'insufficient_stock'; available: number }
  | { kind: 'product_not_found' }
  | { kind: 'erp_unavailable'; order: Order; reason: string }
  | { kind: 'duplicate_in_flight'; order: Order | null }
  | { kind: 'duplicate_finished'; outcome: StoredOutcome }

type ReserveOutcome =
  | { kind: 'reserved'; order: Order }
  | { kind: 'short_circuit'; result: CheckoutResult }

export class CheckoutService {
  private products: ProductRepository
  private orders: OrderRepository
  private idempotency: IdempotencyRepository

  constructor(private db: DB, private erp: SimulatedErp, private log: Logger) {
    this.products = new ProductRepository(db)
    this.orders = new OrderRepository(db)
    this.idempotency = new IdempotencyRepository(db)
  }

  async checkout(input: CheckoutInput): Promise<CheckoutResult> {
    const { productId, quantity, idempotencyKey } = input

    // --- Transação síncrona: idempotência + produto + reserva + criação do pedido ---
    const reservation = this.reserve(input)
    if (reservation.kind === 'short_circuit') return reservation.result
    const order = reservation.order
    this.log.info({ orderId: order.id, idempotencyKey, productId, quantity }, 'checkout: estoque reservado, faturando no ERP')

    // --- Assíncrono (fora do lock): faturamento no ERP ---
    const billing = await billWithResilience(this.erp, order.id, input.scenario ?? 'default', {
      timeoutMs: env.ERP_TIMEOUT_MS,
      maxRetries: env.ERP_MAX_RETRIES,
    })

    // --- Transação síncrona: desfecho terminal atômico (confirmar ou compensar) ---
    if (billing.ok) {
      const confirm = this.db.transaction(() => {
        this.orders.updateStatus(order.id, 'CONFIRMED')
        const confirmed = this.orders.findById(order.id)!
        this.idempotency.finalize(idempotencyKey, { httpStatus: 201, body: { order: confirmed } })
        return confirmed
      })
      const confirmed = confirm()
      this.log.info({ orderId: order.id, invoiceId: billing.invoiceId }, 'checkout: confirmado')
      return { kind: 'created', order: confirmed }
    }

    // Falha transitória: compensa estoque, marca FAILED e LIBERA a chave (não cacheia 503).
    // O retry com a mesma chave re-tenta do zero (estilo Stripe).
    const compensate = this.db.transaction(() => {
      this.products.restore(productId, quantity)
      this.orders.updateStatus(order.id, 'FAILED', billing.reason)
      this.idempotency.release(idempotencyKey)
    })
    compensate()
    const failed = this.orders.findById(order.id)!
    this.log.warn({ orderId: order.id, reason: billing.reason }, 'checkout: ERP falhou, estoque compensado, chave liberada')
    return { kind: 'erp_unavailable', order: failed, reason: billing.reason }
  }

  /** Seção crítica curta e síncrona: arbitra idempotência, valida produto e reserva estoque. */
  private reserve(input: CheckoutInput): ReserveOutcome {
    const { productId, quantity, idempotencyKey } = input
    let outcome!: ReserveOutcome

    const tx = this.db.transaction(() => {
      const claimed = this.idempotency.tryClaim(idempotencyKey)
      if (!claimed) {
        const existing = this.idempotency.getOutcome(idempotencyKey)!
        if (existing.httpStatus != null) {
          outcome = { kind: 'short_circuit', result: { kind: 'duplicate_finished', outcome: { httpStatus: existing.httpStatus, body: existing.body } } }
          return
        }
        const order = existing.orderId ? this.orders.findById(existing.orderId) : null
        outcome = { kind: 'short_circuit', result: { kind: 'duplicate_in_flight', order } }
        return
      }

      const product = this.products.findById(productId)
      if (!product) {
        this.idempotency.finalize(idempotencyKey, { httpStatus: 404, body: { error: { code: 'PRODUCT_NOT_FOUND', message: 'Produto não encontrado.' } } })
        outcome = { kind: 'short_circuit', result: { kind: 'product_not_found' } }
        return
      }

      const reserved = this.products.tryReserve(productId, quantity)
      if (!reserved) {
        this.idempotency.finalize(idempotencyKey, { httpStatus: 409, body: { error: { code: 'INSUFFICIENT_STOCK', message: 'Estoque insuficiente.', details: { available: product.stock } } } })
        outcome = { kind: 'short_circuit', result: { kind: 'insufficient_stock', available: product.stock } }
        return
      }

      const order = this.orders.create({ productId, quantity, unitPriceCents: product.priceCents })
      this.idempotency.linkOrder(idempotencyKey, order.id)
      outcome = { kind: 'reserved', order }
    })
    tx()
    return outcome
  }
}
