// app/(app)/inventory/page.tsx
import { getCurrentUser } from "@/lib/auth";
import { getAllProducts } from "@/services/productService";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { InventoryClient } from "./inventory-client";
import { sortProducts } from "@/utils/stockUtils";

export const runtime = "nodejs";

export default async function InventoryPage() {
  const user = await getCurrentUser();
  const db = getAdminDb();

  const [productsRaw] = await Promise.all([getAllProducts()]);

  const products = sortProducts(
    (productsRaw as any[]).map((p) => ({
      id: p.id,
      brandName: p.brandName ?? "",
      genericName: p.genericName ?? "",
      type: p.type ?? "",
      unit: p.unit ?? "",
    }))
  );

  // Fetch all transaction dates (last 365 days) from collectionGroup
  // We get timestamps and extract unique dates
  const [mainSnap, pharmSnap] = await Promise.all([
    db.collectionGroup("mainLedger")
      .orderBy("timestamp", "desc")
      .limit(2000)
      .get(),
    db.collectionGroup("pharmacyLedger")
      .orderBy("timestamp", "desc")
      .limit(2000)
      .get(),
  ]);

  // Collect unique dates that have data (YYYY-MM-DD)
  const dateSet = new Set<string>();

  for (const doc of [...mainSnap.docs, ...pharmSnap.docs]) {
    const ts = doc.data().timestamp;
    if (ts) {
      const d = ts.toDate ? ts.toDate() : new Date(ts.seconds * 1000);
      dateSet.add(d.toISOString().split("T")[0]);
    }
  }

  const activeDates = Array.from(dateSet).sort().reverse();

  return (
    <InventoryClient
      products={products}
      activeDates={activeDates}
      isAdmin={user?.role === "admin"}
      userId={user?.uid ?? ""}
    />
  );
}