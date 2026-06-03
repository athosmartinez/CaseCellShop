// backend/tests/products.repo.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { createDb, type DB } from '../src/db/connection'
import { applySchema } from '../src/db/schema'
import { ProductRepository } from '../src/repositories/products'

function seedOne(db: DB, stock: number) {
  db.prepare("INSERT INTO products (id,name,price_cents,stock) VALUES ('p1','Capa',4990,?)").run(stock)
}

describe('ProductRepository', () => {
  let db: DB
  let repo: ProductRepository
  beforeEach(() => {
    db = createDb(':memory:')
    applySchema(db)
    repo = new ProductRepository(db)
  })

  it('findById mapeia colunas para camelCase', () => {
    seedOne(db, 3)
    expect(repo.findById('p1')).toEqual({ id: 'p1', name: 'Capa', priceCents: 4990, stock: 3 })
    expect(repo.findById('inexistente')).toBeNull()
  })

  it('tryReserve decrementa quando há estoque e recusa quando não há', () => {
    seedOne(db, 2)
    expect(repo.tryReserve('p1', 2)).toBe(true)
    expect(repo.findById('p1')!.stock).toBe(0)
    expect(repo.tryReserve('p1', 1)).toBe(false) // sem estoque
    expect(repo.findById('p1')!.stock).toBe(0)   // nunca negativo
  })

  it('restore devolve estoque', () => {
    seedOne(db, 0)
    repo.restore('p1', 2)
    expect(repo.findById('p1')!.stock).toBe(2)
  })
})
