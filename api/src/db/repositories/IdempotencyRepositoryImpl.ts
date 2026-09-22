/**
 * IdempotencyRepositoryImpl
 * 
 * Implements Write A pattern:
 * - Check for existing record at transaction start
 * - Execute business logic
 * - Record success in the SAME transaction before commit
 * 
 * auth-model.md §5: Always derives actor IDs from Principal
 */

import type { Pool } from 'pg'
import type { Principal } from '@rabbit/shared'
import type { IdempotencyRepository, IdempotencyHit } from '../../ports/IdempotencyRepository'

export class IdempotencyRepositoryImpl implements IdempotencyRepository {
  constructor(private pool: Pool) {}

  /**
   * Extract actor identifiers from Principal
   * Returns { userId, studentId } with appropriate nulls
   */
  private getPrincipalIds(principal: Principal): { userId: string | null; studentId: string | null } {
    switch (principal.kind) {
      case 'User':
        return { userId: principal.userId, studentId: null }
      case 'Student':
        return { userId: null, studentId: principal.studentId }
      case 'InviteToken':
      case 'Public':
        return { userId: null, studentId: null }
    }
  }

  async findExisting(
    principal: Principal,
    endpoint: string,
    idempotencyKey: string
  ): Promise<IdempotencyHit | null> {
    const { userId, studentId } = this.getPrincipalIds(principal)

    const result = await this.pool.query<{
      request_hash: string
      response_status: number
      response_body: string
    }>(
      `SELECT request_hash, response_status, response_body
       FROM idempotency_record
       WHERE endpoint = $1
         AND idempotency_key = $2
         AND (user_id IS NOT DISTINCT FROM $3)
         AND (student_id IS NOT DISTINCT FROM $4)
         AND expires_at > now()`,
      [endpoint, idempotencyKey, userId, studentId]
    )

    if (result.rows.length === 0) {
      return null
    }

    const row = result.rows[0]
    return {
      requestHash: row.request_hash,
      responseStatus: row.response_status,
      responseBody: row.response_body,
    }
  }

  async recordSuccess(
    principal: Principal,
    endpoint: string,
    idempotencyKey: string,
    requestHash: string,
    responseStatus: number,
    responseBody: string,
    ttlHours: number
  ): Promise<void> {
    const { userId, studentId } = this.getPrincipalIds(principal)

    await this.pool.query(
      `INSERT INTO idempotency_record (
        user_id,
        student_id,
        endpoint,
        idempotency_key,
        request_hash,
        response_status,
        response_body,
        expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, now() + ($8 || ' hours')::interval)`,
      [
        userId,
        studentId,
        endpoint,
        idempotencyKey,
        requestHash,
        responseStatus,
        responseBody,
        ttlHours,
      ]
    )
  }

  async cleanup(olderThanHours: number): Promise<number> {
    const result = await this.pool.query(
      `DELETE FROM idempotency_record
       WHERE expires_at < now() - ($1 || ' hours')::interval`,
      [olderThanHours]
    )

    return result.rowCount || 0
  }
}
