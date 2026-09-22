# Wave 1 Stabilization E2E — iOS Teacher Walkthrough

**Status:** Auth Wired — Blocked on Maya's Endpoint Implementation  
**Owner:** Nina (iOS)  
**Context:** Architect's Wave 1 Stabilization E2E Exit Gate validation  
**Authority:** [PR #16](https://github.com/lvterry/rabbit-app/pull/16) `docs/wave1-stabilization-e2e.md` (branch `cursor/wave1-e2e-exit-docs-db87`)  
**Date:** 2026-09-22

---

## Goal

Validate iOS Teacher app against **real local API** (docker-compose Postgres + API server) through the complete booking lifecycle per Architect's E2E Exit Gate:

1. Today view shows new student booking after self-book
2. Teacher reschedules booking
3. Teacher completes booking  
4. Teacher undoes completion (DELETE with Idempotency-Key)

**Success criteria:** All steps complete successfully with screenshots captured; balance integrity verified; no mocks or DEMO_MODE bypass.

---

## Prerequisites

### 1. Backend Stack Running

```bash
# From repository root
docker-compose up -d postgres
pnpm dev  # Starts API on http://localhost:8787
```

**Verify:**
- Postgres: `docker ps` shows postgres container running
- API: `curl http://localhost:8787/v1/meta` returns `{ "status": "ok", ... }`

### 2. Xcode Environment Configuration

Configure API base URL in Xcode scheme:

1. Open `/workspace/ios/Rabbit.xcodeproj`
2. Menu: **Product → Scheme → Edit Scheme…** (or `⌘<`)
3. Select **Run** (left sidebar)
4. Select **Arguments** tab
5. Under **Environment Variables**, add:
   - Name: `API_BASE_URL`
   - Value: `http://localhost:8787`

**Note:** iOS Simulator's `localhost` maps to the host Mac's `localhost`, so this URL will reach the API running on your Mac.

### 3. Test Device

- Mac with Xcode 15.0+
- iOS Simulator (iPhone 15, iOS 17.0+)
- Or physical device connected via USB with Xcode provisioning

---

## Current Blocker: Maya's Endpoint Implementation ⚠️

**Status:** iOS client wired and ready — waiting for Maya's backend endpoint.

### Auth Path (Architect Decision — PR #16)

**Backend (Maya):**
- Endpoint: `POST /v1/auth/dev/teacher`
- Gate: `NODE_ENV=development` or `test` only; returns 404/403 in production/staging
- Behavior: Seeds or looks up a teacher User record and returns **real** access + refresh JWTs
- Response shape (expected):
  ```json
  {
    "accessToken": "eyJ...",
    "refreshToken": "eyJ...",
    "expiresIn": 900
  }
  ```
- iOS then calls `GET /v1/me` with Bearer token to fetch full User + Teacher profile
- **Status:** NOT implemented yet; Maya owns this endpoint

**iOS Client (Nina — THIS PR):**
- ✅ `SessionStore.authenticateDevTeacher()` method implemented
- ✅ DEBUG-only UI entry on `OnboardingView` ("Dev: Sign in as seeded teacher")
- ✅ Gated with `#if DEBUG` — never enabled in Release builds
- ✅ Uses real `SessionStore` → real `/v1/*` routes with real Principal
- ✅ No DEMO_MODE login bypass, no mock repositories

**Walkthrough Prerequisites:**
1. Maya implements and merges `POST /v1/auth/dev/teacher` endpoint
2. Mac with Xcode and iOS Simulator available
3. Local backend stack running (docker-compose Postgres + API)

### What Does NOT Pass This Gate

- ✘ Xcode Previews with mock data
- ✘ `DEMO_MODE` environment flag with hardcoded tokens
- ✘ Client-side fake login that bypasses real Principal
- ✘ Canvas-only testing with MockRepository

**Requirement:** iOS must authenticate against the **real API** and obtain a valid JWT that encodes a real `Principal` (teacher_id, student_id scope). Only then can booking lifecycle operations be tested end-to-end.

---

## Walkthrough Steps (Ready When Maya's Endpoint Available)

**Instructions:** Once Maya's `POST /v1/auth/dev/teacher` endpoint is available, perform these steps in sequence. Check each box after completion and attach screenshot.

### Step 0: Dev Teacher Authentication (NEW)

**Action:**
1. Launch iOS app in DEBUG configuration (Xcode)
2. On Onboarding screen, tap **"Dev: Sign in as seeded teacher"** button
3. Wait for authentication to complete

**Expected:**
- API request: `POST /v1/auth/dev/teacher` with empty JSON body `{}`
- Response: `{ "accessToken": "...", "refreshToken": "...", "expiresIn": 900 }`
- iOS calls `GET /v1/me` with Bearer token
- SessionStore populated with real User + Teacher
- App navigates to MainTabView (4-tab root)

**Screenshot:** `ios/docs/e2e-screenshots/00a-dev-auth-button.png`  
**Screenshot:** `ios/docs/e2e-screenshots/00b-authenticated-main-tab.png`

**Verify:**
- [ ] Dev auth button visible in DEBUG build only
- [ ] Authentication succeeds (no error dialog)
- [ ] MainTabView appears with Today tab

---

### Step 1: Prerequisites & Setup

- [ ] Postgres container running (`docker ps`)
- [ ] API server running on `:8787` (`curl http://localhost:8787/v1/meta`)
- [ ] Xcode scheme configured with `API_BASE_URL=http://localhost:8787`
- [ ] iOS app built in DEBUG configuration
- [ ] Teacher authenticated via dev auth button (Step 0)

**Screenshot:** `ios/docs/e2e-screenshots/01-setup-verified.png`  
*(Optional: terminal showing docker + curl)*

---

### Step 2: Verify Initial State — Today View

**Action:**
1. Navigate to **Today** tab (should already be selected after auth)
2. Verify teacher's daily view loads from real API

**Expected:**
- API request: `GET /v1/me/teacher-day?date=YYYY-MM-DD`
- Response includes upcoming bookings (may be empty if no bookings exist yet)
- No errors displayed

**Screenshot:** `ios/docs/e2e-screenshots/02-today-initial-state.png`

---

### Step 3: Student Self-Books Session (Simulated)

**Context:** This step simulates a student booking a session via the Student app (Web or iOS). Since we're testing **Teacher iOS only**, perform this via API directly:

```bash
# Get student ID and course ID from teacher data
STUDENT_ID="..."  # From teacher's student list
COURSE_ID="..."   # From teacher's course list
START_AT="2026-09-23T14:00:00Z"  # Pick a valid slot in teacher's availability

# Create booking as student (requires student JWT)
curl -X POST http://localhost:8787/v1/bookings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $STUDENT_JWT" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{
    "studentId": "'$STUDENT_ID'",
    "courseId": "'$COURSE_ID'",
    "startAt": "'$START_AT'"
  }'
```

**Alternative:** Use the Student Web app (`http://localhost:3000`) if available, or Maya's API journey test can create the booking programmatically.

**Expected:**
- 201 response with new booking
- Booking status: `Upcoming`

**Screenshot:** `ios/docs/e2e-screenshots/03-student-booking-created.png`  
*(Optional: curl output or Web UI)*

---

### Step 4: Today View Shows New Booking

**Action:**
1. Return to Teacher iOS app
2. Pull to refresh Today view
3. Verify the new booking appears in today's list

**Expected:**
- API request: `GET /v1/me/teacher-day?date=YYYY-MM-DD`
- Response includes the newly created booking
- Booking displays: student name, course, time range, status `Upcoming`

**Screenshot:** `ios/docs/e2e-screenshots/04-today-after-selfbook.png`

**Verify:**
- [ ] New booking visible in Today list
- [ ] Student name matches
- [ ] Time range correct
- [ ] Status shows "Upcoming" or equivalent

---

### Step 5: Teacher Reschedules Booking

**Action:**
1. Tap on the booking in Today view → opens `BookingDetailView`
2. Tap **Reschedule** button (if visible and enabled)
3. Select a new date and time (must be a valid slot per availability rules)
4. Confirm reschedule

**Expected:**
- API request: `POST /v1/bookings/:id/reschedule` with `Idempotency-Key` header
- Request body: `{ "newStartAt": "YYYY-MM-DDTHH:MM:SSZ" }`
- Response: booking with updated `startAt`, status still `Upcoming`
- Original booking linked via `rescheduledFromBookingId` / `rescheduledToBookingId` (internal)

**Screenshot:** `ios/docs/e2e-screenshots/05-booking-rescheduled.png`

**Verify:**
- [ ] Booking detail shows new time
- [ ] Status remains `Upcoming`
- [ ] API response included `Idempotency-Key` in request headers (check via proxy/logs if possible)

---

### Step 6: Teacher Completes Booking

**Action:**
1. If booking time is now in the past (or completion allowed per `canComplete` action), tap **Complete** button
2. Confirm completion

**Expected:**
- API request: `POST /v1/bookings/:id/completion` with `Idempotency-Key` header
- Response: booking with status `Completed`
- Balance decremented by course `sessionsPerBooking` (visible in student detail if checked)

**Screenshot:** `ios/docs/e2e-screenshots/06-booking-completed.png`

**Verify:**
- [ ] Booking status shows "Completed"
- [ ] **Undo Completion** button now visible (if `canUndoCompletion` is true)
- [ ] API request included `Idempotency-Key` header

---

### Step 7: Teacher Undoes Completion (Critical — Idempotency-Key Verification)

**Action:**
1. Tap **Undo Completion** button
2. Confirm undo action

**Expected:**
- API request: `DELETE /v1/bookings/:id/completion` with `Idempotency-Key` header
- Response: booking reverts to `Upcoming` status
- Balance restored (session credit returned to student)

**Screenshot:** `ios/docs/e2e-screenshots/07-completion-undone.png`

**Critical Verification — Idempotency-Key Sent:**
- [ ] Booking status reverted to `Upcoming`
- [ ] **Confirm via network proxy (Charles/Proxyman) or API server logs:**  
  - `DELETE /v1/bookings/:id/completion` request includes HTTP header:  
    `Idempotency-Key: <UUID>`
  - This is **already implemented** in `BookingRepository.undoCompletion` (line 79-81) and `HTTPClient.delete` (line 87-88)

**How to verify Idempotency-Key header:**

1. **Option A: Charles Proxy / Proxyman**
   - Install Charles or Proxyman on Mac
   - Configure iOS Simulator to route traffic through proxy
   - Inspect `DELETE /v1/bookings/:id/completion` request
   - Verify `Idempotency-Key` header present with UUID value

2. **Option B: API Server Logs**
   - Check Hono server request logs for incoming headers
   - Look for log entry: `DELETE /v1/bookings/:id/completion` with `idempotency-key: <uuid>` in headers

3. **Option C: Add Temporary Logging in HTTPClient**
   - Edit `ios/Packages/RabbitKit/Sources/RabbitKit/APIClient/HTTPClient.swift`
   - Add `print("🔑 Idempotency-Key: \(key)")` after line 87
   - Run undo operation and check Xcode console output
   - **Remove logging before commit**

---

### Step 8: Final State Verification

**Action:**
1. Return to Today view and refresh
2. Verify booking shows as `Upcoming` again (after undo)
3. Check student detail view (if accessible) to verify balance restored

**Expected:**
- Booking lifecycle complete: `Upcoming → Rescheduled → Completed → Undone → Upcoming`
- No orphaned state or balance discrepancies

**Screenshot:** `ios/docs/e2e-screenshots/08-final-state-verified.png`

**Verify:**
- [ ] Booking status correct
- [ ] Balance integrity maintained
- [ ] No error dialogs or crashes

---

## Pass/Fail Criteria

### ✅ PASS

- All 8 steps completed without errors
- Screenshots captured for each step
- Idempotency-Key confirmed sent on `DELETE /v1/bookings/:id/completion` (Step 7)
- Balance integrity verified (session count correct before/after complete/undo)

### ❌ FAIL — Report Blockers

If any step fails, document and report to Architect:

**Failure Template:**

```
**Step:** <step number>
**Action:** <what was attempted>
**Expected:** <what should have happened>
**Actual:** <what actually happened>
**Error:** <API error code/message if any>
**Screenshot:** <path to screenshot showing failure>
**Blocker:** <Is this an iOS bug, API bug, or environmental issue?>
```

**Example:**

```
**Step:** 5 (Reschedule)
**Action:** Selected new time 2026-09-24 15:00, tapped Confirm
**Expected:** Booking rescheduled to new time
**Actual:** 422 error: "SLOT_IN_EXCEPTION"
**Error:** API returned errorCode=SLOT_IN_EXCEPTION
**Screenshot:** ios/docs/e2e-screenshots/04-reschedule-failed.png
**Blocker:** API bug — availability exception not respected in slot validation (Wave 1 Stabilization P0 issue #3)
```

---

## Screenshot Storage

Store all screenshots in:

```
ios/docs/e2e-screenshots/
├── 00a-dev-auth-button.png
├── 00b-authenticated-main-tab.png
├── 01-setup-verified.png
├── 02-today-initial-state.png
├── 03-student-booking-created.png
├── 04-today-after-selfbook.png
├── 05-booking-rescheduled.png
├── 06-booking-completed.png
├── 07-completion-undone.png
└── 08-final-state-verified.png
```

**Note:** Screenshots are **not committed** to the repository. Attach them to the PR as artifacts or post them in a follow-up PR comment.

---

## References

- Stabilization freeze doc: `/workspace/docs/wave1-stabilization.md`
- E2E Exit Gate (lines 318-336): Full user journey requirements
- iOS README: `/workspace/ios/README.md` (Local API setup section)
- Idempotency implementation: `ios/Packages/RabbitKit/Sources/RabbitKit/Repository/BookingRepository.swift` (line 79-81)
- HTTPClient DELETE with Idempotency-Key: `ios/Packages/RabbitKit/Sources/RabbitKit/APIClient/HTTPClient.swift` (line 57-61, 87-88)

---

## Next Steps After Walkthrough Passes

1. **Update this checklist** with PASS status and attach screenshots to PR or comment
2. **Report to Architect:** "iOS E2E walkthrough complete — all steps passed"
3. **Proceed to iOS P0 Stabilization work** (SessionStore refresh, DTO alignment) tracked separately

---

**Status:** iOS client wired and ready; walkthrough execution **blocked on Maya's endpoint**.  
**Updated:** 2026-09-22
