// services/transactionService.ts
// Manages the new transactions/{YYYY-MM-DD}/{type}/{autoId} collection
// and _meta/activeDates summary document.
// This is READ by the Inventory Log page.
// mainLedger and pharmacyLedger are untouched — still used by Ledger page.
import "server-only";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

// ─── Types ────────────────────────────────────────────────────────────────
export type TxType = "stockIn" | "transfer" | "dispense";

export interface TxEntry {
  productId: string;
  brandName: string;
  genericName: string;
  unit: string;
  quantity: number;
  price?: number;
  batch?: string;
  supplier?: string;
  patientName?: string;
  prescriptionNo?: string;
  notes?: string;
  userId: string;
  entryDate: string;       // YYYY-MM-DD (the date the entry is FOR)
  timestamp: Timestamp;    // actual Firestore timestamp
  // For linking back to ledger doc for edit/delete
  ledgerCollection: "mainStock" | "pharmacyStock";
  ledgerSubCollection: "mainLedger" | "pharmacyLedger";
  ledgerId: string;        // the doc ID in the ledger subcollection
  deleted?: boolean;
}

// ─── Helper: date string from entryDate or now ─────────────────────────────
export function getDateKey(entryDate?: string | null): string {
  if (entryDate && /^\d{4}-\d{2}-\d{2}$/.test(entryDate)) return entryDate;
  return new Date().toISOString().split("T")[0];
}

// ─── Update _meta/activeDates summary (1 write, uses arrayUnion) ───────────
export async function updateActiveDates(
  dateKey: string,
  txType: TxType
) {
  const db = getAdminDb();
  const metaRef = db.collection("_meta").doc("activeDates");

  const typeField =
    txType === "stockIn" ? "stockInDates"
    : txType === "transfer" ? "transferDates"
    : "dispenseDates";

  await metaRef.set({
    allDates: FieldValue.arrayUnion(dateKey),
    [typeField]: FieldValue.arrayUnion(dateKey),
    lastUpdated: FieldValue.serverTimestamp(),
  }, { merge: true });
}

// ─── Save a transaction entry ──────────────────────────────────────────────
export async function saveTransaction(
  txType: TxType,
  entry: TxEntry
): Promise<string> {
  const db = getAdminDb();
  const dateKey = entry.entryDate;

  // Write to transactions/{date}/{type}/{autoId}
  const ref = await db
    .collection("transactions")
    .doc(dateKey)
    .collection(txType)
    .add({
      ...entry,
      savedAt: FieldValue.serverTimestamp(),
    });

  // Update date document summary
  await db.collection("transactions").doc(dateKey).set({
    [`has${txType.charAt(0).toUpperCase() + txType.slice(1)}`]: true,
    lastUpdated: FieldValue.serverTimestamp(),
  }, { merge: true });

  // Update _meta/activeDates
  await updateActiveDates(dateKey, txType);

  return ref.id;
}

// ─── Delete a transaction entry and its linked ledger entry ───────────────
export async function deleteTransaction(
  dateKey: string,
  txType: TxType,
  txId: string,
): Promise<{ ledgerCollection: string; ledgerSubCollection: string; ledgerId: string; quantity: number; entryType: string } | null> {
  const db = getAdminDb();
  const txRef = db
    .collection("transactions")
    .doc(dateKey)
    .collection(txType)
    .doc(txId);

  const txDoc = await txRef.get();
  if (!txDoc.exists) return null;

  const data = txDoc.data()!;

  // Hard delete from transactions collection
  await txRef.delete();

  return {
    ledgerCollection: data.ledgerCollection,
    ledgerSubCollection: data.ledgerSubCollection,
    ledgerId: data.ledgerId,
    quantity: data.quantity ?? 0,
    entryType: txType === "stockIn" ? "IN" : "OUT",
  };
}

