"use server";
// app/actions/dailyStock.ts
import { requireAuth } from "@/lib/auth";
import { getDailyStockSnapshot } from "@/services/dailyStockService";

export async function getDailyStockSnapshotAction(dateKey: string) {
  await requireAuth();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    return { success: false, error: "Invalid date" };
  }

  try {
    const rows = await getDailyStockSnapshot(dateKey);
    return { success: true, data: rows };
  } catch (err) {
    console.error("getDailyStockSnapshotAction:", err);
    return { success: false, error: "Failed to load daily stock snapshot" };
  }
}