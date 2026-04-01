"use server";
// app/actions/dispense.ts
import { requireAuth } from "@/lib/auth";
import { dispenseFromPharmacy, bulkDispense } from "@/services/stockService";
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

const DispenseItemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().positive(),
  batch: z.string().optional().default(""),
  price: z.number().min(0).optional().default(0),
});

const BulkDispenseSchema = z.object({
  items: z.array(DispenseItemSchema).min(1).max(50),
  patientName: z.string().max(200).optional().default(""),
  prescriptionNo: z.string().max(100).optional().default(""),
  entryDate: z.string().optional().nullable(),
});

export async function bulkDispenseAction(data: unknown) {
  try {
    const user = await requireAuth();
    const validated = BulkDispenseSchema.parse(data);

    // Enrich each item with product info
    const enrichedItems = await Promise.all(
      validated.items.map(async (item) => ({
        ...item,
        ...(await getProductInfo(item.productId)),
      }))
    );

    const result = await bulkDispense(
      enrichedItems,
      {
        patientName: validated.patientName,
        prescriptionNo: validated.prescriptionNo,
        entryDate: validated.entryDate ?? undefined,
      },
      user.id
    );
    return { success: true, data: result };
  } catch (error) {
    return handleActionError(error);
  }
}

export async function dispenseAction(data: unknown) {
  try {
    const user = await requireAuth();
    const validated = DispenseItemSchema.extend({
      patientName: z.string().max(200).optional().default(""),
      prescriptionNo: z.string().max(100).optional().default(""),
      entryDate: z.string().optional().nullable(),
    }).parse(data);
    const productInfo = await getProductInfo(validated.productId);
    const result = await dispenseFromPharmacy({ ...validated, entryDate: validated.entryDate ?? undefined, ...productInfo }, user.id);
    return { success: true, data: result };
  } catch (error) {
    return handleActionError(error);
  }
}