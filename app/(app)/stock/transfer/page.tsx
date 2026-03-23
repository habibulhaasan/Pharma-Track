// app/(app)/stock/transfer/page.tsx
import { getAllProducts } from "@/services/productService";
import { getAllStockLevels } from "@/services/stockService";
import { TransferClient } from "./transfer-client";
import { sortProducts } from "@/utils/stockUtils";

export const runtime = "nodejs";

export default async function TransferPage() {
  const [products, { mainMap, pharmMap }] = await Promise.all([
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
      mainStock: mainMap[p.id] ?? 0,
      pharmacyStock: pharmMap[p.id] ?? 0,
    }))
  );

  return <TransferClient products={enriched} />;
}