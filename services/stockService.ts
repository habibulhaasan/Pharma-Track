// services/stockService.ts
// ALL stock mutations use Firestore transactions to prevent race conditions
import "server-only";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { InsufficientStockError, NotFoundError } from "@/utils/errorHandler";
import { logActivity } from "./ledgerService";
import type { StockInInput, StockAdjustmentInput } from "@/schemas/stock";

// ─── Stock IN (purchase received) ─────────────────────────────────────────
export async function addMainStockIn(input: StockInInput, userId: string) {
  const db = getAdminDb();
  const stockRef = db.collection("mainStock").doc(input.productId);
  const ledgerRef = stockRef.collection("mainLedger").doc();
  const expiryTimestamp = input.expiry ? Timestamp.fromDate(new Date(input.expiry)) : null;

  let beforeQty = 0;
  let afterQty = 0;

  await db.runTransaction(async (tx) => {
    const stockSnap = await tx.get(stockRef);
    if (!stockSnap.exists) {
      throw new NotFoundError("Product stock record");
    }

    beforeQty = stockSnap.data()!.quantity ?? 0;
    afterQty = beforeQty + input.quantity;

    tx.update(stockRef, {
      quantity: afterQty,
      updatedAt: FieldValue.serverTimestamp(),
    });

    tx.set(ledgerRef, {
      type: "IN",
      quantity: input.quantity,
      batch: input.batch,
      expiry: expiryTimestamp,
      price: input.price,
      supplier: input.supplier,
      reference: input.reference ?? "",
      timestamp: FieldValue.serverTimestamp(),
      userId,
    });
  });

  await logActivity({
    userId,
    action: "STOCK_IN",
    productId: input.productId,
    beforeQty,
    afterQty,
    details: { batch: input.batch, supplier: input.supplier, price: input.price },
  });

  return { beforeQty, afterQty };
}

// ─── Bulk Stock IN ─────────────────────────────────────────────────────────
export async function bulkAddMainStockIn(
  entries: StockInInput[],
  userId: string
) {
  const results = await Promise.allSettled(
    entries.map((entry) => addMainStockIn(entry, userId))
  );

  const succeeded = results.filter((r) => r.status === "fulfilled").length;
  const failed = results
    .map((r, i) => ({ index: i, result: r }))
    .filter((r) => r.result.status === "rejected")
    .map((r) => ({
      index: r.index,
      error: (r.result as PromiseRejectedResult).reason?.message ?? "Unknown error",
    }));

  return { succeeded, failed, total: entries.length };
}

