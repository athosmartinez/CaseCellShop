import type { DB } from '../db/connection'

export interface StoredOutcome { httpStatus: number; body: unknown }

interface OutcomeRow { order_id: string | null; http_status: number | null; response_json: string | null }

export class IdempotencyRepository {
  constructor(private db: DB) {}

  /** Tenta reivindicar a chave. true = nova; false = já existia. */
  tryClaim(key: string): boolean {
    try {
      this.db.prepare('INSERT INTO idempotency_keys (key) VALUES (?)').run(key)
      return true
    } catch (e) {
      if (e instanceof Error && (e as { code?: string }).code === 'SQLITE_CONSTRAINT_PRIMARYKEY') return false
      throw e
    }
  }

  linkOrder(key: string, orderId: string): void {
    this.db.prepare('UPDATE idempotency_keys SET order_id = ? WHERE key = ?').run(orderId, key)
  }

  finalize(key: string, outcome: StoredOutcome): void {
    this.db
      .prepare('UPDATE idempotency_keys SET http_status = ?, response_json = ? WHERE key = ?')
      .run(outcome.httpStatus, JSON.stringify(outcome.body), key)
  }

  getOutcome(key: string): { httpStatus: number | null; body: unknown | null; orderId: string | null } | null {
    const row = this.db
      .prepare('SELECT order_id, http_status, response_json FROM idempotency_keys WHERE key = ?')
      .get(key) as OutcomeRow | undefined
    if (!row) return null
    return {
      httpStatus: row.http_status,
      body: row.response_json ? JSON.parse(row.response_json) : null,
      orderId: row.order_id,
    }
  }
}
