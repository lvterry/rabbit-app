# Agent B Implementation Notes

## Completed

### 1. Slots - Real Implementation ✅
- Replaced `NO_AVAILABILITY` stub with full `computeSlots` integration
- View derivation from Principal capability (never trusts client `view` param)
- Teacher view: no restrictions (minLeadHours=0, maxAdvanceDays=999)
- Student view: applies minLeadHours and maxAdvanceDays restrictions
- Integrates with `api/src/domain/slot.ts` (Agent A's work)

### 2. Push Notifications ✅
- **Device Registration**: `POST /v1/me/devices` with real database persistence
  - Upserts device token on repeat registration
  - Token換User → 原owner解綁後綁定新User
  - Only User principals (teachers) can register
  
- **Device Manager**: 
  - `registerDevice()`: upsert to push_device table
  - `revokeDevice()`: set revoked_at on bad tokens
  - `getActiveDevices()`: fetch non-revoked devices

- **APNs Client**:
  - Minimal payload: bookingId, studentName, courseName, timeRange
  - BadDeviceToken/Unregistered → shouldRevoke=true
  - 503/TooManyRequests → shouldRetry=true
  - Network errors → shouldRetry=true

- **Outbox Worker**:
  - Processes notification_outbox table in batches
  - Max 5 retry attempts per notification
  - Revokes bad device tokens automatically
  - Increments attempt_count on retryable failures

### 3. Integration Tests ✅
All §19 checklist items covered:
- ✅ Invite flows (pending preview, anonymous accept, existing User accept, consumed revisit)
- ✅ Dual-role User (teacher + student)
- ✅ Cross-resource 403
- ✅ Teacher capability
- ✅ studentId required (teacher代约) / forbidden (student self)
- ✅ Forbidden fields source/by/asTeacher → VALIDATION_FAILED
- ✅ Idempotent replay + IDEMPOTENCY_KEY_REUSED
- ✅ SLOT_TAKEN from overlap (never leaks booking owner)
- ✅ Slots auth / capability view

**Test Results**: `pnpm test:integration` ✅ All 71 tests passing

### 4. Contract Gate ✅
`pnpm typecheck` passes without errors.

## Authentication Stubs

Per parallel-plan-v2.md §12.1, Phase 0 authentication routes are implemented as documented stubs:

### Apple Sign In (POST /v1/auth/apple)
- **Status**: Stub implementation
- **Behavior**: Returns success with fake tokens for development
- **Production Requirements**: 
  - Verify `identityToken` with Apple's public keys
  - Extract `sub` (Apple user ID) from JWT
  - Create or find user by `apple_id`
  - Issue real User session tokens

### Email Verification (POST /v1/auth/email/request, /verify)
- **Status**: Stub implementation
- **Behavior**: 
  - `/request`: Always returns success
  - `/verify`: Returns success with fake tokens
- **Production Requirements**:
  - Generate secure verification code
  - Send via email service
  - Store code with expiration
  - Verify code before issuing session

### Token Refresh (POST /v1/auth/refresh)
- **Status**: Fully implemented ✅
- Uses real JWT verification
- Issues new access tokens from valid refresh tokens

### Session Metadata (GET /v1/auth/me, /meta)
- **Status**: Fully implemented ✅
- Returns Principal info and teacher/student capabilities
- Properly queries teacher profile and student bindings

## Architecture Compliance

### Ownership Paths ✅
All modifications within allowed paths:
- `api/src/routes/**`
- `api/src/middleware/**`
- `api/src/auth/**`
- `api/src/http/**`
- `api/src/notifications/**`
- `api/src/server.ts`
- `api/test/integration/**`

### No Modifications ✅
- ❌ `packages/shared/**` (unchanged)
- ❌ `contracts/**` (unchanged)
- ❌ `api/src/db/migrations/**` (unchanged)
- ❌ `api/src/domain/**` (unchanged, only imported)

## Known Issues

### Pre-existing Test Failures
Some `test/domain` tests fail (Agent A's domain logic):
- `test/domain/package-selection.test.ts`: Late reschedule affordability logic
- `test/domain/slot-algorithm.test.ts`: Slot generation edge cases

These are NOT introduced by Agent B's work and do NOT block PR acceptance:
1. Agent B must not modify domain algorithms (per task ownership)
2. Contract Gate (typecheck) is green ✅
3. Agent B's integration tests pass ✅

### Database Tests
`test/db/**` tests fail due to missing postgres connection:
- These tests require a real database
- Not part of Agent B's acceptance criteria
- Integration tests cover API contract validation

## Ready for Review

✅ Slots: Real computeSlots integration  
✅ Push: Device registration + outbox worker  
✅ Tests: All §19 checklist items passing  
✅ Contract Gate: pnpm typecheck green  
✅ Auth stubs: Documented clearly  

**Status**: Ready for Architect review
