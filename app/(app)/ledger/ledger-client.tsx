"use client";
// app/(app)/ledger/ledger-client.tsx
// Bank-statement style. Same date entries are grouped into one row.
// Mobile-first: product selector is a dropdown on mobile, panel on desktop.
// Default: pharmacy stock.
import { useState, useEffect, useCallback } from "react";
import { collection, query, orderBy, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { ClipboardList, Search, TrendingUp, TrendingDown, ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { LedgerExportButton } from "@/components/ledger-export-button";

interface Product {
  id: string;
  genericName: string;
  brandName: string;
  unit: string;
  type: string;
}

interface LedgerEntry {
  id: string;
  type: string;
  reference?: string;
  quantity: number;
  timestamp: any;
  batch?: string;
  price?: number;
  supplier?: string;
  patientName?: string;
  prescriptionNo?: string;
  reason?: string;
  adjustmentDelta?: number;
}

interface DayRow {
  dateKey: string;         // "DD MMM YYYY"
  sortKey: number;         // timestamp ms for sorting
  in: number;
  out: number;
  balance: number;
  descriptions: string[];  // all event descriptions for the day
  details: string[];       // all sub-details for the day
}

function toDate(ts: any): Date {
  if (!ts) return new Date(0);
  if (ts.toDate) return ts.toDate();
  if (ts.seconds) return new Date(ts.seconds * 1000);
  return new Date(ts);
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function describeEntry(e: LedgerEntry, ledgerType: "main" | "pharmacy"): { description: string; detail: string } {
  if (ledgerType === "main") {
    if (e.type === "IN") return {
      description: "Stock IN (Purchase)",
      detail: [e.supplier && `From: ${e.supplier}`, e.batch && `Batch: ${e.batch}`].filter(Boolean).join(" · "),
    };
    if (e.reference === "TRANSFER") return { description: "OUT → Pharmacy", detail: e.batch ? `Batch: ${e.batch}` : "" };
    if (e.type === "ADJUSTMENT") return { description: "Adjustment", detail: e.reason ?? "" };
    return { description: "OUT", detail: "" };
  } else {
    if (e.reference === "TRANSFER") return { description: "IN ← Main Stock", detail: e.batch ? `Batch: ${e.batch}` : "" };
    if (e.reference === "DISPENSE") return {
      description: "Dispensed",
      detail: [e.patientName && `Patient: ${e.patientName}`, e.prescriptionNo && `Rx: ${e.prescriptionNo}`].filter(Boolean).join(" · "),
    };
    if (e.type === "IN") return { description: "Stock IN", detail: "" };
    return { description: "OUT", detail: "" };
  }
}

export function LedgerClient({ products }: { products: Product[] }) {
  const [selected, setSelected] = useState<Product | null>(null);
  // Default to pharmacy
  const [ledgerType, setLedgerType] = useState<"main" | "pharmacy">("pharmacy");
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [monthFilter, setMonthFilter] = useState("");
  const [yearFilter, setYearFilter] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);

  const fetchLedger = useCallback(async (product: Product, type: "main" | "pharmacy") => {
    setLoading(true);
    setEntries([]);
    try {
      const collName = type === "main" ? "mainStock" : "pharmacyStock";
      const subColl = type === "main" ? "mainLedger" : "pharmacyLedger";
      const snap = await getDocs(
        query(collection(db, collName, product.id, subColl), orderBy("timestamp", "asc"))
      );
      setEntries(snap.docs.map((d) => ({ id: d.id, ...d.data() } as LedgerEntry)));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selected) fetchLedger(selected, ledgerType);
  }, [selected, ledgerType, fetchLedger]);

  // ─── Build grouped statement ────────────────────────────────────────────
  const buildStatement = (): DayRow[] => {
    let filtered = entries;

    if (monthFilter || yearFilter) {
      filtered = entries.filter((e) => {
        const d = toDate(e.timestamp);
        if (monthFilter && String(d.getMonth() + 1).padStart(2, "0") !== monthFilter) return false;
        if (yearFilter && String(d.getFullYear()) !== yearFilter) return false;
        return true;
      });
    }

    // Compute opening balance from entries before the filter window
    let openingBalance = 0;
    if (monthFilter || yearFilter) {
      const before = entries.filter((e) => {
        const d = toDate(e.timestamp);
        if (yearFilter && monthFilter) {
          const ey = d.getFullYear(); const em = String(d.getMonth() + 1).padStart(2, "0");
          return ey < parseInt(yearFilter) || (ey === parseInt(yearFilter) && em < monthFilter);
        }
        if (yearFilter) return d.getFullYear() < parseInt(yearFilter);
        if (monthFilter) return String(d.getMonth() + 1).padStart(2, "0") < monthFilter;
        return false;
      });
      before.forEach((e) => {
        if (e.type === "IN") openingBalance += e.quantity;
        else if (e.type === "OUT") openingBalance -= e.quantity;
        else if (e.type === "ADJUSTMENT") openingBalance += e.adjustmentDelta ?? 0;
      });
    }

    // Group by date (DD MMM YYYY)
    const dayMap: Record<string, { sortKey: number; in: number; out: number; descriptions: string[]; details: string[] }> = {};

    filtered.forEach((e) => {
      const d = toDate(e.timestamp);
      const dateKey = fmtDate(d);
      if (!dayMap[dateKey]) {
        dayMap[dateKey] = { sortKey: d.getTime(), in: 0, out: 0, descriptions: [], details: [] };
      }
      const { description, detail } = describeEntry(e, ledgerType);
      const isIn = e.type === "IN";
      const isAdj = e.type === "ADJUSTMENT";
      const delta = isAdj ? (e.adjustmentDelta ?? 0) : isIn ? e.quantity : -e.quantity;

      if (delta > 0) dayMap[dateKey].in += delta;
      else dayMap[dateKey].out += Math.abs(delta);

      dayMap[dateKey].descriptions.push(description);
      if (detail) dayMap[dateKey].details.push(detail);
    });

    // Sort by date
    const sorted = Object.entries(dayMap).sort((a, b) => a[1].sortKey - b[1].sortKey);

    // Apply running balance
    let balance = openingBalance;
    const rows: DayRow[] = [];

    // Opening balance row if filtered
    if (monthFilter || yearFilter) {
      rows.push({
        dateKey: "Opening Balance",
        sortKey: 0,
        in: 0, out: 0,
        balance: openingBalance,
        descriptions: ["Opening Balance"],
        details: [],
      });
    }

    sorted.forEach(([dateKey, day]) => {
      balance += day.in - day.out;
      // Deduplicate descriptions
      const uniqueDescs = [...new Set(day.descriptions)];
      const uniqueDetails = [...new Set(day.details)];
      rows.push({ dateKey, sortKey: day.sortKey, in: day.in, out: day.out, balance, descriptions: uniqueDescs, details: uniqueDetails });
    });

    return rows;
  };

  const statement = selected ? buildStatement() : [];
  const currentBalance = statement.length > 0 ? statement[statement.length - 1].balance : 0;
  const totalIn = statement.reduce((s, r) => s + r.in, 0);
  const totalOut = statement.reduce((s, r) => s + r.out, 0);
  const years = [...new Set(entries.map((e) => String(toDate(e.timestamp).getFullYear())))].sort().reverse();

  const filteredProducts = products.filter(
    (p) =>
      p.genericName.toLowerCase().includes(search.toLowerCase()) ||
      p.brandName.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-4 md:flex-row md:h-[calc(100vh-8rem)] md:overflow-hidden">

      {/* ── Mobile: product dropdown ─────────────────────────── */}
      <div className="md:hidden">
        <button
          onClick={() => setMobileOpen((v) => !v)}
          className="w-full flex items-center justify-between rounded-lg border bg-card px-4 py-3 text-sm font-medium"
        >
          <span className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-primary" />
            {selected ? `${selected.brandName} — ${selected.genericName}` : "Select a product"}
          </span>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${mobileOpen ? "rotate-180" : ""}`} />
        </button>
        {mobileOpen && (
          <div className="mt-1 rounded-lg border bg-card shadow-lg overflow-hidden max-h-56 overflow-y-auto scrollbar-thin">
            <div className="p-2 border-b">
              <input type="text" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)}
                className="h-7 w-full rounded-md border border-input bg-background px-3 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
            </div>
            {filteredProducts.map((p) => (
              <button key={p.id} onClick={() => { setSelected(p); setMobileOpen(false); setMonthFilter(""); setYearFilter(""); }}
                className={`w-full text-left px-4 py-2.5 border-b last:border-0 text-sm transition-colors ${selected?.id === p.id ? "bg-primary text-primary-foreground" : "hover:bg-muted/50"}`}>
                <span className="font-medium">{p.brandName}</span>
                <span className="text-xs ml-1.5 opacity-70">{p.genericName}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Desktop: left product panel ──────────────────────── */}
      <div className="hidden md:flex w-56 flex-shrink-0 flex-col rounded-lg border bg-card overflow-hidden">
        <div className="p-3 border-b">
          <div className="flex items-center gap-1.5 mb-2">
            <ClipboardList className="h-4 w-4 text-primary" />
            <span className="text-xs font-semibold uppercase text-muted-foreground">Products</span>
          </div>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input type="text" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)}
              className="h-7 w-full rounded-md border border-input bg-background pl-7 pr-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {filteredProducts.map((p) => (
            <button key={p.id} onClick={() => { setSelected(p); setMonthFilter(""); setYearFilter(""); }}
              className={`w-full text-left px-3 py-2.5 border-b border-border/50 transition-colors ${selected?.id === p.id ? "bg-primary text-primary-foreground" : "hover:bg-muted/50 text-foreground"}`}>
              <p className="text-xs font-medium truncate">{p.brandName}</p>
              <p className={`text-[10px] truncate ${selected?.id === p.id ? "text-primary-foreground/70" : "text-muted-foreground"}`}>{p.genericName}</p>
            </button>
          ))}
          {filteredProducts.length === 0 && (
            <p className="text-xs text-muted-foreground text-center p-4">No products</p>
          )}
        </div>
      </div>

      {/* ── Right: ledger statement ───────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden rounded-lg border bg-card min-h-[400px]">
        {!selected ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <ClipboardList className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Select a product to view its ledger</p>
            </div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="border-b p-3 space-y-2 flex-shrink-0">
              <div className="flex flex-wrap items-center gap-2">
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold truncate">{selected.brandName} — {selected.genericName}</h3>
                  <p className="text-xs text-muted-foreground">{selected.unit}</p>
                </div>
                {/* Stock type toggle */}
                <div className="flex rounded-md border overflow-hidden text-xs flex-shrink-0">
                  <button onClick={() => setLedgerType("pharmacy")}
                    className={`px-3 py-1.5 font-medium transition-colors ${ledgerType === "pharmacy" ? "bg-primary text-primary-foreground" : "hover:bg-muted/50"}`}>
                    Pharmacy
                  </button>
                  <button onClick={() => setLedgerType("main")}
                    className={`px-3 py-1.5 font-medium transition-colors border-l ${ledgerType === "main" ? "bg-primary text-primary-foreground" : "hover:bg-muted/50"}`}>
                    Main Stock
                  </button>

                </div>
                <LedgerExportButton productId={selected.id} brandName={selected.brandName} ledgerType={ledgerType} />

                  <LedgerExportButton exportAll />
              </div>

              {/* Filters */}
              <div className="flex flex-wrap items-center gap-2">
                <select value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)}
                  className="h-7 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                  <option value="">All Months</option>
                  {["01","02","03","04","05","06","07","08","09","10","11","12"].map((m, i) => (
                    <option key={m} value={m}>{new Date(2000, i).toLocaleString("en", { month: "long" })}</option>
                  ))}
                </select>
                <select value={yearFilter} onChange={(e) => setYearFilter(e.target.value)}
                  className="h-7 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                  <option value="">All Years</option>
                  {years.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>

                {/* Summary pills */}
                {statement.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 ml-auto">
                    <span className="flex items-center gap-1 rounded-full bg-success/10 border border-success/20 px-2.5 py-0.5 text-[11px] font-medium text-success">
                      <TrendingUp className="h-3 w-3" />IN: {totalIn.toLocaleString()}
                    </span>
                    <span className="flex items-center gap-1 rounded-full bg-destructive/10 border border-destructive/20 px-2.5 py-0.5 text-[11px] font-medium text-destructive">
                      <TrendingDown className="h-3 w-3" />OUT: {totalOut.toLocaleString()}
                    </span>
                    <span className={`flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${currentBalance > 0 ? "bg-primary/10 border-primary/20 text-primary" : "bg-muted border-border text-muted-foreground"}`}>
                      Bal: {currentBalance.toLocaleString()} {selected.unit}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-auto scrollbar-thin">
              {loading ? (
                <div className="flex items-center justify-center h-40">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                </div>
              ) : statement.length === 0 ? (
                <div className="flex items-center justify-center h-40">
                  <p className="text-sm text-muted-foreground">No transactions found</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-card z-10">
                    <tr className="border-b bg-muted/40">
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase w-28">Date</th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase">Description</th>
                      <th className="px-3 py-2.5 text-right text-xs font-semibold text-success uppercase w-20">IN</th>
                      <th className="px-3 py-2.5 text-right text-xs font-semibold text-destructive uppercase w-20">OUT</th>
                      <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase w-20">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statement.map((row, idx) => (
                      <tr key={idx} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                        <td className="px-3 py-2.5">
                          <p className="text-xs font-medium">{row.dateKey}</p>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex flex-wrap gap-1 mb-0.5">
                            {row.descriptions.map((desc, i) => (
                              <Badge key={i}
                                variant={desc.includes("IN") || desc.includes("Purchase") || desc.includes("Stock IN") ? "success" : desc === "Opening Balance" ? "secondary" : "critical"}
                                className="text-[10px] py-0 px-1.5">
                                {desc}
                              </Badge>
                            ))}
                          </div>
                          {row.details.length > 0 && (
                            <p className="text-[10px] text-muted-foreground">{row.details.join(" · ")}</p>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          {row.in > 0
                            ? <span className="text-xs font-semibold text-success tabular-nums">+{row.in.toLocaleString()}</span>
                            : <span className="text-xs text-muted-foreground">—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          {row.out > 0
                            ? <span className="text-xs font-semibold text-destructive tabular-nums">−{row.out.toLocaleString()}</span>
                            : <span className="text-xs text-muted-foreground">—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <span className={`text-xs font-bold tabular-nums ${row.balance > 0 ? "text-foreground" : "text-destructive"}`}>
                            {row.balance.toLocaleString()}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="sticky bottom-0 bg-card">
                    <tr className="border-t-2 border-border bg-muted/40">
                      <td colSpan={2} className="px-3 py-2.5 text-xs font-semibold uppercase text-muted-foreground">Closing Balance</td>
                      <td className="px-3 py-2.5 text-right">
                        <span className="text-xs font-bold text-success tabular-nums">+{totalIn.toLocaleString()}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <span className="text-xs font-bold text-destructive tabular-nums">−{totalOut.toLocaleString()}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <span className={`text-sm font-bold tabular-nums ${currentBalance > 0 ? "text-primary" : "text-destructive"}`}>
                          {currentBalance.toLocaleString()} {selected.unit}
                        </span>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}