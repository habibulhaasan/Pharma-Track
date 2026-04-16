"use client";
// components/backup-export-button.tsx
// Admin-only button to download full Firestore backup as JSON.
import { useState } from "react";
import { Download, Loader2, CheckCircle, AlertCircle } from "lucide-react";

export function BackupExportButton() {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [stats, setStats] = useState<string>("");

  async function handleExport() {
    setState("loading");
    setStats("");
    try {
      const res = await fetch("/api/export-backup");
      if (!res.ok) throw new Error("Export failed");

      // Read stats from header
      const statsHeader = res.headers.get("X-Export-Stats");
      if (statsHeader) {
        const s = JSON.parse(statsHeader);
        setStats(
          `${s.products} products · ${s.mainLedgerEntries + s.pharmacyLedgerEntries} ledger entries · ${s.totalTransactions} transactions`
        );
      }

      const blob = await res.blob();
      const dateStr = new Date().toISOString().split("T")[0];
      const filename = `pharmatrack-backup-${dateStr}.json`;

      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
      setState("done");
      setTimeout(() => setState("idle"), 5000);
    } catch (err) {
      console.error(err);
      setState("error");
      setTimeout(() => setState("idle"), 4000);
    }
  }

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div>
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Download className="h-4 w-4 text-primary" />
          Export Full Backup
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          Downloads all Firestore data as a structured JSON file. Use this to back up before
          any major changes or to migrate to a new Firebase project.
        </p>
      </div>

      <div className="rounded-md bg-muted/40 border px-3 py-2 text-xs text-muted-foreground space-y-1">
        <p className="font-medium text-foreground">Includes:</p>
        <p>✓ All products &nbsp; ✓ Stock quantities &nbsp; ✓ Full ledger history</p>
        <p>✓ All transactions &nbsp; ✓ Settings &nbsp; ✓ User accounts</p>
      </div>

      <button
        onClick={handleExport}
        disabled={state === "loading"}
        className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors w-full justify-center ${
          state === "done"
            ? "bg-success/10 text-success border border-success/20"
            : state === "error"
            ? "bg-destructive/10 text-destructive border border-destructive/20"
            : "bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        }`}
      >
        {state === "loading" && <Loader2 className="h-4 w-4 animate-spin" />}
        {state === "done" && <CheckCircle className="h-4 w-4" />}
        {state === "error" && <AlertCircle className="h-4 w-4" />}
        {state === "idle" && <Download className="h-4 w-4" />}
        {state === "loading" ? "Exporting… (may take 30–60s)" :
         state === "done" ? "Downloaded!" :
         state === "error" ? "Export failed — try again" :
         "Download Backup JSON"}
      </button>

      {stats && (
        <p className="text-[10px] text-muted-foreground text-center">{stats}</p>
      )}

      <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
        <p className="font-medium">To restore from backup:</p>
        <code className="block mt-1 font-mono text-[10px] bg-amber-100 dark:bg-amber-900/30 rounded px-2 py-1">
          npx ts-node --project tsconfig.seed.json scripts/import-backup.ts ./pharmatrack-backup-YYYY-MM-DD.json
        </code>
      </div>
    </div>
  );
}