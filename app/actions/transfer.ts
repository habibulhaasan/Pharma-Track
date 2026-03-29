"use server";
// app/actions/transfer.ts
import { requireAuth } from "@/lib/auth";
import { transferToPharmacy } from "@/services/stockService";
import { TransferSchema } from "@/schemas/transfer";
import { handleActionError } from "@/utils/errorHandler";

export async function transferAction(data: unknown) {
  try {
    const user = await requireAuth();
    const validated = TransferSchema.parse(data);
    await transferToPharmacy({
      ...validated,
      entryDate: validated.entryDate ?? undefined,
    }, user.id);
    return { success: true, message: "Transfer completed successfully" };
  } catch (error) {
    return handleActionError(error);
  }
}
