"use server";
// app/actions/inventory.ts
// Full CRUD — every operation updates ALL linked documents atomically:
//   transactions/{date}/{type}/{id}
//   mainLedger or pharmacyLedger
//   mainStock or pharmacyStock quantities
// Transfer operations update BOTH ledgers and BOTH stock documents.
import { getAdminDb } from "@/lib/firebaseAdmin";
import { requireAuth } from "@/lib/auth";
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import {
  getActiveDates,
  getTransactionsByDate,
  updateActiveDates,
  type TxType,
} from "@/services/transactionService";
import { toTimestamp } from "@/services/stockService";

// ─── Get active dates (1 read from _meta) ────────────────────────────────
export async function getActiveDatesAction() {
  await requireAuth();
  try {
    return { success: true, data: await getActiveDates() };
  } catch {
    return { success: true, data: { allDates: [], stockInDates: [], transferDates: [], dispenseDates: [] } };
  }
}

// ─── Get all transactions for a date ─────────────────────────────────────
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

// ─── DELETE — hard delete + reverse ALL linked documents ─────────────────
export async function deleteInventoryEntryAction({
  dateKey, txType, txId, reason,
}: {
  dateKey: string; txType: TxType; txId: string; reason: string;
}) {
  const user = await requireAuth();
  if (user.role !== "admin") return { success: false, error: "Admin only" };
  if (!reason || reason.trim().length < 5) return { success: false, error: "Reason must be at least 5 characters" };

  const db = getAdminDb();

  // Step 1: Read transaction doc to get all linked IDs
  const txRef = db.collection("transactions").doc(dateKey).collection(txType).doc(txId);
  const txDoc = await txRef.get();
  if (!txDoc.exists) return { success: false, error: "Entry not found" };

  const txData = txDoc.data()!;
  const { productId, quantity, ledgerCollection, ledgerSubCollection, ledgerId, pharmLedgerId } = txData;

  try {
    await db.runTransaction(async (tx) => {
      // Read all stock docs we need to update
      const mainStockRef = db.collection("mainStock").doc(productId);
      const pharmStockRef = db.collection("pharmacyStock").doc(productId);

      if (txType === "stockIn") {
        // ── StockIn: reverse main stock only
        const mainSnap = await tx.get(mainStockRef);
        const currentQty = mainSnap.data()?.quantity ?? 0;
        const newQty = Math.max(0, currentQty - quantity);

        tx.update(mainStockRef, { quantity: newQty, updatedAt: FieldValue.serverTimestamp() });
        tx.delete(db.collection("mainStock").doc(productId).collection("mainLedger").doc(ledgerId));
        tx.delete(txRef);

      } else if (txType === "transfer") {
        // ── Transfer: reverse BOTH main and pharmacy stock
        const [mainSnap, pharmSnap] = await Promise.all([
          tx.get(mainStockRef), tx.get(pharmStockRef),
        ]);
        const mainQty = mainSnap.data()?.quantity ?? 0;
        const pharmQty = pharmSnap.data()?.quantity ?? 0;

        // Reverse: add back to main, subtract from pharmacy
        tx.update(mainStockRef, { quantity: mainQty + quantity, updatedAt: FieldValue.serverTimestamp() });
        tx.update(pharmStockRef, { quantity: Math.max(0, pharmQty - quantity), updatedAt: FieldValue.serverTimestamp() });

        // Delete main ledger entry
        tx.delete(db.collection("mainStock").doc(productId).collection("mainLedger").doc(ledgerId));

        // Delete pharmacy ledger entry if we have its ID
        if (pharmLedgerId) {
          tx.delete(db.collection("pharmacyStock").doc(productId).collection("pharmacyLedger").doc(pharmLedgerId));
        }
        tx.delete(txRef);

      } else if (txType === "dispense") {
        // ── Dispense: add back to pharmacy stock
        const pharmSnap = await tx.get(pharmStockRef);
        const pharmQty = pharmSnap.data()?.quantity ?? 0;

        tx.update(pharmStockRef, { quantity: pharmQty + quantity, updatedAt: FieldValue.serverTimestamp() });
        tx.delete(db.collection("pharmacyStock").doc(productId).collection("pharmacyLedger").doc(ledgerId));
        tx.delete(txRef);
      }
    });

    return { success: true };
  } catch (err: any) {
    console.error("deleteInventoryEntryAction:", err);
    return { success: false, error: err.message ?? "Delete failed" };
  }
}

