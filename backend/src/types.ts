export interface Product {
  id: string
  name: string
  priceCents: number
  stock: number
}

export type OrderStatus = 'PROCESSING' | 'CONFIRMED' | 'FAILED'

export interface Order {
  id: string
  productId: string
  quantity: number
  unitPriceCents: number
  totalCents: number
  status: OrderStatus
  failureReason: string | null
  createdAt: string
  updatedAt: string
}
