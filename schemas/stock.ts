// schemas/stock.ts
import { z } from "zod";

export const StockInSchema = z.object({
  productId: z.string().min(1, "Product ID required"),
  quantity: z
    .number({ invalid_type_error: "Quantity must be a number" })
    .int("Quantity must be a whole number")
    .positive("Quantity must be positive"),
  batch: z.string().min(1, "Batch number required").max(100),
  expiry: z
    .string()
    .optional()
    .nullable()
    .refine((val) => {
      if (!val) return true;
      const date = new Date(val);
      return !isNaN(date.getTime());
    }, "Invalid expiry date"),
  price: z
    .number({ invalid_type_error: "Price must be a number" })
    .min(0, "Price cannot be negative"),
  supplier: z.string().min(1, "Supplier required").max(200),
  reference: z.string().max(200).optional().default(""),
});

export const BulkStockInSchema = z.object({
  entries: z
    .array(StockInSchema)
    .min(1, "At least one entry required")
    .max(100, "Max 100 entries per bulk submission"),
});

export const StockAdjustmentSchema = z.object({
  productId: z.string().min(1, "Product ID required"),
  stockType: z.enum(["main", "pharmacy"]),
  newQuantity: z
    .number({ invalid_type_error: "Quantity must be a number" })
    .int("Quantity must be a whole number")
    .min(0, "Quantity cannot be negative"),
  reason: z
    .string()
    .min(10, "Reason must be at least 10 characters")
    .max(500, "Reason too long"),
});

export type StockInInput = z.infer<typeof StockInSchema>;
export type BulkStockInInput = z.infer<typeof BulkStockInSchema>;
export type StockAdjustmentInput = z.infer<typeof StockAdjustmentSchema>;
