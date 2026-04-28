"use client";
// components/bulk-ledger-export-modal.tsx
// Date-range picker modal that triggers the bulk compiled ledger PDF download.

import { useState, useCallback } from "react";
import { X, FileDown, Loader2, CalendarDays, CheckCircle2, AlertCircle } from "lucide-react";
import { downloadBulkLedgerPDF } from "@/lib/bulk-ledger-pdf";

interface Product {
  id: string;
  brandName: string;
  genericName: string;
  unit: string;
}

interface Props {
  products: Product[];
  ledgerType: "main" | "pharmacy";
  onClose: () => void;
}

type Status = "idle" | "loading" | "done" | "error";

export function BulkLedgerExportModal({ products, ledgerType, onClose }: Props) {
  const now      = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const today    = now.toISOString().slice(0, 10);

  const [startDate, setStartDate] = useState(firstDay);
  const [endDate,   setEndDate]   = useState(today);
  const [status,    setStatus]    = useState<Status>("idle");
  const [progress,  setProgress]  = useState({ current: 0, total: 0, name: "" });

  const handleExport = useCallback(async () => {
    if (!startDate || !endDate) return;
    setStatus("loading");
    setProgress({ current: 0, total: products.length, name: "" });

    try {
      await downloadBulkLedgerPDF({
        products,
        ledgerType,
        startDate: new Date(startDate + "T00:00:00"),
        endDate:   new Date(endDate   + "T23:59:59"),
        onProgress(current, total, name) {
          setProgress({ current, total, name });
        },
      });
      setStatus("done");
    } catch (e) {
      console.error(e);
      setStatus("error");
    }
  }, [products, ledgerType, startDate, endDate]);

  const pct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative w-full max-w-md rounded-xl border bg-card shadow-2xl mx-4">

        {/* Header */}
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div className="flex items-center gap-2">
            <FileDown className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">Bulk Ledger Export</span>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 hover:bg-muted/60 transition-colors"
            disabled={status === "loading"}
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">

          {/* Info pill */}
          <div className="rounded-lg bg-muted/50 border px-3 py-2.5 text-xs text-muted-foreground flex items-start gap-2">
            <CalendarDays className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-primary" />
            <span>
              Generates a compiled PDF with a <strong className="text-foreground">Table of Contents</strong> followed
              by one section per product — grouped by month. Only products with activity in
              the selected range are included.
            </span>
          </div>

          {/* Stock type indicator */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Stock type:</span>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
              ledgerType === "pharmacy"
                ? "bg-primary/10 text-primary border border-primary/20"
                : "bg-orange-500/10 text-orange-600 border border-orange-500/20"
            }`}>
              {ledgerType === "pharmacy" ? "Pharmacy Stock" : "Main Stock"}
            </span>
            <span className="text-xs text-muted-foreground ml-auto">{products.length} products</span>
          </div>

          {/* Date range */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">From</label>
              <input
                type="date"
                value={startDate}
                max={endDate}
                onChange={(e) => setStartDate(e.target.value)}
                disabled={status === "loading"}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">To</label>
              <input
                type="date"
                value={endDate}
                min={startDate}
                max={today}
                onChange={(e) => setEndDate(e.target.value)}
                disabled={status === "loading"}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
              />
            </div>
          </div>

          {/* Quick range shortcuts */}
          {status === "idle" && (
            <div className="flex flex-wrap gap-1.5">
              {[
                { label: "This month", fn: () => { setStartDate(firstDay); setEndDate(today); } },
                { label: "Last 3 months", fn: () => {
                  const d = new Date(now); d.setMonth(d.getMonth() - 3);
                  setStartDate(new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10));
                  setEndDate(today);
                }},
                { label: "This year", fn: () => {
                  setStartDate(`${now.getFullYear()}-01-01`);
                  setEndDate(today);
                }},
                { label: "Last year", fn: () => {
                  const y = now.getFullYear() - 1;
                  setStartDate(`${y}-01-01`);
                  setEndDate(`${y}-12-31`);
                }},
              ].map(({ label, fn }) => (
                <button key={label} onClick={fn}
                  className="rounded-full border border-input bg-background px-2.5 py-1 text-[11px] hover:bg-muted/50 transition-colors">
                  {label}
                </button>
              ))}
            </div>
          )}

          {/* Progress bar */}
          {status === "loading" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="truncate max-w-[260px]">
                  {progress.name ? `Processing: ${progress.name}` : "Starting…"}
                </span>
                <span className="flex-shrink-0 ml-2">{progress.current}/{progress.total}</span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-300"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="text-[11px] text-muted-foreground text-center">
                Fetching ledger data and building PDF…
              </p>
            </div>
          )}

          {/* Done */}
          {status === "done" && (
            <div className="flex items-center gap-2 rounded-lg bg-success/10 border border-success/20 px-3 py-2.5">
              <CheckCircle2 className="h-4 w-4 text-success flex-shrink-0" />
              <p className="text-xs text-success font-medium">PDF downloaded successfully!</p>
            </div>
          )}

          {/* Error */}
          {status === "error" && (
            <div className="flex items-center gap-2 rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2.5">
              <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0" />
              <p className="text-xs text-destructive">Something went wrong. Please try again.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t px-5 py-3 flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={status === "loading"}
            className="rounded-md border border-input bg-background px-4 py-2 text-xs font-medium hover:bg-muted/50 transition-colors disabled:opacity-50"
          >
            {status === "done" ? "Close" : "Cancel"}
          </button>
          {status !== "done" && (
            <button
              onClick={handleExport}
              disabled={status === "loading" || !startDate || !endDate}
              className="flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-4 py-2 text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {status === "loading"
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating…</>
                : <><FileDown className="h-3.5 w-3.5" /> Generate PDF</>
              }
            </button>
          )}
        </div>
      </div>
    </div>
  );
}