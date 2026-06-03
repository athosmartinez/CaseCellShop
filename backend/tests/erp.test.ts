// backend/tests/erp.test.ts
import { describe, it, expect } from 'vitest'
import { SimulatedErp, ErpError } from '../src/erp/simulatedErp'

describe('SimulatedErp', () => {
  it('cenário success sempre fatura', async () => {
    const erp = new SimulatedErp({ latencyMs: 0, failureRate: 1 })
    const res = await erp.bill('order-123', 'success')
    expect(res.invoiceId).toContain('INV-')
  })

  it('cenário fail lança ErpError transitória', async () => {
    const erp = new SimulatedErp({ latencyMs: 0 })
    await expect(erp.bill('order-123', 'fail')).rejects.toBeInstanceOf(ErpError)
  })

  it('default usa rng injetável para decidir falha', async () => {
    const sempreFalha = new SimulatedErp({ latencyMs: 0, failureRate: 0.5, rng: () => 0.1 })
    await expect(sempreFalha.bill('o', 'default')).rejects.toBeInstanceOf(ErpError)
    const nuncaFalha = new SimulatedErp({ latencyMs: 0, failureRate: 0.5, rng: () => 0.9 })
    await expect(nuncaFalha.bill('o', 'default')).resolves.toHaveProperty('invoiceId')
  })
})
