import { z } from 'zod'

export const CheckoutBodySchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().positive(),
})

export type CheckoutBody = z.infer<typeof CheckoutBodySchema>
