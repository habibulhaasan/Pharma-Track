// app/(app)/stock/pharmacy/page.tsx
import { getAllProducts } from "@/services/productService";
import { getAllStockLevels } from "@/services/stockService";
import { DispenseClient } from "./dispense-client";
import { sortProducts } from "@/utils/stockUtils";

export const runtime = "nodejs";

export default async function PharmacyStockPage() {
  const [products, { pharmMap }] = await Promise.all([
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
      defaultPrice: p.defaultPrice ?? 0,
      reorderLevel: p.reorderLevel ?? 0,
      pharmacyStock: pharmMap[p.id] ?? 0,
    }))
  );

  return <DispenseClient products={enriched} />;
}