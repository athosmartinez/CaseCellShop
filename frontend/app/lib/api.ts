import type { Product } from '../types'

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:3001'

export async function getProducts(): Promise<Product[]> {
  const res = await fetch(`${BACKEND_URL}/products`, { cache: 'no-store' })
  if (!res.ok) throw new Error('Falha ao carregar produtos')
  return res.json() as Promise<Product[]>
}
