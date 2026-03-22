// schemas/transfer.ts
import { z } from "zod";

export const TransferSchema = z.object({
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
      return !isNaN(new Date(val as string).getTime());
    }, "Invalid expiry date"),
  notes: z.string().max(500).optional(),
});

export type TransferInput = z.infer<typeof TransferSchema>;
