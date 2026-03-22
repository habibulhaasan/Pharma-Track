"use server";
// app/actions/stock.ts
import { requireAuth, requireAdmin } from "@/lib/auth";
import { addMainStockIn, bulkAddMainStockIn, adjustStock } from "@/services/stockService";
import { StockInSchema, BulkStockInSchema, StockAdjustmentSchema } from "@/schemas/stock";
import { handleActionError } from "@/utils/errorHandler";

export async function stockInAction(data: unknown) {
  try {
    const user = await requireAuth();
    const validated = StockInSchema.parse(data);
    const result = await addMainStockIn(validated, user.id);
    return { success: true, data: result };
  } catch (error) {
    return handleActionError(error);
  }
}

export async function bulkStockInAction(data: unknown) {
  try {
    const user = await requireAuth();
    const validated = BulkStockInSchema.parse(data);
    const result = await bulkAddMainStockIn(validated.entries, user.id);
    return { success: true, data: result };
  } catch (error) {
    return handleActionError(error);
  }
}

export async function adjustStockAction(data: unknown) {
  try {
    await requireAdmin(); // Admin only
    const user = await requireAuth();
    const validated = StockAdjustmentSchema.parse(data);
    const result = await adjustStock(validated, user.id);
    return { success: true, data: result };
  } catch (error) {
    return handleActionError(error);
  }
}
