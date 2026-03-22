"use client";
// app/(app)/stock/main/stock-main-client.tsx
// Bulk purchase entry — all products pre-loaded in a table.
// Only rows with quantity > 0 are submitted (same as your original app).
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Boxes, AlertTriangle, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { bulkStockInAction } from "@/app/actions/stock";
import { getStockStatus } from "@/utils/stockUtils";

interface Product {
  id: string;
  genericName: string;
  brandName: string;
  unit: string;
  reorderLevel: number;
  defaultPrice: number;
  currentStock: number;
}

interface RowState {
  quantity: string;
  price: string;
  batch: string;
  expiry: string;
  supplier: string;
}

export function StockMainClient({ products }: { products: Product[]; isAdmin: boolean }) {
  const [rows, setRows] = useState<Record<string, RowState>>(() => {
    const init: Record<string, RowState> = {};
    products.forEach((p) => {
      init[p.id] = { quantity: "", price: String(p.defaultPrice), batch: "", expiry: "", supplier: "" };
    });
    return init;
  });

  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [search, setSearch] = useState("");
  const [isPending, startTransition] = useTransition();

  function setField(id: string, field: keyof RowState, value: string) {
    setRows((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  }

  const filledCount = Object.values(rows).filter((r) => parseFloat(r.quantity) > 0).length;

  const filtered = products.filter(
    (p) =>
      p.genericName.toLowerCase().includes(search.toLowerCase()) ||
      p.brandName.toLowerCase().includes(search.toLowerCase())
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const entries = products
      .filter((p) => parseFloat(rows[p.id]?.quantity) > 0)
      .map((p) => ({
        productId: p.id,
        quantity: parseInt(rows[p.id].quantity, 10),
        price: parseFloat(rows[p.id].price) || 0,
        batch: rows[p.id].batch || `BATCH-${date}`,
        expiry: rows[p.id].expiry || null,
        supplier: rows[p.id].supplier || "Unknown",
        reference: date,
      }));

    if (entries.length === 0) {
      toast.error("Enter quantity for at least one product");
      return;
    }

    startTransition(async () => {
      const result = await bulkStockInAction({ entries });
      if (result.success) {
        const d = result.data as any;
        toast.success(`Stock updated: ${d.succeeded} product${d.succeeded !== 1 ? "s" : ""} added`);
        if (d.failed?.length > 0) toast.error(`${d.failed.length} item(s) failed`);
        // Reset only quantity fields, keep prices
        setRows((prev) => {
          const next = { ...prev };
          products.forEach((p) => {
            next[p.id] = { ...next[p.id], quantity: "", batch: "", expiry: "" };
          });
          return next;
        });
      } else {
        toast.error((result as any).error ?? "Failed to add stock");
      }
    });
  }

  const lowCount = products.filter((p) => getStockStatus(p.currentStock, p.reorderLevel) !== "normal").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Boxes className="h-5 w-5 text-primary" />
        <h2 className="text-xl font-semibold">Main Stock — Purchase Entry</h2>
        {lowCount > 0 && (
          <Badge variant="warning" className="gap-1">
            <AlertTriangle className="h-3 w-3" />{lowCount} Low
          </Badge>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        {/* Controls */}
        <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Purchase Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="h-8 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
          </div>
          <div className="flex-1 space-y-1 min-w-[180px]">
            <label className="text-xs font-medium text-muted-foreground">Search</label>
            <input type="text" placeholder="Filter by name…" value={search} onChange={(e) => setSearch(e.target.value)}
              className="h-8 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
          </div>
          <div className="ml-auto flex items-center gap-2">
            {filledCount > 0 && (
              <span className="text-xs text-muted-foreground">{filledCount} item{filledCount !== 1 ? "s" : ""} to submit</span>
            )}
            <Button type="submit" loading={isPending} disabled={filledCount === 0} className="gap-1.5">
              <Save className="h-4 w-4" />Submit Purchase
            </Button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-lg border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase w-8">#</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase">Product</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase w-24">Current</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase w-24">Qty IN</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase w-28 hidden md:table-cell">Unit Price</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase w-28 hidden lg:table-cell">Batch</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase w-32 hidden lg:table-cell">Expiry</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase w-32 hidden xl:table-cell">Supplier</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((product, idx) => {
                  const row = rows[product.id];
                  const hasQty = parseFloat(row?.quantity) > 0;
                  const status = getStockStatus(product.currentStock, product.reorderLevel);
                  return (
                    <tr key={product.id} className={`border-b last:border-0 transition-colors ${hasQty ? "bg-primary/5" : "hover:bg-muted/20"}`}>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{idx + 1}</td>
                      <td className="px-3 py-2">
                        <p className="font-medium text-sm">{product.genericName}</p>
                        <p className="text-xs text-muted-foreground">{product.brandName}</p>
                      </td>
                      <td className="px-3 py-2">
                        <span className={`text-sm font-medium tabular-nums ${status === "out" ? "text-destructive" : status !== "normal" ? "text-warning" : ""}`}>
                          {product.currentStock}
                          <span className="ml-0.5 text-xs text-muted-foreground font-normal">{product.unit}</span>
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <input type="number" min="0" value={row?.quantity ?? ""} placeholder="0"
                          onChange={(e) => setField(product.id, "quantity", e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              const inputs = Array.from(document.querySelectorAll<HTMLInputElement>("input[data-main-qty]"));
                              const i = inputs.indexOf(e.currentTarget as HTMLInputElement);
                              inputs[i + 1]?.focus();
                            }
                          }}
                          data-main-qty
                          className={`h-8 w-20 rounded-md border bg-background px-2 text-sm tabular-nums focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${hasQty ? "border-primary" : "border-input"}`}
                        />
                      </td>
                      <td className="px-3 py-2 hidden md:table-cell">
                        <input type="number" min="0" step="0.01" value={row?.price ?? ""}
                          onChange={(e) => setField(product.id, "price", e.target.value)}
                          className="h-8 w-24 rounded-md border border-input bg-background px-2 text-sm tabular-nums focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
                      </td>
                      <td className="px-3 py-2 hidden lg:table-cell">
                        <input type="text" value={row?.batch ?? ""} placeholder="Batch no."
                          onChange={(e) => setField(product.id, "batch", e.target.value)}
                          className="h-8 w-24 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
                      </td>
                      <td className="px-3 py-2 hidden lg:table-cell">
                        <input type="date" value={row?.expiry ?? ""}
                          onChange={(e) => setField(product.id, "expiry", e.target.value)}
                          className="h-8 w-28 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
                      </td>
                      <td className="px-3 py-2 hidden xl:table-cell">
                        <input type="text" value={row?.supplier ?? ""} placeholder="Supplier"
                          onChange={(e) => setField(product.id, "supplier", e.target.value)}
                          className="h-8 w-28 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Sticky submit bar */}
        {filledCount > 0 && (
          <div className="sticky bottom-4 flex justify-end">
            <div className="rounded-lg border bg-card shadow-lg px-4 py-2 flex items-center gap-3">
              <span className="text-sm text-muted-foreground">{filledCount} product{filledCount !== 1 ? "s" : ""} ready</span>
              <Button type="submit" loading={isPending} className="gap-1.5">
                <Save className="h-4 w-4" />Submit Purchase
              </Button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}