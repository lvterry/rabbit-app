# Wave 1 Stabilization E2E Exit Gate

**Status:** Active checklist  
**Owner:** Architect (docs/checklist); see ownership table below  
**Context:** Pilot-readiness gate after Wave 1 Stabilization P0 merges (PRs #12 freeze, #13 Leo, #14 Nina, #15 Maya). Wave 2 feature work remains HOLD until this gate passes on local stack.

---

## Purpose

This E2E exit gate validates that the end-to-end user journey works correctly on a real stack (Postgres + API + Web + iOS) after all Wave 1 Stabilization fixes have merged. It ensures:

- Frontend clients correctly consume backend contracts
- Backend enforces domain rules (slot validation, ledger integrity, resource authz)
- Critical flows work without mocks or stubs
- Accounting assertions hold on the real Postgres path

**This is a pilot-readiness gate.** Wave 2 remains blocked until this gate passes.

---

## Journey (Must All Pass)

The following numbered steps match the frozen user journey from `docs/wave1-stabilization.md` §"E2E Exit Gate". All steps must pass:

1. **Teacher creates student with invite**  
   Teacher uses iOS app to create a new student account and generate an invite link.

2. **Student enters via invite link**  
   Student opens the invite link (web or iOS), accepts the invite, and completes account setup.

3. **Student sees course credits on home**  
   Student navigates to home screen (`student-home`) and sees course cards with correct credit balance displayed (bound data).

4. **Student self-books a session**  
   Student selects an available time slot from the course detail view and successfully books a session.

5. **Teacher sees new booking in Today**  
   Teacher refreshes or opens the Today view in iOS and sees the student's newly created booking listed.

6. **Student cancels a booking**  
   Student navigates to their bookings list and cancels one booking.  
   _Sequencing note:_ To exercise both cancel and reschedule/complete flows without conflict, either use two separate bookings or have the student re-book after canceling. Cancel removes the booking from upcoming, so reschedule/complete steps require an active booking to operate on.

7. **Teacher reschedules a booking**  
   Teacher selects an upcoming booking and reschedules it to a different time. Verify free reschedule path (within `freeCancelHours`); late-reschedule ledger deduction is covered by existing DB/domain tests.

8. **Teacher completes a booking**  
   Teacher marks a booking as completed. Verify the booking status updates and the student's package balance decrements by 1.

9. **Teacher undoes completion**  
   Teacher undoes the completion (via `DELETE /bookings/:id/completion`). Verify the booking returns to `Upcoming` status and the student's balance is restored appropriately. Confirm that completing the same booking again (after undo) succeeds — no column-level `UNIQUE` constraint on `lesson_session.booking_id` should block this.

---

## Accounting Assertions (API Spine)

Beyond UI clicks, the following non-UI checks must hold on the real Postgres path. These assertions validate ledger integrity and idempotency:

### Package Create Leaves 0/0 Until PACKAGE_CREATED Mutates Balance
- When a package is created, the initial database insert leaves `purchased_sessions=0, remaining_sessions=0`.
- The `apply_package_transaction` call with `PACKAGE_CREATED` is the **sole** balance mutation, setting `remaining=purchased=N`.
- Verify exactly **one** `PACKAGE_CREATED` ledger row exists with `+N` sessions.

### Self-Book / Free Reschedule: Reserve Only
- Self-book and free reschedule (within `freeCancelHours`) are **reserve-only operations**: they insert or update the `booking` row and select a FIFO `package_id`, but do **not** call `apply_package_transaction` and do **not** write any ledger entry.
- `remaining_sessions` is unchanged by create or free reschedule.
- Balance changes occur only on completion or late cancel/reschedule.

### Late Cancel/Reschedule vs Free Cancel
- **Late cancel/reschedule** (beyond `freeCancelHours` from `start_at`): Write a `LATE_CANCEL` ledger entry (per `docs/data-model.md` transaction types); balance decrements. (Note: the freeze doc may use shorthand `BOOKING_CANCELLED`; implementations must follow the authoritative data-model names.)
- **Free cancel** (within `freeCancelHours`): No ledger entry; `remaining_sessions` unchanged.

### Complete: SESSION_COMPLETED −1
- When a booking is completed, a `SESSION_COMPLETED` transaction is written with `−1` session.
- `remaining_sessions` decrements by 1.

### Undo Restores Appropriately
- Undo completion restores the balance (e.g., `SESSION_VOIDED +1` or similar ledger reversal).
- The same `booking_id` can be completed again after undo: no column-level `UNIQUE` constraint on `lesson_session.booking_id` should prevent this. Only the partial unique index `WHERE status = 'Active'` should exist.

### Idempotency: Replay with Same Key+Body Returns Same Result
- Retry a write operation (e.g., create booking, complete, undo, cancel, reschedule) with the same `Idempotency-Key` header and same request body → should return **200 OK** with the same result (replayed from `idempotency_record`).
- Retry with the same key but **different** body → should return **409 Conflict** with error code `IDEMPOTENCY_KEY_REUSED`.
- Verify `idempotency_record` is written in the **same transaction** as the mutation for all write operations.

---

## Artifacts & Ownership

| Artifact | Owner | Notes |
|---|---|---|
| **Checklist in this doc** | Architect | Single source of truth for E2E gate criteria |
| **API journey test** (real Postgres + HTTP, no mocks) | Maya | `api/test/` — prefer new `api/test/e2e/` or `integration/` journey file; must use real Postgres DB like DB Gate does |
| **Playwright student Web script** | Leo | `web/e2e/` — covers invite accept → home credits → self-book → cancel; runs against local `pnpm dev` + docker Postgres |
| **Teacher iOS manual walkthrough + screenshots** | Nina | Manual test: Today shows booking; reschedule; complete; undo with `Idempotency-Key`; Xcode Previews alone are NOT sufficient for this gate |

**Clarification:**
- Maya's API journey test should be **programmatic and automated** (runnable in CI or via script).
- Leo's Playwright script should be **automated** (runnable locally; CI integration optional for Wave 1).
- Nina's iOS test is **manual** for now (automated UI tests are out of scope for Wave 1); requires documented walkthrough checklist + attached screenshots showing key states (Today view with booking, reschedule confirmation, completion success, undo success).

---

## Local Run Prerequisites

Before running the E2E gate locally, ensure the following setup:

### Postgres
- Start via `docker compose up` (or equivalent `pnpm db:up` if repo defines it).
- Run migrations: `pnpm db:migrate` (or equivalent).

### API + Web
- Run both services via root `pnpm dev` (or equivalent monorepo start command).
- Verify API is accessible at `http://localhost:<port>` and Web at `http://localhost:<port>`.

### iOS
- Run iOS app in Simulator against local API.
- Configure API base URL to point to local backend (e.g., `http://localhost:3000` or equivalent).  
  _Note:_ Document whatever mechanism the repo already uses for configuring the iOS app's API base URL (environment variables, plist, config file, or hardcoded dev setting). Do NOT invent new secrets or environment variables for this purpose in Wave 1.

### Seed Data
- A minimal seed script or documented seed sequence is required to set up:
  - One teacher account
  - One course with availability windows
  - One student account (or the invite flow creates it)
  - One package with credit balance (e.g., 10 sessions)
- **Action for Maya:** If a seed script does not currently exist in the repo, provide a minimal one or document the manual SQL/API sequence needed to seed the above data.  
  _Do NOT invent a seed implementation in this documentation PR._ This is a follow-up task for Maya if needed.

### Local Teacher Auth (iOS E2E Only)
- Product Sign in with Apple (`POST /v1/auth/apple`) remains **501 Not Implemented** and is **not required** for this Stabilization gate.
- For teacher iOS E2E testing on local stack only, allow `POST /v1/auth/dev/teacher` endpoint:
  - **Gate:** `NODE_ENV=development` or `test` only; return `404` or `403` in production/staging.
  - **Behavior:** Seeds or looks up a teacher `User` record and returns **real** access + refresh JWTs (same shape as production auth envelopes).
  - iOS uses real `Principal` + real `/v1/*` routes — **not** `DEMO_MODE`, **not** mock repositories, **not** bypassing `SessionStore`.
  - Teacher can then create students, invites, bookings, etc., using the standard iOS UI flows.
- **Ownership:**
  - **Maya:** Implements `POST /v1/auth/dev/teacher` in API (gated to dev/test environments).
  - **Nina:** Adds a DEBUG-only UI entry (compile flag, never enabled for Release builds) that calls this endpoint to obtain tokens, then proceeds through normal iOS auth flow.
- **Note:** Mac simulator is still required for Nina's manual walkthrough + screenshots. Do not implement this endpoint in this documentation PR.

---

## Environments

### Required Now: Local
- **Postgres:** `docker-compose` or equivalent local Postgres 16.
- **Backend:** API service running locally via `pnpm dev`.
- **Web client:** Running locally via `pnpm dev`.
- **iOS client:** Simulator or physical device, connected to local API.

**This gate MUST pass on local before Wave 2 begins.**

### Follow-Up: Staging
- **Postgres:** Real Supabase Postgres (production-like).
- **Backend:** Deployed API service (e.g., Vercel, Railway, or equivalent).
- **Web client:** Deployed Web app.
- **iOS client:** TestFlight build.

**Staging validation is recommended after local is green but is NOT required to unblock Wave 2.** Document staging as a follow-up milestone once local E2E is stable.

---

## Pass / Fail Criteria

### Gate PASSES When:
1. **Maya's API journey test** is green in CI (or documented as a runnable script that passes locally).
2. **Leo's Playwright script** is green locally (CI integration optional for Wave 1).
3. **Nina's manual iOS walkthrough** checklist is signed off with screenshots attached to the tracking PR or issue showing:
   - Today view with new booking visible
   - Reschedule confirmation screen
   - Completion success state
   - Undo success state (with `Idempotency-Key` header confirmed in network logs or documented in walkthrough)

### Gate FAILS When:
- Any journey step (1–9) fails or returns an unexpected error.
- Any accounting assertion is violated (e.g., double-count on package create, missing ledger entry, idempotency replay failure).
- Nina's iOS walkthrough cannot be completed or screenshots show incorrect state.

**Failure triage:**
- If a UI-level failure occurs, determine whether the root cause is frontend (incorrect API call) or backend (API returns wrong data/error).
- If an accounting assertion fails, investigate the corresponding repository or transaction logic in `api/src/`.

---

## Out of Scope (Not Required for This Gate)

The following are explicitly **out of scope** for Wave 1 Stabilization E2E:

- **Wave 2 features:** Any product features not part of the frozen Wave 1 scope.
- **DEMO_MODE Apple login bypass:** iOS authentication shortcuts for testing are not required for this gate.
- **Making iOS Build Gate required:** The iOS build job in CI may remain optional; requiring it is a separate decision post-stabilization.
- **Branch protection changes:** Adding new CI jobs to required checks is a manual follow-up after jobs are stable (not part of this PR).
- **Staging environment existence:** If staging does not yet exist, document it as a follow-up; do not block the gate on staging being live.
- **Automated iOS UI tests:** Nina's manual walkthrough + screenshots are sufficient for Wave 1. Automated XCUITest or similar is deferred.

---

## References

- `docs/wave1-stabilization.md` — Parent freeze doc with P0 issues and success criteria
- `docs/impl-guide.md` — Frozen API contracts and implementation guide
- `docs/mvp.md` — Product rules (package model, state machine, flows, idempotency)
- `docs/data-model.md` — Database schema, invariants, transactions
- `docs/slot-algorithm.md` — Slot computation and L1/L2/L3 validation

---

**Prepared:** 2026-09-22  
**Next Steps:** Maya, Leo, Nina complete respective test artifacts; Architect tracks gate pass/fail status and unblocks Wave 2 when green.