// ─── EDIT quantity — updates ALL linked documents atomically ──────────────
export async function editInventoryEntryAction({
  dateKey, txType, txId, newQuantity, reason,
}: {
  dateKey: string; txType: TxType; txId: string; newQuantity: number; reason: string;
}) {
  const user = await requireAuth();
  if (user.role !== "admin") return { success: false, error: "Admin only" };
  if (!reason || reason.trim().length < 5) return { success: false, error: "Reason too short" };
  if (newQuantity < 0) return { success: false, error: "Quantity cannot be negative" };

  const db = getAdminDb();

  const txRef = db.collection("transactions").doc(dateKey).collection(txType).doc(txId);
  const txDoc = await txRef.get();
  if (!txDoc.exists) return { success: false, error: "Entry not found" };

  const txData = txDoc.data()!;
  const { productId, quantity: oldQty, ledgerCollection, ledgerSubCollection, ledgerId, pharmLedgerId } = txData;
  const diff = newQuantity - oldQty; // positive = increased, negative = decreased

  if (diff === 0) return { success: true }; // no change needed

  const editMeta = {
    quantity: newQuantity,
    editedBy: user.id,
    editedAt: Timestamp.now(),
    editReason: reason,
    originalQuantity: oldQty,
  };

  try {
    await db.runTransaction(async (tx) => {
      const mainStockRef = db.collection("mainStock").doc(productId);
      const pharmStockRef = db.collection("pharmacyStock").doc(productId);

      if (txType === "stockIn") {
        // ── StockIn edit: main stock goes up/down by diff
        const mainSnap = await tx.get(mainStockRef);
        const mainQty = mainSnap.data()?.quantity ?? 0;

        tx.update(mainStockRef, { quantity: mainQty + diff, updatedAt: FieldValue.serverTimestamp() });
        tx.update(
          db.collection("mainStock").doc(productId).collection("mainLedger").doc(ledgerId),
          editMeta
        );
        tx.update(txRef, editMeta);

      } else if (txType === "transfer") {
        // ── Transfer edit: main loses more/less, pharmacy gains more/less
        const [mainSnap, pharmSnap] = await Promise.all([
          tx.get(mainStockRef), tx.get(pharmStockRef),
        ]);
        const mainQty = mainSnap.data()?.quantity ?? 0;
        const pharmQty = pharmSnap.data()?.quantity ?? 0;

        // If qty increased (10→12): main loses 2 more, pharmacy gains 2 more
        // If qty decreased (10→8): main gets 2 back, pharmacy loses 2
        const newMainQty = Math.max(0, mainQty - diff);
        const newPharmQty = Math.max(0, pharmQty + diff);

        tx.update(mainStockRef, { quantity: newMainQty, updatedAt: FieldValue.serverTimestamp() });
        tx.update(pharmStockRef, { quantity: newPharmQty, updatedAt: FieldValue.serverTimestamp() });

        // Update main ledger
        tx.update(
          db.collection("mainStock").doc(productId).collection("mainLedger").doc(ledgerId),
          editMeta
        );

        // Update pharmacy ledger if we have its ID
        if (pharmLedgerId) {
          tx.update(
            db.collection("pharmacyStock").doc(productId).collection("pharmacyLedger").doc(pharmLedgerId),
            editMeta
          );
        }
        tx.update(txRef, editMeta);

      } else if (txType === "dispense") {
        // ── Dispense edit: pharmacy goes up/down by diff (opposite to dispense direction)
        const pharmSnap = await tx.get(pharmStockRef);
        const pharmQty = pharmSnap.data()?.quantity ?? 0;

        // If dispensed qty increased (10→12): pharmacy loses 2 more → -diff
        // If dispensed qty decreased (10→8): pharmacy gets 2 back → -diff
        tx.update(pharmStockRef, { quantity: Math.max(0, pharmQty - diff), updatedAt: FieldValue.serverTimestamp() });
        tx.update(
          db.collection("pharmacyStock").doc(productId).collection("pharmacyLedger").doc(ledgerId),
          editMeta
        );
        tx.update(txRef, editMeta);
      }
    });

    return { success: true };
  } catch (err: any) {
    console.error("editInventoryEntryAction:", err);
    return { success: false, error: err.message ?? "Edit failed" };
  }
}

