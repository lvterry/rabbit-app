# Wave 1 Stabilization — Acceptance Criteria

**Status:** Frozen (2026-09-22)  
**Owner:** Product + Architect  
**Context:** Terry's post-Wave 1 review determined that while scaffolding is in place, the backend drifts from frozen product contracts and contains critical correctness bugs. Before launching any pilot or starting Wave 2 feature work, we must complete a short **Wave 1 Stabilization** to make Rabbit pilot-ready on correctness.

---

## Goal

Make Rabbit **pilot-ready on correctness**; no new product features.

- All P0 bugs fixed (balance integrity, resource authz, contract alignment)
- Backend aligns to frozen product contracts in `docs/impl-guide.md`
- CI enforces Domain + API + DB test gates
- E2E exit gate passing on real stack

**Out of scope:** new product features, DEMO_MODE login bypass, Wave 2 feature work, making iOS Build Gate required (optional note only).

---

## Frozen Product Contracts

The following contracts are **frozen** and must not change during Stabilization. Backend must align to them:

### API Response Shapes (from `docs/impl-guide.md`)

| Endpoint | Frozen Shape | Current Drift |
|---|---|---|
| `GET /v1/me/student-home` | `{ cards: [...], bound }` (NOT `upcomingBooking/recentBookings/balance`) | ✅ Fixtures already match |
| `GET /v1/me/student-bookings?scope=upcoming` | `{ upcoming: [] }` | ⚠️ Backend may return `{ items, hasMore }` |
| `GET /v1/me/student-bookings?scope=history` | `{ history: [] }` | ⚠️ Backend may return `{ items, hasMore }` |
| `POST /v1/students/:studentId/invites` | Plural `invites` (NOT `/invite`) | ⚠️ Backend currently uses singular `/invite` |
| `GET /v1/invites/:token` (Pending) | `courses[].remaining` must be present | ✅ Fixtures already include it |

**Reminder:** `courses[].remaining` display rule (impl-guide.md §6.6): only show `N / M` when there's exactly one non-archived batch; otherwise show `N` only.

### Critical Tables (from `docs/impl-guide.md` ~line 557-558)

- Table names match data-model.md
- `lesson_package` columns: `purchased_sessions`, `remaining_sessions`
- `package_transaction` types: `PACKAGE_CREATED`, `BOOKING_CREATED`, `BOOKING_CANCELLED`, `MANUAL_ADD`, `MANUAL_DEDUCT`, `PURCHASE_ADJUSTMENT`, `BALANCE_ADJUSTMENT`
- `idempotency_record` with 24h TTL, partial unique indexes on `(user_id, key)` and `(student_id, key)`

---

## P0 Backend Issues (Maya owns `api/` except Architect-owned contracts)

### 1. Package Create Double-Count

**Bug:** `PackageRepositoryImpl.create` currently inserts `purchased=remaining=sessions`, then `apply_package_transaction` writes a `PACKAGE_CREATED` ledger row with `+sessions`, resulting in **2× balance**.

**Root cause:** Two balance mutations when there should be one.

**Fix:**
- Insert package with `purchased_sessions=0, remaining_sessions=0`
- `apply_package_transaction(PACKAGE_CREATED, +sessions)` is the **sole** balance mutation
- This makes `PACKAGE_CREATED` the single source of truth in the ledger

**Test:** Create package with 10 sessions → `remaining=10`, `purchased=10`, exactly one `PACKAGE_CREATED +10` ledger row.

---

### 2. Ledger Append-Only + Session Unique Constraint

**Bug 2a:** Migration 002 grants `app_rw` role `UPDATE/DELETE` on all tables, then only revokes on two **columns** (`remaining_sessions`, `purchased_sessions`). However, `package_transaction` **table-level** `UPDATE/DELETE` is still granted, violating append-only ledger requirement.

**Fix:** Revoke `UPDATE, DELETE` on `package_transaction` table for `app_rw` role.

