// app/(app)/admin/adjustment-history/page.tsx
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { AdjustmentHistoryClient } from "./adjustment-history-client";

export const runtime = "nodejs";

export default async function AdjustmentHistoryPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") redirect("/dashboard");

  const db = getAdminDb();

  // Fetch all adjustment ledger entries across all products
  // We query mainLedger and pharmacyLedger subcollections via collectionGroup
  const [mainSnap, pharmSnap, productsSnap] = await Promise.all([
    db.collectionGroup("mainLedger")
      .where("type", "==", "ADJUSTMENT")
      .orderBy("timestamp", "desc")
      .limit(200)
      .get(),
    db.collectionGroup("pharmacyLedger")
      .where("type", "==", "ADJUSTMENT")
      .orderBy("timestamp", "desc")
      .limit(200)
      .get(),
    db.collection("products").get(),
  ]);

  // Build product ID → name map
  const productMap: Record<string, string> = {};
  productsSnap.docs.forEach((d) => {
    const data = d.data();
    productMap[d.id] = data.brandName ?? data.genericName ?? d.id;
  });

  function serializeEntry(doc: FirebaseFirestore.QueryDocumentSnapshot, stockType: "main" | "pharmacy") {
    const data = doc.data();
    // Parent doc ID is the product ID
    const productId = doc.ref.parent.parent?.id ?? "";
    return {
      id: doc.id,
      productId,
      productName: productMap[productId] ?? productId,
      stockType,
      adjustmentDelta: data.adjustmentDelta ?? 0,
      beforeQty: data.beforeQty ?? 0,
      afterQty: data.afterQty ?? 0,
      reason: data.reason ?? "",
      userId: data.userId ?? "",
      timestamp: data.timestamp?.toDate?.()?.toISOString() ?? null,
    };
  }

  const mainEntries = mainSnap.docs.map((d) => serializeEntry(d, "main"));
  const pharmEntries = pharmSnap.docs.map((d) => serializeEntry(d, "pharmacy"));

  // Merge and sort by timestamp desc
  const allEntries = [...mainEntries, ...pharmEntries].sort((a, b) => {
    if (!a.timestamp) return 1;
    if (!b.timestamp) return -1;
    return b.timestamp.localeCompare(a.timestamp);
  });

  return <AdjustmentHistoryClient entries={allEntries} />;
}