// app/(app)/ledger/page.tsx
import { getCurrentUser } from "@/lib/auth";
import { getAllProducts } from "@/services/productService";
import { LedgerClient } from "./ledger-client";
import { sortProducts } from "@/utils/stockUtils";

export const runtime = "nodejs";

export default async function LedgerPage() {
  await getCurrentUser();
  const products = await getAllProducts() as any[];

  const serialized = sortProducts(
    products.map((p) => ({
      id: p.id,
      genericName: p.genericName ?? "",
      brandName: p.brandName ?? "",
      unit: p.unit ?? "",
      type: p.type ?? "",
    }))
  );

  return <LedgerClient products={serialized} />;
}