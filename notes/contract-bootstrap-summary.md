# Contract Bootstrap Summary

**Agent 0 — Repository & Contract Bootstrap**  
**Date:** 2026-09-22  
**Branch:** `cursor/contract-bootstrap-f3c4`  
**Pull Request:** #1

## ✅ Contract Correction Pass Complete

This PR underwent a contract-correction review by Terry. All issues have been addressed:

### Fix #1: Real Schema Validation for test:contract ✅

**Issue:** `scripts/validate-fixtures.mjs` used loose inline schemas instead of actual exported schemas.

**Resolution:**
- Rewrote validation script to import and use actual Zod schemas from `@rabbit/shared`
- Added `tsx` as devDependency to run TypeScript directly
- Updated `test:contract` script to use `tsx scripts/validate-fixtures.ts`
- All 24 fixtures now validate against the ACTUAL executable contract schemas
- Green `pnpm test:contract` now confirms fixtures conform to real schemas

### Fix #2: IdempotencyRepository Reconciled with data-model.md ✅

**Issue:** Port modeled two-phase flow (Processing/Succeeded/Failed, tryCreate/updateWithResponse) which conflicts with recommended "Write A" pattern.

**Resolution:**
- Redesigned `api/src/ports/IdempotencyRepository.ts` to match Write A pattern:
  - `findExisting()` — fast path for replay at transaction start
  - `recordSuccess()` — record idempotency at END of business transaction
  - Removed three-state model (Processing/Succeeded/Failed)
  - No more two-phase tryCreate/updateWithResponse
- Implementation will: check for existing record → execute business logic → insert successful record in SAME transaction (data-model.md §5.1)

### Fix #3: Shared DTOs Audited Against CURRENT Docs ✅

**Issue:** Need to verify all DTOs match current `impl-guide.md`, `auth-model.md`, `slot-algorithm.md`, `mvp.md`.

**Resolution:**
- Verified all shared types against current docs:
  - ✅ `MetaResponse` — correct (version, minSupportedVersion, serverTime)
  - ✅ `StudentHomeView` — correct multi-teacher representation (multiple CourseCard objects in courses array, each with different teacherId)
  - ✅ `TeacherDayView` — correct fields
  - ✅ `BookableDaysResponse` — correct shape
  - ✅ `SlotsResponse` — correct shape
  - ✅ Availability exception uses `date` (API contract name, DB column is `on_date`)
  - ✅ Package transaction request uses `purchasedSessions`
  - ✅ Teacher profile fields align with docs
- Multi-teacher fixture represents User (kind='User') seeing multiple teachers' courses, NOT one Student with multiple teachers' courses under it

### Fix #4: Strengthened principalSchema ✅

**Issue:** Principal schema didn't validate per-kind invariants.

**Resolution:**
- Enhanced `principalSchema` in `packages/shared/src/schemas.ts` with refinement:
  - `Public`: all IDs must be null
  - `User`: only userId set (studentId/teacherId/inviteId null)
  - `Student`: studentId + teacherId set (userId/inviteId null)
  - `InviteToken`: studentId + teacherId + inviteId set (userId null)
- Schema now enforces auth-model.md §1.1 invariants at validation time

### Fix #5: Reviewed Ports for Identity Drift ✅

**Issue:** Several ports passed `actorUserId?`/`actorStudentId?` parameters instead of using Principal.

**Resolution:**
- Updated `BookingRepository`:
  - `create()`, `complete()`, `markNoShow()`, `undoCompletion()`, `cancel()`, `reschedule()` now take `principal: Principal` instead of actor IDs
  - Removed `teacherId` parameter from `create()` (inferred from data or Principal)
  - Added documentation: behavior identity derived from Principal per auth-model.md §2.1, §5.1
- Updated `PackageRepository`:
  - `addTransaction()` now takes `principal: Principal` instead of `actorUserId?`/`actorStudentId?`
- Updated `StudentRepository`:
  - `consumeInvite()` now takes `principal: Principal` instead of `userId?`
  - Added `issueNewSession` to return type to clarify the two paths (User vs Student会话)
- All ports now align with auth-model.md: "业务代码只读 ctx.principal，不读 actorUserId/actorStudentId"

### Fix #6: Restored Security/Platform Ignores in .gitignore ✅

**Issue:** iOS security files and build artifacts missing from .gitignore.

**Resolution:**
- Added to `.gitignore`:
  - `*.p8`, `*.p12`, `*.mobileprovision`, `AuthKey_*.p8` (Apple auth keys)
  - `DerivedData/`, `xcuserdata/`, `*.xcworkspace/` (iOS build artifacts)
- Prevents sensitive credentials and platform-specific build outputs from entering repo

### Fix #7: Reviewed constants.ts ✅

**Issue:** Server-authoritative values (rule options, display labels) in client-shared contract.

**Resolution:**
- Removed from `packages/shared/src/constants.ts`:
  - All display labels (weekdayLabels, slotReasonLabels, bookingSourceLabels, etc.)
  - All rule options (minLeadHoursOptions, freeCancelHoursOptions, etc.)
  - All duration options (courseDurationOptions)
  - Default teacher settings
