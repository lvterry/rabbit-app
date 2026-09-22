# Contract Bootstrap Summary

**Agent 0 — Repository & Contract Bootstrap**  
**Date:** 2026-09-22  
**Branch:** `cursor/contract-bootstrap-f3c4`  
**Pull Request:** #1

## ✅ Second Contract-Correction Pass Complete

This PR underwent TWO correction passes. All issues from both reviews have been addressed.

### Architect Review - Second Correction Pass (ALL FIXED)

All issues from the architect's review have been fixed against CURRENT docs (impl-guide.md, auth-model.md, slot-algorithm.md, mvp.md):

#### Fix A: StudentHomeView + multi-teacher (CRITICAL) ✅

**Issue:** Current contract put courses from two teachers under ONE studentId, which Terry forbade.

**Resolution:**
- Completely redesigned `StudentHomeView` per impl-guide.md §5.8:
  - Now returns `{ cards: StudentHomeCard[], bound: boolean }`
  - Each card represents ONE (teacher, student) relationship
  - Anonymous sessions: `cards.length === 1`
  - Multi-teacher users: `cards.length >= 1`, each with own studentId + teacherId
- Created `StudentHomeCard` type with fields: `{ teacherId, teacherName, teacherAvatarUrl, studentId, studentName, courses[], remainingTotal }`
- Created `StudentCourseCard` type (student-facing course fields): `{ courseId, courseName, durationMinutes, allowSelfBooking, remaining, purchased|null, batchCount, available, exhausted, fullyReserved, nextBooking }`
- Updated both schemas and BOTH fixtures:
  - `student-home-anonymous.json` — 1 card (one teacher/student relationship)
  - `student-home-user-multi-teacher.json` — 2 cards, each with different (teacherId, studentId) pair

Student is a per-teacher relation, NOT a global entity.

#### Fix B: MetaResponse ✅

**Issue:** Wrong fields (version, minSupportedVersion).

**Resolution:**
- Updated to match impl-guide.md §4.6, §5.1: `{ minIOSVersion, minWebBuild, features, serverTime }`
- Updated type, schema, and fixture

#### Fix C: Package Transaction Request ✅

**Issue:** Wrong shape — had `{ type, amount, note? }`.

**Resolution:**
- Updated per impl-guide.md §5.6: `{ mode: 'add'|'deduct'|'set', sessions, type?, note? }`
- `mode='set'` requires `type` (PURCHASE_ADJUSTMENT or BALANCE_ADJUSTMENT)
- Updated type and schema

#### Fix D: Teacher Create/Update Field Names ✅

**Issue:** Used `avatar` instead of `avatarUrl`.

**Resolution:**
- Renamed `avatar` → `avatarUrl` in `CreateTeacherRequest` and `UpdateTeacherRequest`
- Updated types and schemas

#### Fix E: BookableDaysResponse / SlotsResponse ✅

**Issue:** Missing fields from impl-guide.md §5.7.

**Resolution:**
- Updated `SlotsResponse` to include: `{ date, dateLabel, timezone, generatedAt, reason, reasonText, slots[], balance }`
- Updated `BookableDaysResponse` to include: `{ timezone, generatedAt, reason, reasonText, days[], balance }`
- Updated `BookableDayView` to include: `{ date, dateLabel, weekday, weekdayLabel, slotCount }`
- Updated all slot fixtures with new fields, including balance and labels
- Student-facing balance has `reserved: null` per §6.6

#### Fix F: TeacherDayView ✅

**Issue:** Shape didn't match docs.

**Resolution:**
- Updated per impl-guide.md §5.8 GET /v1/me/teacher-day: `{ date, isToday, dateLabel, todayCount, completedCount, next, bookings[], pending[], hints[] }`
- Updated type and schema

#### Fix G: Availability Exception Field Names ✅

**Issue:** Request field name mismatch.

**Resolution:**
- Updated `CreateAvailabilityExceptionRequest` per impl-guide.md §5.4: `{ onDate, wholeDay?, startMinute?, endMinute?, reason? }`
- Updated type and schema

#### Fix H: Auth Fixtures vs Schemas ✅

**Issue:** Auth fixtures didn't match correct me/auth response shape.

