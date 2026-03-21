// Lambda entry point for pt-reviews: /reviews/* and /tutors/{uid}/reviews routes.

import { createRouter } from "../../shared/router.js";
import { submitRating } from "./submit-rating.js";
import { adminDeleteReview } from "./admin-delete-review.js";
import { flagReview } from "./flag-review.js";
import { getTutorReviews } from "./get-tutor-reviews.js";
import { getSchoolReviews } from "./get-school-reviews.js";

export const handler = createRouter({
  "POST /reviews/submit":           submitRating,
  "POST /reviews/admin-delete":     adminDeleteReview,
  "POST /reviews/{reviewId}/flag":  flagReview,
  "GET /tutors/{uid}/reviews":      getTutorReviews,
  "GET /reviews/school/{domain}":   getSchoolReviews,
});
