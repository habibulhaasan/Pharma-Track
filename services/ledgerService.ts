// services/ledgerService.ts
import "server-only";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";

// logActivity kept for backward compatibility — activity log removed,
// all transaction history now stored in transactions/{date}/{type}/
export async function logActivity(_params: {
  userId: string;
  action: string;
  productId?: string;
  beforeQty?: number;
  afterQty?: number;
  details?: Record<string, unknown>;
  ip?: string;
  entryDate?: string;
}) {
  // No-op — activity logging replaced by transactions collection
  // Remove callers gradually to clean up
}

export async function getMainLedgerByMonth(
  productId: string,
  year: number,
  month: number,
  limit = 200
) {
  const db = getAdminDb();
  const startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59));

  const snap = await db
    .collection("mainStock")
    .doc(productId)
    .collection("mainLedger")
    .where("timestamp", ">=", Timestamp.fromDate(startDate))
    .where("timestamp", "<=", Timestamp.fromDate(endDate))
    .orderBy("timestamp", "asc")
    .limit(limit)
    .get();

  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getPharmacyLedgerByMonth(
  productId: string,
  year: number,
  month: number,
  limit = 200
) {
  const db = getAdminDb();
  const startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59));

  const snap = await db
    .collection("pharmacyStock")
    .doc(productId)
    .collection("pharmacyLedger")
    .where("timestamp", ">=", Timestamp.fromDate(startDate))
    .where("timestamp", "<=", Timestamp.fromDate(endDate))
    .orderBy("timestamp", "asc")
    .limit(limit)
    .get();

  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getOpeningBalance(
  productId: string,
  ledgerType: "main" | "pharmacy",
  year: number,
  month: number
): Promise<number> {
  const db = getAdminDb();
  const collName = ledgerType === "main" ? "mainStock" : "pharmacyStock";
  const subColl = ledgerType === "main" ? "mainLedger" : "pharmacyLedger";
  const startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));

  const snap = await db
    .collection(collName)
    .doc(productId)
    .collection(subColl)
    .where("timestamp", "<", Timestamp.fromDate(startDate))
    .get();

  let balance = 0;
  snap.docs.forEach((d) => {
    const data = d.data();
    if (data.type === "IN") balance += data.quantity ?? 0;
    else if (data.type === "OUT") balance -= data.quantity ?? 0;
    else if (data.type === "ADJUSTMENT") balance += data.adjustmentDelta ?? 0;
  });

  return balance;
}