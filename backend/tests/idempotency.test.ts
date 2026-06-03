// backend/tests/idempotency.test.ts
import { describe, it, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import request from 'supertest'
import { makeApp } from './helpers'

describe('idempotência do checkout', () => {
  it('mesma Idempotency-Key não reprocessa e devolve o mesmo desfecho', async () => {
    const { app } = makeApp({ stock: 5 })
    const k = randomUUID()
    const r1 = await request(app).post('/checkout').set('idempotency-key', k).set('x-erp-scenario', 'success').send({ productId: 'p1', quantity: 2 })
    const r2 = await request(app).post('/checkout').set('idempotency-key', k).set('x-erp-scenario', 'success').send({ productId: 'p1', quantity: 2 })
    expect(r1.status).toBe(201)
    expect(r2.status).toBe(201)
    expect(r2.body.idempotent).toBe(true)
    expect(r2.body.order.id).toBe(r1.body.order.id)
    const prod = await request(app).get('/products/p1')
    expect(prod.body.stock).toBe(3) // decrementou apenas uma vez
  })
})
