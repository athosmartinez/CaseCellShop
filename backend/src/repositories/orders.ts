import { randomUUID } from 'node:crypto'
import type { DB } from '../db/connection'
import type { Order, OrderStatus } from '../types'

interface OrderRow {
  id: string; product_id: string; quantity: number; unit_price_cents: number
  total_cents: number; status: OrderStatus; failure_reason: string | null
  created_at: string; updated_at: string
}

const toOrder = (r: OrderRow): Order => ({
  id: r.id, productId: r.product_id, quantity: r.quantity,
  unitPriceCents: r.unit_price_cents, totalCents: r.total_cents,
  status: r.status, failureReason: r.failure_reason,
  createdAt: r.created_at, updatedAt: r.updated_at,
})

export class OrderRepository {
  constructor(private db: DB) {}

  create(input: { productId: string; quantity: number; unitPriceCents: number }): Order {
    const id = randomUUID()
    const total = input.unitPriceCents * input.quantity
    this.db
      .prepare(`INSERT INTO orders (id, product_id, quantity, unit_price_cents, total_cents, status)
                VALUES (?, ?, ?, ?, ?, 'PROCESSING')`)
      .run(id, input.productId, input.quantity, input.unitPriceCents, total)
    return this.findById(id)!
  }

  updateStatus(id: string, status: OrderStatus, failureReason: string | null = null): void {
    this.db
      .prepare(`UPDATE orders SET status = ?, failure_reason = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(status, failureReason, id)
  }

  findById(id: string): Order | null {
    const row = this.db
      .prepare(
        `SELECT id, product_id, quantity, unit_price_cents, total_cents, status, failure_reason, created_at, updated_at
         FROM orders WHERE id = ?`,
      )
      .get(id) as OrderRow | undefined
    return row ? toOrder(row) : null
  }
}
