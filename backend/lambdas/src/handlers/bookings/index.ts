// Lambda entry point for pt-bookings: /bookings/*, /sessions/*, /booking-requests/* routes.

import { createRouter } from "../../shared/router.js";
import { bookSession } from "./book-session.js";
import { requestBooking } from "./request-booking.js";
import { respondToBooking } from "./respond-to-booking.js";
import { cancelBookingRequest } from "./cancel-booking-request.js";
import { cancelSession } from "./cancel-session.js";
import { getMySessions } from "./get-my-sessions.js";
import { getMyBookingRequests } from "./get-my-booking-requests.js";
import { getSession } from "./get-session.js";

export const handler = createRouter({
  "POST /bookings/book-session":    bookSession,
  "POST /bookings/request":         requestBooking,
  "POST /bookings/respond":         respondToBooking,
  "POST /bookings/cancel-request":  cancelBookingRequest,
  "POST /sessions/cancel":          cancelSession,
  "GET /sessions/mine":             getMySessions,
  "GET /sessions/{sessionId}":      getSession,
  "GET /booking-requests/mine":     getMyBookingRequests,
});
