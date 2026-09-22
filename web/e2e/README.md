# E2E Tests - Student Web Flow

End-to-end tests for the student web application using Playwright, targeting the real local stack (API + Web + Database).

**Authority:** `docs/wave1-stabilization-e2e.md` — Wave 1 Stabilization E2E exit gate checklist

**Ownership (Leo - Web):** Playwright student Web script covering:
- Invite accept → home credits → self-book → cancel

See SoT checklist for full E2E journey ownership (Maya: API journey, Nina: iOS manual walkthrough).

## Prerequisites

### Local Stack

The tests require the following services running:

1. **PostgreSQL Database** (via Docker Compose)
   ```bash
   # From repo root
   pnpm db:up
   ```
   
   Database connection:
   - Host: `localhost:5432`
   - User: `rabbit`
   - Password: `rabbit_local_password`
   - Database: `rabbit_dev`

2. **API Server** (port 8787)
   ```bash
   # From repo root
   pnpm api:dev
   ```

3. **Web Dev Server** (port 5173)
   ```bash
   # From repo root  
   pnpm web:dev
   ```

Or start both API and Web together:
```bash
# From repo root
pnpm dev
```

### Seed Data Requirements

⚠️ **WAIT ON MAYA'S STABILIZATION E2E SEED PR**

**Do NOT create seed data in the web layer that diverges from contracts.**

All seed data must come from the API/database layer. Maya owns the seed implementation:
- **Provisional seed path**: `api/test/e2e/seed-stabilization.ts`
- Maya will match this path or note any rename in her PR

