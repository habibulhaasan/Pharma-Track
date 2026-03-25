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
      .get(),
    db.collectionGroup("pharmacyLedger")
      .where("timestamp", ">=", startTs)
      .where("timestamp", "<=", endTs)
      .orderBy("timestamp", "asc")
      .get(),
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

  const entries = [
    ...mainSnap.docs.map((d) => serialize(d, "main")),
    ...pharmSnap.docs.map((d) => serialize(d, "pharmacy")),
  ].sort((a, b) => a.timestamp.localeCompare(b.timestamp));

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