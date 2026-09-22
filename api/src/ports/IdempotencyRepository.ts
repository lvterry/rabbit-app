/**
 * Idempotency Repository Port
 * Handles idempotency record storage and checking
 */

export interface IdempotencyRecord {
  userId: string | null
  studentId: string | null
  idempotencyKey: string
  endpoint: string
  requestHash: string
  state: 'Processing' | 'Succeeded' | 'Failed'
  responseStatus: number | null
  responseBody: string | null
  createdAt: string
  completedAt: string | null
}

export interface IdempotencyRepository {
  /**
   * Try to create an idempotency record (fails if key already exists for this principal)
   */
  tryCreate(
    userId: string | null,
    studentId: string | null,
    idempotencyKey: string,
    endpoint: string,
    requestHash: string
  ): Promise<boolean>

  /**
   * Get existing idempotency record
   */
  get(
    userId: string | null,
    studentId: string | null,
    idempotencyKey: string
  ): Promise<IdempotencyRecord | null>

  /**
   * Update idempotency record with response
   */
  updateWithResponse(
    userId: string | null,
    studentId: string | null,
    idempotencyKey: string,
    responseStatus: number,
    responseBody: string
  ): Promise<void>

  /**
   * Clean up old idempotency records (older than TTL)
   */
  cleanup(olderThanHours: number): Promise<number>
}
