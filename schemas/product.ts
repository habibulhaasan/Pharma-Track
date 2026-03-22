// schemas/product.ts
import { z } from "zod";

export const ProductTypeSchema = z.enum([
  "tablet",
  "capsule",
  "syrup",
  "injection",
  "cream",
  "ointment",
  "drops",
  "inhaler",
  "patch",
  "suppository",
  "other",
]);

export const CreateProductSchema = z.object({
  genericName: z
    .string()
    .min(1, "Generic name is required")
    .max(200, "Generic name too long"),
  brandName: z
    .string()
    .min(1, "Brand name is required")
    .max(200, "Brand name too long"),
  type: ProductTypeSchema,
  company: z
    .string()
    .min(1, "Company is required")
    .max(200, "Company name too long"),
  unit: z
    .string()
    .min(1, "Unit is required")
    .max(50, "Unit too long"),
  defaultPrice: z
    .number({ invalid_type_error: "Price must be a number" })
    .min(0, "Price cannot be negative"),
  reorderLevel: z
    .number({ invalid_type_error: "Reorder level must be a number" })
    .int("Reorder level must be a whole number")
    .min(0, "Reorder level cannot be negative"),
});

export const UpdateProductSchema = CreateProductSchema.partial().extend({
  productId: z.string().min(1, "Product ID required"),
});

export const DeleteProductSchema = z.object({
  productId: z.string().min(1, "Product ID required"),
});

export const ProductDocSchema = z.object({
  genericName: z.string(),
  brandName: z.string(),
  type: ProductTypeSchema,
  company: z.string(),
  unit: z.string(),
  defaultPrice: z.number(),
  reorderLevel: z.number(),
  deleted: z.boolean().default(false),
  createdAt: z.any(),
  updatedAt: z.any(),
});

export type CreateProductInput = z.infer<typeof CreateProductSchema>;
export type UpdateProductInput = z.infer<typeof UpdateProductSchema>;
export type ProductDoc = z.infer<typeof ProductDocSchema>;
export type ProductType = z.infer<typeof ProductTypeSchema>;

export interface ProductWithId extends ProductDoc {
  id: string;
}
