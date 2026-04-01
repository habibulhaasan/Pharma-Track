"use server";
// app/actions/stock.ts
import { requireAuth, requireAdmin } from "@/lib/auth";
import { addMainStockIn, bulkAddMainStockIn, adjustStock } from "@/services/stockService";
import { StockAdjustmentSchema } from "@/schemas/stock";
import { handleActionError } from "@/utils/errorHandler";
import { z } from "zod";
import { getAdminDb } from "@/lib/firebaseAdmin";

// Fetch product info helper
async function getProductInfo(productId: string) {
  const db = getAdminDb();
  const doc = await db.collection("products").doc(productId).get();
  const data = doc.data();
  return {
    brandName: data?.brandName ?? "",
    genericName: data?.genericName ?? "",
    unit: data?.unit ?? "",
  };
}

const StockInEntrySchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().positive(),
  batch: z.string().min(1).max(100),
  expiry: z.string().optional().nullable(),
  price: z.number().min(0),
  supplier: z.string().min(1).max(200),
  reference: z.string().max(200).optional().default(""),
  entryDate: z.string().optional().nullable(),
});

const BulkStockInSchema = z.object({
  entries: z.array(StockInEntrySchema).min(1).max(100),
});

export async function bulkStockInAction(data: unknown) {
  try {
    const user = await requireAuth();
    const validated = BulkStockInSchema.parse(data);

    // Fetch product info for all entries
    const enriched = await Promise.all(
      validated.entries.map(async (e) => ({
        ...e,
        entryDate: e.entryDate ?? undefined,
        ...(await getProductInfo(e.productId)),
      }))
    );

    const result = await bulkAddMainStockIn(enriched, user.id);
    return { success: true, data: result };
  } catch (error) {
    return handleActionError(error);
  }
}

export async function stockInAction(data: unknown) {
  try {
    const user = await requireAuth();
    const validated = StockInEntrySchema.parse(data);
    const productInfo = await getProductInfo(validated.productId);
    const result = await addMainStockIn({ ...validated, entryDate: validated.entryDate ?? undefined, ...productInfo }, user.id);
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