- Retained only true protocol constants:
  - Time constants (MINUTES_PER_DAY, etc.)
  - Validation limits (MAX_COURSE_NAME_LENGTH, etc.)
  - Pagination defaults
  - TTL values shared for client validation
- Added documentation: display labels and rule options MUST come from API responses (impl-guide.md §4.4)

## 📊 Post-Correction Status

- ✅ `pnpm install` succeeds
- ✅ `pnpm typecheck` succeeds (all packages)
- ✅ `pnpm test:contract` succeeds (all 24 fixtures validated against REAL schemas)
- ✅ All port interfaces use Principal, not actor IDs
- ✅ IdempotencyRepository follows Write A pattern
- ✅ Principal schema enforces per-kind invariants
- ✅ Security files in .gitignore
- ✅ No server-authoritative values in shared constants

## ✅ Completed (Original Bootstrap)

### 1. Monorepo Structure

- Created pnpm workspace with `pnpm-workspace.yaml`
- Root `package.json` with all required scripts
- Directory structure established for all agents:
  - `packages/shared/` — Shared types and schemas
  - `api/` — Backend API (ports only)
  - `web/` — Student web frontend (stub)
  - `ios/` — Teacher iOS app (empty)
  - `contracts/fixtures/` — JSON contract fixtures
  - `spec-tests/` — Specification tests (empty)
  - `scripts/` — Build and validation scripts
  - `notes/` — Documentation and summaries

### 2. PostgreSQL Setup

- `docker-compose.yml` with PostgreSQL 16
- `.env.example` with all required environment variables
- Database connection configured for `rabbit_dev`

### 3. Shared Package (`packages/shared`)

**Types** (`src/types.ts`):
- Principal and auth types (from `auth-model.md`)
- All entity types (Booking, Student, Teacher, Course, Package, etc.)
- View models (BookingView, SlotView, BalanceView, etc.)
- API envelope types (success/error)
- Request/response types for all endpoints

**Schemas** (`src/schemas.ts`):
- Zod schemas for all types with per-kind Principal invariants
- Request validation schemas
- Response validation schemas
- API envelope schemas

**Errors** (`src/errors.ts`):
- Complete ErrorCode enum from `slot-algorithm.md` §6.5
- Error metadata mapping (HTTP status, messages, retryability)
- Helper functions for error handling

**Constants** (`src/constants.ts`):
- Protocol constants only (time, pagination, validation limits)
- NO display labels or rule options (server-authoritative)

### 4. Contract Fixtures

Created all 24 required fixtures in `contracts/fixtures/`:

**Meta:**
- `meta.json` — Server metadata

**Auth:**
- `auth/me-user-teacher.json` — Teacher profile
- `auth/me-user-teacher-and-student.json` — User with both capabilities

**Invites:**
- `invites/pending.json` — Pending invite preview
- `invites/consumed-matching-session.json` — Revisiting own invite
- `invites/consumed-foreign-session-error.json` — Security error
- `invites/expired-error.json` — Expired invite

**Students:**
- `students/student-home-anonymous.json` — Anonymous student home (one teacher)
- `students/student-home-user-multi-teacher.json` — Multi-teacher view (User kind, multiple CourseCards)
- `students/student-detail.json` — Teacher view of student

**Slots:**
- `slots/bookable-days.json` — Available days
- `slots/slots.json` — Time slots for a day
- `slots/no-availability.json` — No availability reason
- `slots/fully-booked.json` — Fully booked reason
- `slots/insufficient-sessions.json` — Insufficient sessions reason

**Bookings:**
- `bookings/upcoming-teacher.json` — Teacher view of upcoming
- `bookings/upcoming-student.json` — Student view of upcoming
- `bookings/completed.json` — Completed booking
- `bookings/cancelled-free.json` — Free cancellation
- `bookings/cancelled-late.json` — Late cancellation

**Errors:**
- `errors/slot-taken.json` — Slot conflict error
- `errors/late-reschedule-insufficient.json` — Insufficient balance for late reschedule
- `errors/token-expired.json` — Token expired
- `errors/network-error-client-only.json` — Network error

All fixtures:
- Validated against ACTUAL Zod schemas from `@rabbit/shared`
- Proper envelope structure (`ok`, `data`/`code`, `meta`/`requestId`)
- Realistic UUIDs and data
- Consistent relationships across fixtures
- Documented in README.md

### 5. API Ports (Interfaces Only)

Created TypeScript interfaces in `api/src/ports/` — all use Principal, not actor IDs:
- `AuthService.ts` — Authentication and session management
- `TeacherRepository.ts` — Teacher profile access
- `CourseRepository.ts` — Course data access
- `AvailabilityRepository.ts` — Availability rules and exceptions
- `StudentRepository.ts` — Student and invite management (consumeInvite takes Principal)
- `PackageRepository.ts` — Package and transaction management (addTransaction takes Principal)
- `BookingRepository.ts` — Booking business logic (all write methods take Principal)
- `IdempotencyRepository.ts` — Write A pattern (findExisting/recordSuccess, no two-phase)
- `NotificationRepository.ts` — Push notification and outbox