**Bug 2b:** `lesson_session.booking_id` has a column-level `UNIQUE` constraint. This prevents the same `booking_id` from being reused if a booking goes `Completed → Voided (undo) → Completed` again.

**Fix:** Drop column-level `UNIQUE` constraint; keep only the partial unique index `WHERE status = 'Active'` (so only one Active session per booking).

**Test:** 
- 2a: Attempt `UPDATE package_transaction` or `DELETE FROM package_transaction` as `app_rw` → should fail with permission denied
- 2b: Create booking → complete → undo → complete again → should succeed with two `lesson_session` rows (one Voided, one Active)

---

### 3. Self-Book L3 Validation

**Bug:** `BookingRepositoryImpl.create` for `SelfBooked` source has a TODO comment and only relies on database `EXCLUDE` constraint for conflict detection. It does **not** call the same `computeSlots` / `isValidSlot` logic used by slot listing.

**Risk:** Students can book outside availability, in exceptions, or violate `minLeadHours`, `maxAdvanceDays`, `allowSelfBooking` rules. The slot listing (L1/L2) hides those times, but L3 doesn't enforce it.

**Fix:** `BookingRepositoryImpl.create` for `SelfBooked` must call the **same** slot validation as `GET /slots` uses:
- `computeSlots(...)` to get valid slot ranges
- `isValidSlot(...)` to check availability, exception, `minLeadHours`, `maxAdvanceDays`, `allowSelfBooking`
- Only fall back to `EXCLUDE` constraint for race condition detection (`SLOT_TAKEN`)

**Test:** 
- Student attempts to book in exception → 422 `SLOT_IN_EXCEPTION`
- Student attempts to book violating `minLeadHours` → 422 `SLOT_TOO_SOON`
- Student attempts to book when `allowSelfBooking=false` → 422 `SELF_BOOKING_DISABLED`
- All three should fail **before** hitting database

**Authority:** `docs/slot-algorithm.md` §1 — "展示（L1/L2）与创建（L3）调用同一个实现"

---

### 4. Resource Authorization Gaps

**Bug:** Most HTTP handlers call `requireAuth()` to extract `Principal`, but **do not verify** that the principal can act on **THAT specific resource**.

**Examples:**
- `POST /bookings/:id/cancellation` checks principal but doesn't verify `booking.teacher_id` or `booking.student_id` matches
- A teacher with profile A can cancel bookings belonging to teacher B by guessing booking IDs
- Same issue on `POST /bookings/:id/reschedule`, `POST /bookings/:id/completion`, `DELETE /bookings/:id/completion`
- Package routes: `GET /packages/:id/transactions`, `POST /packages/:id/transactions`, `POST /packages/:id/archival`
- Student transactions: `GET /students/:id/transactions` must check caller is that student's teacher

**Fix:** Every resource-specific route must enforce:
- For bookings: principal matches `booking.teacher_id` OR `booking.student_id` (via `canActAsTeacher` / `canActAsStudent`)
- For packages: principal is the teacher who owns that package
- For student transactions: principal is the teacher for that student

**Test:**
- Teacher A attempts to cancel Teacher B's booking → 403 `FORBIDDEN`
- Student X attempts to view Student Y's transactions → 403 `FORBIDDEN`
- Teacher attempts to archival a package belonging to a different teacher → 403 `FORBIDDEN`

**Authority:** `docs/auth-model.md` §3.2 — "服务端判据是 `principal.studentId` / `principal.teacherId` 与资源的匹配"

---

### 5. Idempotency Closed Loop

**Bug:** Idempotency middleware does preflight (check for existing success record) and replay, but **success record write is incomplete**:
- `BookingRepositoryImpl.create` writes `request_hash='hash'` (literal string 'hash' TODO)
- Middleware computes real SHA-256 of request body
- Second identical request with same key → middleware looks for SHA-256 hash, doesn't find 'hash' literal → returns 409 `IDEMPOTENCY_KEY_REUSED` instead of replaying

