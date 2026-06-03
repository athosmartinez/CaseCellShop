// backend/tests/env.test.ts
import { describe, it, expect } from 'vitest'
import { parseEnv } from '../src/config/env'

describe('parseEnv', () => {
  it('aplica defaults quando o ambiente está vazio', () => {
    const env = parseEnv({})
    expect(env.PORT).toBe(3001)
    expect(env.ERP_FAILURE_RATE).toBe(0.25)
    expect(env.ERP_MAX_RETRIES).toBe(2)
    expect(env.NODE_ENV).toBe('development')
  })

  it('coage strings numéricas e valida faixa de ERP_FAILURE_RATE', () => {
    expect(parseEnv({ PORT: '4000' }).PORT).toBe(4000)
    expect(() => parseEnv({ ERP_FAILURE_RATE: '2' })).toThrow()
  })
})
