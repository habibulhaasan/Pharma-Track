"use server";
// app/actions/transfer.ts
import { requireAuth } from "@/lib/auth";
import { transferToPharmacy } from "@/services/stockService";
import { handleActionError } from "@/utils/errorHandler";
import { z } from "zod";
import { getAdminDb } from "@/lib/firebaseAdmin";

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

const TransferWithDateSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().positive(),
  batch: z.string().min(1).max(100),
  expiry: z.string().optional().nullable(),
  notes: z.string().max(500).optional(),
  entryDate: z.string().optional().nullable(),
});

export async function transferAction(data: unknown) {
  try {
    const user = await requireAuth();
    const validated = TransferWithDateSchema.parse(data);
    const productInfo = await getProductInfo(validated.productId);
    await transferToPharmacy({ ...validated, entryDate: validated.entryDate ?? undefined, ...productInfo }, user.id);
    return { success: true, message: "Transfer completed successfully" };
  } catch (error) {
    return handleActionError(error);
  }
}