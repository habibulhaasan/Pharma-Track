// app/(app)/products/page.tsx
import { getCurrentUser } from "@/lib/auth";
import { getAllProducts } from "@/services/productService";
import { getAllStockLevels } from "@/services/stockService";
import { ProductsClientPage } from "./products-client";

export const runtime = "nodejs";

export default async function ProductsPage() {
  const user = await getCurrentUser();
  const [products, { mainMap, pharmMap }] = await Promise.all([
    getAllProducts(),
    getAllStockLevels(),
  ]);

  const enriched = (products as any[]).map((p) => ({
    id: p.id,
    genericName: p.genericName ?? "",
    brandName: p.brandName ?? "",
    type: p.type ?? "",
    company: p.company ?? "",
    unit: p.unit ?? "",
    defaultPrice: p.defaultPrice ?? 0,
    reorderLevel: p.reorderLevel ?? 0,
    deleted: p.deleted ?? false,
    mainStock: mainMap[p.id] ?? 0,
    pharmacyStock: pharmMap[p.id] ?? 0,
  }));

  return (
    <ProductsClientPage
      products={enriched}
      isAdmin={user?.role === "admin"}
    />
  );
}