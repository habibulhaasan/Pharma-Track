"use server";
// app/actions/stock.ts
import { requireAuth, requireAdmin } from "@/lib/auth";
import { addMainStockIn, bulkAddMainStockIn, adjustStock } from "@/services/stockService";
import { StockInSchema, StockAdjustmentSchema } from "@/schemas/stock";
import { handleActionError } from "@/utils/errorHandler";
import { z } from "zod";

const StockInWithDateSchema = StockInSchema.extend({
  entryDate: z.string().optional().nullable(),
});

const BulkStockInWithDateSchema = z.object({
  entries: z.array(StockInWithDateSchema).min(1).max(100),
});

export async function stockInAction(data: unknown) {
  try {
    const user = await requireAuth();
    const validated = StockInWithDateSchema.parse(data);
    const result = await addMainStockIn({
      ...validated,
      entryDate: validated.entryDate ?? undefined,
    }, user.id);
    return { success: true, data: result };
  } catch (error) {
    return handleActionError(error);
  }
}

export async function bulkStockInAction(data: unknown) {
  try {
    const user = await requireAuth();
    const validated = BulkStockInWithDateSchema.parse(data);
    const result = await bulkAddMainStockIn(
      validated.entries.map((e) => ({ ...e, entryDate: e.entryDate ?? undefined })),
      user.id
    );
    return { success: true, data: result };
  } catch (error) {
    return handleActionError(error);
  }
}

export async function adjustStockAction(data: unknown) {
  try {
    await requireAdmin();
    const user = await requireAuth();
    const validated = StockAdjustmentSchema.parse(data);
    const result = await adjustStock(validated, user.id);
    return { success: true, data: result };
  } catch (error) {
    return handleActionError(error);
  }
}
