"use client";
// app/(app)/ledger/ledger-client.tsx
import { useState, useEffect, useCallback } from "react";
import { db } from "@/lib/firebase";
import {
  collection, query, orderBy, getDocs,
  where, Timestamp,
} from "firebase/firestore";
import {
  ClipboardList, Search, TrendingUp, TrendingDown,
  ChevronDown, Loader2, FileText, CalendarRange, FileDown,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { LedgerExportButton } from "@/components/ledger-export-button";
import { downloadLedgerPDF } from "@/lib/ledger-pdf";
import { BulkLedgerExportModal } from "@/components/bulk-ledger-export-modal";

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

// "full" means show all-time; otherwise a month number (1-12)
type ViewMode = "full" | number;

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
  const [viewMode, setViewMode] = useState<ViewMode>(now.getMonth() + 1); // default: current month
  const [year, setYear] = useState(now.getFullYear());

  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [openingBalance, setOpeningBalance] = useState(0);
  const [loading, setLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [bulkModal,  setBulkModal]  = useState(false);
  const [search, setSearch] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);

  const currentYear = now.getFullYear();
  const years = Array.from({ length: currentYear - 2023 }, (_, i) => currentYear - i);

  // ── Data fetching ─────────────────────────────────────────────────────────
  const fetchLedger = useCallback(async (
    product: Product,
    type: "main" | "pharmacy",
    mode: ViewMode,
    y: number,
  ) => {
    setLoading(true);
    setEntries([]);
    setOpeningBalance(0);

    try {
      const collName = type === "main" ? "mainStock" : "pharmacyStock";
      const subColl  = type === "main" ? "mainLedger" : "pharmacyLedger";
      const ref = collection(db, collName, product.id, subColl);

      if (mode === "full") {
        // Fetch every entry, sorted ascending
        const snap = await getDocs(query(ref, orderBy("timestamp", "asc")));
        setEntries(snap.docs.map((d) => ({ id: d.id, ...d.data() } as LedgerEntry)));
        setOpeningBalance(0); // full ledger starts from 0
      } else {
        const startDate = new Date(Date.UTC(y, mode - 1, 1, 0, 0, 0));
        const endDate   = new Date(Date.UTC(y, mode, 0, 23, 59, 59, 999));
        const startTs   = Timestamp.fromDate(startDate);
        const endTs     = Timestamp.fromDate(endDate);

        const [monthSnap, prevSnap] = await Promise.all([
          getDocs(query(ref, where("timestamp", ">=", startTs), where("timestamp", "<=", endTs), orderBy("timestamp", "asc"))),
          getDocs(query(ref, where("timestamp", "<", startTs), orderBy("timestamp", "asc"))),
        ]);

        setEntries(monthSnap.docs.map((d) => ({ id: d.id, ...d.data() } as LedgerEntry)));

        let balance = 0;
        prevSnap.docs.forEach((d) => {
          const data = d.data();
          if (data.type === "IN")              balance += data.quantity ?? 0;
          else if (data.type === "OUT")        balance -= data.quantity ?? 0;
          else if (data.type === "ADJUSTMENT") balance += data.adjustmentDelta ?? 0;
        });
        setOpeningBalance(balance);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selected) fetchLedger(selected, ledgerType, viewMode, year);
  }, [selected, ledgerType, viewMode, year, fetchLedger]);

  // ── Statement builder ─────────────────────────────────────────────────────
  const buildStatement = (): DayRow[] => {
    const isFullMode = viewMode === "full";

    if (isFullMode) {
      // Group by month for full-ledger view
      const monthMap: Record<string, { sortKey: number; entries: LedgerEntry[] }> = {};

      entries.forEach((e) => {
        const d = toDate(e.timestamp);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        if (!monthMap[key]) monthMap[key] = { sortKey: new Date(d.getFullYear(), d.getMonth(), 1).getTime(), entries: [] };
        monthMap[key].entries.push(e);
      });

      const sorted = Object.keys(monthMap).sort();
      let runningBal = 0;
      const rows: DayRow[] = [];

      sorted.forEach((key) => {
        const [y, m] = key.split("-").map(Number);
        const label = `${MONTHS[m - 1]} ${y}`;
        const { entries: mEntries } = monthMap[key];

        // Opening for this month
        rows.push({
          dateKey: `Opening Balance (${label})`,
          sortKey: 0,
          in: 0, out: 0, balance: runningBal,
          descriptions: ["Opening Balance"], details: [],
        });

        // Day rows within month
        const dayMap: Record<string, { sortKey: number; in: number; out: number; descriptions: string[]; details: string[] }> = {};
        mEntries.forEach((e) => {
          const d = toDate(e.timestamp);
          const dk = fmtDate(d);
          if (!dayMap[dk]) dayMap[dk] = { sortKey: d.getTime(), in: 0, out: 0, descriptions: [], details: [] };
          const { description, detail } = describeEntry(e, ledgerType);
          const isIn = e.type === "IN";
          const isAdj = e.type === "ADJUSTMENT";
          const delta = isAdj ? (e.adjustmentDelta ?? 0) : isIn ? e.quantity : -e.quantity;
          if (delta > 0) dayMap[dk].in += delta;
          else dayMap[dk].out += Math.abs(delta);
          dayMap[dk].descriptions.push(description);
          if (detail) dayMap[dk].details.push(detail);
        });

        Object.entries(dayMap).sort((a, b) => a[1].sortKey - b[1].sortKey).forEach(([dk, day]) => {
          runningBal += day.in - day.out;
          rows.push({
            dateKey: dk,
            sortKey: day.sortKey,
            in: day.in, out: day.out, balance: runningBal,
            descriptions: [...new Set(day.descriptions)],
            details: [...new Set(day.details)],
          });
        });
      });

      return rows;
    }

    // Monthly mode (original logic)
    const dayMap: Record<string, { sortKey: number; in: number; out: number; descriptions: string[]; details: string[] }> = {};

    entries.forEach((e) => {
      const d = toDate(e.timestamp);
      const dateKey = fmtDate(d);
      if (!dayMap[dateKey]) dayMap[dateKey] = { sortKey: d.getTime(), in: 0, out: 0, descriptions: [], details: [] };
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

    const openingLabel = `Opening Balance (${MONTHS[(viewMode as number) - 1]} ${year})`;
    rows.push({ dateKey: openingLabel, sortKey: 0, in: 0, out: 0, balance: openingBalance, descriptions: ["Opening Balance"], details: [] });

    sorted.forEach(([dateKey, day]) => {
      balance += day.in - day.out;
      rows.push({
        dateKey, sortKey: day.sortKey,
        in: day.in, out: day.out, balance,
        descriptions: [...new Set(day.descriptions)],
        details: [...new Set(day.details)],
      });
    });

    return rows;
  };

  const statement = selected ? buildStatement() : [];
  const isFullMode = viewMode === "full";
  const openingLabel = isFullMode ? "" : `Opening Balance (${MONTHS[(viewMode as number) - 1]} ${year})`;
  const dataRows = statement.filter((r) => !r.descriptions.includes("Opening Balance"));
  const totalIn  = dataRows.reduce((s, r) => s + r.in, 0);
  const totalOut = dataRows.reduce((s, r) => s + r.out, 0);
  const currentBalance = statement.length > 0 ? statement[statement.length - 1].balance : 0;

  // ── PDF download ─────────────────────────────────────────────────────────
  const handleDownloadPDF = async () => {
    if (!selected || statement.length === 0) return;
    setPdfLoading(true);
    try {
      await downloadLedgerPDF({
        productName: selected.brandName,
        genericName: selected.genericName,
        unit: selected.unit,
        ledgerType,
        statement,
        isFullLedger: isFullMode,
        month: isFullMode ? undefined : (viewMode as number),
        year,
      });
    } finally {
      setPdfLoading(false);
    }
  };

  const filteredProducts = products.filter(
    (p) =>
      p.genericName.toLowerCase().includes(search.toLowerCase()) ||
      p.brandName.toLowerCase().includes(search.toLowerCase())
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4 md:flex-row md:h-[calc(100vh-8rem)] md:overflow-hidden">

      {/* Mobile product dropdown */}
      <div className="md:hidden">
        <button onClick={() => setMobileOpen((v) => !v)}
          className="w-full flex items-center justify-between rounded-lg border bg-card px-4 py-3 text-sm font-medium">
          <span className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-primary" />
            {selected ? selected.brandName : "Select a product"}
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

      {/* Right panel */}
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
            {/* ── Header ── */}
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

                {/* PDF download */}
                {statement.length > 1 && (
                  <button
                    onClick={handleDownloadPDF}
                    disabled={pdfLoading}
                    className="flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted/50 transition-colors disabled:opacity-50"
                  >
                    {pdfLoading
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <FileText className="h-3.5 w-3.5 text-primary" />}
                    Download PDF
                  </button>
                )}

                {/* Existing CSV export */}
                <LedgerExportButton
                  productId={selected.id}
                  brandName={selected.brandName}
                  ledgerType={ledgerType}
                />
              </div>

              {/* ── View controls row ── */}
              <div className="flex flex-wrap items-center gap-2">

                {/* Full Ledger toggle */}
                <button
                  onClick={() => setViewMode(isFullMode ? now.getMonth() + 1 : "full")}
                  className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                    isFullMode
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-input bg-background hover:bg-muted/50"
                  }`}
                >
                  <CalendarRange className="h-3.5 w-3.5" />
                  {isFullMode ? "Full Ledger (ON)" : "Full Ledger"}
                </button>

                {/* Month + Year selectors — hidden in full mode */}
                {!isFullMode && (
                  <>
                    <select value={viewMode as number} onChange={(e) => setViewMode(Number(e.target.value))}
                      className="h-7 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                      {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                    </select>
                    <select value={year} onChange={(e) => setYear(Number(e.target.value))}
                      className="h-7 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                      {years.map((y) => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </>
                )}

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

            {/* ── Table ── */}
            <div className="flex-1 overflow-auto scrollbar-thin">
              {loading ? (
                <div className="flex items-center justify-center h-40">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : statement.length <= 1 ? (
                <div className="flex flex-col items-center justify-center h-40 gap-2">
                  <p className="text-sm text-muted-foreground">
                    {isFullMode ? "No transactions found" : `No transactions in ${MONTHS[(viewMode as number) - 1]} ${year}`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {isFullMode ? "This product has no ledger entries yet" : "Try a different month or year"}
                  </p>
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
                    {statement.map((row, idx) => {
                      const isOpening = row.descriptions.includes("Opening Balance");
                      return (
                        <tr key={idx} className={`border-b last:border-0 hover:bg-muted/20 transition-colors ${isOpening ? "bg-muted/30" : ""}`}>
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
                      );
                    })}
                  </tbody>
                  <tfoot className="sticky bottom-0 bg-card">
                    <tr className="border-t-2 border-border bg-muted/40">
                      <td colSpan={2} className="px-3 py-2.5 text-xs font-semibold uppercase text-muted-foreground">
                        {isFullMode ? "All-Time Closing Balance" : `Closing Balance — ${MONTHS[(viewMode as number) - 1]} ${year}`}
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

        {/* Footer export */}
        <div className="border-t p-3 flex items-center justify-between gap-2">
          <button
            onClick={() => setBulkModal(true)}
            className="flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted/50 transition-colors"
          >
            <FileDown className="h-3.5 w-3.5 text-primary" />
            Bulk Ledger PDF
          </button>
          <LedgerExportButton exportAll />
        </div>

      </>
    )}
  </div>

  {/* Bulk export modal — outside the right panel so it overlays everything */}
  {bulkModal && (
    <BulkLedgerExportModal
      products={products}
      ledgerType={ledgerType}
      onClose={() => setBulkModal(false)}
    />
  )}