**Resolution:**
- Created new `AuthResponse` type per impl-guide.md §5.1: `{ userId, isTeacher, teacher|null, students[] }`
- Created `MeResponse` type for GET /v1/me: `{ user: {userId, nickname, avatarUrl}, isTeacher, teacher|null, students[] }`
- Created `StudentSummary` type: `{ teacherId, teacherName, teacherAvatarUrl, studentId, studentName }`
- Added corresponding schemas
- Updated both auth fixtures to use `meResponseSchema` with correct structure
- Fixed validate-fixtures.ts mapping

#### Fix I: IdempotencyRepository Residual Identity Drift ✅

**Issue:** Methods still took bare `userId`/`studentId` parameters.

**Resolution:**
- Updated `findExisting()` and `recordSuccess()` to take `principal: Principal` instead of bare IDs
- Maintains Write A semantics while avoiding actor-id drift per auth-model.md §5

#### Fix J: constants.ts Residual ✅

**Issue:** `MAX_RESCHEDULES = 10` is a business default, not a protocol constant.

**Resolution:**
- Removed `MAX_RESCHEDULES` from constants.ts
- Business defaults must come from teacher settings/server per impl-guide.md §4.4

### Summary of Second Correction Pass

- ✅ StudentHomeView now correctly represents multi-teacher with multiple cards
- ✅ MetaResponse matches current docs
- ✅ Package transaction request uses mode/sessions/type
- ✅ Teacher requests use avatarUrl
- ✅ Slots/bookable-days include all documented fields + balance
- ✅ TeacherDayView matches current docs
- ✅ Availability exception uses onDate + wholeDay
- ✅ Auth fixtures use proper MeResponse schema
- ✅ IdempotencyRepository takes Principal everywhere
- ✅ No business defaults in constants.ts

## 📊 Current Status

- ✅ `pnpm install` succeeds
- ✅ `pnpm typecheck` succeeds (all packages)
- ✅ `pnpm test:contract` succeeds (all 24 fixtures validated against REAL schemas matching CURRENT docs)
- ✅ All port interfaces use Principal, not actor IDs
- ✅ IdempotencyRepository follows Write A pattern with Principal
- ✅ Principal schema enforces per-kind invariants
- ✅ Security files in .gitignore
- ✅ Only protocol constants in shared package

## ✅ Completed (Original Bootstrap + Two Correction Passes)

### 1. Monorepo Structure

- Created pnpm workspace with `pnpm-workspace.yaml`
- Root `package.json` with all required scripts
- Directory structure established for all agents

### 2. PostgreSQL Setup

- `docker-compose.yml` with PostgreSQL 16
- `.env.example` with all required environment variables

### 3. Shared Package (`packages/shared`)

**Types** (`src/types.ts`) — ALL MATCH CURRENT DOCS:
- Principal with auth types
- MetaResponse: `{ minIOSVersion, minWebBuild, features, serverTime }`
- StudentHomeView: `{ cards: StudentHomeCard[], bound }`
  - StudentHomeCard: `{ teacherId, teacherName, teacherAvatarUrl, studentId, studentName, courses[], remainingTotal }`
  - StudentCourseCard: student-facing course fields with balance details
- TeacherDayView: `{ date, isToday, dateLabel, todayCount, completedCount, next, bookings[], pending[], hints[] }`
- SlotsResponse: `{ date, dateLabel, timezone, generatedAt, reason, reasonText, slots[], balance }`
- BookableDaysResponse: `{ timezone, generatedAt, reason, reasonText, days[], balance }`
- AuthResponse & MeResponse with StudentSummary
- All view models aligned with impl-guide.md §5

**Schemas** (`src/schemas.ts`):
- Zod schemas for all types matching current docs
- Principal schema with per-kind invariants
- All response schemas validated against real API shapes

**Errors** (`src/errors.ts`):
- Complete ErrorCode enum from slot-algorithm.md §6.5

**Constants** (`src/constants.ts`):
- ONLY protocol constants (time, pagination, validation limits)
- NO display labels, rule options, or business defaults

### 4. Contract Fixtures

All 24 fixtures updated to match CURRENT docs:

**Meta:**
- `meta.json` — { minIOSVersion, minWebBuild, features, serverTime }

**Auth:**
- `me-user-teacher.json` — MeResponse format
- `me-user-teacher-and-student.json` — MeResponse with students array

**Students:**
- `student-home-anonymous.json` — 1 card (single teacher/student relationship)
- `student-home-user-multi-teacher.json` — 2 cards, each with own (teacherId, studentId)
- `student-detail.json` — Teacher view of student

