import type { Request, Response } from 'express'
import { randomUUID } from 'node:crypto'
import type { DB } from '../db/connection'
import { ProductRepository } from '../repositories/products'
import { OrderRepository } from '../repositories/orders'
import { CheckoutService } from '../domain/checkout'
import { CheckoutBodySchema } from './validation'
import type { SimulatedErp, ErpScenario } from '../erp/simulatedErp'

const SCENARIOS: ErpScenario[] = ['success', 'slow', 'fail', 'default']
const parseScenario = (raw: string | undefined): ErpScenario =>
  raw && (SCENARIOS as string[]).includes(raw) ? (raw as ErpScenario) : 'default'

export function createHandlers(db: DB, erp: SimulatedErp) {
  const products = new ProductRepository(db)
  const orders = new OrderRepository(db)

  const health = (_req: Request, res: Response) => {
    try {
      db.prepare('SELECT 1').get()
      res.json({ status: 'ok', checks: { db: 'ok' } })
    } catch {
      res.status(503).json({ status: 'error', checks: { db: 'error' } })
    }
  }

  const listProducts = (_req: Request, res: Response) => {
    res.json(products.list())
  }

  const getProduct = (req: Request, res: Response) => {
    const p = products.findById(req.params['id'] ?? '')
    if (!p) {
      res.status(404).json({ error: { code: 'PRODUCT_NOT_FOUND', message: 'Produto não encontrado.' }, requestId: req.id })
      return
    }
    res.json(p)
  }

  const getOrder = (req: Request, res: Response) => {
    const o = orders.findById(req.params['id'] ?? '')
    if (!o) {
      res.status(404).json({ error: { code: 'ORDER_NOT_FOUND', message: 'Pedido não encontrado.' }, requestId: req.id })
      return
    }
    res.json(o)
  }

  const checkout = async (req: Request, res: Response) => {
    const parsed = CheckoutBodySchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Entrada inválida.', details: parsed.error.flatten() }, requestId: req.id })
      return
    }
    const idempotencyKey = req.header('idempotency-key')?.trim() || randomUUID()
    const scenario = parseScenario(req.header('x-erp-scenario'))
    const service = new CheckoutService(db, erp, req.log)
    const result = await service.checkout({ productId: parsed.data.productId, quantity: parsed.data.quantity, idempotencyKey, scenario })

    switch (result.kind) {
      case 'created':
        res.status(201).json({ order: result.order, requestId: req.id })
        return
      case 'product_not_found':
        res.status(404).json({ error: { code: 'PRODUCT_NOT_FOUND', message: 'Produto não encontrado.' }, requestId: req.id })
        return
      case 'insufficient_stock':
        res.status(409).json({ error: { code: 'INSUFFICIENT_STOCK', message: 'Estoque insuficiente.', details: { available: result.available } }, requestId: req.id })
        return
      case 'erp_unavailable':
        res.setHeader('Retry-After', '2')
        res.status(503).json({ error: { code: 'ERP_UNAVAILABLE', message: 'Falha temporária ao processar o pedido. Tente novamente.' }, orderId: result.order.id, requestId: req.id })
        return
      case 'duplicate_in_flight':
        // 202 Accepted: pedido aceito, ainda em processamento (não confirmado).
        res.status(202).json({ idempotent: true, order: result.order, requestId: req.id })
        return
      case 'duplicate_finished': {
        const base = result.outcome.body
        const body = base && typeof base === 'object' ? { ...(base as Record<string, unknown>), idempotent: true, requestId: req.id } : base
        res.status(result.outcome.httpStatus).json(body)
        return
      }
    }
  }

  return { health, listProducts, getProduct, getOrder, checkout }
}
