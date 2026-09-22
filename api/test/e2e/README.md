# Stabilization E2E Seed

Reusable seed for both API journey tests and Web Playwright E2E.

## Quick Start

```bash
# 1. Set DATABASE_URL
export DATABASE_URL="postgresql://rabbit:rabbit_test_password@localhost:5432/rabbit_test"

# 2. Run migrations (if not already done)
pnpm db:migrate

# 3. Run seed script
cd api/test/e2e
tsx seed-stabilization.ts

# Output: JSON with all env values Leo needs
```

## Output Format

```json
{
  "TEACHER_USER_ID": "uuid",
  "TEACHER_ID": "uuid",
  "TEACHER_ACCESS_TOKEN": "jwt...",
  "TEACHER_REFRESH_TOKEN": "jwt...",
  
  "STUDENT_ID": "uuid",
  "STUDENT_NAME": "E2E Student",
  
  "INVITE_TOKEN": "e2e-invite-...",
  "INVITE_URL_PATH": "/invites/{token}",
  
  "STUDENT_ACCESS_TOKEN": "jwt...",
  "STUDENT_REFRESH_TOKEN": "jwt...",
  
  "COURSE_ID": "uuid",
  "COURSE_NAME": "E2E Course",
  "PACKAGE_ID": "uuid",
  "REMAINING_SESSIONS": 5,
  
  "SLOT_START_ISO": "2026-09-24T10:00:00.000Z",
  "SLOT_END_ISO": "2026-09-24T11:00:00.000Z",
  "SLOT_DATE": "2026-09-24",
  
  "BASE_URL": "http://localhost:8787/v1"
}
```

## Web E2E Usage (Leo)

### Playwright Setup

```typescript
// playwright.config.ts or test setup
import { seed } from './api/test/e2e/seed-stabilization'

let seedData: SeedOutput

beforeAll(async () => {
  seedData = await seed()
})

// Now use seedData.INVITE_TOKEN, seedData.SLOT_START_ISO, etc.
```

### Student Journey Example

```typescript
test('student accepts invite and books session', async ({ page }) => {
  // 1. Navigate to invite page
  await page.goto(`http://localhost:5173/i/${seedData.INVITE_TOKEN}`)
  
  // 2. Accept invite
  await page.click('button:has-text("接受邀请")')
  
  // 3. Should redirect to home with credits
  await expect(page).toHaveURL('http://localhost:5173/')
  await expect(page.locator('text=剩余 5 节')).toBeVisible()
  
  // 4. Book a session
  await page.click('button:has-text("预约课程")')
  await page.click(`[data-date="${seedData.SLOT_DATE}"]`)
  await page.click(`[data-time="${seedData.SLOT_START_ISO}"]`)
  await page.click('button:has-text("确认预约")')
  
  // 5. Should see success
  await expect(page.locator('text=预约成功')).toBeVisible()
})
```

### Direct API Calls (if needed)

```typescript
// Use pre-minted tokens for API assertions
const response = await fetch(`${seedData.BASE_URL}/me/student-home`, {
  headers: {
    'Authorization': `Bearer ${seedData.STUDENT_ACCESS_TOKEN}`
  }
})

const data = await response.json()
expect(data.data.cards[0].remainingTotal).toBe(5)
```

## What Gets Seeded

| Resource | Details |
|---|---|
| Teacher | user_id, teacher_id, name="E2E Teacher", timezone="Asia/Shanghai", minLeadHours=2, freeCancelHours=24, maxAdvanceDays=30 |
| Student | student_id, name="E2E Student", status="Active", user_id=NULL (unbound, default state) |
| Course | course_id, name="E2E Course", duration=60min, allow_self_booking=true |
| Availability | All week (Mon-Sun), 08:00-20:00 (480-1200 minutes) |
| Package | package_id, 5 sessions (via PACKAGE_CREATED transaction), remaining=5, purchased=5 |
| Invite | token="e2e-invite-{timestamp}-{random}", status="Pending", expires in 7 days |
| Bookable Slot | 48h from now, rounded to next 30-min slot, passes L3 validation (minLeadHours=2) |

## Alignment to Frozen Contracts

- ✅ **Invite URL:** Plural `/invites/:token` (not singular `/invite`)
- ✅ **Reserve-only ledger:** Only `PACKAGE_CREATED` transaction until booking is completed
- ✅ **Student-home shape:** Currently `{ upcomingBooking, recentBookings, balance }`, frozen target is `{ cards, bound }` (migration tracked separately)
- ✅ **Self-bookable:** Course has `allow_self_booking=true`, slots pass L3 validation

## Cleanup

Seed data is ephemeral (suitable for docker-compose Postgres that can be reset). For persistent test databases, add cleanup:

```sql
-- Delete in dependency order
DELETE FROM booking WHERE student_id = '{STUDENT_ID}';
DELETE FROM package_transaction WHERE package_id = '{PACKAGE_ID}';
DELETE FROM lesson_package WHERE id = '{PACKAGE_ID}';
DELETE FROM student_invite WHERE student_id = '{STUDENT_ID}';
DELETE FROM student WHERE id = '{STUDENT_ID}';
DELETE FROM availability_rule WHERE teacher_id = '{TEACHER_ID}';
DELETE FROM course WHERE id = '{COURSE_ID}';
DELETE FROM teacher_profile WHERE id = '{TEACHER_ID}';
DELETE FROM app_user WHERE id = '{TEACHER_USER_ID}';
```

Or reset the entire database:

```bash
# Drop and recreate
psql $DATABASE_URL -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
pnpm db:migrate
```

## Environment Variables

| Var | Default | Required |
|---|---|---|
| `DATABASE_URL` | `postgresql://rabbit:rabbit_test_password@localhost:5432/rabbit_test` | Yes |
| `API_BASE_URL` | `http://localhost:8787/v1` | No (used in output only) |
| `JWT_SECRET` | `development-secret-change-in-production` | No (defaults in api/src/auth/jwt.ts) |

## Integration with API Journey Test

The API journey test (`api/test/db/stabilization-e2e-journey.test.ts`) uses the same seed logic inline in `beforeAll`. Future refactor could import from this script to ensure Leo's web E2E and Maya's API E2E stay in sync.
