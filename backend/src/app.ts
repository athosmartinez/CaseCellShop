import express, { type Request, type Response, type NextFunction } from 'express'
import type { DB } from './db/connection'
import { SimulatedErp } from './erp/simulatedErp'
import { requestId } from './http/requestId'
import { createHandlers } from './http/handlers'

export function createApp(db: DB, erp: SimulatedErp = new SimulatedErp()) {
  const app = express()
  app.use(express.json())
  app.use(requestId)

  const h = createHandlers(db, erp)
  app.get('/health', h.health)
  app.get('/products', h.listProducts)
  app.get('/products/:id', h.getProduct)
  app.post('/checkout', (req, res, next) => h.checkout(req, res).catch(next))
  app.get('/orders/:id', h.getOrder)

  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    req.log?.error({ err }, 'erro não tratado')
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Erro interno.' }, requestId: req.id })
  })

  return app
}
