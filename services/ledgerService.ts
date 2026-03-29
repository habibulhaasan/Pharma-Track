// services/ledgerService.ts
import "server-only";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

// Activity log stored as: activityLog/{YYYY-MM-DD}/{autoId}
// This keeps data organized by date and makes daily queries cheap (one collection read)
export async function logActivity({
  userId,
  action,
  productId,
  beforeQty,
  afterQty,
  details,
  ip,
  entryDate,
}: {
  userId: string;
  action: string;
  productId?: string;
  beforeQty?: number;
  afterQty?: number;
  details?: Record<string, unknown>;
  ip?: string;
  entryDate?: string; // YYYY-MM-DD — uses this date as the collection key if provided
}) {
  try {
    const db = getAdminDb();

    // Use entryDate if provided (for backdated entries), otherwise today
    const dateKey = entryDate ?? new Date().toISOString().split("T")[0];

    await db
      .collection("activityLog")
      .doc(dateKey)
      .collection("entries")
      .add({
        userId,
        action,
        ...(productId && { productId }),
        ...(beforeQty !== undefined && { beforeQty }),
        ...(afterQty !== undefined && { afterQty }),
        ...(details && { details }),
        ...(ip && { ip }),
        date: dateKey,
        timestamp: FieldValue.serverTimestamp(),
      });
  } catch (error) {
    // Non-critical — don't let logging failure break main operation
    console.error("Failed to log activity:", error);
  }
}

export async function getMainLedger(productId: string, limit = 50) {
  const db = getAdminDb();
  const snap = await db
    .collection("mainStock")
    .doc(productId)
    .collection("mainLedger")
    .orderBy("timestamp", "desc")
    .limit(limit)
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getPharmacyLedger(productId: string, limit = 50) {
  const db = getAdminDb();
  const snap = await db
    .collection("pharmacyStock")
    .doc(productId)
    .collection("pharmacyLedger")
    .orderBy("timestamp", "desc")
    .limit(limit)
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}