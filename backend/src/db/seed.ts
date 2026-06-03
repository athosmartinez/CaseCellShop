import type { DB } from './connection'

export const SEED_PRODUCTS = [
  { id: 'capa-silicone-preta', name: 'Capa de Silicone Preta', price_cents: 4990, stock: 25 },
  { id: 'capa-transparente-antishock', name: 'Capa Transparente Anti-Shock', price_cents: 6990, stock: 5 },
  { id: 'capa-couro-vintage', name: 'Capa de Couro Vintage', price_cents: 12990, stock: 0 },
] as const

export function seedIfEmpty(db: DB): void {
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM products').get() as { n: number }
  if (n > 0) return
  const insert = db.prepare('INSERT INTO products (id, name, price_cents, stock) VALUES (?, ?, ?, ?)')
  const tx = db.transaction(() => {
    for (const p of SEED_PRODUCTS) insert.run(p.id, p.name, p.price_cents, p.stock)
  })
  tx()
}
