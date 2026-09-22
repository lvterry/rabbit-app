/**
 * Notification Outbox Worker
 * 
 * Authority: parallel-plan-v2.md §19, impl-guide.md §8.3
 * 
 * Processes notification_outbox table:
 * - BadDeviceToken/Unregistered → revoke device
 * - 503/TooManyRequests/network → retry
 * - Max 5 attempts
 */

import type { Pool } from 'pg'
import { APNsClient, type PushPayload } from './apnsClient'
import { DeviceManager } from './deviceManager'

interface OutboxRecord {
  id: string
  userId: string
  notificationType: string
  payload: any
  attemptCount: number
  lastAttemptAt: string | null
  completedAt: string | null
  failedAt: string | null
  createdAt: string
}

export class NotificationOutboxWorker {
  private apns: APNsClient
  private deviceManager: DeviceManager
  private isRunning = false

  constructor(private pool: Pool) {
    this.apns = new APNsClient()
    this.deviceManager = new DeviceManager(pool)
  }

  /**
   * Start processing outbox in a loop
   */
  async start(): Promise<void> {
    this.isRunning = true
    console.log('[Outbox] Worker started')

    while (this.isRunning) {
      try {
        await this.processNextBatch()
        // Wait 5 seconds between batches
        await new Promise((resolve) => setTimeout(resolve, 5000))
      } catch (error) {
        console.error('[Outbox] Batch processing error:', error)
        // Wait 10 seconds on error
        await new Promise((resolve) => setTimeout(resolve, 10000))
      }
    }
  }

  /**
   * Stop the worker
   */
  stop(): void {
    this.isRunning = false
    console.log('[Outbox] Worker stopping')
  }

  /**
   * Process next batch of pending notifications
   */
  async processNextBatch(): Promise<void> {
    // Fetch pending notifications (not completed/failed, attempt_count < 5)
    const result = await this.pool.query<OutboxRecord>(
      `SELECT id, user_id, notification_type, payload, attempt_count, 
              last_attempt_at, completed_at, failed_at, created_at
       FROM notification_outbox
       WHERE completed_at IS NULL 
         AND failed_at IS NULL
         AND attempt_count < 5
       ORDER BY created_at ASC
       LIMIT 10`
    )

    for (const record of result.rows) {
      await this.processNotification(record)
    }
  }

  /**
   * Process a single notification
   */
  private async processNotification(record: OutboxRecord): Promise<void> {
    const { id, userId, notificationType, payload } = record

    // Get active devices for user
    const devices = await this.deviceManager.getActiveDevices(userId)

    if (devices.length === 0) {
      // No devices - mark as completed (nothing to send)
      await this.markCompleted(id)
      return
    }

    let allSucceeded = true
    let shouldRetry = false

    // Send to all devices
    for (const device of devices) {
      const result = await this.apns.send(device.token, {
        bookingId: payload.bookingId,
        studentName: payload.studentName,
        courseName: payload.courseName,
        timeRange: payload.timeRange,
      })

      if (result.shouldRevoke) {
        // Revoke bad device token
        await this.deviceManager.revokeDevice(device.token)
        console.log(`[Outbox] Revoked device ${device.deviceId}`)
      }

      if (!result.success) {
        allSucceeded = false
        if (result.shouldRetry) {
          shouldRetry = true
        }
      }
    }

    // Update outbox record
    if (allSucceeded) {
      await this.markCompleted(id)
    } else if (shouldRetry && record.attemptCount < 4) {
      // Increment attempt count for retry
      await this.incrementAttempt(id)
    } else {
      // Max attempts reached or non-retryable error
      await this.markFailed(id)
    }
  }

  /**
   * Mark notification as completed
   */
  private async markCompleted(outboxId: string): Promise<void> {
    await this.pool.query(
      `UPDATE notification_outbox 
       SET completed_at = NOW() 
       WHERE id = $1`,
      [outboxId]
    )
  }

  /**
   * Increment attempt count
   */
  private async incrementAttempt(outboxId: string): Promise<void> {
    await this.pool.query(
      `UPDATE notification_outbox 
       SET attempt_count = attempt_count + 1,
           last_attempt_at = NOW()
       WHERE id = $1`,
      [outboxId]
    )
  }

  /**
   * Mark notification as failed
   */
  private async markFailed(outboxId: string): Promise<void> {
    await this.pool.query(
      `UPDATE notification_outbox 
       SET failed_at = NOW() 
       WHERE id = $1`,
      [outboxId]
    )
  }

  /**
   * Shutdown worker
   */
  async shutdown(): Promise<void> {
    this.stop()
    await this.apns.shutdown()
  }
}
