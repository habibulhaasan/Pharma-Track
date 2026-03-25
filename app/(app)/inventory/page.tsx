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

  const productsRaw = await getAllProducts();

  const products = sortProducts(
    (productsRaw as any[]).map((p) => ({
      id: p.id,
      brandName: p.brandName ?? "",
      genericName: p.genericName ?? "",
      type: p.type ?? "",
      unit: p.unit ?? "",
    }))
  );

  // Collect dates per transaction type
  const stockInDates = new Set<string>();
  const transferDates = new Set<string>();
  const dispenseDates = new Set<string>();
  const allDates = new Set<string>();

  try {
    const [mainSnap, pharmSnap] = await Promise.all([
      db.collectionGroup("mainLedger")
        .orderBy("timestamp", "desc")
        .limit(3000)
        .get(),
      db.collectionGroup("pharmacyLedger")
        .orderBy("timestamp", "desc")
        .limit(3000)
        .get(),
    ]);

    for (const doc of mainSnap.docs) {
      const data = doc.data();
      const ts = data.timestamp;
      if (!ts) continue;
      const d = ts.toDate ? ts.toDate() : new Date(ts.seconds * 1000);
      const dateStr = d.toISOString().split("T")[0];
      allDates.add(dateStr);

      if (data.type === "IN") stockInDates.add(dateStr);
      if (data.reference === "TRANSFER") transferDates.add(dateStr);
    }

    for (const doc of pharmSnap.docs) {
      const data = doc.data();
      if (data.reference === "TRANSFER") continue; // deduplicated — tracked via mainLedger
      const ts = data.timestamp;
      if (!ts) continue;
      const d = ts.toDate ? ts.toDate() : new Date(ts.seconds * 1000);
      const dateStr = d.toISOString().split("T")[0];
      allDates.add(dateStr);

      if (data.reference === "DISPENSE") dispenseDates.add(dateStr);
    }
  } catch (err) {
    console.error("Inventory index not ready:", err);
  }

  const toSortedArray = (s: Set<string>) => Array.from(s).sort().reverse();

  return (
    <InventoryClient
      products={products}
      isAdmin={user?.role === "admin"}
      userId={user?.id ?? ""}
      allDates={toSortedArray(allDates)}
      stockInDates={toSortedArray(stockInDates)}
      transferDates={toSortedArray(transferDates)}
      dispenseDates={toSortedArray(dispenseDates)}
    />
  );
}