// app/(app)/reports/page.tsx
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getStockValueReport, getExpiryReport } from "@/services/reportService";
import { ReportsClient } from "./reports-client";

export const runtime = "nodejs";

export default async function ReportsPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") redirect("/dashboard");

  const [stockReport, expiryReport] = await Promise.all([
    getStockValueReport(),
    getExpiryReport(90),
  ]);

  // Serialize stock rows — no Timestamps needed by the client
  const serializedRows = stockReport.rows.map((r: any) => ({
    id: r.id,
    genericName: r.genericName ?? "",
    brandName: r.brandName ?? "",
    unit: r.unit ?? "",
    quantity: r.quantity ?? 0,
    defaultPrice: r.defaultPrice ?? 0,
    totalValue: r.totalValue ?? 0,
    reorderLevel: r.reorderLevel ?? 0,
    isLowStock: r.isLowStock ?? false,
  }));

  // Serialize expiry rows — convert Date/Timestamp to ISO string
  const serializedExpiry = (expiryReport as any[]).map((r) => ({
    productId: r.productId,
    genericName: r.genericName ?? "",
    brandName: r.brandName ?? "",
    batch: r.batch ?? "",
    expiry: r.expiry instanceof Date
      ? r.expiry.toISOString()
      : r.expiry?.toDate?.()?.toISOString() ?? null,
    quantity: r.quantity ?? 0,
    daysUntilExpiry: r.daysUntilExpiry ?? 0,
  }));

  return (
    <ReportsClient
      stockReport={{
        rows: serializedRows,
        totalValue: stockReport.totalValue,
        lowStockCount: stockReport.lowStockCount,
      }}
      expiryReport={serializedExpiry}
    />
  );
}