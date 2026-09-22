import Router from 'preact-router'
import { InviteRoute } from './routes/InviteRoute'
import { HomeRoute } from './routes/HomeRoute'
import { BookRoute } from './routes/BookRoute'
import { BookingsRoute } from './routes/BookingsRoute'
import { BookingDetailRoute } from './routes/BookingDetailRoute'

export function App() {
  return (
    <Router>
      <InviteRoute path="/i/:token" />
      <HomeRoute path="/" />
      <BookRoute path="/book" />
      <BookingsRoute path="/bookings" />
      <BookingDetailRoute path="/bookings/:id" />
    </Router>
  )
}
