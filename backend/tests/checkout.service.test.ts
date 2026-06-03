import { describe, it, expect, beforeEach } from 'vitest'
import { randomUUID } from 'node:crypto'
import { createDb, type DB } from '../src/db/connection'
import { applySchema } from '../src/db/schema'
import { SimulatedErp } from '../src/erp/simulatedErp'
import { CheckoutService } from '../src/domain/checkout'
import { logger } from '../src/logger'
import { ProductRepository } from '../src/repositories/products'

function makeService(stock: number) {
  const db: DB = createDb(':memory:')
  applySchema(db)
  db.prepare("INSERT INTO products (id,name,price_cents,stock) VALUES ('p1','Capa',4990,?)").run(stock)
  const erp = new SimulatedErp({ latencyMs: 0, failureRate: 0 })
  const service = new CheckoutService(db, erp, logger)
  return { db, service }
}

describe('CheckoutService.checkout', () => {
  it('cria pedido CONFIRMED no caminho feliz e decrementa o estoque', async () => {
    const { db, service } = makeService(5)
    const r = await service.checkout({ productId: 'p1', quantity: 2, idempotencyKey: randomUUID(), scenario: 'success' })
    expect(r.kind).toBe('created')
    if (r.kind === 'created') expect(r.order.status).toBe('CONFIRMED')
    expect(new ProductRepository(db).findById('p1')!.stock).toBe(3)
  })

  it('retorna insufficient_stock e não decrementa quando falta estoque', async () => {
    const { db, service } = makeService(1)
    const r = await service.checkout({ productId: 'p1', quantity: 2, idempotencyKey: randomUUID(), scenario: 'success' })
    expect(r.kind).toBe('insufficient_stock')
    expect(new ProductRepository(db).findById('p1')!.stock).toBe(1)
  })

  it('retorna product_not_found para produto inexistente', async () => {
    const { service } = makeService(5)
    const r = await service.checkout({ productId: 'xxx', quantity: 1, idempotencyKey: randomUUID(), scenario: 'success' })
    expect(r.kind).toBe('product_not_found')
  })

  it('na falha do ERP marca FAILED e COMPENSA o estoque', async () => {
    const { db, service } = makeService(5)
    const r = await service.checkout({ productId: 'p1', quantity: 2, idempotencyKey: randomUUID(), scenario: 'fail' })
    expect(r.kind).toBe('erp_unavailable')
    expect(new ProductRepository(db).findById('p1')!.stock).toBe(5) // estoque devolvido
  })

  it('mesma idempotencyKey não reprocessa: 2ª chamada devolve o desfecho gravado', async () => {
    const { db, service } = makeService(5)
    const key = randomUUID()
    const r1 = await service.checkout({ productId: 'p1', quantity: 2, idempotencyKey: key, scenario: 'success' })
    const r2 = await service.checkout({ productId: 'p1', quantity: 2, idempotencyKey: key, scenario: 'success' })
    expect(r1.kind).toBe('created')
    expect(r2.kind).toBe('duplicate_finished')
    expect(new ProductRepository(db).findById('p1')!.stock).toBe(3) // decrementou só uma vez
  })
})
