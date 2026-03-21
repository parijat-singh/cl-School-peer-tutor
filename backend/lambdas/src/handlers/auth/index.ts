// Lambda entry point for pt-auth: /auth/* and /users/* routes.

import { createRouter } from "../../shared/router.js";
import { initializeUser } from "./initialize-user.js";
import { sendVerificationOtp } from "./send-verification-otp.js";
import { verifyEmailOtp } from "./verify-email-otp.js";
import { updateTutorProfile } from "./update-tutor-profile.js";
import { promoteSuperAdmin } from "./promote-superadmin.js";
import { adminSuspendUser, adminUnsuspendUser } from "./admin-suspend-user.js";
import { adminSetClaims } from "./admin-set-claims.js";
import { getMe } from "./get-me.js";
import { getUser } from "./get-user.js";
import { listSuperAdmins } from "./list-superadmins.js";

export const handler = createRouter({
  "POST /auth/initialize-user":      initializeUser,
  "POST /auth/send-verification-otp": sendVerificationOtp,
  "POST /auth/verify-email-otp":     verifyEmailOtp,
  "POST /auth/update-tutor-profile": updateTutorProfile,
  "POST /auth/promote-superadmin":   promoteSuperAdmin,
  "POST /auth/admin-suspend-user":   adminSuspendUser,
  "POST /auth/admin-unsuspend-user": adminUnsuspendUser,
  "POST /auth/admin-set-claims":     adminSetClaims,
  "GET /users/me":                   getMe,
  "GET /users/{uid}":                getUser,
  "GET /users/superadmins":          listSuperAdmins,
});
