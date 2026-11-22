// app/(app)/monthly-report/page.tsx
import { getCurrentUser } from "@/lib/auth";
import { getAllProducts } from "@/services/productService";
import { sortProducts } from "@/utils/stockUtils";
import { MonthlyReportClient } from "./monthly-report-client";

export const runtime = "nodejs";

export default async function MonthlyReportPage() {
  await getCurrentUser();
  const products = (await getAllProducts()) as any[];

  const serialized = sortProducts(
    products.map((p) => ({
      id: p.id,
      genericName: p.genericName ?? "",
      brandName: p.brandName ?? "",
      unit: p.unit ?? "",
      type: p.type ?? "",
    }))
  );

  return <MonthlyReportClient products={serialized} />;
}