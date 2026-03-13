// functions/src/lib/admin.ts
// Singleton Firebase Admin initialization

import * as admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp();
}

export const db      = admin.firestore();
export const auth    = admin.auth();
export const storage = admin.storage();

export const FieldValue = admin.firestore.FieldValue;
export const Timestamp  = admin.firestore.Timestamp;
