/**
 * Package Transaction Request Schema Tests
 * Verifies strict validation of discriminated union by mode
 */

import { test } from 'node:test'
import assert from 'node:assert'
import { addPackageTransactionRequestSchema } from './schemas.js'

test('addPackageTransactionRequestSchema - valid cases', () => {
  // Valid add
  const validAdd = addPackageTransactionRequestSchema.safeParse({
    mode: 'add',
    sessions: 5,
  })
  assert.strictEqual(validAdd.success, true, 'Valid add should succeed')

  // Valid add with note
  const validAddNote = addPackageTransactionRequestSchema.safeParse({
    mode: 'add',
    sessions: 5,
    note: 'Initial purchase',
  })
  assert.strictEqual(validAddNote.success, true, 'Valid add with note should succeed')

  // Valid deduct
  const validDeduct = addPackageTransactionRequestSchema.safeParse({
    mode: 'deduct',
    sessions: 2,
  })
  assert.strictEqual(validDeduct.success, true, 'Valid deduct should succeed')

  // Valid set with PURCHASE_ADJUSTMENT
  const validSetPurchase = addPackageTransactionRequestSchema.safeParse({
    mode: 'set',
    sessions: 10,
    type: 'PURCHASE_ADJUSTMENT',
  })
  assert.strictEqual(validSetPurchase.success, true, 'Valid set with PURCHASE_ADJUSTMENT should succeed')

  // Valid set with BALANCE_ADJUSTMENT
  const validSetBalance = addPackageTransactionRequestSchema.safeParse({
    mode: 'set',
    sessions: 0,
    type: 'BALANCE_ADJUSTMENT',
  })
  assert.strictEqual(validSetBalance.success, true, 'Valid set with BALANCE_ADJUSTMENT and 0 sessions should succeed')
})

test('addPackageTransactionRequestSchema - reject add/deduct with type', () => {
  // add with type should FAIL (.strict() prevents stripping)
  const addWithType = addPackageTransactionRequestSchema.safeParse({
    mode: 'add',
    sessions: 5,
    type: 'MANUAL_ADD',
  })
  assert.strictEqual(addWithType.success, false, 'add with type should fail')

  // deduct with type should FAIL
  const deductWithType = addPackageTransactionRequestSchema.safeParse({
    mode: 'deduct',
    sessions: 3,
    type: 'MANUAL_DEDUCT',
  })
  assert.strictEqual(deductWithType.success, false, 'deduct with type should fail')
})

test('addPackageTransactionRequestSchema - reject set without type', () => {
  const setWithoutType = addPackageTransactionRequestSchema.safeParse({
    mode: 'set',
    sessions: 10,
  })
  assert.strictEqual(setWithoutType.success, false, 'set without type should fail')
})

test('addPackageTransactionRequestSchema - reject set with wrong type', () => {
  const setWithReversal = addPackageTransactionRequestSchema.safeParse({
    mode: 'set',
    sessions: 10,
    type: 'REVERSAL',
  })
  assert.strictEqual(setWithReversal.success, false, 'set with REVERSAL should fail')

  const setWithManualAdd = addPackageTransactionRequestSchema.safeParse({
    mode: 'set',
    sessions: 10,
    type: 'MANUAL_ADD',
  })
  assert.strictEqual(setWithManualAdd.success, false, 'set with MANUAL_ADD should fail')
})

test('addPackageTransactionRequestSchema - reject invalid sessions', () => {
  // add with 0 sessions
  const addZero = addPackageTransactionRequestSchema.safeParse({
    mode: 'add',
    sessions: 0,
  })
  assert.strictEqual(addZero.success, false, 'add with 0 sessions should fail')

  // deduct with 0 sessions
  const deductZero = addPackageTransactionRequestSchema.safeParse({
    mode: 'deduct',
    sessions: 0,
  })
  assert.strictEqual(deductZero.success, false, 'deduct with 0 sessions should fail')

  // add with negative sessions
  const addNegative = addPackageTransactionRequestSchema.safeParse({
    mode: 'add',
    sessions: -5,
  })
  assert.strictEqual(addNegative.success, false, 'add with negative sessions should fail')

  // set with negative sessions (should fail, nonnegative means >= 0)
  const setNegative = addPackageTransactionRequestSchema.safeParse({
    mode: 'set',
    sessions: -1,
    type: 'BALANCE_ADJUSTMENT',
  })
  assert.strictEqual(setNegative.success, false, 'set with negative sessions should fail')
})
