"use client";
// app/(app)/daily-stock/daily-stock-client.tsx
import { useState, useEffect } from "react";
import { CalendarDays, Boxes, Pill, Loader2 } from "lucide-react";
import { CalendarPicker } from "@/components/ui/calendar-picker";
import { DataTable } from "@/components/tables/data-table";
import { Badge } from "@/components/ui/badge";
import { getDailyStockSnapshotAction } from "@/app/actions/dailyStock";

interface Row {
  productId: string;
  brandName: string;
  genericName: string;
  unit: string;
  type: string;
  reorderLevel: number;
  mainBalance: number;
  mainDayIn: number;
  mainDayOut: number;
  pharmBalance: number;
  pharmDayIn: number;
  pharmDayOut: number;
}

const TYPE_ORDER: Record<string, number> = {
  tablet: 1, capsule: 2, syrup: 3, injection: 4,
  drops: 5, cream: 6, ointment: 7, inhaler: 8,
  patch: 9, suppository: 10, other: 11,
};

function fmtDate(ds: string) {
  return new Date(ds + "T00:00:00").toLocaleDateString("en-GB", {
    day: "2-digit", month: "long", year: "numeric",
  });
}

export function DailyStockClient({ activeDates }: { activeDates: string[] }) {
  const [selectedDate, setSelectedDate] = useState(activeDates[0] ?? "");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!selectedDate) return;
    setLoading(true);
    getDailyStockSnapshotAction(selectedDate).then((res) => {
      if (res.success) {
        const data = (res.data as Row[]).sort((a, b) => {
          const oa = TYPE_ORDER[a.type] ?? 99;
          const ob = TYPE_ORDER[b.type] ?? 99;
          if (oa !== ob) return oa - ob;
          return a.brandName.localeCompare(b.brandName);
        });
        setRows(data);
      } else {
        setRows([]);
      }
      setLoading(false);
    });
  }, [selectedDate]);

  const filtered = rows.filter(
    (r) =>
      r.brandName.toLowerCase().includes(search.toLowerCase()) ||
      r.genericName.toLowerCase().includes(search.toLowerCase())
  );

  const totalMainOut = filtered.reduce((s, r) => s + r.mainDayOut, 0);
  const totalPharmOut = filtered.reduce((s, r) => s + r.pharmDayOut, 0);

  const columns = [
    {
      key: "product",
      header: "Product",
      cell: (row: Row) => (
        <div>
          <p className="font-medium text-sm">{row.brandName}</p>
          <p className="text-xs text-muted-foreground">{row.genericName}</p>
        </div>
      ),
    },
    {
      key: "mainBalance",
      header: "Main — Closing",
      cell: (row: Row) => (
        <span className="text-sm font-semibold tabular-nums">
          {row.mainBalance.toLocaleString()}
          <span className="ml-0.5 text-xs text-muted-foreground font-normal">{row.unit}</span>
        </span>
      ),
    },
    {
      key: "mainMoved",
      header: "Main — IN / OUT (day)",
      cell: (row: Row) => (
        <div className="flex gap-1.5">
          {row.mainDayIn > 0 && (
            <span className="text-xs font-medium text-success tabular-nums">+{row.mainDayIn.toLocaleString()}</span>
          )}
          {row.mainDayOut > 0 && (
            <span className="text-xs font-medium text-destructive tabular-nums">−{row.mainDayOut.toLocaleString()}</span>
          )}
          {row.mainDayIn === 0 && row.mainDayOut === 0 && <span className="text-xs text-muted-foreground">—</span>}
        </div>
      ),
      className: "hidden sm:table-cell",
    },
    {
      key: "pharmBalance",
      header: "Pharmacy — Closing",
      cell: (row: Row) => (
        <span className="text-sm font-semibold tabular-nums">
          {row.pharmBalance.toLocaleString()}
          <span className="ml-0.5 text-xs text-muted-foreground font-normal">{row.unit}</span>
        </span>
      ),
    },
    {
      key: "pharmMoved",
      header: "Pharmacy — Received / Dispensed",
      cell: (row: Row) => (
        <div className="flex gap-1.5">
          {row.pharmDayIn > 0 && (
            <span className="text-xs font-medium text-success tabular-nums">+{row.pharmDayIn.toLocaleString()}</span>
          )}
          {row.pharmDayOut > 0 && (
            <Badge variant="critical" className="text-[10px] py-0">
              Dispensed {row.pharmDayOut.toLocaleString()}
            </Badge>
          )}
          {row.pharmDayIn === 0 && row.pharmDayOut === 0 && <span className="text-xs text-muted-foreground">—</span>}
        </div>
      ),
      className: "hidden md:table-cell",
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <CalendarDays className="h-5 w-5 text-primary" />
        <h2 className="text-xl font-semibold">Daily Stock — Closing Balance</h2>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        {/* Calendar */}
        <div className="space-y-3 lg:w-64 lg:flex-shrink-0">
          <CalendarPicker activeDates={activeDates} selected={selectedDate} onSelect={setSelectedDate} />
          {selectedDate && (
            <p className="text-xs text-center text-muted-foreground">
              Closing stock as of: <span className="font-medium text-foreground">{fmtDate(selectedDate)}</span>
            </p>
          )}
        </div>

        {/* Results */}
        <div className="flex-1 space-y-3 min-w-0">
          {rows.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <span className="flex items-center gap-1.5 rounded-full bg-primary/10 border border-primary/20 px-3 py-1 text-xs font-medium text-primary">
                <Boxes className="h-3.5 w-3.5" />Transferred out today: {totalMainOut.toLocaleString()}
              </span>
              <span className="flex items-center gap-1.5 rounded-full bg-destructive/10 border border-destructive/20 px-3 py-1 text-xs font-medium text-destructive">
                <Pill className="h-3.5 w-3.5" />Dispensed today: {totalPharmOut.toLocaleString()}
              </span>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : !selectedDate ? (
            <div className="rounded-lg border bg-card py-20 text-center text-sm text-muted-foreground">
              Select a date from the calendar
            </div>
          ) : (
            <DataTable
              data={filtered}
              columns={columns}
              searchable={false}
              emptyMessage="No products found"
              actions={
                <input
                  type="text"
                  placeholder="Search products…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-8 w-56 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}