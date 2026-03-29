"use server";
// app/actions/transfer.ts
import { requireAuth } from "@/lib/auth";
import { transferToPharmacy } from "@/services/stockService";
import { TransferSchema } from "@/schemas/transfer";
import { handleActionError } from "@/utils/errorHandler";
import { z } from "zod";

const TransferWithDateSchema = TransferSchema.extend({
  entryDate: z.string().optional().nullable(),
});

export async function transferAction(data: unknown) {
  try {
    const user = await requireAuth();
    const validated = TransferWithDateSchema.parse(data);
    await transferToPharmacy({
      productId: validated.productId,
      quantity: validated.quantity,
      batch: validated.batch,
      expiry: validated.expiry,
      notes: validated.notes,
      entryDate: validated.entryDate ?? undefined,
    }, user.id);
    return { success: true, message: "Transfer completed successfully" };
  } catch (error) {
    return handleActionError(error);
  }
}
