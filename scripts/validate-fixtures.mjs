#!/usr/bin/env node

/**
 * Fixture Validation Script
 * Validates all JSON fixtures against Zod schemas
 * 
 * Note: This script validates basic envelope structure and field presence.
 * Full schema validation will be available once shared package is built.
 */

import { readFile } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { z } from 'zod'

// Basic envelope schemas for validation
const apiMetaSchema = z.object({
  generatedAt: z.string(),
  requestId: z.string(),
})

const apiSuccessEnvelopeSchema = z.object({
  ok: z.literal(true),
  data: z.any(),
  meta: apiMetaSchema,
})

const apiErrorEnvelopeSchema = z.object({
  ok: z.literal(false),
  code: z.string(),
  message: z.string(),
  retryable: z.boolean(),
  details: z.any(),
  requestId: z.string(),
})

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const fixturesRoot = join(__dirname, '../contracts/fixtures')

// Map fixtures to whether they should be success or error envelopes
const fixtureMap = {
  'meta.json': { type: 'success', expectedFields: ['version', 'minSupportedVersion', 'serverTime'] },
  'auth/me-user-teacher.json': { type: 'success', expectedFields: ['teacherId', 'userId', 'name'] },
  'auth/me-user-teacher-and-student.json': { type: 'success', expectedFields: ['teacherId', 'userId', 'name'] },
  'invites/pending.json': { type: 'success', expectedFields: ['token', 'teacherName', 'status'] },
  'invites/consumed-matching-session.json': { type: 'success', expectedFields: ['token', 'alreadyAccepted'] },
  'invites/consumed-foreign-session-error.json': { type: 'error', expectedCode: 'INVITE_CONSUMED' },
  'invites/expired-error.json': { type: 'error', expectedCode: 'INVITE_EXPIRED' },
  'students/student-home-anonymous.json': { type: 'success', expectedFields: ['studentId', 'courses'] },
  'students/student-home-user-multi-teacher.json': { type: 'success', expectedFields: ['studentId', 'courses'] },
  'students/student-detail.json': { type: 'success', expectedFields: ['studentId', 'packages'] },
  'slots/bookable-days.json': { type: 'success', expectedFields: ['timezone', 'days'] },
  'slots/slots.json': { type: 'success', expectedFields: ['date', 'slots'] },
  'slots/no-availability.json': { type: 'success', expectedFields: ['date', 'reason'] },
  'slots/fully-booked.json': { type: 'success', expectedFields: ['date', 'reason'] },
  'slots/insufficient-sessions.json': { type: 'success', expectedFields: ['date', 'reason'] },
  'bookings/upcoming-teacher.json': { type: 'success', expectedFields: ['bookingId', 'status', 'actions'] },
  'bookings/upcoming-student.json': { type: 'success', expectedFields: ['bookingId', 'status', 'actions'] },
  'bookings/completed.json': { type: 'success', expectedFields: ['bookingId', 'status', 'actions'] },
  'bookings/cancelled-free.json': { type: 'success', expectedFields: ['bookingId', 'status', 'cancelledBy'] },
  'bookings/cancelled-late.json': { type: 'success', expectedFields: ['bookingId', 'status', 'cancelledBy'] },
  'errors/slot-taken.json': { type: 'error', expectedCode: 'SLOT_TAKEN' },
  'errors/late-reschedule-insufficient.json': { type: 'error', expectedCode: 'LATE_RESCHEDULE_INSUFFICIENT' },
  'errors/token-expired.json': { type: 'error', expectedCode: 'TOKEN_EXPIRED' },
  'errors/network-error-client-only.json': { type: 'error', expectedCode: 'NETWORK_ERROR' },
}

async function validateFixture(fixturePath, config) {
  const fullPath = join(fixturesRoot, fixturePath)
  try {
    const content = await readFile(fullPath, 'utf-8')
    const json = JSON.parse(content)
    
    // Validate envelope structure
    if (config.type === 'success') {
      apiSuccessEnvelopeSchema.parse(json)
      // Check for expected fields in data
      for (const field of config.expectedFields) {
        if (!(field in json.data)) {
          throw new Error(`Missing expected field in data: ${field}`)
        }
      }
    } else {
      apiErrorEnvelopeSchema.parse(json)
      // Check for expected error code
      if (config.expectedCode && json.code !== config.expectedCode) {
        throw new Error(`Expected code '${config.expectedCode}' but got '${json.code}'`)
      }
    }
    
    return { path: fixturePath, success: true }
  } catch (error) {
    return {
      path: fixturePath,
      success: false,
      error: error instanceof z.ZodError ? error.format() : error.message,
    }
  }
}

async function main() {
  console.log('🔍 Validating fixtures against Zod schemas...\n')

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

  console.log('\n✅ All fixtures valid!')
}

main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
