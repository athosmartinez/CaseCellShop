import { getProducts } from './lib/api'
import { ProductList } from './components/ProductList'
import { ScenarioToggle } from './components/ScenarioToggle'

export const dynamic = 'force-dynamic' // sempre o estoque mais recente (read-model)

export default async function HomePage() {
  const products = await getProducts()
  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <h1>CaseCellShop — Capinhas</h1>
      <ScenarioToggle />
      <ProductList products={products} />
    </main>
  )
}
