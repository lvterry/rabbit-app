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
- POST requests return appropriate mock responses with proper envelope structure
- Fixtures include full `{ok, data, meta}` envelope (no double wrapping)
- Vite middleware serves contracts directly (zero duplication)

### Fixture Path Mapping

| API Path | Fixture File |
|----------|--------------|
| `GET /v1/invites/:token` | `contracts/fixtures/invites/pending.json` |
| `GET /v1/me/student-home` | `contracts/fixtures/students/student-home-anonymous.json` |
| `GET /v1/me/student-bookings` | Synthetic response from booking fixtures |
| `GET /v1/bookings/:id` | `contracts/fixtures/bookings/upcoming-student.json` |
| `GET /v1/teachers/:tid/bookable-days` | `contracts/fixtures/slots/bookable-days.json` |
| `GET /v1/teachers/:tid/slots` | `contracts/fixtures/slots/slots.json` |
| `POST /v1/invites/:token/accept` | Synthetic with `{accessToken, redirectTo}` |
| `POST /v1/bookings` | Synthetic booking creation response |

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
