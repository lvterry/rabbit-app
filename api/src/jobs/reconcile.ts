/**
 * Reconciliation Job
 * 
 * Verifies data integrity and detects drift (data-model.md §7.4)
 * Checks that invariants hold and logs any violations
 * 
 * This is a health check, not a corrective action.
 * If it finds issues, alert a human - don't auto-fix.
 */

import type { Pool } from 'pg'

export interface ReconciliationResult {
  checks: number
  violations: Array<{
    check: string
    severity: 'error' | 'warning'
    message: string
    details?: any
  }>
}

/**
 * Run reconciliation checks
 * @param pool Database connection pool
 * @returns Reconciliation result
 */
export async function runReconciliation(pool: Pool): Promise<ReconciliationResult> {
  const result: ReconciliationResult = {
    checks: 0,
    violations: [],
  }

  // Check I1: Package balance range
  result.checks++
  const balanceViolations = await pool.query(
    `SELECT id, student_id, course_id, purchased_sessions, remaining_sessions
     FROM lesson_package
     WHERE remaining_sessions < 0 OR remaining_sessions > purchased_sessions`
  )
  if (balanceViolations.rows.length > 0) {
    result.violations.push({
      check: 'I1_BALANCE_RANGE',
      severity: 'error',
      message: `Found ${balanceViolations.rows.length} packages with invalid balance`,
      details: balanceViolations.rows,
    })
  }

  // Check I2: Multiple active sessions per booking
  result.checks++
  const multipleActiveSessions = await pool.query(
    `SELECT booking_id, COUNT(*) as count
     FROM lesson_session
     WHERE status = 'Active'
     GROUP BY booking_id
     HAVING COUNT(*) > 1`
  )
  if (multipleActiveSessions.rows.length > 0) {
    result.violations.push({
      check: 'I2_MULTIPLE_ACTIVE_SESSIONS',
      severity: 'error',
      message: `Found ${multipleActiveSessions.rows.length} bookings with multiple active sessions`,
      details: multipleActiveSessions.rows,
    })
  }

  // Check I3: Overlapping upcoming bookings
  result.checks++
  const overlappingBookings = await pool.query(
    `SELECT b1.id as booking1, b2.id as booking2, b1.teacher_id, b1.start_at, b1.end_at
     FROM booking b1
     JOIN booking b2 ON b1.teacher_id = b2.teacher_id
       AND b1.id < b2.id
       AND b1.status = 'Upcoming'
       AND b2.status = 'Upcoming'
       AND tstzrange(b1.start_at, b1.end_at, '[)') && tstzrange(b2.start_at, b2.end_at, '[)')
     LIMIT 10`
  )
  if (overlappingBookings.rows.length > 0) {
    result.violations.push({
      check: 'I3_OVERLAPPING_BOOKINGS',
      severity: 'error',
      message: `Found ${overlappingBookings.rows.length} overlapping bookings`,
      details: overlappingBookings.rows,
    })
  }

  // Check I4: Ledger sum matches balance
  result.checks++
  const ledgerMismatch = await pool.query(
    `SELECT lp.id, lp.student_id, lp.course_id,
            lp.remaining_sessions as current_remaining,
            COALESCE(SUM(pt.amount), 0) as ledger_sum
     FROM lesson_package lp
     LEFT JOIN package_transaction pt ON pt.lesson_package_id = lp.id
     GROUP BY lp.id, lp.student_id, lp.course_id, lp.remaining_sessions
     HAVING lp.remaining_sessions <> COALESCE(SUM(pt.amount), 0)
     LIMIT 10`
  )
  if (ledgerMismatch.rows.length > 0) {
    result.violations.push({
      check: 'I4_LEDGER_MISMATCH',
      severity: 'error',
      message: `Found ${ledgerMismatch.rows.length} packages with ledger/balance mismatch`,
      details: ledgerMismatch.rows,
    })
  }

  // Check I6: Duplicate user_id within teacher
  result.checks++
  const duplicateUserIds = await pool.query(
    `SELECT teacher_id, user_id, COUNT(*) as count
     FROM student
     WHERE user_id IS NOT NULL
     GROUP BY teacher_id, user_id
     HAVING COUNT(*) > 1`
  )
  if (duplicateUserIds.rows.length > 0) {
    result.violations.push({
      check: 'I6_DUPLICATE_USER_ID',
      severity: 'error',
      message: `Found ${duplicateUserIds.rows.length} duplicate user_id within teachers`,
      details: duplicateUserIds.rows,
    })
  }

  // Check: Completed booking without active_session_id
  result.checks++
  const completedWithoutSession = await pool.query(
    `SELECT id, teacher_id, student_id, course_id
     FROM booking
     WHERE status = 'Completed' AND active_session_id IS NULL
     LIMIT 10`
  )
  if (completedWithoutSession.rows.length > 0) {
    result.violations.push({
      check: 'COMPLETED_WITHOUT_SESSION',
      severity: 'error',
      message: `Found ${completedWithoutSession.rows.length} completed bookings without session`,
      details: completedWithoutSession.rows,
    })
  }

  // Check: Cancelled booking with active_session_id
  result.checks++
  const cancelledWithSession = await pool.query(
    `SELECT id, teacher_id, student_id, course_id
     FROM booking
     WHERE status = 'Cancelled' AND active_session_id IS NOT NULL
     LIMIT 10`
  )
  if (cancelledWithSession.rows.length > 0) {
    result.violations.push({
      check: 'CANCELLED_WITH_SESSION',
      severity: 'warning',
      message: `Found ${cancelledWithSession.rows.length} cancelled bookings with session`,
      details: cancelledWithSession.rows,
    })
  }

  // Check: Orphaned sessions (booking deleted but session remains)
  result.checks++
  const orphanedSessions = await pool.query(
    `SELECT ls.id, ls.booking_id
     FROM lesson_session ls
     LEFT JOIN booking b ON ls.booking_id = b.id
     WHERE b.id IS NULL
     LIMIT 10`
  )
  if (orphanedSessions.rows.length > 0) {
    result.violations.push({
      check: 'ORPHANED_SESSIONS',
      severity: 'error',
      message: `Found ${orphanedSessions.rows.length} orphaned sessions`,
      details: orphanedSessions.rows,
    })
  }

  console.log(`[reconcile] Ran ${result.checks} checks, found ${result.violations.length} violations`)

  return result
}

/**
 * Main entry point for cron/scheduler
 * Usage: node -r tsx/cjs api/src/jobs/reconcile.ts
 */
if (require.main === module) {
  const { getPool } = require('../db/connection')

  const pool = getPool()

  runReconciliation(pool)
    .then(result => {
      console.log(`Reconciliation complete: ${result.checks} checks`)
      if (result.violations.length > 0) {
        console.error(`Found ${result.violations.length} violations:`)
        result.violations.forEach(v => {
          console.error(`  [${v.severity}] ${v.check}: ${v.message}`)
        })
        process.exit(1)
      } else {
        console.log('All checks passed')
        process.exit(0)
      }
    })
    .catch(err => {
      console.error('Fatal error:', err)
      process.exit(1)
    })
    .finally(() => {
      pool.end()
    })
}
