// functions/src/index.ts
// Central export of all Cloud Functions

// SENTRY_DSN must be a single source: plain env at deploy time (see CD workflow writing
// backend/functions/.env). Do NOT also bind the same name via Secret Manager — Cloud Run
// rejects "Secret environment variable overlaps non secret env" for SENTRY_DSN.

// Initialise Sentry before any function code runs (at cold start).
import "./lib/sentry";

export { onUserCreate }         from "./auth/onUserCreate";
export { bookSession }          from "./bookings/bookSession";
export { requestBooking }       from "./bookings/requestBooking";
export { cancelBookingRequest } from "./bookings/cancelBookingRequest";
export { respondToBooking }     from "./bookings/respondToBooking";
export { cancelSession }        from "./sessions/cancelSession";
export { submitRating }         from "./reviews/submitRating";
export { adminDeleteReview }    from "./reviews/adminDeleteReview";
export { adminSuspendUser }     from "./auth/adminSuspendUser";
export { adminUnsuspendUser }   from "./auth/adminSuspendUser";
export { sendSessionReminders } from "./notifications/sendSessionReminders";
export { triggerRatingPrompts } from "./notifications/triggerRatingPrompts";
export { updateSchoolStats }    from "./aggregations/updateSchoolStats";
export { purgeOldSessions }          from "./aggregations/purgeOldSessions";
export { purgeExpiredRateLimits }   from "./aggregations/purgeExpiredRateLimits";
export { registerSchool }       from "./schools/registerSchool";
export { addSchool }            from "./schools/addSchool";
export { approveSchool }        from "./schools/approveSchool";
export { rejectSchool }         from "./schools/rejectSchool";
export { removeSchool }         from "./schools/removeSchool";
export { promoteSuperAdmin }      from "./auth/promoteSuperAdmin";
export { adminSetClaims }         from "./auth/adminSetClaims";
export { updateTutorProfile }     from "./auth/updateTutorProfile";
export { recommendTutors }        from "./recommendations/recommendTutors";
export { sendVerificationOtp }    from "./auth/sendVerificationOtp";
export { verifyEmailOtp }         from "./auth/verifyEmailOtp";
export { submitContactForm }      from "./contact/submitContactForm";
