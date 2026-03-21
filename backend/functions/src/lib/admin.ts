// functions/src/lib/admin.ts
// Singleton Firebase Admin initialization

import * as admin from "firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

if (!admin.apps.length) {
  admin.initializeApp();
}

export const db      = admin.firestore();
export const auth    = admin.auth();
export const storage = admin.storage();

export { FieldValue, Timestamp };

// Cognito env vars (set from Terraform outputs)
export const COGNITO_USER_POOL_ID = process.env.COGNITO_USER_POOL_ID ?? "";
export const COGNITO_APP_CLIENT_ID = process.env.COGNITO_APP_CLIENT_ID ?? "";
