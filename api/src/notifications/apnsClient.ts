/**
 * APNs Client
 * 
 * Authority: impl-guide.md §8.3
 * 
 * Sends push notifications via Apple Push Notification service
 */

import apn from 'node-apn'

export interface PushPayload {
  bookingId: string
  studentName: string
  courseName: string
  timeRange: string
}

export type APNsError =
  | 'BadDeviceToken'
  | 'Unregistered'
  | 'TooManyRequests'
  | 'ServiceUnavailable'
  | 'NetworkError'
  | 'Unknown'

export interface APNsResult {
  success: boolean
  error?: APNsError
  shouldRetry: boolean
  shouldRevoke: boolean
}

export class APNsClient {
  private provider: apn.Provider | null = null

  constructor() {
    // Initialize APNs provider if credentials are available
    const keyPath = process.env.APNS_KEY_PATH
    const keyId = process.env.APNS_KEY_ID
    const teamId = process.env.APNS_TEAM_ID

    if (keyPath && keyId && teamId) {
      this.provider = new apn.Provider({
        token: {
          key: keyPath,
          keyId,
          teamId,
        },
        production: process.env.NODE_ENV === 'production',
      })
    }
  }

  /**
   * Send push notification
   * 
   * Returns result indicating success, retry, or revoke
   */
  async send(deviceToken: string, payload: PushPayload): Promise<APNsResult> {
    if (!this.provider) {
      console.warn('[APNs] Provider not initialized - missing credentials')
      return {
        success: false,
        error: 'NetworkError',
        shouldRetry: false,
        shouldRevoke: false,
      }
    }

    // Create notification with minimal payload (impl-guide.md §8.3)
    const notification = new apn.Notification()
    notification.topic = process.env.APNS_BUNDLE_ID || 'com.rabbit.app'
    notification.alert = {
      title: '新预约',
      body: `${payload.studentName} - ${payload.courseName}`,
    }
    notification.badge = 1
    notification.sound = 'default'
    notification.payload = {
      bookingId: payload.bookingId,
    }

    try {
      const result = await this.provider.send(notification, deviceToken)

      // Check for failures
      if (result.failed && result.failed.length > 0) {
        const failure = result.failed[0]
        const reason = failure.response?.reason || 'Unknown'

        // Map APNs error to our error types
        if (reason === 'BadDeviceToken' || reason === 'Unregistered') {
          return {
            success: false,
            error: reason,
            shouldRetry: false,
            shouldRevoke: true,
          }
        }

        if (reason === 'TooManyRequests' || reason === 'ServiceUnavailable') {
          return {
            success: false,
            error: reason === 'TooManyRequests' ? 'TooManyRequests' : 'ServiceUnavailable',
            shouldRetry: true,
            shouldRevoke: false,
          }
        }

        return {
          success: false,
          error: 'Unknown',
          shouldRetry: false,
          shouldRevoke: false,
        }
      }

      return {
        success: true,
        shouldRetry: false,
        shouldRevoke: false,
      }
    } catch (error) {
      console.error('[APNs] Send error:', error)
      return {
        success: false,
        error: 'NetworkError',
        shouldRetry: true,
        shouldRevoke: false,
      }
    }
  }

  /**
   * Shutdown APNs provider
   */
  async shutdown(): Promise<void> {
    if (this.provider) {
      await this.provider.shutdown()
    }
  }
}
