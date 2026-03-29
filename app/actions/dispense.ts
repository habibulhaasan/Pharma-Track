"use server";
// app/actions/dispense.ts
import { requireAuth } from "@/lib/auth";
import { dispenseFromPharmacy, bulkDispense } from "@/services/stockService";
import { SingleDispenseSchema, DispenseSchema } from "@/schemas/dispense";
import { handleActionError } from "@/utils/errorHandler";
import { z } from "zod";

const BulkDispenseWithDateSchema = DispenseSchema.extend({
  entryDate: z.string().optional().nullable(),
});

export async function dispenseAction(data: unknown) {
  try {
    const user = await requireAuth();
    const validated = SingleDispenseSchema.parse(data);
    const result = await dispenseFromPharmacy(validated, user.id);
    return { success: true, data: result };
  } catch (error) {
    return handleActionError(error);
  }
}

export async function bulkDispenseAction(data: unknown) {
  try {
    const user = await requireAuth();
    const validated = BulkDispenseWithDateSchema.parse(data);
    const result = await bulkDispense(
      validated.items,
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
