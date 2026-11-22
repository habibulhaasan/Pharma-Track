"use client";
// app/(app)/monthly-report/monthly-report-client.tsx
import { useState, useEffect, useMemo, useTransition } from "react";
import {
  CalendarRange, Boxes, Search, Loader2, Download,
  TrendingUp, TrendingDown, ChevronDown,
} from "lucide-react";
import {
  getProductMonthlySeriesAction,
  getMonthlyProductReportAction,
} from "@/app/actions/monthlyReport";

interface Product {
  id: string;
  genericName: string;
  brandName: string;
  unit: string;
  type: string;
}
interface ProductMonthRow { month: number; opening: number; in: number; out: number; closing: number }
interface MonthlyProductRow {
  productId: string; opening: number; in: number; out: number; closing: number; remaining: number;
}

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

type Mode = "product" | "month";
type Kind = "main" | "pharmacy";

const n = (v: number) => v.toLocaleString();

function downloadCSV(filename: string, rows: (string | number)[][]) {
  const esc = (c: string | number) => `"${String(c).replace(/"/g, '""')}"`;
  const csv = rows.map((r) => r.map(esc).join(",")).join("\r\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export function MonthlyReportClient({ products }: { products: Product[] }) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const years = Array.from({ length: currentYear - 2023 }, (_, i) => currentYear - i);

  const [mode, setMode]     = useState<Mode>("month");
  const [kind, setKind]     = useState<Kind>("pharmacy");
  const [year, setYear]     = useState(currentYear);
  const [month, setMonth]   = useState(now.getMonth() + 1);
  const [selected, setSelected] = useState<Product | null>(null);

  const [series, setSeries]   = useState<ProductMonthRow[]>([]);
  const [report, setReport]   = useState<MonthlyProductRow[]>([]);
  const [error, setError]     = useState("");
  const [loading, startTransition] = useTransition();

  const [search, setSearch]       = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [hideInactive, setHideInactive] = useState(true);

  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  // ── Fetch ──────────────────────────────────────────────────────────────
  useEffect(() => {
    setError("");
    if (mode === "product") {
      if (!selected) { setSeries([]); return; }
      startTransition(async () => {
        const res = await getProductMonthlySeriesAction(selected.id, kind, year);
        if (res.success) setSeries(res.data); else { setSeries([]); setError(res.error); }
      });
    } else {
      startTransition(async () => {
        const res = await getMonthlyProductReportAction(kind, year, month);
        if (res.success) setReport(res.data); else { setReport([]); setError(res.error); }
      });
    }
  }, [mode, kind, year, month, selected]);

  // ── Derived: product-by-months ─────────────────────────────────────────
  const seriesIn  = series.reduce((s, r) => s + r.in, 0);
  const seriesOut = series.reduce((s, r) => s + r.out, 0);
  const seriesClosing = series.length ? series[series.length - 1].closing : 0;
  const seriesOpening = series.length ? series[0].opening : 0;

  // ── Derived: monthly-all-products ──────────────────────────────────────
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    // Keep the products-page ordering; skip ledger entries of deleted products
    return products
      .map((p) => {
        const r = report.find((x) => x.productId === p.id);
        return { product: p, ...(r ?? { opening: 0, in: 0, out: 0, closing: 0, remaining: 0 }) };
      })
      .filter((r) => {
        if (q && !r.product.brandName.toLowerCase().includes(q) && !r.product.genericName.toLowerCase().includes(q)) return false;
        if (hideInactive && r.opening === 0 && r.in === 0 && r.out === 0 && r.closing === 0) return false;
        return true;
      });
  }, [products, report, search, hideInactive]);

  const tot = rows.reduce(
    (a, r) => ({ opening: a.opening + r.opening, in: a.in + r.in, out: a.out + r.out, closing: a.closing + r.closing, remaining: a.remaining + r.remaining }),
    { opening: 0, in: 0, out: 0, closing: 0, remaining: 0 }
  );

  const pickerList = products.filter(
    (p) =>
      p.brandName.toLowerCase().includes(search.toLowerCase()) ||
      p.genericName.toLowerCase().includes(search.toLowerCase())
  );

  // ── CSV ────────────────────────────────────────────────────────────────
  function exportCSV() {
    const label = kind === "main" ? "Main" : "Pharmacy";
    if (mode === "product" && selected) {
      downloadCSV(`${selected.brandName}-${year}-${label}-monthly.csv`, [
        ["Month", "Opening", "IN", "OUT", "Balance"],
        ...series.map((r) => [`${MONTHS[r.month - 1]} ${year}`, r.opening, r.in, r.out, r.closing]),
        ["Total", seriesOpening, seriesIn, seriesOut, seriesClosing],
      ]);
    } else if (mode === "month") {
      downloadCSV(`monthly-report-${year}-${String(month).padStart(2, "0")}-${label}.csv`, [
        ["Brand", "Generic", "Unit", "Opening", "IN", "OUT", "Closing", "Remaining (current)"],
        ...rows.map((r) => [r.product.brandName, r.product.genericName, r.product.unit, r.opening, r.in, r.out, r.closing, r.remaining]),
        ["Total", "", "", tot.opening, tot.in, tot.out, tot.closing, tot.remaining],
      ]);
    }
  }

  const canExport = mode === "month" ? rows.length > 0 : series.length > 0;
  const selectCls =
    "h-8 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div>
        <h1 className="text-lg font-semibold">Monthly Report</h1>
        <p className="text-xs text-muted-foreground">Opening, IN, OUT and closing balance — by month or by product</p>
      </div>

      {/* Controls */}
      <div className="rounded-lg border bg-card p-3 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Mode toggle */}
          <div className="flex rounded-md border overflow-hidden text-xs">
            <button onClick={() => setMode("month")}
              className={`flex items-center gap-1.5 px-3 py-1.5 font-medium transition-colors ${mode === "month" ? "bg-primary text-primary-foreground" : "hover:bg-muted/50"}`}>
              <Boxes className="h-3.5 w-3.5" />Monthly Product Report
            </button>
            <button onClick={() => setMode("product")}
              className={`flex items-center gap-1.5 px-3 py-1.5 font-medium border-l transition-colors ${mode === "product" ? "bg-primary text-primary-foreground" : "hover:bg-muted/50"}`}>
              <CalendarRange className="h-3.5 w-3.5" />Product by Months
            </button>
          </div>

          {/* Stock type */}
          <div className="flex rounded-md border overflow-hidden text-xs">
            <button onClick={() => setKind("pharmacy")}
              className={`px-3 py-1.5 font-medium transition-colors ${kind === "pharmacy" ? "bg-primary text-primary-foreground" : "hover:bg-muted/50"}`}>
              Pharmacy
            </button>
            <button onClick={() => setKind("main")}
              className={`px-3 py-1.5 font-medium border-l transition-colors ${kind === "main" ? "bg-primary text-primary-foreground" : "hover:bg-muted/50"}`}>
              Main Stock
            </button>
          </div>

          {mode === "month" && (
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className={selectCls}>
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          )}
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} className={selectCls}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>

          <button onClick={exportCSV} disabled={!canExport || loading}
            className="ml-auto flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted/50 transition-colors disabled:opacity-50">
            <Download className="h-3.5 w-3.5 text-primary" />CSV
          </button>
        </div>

        {/* Product picker (product mode) */}
        {mode === "product" && (
          <div className="relative max-w-md">
            <button onClick={() => setPickerOpen((v) => !v)}
              className="w-full flex items-center justify-between rounded-md border bg-background px-3 py-2 text-sm">
              <span className={selected ? "font-medium" : "text-muted-foreground"}>
                {selected ? `${selected.brandName} — ${selected.genericName}` : "Select a product"}
              </span>
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${pickerOpen ? "rotate-180" : ""}`} />
            </button>
            {pickerOpen && (
              <div className="absolute z-20 mt-1 w-full rounded-lg border bg-card shadow-lg overflow-hidden">
                <div className="p-2 border-b">
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <input autoFocus type="text" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)}
                      className="h-7 w-full rounded-md border border-input bg-background pl-7 pr-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
                  </div>
                </div>
                <div className="max-h-64 overflow-y-auto scrollbar-thin">
                  {pickerList.length === 0 && <p className="px-3 py-3 text-xs text-muted-foreground">No products found</p>}
                  {pickerList.map((p) => (
                    <button key={p.id}
                      onClick={() => { setSelected(p); setPickerOpen(false); setSearch(""); }}
                      className={`w-full text-left px-3 py-2 border-b last:border-0 text-sm transition-colors ${selected?.id === p.id ? "bg-primary text-primary-foreground" : "hover:bg-muted/50"}`}>
                      <span className="font-medium">{p.brandName}</span>
                      <span className="text-xs ml-1.5 opacity-70">{p.genericName}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Filters (month mode) */}
        {mode === "month" && (
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input type="text" placeholder="Filter products…" value={search} onChange={(e) => setSearch(e.target.value)}
                className="h-8 w-52 rounded-md border border-input bg-background pl-7 pr-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
            </div>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
              <input type="checkbox" checked={hideInactive} onChange={(e) => setHideInactive(e.target.checked)} className="h-3.5 w-3.5" />
              Hide products with no stock or movement
            </label>
          </div>
        )}
      </div>

      {/* Result */}
      <div className="rounded-lg border bg-card overflow-hidden">
        {error ? (
          <p className="p-6 text-sm text-destructive text-center">{error}</p>
        ) : mode === "product" && !selected ? (
          <p className="p-10 text-sm text-muted-foreground text-center">Select a product to see its month-by-month report</p>
        ) : loading ? (
          <div className="flex items-center justify-center h-40"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : mode === "product" ? (
          <>
            <div className="border-b p-3 flex flex-wrap items-center gap-2">
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold truncate">{selected!.brandName}</h3>
                <p className="text-xs text-muted-foreground">
                  {selected!.genericName} · {selected!.unit} · {year} · {kind === "main" ? "Main Stock" : "Pharmacy"}
                </p>
              </div>
              <span className="flex items-center gap-1 rounded-full bg-success/10 border border-success/20 px-2.5 py-0.5 text-[11px] font-medium text-success">
                <TrendingUp className="h-3 w-3" />IN: {n(seriesIn)}
              </span>
              <span className="flex items-center gap-1 rounded-full bg-destructive/10 border border-destructive/20 px-2.5 py-0.5 text-[11px] font-medium text-destructive">
                <TrendingDown className="h-3 w-3" />OUT: {n(seriesOut)}
              </span>
            </div>
            <div className="overflow-auto scrollbar-thin">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr className="border-b">
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase">Month</th>
                    <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase">Opening</th>
                    <th className="px-3 py-2.5 text-right text-xs font-semibold text-success uppercase">IN</th>
                    <th className="px-3 py-2.5 text-right text-xs font-semibold text-destructive uppercase">OUT</th>
                    <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {series.map((r) => {
                    const future = year === currentYear && r.month > now.getMonth() + 1;
                    return (
                      <tr key={r.month} className={`border-b hover:bg-muted/20 transition-colors ${future ? "opacity-40" : ""}`}>
                        <td className="px-3 py-2.5 text-xs font-medium">{MONTHS[r.month - 1]} {year}</td>
                        <td className="px-3 py-2.5 text-right text-xs tabular-nums text-muted-foreground">{n(r.opening)}</td>
                        <td className="px-3 py-2.5 text-right text-xs tabular-nums">
                          {r.in > 0 ? <span className="font-semibold text-success">+{n(r.in)}</span> : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-right text-xs tabular-nums">
                          {r.out > 0 ? <span className="font-semibold text-destructive">−{n(r.out)}</span> : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className={`px-3 py-2.5 text-right text-xs font-bold tabular-nums ${r.closing > 0 ? "" : "text-destructive"}`}>{n(r.closing)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 bg-muted/40">
                    <td className="px-3 py-2.5 text-xs font-semibold uppercase text-muted-foreground">Total {year}</td>
                    <td className="px-3 py-2.5 text-right text-xs font-bold tabular-nums">{n(seriesOpening)}</td>
                    <td className="px-3 py-2.5 text-right text-xs font-bold text-success tabular-nums">+{n(seriesIn)}</td>
                    <td className="px-3 py-2.5 text-right text-xs font-bold text-destructive tabular-nums">−{n(seriesOut)}</td>
                    <td className="px-3 py-2.5 text-right text-sm font-bold text-primary tabular-nums">{n(seriesClosing)} {selected!.unit}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        ) : (
          <>
            <div className="border-b p-3">
              <h3 className="text-sm font-semibold">{MONTHS[month - 1]} {year} — {kind === "main" ? "Main Stock" : "Pharmacy"}</h3>
              <p className="text-xs text-muted-foreground">{rows.length} products</p>
            </div>
            {rows.length === 0 ? (
              <p className="p-10 text-sm text-muted-foreground text-center">No products to show for this month</p>
            ) : (
              <div className="overflow-auto scrollbar-thin max-h-[calc(100vh-22rem)]">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-card z-10">
                    <tr className="border-b bg-muted/40">
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase">Product</th>
                      <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase">Opening</th>
                      <th className="px-3 py-2.5 text-right text-xs font-semibold text-success uppercase">IN</th>
                      <th className="px-3 py-2.5 text-right text-xs font-semibold text-destructive uppercase">OUT</th>
                      <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase">Closing</th>
                      <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase" title="Current live stock">Remaining</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.product.id} className="border-b hover:bg-muted/20 transition-colors">
                        <td className="px-3 py-2">
                          <p className="text-xs font-medium">{r.product.brandName}</p>
                          <p className="text-[10px] text-muted-foreground">{r.product.genericName} · {r.product.unit}</p>
                        </td>
                        <td className="px-3 py-2 text-right text-xs tabular-nums text-muted-foreground">{n(r.opening)}</td>
                        <td className="px-3 py-2 text-right text-xs tabular-nums">
                          {r.in > 0 ? <span className="font-semibold text-success">+{n(r.in)}</span> : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-3 py-2 text-right text-xs tabular-nums">
                          {r.out > 0 ? <span className="font-semibold text-destructive">−{n(r.out)}</span> : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className={`px-3 py-2 text-right text-xs font-bold tabular-nums ${r.closing > 0 ? "" : "text-destructive"}`}>{n(r.closing)}</td>
                        <td className="px-3 py-2 text-right text-xs tabular-nums text-muted-foreground">{n(r.remaining)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="sticky bottom-0 bg-card">
                    <tr className="border-t-2 bg-muted/40">
                      <td className="px-3 py-2.5 text-xs font-semibold uppercase text-muted-foreground">Total (units mixed)</td>
                      <td className="px-3 py-2.5 text-right text-xs font-bold tabular-nums">{n(tot.opening)}</td>
                      <td className="px-3 py-2.5 text-right text-xs font-bold text-success tabular-nums">+{n(tot.in)}</td>
                      <td className="px-3 py-2.5 text-right text-xs font-bold text-destructive tabular-nums">−{n(tot.out)}</td>
                      <td className="px-3 py-2.5 text-right text-xs font-bold tabular-nums">{n(tot.closing)}</td>
                      <td className="px-3 py-2.5 text-right text-xs font-bold tabular-nums">{n(tot.remaining)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}