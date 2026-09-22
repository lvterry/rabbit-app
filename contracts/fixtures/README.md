# Rabbit Contract Fixtures

This directory contains JSON fixtures that serve as the executable contract between the API backend, Web client, and iOS client.

## Purpose

- **Cross-platform contract**: All clients validate against these same fixtures
- **Mock development**: Web and iOS can develop against these fixtures before the API is ready
- **Schema validation**: All fixtures must pass Zod schema validation in `packages/shared`
- **Documentation**: These are concrete examples of the API responses

## Organization

```
contracts/fixtures/
├── meta.json                                  # Server metadata
├── auth/
│   ├── me-user-teacher.json                  # Teacher profile response
│   └── me-user-teacher-and-student.json      # User who is both teacher and student
├── invites/
│   ├── pending.json                          # Pending invite preview
│   ├── consumed-matching-session.json        # Revisiting own consumed invite
│   ├── consumed-foreign-session-error.json   # Someone else's consumed invite
│   └── expired-error.json                    # Expired invite error
├── students/
│   ├── student-home-anonymous.json           # Anonymous student home (no account)
│   ├── student-home-user-multi-teacher.json  # Student with account, multiple teachers
│   └── student-detail.json                   # Teacher view of student detail
├── slots/
│   ├── bookable-days.json                    # Days with available slots
│   ├── slots.json                            # Available time slots for a day
│   ├── no-availability.json                  # No availability on this day
│   ├── fully-booked.json                     # Day is fully booked
│   └── insufficient-sessions.json            # Student has no remaining sessions
├── bookings/
│   ├── upcoming-teacher.json                 # Teacher view of upcoming booking
│   ├── upcoming-student.json                 # Student view of upcoming booking
│   ├── completed.json                        # Completed booking
│   ├── cancelled-free.json                   # Free cancellation
│   └── cancelled-late.json                   # Late cancellation (charged)
└── errors/
    ├── slot-taken.json                       # Slot conflict error
    ├── late-reschedule-insufficient.json     # Insufficient sessions for late reschedule
    ├── token-expired.json                    # Token expired error
    └── network-error-client-only.json        # Client-side network error
```

## Validation

All fixtures are validated against Zod schemas in `packages/shared/src/schemas.ts`.

Run validation:

```bash
pnpm test:contract
```

## Usage

### In Web (fixture mode)

```bash
VITE_USE_FIXTURES=1 pnpm web:dev
```

### In iOS (mock repository)

```swift
MockBookingRepository.upcomingTeacher // loads from fixtures
```

### In API tests

```typescript
import upcomingTeacherFixture from '../../../contracts/fixtures/bookings/upcoming-teacher.json'
```

## Rules

1. **All fixtures must be valid JSON**
2. **All fixtures must pass their corresponding Zod schema**
3. **Error fixtures use `ok: false` envelope**
4. **Success fixtures use `ok: true` envelope with `data` and `meta`**
5. **UUIDs should be consistent across related fixtures** (e.g., same teacher ID, student ID)
6. **Dates should be in the future relative to 2026-02-20** to avoid "already started" issues
7. **No sensitive data** (use example emails, fake names)

## Key Fixtures

### Student Journey

1. `invites/pending.json` → Student clicks invite link
2. `students/student-home-anonymous.json` → Student sees their courses
3. `slots/bookable-days.json` → Student views available days
4. `slots/slots.json` → Student views time slots
5. `bookings/upcoming-student.json` → Student creates booking
6. `bookings/completed.json` → Booking is completed

### Error Scenarios

- `errors/slot-taken.json` - Most important: concurrent booking conflict
- `errors/late-reschedule-insufficient.json` - Late reschedule with insufficient balance
- `invites/consumed-foreign-session-error.json` - Security: no identity leak
- `slots/insufficient-sessions.json` - Student can't book without sessions

## Updating Fixtures

When updating fixtures:

1. Update the JSON file
2. Run `pnpm test:contract` to validate
3. Update corresponding schemas if needed
4. Document breaking changes in PR

## Principal & Auth Context

Fixtures represent responses for different Principal contexts (from `auth-model.md`):

- **Teacher fixtures** → `Principal.kind = 'User'` with teacher capability
- **Student fixtures** → `Principal.kind = 'Student'` or `Principal.kind = 'User'` with student binding
- **Anonymous student** → `Student.hasBoundAccount = false`
- **User student** → `Student.hasBoundAccount = true`

Note: Teacher is a capability, not a Principal kind.
