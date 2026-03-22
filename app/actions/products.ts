"use server";
// app/actions/products.ts
import { requireAdmin } from "@/lib/auth";
import { createProduct, updateProduct, softDeleteProduct } from "@/services/productService";
import { CreateProductSchema, UpdateProductSchema, DeleteProductSchema } from "@/schemas/product";
import { handleActionError } from "@/utils/errorHandler";

export async function createProductAction(data: unknown) {
  try {
    const admin = await requireAdmin();
    const validated = CreateProductSchema.parse(data);
    const id = await createProduct(validated, admin.id);
    return { success: true, data: { id } };
  } catch (error) {
    return handleActionError(error);
  }
}

export async function updateProductAction(data: unknown) {
  try {
    const admin = await requireAdmin();
    const validated = UpdateProductSchema.parse(data);
    const { productId, ...rest } = validated;
    await updateProduct(productId, rest, admin.id);
    return { success: true };
  } catch (error) {
    return handleActionError(error);
  }
}

export async function deleteProductAction(data: unknown) {
  try {
    const admin = await requireAdmin();
    const validated = DeleteProductSchema.parse(data);
    await softDeleteProduct(validated.productId, admin.id);
    return { success: true };
  } catch (error) {
    return handleActionError(error);
  }
}
