// app/(app)/reports/reports-client.tsx
"use client";
import { useState } from "react";
import { BarChart3, Download, AlertTriangle, TrendingUp, Package } from "lucide-react";
import { DataTable } from "@/components/tables/data-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import { StatCard } from "@/components/cards/stat-card";
import { formatCurrency } from "@/utils/currency";
import { formatDate } from "@/utils/date";

interface StockRow {
  id: string;
  genericName: string;
  brandName: string;
  unit: string;
  quantity: number;
  defaultPrice: number;
  totalValue: number;
  reorderLevel: number;
  isLowStock: boolean;
}

interface ExpiryRow {
  productId: string;
  genericName: string;
  brandName: string;
  batch: string;
  expiry: Date;
  quantity: number;
  daysUntilExpiry: number;
}

interface ReportsClientProps {
  stockReport: { rows: StockRow[]; totalValue: number; lowStockCount: number };
  expiryReport: ExpiryRow[];
}

export function ReportsClient({ stockReport, expiryReport }: ReportsClientProps) {
  const [activeTab, setActiveTab] = useState<"stock" | "expiry">("stock");

  function exportCSV(data: any[], filename: string) {
    if (data.length === 0) return;
    const keys = Object.keys(data[0]);
    const csv = [keys.join(","), ...data.map((row) => keys.map((k) => JSON.stringify(row[k] ?? "")).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const stockColumns = [
    {
      key: "product",
      header: "Product",
      cell: (row: StockRow) => (
        <div>
          <p className="font-medium text-sm">{row.brandName}</p>
          <p className="text-xs text-muted-foreground">{row.genericName}</p>
        </div>
      ),
    },
    {
      key: "qty",
      header: "Quantity",
      cell: (row: StockRow) => (
        <div className="flex items-center gap-1.5">
          <span className="text-sm tabular-nums">{row.quantity.toLocaleString()} {row.unit}</span>
          {row.isLowStock && <Badge variant="warning" className="text-[10px] py-0">Low</Badge>}
        </div>
      ),
    },
    {
      key: "price",
      header: "Unit Price",
      cell: (row: StockRow) => <span className="text-sm tabular-nums">{formatCurrency(row.defaultPrice)}</span>,
      className: "hidden md:table-cell",
    },
    {
      key: "value",
      header: "Stock Value",
      cell: (row: StockRow) => <span className="text-sm font-semibold tabular-nums">{formatCurrency(row.totalValue)}</span>,
    },
  ];

  const expiryColumns = [
    {
      key: "product",
      header: "Product",
      cell: (row: ExpiryRow) => (
        <div>
          <p className="font-medium text-sm">{row.genericName}</p>
          <p className="text-xs text-muted-foreground">{row.brandName}</p>
        </div>
      ),
    },
    {
      key: "batch",
      header: "Batch",
      cell: (row: ExpiryRow) => <span className="text-sm font-mono">{row.batch}</span>,
    },
    {
      key: "expiry",
      header: "Expiry Date",
      cell: (row: ExpiryRow) => (
        <div>
          <p className="text-sm">{formatDate(row.expiry)}</p>
        </div>
      ),
    },
    {
      key: "days",
      header: "Days Left",
      cell: (row: ExpiryRow) => (
        <Badge variant={row.daysUntilExpiry < 0 ? "critical" : row.daysUntilExpiry <= 30 ? "critical" : row.daysUntilExpiry <= 60 ? "warning" : "secondary"} className="tabular-nums">
          {row.daysUntilExpiry < 0 ? "EXPIRED" : `${row.daysUntilExpiry}d`}
        </Badge>
      ),
    },
    {
      key: "qty",
      header: "Qty",
      cell: (row: ExpiryRow) => <span className="text-sm tabular-nums">{row.quantity}</span>,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <BarChart3 className="h-5 w-5 text-primary" />
        <h2 className="text-xl font-semibold">Reports</h2>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard title="Total Stock Value" value={formatCurrency(stockReport.totalValue)} icon={TrendingUp} variant="success" />
        <StatCard title="Low Stock Items" value={stockReport.lowStockCount} icon={AlertTriangle} variant={stockReport.lowStockCount > 0 ? "warning" : "default"} />
        <StatCard title="Expiry Alerts (90d)" value={expiryReport.length} icon={Package} variant={expiryReport.length > 0 ? "warning" : "default"} />
        <StatCard title="Total Products" value={stockReport.rows.length} icon={Package} />
      </div>

      {/* Tabs */}
      <div className="flex border-b gap-0">
        {["stock", "expiry"].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab as any)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors capitalize ${activeTab === tab ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {tab === "stock" ? "Stock Value" : "Expiry Report"}
          </button>
        ))}
      </div>

      {activeTab === "stock" && (
        <DataTable
          data={stockReport.rows}
          columns={stockColumns}
          searchKeys={["genericName", "brandName"]}
          searchPlaceholder="Search products..."
          actions={
            <Button size="sm" variant="outline" onClick={() => exportCSV(stockReport.rows, "stock-report")} className="h-8 gap-1.5">
              <Download className="h-3.5 w-3.5" />Export CSV
            </Button>
          }
        />
      )}

      {activeTab === "expiry" && (
        <DataTable
          data={expiryReport}
          columns={expiryColumns}
          searchKeys={["genericName", "brandName", "batch"]}
          searchPlaceholder="Search..."
          emptyMessage="No items expiring within 90 days"
          actions={
            <Button size="sm" variant="outline" onClick={() => exportCSV(expiryReport, "expiry-report")} className="h-8 gap-1.5">
              <Download className="h-3.5 w-3.5" />Export CSV
            </Button>
          }
        />
      )}
    </div>
  );
}
