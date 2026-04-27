// services/stockService.ts
// ALL mutations are atomic Firestore transactions.
// Transfer stores BOTH ledger IDs (ledgerId + pharmLedgerId) in the transaction doc
// so edit/delete/change-date can find and update all linked documents.
import "server-only";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { InsufficientStockError, NotFoundError } from "@/utils/errorHandler";
import type { StockAdjustmentInput } from "@/schemas/stock";
import { saveTransaction, getDateKey } from "./transactionService";

// ─── Helper: date string → Firestore Timestamp ────────────────────────────
export function toTimestamp(dateStr?: string | null): any {
  if (dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [y, m, d] = dateStr.split("-").map(Number);
    return Timestamp.fromDate(new Date(Date.UTC(y, m - 1, d, 6, 0, 0)));
  }
  return FieldValue.serverTimestamp();
}

// ─── Stock IN ─────────────────────────────────────────────────────────────
export async function addMainStockIn(input: {
  productId: string; quantity: number; batch: string;
  expiry?: string | null; price: number; supplier: string;
  reference?: string; entryDate?: string;
  brandName?: string; genericName?: string; unit?: string;
}, userId: string) {
  const db = getAdminDb();
  const stockRef = db.collection("mainStock").doc(input.productId);
  const ledgerRef = stockRef.collection("mainLedger").doc();
  const expiryTs = input.expiry ? Timestamp.fromDate(new Date(input.expiry)) : null;
  const entryTs = toTimestamp(input.entryDate);
  const dateKey = getDateKey(input.entryDate);
  let beforeQty = 0, afterQty = 0;

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(stockRef);
    if (!snap.exists) throw new NotFoundError("Product stock record");
    beforeQty = snap.data()!.quantity ?? 0;
    afterQty = beforeQty + input.quantity;
    tx.update(stockRef, { quantity: afterQty, updatedAt: FieldValue.serverTimestamp() });
    tx.set(ledgerRef, {
      type: "IN", quantity: input.quantity, batch: input.batch,
      expiry: expiryTs, price: input.price, supplier: input.supplier,
      reference: input.reference ?? "", timestamp: entryTs, userId,
    });
  });

  await saveTransaction("stockIn", {
    productId: input.productId, brandName: input.brandName ?? "",
    genericName: input.genericName ?? "", unit: input.unit ?? "",
    quantity: input.quantity, price: input.price,
    batch: input.batch, supplier: input.supplier,
    userId, entryDate: dateKey, timestamp: entryTs as Timestamp,
    ledgerCollection: "mainStock",
    ledgerSubCollection: "mainLedger",
    ledgerId: ledgerRef.id,
    // No pharmLedgerId for stockIn
  }).catch(console.error);

  return { beforeQty, afterQty };
}

export async function bulkAddMainStockIn(entries: Array<{
  productId: string; quantity: number; batch: string; expiry?: string | null;
  price: number; supplier: string; reference?: string; entryDate?: string;
  brandName?: string; genericName?: string; unit?: string;
}>, userId: string) {
  const results = await Promise.allSettled(entries.map((e) => addMainStockIn(e, userId)));
  const succeeded = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.map((r, i) => ({ index: i, result: r }))
    .filter((r) => r.result.status === "rejected")
    .map((r) => ({ index: r.index, error: (r.result as PromiseRejectedResult).reason?.message ?? "Unknown" }));
  return { succeeded, failed, total: entries.length };
}

// ─── Transfer: Main → Pharmacy ────────────────────────────────────────────
// Stores BOTH ledgerId (main) and pharmLedgerId (pharmacy) in the transaction doc
export async function transferToPharmacy(input: {
  productId: string; quantity: number; batch: string;
  expiry?: string | null; notes?: string; entryDate?: string;
  brandName?: string; genericName?: string; unit?: string;
}, userId: string) {
  const db = getAdminDb();
  const mainRef = db.collection("mainStock").doc(input.productId);
  const pharmRef = db.collection("pharmacyStock").doc(input.productId);
  const mainLedgerRef = mainRef.collection("mainLedger").doc();
  const pharmLedgerRef = pharmRef.collection("pharmacyLedger").doc();
  const expiryTs = input.expiry ? Timestamp.fromDate(new Date(input.expiry)) : null;
  const entryTs = toTimestamp(input.entryDate);
  const dateKey = getDateKey(input.entryDate);
  let beforeMainQty = 0, afterMainQty = 0;

  await db.runTransaction(async (tx) => {
    const [mainSnap, pharmSnap] = await Promise.all([tx.get(mainRef), tx.get(pharmRef)]);
    if (!mainSnap.exists) throw new NotFoundError("Main stock record");
    if (!pharmSnap.exists) throw new NotFoundError("Pharmacy stock record");
    beforeMainQty = mainSnap.data()!.quantity ?? 0;
    const beforePharmQty = pharmSnap.data()!.quantity ?? 0;
    afterMainQty = beforeMainQty - input.quantity;
    if (afterMainQty < 0) throw new InsufficientStockError();

    tx.update(mainRef, { quantity: afterMainQty, updatedAt: FieldValue.serverTimestamp() });
    tx.update(pharmRef, { quantity: beforePharmQty + input.quantity, updatedAt: FieldValue.serverTimestamp() });

    tx.set(mainLedgerRef, {
      type: "OUT", reference: "TRANSFER", quantity: input.quantity,
      batch: input.batch, expiry: expiryTs, price: 0, supplier: "",
      notes: input.notes ?? "", timestamp: entryTs, userId,
      // Store pharmacy ledger ID for cross-reference
      pharmLedgerId: pharmLedgerRef.id,
    });
    tx.set(pharmLedgerRef, {
      type: "IN", reference: "TRANSFER", quantity: input.quantity,
      batch: input.batch, expiry: expiryTs, timestamp: entryTs, userId,
      // Store main ledger ID for cross-reference
      mainLedgerId: mainLedgerRef.id,
    });
  });

  // Store BOTH ledger IDs in transaction doc
  await saveTransaction("transfer", {
    productId: input.productId, brandName: input.brandName ?? "",
    genericName: input.genericName ?? "", unit: input.unit ?? "",
    quantity: input.quantity, batch: input.batch, notes: input.notes,
    userId, entryDate: dateKey, timestamp: entryTs as Timestamp,
    ledgerCollection: "mainStock",
    ledgerSubCollection: "mainLedger",
    ledgerId: mainLedgerRef.id,
    pharmLedgerId: pharmLedgerRef.id,  // ← KEY: stored for CRUD operations
  }).catch(console.error);

  return { success: true };
}

