// schemas/dispense.ts
import { z } from "zod";

export const DispenseItemSchema = z.object({
  productId: z.string().min(1, "Product ID required"),
  quantity: z
    .number({ invalid_type_error: "Quantity must be a number" })
    .int("Quantity must be a whole number")
    .positive("Quantity must be positive"),
  batch: z.string().optional().default(""),
  price: z
    .number({ invalid_type_error: "Price must be a number" })
    .min(0, "Price cannot be negative")
    .optional()
    .default(0),
});

export const DispenseSchema = z.object({
  items: z
    .array(DispenseItemSchema)
    .min(1, "At least one item required")
    .max(50, "Max 50 items per dispense"),
  patientName: z.string().max(200).optional().default(""),
  prescriptionNo: z.string().max(100).optional().default(""),
});

export const SingleDispenseSchema = z.object({
  productId: z.string().min(1, "Product ID required"),
  quantity: z
    .number({ invalid_type_error: "Quantity must be a number" })
    .int("Quantity must be a whole number")
    .positive("Quantity must be positive"),
  batch: z.string().optional().default(""),
  price: z.number().min(0).optional().default(0),
  patientName: z.string().max(200).optional().default(""),
  prescriptionNo: z.string().max(100).optional().default(""),
});

export type DispenseInput = z.infer<typeof DispenseSchema>;
export type SingleDispenseInput = z.infer<typeof SingleDispenseSchema>;
export type DispenseItemInput = z.infer<typeof DispenseItemSchema>;
