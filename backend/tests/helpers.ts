import { createApp } from '../src/app'
import { createDb, type DB } from '../src/db/connection'
import { applySchema } from '../src/db/schema'
import { SimulatedErp } from '../src/erp/simulatedErp'

/** App de teste com SQLite em memória, ERP determinístico (falha controlada por header). */
export function makeApp(opts?: { stock?: number; productId?: string }) {
  const db: DB = createDb(':memory:')
  applySchema(db)
  const id = opts?.productId ?? 'p1'
  db.prepare('INSERT INTO products (id,name,price_cents,stock) VALUES (?,?,?,?)').run(id, 'Capa Teste', 4990, opts?.stock ?? 5)
  const erp = new SimulatedErp({ latencyMs: 0, failureRate: 0 })
  const app = createApp(db, erp)
  return { app, db, productId: id }
}
