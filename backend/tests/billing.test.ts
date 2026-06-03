// backend/tests/billing.test.ts
import { describe, it, expect, vi } from 'vitest'
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
    const spy = vi.spyOn(erp, 'bill')
    const r = await billWithResilience(erp, 'o1', 'fail', { timeoutMs: 100, maxRetries: 2 })
    expect(r.ok).toBe(false)
    // tentativa inicial + maxRetries repetições = 3 chamadas ao total
    expect(spy).toHaveBeenCalledTimes(3)
  })

  it('lentidão estoura o timeout e falha rápido (chama o ERP só uma vez)', async () => {
    const erp = new SimulatedErp({ latencyMs: 50 }) // slow => 50*20 = 1000ms
    const spy = vi.spyOn(erp, 'bill')
    const r = await billWithResilience(erp, 'o1', 'slow', { timeoutMs: 80, maxRetries: 2 })
    expect(r.ok).toBe(false)
    // timeout NÃO dispara retry: o ERP deve ter sido chamado exatamente uma vez
    expect(spy).toHaveBeenCalledTimes(1)
  })
})
