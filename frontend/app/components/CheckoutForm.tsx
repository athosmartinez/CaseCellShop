'use client'
import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import type { Product } from '../types'
import { postCheckout } from '../lib/client'
import { getScenario } from '../lib/scenario'

type Status = 'idle' | 'submitting' | 'success' | 'pending' | 'error'

function messageColor(status: Status): string {
  if (status === 'error') return 'crimson'
  if (status === 'pending') return 'darkorange'
  return 'green'
}

export function CheckoutForm({ product }: { product: Product }) {
  const router = useRouter()
  const [quantity, setQuantity] = useState(1)
  const [status, setStatus] = useState<Status>('idle')
  const [message, setMessage] = useState('')

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (status === 'submitting') return
    setStatus('submitting')
    setMessage('')

    const idempotencyKey = crypto.randomUUID()
    try {
      const result = await postCheckout({ productId: product.id, quantity }, idempotencyKey, getScenario())
      if ('pending' in result) {
        setStatus('pending')
        setMessage(result.message)
      } else if (result.ok) {
        setStatus('success')
        setMessage(`Compra confirmada! Pedido ${result.order.id.slice(0, 8)}.`)
      } else {
        setStatus('error')
        setMessage(result.message)
      }
    } catch {
      setStatus('error')
      setMessage('Erro de rede. Tente novamente.')
    } finally {
      router.refresh() // re-sincroniza o estoque a partir do servidor
    }
  }

  const disabled = status === 'submitting' || product.stock === 0

  return (
    <form onSubmit={onSubmit} style={{ marginTop: 8 }}>
      <input
        type="number"
        min={1}
        value={quantity}
        onChange={(e) => setQuantity(Number(e.target.value))}
        aria-label={`Quantidade de ${product.name}`}
        style={{ width: 64 }}
      />
      <button type="submit" disabled={disabled}>
        {status === 'submitting' ? 'Processando…' : 'Comprar'}
      </button>
      {message && (
        <p role="status" data-status={status} style={{ color: messageColor(status) }}>
          {message}
        </p>
      )}
    </form>
  )
}