**Also:** `complete`, `undo`, `cancel`, `reschedule` HTTP handlers accept `Idempotency-Key` header but **do not write success records** after mutation.

**Fix:**
- All write operations (`create`, `complete`, `undo`, `cancel`, `reschedule`) must write `idempotency_record` with **middleware-compatible hash** (SHA-256 of normalized request body)
- Success record written in same transaction as mutation
- Use `INSERT ... ON CONFLICT (principal, key) DO NOTHING` pattern

**Test:**
- Create booking with key `K1` → success
- Retry with same key `K1` and same body → 200 with same `bookingId` (replayed)
- Retry with same key `K1` but different body → 409 `IDEMPOTENCY_KEY_REUSED`
- Complete booking with key `K2` → success; retry → replayed
- Cancel with key `K3` → success; retry → replayed

**Authority:** `docs/mvp.md` §13.3 — "幂等键 + 状态条件更新双保险"

---

### 6. Reschedule Rewrite

**Bug:** Current `POST /bookings/:id/reschedule` implementation has multiple issues:
- Missing `course` join → `duration_minutes` absent in response
- `maxReschedules` applied to teachers (should be unlimited for teacher; only students have reschedule limit)
- Student's new time selection has no slot validation (skips L3 checks)
- Reuses old `package_id` without respecting FIFO (should consume from oldest available batch)
- Late-reschedule SQL can multiply via `package × booking` join
- Last-session late reschedule is fragile (edge case where `available = 1` but late reschedule needs 2)

**Fix:** Re-implement `reschedule` transaction per original spec in `docs/data-model.md` §5.5 and `docs/mvp.md` §10.7:
1. Check `maxReschedules` **only for student-initiated reschedules** (teacher unlimited)
2. Validate new time with **same L3 slot validation** as `create` (availability, exception, lead time, etc.)
3. Determine if late (beyond `freeCancelHours` from old `start_at`)
4. If late: check `available >= 2` (old session penalty + new session); use FIFO package selection for **both** transactions
5. If free: check `available >= 1`; use FIFO for new booking
6. Cancel old booking (write `BOOKING_CANCELLED` if late, else no ledger entry)
7. Create new booking (write `BOOKING_CREATED`)
8. Link `rescheduled_from_booking_id` / `rescheduled_to_booking_id`
9. All in **single transaction**; rollback on any failure

**Test:**
- Free reschedule: teacher reschedules student's booking 3+ times → succeeds (teacher unlimited)
- Free reschedule: student reschedules own booking N times where N = `maxReschedules` → Nth succeeds, (N+1)th fails with 403 `RESCHEDULE_LIMIT_REACHED`
- Late reschedule with `available=1` → 409 `LATE_RESCHEDULE_INSUFFICIENT`
- Late reschedule with `available=2` → succeeds, old booking `Cancelled`, new booking `Upcoming`, two ledger entries, balance decreased by 1
- Student attempts to reschedule to time in exception → 422 `SLOT_IN_EXCEPTION`
- Response includes correct `booking.durationMinutes`

**Authority:** `docs/data-model.md` §5.5, `docs/impl-guide.md` §5.8

---

### 7. API Response Contract Alignment

**Drift:** Backend may currently return different shapes than frozen contracts.

**Required changes:**

**a) `GET /v1/me/student-home`**
- ✅ Already returns `{ cards: [...], bound }` per fixtures
- ⚠️ Verify backend does NOT return `upcomingBooking`, `recentBookings`, or `balance` at top level

**b) `GET /v1/me/student-bookings`**
- Must accept `?scope=upcoming` or `?scope=history`
- When `scope=upcoming`: return `{ upcoming: [] }`
- When `scope=history`: return `{ history: [] }`
- **NOT** `{ items: [], hasMore: boolean }`

**c) `POST /v1/students/:studentId/invites`** (plural)
- Backend currently uses `/invite` (singular)
- Change route to `/invites` (plural)

