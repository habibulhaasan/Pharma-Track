// services/ledgerService.ts
import "server-only";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";

export async function logActivity({
  userId,
  action,
  productId,
  beforeQty,
  afterQty,
  details,
  ip,
}: {
  userId: string;
  action: string;
  productId?: string;
  beforeQty?: number;
  afterQty?: number;
  details?: Record<string, unknown>;
  ip?: string;
}) {
  try {
    const db = getAdminDb();
    await db.collection("activityLog").add({
      userId,
      action,
      ...(productId && { productId }),
      ...(beforeQty !== undefined && { beforeQty }),
      ...(afterQty !== undefined && { afterQty }),
      ...(details && { details }),
      ...(ip && { ip }),
      timestamp: FieldValue.serverTimestamp(),
    });
  } catch (error) {
    // Non-critical — don't let logging failure break main operation
    console.error("Failed to log activity:", error);
  }
}

export async function getMainLedger(
  productId: string,
  limit = 50
) {
  const db = getAdminDb();
  const snap = await db
    .collection("mainStock")
    .doc(productId)
    .collection("mainLedger")
    .orderBy("timestamp", "desc")
    .limit(limit)
    .get();

  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

export async function getPharmacyLedger(
  productId: string,
  limit = 50
) {
  const db = getAdminDb();
  const snap = await db
    .collection("pharmacyStock")
    .doc(productId)
    .collection("pharmacyLedger")
    .orderBy("timestamp", "desc")
    .limit(limit)
    .get();

  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

export async function getRecentActivity(limit = 100) {
  const db = getAdminDb();
  const snap = await db
    .collection("activityLog")
    .orderBy("timestamp", "desc")
    .limit(limit)
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
