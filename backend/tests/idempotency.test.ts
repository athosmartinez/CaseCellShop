// backend/tests/idempotency.test.ts
import { describe, it, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import request from 'supertest'
import { makeApp } from './helpers'
import { IdempotencyRepository } from '../src/repositories/idempotency'

describe('idempotência do checkout', () => {
  it('mesma Idempotency-Key não reprocessa e devolve o mesmo desfecho', async () => {
    const { app, db } = makeApp({ stock: 5 })
    const k = randomUUID()
    const r1 = await request(app).post('/checkout').set('idempotency-key', k).set('x-erp-scenario', 'success').send({ productId: 'p1', quantity: 2 })
    const r2 = await request(app).post('/checkout').set('idempotency-key', k).set('x-erp-scenario', 'success').send({ productId: 'p1', quantity: 2 })
    expect(r1.status).toBe(201)
    expect(r2.status).toBe(201)
    expect(r2.body.idempotent).toBe(true)
    expect(r2.body.order.id).toBe(r1.body.order.id)
    const prod = await request(app).get('/products/p1')
    expect(prod.body.stock).toBe(3) // decrementou apenas uma vez
    // FIX #3: desfecho terminal de sucesso é persistido (201) atomicamente
    expect(new IdempotencyRepository(db).getOutcome(k)!.httpStatus).toBe(201)
  })

  it('FIX #1: falha transitória LIBERA a chave — retry com a MESMA key re-tenta do zero', async () => {
    const { app, db } = makeApp({ stock: 5 })
    const k = randomUUID()
    // 1ª chamada: ERP falha → 503 (estoque reservado e compensado de volta a 5)
    const r1 = await request(app).post('/checkout').set('idempotency-key', k).set('x-erp-scenario', 'fail').send({ productId: 'p1', quantity: 1 })
    expect(r1.status).toBe(503)
    // o 503 NÃO foi cacheado sob a chave (chave liberada)
    expect(new IdempotencyRepository(db).getOutcome(k)).toBeNull()

    // 2ª chamada com a MESMA chave, agora com sucesso → 201 (re-tentou, não recebeu 503 cacheado)
    const r2 = await request(app).post('/checkout').set('idempotency-key', k).set('x-erp-scenario', 'success').send({ productId: 'p1', quantity: 1 })
    expect(r2.status).toBe(201)
    expect(r2.body.order.status).toBe('CONFIRMED')

    // estoque líquido: 5 → (fail: reserva→compensa) 5 → (success: reserva) 4
    const prod = await request(app).get('/products/p1')
    expect(prod.body.stock).toBe(4)
  })

  it('FIX #2: in-flight (chave reivindicada, não finalizada) responde 202 Accepted', async () => {
    const { app, db } = makeApp({ stock: 5 })
    const k = randomUUID()
    // Pré-semeia uma chave reivindicada mas não finalizada (http_status NULL) — estado in-flight determinístico
    db.prepare('INSERT INTO idempotency_keys (key) VALUES (?)').run(k)

    const res = await request(app).post('/checkout').set('idempotency-key', k).set('x-erp-scenario', 'success').send({ productId: 'p1', quantity: 1 })
    expect(res.status).toBe(202)
    expect(res.body.idempotent).toBe(true)
    // não reprocessou: estoque intacto
    const prod = await request(app).get('/products/p1')
    expect(prod.body.stock).toBe(5)
  })
})