**d) `GET /v1/invites/:token` (Pending response)**
- ✅ Already includes `courses[].remaining` per fixtures
- Verify display logic: show `N / M` only when `batchCount=1`; otherwise show `N` only

**Test:**
- `GET /v1/me/student-home` → response has `cards` and `bound`, no `upcomingBooking`
- `GET /v1/me/student-bookings?scope=upcoming` → response has `upcoming` key
- `GET /v1/me/student-bookings?scope=history` → response has `history` key
- `POST /v1/students/abc/invites` → 201 (not 404)
- `POST /v1/students/abc/invite` → 404 (old singular route removed)

**Authority:** `docs/impl-guide.md` §5.8 (line ~558), §5.5 (line ~492)

---

## Client Stabilization Work (Not This PR)

Specialists own their respective clients; Architect will provide kickoff after this freeze doc merges.

### Leo (Web, `web/**`)

**P0 Alignment:**
1. **Idempotency key persistence:** `BookRoute` must generate ONE key per confirm operation and **reuse it on retry**. Currently mints new UUID on every click.
2. **Silent refresh + retry on 401:** `api/client.ts` should attempt token refresh once on 401, then retry original request. Avoid forcing user back to login on transient token expiry.
3. **Align to frozen shapes:** After backend lands contract fixes, update Web client:
   - `student-home`: consume `cards`/`bound` (remove any `upcomingBooking`/`recentBookings` code)
   - `student-bookings`: call `?scope=upcoming` or `?scope=history`; handle `{ upcoming }` / `{ history }` responses
   - `invites`: call plural `/invites` route

**Blocked on:** Maya's P0 fixes landing (backend contracts must be correct first)

### Nina (iOS, `ios/**`)

**P0 Alignment:**
1. **SessionStore.refreshAccessToken:** Implement token refresh on 401; restore session on app launch from Keychain.
2. **Undo completion must send Idempotency-Key:** `DELETE /bookings/:id/completion` handler must include `Idempotency-Key` header.
3. **DTO/path alignment:** 
   - Change `POST /students/:id/invite` → `/students/:id/invites` (plural)
   - Verify DTOs match frozen shapes (`student-home`, `student-bookings`)

**Blocked on:** Maya's P0 fixes landing

---

## Architect Work (This PR + Follow-ups)

**Architect has exclusive ownership of:**
- `packages/shared/**` (shared types, schemas)
- `contracts/**` (fixtures, README)
- `docs/**` (freeze docs, product specs)
- `.github/workflows/**` (CI configuration)

**This PR includes:**
1. ✅ Freeze doc (`docs/wave1-stabilization.md`)
2. ✅ CI upgrade (add Domain + API + DB test jobs)
3. ✅ Contract fixtures alignment (add missing `student-bookings` fixtures if needed)

**Architect must NOT:**
- Implement Maya's P0 fixes in `api/src/**`
- Implement Leo's Web changes in `web/**`
- Implement Nina's iOS changes in `ios/**`

Specialists must NOT silently change shared contracts; report blockers to Architect.

---

## CI Upgrade (This PR)

Current CI has:
- ✅ Contract Gate (install + typecheck + test:contract)
- ✅ iOS Build Gate (optional, not blocking)

**Required additions:**

### Domain Gate
- Job name: `domain-gate`
- Run: `pnpm --filter api test:domain`
- Tests: Pure domain logic (slot computation, cancel policy, FIFO, V1-V20 vectors)
- No external dependencies (Postgres, network)
- Should be **fast** (<30s)

### API Gate
- Job name: `api-gate`
- Run: `pnpm --filter api test:api`
- Tests: HTTP layer integration tests (`test/http/**`, `test/integration/**`)
- May need running API server pattern if `test:api` expects it (check `api/package.json`)
- Use in-memory or ephemeral test fixtures

