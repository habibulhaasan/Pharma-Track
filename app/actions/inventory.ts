"use server";
// app/actions/inventory.ts
import { getAdminDb } from "@/lib/firebaseAdmin";
import { requireAuth } from "@/lib/auth";
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import {
  getActiveDates,
  getTransactionsByDate,
  changeTransactionDate,
  type TxType,
} from "@/services/transactionService";

// ─── Get active dates from _meta (1 read) ────────────────────────────────
export async function getActiveDatesAction() {
  await requireAuth();
  try {
    return { success: true, data: await getActiveDates() };
  } catch {
    return { success: true, data: { allDates: [], stockInDates: [], transferDates: [], dispenseDates: [] } };
  }
}

// ─── Get all transactions for a specific date ─────────────────────────────
export async function getDayInventoryAction(date: string) {
  await requireAuth();
  try {
    const [stockIn, transfer, dispense] = await Promise.all([
      getTransactionsByDate(date, "stockIn"),
      getTransactionsByDate(date, "transfer"),
      getTransactionsByDate(date, "dispense"),
    ]);

    const all = [
      ...stockIn.map((e) => ({ ...e, txType: "stockIn" as TxType })),
      ...transfer.map((e) => ({ ...e, txType: "transfer" as TxType })),
      ...dispense.map((e) => ({ ...e, txType: "dispense" as TxType })),
    ].sort((a, b) => {
      const ta = (a.timestamp as any)?.toDate?.()?.getTime() ?? 0;
      const tb = (b.timestamp as any)?.toDate?.()?.getTime() ?? 0;
      return ta - tb;
    });

    const serialized = all.map((e) => ({
      ...e,
      timestamp: (e.timestamp as any)?.toDate?.()?.toISOString() ?? null,
      savedAt: (e as any).savedAt?.toDate?.()?.toISOString() ?? null,
    }));

    return { success: true, data: serialized };
  } catch (err) {
    console.error("getDayInventoryAction:", err);
    return { success: false, error: "Failed to load inventory" };
  }
}

// ─── Delete transaction + hard delete ledger entry + reverse stock ─────────
export async function deleteInventoryEntryAction({
  dateKey,
  txType,
  txId,
  reason,
}: {
  dateKey: string;
  txType: TxType;
  txId: string;
  reason: string;
}) {
  const user = await requireAuth();
  if (user.role !== "admin") return { success: false, error: "Admin only" };
  if (!reason || reason.trim().length < 5) return { success: false, error: "Reason must be at least 5 characters" };

  const db = getAdminDb();

  // Read tx doc first
  const txRef = db.collection("transactions").doc(dateKey).collection(txType).doc(txId);
  const txDoc = await txRef.get();
  if (!txDoc.exists) return { success: false, error: "Entry not found" };

  const txData = txDoc.data()!;
  const { productId, quantity, ledgerCollection, ledgerSubCollection, ledgerId } = txData;

  await db.runTransaction(async (tx) => {
    const stockRef = db.collection(ledgerCollection as string).doc(productId);
    const ledgerRef = db.collection(ledgerCollection as string)
      .doc(productId).collection(ledgerSubCollection as string).doc(ledgerId);

    const stockSnap = await tx.get(stockRef);
    const currentQty = stockSnap.data()?.quantity ?? 0;

    let newQty: number;
    if (txType === "stockIn") {
      newQty = Math.max(0, currentQty - quantity); // reverse: remove what was added
    } else if (txType === "transfer") {
      newQty = currentQty + quantity; // reverse: add back to main
    } else {
      newQty = currentQty + quantity; // reverse: add back to pharmacy
    }

    tx.update(stockRef, { quantity: newQty, updatedAt: FieldValue.serverTimestamp() });
    tx.delete(ledgerRef);
    tx.delete(txRef);

    // For transfer also reverse pharmacy stock
    if (txType === "transfer") {
      const pharmRef = db.collection("pharmacyStock").doc(productId);
      const pharmSnap = await tx.get(pharmRef);
      const pharmQty = pharmSnap.data()?.quantity ?? 0;
      tx.update(pharmRef, { quantity: Math.max(0, pharmQty - quantity), updatedAt: FieldValue.serverTimestamp() });
    }
  });

  return { success: true };
}