// ─── Dispense from Pharmacy ───────────────────────────────────────────────
export async function dispenseFromPharmacy(input: {
  productId: string; quantity: number; batch?: string; price?: number;
  patientName?: string; prescriptionNo?: string; entryDate?: string;
  brandName?: string; genericName?: string; unit?: string;
}, userId: string) {
  const db = getAdminDb();
  const pharmRef = db.collection("pharmacyStock").doc(input.productId);
  const ledgerRef = pharmRef.collection("pharmacyLedger").doc();
  const entryTs = toTimestamp(input.entryDate);
  const dateKey = getDateKey(input.entryDate);
  let beforeQty = 0, afterQty = 0;

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(pharmRef);
    if (!snap.exists) throw new NotFoundError("Pharmacy stock record");
    beforeQty = snap.data()!.quantity ?? 0;
    afterQty = beforeQty - input.quantity;
    if (afterQty < 0) throw new InsufficientStockError();
    tx.update(pharmRef, { quantity: afterQty, updatedAt: FieldValue.serverTimestamp() });
    tx.set(ledgerRef, {
      type: "OUT", reference: "DISPENSE", quantity: input.quantity,
      batch: input.batch ?? "", expiry: null,
      patientName: input.patientName ?? "",
      prescriptionNo: input.prescriptionNo ?? "",
      timestamp: entryTs, userId,
    });
  });

  await saveTransaction("dispense", {
    productId: input.productId, brandName: input.brandName ?? "",
    genericName: input.genericName ?? "", unit: input.unit ?? "",
    quantity: input.quantity, price: input.price ?? 0,
    patientName: input.patientName, prescriptionNo: input.prescriptionNo,
    userId, entryDate: dateKey, timestamp: entryTs as Timestamp,
    ledgerCollection: "pharmacyStock",
    ledgerSubCollection: "pharmacyLedger",
    ledgerId: ledgerRef.id,
    // No pharmLedgerId for dispense
  }).catch(console.error);

  return { success: true, beforeQty, afterQty };
}

export async function bulkDispense(items: Array<{
  productId: string; quantity: number; batch?: string; price?: number;
  brandName?: string; genericName?: string; unit?: string;
}>, meta: { patientName?: string; prescriptionNo?: string; entryDate?: string }, userId: string) {
  const results = await Promise.allSettled(items.map((item) => dispenseFromPharmacy({ ...item, ...meta }, userId)));
  const succeeded = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.map((r, i) => ({ index: i, result: r }))
    .filter((r) => r.result.status === "rejected")
    .map((r) => ({ index: r.index, error: (r.result as PromiseRejectedResult).reason?.message ?? "Unknown" }));
  return { succeeded, failed, total: items.length };
}

// ─── Admin Stock Adjustment ───────────────────────────────────────────────
export async function adjustStock(input: StockAdjustmentInput, userId: string) {
  const db = getAdminDb();
  const collName = input.stockType === "main" ? "mainStock" : "pharmacyStock";
  const subColl = input.stockType === "main" ? "mainLedger" : "pharmacyLedger";
  const stockRef = db.collection(collName).doc(input.productId);
  const ledgerRef = stockRef.collection(subColl).doc();
  let beforeQty = 0;

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(stockRef);
    if (!snap.exists) throw new NotFoundError("Stock record");
    beforeQty = snap.data()!.quantity ?? 0;
    const diff = input.newQuantity - beforeQty;
    tx.update(stockRef, { quantity: input.newQuantity, updatedAt: FieldValue.serverTimestamp() });
    tx.set(ledgerRef, {
      type: "ADJUSTMENT", quantity: Math.abs(diff), adjustmentDelta: diff,
      beforeQty, afterQty: input.newQuantity, batch: "", expiry: null, price: 0,
      supplier: "", reference: "ADMIN_ADJUSTMENT", reason: input.reason,
      timestamp: FieldValue.serverTimestamp(), userId,
    });
  });

  return { beforeQty, afterQty: input.newQuantity };
}

export async function getAllStockLevels() {
  const db = getAdminDb();
  const [mainSnap, pharmSnap] = await Promise.all([
    db.collection("mainStock").get(), db.collection("pharmacyStock").get(),
  ]);
  const mainMap: Record<string, number> = {};
  const pharmMap: Record<string, number> = {};
  mainSnap.docs.forEach((d) => { mainMap[d.id] = d.data().quantity ?? 0; });
  pharmSnap.docs.forEach((d) => { pharmMap[d.id] = d.data().quantity ?? 0; });
  return { mainMap, pharmMap };
}