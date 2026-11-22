"use server";
// app/actions/monthlyReport.ts
import { requireAuth } from "@/lib/auth";
import {
  getProductMonthlySeries,
  getMonthlyProductReport,
  type LedgerKind,
} from "@/services/monthlyReportService";

export async function getProductMonthlySeriesAction(
  productId: string,
  kind: LedgerKind,
  year: number
) {
  await requireAuth();
  try {
    return { success: true as const, data: await getProductMonthlySeries(productId, kind, year) };
  } catch (err) {
    console.error("getProductMonthlySeriesAction:", err);
    return { success: false as const, error: "Failed to load product report" };
  }
}

export async function getMonthlyProductReportAction(
  kind: LedgerKind,
  year: number,
  month: number
) {
  await requireAuth();
  try {
    return { success: true as const, data: await getMonthlyProductReport(kind, year, month) };
  } catch (err) {
    console.error("getMonthlyProductReportAction:", err);
    return { success: false as const, error: "Failed to load monthly report" };
  }
}