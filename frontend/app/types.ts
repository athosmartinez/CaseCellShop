export interface Product {
  id: string
  name: string
  priceCents: number
  stock: number
}

export interface Order {
  id: string
  productId: string
  quantity: number
  totalCents: number
  status: 'PROCESSING' | 'CONFIRMED' | 'FAILED'
}

export type ErpScenario = 'default' | 'success' | 'slow' | 'fail'
