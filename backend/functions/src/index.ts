// functions/src/index.ts
// Central export of all Cloud Functions

export { onUserCreate }         from "./auth/onUserCreate";
export { bookSession }          from "./bookings/bookSession";
export { cancelSession }        from "./sessions/cancelSession";
export { submitRating }         from "./reviews/submitRating";
export { adminDeleteReview }    from "./reviews/adminDeleteReview";
export { adminSuspendUser }     from "./auth/adminSuspendUser";
export { adminUnsuspendUser }   from "./auth/adminSuspendUser";
export { sendSessionReminders } from "./notifications/sendSessionReminders";
export { triggerRatingPrompts } from "./notifications/triggerRatingPrompts";
export { updateSchoolStats }    from "./aggregations/updateSchoolStats";
export { purgeOldSessions }     from "./aggregations/purgeOldSessions";
export { registerSchool }       from "./schools/registerSchool";
export { addSchool }            from "./schools/addSchool";
export { approveSchool }        from "./schools/approveSchool";
export { rejectSchool }         from "./schools/rejectSchool";
export { removeSchool }         from "./schools/removeSchool";
export { promoteSuperAdmin }    from "./auth/promoteSuperAdmin";
export { updateTutorProfile }   from "./auth/updateTutorProfile";