// ─── CHANGE DATE — moves transaction + updates ALL ledger timestamps ──────
export async function changeDateInventoryEntryAction({
  dateKey, txType, txId, newDate,
}: {
  dateKey: string; txType: TxType; txId: string; newDate: string;
}) {
  const user = await requireAuth();
  if (user.role !== "admin") return { success: false, error: "Admin only" };
  if (dateKey === newDate) return { success: true }; // no change

  const db = getAdminDb();

  // Read the original transaction
  const oldTxRef = db.collection("transactions").doc(dateKey).collection(txType).doc(txId);
  const txDoc = await oldTxRef.get();
  if (!txDoc.exists) return { success: false, error: "Entry not found" };

  const txData = txDoc.data()!;
  const { productId, ledgerId, pharmLedgerId } = txData;
  const newTs = toTimestamp(newDate);

  try {
    // Move transaction doc to new date (Firestore can't "move" — delete + create)
    const newTxRef = db.collection("transactions").doc(newDate).collection(txType).doc(txId);

    await db.runTransaction(async (tx) => {
      // Write to new date location with updated timestamp
      tx.set(newTxRef, {
        ...txData,
        entryDate: newDate,
        timestamp: newTs,
        dateChangedBy: user.id,
        dateChangedAt: Timestamp.now(),
        originalDate: dateKey,
      });

      // Delete from old date
      tx.delete(oldTxRef);

      // Update main ledger timestamp
      if (ledgerId) {
        const mainLedgerRef = db.collection("mainStock").doc(productId)
          .collection("mainLedger").doc(ledgerId);
        tx.update(mainLedgerRef, {
          timestamp: newTs,
          dateChangedBy: user.id,
          dateChangedAt: Timestamp.now(),
          originalDate: dateKey,
        });
      }

      // Update pharmacy ledger timestamp (for transfers and dispenses)
      if (pharmLedgerId) {
        const pharmLedgerRef = db.collection("pharmacyStock").doc(productId)
          .collection("pharmacyLedger").doc(pharmLedgerId);
        tx.update(pharmLedgerRef, {
          timestamp: newTs,
          dateChangedBy: user.id,
          dateChangedAt: Timestamp.now(),
          originalDate: dateKey,
        });
      } else if (txType === "dispense" && txData.ledgerSubCollection === "pharmacyLedger") {
        // Dispense uses ledgerId for pharmacy ledger (not pharmLedgerId)
        const pharmLedgerRef = db.collection("pharmacyStock").doc(productId)
          .collection("pharmacyLedger").doc(ledgerId);
        tx.update(pharmLedgerRef, {
          timestamp: newTs,
          dateChangedBy: user.id,
          dateChangedAt: Timestamp.now(),
          originalDate: dateKey,
        });
      }

      // Update new date summary doc
      tx.set(db.collection("transactions").doc(newDate), {
        [`has${txType.charAt(0).toUpperCase() + txType.slice(1)}`]: true,
        lastUpdated: FieldValue.serverTimestamp(),
      }, { merge: true });
    });

    // Update _meta/activeDates with new date (non-blocking)
    await updateActiveDates(newDate, txType).catch(console.error);

    return { success: true };
  } catch (err: any) {
    console.error("changeDateInventoryEntryAction:", err);
    return { success: false, error: err.message ?? "Date change failed" };
  }
}

// ─── BULK CHANGE DATE ─────────────────────────────────────────────────────
export async function bulkChangeDateAction({
  entries, newDate,
}: {
  entries: { dateKey: string; txType: TxType; txId: string }[];
  newDate: string;
}) {
  const user = await requireAuth();
  if (user.role !== "admin") return { success: false, error: "Admin only" };

  let succeeded = 0;
  const failed: string[] = [];

  for (const entry of entries) {
    const result = await changeDateInventoryEntryAction({
      dateKey: entry.dateKey,
      txType: entry.txType,
      txId: entry.txId,
      newDate,
    });
    if (result.success) succeeded++;
    else failed.push(entry.txId);
  }

  return { success: true, data: { succeeded, failed } };
}