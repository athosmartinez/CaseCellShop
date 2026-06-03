import type { Product } from '../types'
import { CheckoutForm } from './CheckoutForm'

export function ProductList({ products }: { products: Product[] }) {
  if (products.length === 0) return <p>Nenhum produto disponível.</p>
  return (
    <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 16 }}>
      {products.map((p) => (
        <li key={p.id} style={{ border: '1px solid #ddd', borderRadius: 8, padding: 16 }}>
          <strong>{p.name}</strong>
          <div>R$ {(p.priceCents / 100).toFixed(2)}</div>
          <div>Estoque: {p.stock === 0 ? <em>esgotado</em> : p.stock}</div>
          <CheckoutForm product={p} />
        </li>
      ))}
    </ul>
  )
}
