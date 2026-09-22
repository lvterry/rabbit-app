# Rabbit Web - Student H5

Student web application for Rabbit tutoring/coaching platform.

## Features

- **Fixture-first development**: Full UI can run without backend using `VITE_USE_FIXTURES=1`
- **Direct contract reference**: Serves fixtures from `contracts/fixtures/` via Vite middleware (no duplication)
- **Invite flow**: Accept teacher invitations without app install or registration
- **Booking**: 3-step booking flow (date → time → confirm)
- **View bookings**: See upcoming and completed sessions
- **Cancel/Reschedule**: Manage bookings with policy-aware UI

## Setup

```bash
# Install dependencies (from repo root)
pnpm install

# Copy .env.example to .env
cp .env.example .env

# Edit .env if needed
```

## Development

```bash
# Run with fixtures (no backend needed)
# Fixtures are served directly from ../contracts/fixtures/
VITE_USE_FIXTURES=1 pnpm dev

# Run with real API
VITE_API_BASE=http://localhost:8787 pnpm dev

# Type check
pnpm typecheck

# Build for production
pnpm build
```

## Fixture Mode Details

When `VITE_USE_FIXTURES=1`:
- GET requests map to fixture files in `../contracts/fixtures/`
- POST requests load responses from fixture files (not inline stubs)
- Fixtures include full `{ok, data, meta}` envelope (no double wrapping)
- Vite middleware serves contracts directly during dev
- Production build copies fixtures to `dist/contracts/fixtures/`

### Fixture Path Mapping

| API Path | Fixture File |
|----------|--------------|
| `GET /v1/invites/:token` | Based on token value (see below) |
| `GET /v1/me/student-home` | `contracts/fixtures/students/student-home-anonymous.json` |
| `GET /v1/me/student-bookings` | Synthetic from `bookings/upcoming-student.json` & `completed.json` |
| `GET /v1/bookings/:id` | `contracts/fixtures/bookings/upcoming-student.json` |
| `GET /v1/teachers/:tid/bookable-days` | `contracts/fixtures/slots/bookable-days.json` |
| `GET /v1/teachers/:tid/slots` | `contracts/fixtures/slots/slots.json` |
| `POST /v1/invites/:token/accept` | `contracts/fixtures/invites/consumed-matching-session.json` |
| `POST /v1/bookings` | `contracts/fixtures/bookings/upcoming-student.json` (wrapped) |
| `POST /v1/bookings/:id/cancellation` | `contracts/fixtures/bookings/cancelled-free.json` (adapted) |
| `POST /v1/bookings/:id/reschedule` | `contracts/fixtures/bookings/upcoming-student.json` (adapted) |

### Invite Token Convention

To test different invite states in fixture mode, use these token values:

| Token Value | Fixture Loaded | Use Case |
|-------------|----------------|----------|
| `pending` (default) | `invites/pending.json` | First-time invite (US-09) |
| `accepted` or `consumed` | `invites/consumed-matching-session.json` | Already accepted (US-10) |
| `expired` | `errors/token-expired.json` | Expired invite |
| `foreign` | `invites/consumed-foreign-session-error.json` | Accepted by different user |

**Examples:**
- `/i/pending` → shows pending invite → accept redirects to home
- `/i/accepted` → shows "已接受" message with redirect button
- `/i/expired` → shows expiration error

## Routes

- `/i/:token` - Accept teacher invitation (S05)
- `/` - Student home page (S01)
- `/book` - Book a session (S02)
- `/bookings` - View bookings list (S03)
- `/bookings/:id` - Booking detail (S04)

## Architecture

- **Framework**: Preact with signals for state management
- **Router**: Preact Router (lightweight)
- **API Client**: Fixture-aware fetch wrapper with path mapping
- **Styling**: CSS variables + vanilla CSS (no runtime CSS-in-JS)
- **Fixtures**: Direct reference to `contracts/fixtures/` via Vite middleware

## Key Constraints

Following `impl-guide.md` requirements:

1. ✅ Works in WeChat WebView
2. ✅ Zero app install required
3. ✅ No registration wall
4. ✅ ≤3 taps from book entry to confirm
5. ✅ Reserved slots NOT shown to students
6. ✅ Client never computes slot/timezone logic
7. ✅ Actions driven by server `actions` field
8. ✅ No client timezone formatting (uses ISO strings or server display fields)
9. ✅ Single source of truth for fixtures (contracts/fixtures/)

## Production Build with Fixtures

Fixture mode works in both dev and production:

```bash
# Build with fixtures support
pnpm build

# Preview production build with fixtures
VITE_USE_FIXTURES=1 pnpm preview

# Or serve dist/ with any static server
```

The build automatically copies `contracts/fixtures/` to `dist/contracts/fixtures/` so fixture mode works identically in production.

## Wave 2 Integration Notes

**Known discrepancies accepted as Wave 2 work:**
- Contract uses `alreadyAccepted` field; UI uses `redirectTo` presence
- Teacher/student IDs in fixtures may not match actual DB IDs
- Fixture uses `accessToken` in response; real backend may use session cookies
- POST booking responses return wrapped `{ bookingId, booking }` per contract

**When integrating with real backend:**
1. Remove `VITE_USE_FIXTURES=1` flag
2. Set `VITE_API_BASE=<backend-url>`
3. Verify session/auth cookie handling works
4. Test all error codes and retry logic
5. Confirm timezone/locale handling matches fixtures
