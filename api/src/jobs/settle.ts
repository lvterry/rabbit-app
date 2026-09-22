/**
 * Auto-Settlement Worker
 * 
 * Automatically settles overdue bookings (data-model.md §7.1)
 * Runs periodically to complete bookings that have passed autoSettleHours
 * 
 * Business rule: Booking past end_at + autoSettleHours → auto-complete
 * Creates SESSION_COMPLETED transaction
 */

import type { Pool } from 'pg'
import { BookingRepositoryImpl } from '../db/repositories/BookingRepositoryImpl'
import { PackageRepositoryImpl } from '../db/repositories/PackageRepositoryImpl'

export interface SettleJobResult {
  settled: number
  errors: Array<{ bookingId: string; error: string }>
}

/**
 * Run auto-settlement job
 * @param pool Database connection pool
 * @param batchSize Maximum bookings to settle in one run
 * @returns Settlement result
 */
export async function runAutoSettlement(
  pool: Pool
): Promise<SettleJobResult> {
  const bookingRepo = new BookingRepositoryImpl(pool)
  const result: SettleJobResult = {
    settled: 0,
    errors: [],
  }

  try {
    const settledCount = await bookingRepo.autoSettle()
    result.settled = settledCount

    console.log(`[settle] Auto-settled ${settledCount} bookings`)
  } catch (error) {
    console.error('[settle] Auto-settlement failed:', error)
    result.errors.push({
      bookingId: 'batch',
      error: error instanceof Error ? error.message : String(error),
    })
  }

  return result
}

/**
 * Main entry point for cron/scheduler
 * Usage: node -r tsx/cjs api/src/jobs/settle.ts
 */
if (require.main === module) {
  const { Pool } = require('pg')
  const { getPool } = require('../db/connection')

  const pool = getPool()

  runAutoSettlement(pool)
    .then(result => {
      console.log(`Settlement complete: ${result.settled} settled, ${result.errors.length} errors`)
      if (result.errors.length > 0) {
        console.error('Errors:', result.errors)
      }
      process.exit(result.errors.length > 0 ? 1 : 0)
    })
    .catch(err => {
      console.error('Fatal error:', err)
      process.exit(1)
    })
    .finally(() => {
      pool.end()
    })
}
