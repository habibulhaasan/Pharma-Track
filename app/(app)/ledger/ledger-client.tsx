"use client";
// app/(app)/ledger/ledger-client.tsx
// Bank-statement style ledger.
// Defaults to CURRENT MONTH — reads ~20-30 docs instead of all-time.
// Left panel: product list. Right: statement with opening/closing balance.
import { useState, useEffect, useCallback } from "react";
import { db } from "@/lib/firebase";
import {
  collection, query, orderBy, getDocs,
  where, Timestamp,
} from "firebase/firestore";
import {
  ClipboardList, Search, TrendingUp, TrendingDown,
  ChevronDown, Download, Loader2,
} from "lucide-react";
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
  dateKey: string;
  sortKey: number;
  in: number;
  out: number;
  balance: number;
  descriptions: string[];
  details: string[];
}

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

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
  const now = new Date();
  const [selected, setSelected] = useState<Product | null>(null);
  const [ledgerType, setLedgerType] = useState<"main" | "pharmacy">("pharmacy");
  // Default to current month/year
  const [month, setMonth] = useState(now.getMonth() + 1); // 1-12
  const [year, setYear] = useState(now.getFullYear());

  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [openingBalance, setOpeningBalance] = useState(0);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);

  // Available years — from 2024 to current year
  const currentYear = now.getFullYear();
  const years = Array.from({ length: currentYear - 2023 }, (_, i) => currentYear - i);

  const fetchLedger = useCallback(async (
    product: Product,
    type: "main" | "pharmacy",
    m: number,
    y: number
  ) => {
    setLoading(true);
    setEntries([]);
    setOpeningBalance(0);

    try {
      const collName = type === "main" ? "mainStock" : "pharmacyStock";
      const subColl = type === "main" ? "mainLedger" : "pharmacyLedger";

      // Start and end of selected month (UTC)
      const startDate = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
      const endDate = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));
      const startTs = Timestamp.fromDate(startDate);
      const endTs = Timestamp.fromDate(endDate);

      // Fetch current month entries
      const monthSnap = await getDocs(
        query(
          collection(db, collName, product.id, subColl),
          where("timestamp", ">=", startTs),
          where("timestamp", "<=", endTs),
          orderBy("timestamp", "asc")
        )
      );
      const monthEntries = monthSnap.docs.map((d) => ({ id: d.id, ...d.data() } as LedgerEntry));
      setEntries(monthEntries);

      // Fetch opening balance — all entries BEFORE this month
      const prevSnap = await getDocs(
        query(
          collection(db, collName, product.id, subColl),
          where("timestamp", "<", startTs),
          orderBy("timestamp", "asc")
        )
      );
      let balance = 0;
      prevSnap.docs.forEach((d) => {
        const data = d.data();
        if (data.type === "IN") balance += data.quantity ?? 0;
        else if (data.type === "OUT") balance -= data.quantity ?? 0;
        else if (data.type === "ADJUSTMENT") balance += data.adjustmentDelta ?? 0;
      });
      setOpeningBalance(balance);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selected) fetchLedger(selected, ledgerType, month, year);
  }, [selected, ledgerType, month, year, fetchLedger]);

  // Build grouped day rows with running balance
  const buildStatement = (): DayRow[] => {
    const dayMap: Record<string, { sortKey: number; in: number; out: number; descriptions: string[]; details: string[] }> = {};

    entries.forEach((e) => {
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

    const sorted = Object.entries(dayMap).sort((a, b) => a[1].sortKey - b[1].sortKey);

    let balance = openingBalance;
    const rows: DayRow[] = [];

    // Opening balance row
    rows.push({
      dateKey: `Opening Balance (${MONTHS[month - 1]} ${year})`,
      sortKey: 0,
      in: 0, out: 0, balance: openingBalance,
      descriptions: ["Opening Balance"], details: [],
    });

    sorted.forEach(([dateKey, day]) => {
      balance += day.in - day.out;
      rows.push({
        dateKey,
        sortKey: day.sortKey,
        in: day.in,
        out: day.out,
        balance,
        descriptions: [...new Set(day.descriptions)],
        details: [...new Set(day.details)],
      });
    });

    return rows;
  };

  const statement = selected ? buildStatement() : [];
  const currentBalance = statement.length > 0 ? statement[statement.length - 1].balance : 0;
  const totalIn = statement.filter((r) => r.dateKey !== `Opening Balance (${MONTHS[month - 1]} ${year})`).reduce((s, r) => s + r.in, 0);
  const totalOut = statement.filter((r) => r.dateKey !== `Opening Balance (${MONTHS[month - 1]} ${year})`).reduce((s, r) => s + r.out, 0);

  const filteredProducts = products.filter(
    (p) =>
      p.genericName.toLowerCase().includes(search.toLowerCase()) ||
      p.brandName.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-4 md:flex-row md:h-[calc(100vh-8rem)] md:overflow-hidden">

      {/* Mobile product dropdown */}
      <div className="md:hidden">
        <button onClick={() => setMobileOpen((v) => !v)}
          className="w-full flex items-center justify-between rounded-lg border bg-card px-4 py-3 text-sm font-medium">
          <span className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-primary" />
            {selected ? `${selected.brandName}` : "Select a product"}
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
              <button key={p.id} onClick={() => { setSelected(p); setMobileOpen(false); }}
                className={`w-full text-left px-4 py-2.5 border-b last:border-0 text-sm transition-colors ${selected?.id === p.id ? "bg-primary text-primary-foreground" : "hover:bg-muted/50"}`}>
                <span className="font-medium">{p.brandName}</span>
                <span className="text-xs ml-1.5 opacity-70">{p.genericName}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Desktop left panel */}
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
            <button key={p.id} onClick={() => setSelected(p)}
              className={`w-full text-left px-3 py-2.5 border-b border-border/50 transition-colors ${selected?.id === p.id ? "bg-primary text-primary-foreground" : "hover:bg-muted/50 text-foreground"}`}>
              <p className="text-xs font-medium truncate">{p.brandName}</p>
              <p className={`text-[10px] truncate ${selected?.id === p.id ? "text-primary-foreground/70" : "text-muted-foreground"}`}>{p.genericName}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Right panel — statement */}
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
                  <h3 className="text-sm font-semibold truncate">{selected.brandName}</h3>
                  <p className="text-xs text-muted-foreground">{selected.genericName} · {selected.unit}</p>
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

                {/* Export buttons */}
                <LedgerExportButton
                  productId={selected.id}
                  brandName={selected.brandName}
                  ledgerType={ledgerType}
                />
              </div>

              {/* Month + Year selectors */}
              <div className="flex flex-wrap items-center gap-2">
                <select value={month} onChange={(e) => setMonth(Number(e.target.value))}
                  className="h-7 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                  {MONTHS.map((m, i) => (
                    <option key={m} value={i + 1}>{m}</option>
                  ))}
                </select>
                <select value={year} onChange={(e) => setYear(Number(e.target.value))}
                  className="h-7 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                  {years.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>

                {/* Summary pills */}
                {!loading && statement.length > 1 && (
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
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : statement.length <= 1 ? (
                <div className="flex flex-col items-center justify-center h-40 gap-2">
                  <p className="text-sm text-muted-foreground">No transactions in {MONTHS[month - 1]} {year}</p>
                  <p className="text-xs text-muted-foreground">Try a different month or year</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-card z-10">
                    <tr className="border-b bg-muted/40">
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase w-32">Date</th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase">Description</th>
                      <th className="px-3 py-2.5 text-right text-xs font-semibold text-success uppercase w-20">IN</th>
                      <th className="px-3 py-2.5 text-right text-xs font-semibold text-destructive uppercase w-20">OUT</th>
                      <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase w-20">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statement.map((row, idx) => (
                      <tr key={idx} className={`border-b last:border-0 hover:bg-muted/20 transition-colors ${idx === 0 ? "bg-muted/30" : ""}`}>
                        <td className="px-3 py-2.5">
                          <p className="text-xs font-medium">{row.dateKey}</p>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex flex-wrap gap-1 mb-0.5">
                            {row.descriptions.map((desc, i) => (
                              <Badge key={i}
                                variant={
                                  desc === "Opening Balance" ? "secondary"
                                  : desc.includes("IN") || desc.includes("Purchase") || desc.includes("Stock IN") ? "success"
                                  : "critical"
                                }
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
                      <td colSpan={2} className="px-3 py-2.5 text-xs font-semibold uppercase text-muted-foreground">
                        Closing Balance — {MONTHS[month - 1]} {year}
                      </td>
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

            {/* Export all button */}
            <div className="border-t p-3 flex justify-end">
              <LedgerExportButton exportAll />
            </div>
          </>
        )}
      </div>
    </div>
  );
}