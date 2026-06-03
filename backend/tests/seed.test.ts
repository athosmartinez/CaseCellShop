// backend/tests/seed.test.ts
import { describe, it, expect } from 'vitest'
import { createDb } from '../src/db/connection'
import { applySchema } from '../src/db/schema'
import { seedIfEmpty, SEED_PRODUCTS } from '../src/db/seed'

describe('seedIfEmpty', () => {
  it('popula produtos quando vazio e é idempotente', () => {
    const db = createDb(':memory:')
    applySchema(db)
    seedIfEmpty(db)
    seedIfEmpty(db) // segunda chamada não duplica
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM products').get() as { n: number }
    expect(n).toBe(SEED_PRODUCTS.length)
  })

  it('inclui um produto esgotado e um com estoque baixo', () => {
    const db = createDb(':memory:')
    applySchema(db)
    seedIfEmpty(db)
    const stocks = (db.prepare('SELECT stock FROM products').all() as { stock: number }[]).map(r => r.stock)
    expect(stocks).toContain(0)
    expect(stocks.some(s => s > 0 && s <= 5)).toBe(true)
  })
})