// ─── Edit a transaction entry quantity ─────────────────────────────────────
export async function editTransaction(
  dateKey: string,
  txType: TxType,
  txId: string,
  newQuantity: number,
  reason: string,
  userId: string,
): Promise<{ ledgerCollection: string; ledgerSubCollection: string; ledgerId: string; oldQuantity: number; entryType: string } | null> {
  const db = getAdminDb();
  const txRef = db
    .collection("transactions")
    .doc(dateKey)
    .collection(txType)
    .doc(txId);

  const txDoc = await txRef.get();
  if (!txDoc.exists) return null;

  const data = txDoc.data()!;
  const oldQuantity = data.quantity ?? 0;

  await txRef.update({
    quantity: newQuantity,
    editedBy: userId,
    editedAt: FieldValue.serverTimestamp(),
    editReason: reason,
    originalQuantity: oldQuantity,
  });

  return {
    ledgerCollection: data.ledgerCollection,
    ledgerSubCollection: data.ledgerSubCollection,
    ledgerId: data.ledgerId,
    oldQuantity,
    entryType: txType === "stockIn" ? "IN" : "OUT",
  };
}

// ─── Change date of a transaction entry ───────────────────────────────────
export async function changeTransactionDate(
  oldDateKey: string,
  txType: TxType,
  txId: string,
  newDateKey: string,
  userId: string,
): Promise<boolean> {
  const db = getAdminDb();
  const oldRef = db.collection("transactions").doc(oldDateKey).collection(txType).doc(txId);
  const txDoc = await oldRef.get();
  if (!txDoc.exists) return false;

  const data = txDoc.data()!;
  const [y, m, d] = newDateKey.split("-").map(Number);
  const newTimestamp = Timestamp.fromDate(new Date(Date.UTC(y, m - 1, d, 6, 0, 0)));

  // Write to new date location
  const newRef = db.collection("transactions").doc(newDateKey).collection(txType).doc(txId);
  await newRef.set({
    ...data,
    entryDate: newDateKey,
    timestamp: newTimestamp,
    dateChangedBy: userId,
    dateChangedAt: FieldValue.serverTimestamp(),
    originalDate: oldDateKey,
  });

  // Delete from old date
  await oldRef.delete();

  // Update new date summary doc
  await db.collection("transactions").doc(newDateKey).set({
    [`has${txType.charAt(0).toUpperCase() + txType.slice(1)}`]: true,
    lastUpdated: FieldValue.serverTimestamp(),
  }, { merge: true });

  // Update _meta
  await updateActiveDates(newDateKey, txType);

  // Also update ledger timestamp
  const ledgerRef = db
    .collection(data.ledgerCollection)
    .doc(data.productId)
    .collection(data.ledgerSubCollection)
    .doc(data.ledgerId);

  await ledgerRef.update({
    timestamp: newTimestamp,
    dateChangedBy: userId,
    dateChangedAt: FieldValue.serverTimestamp(),
  }).catch(() => {}); // non-critical if ledger doc missing

  return true;
}

// ─── Read active dates from _meta (1 read) ────────────────────────────────
export async function getActiveDates(): Promise<{
  allDates: string[];
  stockInDates: string[];
  transferDates: string[];
  dispenseDates: string[];
}> {
  const db = getAdminDb();
  const doc = await db.collection("_meta").doc("activeDates").get();
  if (!doc.exists) return { allDates: [], stockInDates: [], transferDates: [], dispenseDates: [] };
  const data = doc.data()!;
  const sort = (arr: string[]) => (arr ?? []).sort().reverse();
  return {
    allDates: sort(data.allDates ?? []),
    stockInDates: sort(data.stockInDates ?? []),
    transferDates: sort(data.transferDates ?? []),
    dispenseDates: sort(data.dispenseDates ?? []),
  };
}

// ─── Read entries for a specific date + type ──────────────────────────────
export async function getTransactionsByDate(
  dateKey: string,
  txType: TxType
): Promise<(TxEntry & { id: string })[]> {
  const db = getAdminDb();
  const snap = await db
    .collection("transactions")
    .doc(dateKey)
    .collection(txType)
    .orderBy("timestamp", "asc")
    .get();

  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as TxEntry) }))
    .filter((e) => !(e as any).deleted);
}