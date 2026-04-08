"use client";
// components/print-requisition-button.tsx
// Shows on inventory log when Transfer filter is active and a date is selected.
import { Printer } from "lucide-react";

interface PrintRequisitionButtonProps {
  date: string; // YYYY-MM-DD
  count: number;
}

export function PrintRequisitionButton({ date, count }: PrintRequisitionButtonProps) {
  if (!date || count === 0) return null;

  function handlePrint() {
    window.open(`/inventory/requisition/${date}`, "_blank");
  }

  return (
    <button
      onClick={handlePrint}
      className="flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
    >
      <Printer className="h-3.5 w-3.5" />
      Print Requisition ({count} items)
    </button>
  );
}