// ─── Edit quantity — updates both tx doc, ledger doc, and stock ────────────
export async function editInventoryEntryAction({
  dateKey,
  txType,
  txId,
  newQuantity,
  reason,
}: {
  dateKey: string;
  txType: TxType;
  txId: string;
  newQuantity: number;
  reason: string;
}) {
  const user = await requireAuth();
  if (user.role !== "admin") return { success: false, error: "Admin only" };
  if (!reason || reason.trim().length < 5) return { success: false, error: "Reason too short" };

  const db = getAdminDb();
  const txRef = db.collection("transactions").doc(dateKey).collection(txType).doc(txId);
  const txDoc = await txRef.get();
  if (!txDoc.exists) return { success: false, error: "Entry not found" };

  const txData = txDoc.data()!;
  const { productId, quantity: oldQuantity, ledgerCollection, ledgerSubCollection, ledgerId } = txData;

  await db.runTransaction(async (tx) => {
    const stockRef = db.collection(ledgerCollection as string).doc(productId);
    const ledgerRef = db.collection(ledgerCollection as string)
      .doc(productId).collection(ledgerSubCollection as string).doc(ledgerId);

    const stockSnap = await tx.get(stockRef);
    const currentQty = stockSnap.data()?.quantity ?? 0;

    let newQty: number;
    if (txType === "stockIn") {
      newQty = currentQty - oldQuantity + newQuantity;
    } else if (txType === "transfer") {
      newQty = currentQty + oldQuantity - newQuantity;
      const pharmRef = db.collection("pharmacyStock").doc(productId);
      const pharmSnap = await tx.get(pharmRef);
      const pharmQty = pharmSnap.data()?.quantity ?? 0;
      tx.update(pharmRef, { quantity: Math.max(0, pharmQty - oldQuantity + newQuantity), updatedAt: FieldValue.serverTimestamp() });
    } else {
      newQty = currentQty + oldQuantity - newQuantity;
    }

    tx.update(stockRef, { quantity: Math.max(0, newQty), updatedAt: FieldValue.serverTimestamp() });
    tx.update(ledgerRef, { quantity: newQuantity, editedBy: user.id, editedAt: Timestamp.now(), editReason: reason, originalQuantity: oldQuantity });
    tx.update(txRef, { quantity: newQuantity, editedBy: user.id, editedAt: Timestamp.now(), editReason: reason, originalQuantity: oldQuantity });
  });

  return { success: true };
}

// ─── Change date ──────────────────────────────────────────────────────────
export async function changeDateInventoryEntryAction({
  dateKey,
  txType,
  txId,
  newDate,
}: {
  dateKey: string;
  txType: TxType;
  txId: string;
  newDate: string;
}) {
  const user = await requireAuth();
  if (user.role !== "admin") return { success: false, error: "Admin only" };
  const ok = await changeTransactionDate(dateKey, txType, txId, newDate, user.id);
  if (!ok) return { success: false, error: "Entry not found" };
  return { success: true };
}

// ─── Bulk change date ─────────────────────────────────────────────────────
export async function bulkChangeDateAction({
  entries,
  newDate,
}: {
  entries: { dateKey: string; txType: TxType; txId: string }[];
  newDate: string;
}) {
  const user = await requireAuth();
  if (user.role !== "admin") return { success: false, error: "Admin only" };

  let succeeded = 0;
  const failed: string[] = [];
  for (const entry of entries) {
    try {
      await changeTransactionDate(entry.dateKey, entry.txType, entry.txId, newDate, user.id);
      succeeded++;
    } catch {
      failed.push(entry.txId);
    }
  }
  return { success: true, data: { succeeded, failed } };
}