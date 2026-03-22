// app/(app)/admin/stock-adjustment/page.tsx
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getAllProducts } from "@/services/productService";
import { getAllStockLevels } from "@/services/stockService";
import { StockAdjustmentClient } from "./adjustment-client";

export const runtime = "nodejs";

export default async function StockAdjustmentPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") redirect("/dashboard");

  const [products, { mainMap, pharmMap }] = await Promise.all([
    getAllProducts(),
    getAllStockLevels(),
  ]);

  const enriched = (products as any[]).map((p) => ({
    id: p.id,
    genericName: p.genericName,
    brandName: p.brandName,
    unit: p.unit,
    reorderLevel: p.reorderLevel,
    mainStock: mainMap[p.id] ?? 0,
    pharmacyStock: pharmMap[p.id] ?? 0,
  }));

  return <StockAdjustmentClient products={enriched} />;
}