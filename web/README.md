# Rabbit Web - Student H5

Student web application for Rabbit tutoring/coaching platform.

## Features

- **Fixture-first development**: Full UI can run without backend using `VITE_USE_FIXTURES=1`
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
VITE_USE_FIXTURES=1 pnpm dev

# Run with real API
VITE_API_BASE=http://localhost:8787 pnpm dev

# Type check
pnpm typecheck

# Build for production
pnpm build
```

## Routes

- `/i/:token` - Accept teacher invitation (S05)
- `/` - Student home page (S01)
- `/book` - Book a session (S02)
- `/bookings` - View bookings list (S03)
- `/bookings/:id` - Booking detail (S04)

## Architecture

- **Framework**: Preact with signals for state management
- **Router**: Preact Router (lightweight)
- **API Client**: Fixture-aware fetch wrapper
- **Styling**: CSS variables + vanilla CSS (no runtime CSS-in-JS)

## Key Constraints

Following `impl-guide.md` requirements:

1. ✅ Works in WeChat WebView
2. ✅ Zero app install required
3. ✅ No registration wall
4. ✅ ≤3 taps from book entry to confirm
5. ✅ Reserved slots NOT shown to students
6. ✅ Client never computes slot/timezone logic
7. ✅ Actions driven by server `actions` field
