// backend/tests/orders.repo.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { createDb, type DB } from '../src/db/connection'
import { applySchema } from '../src/db/schema'
import { OrderRepository } from '../src/repositories/orders'

describe('OrderRepository', () => {
  let db: DB
  let repo: OrderRepository
  beforeEach(() => {
    db = createDb(':memory:')
    applySchema(db)
    db.prepare("INSERT INTO products (id,name,price_cents,stock) VALUES ('p1','Capa',4990,10)").run()
    repo = new OrderRepository(db)
  })

  it('create gera pedido PROCESSING com total correto', () => {
    const order = repo.create({ productId: 'p1', quantity: 3, unitPriceCents: 4990 })
    expect(order.status).toBe('PROCESSING')
    expect(order.totalCents).toBe(14970)
    expect(order.id).toMatch(/[0-9a-f-]{36}/)
    expect(repo.findById(order.id)).toEqual(order)
  })

  it('updateStatus muda status e failureReason', () => {
    const order = repo.create({ productId: 'p1', quantity: 1, unitPriceCents: 4990 })
    repo.updateStatus(order.id, 'FAILED', 'ERP timeout')
    const updated = repo.findById(order.id)!
    expect(updated.status).toBe('FAILED')
    expect(updated.failureReason).toBe('ERP timeout')
  })
})