All ports follow auth-model.md §5 (business code only reads ctx.principal) and data-model.md Write A pattern.

### 6. Scripts

- `pnpm install` — Installs dependencies
- `pnpm typecheck` — TypeScript type checking across all packages ✅
- `pnpm test:contract` — REAL fixture validation against exported schemas ✅
- `pnpm test:spec` — Placeholder for spec tests
- `pnpm test:domain` — Placeholder for domain tests
- `pnpm test:api` — Placeholder for API tests
- `pnpm web:test` — Placeholder for web tests
- `pnpm api:dev` — Placeholder for API dev server
- `pnpm web:dev` — Placeholder for web dev server
- `pnpm db:migrate` — Placeholder for database migrations
- `pnpm db:up` / `db:down` / `db:reset` — Docker compose helpers

### 7. Validation

Created `scripts/validate-fixtures.ts`:
- Uses `tsx` to run TypeScript directly
- Imports and validates against ACTUAL Zod schemas from `@rabbit/shared`
- Validates envelope structure (success/error)
- Validates payload schemas per fixture type
- All 24 fixtures pass against real schemas ✅

## 🚫 No Blockers or Contract Ambiguities

**No contract conflicts discovered.** All documentation is consistent and fixes align with current docs:
- Principal model aligned with `auth-model.md` (no TeacherPrincipal kind, per-kind invariants enforced)
- ErrorCode enum matches `slot-algorithm.md` §6.5
- Fixture shapes match view models from parallel plan
- Types align with database schema from `data-model.md`
- IdempotencyRepository follows Write A pattern from `data-model.md` §5.1
- All ports use Principal per `auth-model.md` §5
- Constants.ts contains only protocol constants, not server-authoritative values
- Multi-teacher representation is correct (multiple CourseCards, not nested under one Student)

**Every fixture is validated by actual shared schemas** via `pnpm test:contract`.

## 📋 Merge Recommendation

✅ **RECOMMEND MERGE**

All contract-correction requirements met:
1. ✅ Fixtures validated against REAL schemas
2. ✅ IdempotencyRepository reconciled with Write A pattern
3. ✅ Shared DTOs audited and correct per current docs
4. ✅ Principal schema strengthened with per-kind invariants
5. ✅ All ports reviewed, no identity drift (Principal everywhere)
6. ✅ Security/platform ignores restored in .gitignore
7. ✅ Constants.ts cleaned of server-authoritative values

Both `pnpm typecheck` and `pnpm test:contract` pass. Contract is sound and ready for parallel development.

## 📝 Remaining Ambiguities

**None.** All ambiguities from original bootstrap were resolved during correction pass.

## 🎯 Dependencies for Next Agents

### Agent A (Backend Core)
**Can start immediately:**
- Use ports from `api/src/ports/` (all follow Principal model and Write A pattern)
- Implement `computeSlots` domain logic
- Create PostgreSQL migrations
- Implement `apply_package_transaction` SECURITY DEFINER function
- Implement IdempotencyRepository with Write A pattern
- Write domain tests

**Depends on:** None (fully independent)

### Agent B (Backend API)
**Can start immediately:**
- Use types from `@rabbit/shared`
- Use fixtures for mocking during development
- Implement HTTP routes that extract Principal from auth middleware
- Implement auth middleware that produces Principal (not actorUserId/actorStudentId)

**Depends on:** Agent A's repository implementations (can use stubs/mocks)

### Agent C (Student Web)
**Can start immediately:**
- Use types from `@rabbit/shared`
- Use fixtures from `contracts/fixtures/`
- Build UI with mock API client
- Develop in fixture mode

**Depends on:**
- None for UI development
- Agent B for API integration

### Agent D (Teacher iOS)
**Can start immediately:**
- Use fixtures as reference for DTO definitions
- Build UI with mock repositories
- Implement SwiftUI views

**Depends on:**
- None for UI development
- Agent B for API integration

### Agent E (Contract QA)
**Can start immediately:**
- Validate fixtures against schemas (already done via `pnpm test:contract`)
- Write contract compliance tests
- Set up CI validation

**Depends on:** None (fixtures and schemas already exist and validated)

## 📊 What Changed in Contract-Correction Pass

### Files Modified
1. `scripts/validate-fixtures.mjs` → `scripts/validate-fixtures.ts` (real schema validation)
2. `package.json` (added tsx, updated test:contract script)
3. `api/src/ports/IdempotencyRepository.ts` (redesigned for Write A)
4. `api/src/ports/BookingRepository.ts` (Principal everywhere, no actor IDs)
5. `api/src/ports/PackageRepository.ts` (Principal in addTransaction)
6. `api/src/ports/StudentRepository.ts` (Principal in consumeInvite)
7. `packages/shared/src/schemas.ts` (per-kind Principal invariants)
8. `packages/shared/src/constants.ts` (removed server-authoritative values)
9. `.gitignore` (added iOS security/platform patterns)

### Commits
Branch `cursor/contract-bootstrap-f3c4` contains:
1. Initial bootstrap commit
2. Contract-correction commit (this summary reflects post-correction state)

All agents can now work in parallel from this commit without reorganizing the repository.
