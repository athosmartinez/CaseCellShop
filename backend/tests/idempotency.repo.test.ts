// backend/tests/idempotency.repo.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { createDb, type DB } from '../src/db/connection'
import { applySchema } from '../src/db/schema'
import { IdempotencyRepository } from '../src/repositories/idempotency'

describe('IdempotencyRepository', () => {
  let db: DB
  let repo: IdempotencyRepository
  beforeEach(() => {
    db = createDb(':memory:')
    applySchema(db)
    repo = new IdempotencyRepository(db)
  })

  it('tryClaim retorna true na 1ª vez e false na repetição', () => {
    expect(repo.tryClaim('k1')).toBe(true)
    expect(repo.tryClaim('k1')).toBe(false)
  })

  it('finalize/getOutcome persistem o desfecho gravado', () => {
    repo.tryClaim('k1')
    expect(repo.getOutcome('k1')).toEqual({ httpStatus: null, body: null, orderId: null })
    repo.finalize('k1', { httpStatus: 201, body: { ok: true } })
    expect(repo.getOutcome('k1')).toEqual({ httpStatus: 201, body: { ok: true }, orderId: null })
  })
})
