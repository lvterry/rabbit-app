#!/usr/bin/env tsx

/**
 * Fixture Validation Script
 * Validates all JSON fixtures against actual Zod schemas from @rabbit/shared
 */

import { readFile } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import * as schemas from '../packages/shared/src/index.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const fixturesRoot = join(__dirname, '../contracts/fixtures')

// Map fixtures to their corresponding schemas
const fixtureMap: Record<string, { type: 'success' | 'error'; schema?: string; expectedCode?: string }> = {
  'meta.json': { type: 'success', schema: 'metaResponseSchema' },
  'auth/me-user-teacher.json': { type: 'success', schema: 'meResponseSchema' },
  'auth/me-user-teacher-and-student.json': { type: 'success', schema: 'meResponseSchema' },
  'invites/pending.json': { type: 'success', schema: 'invitePreviewSchema' },
  'invites/consumed-matching-session.json': { type: 'success', schema: 'invitePreviewSchema' },
  'invites/consumed-foreign-session-error.json': { type: 'error', expectedCode: 'INVITE_CONSUMED' },
  'invites/expired-error.json': { type: 'error', expectedCode: 'INVITE_EXPIRED' },
  'students/student-home-anonymous.json': { type: 'success', schema: 'studentHomeViewSchema' },
  'students/student-home-user-multi-teacher.json': { type: 'success', schema: 'studentHomeViewSchema' },
  'students/student-detail.json': { type: 'success', schema: 'studentDetailViewSchema' },
  'slots/bookable-days.json': { type: 'success', schema: 'bookableDaysResponseSchema' },
  'slots/slots.json': { type: 'success', schema: 'slotsResponseSchema' },
  'slots/no-availability.json': { type: 'success', schema: 'slotsResponseSchema' },
  'slots/fully-booked.json': { type: 'success', schema: 'slotsResponseSchema' },
  'slots/insufficient-sessions.json': { type: 'success', schema: 'slotsResponseSchema' },
  'bookings/upcoming-teacher.json': { type: 'success', schema: 'bookingViewSchema' },
  'bookings/upcoming-student.json': { type: 'success', schema: 'bookingViewSchema' },
  'bookings/completed.json': { type: 'success', schema: 'bookingViewSchema' },
  'bookings/cancelled-free.json': { type: 'success', schema: 'bookingViewSchema' },
  'bookings/cancelled-late.json': { type: 'success', schema: 'bookingViewSchema' },
  'errors/slot-taken.json': { type: 'error', expectedCode: 'SLOT_TAKEN' },
  'errors/late-reschedule-insufficient.json': { type: 'error', expectedCode: 'LATE_RESCHEDULE_INSUFFICIENT' },
  'errors/token-expired.json': { type: 'error', expectedCode: 'TOKEN_EXPIRED' },
  'errors/network-error-client-only.json': { type: 'error', expectedCode: 'NETWORK_ERROR' },
}

async function validateFixture(
  fixturePath: string,
  config: { type: 'success' | 'error'; schema?: string; expectedCode?: string }
): Promise<{ path: string; success: boolean; error?: any }> {
  const fullPath = join(fixturesRoot, fixturePath)
  try {
    const content = await readFile(fullPath, 'utf-8')
    const json = JSON.parse(content)
    
    // Validate envelope structure
    if (config.type === 'success') {
      if (!config.schema) {
        throw new Error('Success fixtures must specify a schema')
      }
      const dataSchema = (schemas as any)[config.schema]
      if (!dataSchema) {
        throw new Error(`Schema not found: ${config.schema}`)
      }
      const successEnvelope = schemas.apiSuccessResponseSchema(dataSchema)
      successEnvelope.parse(json)
    } else {
      schemas.apiErrorResponseSchema.parse(json)
      // Check for expected error code
      if (config.expectedCode && json.code !== config.expectedCode) {
        throw new Error(`Expected code '${config.expectedCode}' but got '${json.code}'`)
      }
    }
    
    return { path: fixturePath, success: true }
  } catch (error: any) {
    return {
      path: fixturePath,
      success: false,
      error: error.issues ? error.issues : error.message,
    }
  }
}

async function main() {
  console.log('🔍 Validating fixtures against actual Zod schemas from @rabbit/shared...\n')

  const results = await Promise.all(
    Object.entries(fixtureMap).map(([path, config]) => validateFixture(path, config))
  )

  const passed = results.filter((r) => r.success)
  const failed = results.filter((r) => !r.success)

  console.log(`✅ Passed: ${passed.length}`)
  passed.forEach((r) => console.log(`   ${r.path}`))

  if (failed.length > 0) {
    console.log(`\n❌ Failed: ${failed.length}`)
    failed.forEach((r) => {
      console.log(`   ${r.path}`)
      console.log(`   Error:`, JSON.stringify(r.error, null, 2))
    })
    process.exit(1)
  }

  console.log('\n✅ All fixtures validated against real shared schemas!')
}

main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
