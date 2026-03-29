// app/actions/inventory.ts
"use server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { requireAuth } from "@/lib/auth";
import { Timestamp } from "firebase-admin/firestore";

// Fetch all transactions for a specific date
export async function getDayInventoryAction(date: string) {
  const user = await requireAuth();
  const db = getAdminDb();

  const start = new Date(date + "T00:00:00.000Z");
  const end = new Date(date + "T23:59:59.999Z");

  const startTs = Timestamp.fromDate(start);
  const endTs = Timestamp.fromDate(end);

  const [mainSnap, pharmSnap, productsSnap] = await Promise.all([
    db.collectionGroup("mainLedger")
      .where("timestamp", ">=", startTs)
      .where("timestamp", "<=", endTs)
      .orderBy("timestamp", "asc")
      .get().catch(() => ({ docs: [] })),
    db.collectionGroup("pharmacyLedger")
      .where("timestamp", ">=", startTs)
      .where("timestamp", "<=", endTs)
      .orderBy("timestamp", "asc")
      .get().catch(() => ({ docs: [] })),
    db.collection("products").get(),
  ]);

  const productMap: Record<string, { brandName: string; genericName: string; unit: string }> = {};
  productsSnap.docs.forEach((d) => {
    const data = d.data();
    productMap[d.id] = {
      brandName: data.brandName ?? "",
      genericName: data.genericName ?? "",
      unit: data.unit ?? "",
    };
  });

  function serialize(doc: any, ledgerType: "main" | "pharmacy") {
    const data = doc.data();
    const productId = doc.ref.parent.parent?.id ?? "";
    const product = productMap[productId] ?? { brandName: productId, genericName: "", unit: "" };
    const ts = data.timestamp?.toDate?.() ?? new Date(data.timestamp?.seconds * 1000);
    return {
      id: doc.id,
      productId,
      brandName: product.brandName,
      genericName: product.genericName,
      unit: product.unit,
      ledgerType,
      type: data.type ?? "",
      reference: data.reference ?? "",
      quantity: data.quantity ?? 0,
      price: data.price ?? 0,
      batch: data.batch ?? "",
      supplier: data.supplier ?? "",
      patientName: data.patientName ?? "",
      prescriptionNo: data.prescriptionNo ?? "",
      reason: data.reason ?? "",
      userId: data.userId ?? "",
      timestamp: ts.toISOString(),
    };
  }

  const allEntries = [
    ...mainSnap.docs.map((d) => serialize(d, "main")),
    ...pharmSnap.docs.map((d) => serialize(d, "pharmacy")),
  ];

  // Deduplicate transfers: a transfer writes to both mainLedger (OUT/TRANSFER)
  // and pharmacyLedger (IN/TRANSFER). Show only the main ledger side
  // so it appears once as "Main → Pharmacy".
  const pharmTransferIds = new Set(
    pharmSnap.docs
      .filter((d) => d.data().reference === "TRANSFER")
      .map((d) => {
        // Match by productId + approximate timestamp (within 5 seconds)
        const ts = d.data().timestamp?.toDate?.()?.getTime() ?? 0;
        const productId = d.ref.parent.parent?.id ?? "";
        return `${productId}_${Math.floor(ts / 5000)}`;
      })
  );

  const entries = allEntries
    .filter((e) => {
      // Keep pharmacy entries that are NOT transfers (i.e. dispense etc)
      // Drop pharmacy TRANSFER entries — shown via main ledger side instead
      if (e.ledgerType === "pharmacy" && e.reference === "TRANSFER") return false;
      return true;
    })
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  return { success: true, data: entries };
}

