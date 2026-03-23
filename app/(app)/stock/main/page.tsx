// app/(app)/stock/main/page.tsx
import { getCurrentUser } from "@/lib/auth";
import { getAllProducts } from "@/services/productService";
import { getAllStockLevels } from "@/services/stockService";
import { StockMainClient } from "./stock-main-client";
import { sortProducts } from "@/utils/stockUtils";

export const runtime = "nodejs";

export default async function StockMainPage() {
  const user = await getCurrentUser();
  const [products, { mainMap }] = await Promise.all([
    getAllProducts(),
    getAllStockLevels(),
  ]);

  const enriched = sortProducts(
    (products as any[]).map((p) => ({
      id: p.id,
      genericName: p.genericName ?? "",
      brandName: p.brandName ?? "",
      type: p.type ?? "",
      unit: p.unit ?? "",
      reorderLevel: p.reorderLevel ?? 0,
      defaultPrice: p.defaultPrice ?? 0,
      currentStock: mainMap[p.id] ?? 0,
    }))
  );

  return <StockMainClient products={enriched} isAdmin={user?.role === "admin"} />;
}