**Slots:**
- `bookable-days.json` — With dateLabel, weekday labels, balance
- `slots.json` — With dateLabel, balance
- `no-availability.json` — With reason, reasonText, balance
- `fully-booked.json` — With reason, reasonText, balance
- `insufficient-sessions.json` — With reason, reasonText, balance (remaining: 0)

**Bookings:**
- All booking fixtures validated against bookingViewSchema

**Errors:**
- All error fixtures validated against apiErrorResponseSchema

### 5. API Ports (Interfaces Only)

All ports use Principal, never actor IDs:
- `BookingRepository` — all write methods take `principal: Principal`
- `PackageRepository` — `addTransaction()` takes `principal: Principal`
- `StudentRepository` — `consumeInvite()` takes `principal: Principal`
- `IdempotencyRepository` — `findExisting()` and `recordSuccess()` take `principal: Principal` (Write A pattern)
- All other ports follow auth-model.md §5

### 6. Validation

`scripts/validate-fixtures.ts`:
- Uses `tsx` to run TypeScript directly
- Imports and validates against ACTUAL Zod schemas
- All 24 fixtures map to correct schemas
- All fixtures pass real schema validation ✅

## 🚫 No Blockers or Ambiguities

**No contract conflicts.** All documentation is consistent. All fixes verified against CURRENT docs:
- StudentHomeView correctly represents multi-teacher per impl-guide.md §5.8
- MetaResponse matches impl-guide.md §4.6, §5.1
- Package transaction matches impl-guide.md §5.6
- Slots/bookable-days match impl-guide.md §5.7
- TeacherDayView matches impl-guide.md §5.8
- Auth responses match impl-guide.md §5.1
- All ports use Principal per auth-model.md §5
- IdempotencyRepository follows Write A pattern (data-model.md §5.1) with Principal
- Constants.ts contains ONLY protocol constants

**Every fixture is validated by actual shared schemas that match CURRENT docs.**

## 📋 Merge Recommendation

✅ **RECOMMEND MERGE**

All architect requirements met:
1. ✅ StudentHomeView multi-teacher is CORRECT (multiple cards, not flattened)
2. ✅ MetaResponse matches current docs
3. ✅ Package transaction request correct
4. ✅ Teacher requests use avatarUrl
5. ✅ Slots/bookable-days include all documented fields
6. ✅ TeacherDayView matches current docs
7. ✅ Availability exception uses onDate
8. ✅ Auth fixtures use correct schemas
9. ✅ IdempotencyRepository takes Principal
10. ✅ No business defaults in constants.ts

Both `pnpm typecheck` and `pnpm test:contract` pass. Contract matches CURRENT docs exactly.

## 📝 Remaining Ambiguities

**None.** All contract shapes verified against current documentation.

## 🎯 Dependencies for Next Agents

All agents can start immediately. The contract now correctly matches impl-guide.md, auth-model.md, slot-algorithm.md, and mvp.md as of 2026-09-22.

## 📊 What Changed in Second Correction Pass

### Types & Schemas Modified
1. `StudentHomeView` → completely redesigned with cards array
2. `StudentHomeCard`, `StudentCourseCard` → new types added
3. `MetaResponse` → updated fields
4. `AddPackageTransactionRequest` → mode/sessions/type shape
5. `CreateTeacherRequest`, `UpdateTeacherRequest` → avatarUrl
6. `BookableDaysResponse`, `SlotsResponse`, `BookableDayView` → added fields
7. `TeacherDayView` → updated structure
8. `CreateAvailabilityExceptionRequest` → onDate, wholeDay
9. `AuthResponse`, `MeResponse`, `StudentSummary` → new types added
10. `MAX_RESCHEDULES` → removed from constants.ts

### Fixtures Modified
1. `meta.json` — new structure
2. `auth/me-user-teacher.json` — MeResponse format
3. `auth/me-user-teacher-and-student.json` — MeResponse format
4. `students/student-home-anonymous.json` — 1 card structure
5. `students/student-home-user-multi-teacher.json` — 2 cards (CRITICAL FIX)
6. `slots/bookable-days.json` — added fields + balance
7. `slots/slots.json` — added dateLabel + balance
8. `slots/no-availability.json` — added fields
9. `slots/fully-booked.json` — added fields
10. `slots/insufficient-sessions.json` — added fields

### Ports Modified
1. `IdempotencyRepository.ts` — takes Principal in both methods

### Scripts Modified
1. `validate-fixtures.ts` — updated schema mappings for auth fixtures

All agents can now work in parallel from this commit. Contract is sound and matches CURRENT documentation.
