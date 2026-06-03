// backend/tests/billing.test.ts
import { describe, it, expect } from 'vitest'
import { SimulatedErp } from '../src/erp/simulatedErp'
import { billWithResilience } from '../src/erp/billing'

describe('billWithResilience', () => {
  it('sucesso retorna ok com invoiceId', async () => {
    const erp = new SimulatedErp({ latencyMs: 0 })
    const r = await billWithResilience(erp, 'o1', 'success', { timeoutMs: 100, maxRetries: 2 })
    expect(r).toEqual({ ok: true, invoiceId: expect.stringContaining('INV-') })
  })

  it('falha transitória persistente esgota retries e retorna ok:false', async () => {
    const erp = new SimulatedErp({ latencyMs: 0 })
    const r = await billWithResilience(erp, 'o1', 'fail', { timeoutMs: 100, maxRetries: 2 })
    expect(r.ok).toBe(false)
  })

  it('lentidão estoura o timeout e falha rápido (sem reteimar)', async () => {
    const erp = new SimulatedErp({ latencyMs: 50 }) // slow => 50*20 = 1000ms
    const start = Date.now()
    const r = await billWithResilience(erp, 'o1', 'slow', { timeoutMs: 80, maxRetries: 2 })
    const elapsed = Date.now() - start
    expect(r.ok).toBe(false)
    expect(elapsed).toBeLessThan(400) // não tentou 3x de 1000ms; falhou rápido no timeout
  })
})
