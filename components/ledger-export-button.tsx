"use client";
// components/ledger-export-button.tsx
// Download ledger as xlsx — single product or all products
import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface LedgerExportButtonProps {
  productId?: string;
  brandName?: string;
  ledgerType?: "main" | "pharmacy";
  exportAll?: boolean;
}

export function LedgerExportButton({
  productId,
  brandName,
  ledgerType = "pharmacy",
  exportAll = false,
}: LedgerExportButtonProps) {
  const [loading, setLoading] = useState(false);

  async function handleExport() {
    setLoading(true);
    try {
      const url = exportAll
        ? "/api/ledger-export?type=all"
        : `/api/ledger-export?productId=${productId}&ledger=${ledgerType}`;

      const res = await fetch(url);
      if (!res.ok) throw new Error("Export failed");

      const blob = await res.blob();
      const filename = exportAll
        ? `PharmaTrack-All-Ledgers-${new Date().toISOString().split("T")[0]}.xlsx`
        : `${brandName?.replace(/[^a-zA-Z0-9]/g, "-")}-${ledgerType}-ledger.xlsx`;

      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (err) {
      console.error("Export error:", err);
      alert("Export failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleExport}
      disabled={loading}
      className="gap-1.5"
    >
      {loading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Download className="h-3.5 w-3.5" />
      )}
      {exportAll ? "Export All" : "Export XLSX"}
    </Button>
  );
}