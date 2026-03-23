"use client";
// app/(app)/admin/adjustment-history/adjustment-history-client.tsx
import { useState } from "react";
import { History, TrendingUp, TrendingDown, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface AdjustmentEntry {
  id: string;
  productId: string;
  productName: string;
  stockType: "main" | "pharmacy";
  adjustmentDelta: number;
  beforeQty: number;
  afterQty: number;
  reason: string;
  userId: string;
  timestamp: string | null;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) +
    " " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export function AdjustmentHistoryClient({ entries }: { entries: AdjustmentEntry[] }) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "main" | "pharmacy">("all");
  const [deltaFilter, setDeltaFilter] = useState<"all" | "increase" | "decrease">("all");

  const filtered = entries.filter((e) => {
    if (search && !e.productName.toLowerCase().includes(search.toLowerCase()) &&
        !e.reason.toLowerCase().includes(search.toLowerCase())) return false;
    if (typeFilter !== "all" && e.stockType !== typeFilter) return false;
    if (deltaFilter === "increase" && e.adjustmentDelta <= 0) return false;
    if (deltaFilter === "decrease" && e.adjustmentDelta >= 0) return false;
    return true;
  });

  const totalIncrease = entries.filter((e) => e.adjustmentDelta > 0).reduce((s, e) => s + e.adjustmentDelta, 0);
  const totalDecrease = entries.filter((e) => e.adjustmentDelta < 0).reduce((s, e) => s + Math.abs(e.adjustmentDelta), 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <History className="h-5 w-5 text-primary" />
        <h2 className="text-xl font-semibold">Adjustment History</h2>
        <span className="text-sm text-muted-foreground ml-1">({entries.length} total)</span>
      </div>

      {/* Summary pills */}
      <div className="flex flex-wrap gap-2">
        <div className="flex items-center gap-1.5 rounded-full bg-success/10 border border-success/20 px-3 py-1">
          <TrendingUp className="h-3.5 w-3.5 text-success" />
          <span className="text-xs font-medium text-success">+{totalIncrease.toLocaleString()} added</span>
        </div>
        <div className="flex items-center gap-1.5 rounded-full bg-destructive/10 border border-destructive/20 px-3 py-1">
          <TrendingDown className="h-3.5 w-3.5 text-destructive" />
          <span className="text-xs font-medium text-destructive">−{totalDecrease.toLocaleString()} removed</span>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search product or reason…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
        <div className="flex rounded-md border overflow-hidden text-xs">
          {(["all", "main", "pharmacy"] as const).map((v) => (
            <button key={v} onClick={() => setTypeFilter(v)}
              className={`px-3 py-1.5 font-medium capitalize border-r last:border-0 transition-colors ${typeFilter === v ? "bg-primary text-primary-foreground" : "hover:bg-muted/50"}`}>
              {v === "all" ? "All Stock" : v === "main" ? "Main Stock" : "Pharmacy"}
            </button>
          ))}
        </div>
        <div className="flex rounded-md border overflow-hidden text-xs">
          {(["all", "increase", "decrease"] as const).map((v) => (
            <button key={v} onClick={() => setDeltaFilter(v)}
              className={`px-3 py-1.5 font-medium capitalize border-r last:border-0 transition-colors ${deltaFilter === v ? "bg-primary text-primary-foreground" : "hover:bg-muted/50"}`}>
              {v === "all" ? "All" : v === "increase" ? "+ Increases" : "− Decreases"}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase w-36">Date & Time</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase">Product</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase w-24 hidden sm:table-cell">Stock</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase w-28">Before → After</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase w-20">Change</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase hidden md:table-cell">Reason</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-sm text-muted-foreground">
                    No adjustment records found
                  </td>
                </tr>
              ) : (
                filtered.map((entry) => (
                  <tr key={entry.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="px-3 py-2.5">
                      <p className="text-xs font-medium whitespace-nowrap">{formatDate(entry.timestamp)}</p>
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="text-sm font-medium truncate max-w-[140px] sm:max-w-none">{entry.productName}</p>
                    </td>
                    <td className="px-3 py-2.5 hidden sm:table-cell">
                      <Badge variant={entry.stockType === "main" ? "outline" : "secondary"} className="text-xs capitalize">
                        {entry.stockType === "main" ? "Main" : "Pharmacy"}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className="text-sm tabular-nums text-muted-foreground">{entry.beforeQty}</span>
                      <span className="mx-1 text-muted-foreground">→</span>
                      <span className="text-sm tabular-nums font-medium">{entry.afterQty}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`text-sm font-semibold tabular-nums ${
                        entry.adjustmentDelta > 0 ? "text-success" : entry.adjustmentDelta < 0 ? "text-destructive" : "text-muted-foreground"
                      }`}>
                        {entry.adjustmentDelta > 0 ? `+${entry.adjustmentDelta}` : entry.adjustmentDelta}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 hidden md:table-cell">
                      <p className="text-xs text-muted-foreground max-w-xs truncate" title={entry.reason}>
                        {entry.reason || "—"}
                      </p>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {filtered.length < entries.length && (
        <p className="text-xs text-muted-foreground text-center">
          Showing {filtered.length} of {entries.length} records
        </p>
      )}
    </div>
  );
}