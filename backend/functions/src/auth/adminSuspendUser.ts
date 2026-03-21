// functions/src/auth/adminSuspendUser.ts
import * as functions from "firebase-functions/v2/https";
import { db, auth, FieldValue, Timestamp } from "../lib/admin";
import { addDays }    from "date-fns";
import { requireAuth } from "../lib/cognitoAuth";
import { cognitoDisableUser, cognitoEnableUser, cognitoUpdateAttributes } from "../lib/cognitoAdmin";

export const adminSuspendUser = functions.onCall(
  { region: "us-central1" },
  async (request) => {
    const caller = await requireAuth(request);
    const callerRole = caller.token.role;
    if (!["schooladmin", "superadmin"].includes(callerRole)) {
      throw new functions.HttpsError("permission-denied", "Admins only.");
    }

    const { targetUid, durationDays, reason } = request.data as {
      targetUid:    string;
      durationDays: number | null;
      reason:       string;
    };

    if (!targetUid || !reason) throw new functions.HttpsError("invalid-argument", "targetUid and reason required.");
    if (durationDays !== null && (durationDays < 1 || durationDays > 90)) {
      throw new functions.HttpsError("invalid-argument", "Duration must be 1-90 days or null (indefinite).");
    }

    const targetSnap = await db.collection("users").doc(targetUid).get();
    if (!targetSnap.exists) throw new functions.HttpsError("not-found", "User not found.");

    const target = targetSnap.data()!;
    // School admins can only act within their school; super admins have cross-school access
    if (callerRole === "schooladmin" && target.schoolDomain !== caller.token.schoolDomain) {
      throw new functions.HttpsError("permission-denied", "Cross-school action denied.");
    }

    const suspendedUntil = durationDays
      ? Timestamp.fromDate(addDays(new Date(), durationDays))
      : null;

    await db.runTransaction(async (txn) => {
      txn.update(db.collection("users").doc(targetUid), {
        status:        "suspended",
        suspendedUntil,
        updatedAt:     FieldValue.serverTimestamp(),
      });

      // Write audit log
      txn.set(db.collection("adminAuditLog").doc(), {
        adminUid:    caller.uid,
        action:      "suspend_user",
        targetId:    targetUid,
        reason,
        metadata:    { durationDays },
        schoolDomain: target.schoolDomain,
        timestamp:   FieldValue.serverTimestamp(),
      });
    });

    // Disable auth accounts (Firebase + Cognito)
    await auth.updateUser(targetUid, { disabled: true });
    try { await cognitoDisableUser(targetUid); } catch { /* Cognito user may not exist yet */ }
    try {
      await cognitoUpdateAttributes(targetUid, { "custom:status": "suspended" });
    } catch { /* ignore if Cognito user doesn't exist */ }

    // Cancel all upcoming sessions for this user
    const upcomingSessions = await db.collection("sessions")
      .where("status", "==", "upcoming")
      .where("schoolDomain", "==", target.schoolDomain)
      .get();

    const batch = db.batch();
    for (const s of upcomingSessions.docs) {
      const data = s.data();
      if (data.tutorId === targetUid || data.tuteeId === targetUid) {
        batch.update(s.ref, { status: "cancelled", cancelledBy: "admin", cancelledAt: FieldValue.serverTimestamp() });
        // Free the slot
        const slotRef = db.collection("users").doc(data.tutorId)
                          .collection("availability").doc(data.slotId);
        batch.update(slotRef, { booked: false, bookedBy: FieldValue.delete() });
      }
    }
    await batch.commit();

    return { success: true };
  }
);

export const adminUnsuspendUser = functions.onCall(
  { region: "us-central1" },
  async (request) => {
    const caller = await requireAuth(request);
    const callerRole = caller.token.role;
    if (!["schooladmin", "superadmin"].includes(callerRole)) {
      throw new functions.HttpsError("permission-denied", "Admins only.");
    }

    const { targetUid } = request.data as { targetUid: string };

    const targetSnap = await db.collection("users").doc(targetUid).get();
    if (!targetSnap.exists) throw new functions.HttpsError("not-found", "User not found.");

    const target = targetSnap.data()!;
    if (callerRole === "schooladmin" && target.schoolDomain !== caller.token.schoolDomain) {
      throw new functions.HttpsError("permission-denied", "Cross-school action denied.");
    }

    await db.runTransaction(async (txn) => {
      txn.update(db.collection("users").doc(targetUid), {
        status:        "active",
        suspendedUntil: null,
        updatedAt:     FieldValue.serverTimestamp(),
      });
      txn.set(db.collection("adminAuditLog").doc(), {
        adminUid:    caller.uid,
        action:      "unsuspend_user",
        targetId:    targetUid,
        schoolDomain: target.schoolDomain,
        timestamp:   FieldValue.serverTimestamp(),
      });
    });

    await auth.updateUser(targetUid, { disabled: false });
    try { await cognitoEnableUser(targetUid); } catch { /* Cognito user may not exist yet */ }
    try {
      await cognitoUpdateAttributes(targetUid, { "custom:status": "active" });
    } catch { /* ignore if Cognito user doesn't exist */ }
    return { success: true };
  }
);
