// backend/tests/checkout.outcomes.test.ts
import { describe, it, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import request from 'supertest'
import { makeApp } from './helpers'

const key = () => ({ 'idempotency-key': randomUUID() })

describe('POST /checkout — desfechos', () => {
  it('201 no caminho feliz (cenário success)', async () => {
    const { app } = makeApp({ stock: 5 })
    const res = await request(app).post('/checkout').set(key()).set('x-erp-scenario', 'success').send({ productId: 'p1', quantity: 2 })
    expect(res.status).toBe(201)
    expect(res.body.order.status).toBe('CONFIRMED')
    expect(res.headers['x-request-id']).toBeTruthy()
  })

  it('400 em entrada inválida (quantity = 0)', async () => {
    const { app } = makeApp({ stock: 5 })
    const res = await request(app).post('/checkout').set(key()).send({ productId: 'p1', quantity: 0 })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('404 para produto inexistente', async () => {
    const { app } = makeApp({ stock: 5 })
    const res = await request(app).post('/checkout').set(key()).set('x-erp-scenario', 'success').send({ productId: 'nao-existe', quantity: 1 })
    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('PRODUCT_NOT_FOUND')
  })

  it('409 quando falta estoque, sem decrementar', async () => {
    const { app } = makeApp({ stock: 1 })
    const res = await request(app).post('/checkout').set(key()).set('x-erp-scenario', 'success').send({ productId: 'p1', quantity: 2 })
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('INSUFFICIENT_STOCK')
    expect(res.body.error.details.available).toBe(1)
    const prod = await request(app).get('/products/p1')
    expect(prod.body.stock).toBe(1)
  })

  it('503 quando o ERP falha, com estoque compensado', async () => {
    const { app } = makeApp({ stock: 5 })
    const res = await request(app).post('/checkout').set(key()).set('x-erp-scenario', 'fail').send({ productId: 'p1', quantity: 2 })
    expect(res.status).toBe(503)
    expect(res.body.error.code).toBe('ERP_UNAVAILABLE')
    expect(res.headers['retry-after']).toBe('2')
    const prod = await request(app).get('/products/p1')
    expect(prod.body.stock).toBe(5) // estoque devolvido
  })

  it('GET /orders/:id retorna o status do pedido (bônus)', async () => {
    const { app } = makeApp({ stock: 5 })
    const created = await request(app).post('/checkout').set(key()).set('x-erp-scenario', 'success').send({ productId: 'p1', quantity: 1 })
    const res = await request(app).get(`/orders/${created.body.order.id}`)
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('CONFIRMED')
  })
})
