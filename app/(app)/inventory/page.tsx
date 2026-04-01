// app/(app)/inventory/page.tsx
import { getCurrentUser } from "@/lib/auth";
import { getAllProducts } from "@/services/productService";
import { getActiveDates } from "@/services/transactionService";
import { InventoryClient } from "./inventory-client";
import { sortProducts } from "@/utils/stockUtils";

export const runtime = "nodejs";

export default async function InventoryPage() {
  const user = await getCurrentUser();

  const [productsRaw, activeDatesData] = await Promise.all([
    getAllProducts(),
    getActiveDates(), // 1 read from _meta/activeDates
  ]);

  const products = sortProducts(
    (productsRaw as any[]).map((p) => ({
      id: p.id,
      brandName: p.brandName ?? "",
      genericName: p.genericName ?? "",
      type: p.type ?? "",
      unit: p.unit ?? "",
    }))
  );

  return (
    <InventoryClient
      products={products}
      isAdmin={user?.role === "admin"}
      userId={user?.id ?? ""}
      allDates={activeDatesData.allDates}
      stockInDates={activeDatesData.stockInDates}
      transferDates={activeDatesData.transferDates}
      dispenseDates={activeDatesData.dispenseDates}
    />
  );
}