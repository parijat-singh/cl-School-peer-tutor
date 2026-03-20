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