**Seed creates** (Maya's responsibility):
- Teacher + user account
- Course with `allowSelfBooking: true`
- Availability with ≥1 SelfBooked-valid slot **within free-cancel window** (so cancel test is exercisable)
- Student + Pending invite
- Active package with `remaining > 0`

**Cancel Test Assumption:** Seed-provided bookable slots are far enough in the future (e.g., ≥48 hours from test run) that created bookings remain within the free-cancel window (`freeCancelHours`). This allows the cancel test to hard-assert the 取消预约 button is visible and functional.

**Until Maya's seed PR merges**, tests will skip/fail clearly if required environment variables are missing.

## Running Tests

### Setup (First Time Only)

1. **Install Playwright browsers**:
   ```bash
   cd web
   npx playwright install chromium
   ```

2. **Configure environment**:
   ```bash
   cd web
   cp .env.test.example .env.test
   # Edit .env.test and set INVITE_TOKEN after Maya's seed PR merges
   ```

### Run All Tests

```bash
cd web
npx playwright test
```

**Note**: Tests will skip if `INVITE_TOKEN` is not set in `.env.test`.

### Run Tests in UI Mode (Recommended for Development)

```bash
cd web
npx playwright test --ui
```

### Run Tests in Headed Mode (See Browser)

```bash
cd web
npx playwright test --headed
```

### Run Specific Test File

```bash
cd web
npx playwright test e2e/student-flow.spec.ts
```

### Debug a Test

```bash
cd web
npx playwright test --debug
```

## Environment Variables

### Required Environment Contract

Tests use these environment variable names (coordinate with Maya's seed):

| Variable | Example | Description | Required |
|----------|---------|-------------|----------|
| `DATABASE_URL` | `postgresql://rabbit:rabbit_local_password@localhost:5432/rabbit_dev` | Postgres connection string | Yes (seed only) |
| `API_BASE` | `http://localhost:8787` | API base URL | Yes |
| `INVITE_TOKEN` | `test-invite-stable-001` | Pending invite token created by seed | Yes |
| `STUDENT_ID` | `uuid-from-seed` | Student ID created by seed | Optional |
| `TEACHER_ID` | `uuid-from-seed` | Teacher ID created by seed | Optional |
| `COURSE_ID` | `uuid-from-seed` | Course ID created by seed | Optional |
| `PACKAGE_ID` | `uuid-from-seed` | Package ID created by seed | Optional |
| `BOOKABLE_SLOT_START` | `2026-09-25T10:00:00Z` | ISO timestamp of valid bookable slot | Optional |
| `BOOKABLE_SLOT_END` | `2026-09-25T11:00:00Z` | ISO timestamp of slot end | Optional |
| `REMAINING_BEFORE` | `8` | Expected remaining credits before booking | Optional |

### Web App Configuration

The Web app connects to the API using `VITE_API_BASE` from `.env`:
```bash
# web/.env
VITE_API_BASE=http://localhost:8787
VITE_USE_FIXTURES=0  # Must be 0 for real-stack tests
```

### Playwright Test Configuration

Create a `.env.test` file in the `web/` directory (copy from `.env.test.example`):

```bash
# web/.env.test
API_BASE=http://localhost:8787
INVITE_TOKEN=test-invite-stable-001  # From Maya's seed
# Add other vars after Maya's seed PR provides them
```

**Tests will skip with a clear message if `INVITE_TOKEN` is missing**, rather than inventing mock data.

See `web/.env.test.example` for the complete environment variable template.

## Test Coverage

### Current Test Suite

**`student-flow.spec.ts`** - Complete student booking flow:

1. ✅ **Enter via invite link** (`/i/:token`)
   - Displays teacher name and avatar
   - Shows student name
   - Shows course list with remaining credits
   - Accept button works and redirects to home

2. ✅ **Student-home shows course credits** (`/`)
   - Displays teacher cards
   - Shows student name per card
   - Shows course list with remaining credits (cards shape)
   - Verifies `bound` field (false for anonymous students)
   - "预约课程" button enabled when credits available

3. ✅ **Self-book a session** (`/book`)
   - Date selection shows bookable days
   - Time selection shows available slots
   - Confirmation shows selected date/time
   - Submit creates booking and returns to home

4. ✅ **Cancel a booking** (`/bookings/:id`)
   - Bookings list shows upcoming bookings
   - Booking detail shows course info
   - Cancel confirmation dialog appears
   - Cancel action updates booking to Cancelled status

### Not Covered (Future)

- Error states (expired invite, slot conflicts, insufficient credits)
- Reschedule flow
- History tab in bookings
- Multiple teachers/courses scenarios
- Network retry logic
- Session refresh (401 handling)

## CI Integration (Wave 1 Optional)

CI wiring is **optional for Wave 1**. Running green locally is sufficient.

If adding CI later, example GitHub Actions workflow:

```yaml
name: E2E Tests
on: [pull_request]
jobs:
  e2e:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    steps:
      - uses: actions/checkout@v3
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v3
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install
      - run: pnpm db:migrate
      - run: pnpm exec tsx scripts/seed-e2e-data.ts  # TODO: Maya's seed script
      - run: pnpm api:dev &
      - run: pnpm web:dev &
      - run: npx playwright install --with-deps chromium
      - run: pnpm --filter web playwright test
```

## Troubleshooting

### Tests Fail with "Navigation timeout"

- Ensure API is running on port 8787
- Ensure Web is running on port 5173
- Check `web/.env` has `VITE_USE_FIXTURES=0`

### Tests Fail with "invite not found" or "no courses"

- Seed data is missing or incorrect
- Run seed script/endpoint to populate test data
- Verify invite token is `test-invite-token`

### Tests Fail with "no bookable days"

- Teacher availability is not seeded
- Add bookable slots to the teacher's schedule
- Check that slots are in the future (next 30 days)

### Database Issues

```bash
# Reset database and re-run migrations
pnpm db:reset
pnpm db:migrate

# Re-seed test data
pnpm exec tsx scripts/seed-e2e-data.ts  # TODO: Maya
```

## Architecture

- **Framework**: Playwright Test
- **Target**: Local stack (not fixtures)
- **Browser**: Chromium (Desktop Chrome)
- **Fixtures**: None (real API + DB)
- **Seed**: Coordinated with API (Maya owns seed scripts)

## Frozen Contract Shapes

Tests assert these frozen API shapes (do NOT invent divergent fixtures):

### GET /v1/me/student-home
```typescript
{
  cards: Array<{
    teacherId: string
    teacherName: string
    studentName: string
    courses: Array<{
      courseId: string
      courseName: string
      allowSelfBooking: boolean
      remaining: number
      available: number
      exhausted: boolean
      // ...
    }>
  }>
  bound: boolean
}
```

### GET /v1/me/student-bookings
```typescript
// scope=upcoming
{ upcoming: BookingView[] }

// scope=history  
{ history: BookingView[] }
```

### Cancel Flow
- Student cancel early → no `LATE_CANCEL` error
- Ledger `remaining` unchanged until booking completes
- Booking transitions to `Cancelled` status

### Invite Flow
- POST /v1/students/:studentId/invites (Maya creates)
- GET /v1/invites/:token (pending → accepted)
- POST /v1/invites/:token/accept

## Test Flow

Required flow (all assertions against real API):

1. **Invite link** → open `/i/:token` or accept via API then UI
2. **Student-home** → shows credits (`cards`, `bound`)
3. **Self-book** → date → time → confirm → create booking
4. **Cancel** → early cancel (no late penalty), verify status

**Two-Booking Sequencing Note (from SoT §6):**  
Cancel removes the booking from upcoming. To exercise both cancel and reschedule/complete flows (teacher/API slices) without conflict, use two separate bookings or re-book after cancel. **This PR's Playwright suite covers one book→cancel path only.** Reschedule and complete flows are covered by Maya's API journey test and Nina's iOS manual walkthrough per the full E2E gate.

Tests do NOT mock or stub API responses. All data flows through the real API and database.
