// app/(app)/daily-stock/page.tsx
import { getActiveDates } from "@/services/transactionService";
import { DailyStockClient } from "./daily-stock-client";

export const runtime = "nodejs";

export default async function DailyStockPage() {
  const { allDates } = await getActiveDates();
  return <DailyStockClient activeDates={allDates} />;
}