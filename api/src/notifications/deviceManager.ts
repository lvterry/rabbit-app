/**
 * Push Device Management
 * 
 * Authority: parallel-plan-v2.md §12.9, impl-guide.md §8.3
 * 
 * Handles device token registration and revocation
 */

import type { Pool } from 'pg'
import type { Principal } from '@rabbit/shared'

export interface DeviceRegistration {
  deviceId: string
  userId: string | null
  platform: 'ios'
  token: string
  environment: 'sandbox' | 'production'
  lastSeenAt: string
  revokedAt: string | null
}

export class DeviceManager {
  constructor(private pool: Pool) {}

  /**
   * Register or update device token
   * 
   * Upserts device based on token:
   * - If token exists: update lastSeenAt and owner
   * - If token is new: create device record
   * 
   * Authority: impl-guide.md §8.3
   * Token換User → 原owner解绑后绑定新User
   */
  async registerDevice(
    principal: Principal,
    platform: 'ios',
    token: string,
    environment: 'sandbox' | 'production'
  ): Promise<DeviceRegistration> {
    const userId = principal.kind === 'User' ? principal.userId : null

    // Upsert device (same token再上报 → refresh lastSeenAt)
    const result = await this.pool.query<{
      id: string
      user_id: string | null
      platform: string
      token: string
      environment: string
      last_seen_at: string
      revoked_at: string | null
    }>(
      `INSERT INTO push_device (user_id, platform, token, environment, last_seen_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (token) 
       DO UPDATE SET 
         user_id = EXCLUDED.user_id,
         last_seen_at = NOW(),
         revoked_at = NULL
       RETURNING id, user_id, platform, token, environment, last_seen_at, revoked_at`,
      [userId, platform, token, environment]
    )

    const row = result.rows[0]
    return {
      deviceId: row.id,
      userId: row.user_id,
      platform: row.platform as 'ios',
      token: row.token,
      environment: row.environment as 'sandbox' | 'production',
      lastSeenAt: row.last_seen_at,
      revokedAt: row.revoked_at,
    }
  }

  /**
   * Revoke device token
   * 
   * Called when APNs returns BadDeviceToken or Unregistered
   */
  async revokeDevice(token: string): Promise<void> {
    await this.pool.query(
      `UPDATE push_device 
       SET revoked_at = NOW() 
       WHERE token = $1 AND revoked_at IS NULL`,
      [token]
    )
  }

  /**
   * Get active devices for a user
   */
  async getActiveDevices(userId: string): Promise<DeviceRegistration[]> {
    const result = await this.pool.query<{
      id: string
      user_id: string | null
      platform: string
      token: string
      environment: string
      last_seen_at: string
      revoked_at: string | null
    }>(
      `SELECT id, user_id, platform, token, environment, last_seen_at, revoked_at
       FROM push_device
       WHERE user_id = $1 AND revoked_at IS NULL
       ORDER BY last_seen_at DESC`,
      [userId]
    )

    return result.rows.map((row) => ({
      deviceId: row.id,
      userId: row.user_id,
      platform: row.platform as 'ios',
      token: row.token,
      environment: row.environment as 'sandbox' | 'production',
      lastSeenAt: row.last_seen_at,
      revokedAt: row.revoked_at,
    }))
  }
}
