// schemas/ledger.ts
import { z } from "zod";

export const MainLedgerTypeSchema = z.enum(["IN", "OUT", "ADJUSTMENT"]);
export const PharmacyLedgerTypeSchema = z.enum(["IN", "OUT"]);
export const PharmacyLedgerRefSchema = z.enum(["TRANSFER", "DISPENSE"]);

export const LedgerFilterSchema = z.object({
  productId: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  type: z.string().optional(),
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(200).default(50),
});

export type MainLedgerType = z.infer<typeof MainLedgerTypeSchema>;
export type PharmacyLedgerType = z.infer<typeof PharmacyLedgerTypeSchema>;
export type PharmacyLedgerRef = z.infer<typeof PharmacyLedgerRefSchema>;
export type LedgerFilter = z.infer<typeof LedgerFilterSchema>;