### DB Gate
- Job name: `db-gate`
- Service: PostgreSQL 16
- Steps:
  1. Start Postgres service
  2. Run migrations: `pnpm db:migrate`
  3. Run DB tests: `pnpm --filter api test:db`
- Tests: Repository layer, transactions, constraints, ledger append-only
- Must use real Postgres (not SQLite or mocks)

**Branch Protection (Manual, not in this PR):**
After these jobs are green and stable, recommend making the following required:
- ✅ `contract-gate`
- ✅ `domain-gate`
- ✅ `api-gate`
- ✅ `db-gate`
- ⚠️ `ios-build-gate` — leave optional (note in PR that it can be required when stable)

**Note:** New jobs may initially fail due to P0 bugs in `main` (e.g., `test:api` fails because of resource authz gaps). This is **expected**. We land the CI wiring now; Maya's P0 fixes will make them green.

If failures are environmental (missing scripts, wrong DATABASE_URL format), Architect fixes the wiring.

---

## E2E Exit Gate (After All Stabilization Merges)

**Full user journey on real stack** (Postgres + API + Web/iOS):

> **Detailed checklist:** See `docs/wave1-stabilization-e2e.md` for the complete E2E exit gate runbook, including journey steps, accounting assertions, ownership table, local prerequisites, and pass/fail criteria.

1. Teacher creates student with invite
2. Student enters via invite link
3. Student sees course credits on home
4. Student self-books a session
5. Teacher sees new booking in "Today"
6. Student cancels booking
7. Teacher reschedules booking
8. Teacher completes booking
9. Teacher undoes completion

**Must pass on:**
- Local development environment (docker-compose Postgres + `pnpm dev`)
- Staging environment (real Supabase Postgres + deployed API/Web + TestFlight iOS)

**Test artifacts:** Playwright E2E script + manual walkthrough checklist

---

## Ownership Boundaries

| Area | Owner | Notes |
|---|---|---|
| `packages/shared/**` | Architect | Shared types, schemas; must align to frozen contracts |
| `contracts/**` | Architect | Fixtures, README |
| `docs/**` | Architect | Freeze doc, product specs |
| `.github/workflows/**` | Architect | CI configuration |
| `api/src/**` | Maya | Domain logic, repositories, routes, middleware, jobs (P0 fixes 1-7) |
| `api/test/**` | Maya | All test suites (domain, db, http, integration) |
| `web/**` | Leo | Student-facing Web client (idempotency key, refresh, contract alignment) |
| `ios/**` | Nina | Teacher-facing iOS app (SessionStore, undoCompletion, DTO/path alignment) |

**Enforcement:**
- Specialists must NOT silently change shared contracts (types, fixtures)
- Report blockers to Architect
- Architect must NOT implement specialist code

---

## Success Criteria

- [ ] Freeze doc merged and becomes single source of truth for specialists
- [ ] CI upgraded: Domain + API + DB gates run on every PR
- [ ] Contract fixtures aligned (student-bookings added if missing)
- [ ] All test jobs are green OR documented why red (known P0 bugs vs. environmental issues)
- [ ] Specialists have clear kickoff point (this doc)

**NOT in scope for this PR:**
- Maya's P0 fixes (separate PR per fix or one large PR)
- Leo's Web changes (separate PR)
- Nina's iOS changes (separate PR)
- Making new CI jobs required in branch protection (manual, after green)

---

## References

- `docs/impl-guide.md` — Frozen API contracts (§5.8 line ~557-558, §5.5 line ~492)
- `docs/mvp.md` — Product rules (§6 package model, §9 state machine, §10 flows, §13 idempotency)
- `docs/data-model.md` — Database schema, nine invariants, five transactions
- `docs/slot-algorithm.md` — Slot computation (§1: L1/L2/L3 use same implementation)
- `docs/auth-model.md` — Principal model (§3.2: resource ownership matching)

---

**Freeze Date:** 2026-09-22  
**Next Steps:** Maya begins P0 fixes; Leo/Nina wait for kickoff after contracts stabilize
