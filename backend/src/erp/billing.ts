import { ErpError, type SimulatedErp, type ErpScenario } from './simulatedErp'

class TimeoutError extends Error {}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new TimeoutError(`ERP timeout após ${ms}ms`)), ms)
    p.then(
      (v) => { clearTimeout(t); resolve(v) },
      (e) => { clearTimeout(t); reject(e) },
    )
  })
}

export interface BillingOptions { timeoutMs: number; maxRetries: number }
export type BillingResult = { ok: true; invoiceId: string } | { ok: false; reason: string }

/**
 * Timeout por tentativa + retry limitado.
 * - lentidão/timeout → falha rápido (NÃO reteima no que está lento)
 * - erro transitório → retry até maxRetries
 */
export async function billWithResilience(
  erp: SimulatedErp,
  orderId: string,
  scenario: ErpScenario,
  opts: BillingOptions,
): Promise<BillingResult> {
  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      const res = await withTimeout(erp.bill(orderId, scenario), opts.timeoutMs)
      return { ok: true, invoiceId: res.invoiceId }
    } catch (e) {
      if (e instanceof TimeoutError) return { ok: false, reason: 'ERP lento (timeout)' }
      if (e instanceof ErpError && e.kind === 'transient') {
        if (attempt === opts.maxRetries) return { ok: false, reason: e.message }
        continue
      }
      return { ok: false, reason: e instanceof Error ? e.message : 'erro desconhecido do ERP' }
    }
  }
  return { ok: false, reason: 'ERP indisponível' }
}