// ─── Transfer: Main → Pharmacy ────────────────────────────────────────────
export async function transferToPharmacy(
  input: {
    productId: string;
    quantity: number;
    batch: string;
    expiry?: string | null;
    notes?: string;
  },
  userId: string
) {
  const db = getAdminDb();
  const mainStockRef = db.collection("mainStock").doc(input.productId);
  const pharmStockRef = db.collection("pharmacyStock").doc(input.productId);
  const mainLedgerRef = mainStockRef.collection("mainLedger").doc();
  const pharmLedgerRef = pharmStockRef.collection("pharmacyLedger").doc();
  const expiryTimestamp = input.expiry ? Timestamp.fromDate(new Date(input.expiry)) : null;

  let beforeMainQty = 0;
  let afterMainQty = 0;

  await db.runTransaction(async (tx) => {
    const [mainSnap, pharmSnap] = await Promise.all([
      tx.get(mainStockRef),
      tx.get(pharmStockRef),
    ]);

    if (!mainSnap.exists) throw new NotFoundError("Main stock record");
    if (!pharmSnap.exists) throw new NotFoundError("Pharmacy stock record");

    beforeMainQty = mainSnap.data()!.quantity ?? 0;
    const beforePharmQty = pharmSnap.data()!.quantity ?? 0;

    // ⚠️  Critical: prevent negative main stock
    afterMainQty = beforeMainQty - input.quantity;
    if (afterMainQty < 0) {
      throw new InsufficientStockError();
    }

    const afterPharmQty = beforePharmQty + input.quantity;

    // Update main stock
    tx.update(mainStockRef, {
      quantity: afterMainQty,
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Update pharmacy stock
    tx.update(pharmStockRef, {
      quantity: afterPharmQty,
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Main ledger: OUT (TRANSFER)
    tx.set(mainLedgerRef, {
      type: "OUT",
      reference: "TRANSFER",
      quantity: input.quantity,
      batch: input.batch,
      expiry: expiryTimestamp,
      price: 0,
      supplier: "",
      notes: input.notes ?? "",
      timestamp: FieldValue.serverTimestamp(),
      userId,
    });

    // Pharmacy ledger: IN (TRANSFER)
    tx.set(pharmLedgerRef, {
      type: "IN",
      reference: "TRANSFER",
      quantity: input.quantity,
      batch: input.batch,
      expiry: expiryTimestamp,
      timestamp: FieldValue.serverTimestamp(),
      userId,
    });
  });

  await logActivity({
    userId,
    action: "TRANSFER",
    productId: input.productId,
    beforeQty: beforeMainQty,
    afterQty: afterMainQty,
    details: { quantity: input.quantity, batch: input.batch },
  });

  return { success: true };
}

// ─── Dispense from Pharmacy ────────────────────────────────────────────────
export async function dispenseFromPharmacy(
  input: {
    productId: string;
    quantity: number;
    batch?: string;
    price?: number;
    patientName?: string;
    prescriptionNo?: string;
  },
  userId: string
) {
  const db = getAdminDb();
  const pharmStockRef = db.collection("pharmacyStock").doc(input.productId);
  const pharmLedgerRef = pharmStockRef.collection("pharmacyLedger").doc();
  const saleRef = db.collection("sales").doc();

  let beforeQty = 0;
  let afterQty = 0;

  await db.runTransaction(async (tx) => {
    const pharmSnap = await tx.get(pharmStockRef);
    if (!pharmSnap.exists) throw new NotFoundError("Pharmacy stock record");

    beforeQty = pharmSnap.data()!.quantity ?? 0;

    // ⚠️  Critical: prevent negative pharmacy stock
    afterQty = beforeQty - input.quantity;
    if (afterQty < 0) {
      throw new InsufficientStockError();
    }

    tx.update(pharmStockRef, {
      quantity: afterQty,
      updatedAt: FieldValue.serverTimestamp(),
    });

    tx.set(pharmLedgerRef, {
      type: "OUT",
      reference: "DISPENSE",
      quantity: input.quantity,
      batch: input.batch ?? "",
      expiry: null,
      patientName: input.patientName ?? "",
      prescriptionNo: input.prescriptionNo ?? "",
      timestamp: FieldValue.serverTimestamp(),
      userId,
    });

    tx.set(saleRef, {
      productId: input.productId,
      quantity: input.quantity,
      price: input.price ?? 0,
      patientName: input.patientName ?? "",
      prescriptionNo: input.prescriptionNo ?? "",
      timestamp: FieldValue.serverTimestamp(),
      userId,
    });
  });

  await logActivity({
    userId,
    action: "DISPENSE",
    productId: input.productId,
    beforeQty,
    afterQty,
    details: {
      quantity: input.quantity,
      patientName: input.patientName,
      prescriptionNo: input.prescriptionNo,
    },
  });

  return { success: true, beforeQty, afterQty };
}

// ─── Bulk Dispense ─────────────────────────────────────────────────────────
export async function bulkDispense(
  items: Array<{
    productId: string;
    quantity: number;
    batch?: string;
    price?: number;
  }>,
  meta: { patientName?: string; prescriptionNo?: string },
  userId: string
) {
  const results = await Promise.allSettled(
    items.map((item) =>
      dispenseFromPharmacy({ ...item, ...meta }, userId)
    )
  );

  const succeeded = results.filter((r) => r.status === "fulfilled").length;
  const failed = results
    .map((r, i) => ({ index: i, result: r }))
    .filter((r) => r.result.status === "rejected")
    .map((r) => ({
      index: r.index,
      error: (r.result as PromiseRejectedResult).reason?.message ?? "Unknown error",
    }));

  return { succeeded, failed, total: items.length };
}

// ─── Admin Stock Adjustment ────────────────────────────────────────────────
export async function adjustStock(input: StockAdjustmentInput, userId: string) {
  const db = getAdminDb();
  const collectionName = input.stockType === "main" ? "mainStock" : "pharmacyStock";
  const ledgerCollName = input.stockType === "main" ? "mainLedger" : "pharmacyLedger";

  const stockRef = db.collection(collectionName).doc(input.productId);
  const ledgerRef = stockRef.collection(ledgerCollName).doc();

  let beforeQty = 0;

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(stockRef);
    if (!snap.exists) throw new NotFoundError("Stock record");

    beforeQty = snap.data()!.quantity ?? 0;
    const diff = input.newQuantity - beforeQty;

    tx.update(stockRef, {
      quantity: input.newQuantity,
      updatedAt: FieldValue.serverTimestamp(),
    });

    tx.set(ledgerRef, {
      type: "ADJUSTMENT",
      quantity: Math.abs(diff),
      adjustmentDelta: diff,
      batch: "",
      expiry: null,
      price: 0,
      supplier: "",
      reference: "ADMIN_ADJUSTMENT",
      reason: input.reason,
      timestamp: FieldValue.serverTimestamp(),
      userId,
    });
  });

  await logActivity({
    userId,
    action: "STOCK_ADJUST",
    productId: input.productId,
    beforeQty,
    afterQty: input.newQuantity,
    details: { reason: input.reason, stockType: input.stockType },
  });

  return { beforeQty, afterQty: input.newQuantity };
}

// ─── Get current stock levels ──────────────────────────────────────────────
export async function getAllStockLevels() {
  const db = getAdminDb();
  const [mainSnap, pharmSnap] = await Promise.all([
    db.collection("mainStock").get(),
    db.collection("pharmacyStock").get(),
  ]);

  const mainMap: Record<string, number> = {};
  const pharmMap: Record<string, number> = {};

  mainSnap.docs.forEach((d) => {
    mainMap[d.id] = d.data().quantity ?? 0;
  });
  pharmSnap.docs.forEach((d) => {
    pharmMap[d.id] = d.data().quantity ?? 0;
  });

  return { mainMap, pharmMap };
}