// Edit a specific transaction quantity (admin only)
export async function editTransactionAction({
  productId,
  ledgerType,
  entryId,
  newQuantity,
  reason,
}: {
  productId: string;
  ledgerType: "main" | "pharmacy";
  entryId: string;
  newQuantity: number;
  reason: string;
}) {
  const user = await requireAuth();
  if (user.role !== "admin") return { success: false, error: "Admin only" };

  const db = getAdminDb();
  const collName = ledgerType === "main" ? "mainStock" : "pharmacyStock";
  const subColl = ledgerType === "main" ? "mainLedger" : "pharmacyLedger";

  const entryRef = db.collection(collName).doc(productId).collection(subColl).doc(entryId);
  const stockRef = db.collection(collName).doc(productId);

  await db.runTransaction(async (tx) => {
    const entryDoc = await tx.get(entryRef);
    const stockDoc = await tx.get(stockRef);

    if (!entryDoc.exists) throw new Error("Entry not found");

    const oldQty = entryDoc.data()!.quantity ?? 0;
    const oldType = entryDoc.data()!.type ?? "IN";
    const currentStock = stockDoc.data()?.quantity ?? 0;

    // Recalculate stock: reverse old effect, apply new
    let newStock = currentStock;
    if (oldType === "IN") {
      newStock = currentStock - oldQty + newQuantity; // was +old, now +new
    } else if (oldType === "OUT") {
      newStock = currentStock + oldQty - newQuantity; // was -old, now -new
    }

    newStock = Math.max(0, newStock);

    tx.update(entryRef, {
      quantity: newQuantity,
      editedBy: user.id,
      editedAt: Timestamp.now(),
      editReason: reason,
      originalQuantity: oldQty,
    });

    tx.update(stockRef, {
      quantity: newStock,
      updatedAt: Timestamp.now(),
    });
  });

  return { success: true };
}

// Delete a specific transaction and reverse its stock effect (admin only)
export async function deleteTransactionAction({
  productId,
  ledgerType,
  entryId,
  reason,
}: {
  productId: string;
  ledgerType: "main" | "pharmacy";
  entryId: string;
  reason: string;
}) {
  const user = await requireAuth();
  if (user.role !== "admin") return { success: false, error: "Admin only" };

  const db = getAdminDb();
  const collName = ledgerType === "main" ? "mainStock" : "pharmacyStock";
  const subColl = ledgerType === "main" ? "mainLedger" : "pharmacyLedger";

  const entryRef = db.collection(collName).doc(productId).collection(subColl).doc(entryId);
  const stockRef = db.collection(collName).doc(productId);

  await db.runTransaction(async (tx) => {
    const entryDoc = await tx.get(entryRef);
    const stockDoc = await tx.get(stockRef);
    if (!entryDoc.exists) throw new Error("Entry not found");

    const data = entryDoc.data()!;
    const qty = data.quantity ?? 0;
    const type = data.type ?? "IN";
    const currentStock = stockDoc.data()?.quantity ?? 0;

    // Reverse the effect: if it was IN, subtract; if OUT, add back
    let newStock = currentStock;
    if (type === "IN") newStock = Math.max(0, currentStock - qty);
    else if (type === "OUT") newStock = currentStock + qty;

    // Soft delete — mark as deleted rather than removing (preserves audit trail)
    tx.update(entryRef, {
      deleted: true,
      deletedBy: user.id,
      deletedAt: Timestamp.now(),
      deleteReason: reason,
    });

    tx.update(stockRef, {
      quantity: newStock,
      updatedAt: Timestamp.now(),
    });
  });

  return { success: true };
}

// Change the date of a specific transaction (admin only)
export async function changeDateTransactionAction({
  productId,
  ledgerType,
  entryId,
  newDate,
}: {
  productId: string;
  ledgerType: "main" | "pharmacy";
  entryId: string;
  newDate: string; // YYYY-MM-DD
}) {
  const user = await requireAuth();
  if (user.role !== "admin") return { success: false, error: "Admin only" };

  const db = getAdminDb();
  const collName = ledgerType === "main" ? "mainStock" : "pharmacyStock";
  const subColl = ledgerType === "main" ? "mainLedger" : "pharmacyLedger";

  const entryRef = db.collection(collName).doc(productId).collection(subColl).doc(entryId);

  const [year, month, day] = newDate.split("-").map(Number);
  const newTimestamp = Timestamp.fromDate(new Date(Date.UTC(year, month - 1, day, 6, 0, 0)));

  await entryRef.update({
    timestamp: newTimestamp,
    dateChangedBy: user.id,
    dateChangedAt: Timestamp.now(),
    originalDate: (await entryRef.get()).data()?.timestamp ?? null,
  });

  return { success: true };
}