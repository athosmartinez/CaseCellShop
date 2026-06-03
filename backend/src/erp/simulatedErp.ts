import { setTimeout as delay } from 'node:timers/promises'
import { env } from '../config/env'

export type ErpScenario = 'success' | 'slow' | 'fail' | 'default'

export class ErpError extends Error {
  constructor(public kind: 'transient', message: string) {
    super(message)
    this.name = 'ErpError'
  }
}

export interface ErpResult { invoiceId: string }

export interface SimulatedErpOptions {
  latencyMs?: number
  failureRate?: number
  rng?: () => number
}

export class SimulatedErp {
  private latencyMs: number
  private failureRate: number
  private rng: () => number

  constructor(opts: SimulatedErpOptions = {}) {
    this.latencyMs = opts.latencyMs ?? env.ERP_LATENCY_MS
    this.failureRate = opts.failureRate ?? env.ERP_FAILURE_RATE
    this.rng = opts.rng ?? Math.random
  }

  /** Uma tentativa de faturamento. Pode demorar (slow) ou falhar (fail/aleatório). */
  async bill(orderId: string, scenario: ErpScenario = 'default'): Promise<ErpResult> {
    if (scenario === 'fail') {
      await delay(Math.min(this.latencyMs, 50))
      throw new ErpError('transient', `ERP indisponível ao faturar o pedido ${orderId}`)
    }
    const effLatency = scenario === 'slow' ? this.latencyMs * 20 : this.latencyMs
    await delay(effLatency)
    const shouldFail = scenario === 'default' ? this.rng() < this.failureRate : false
    if (shouldFail) throw new ErpError('transient', `ERP indisponível ao faturar o pedido ${orderId}`)
    return { invoiceId: `INV-${orderId.slice(0, 8)}` }
  }
}
