import type { DB } from '../db/connection'
import type { Product } from '../types'

interface ProductRow { id: string; name: string; price_cents: number; stock: number }

const toProduct = (r: ProductRow): Product => ({
  id: r.id, name: r.name, priceCents: r.price_cents, stock: r.stock,
})

export class ProductRepository {
  constructor(private db: DB) {}

  list(): Product[] {
    const rows = this.db
      .prepare('SELECT id, name, price_cents, stock FROM products ORDER BY name')
      .all() as ProductRow[]
    return rows.map(toProduct)
  }

  findById(id: string): Product | null {
    const row = this.db
      .prepare('SELECT id, name, price_cents, stock FROM products WHERE id = ?')
      .get(id) as ProductRow | undefined
    return row ? toProduct(row) : null
  }

  /** Reserva atômica: decrementa apenas se houver estoque. Retorna true se reservou. */
  tryReserve(id: string, quantity: number): boolean {
    const res = this.db
      .prepare('UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?')
      .run(quantity, id, quantity)
    return res.changes === 1
  }

  /** Compensação: devolve estoque. */
  restore(id: string, quantity: number): void {
    this.db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?').run(quantity, id)
  }
}
