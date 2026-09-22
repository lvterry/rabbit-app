# Wave 1 Stabilization E2E — iOS Teacher Walkthrough

**Status:** Preparation Complete — Walkthrough Blocked on Auth  
**Owner:** Nina (iOS)  
**Context:** Architect's Wave 1 Stabilization E2E Exit Gate validation  
**Date:** 2026-09-22

---

## Goal

Validate iOS Teacher app against **real local API** (docker-compose Postgres + API server) through the complete booking lifecycle:

1. Today view shows new student booking after self-book
2. Teacher reschedules booking
3. Teacher completes booking  
4. Teacher undoes completion (DELETE with Idempotency-Key)

**Success criteria:** All steps complete successfully with screenshots captured; balance integrity verified.

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

## Current Blocker: Authentication ⚠️

**Status:** BLOCKED — walkthrough cannot proceed until auth is resolved.

### Issue

- Production auth: `POST /v1/auth/apple` (Sign in with Apple) returns **501 Not Implemented**
- Local development auth: Architect and Terry discussing preferred approach:
  - Option: `POST /v1/auth/dev/teacher` (NODE_ENV=development|test) that mints real JWTs with Principal
  - **NOT implemented yet**

### What Does NOT Pass This Gate

- ✘ Xcode Previews with mock data
- ✘ `DEMO_MODE` environment flag with hardcoded tokens
- ✘ Client-side fake login that bypasses real Principal
- ✘ Canvas-only testing with MockRepository

**Requirement:** iOS must authenticate against the **real API** and obtain a valid JWT that encodes a real `Principal` (teacher_id, student_id scope). Only then can booking lifecycle operations be tested end-to-end.

### Next Steps

1. **Wait** for Architect/Terry decision and implementation of dev teacher auth endpoint
2. Once available, update `SessionStore.swift` to call the dev auth endpoint (iOS P0 work tracked separately)
3. Resume this checklist

---

## Walkthrough Steps (Blocked Until Auth Ready)

**Instructions:** Once auth is unblocked, perform these steps in sequence. Check each box after completion and attach screenshot.

### Step 1: Prerequisites & Setup

- [ ] Postgres container running (`docker ps`)
- [ ] API server running on `:8787` (`curl http://localhost:8787/v1/meta`)
- [ ] Xcode scheme configured with `API_BASE_URL=http://localhost:8787`
- [ ] iOS app built and launched on Simulator or device
- [ ] Teacher authenticated via real API (dev teacher auth endpoint)

**Screenshot:** `ios/docs/e2e-screenshots/00-setup-verified.png`  
*(Optional: terminal showing docker + curl + Xcode scheme)*

---

### Step 2: Verify Initial State — Today View

**Action:**
1. Navigate to **Today** tab (root tab)
2. Verify teacher's daily view loads from real API

**Expected:**
- API request: `GET /v1/me/teacher-day?date=YYYY-MM-DD`
- Response includes upcoming bookings (may be empty if no bookings exist yet)
- No errors displayed

**Screenshot:** `ios/docs/e2e-screenshots/01-today-initial-state.png`

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

**Alternative:** Use the Student Web app (`http://localhost:3000`) if available.

**Expected:**
- 201 response with new booking
- Booking status: `Upcoming`

**Screenshot:** `ios/docs/e2e-screenshots/02-student-booking-created.png`  
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

**Screenshot:** `ios/docs/e2e-screenshots/03-today-after-selfbook.png`

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

**Screenshot:** `ios/docs/e2e-screenshots/04-booking-rescheduled.png`

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

**Screenshot:** `ios/docs/e2e-screenshots/05-booking-completed.png`

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

**Screenshot:** `ios/docs/e2e-screenshots/06-completion-undone.png`

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

**Screenshot:** `ios/docs/e2e-screenshots/07-final-state-verified.png`

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
├── 00-setup-verified.png
├── 01-today-initial-state.png
├── 02-student-booking-created.png
├── 03-today-after-selfbook.png
├── 04-booking-rescheduled.png
├── 05-booking-completed.png
├── 06-completion-undone.png
└── 07-final-state-verified.png
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

**Status:** Preparation complete; walkthrough execution **blocked on auth**.  
**Updated:** 2026-09-22
