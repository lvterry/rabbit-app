/**
 * Idempotency Repository Port
 * Write A pattern: check for existing record, execute business logic,
 * insert successful idempotency record in the SAME transaction.
 */

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
   */
  findExisting(
    userId: string | null,
    studentId: string | null,
    endpoint: string,
    idempotencyKey: string
  ): Promise<IdempotencyHit | null>

  /**
   * Record a successful idempotent operation.
   * Called at the END of the business transaction, before commit.
   * Principal comes from ctx.principal (userId/studentId), not from request body.
   */
  recordSuccess(
    userId: string | null,
    studentId: string | null,
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
