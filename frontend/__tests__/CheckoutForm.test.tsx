import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CheckoutForm } from '../app/components/CheckoutForm'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
const postCheckout = vi.fn()
vi.mock('../app/lib/client', () => ({ postCheckout: (...args: unknown[]) => postCheckout(...args) }))
vi.mock('../app/lib/scenario', () => ({ getScenario: () => 'default' }))

const product = { id: 'p1', name: 'Capa Teste', priceCents: 4990, stock: 5 }

describe('CheckoutForm', () => {
  beforeEach(() => postCheckout.mockReset())

  it('mostra mensagem de sucesso e desabilita o botão durante o envio', async () => {
    let resolve!: (v: unknown) => void
    postCheckout.mockReturnValue(new Promise((r) => { resolve = r }))
    render(<CheckoutForm product={product} />)

    const button = screen.getByRole('button', { name: /comprar/i })
    await userEvent.click(button)
    expect(button).toBeDisabled() // durante o envio

    resolve({ ok: true, order: { id: 'abcdef123456', status: 'CONFIRMED' } })
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/confirmada/i))
    expect(button).not.toBeDisabled()
  })

  it('mostra mensagem de erro quando o checkout falha', async () => {
    postCheckout.mockResolvedValue({ ok: false, code: 'INSUFFICIENT_STOCK', message: 'Estoque insuficiente para a quantidade desejada.' })
    render(<CheckoutForm product={product} />)
    await userEvent.click(screen.getByRole('button', { name: /comprar/i }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/estoque insuficiente/i))
  })
})
