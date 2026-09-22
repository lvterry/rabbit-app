/**
 * Notification Repository Port
 * Handles push notifications and notification outbox
 */

export interface NotificationPayload {
  bookingId: string
  studentName: string
  courseName: string
  timeRange: string
}

export interface NotificationOutboxRecord {
  notificationId: string
  userId: string
  eventType: 'BOOKING_CREATED' | 'BOOKING_CANCELLED' | 'BOOKING_RESCHEDULED'
  payload: NotificationPayload
  status: 'Pending' | 'Sent' | 'Failed'
  attempts: number
  lastAttemptAt: string | null
  createdAt: string
}

export interface PushDevice {
  deviceId: string
  userId: string
  platform: 'ios'
  token: string
  environment: 'sandbox' | 'production'
  lastSeenAt: string
  createdAt: string
}

export interface NotificationRepository {
  /**
   * Register or update a push device
   */
  registerDevice(
    userId: string,
    platform: 'ios',
    token: string,
    environment: 'sandbox' | 'production'
  ): Promise<PushDevice>

  /**
   * Get all active devices for a user
   */
  getDevicesForUser(userId: string): Promise<PushDevice[]>

  /**
   * Revoke a device (after receiving BadDeviceToken from APNs)
   */
  revokeDevice(deviceId: string): Promise<void>

  /**
   * Enqueue notification in outbox (called within booking transaction)
   */
  enqueue(
    userId: string,
    eventType: 'BOOKING_CREATED' | 'BOOKING_CANCELLED' | 'BOOKING_RESCHEDULED',
    payload: NotificationPayload
  ): Promise<void>

  /**
   * Get pending notifications for processing
   */
  getPending(limit: number): Promise<NotificationOutboxRecord[]>

  /**
   * Mark notification as sent
   */
  markSent(notificationId: string): Promise<void>

  /**
   * Mark notification as failed and increment attempts
   */
  markFailed(notificationId: string): Promise<void>

  /**
   * Delete old sent/failed notifications
   */
  cleanup(olderThanDays: number): Promise<number>
}
