// backend/tests/concurrency.test.ts
import { describe, it, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import request from 'supertest'
import { makeApp } from './helpers'

describe('concorrência — não vender além do estoque', () => {
  it('N checkouts simultâneos para estoque M: exatamente M sucessos, estoque nunca negativo', async () => {
    const STOCK = 5
    const ATTEMPTS = 20
    const { app } = makeApp({ stock: STOCK })

    const responses = await Promise.all(
      Array.from({ length: ATTEMPTS }, () =>
        request(app)
          .post('/checkout')
          .set('idempotency-key', randomUUID()) // chaves distintas = compras distintas
          .set('x-erp-scenario', 'success')
          .send({ productId: 'p1', quantity: 1 }),
      ),
    )

    const created = responses.filter((r) => r.status === 201).length
    const insufficient = responses.filter((r) => r.status === 409).length
    expect(created).toBe(STOCK)
    expect(insufficient).toBe(ATTEMPTS - STOCK)

    const prod = await request(app).get('/products/p1')
    expect(prod.body.stock).toBe(0) // nunca negativo
  })
})
