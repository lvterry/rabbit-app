/**
 * Idempotency Repository Port
 * Write A pattern: check for existing record, execute business logic,
 * insert successful idempotency record in the SAME transaction.
 */

import type { Principal } from '@rabbit/shared'

export interface IdempotencyHit {
  requestHash: string
  responseStatus: number
  responseBody: string
}

export interface IdempotencyRepository {
  /**
   * Check if an idempotency record exists for this principal + key.
   * Returns the cached response if found (for replay), null otherwise.
   * This is the fast path at the start of the transaction.
   * Takes Principal to avoid actor-id drift (auth-model.md §5).
   */
  findExisting(
    principal: Principal,
    endpoint: string,
    idempotencyKey: string
  ): Promise<IdempotencyHit | null>

  /**
   * Record a successful idempotent operation.
   * Called at the END of the business transaction, before commit.
   * Takes Principal from ctx.principal (auth-model.md §5).
   */
  recordSuccess(
    principal: Principal,
    endpoint: string,
    idempotencyKey: string,
    requestHash: string,
    responseStatus: number,
    responseBody: string,
    ttlHours: number
  ): Promise<void>

  /**
   * Clean up old idempotency records (older than TTL).
   * This is the only DELETE operation allowed on this table.
   */
  cleanup(olderThanHours: number): Promise<number>
}
