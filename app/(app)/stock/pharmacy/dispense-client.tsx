"use client";
// app/(app)/stock/pharmacy/dispense-client.tsx
// Bulk dispense: all pharmacy products listed.
// Enter qty for items dispensed. Rows with 0 skipped.
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Pill, Save, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { bulkDispenseAction } from "@/app/actions/dispense";

interface Product {
  id: string;
  genericName: string;
  brandName: string;
  unit: string;
  defaultPrice: number;
  reorderLevel: number;
  pharmacyStock: number;
}

export function DispenseClient({ products }: { products: Product[] }) {
  const [quantities, setQuantities] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    products.forEach((p) => (init[p.id] = ""));
    return init;
  });
  const [prices, setPrices] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    products.forEach((p) => (init[p.id] = String(p.defaultPrice)));
    return init;
  });

  const [patientName, setPatientName] = useState("");
  const [prescriptionNo, setPrescriptionNo] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [search, setSearch] = useState("");
  const [isPending, startTransition] = useTransition();

  const toDispense = products.filter((p) => parseFloat(quantities[p.id]) > 0);
  const filledCount = toDispense.length;

  const filtered = products.filter(
    (p) =>
      p.genericName.toLowerCase().includes(search.toLowerCase()) ||
      p.brandName.toLowerCase().includes(search.toLowerCase())
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (filledCount === 0) { toast.error("Enter quantity for at least one medicine"); return; }

    const overStock = toDispense.filter((p) => parseInt(quantities[p.id], 10) > p.pharmacyStock);
    if (overStock.length > 0) {
      toast.error(`Insufficient pharmacy stock: ${overStock.map((p) => p.genericName).join(", ")}`);
      return;
    }

    const items = toDispense.map((p) => ({
      productId: p.id,
      quantity: parseInt(quantities[p.id], 10),
      price: parseFloat(prices[p.id]) || 0,
      batch: "",
    }));

    startTransition(async () => {
      const result = await bulkDispenseAction({ items, patientName, prescriptionNo });
      if (result.success) {
        const d = result.data as any;
        toast.success(`Dispensed: ${d.succeeded} medicine${d.succeeded !== 1 ? "s" : ""}`);
        if (d.failed?.length > 0) toast.error(`${d.failed.length} item(s) failed`);
        setQuantities((prev) => { const n = { ...prev }; products.forEach((p) => (n[p.id] = "")); return n; });
        setPatientName("");
        setPrescriptionNo("");
      } else {
        toast.error((result as any).error ?? "Dispense failed");
      }
    });
  }

  // Grand total
  const grandTotal = toDispense.reduce((sum, p) => {
    return sum + (parseInt(quantities[p.id], 10) || 0) * (parseFloat(prices[p.id]) || 0);
  }, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Pill className="h-5 w-5 text-primary" />
        <h2 className="text-xl font-semibold">Dispense Medicines</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="flex flex-col gap-3 rounded-lg border bg-card p-3 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="h-8 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
          </div>
          <div className="space-y-1 min-w-[150px]">
            <label className="text-xs font-medium text-muted-foreground">Patient Name</label>
            <input type="text" placeholder="Optional" value={patientName} onChange={(e) => setPatientName(e.target.value)}
              className="h-8 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
          </div>
          <div className="space-y-1 min-w-[130px]">
            <label className="text-xs font-medium text-muted-foreground">Prescription No.</label>
            <input type="text" placeholder="Optional" value={prescriptionNo} onChange={(e) => setPrescriptionNo(e.target.value)}
              className="h-8 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
          </div>
          <div className="flex-1 space-y-1 min-w-[160px]">
            <label className="text-xs font-medium text-muted-foreground">Search</label>
            <input type="text" placeholder="Filter medicines…" value={search} onChange={(e) => setSearch(e.target.value)}
              className="h-8 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
          </div>
          <div className="flex items-center justify-between gap-2 sm:ml-auto sm:justify-end">
            {filledCount > 0 && <span className="text-xs text-muted-foreground">{filledCount} item{filledCount !== 1 ? "s" : ""}</span>}
            <Button type="submit" loading={isPending} disabled={filledCount === 0} className="gap-1.5">
              <Save className="h-4 w-4" />Confirm Dispense
            </Button>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase w-8">#</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase">Medicine</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase w-28">In Stock</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase w-24">Qty OUT</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase w-28 hidden md:table-cell">Price</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase w-28 hidden md:table-cell">Total</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((product, idx) => {
                  const qty = parseFloat(quantities[product.id]) || 0;
                  const price = parseFloat(prices[product.id]) || 0;
                  const hasQty = qty > 0;
                  const over = qty > product.pharmacyStock;
                  return (
                    <tr key={product.id} className={`border-b last:border-0 transition-colors ${over ? "bg-destructive/5" : hasQty ? "bg-primary/5" : "hover:bg-muted/20"}`}>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{idx + 1}</td>
                      <td className="px-3 py-2">
                        <p className="font-medium text-sm">{product.brandName}</p>
                        <p className="text-xs text-muted-foreground">{product.genericName}</p>
                      </td>
                      <td className="px-3 py-2">
                        <span className={`text-sm font-medium tabular-nums ${product.pharmacyStock === 0 ? "text-destructive" : product.pharmacyStock <= product.reorderLevel ? "text-warning" : ""}`}>
                          {product.pharmacyStock}<span className="ml-0.5 text-xs text-muted-foreground font-normal">{product.unit}</span>
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <input type="number" min="0" max={product.pharmacyStock} value={quantities[product.id]} placeholder="0"
                          disabled={product.pharmacyStock === 0}
                          onChange={(e) => setQuantities((prev) => ({ ...prev, [product.id]: e.target.value }))}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              const inputs = Array.from(document.querySelectorAll<HTMLInputElement>("input[data-disp-qty]"));
                              const i = inputs.indexOf(e.currentTarget as HTMLInputElement);
                              inputs[i + 1]?.focus();
                            }
                          }}
                          data-disp-qty
                          className={`h-8 w-20 rounded-md border bg-background px-2 text-sm tabular-nums focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-40 ${over ? "border-destructive" : hasQty ? "border-primary" : "border-input"}`}
                        />
                        {over && <p className="text-[10px] text-destructive mt-0.5">Max {product.pharmacyStock}</p>}
                      </td>
                      <td className="px-3 py-2 hidden md:table-cell">
                        <input type="number" min="0" step="0.01" value={prices[product.id]}
                          onChange={(e) => setPrices((prev) => ({ ...prev, [product.id]: e.target.value }))}
                          className="h-8 w-24 rounded-md border border-input bg-background px-2 text-sm tabular-nums focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
                      </td>
                      <td className="px-3 py-2 hidden md:table-cell">
                        <span className="text-sm tabular-nums text-muted-foreground">
                          {hasQty ? (qty * price).toFixed(2) : "—"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={6} className="py-10 text-center text-sm text-muted-foreground">No medicines found.</td></tr>
                )}
              </tbody>
              {/* Grand total row */}
              {filledCount > 0 && (
                <tfoot>
                  <tr className="border-t bg-muted/40">
                    <td colSpan={4} className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground uppercase">Grand Total</td>
                    <td className="px-3 py-2 hidden md:table-cell"></td>
                    <td className="px-3 py-2 hidden md:table-cell">
                      <span className="text-sm font-semibold tabular-nums">{grandTotal.toFixed(2)}</span>
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

        {filledCount > 0 && (
          <div className="sticky bottom-4 flex justify-end">
            <div className="rounded-lg border bg-card shadow-lg px-4 py-2 flex items-center gap-3">
              {patientName && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <User className="h-3 w-3" />{patientName}
                </span>
              )}
              {grandTotal > 0 && (
                <span className="text-xs font-semibold tabular-nums">Total: {grandTotal.toFixed(2)}</span>
              )}
              <Button type="submit" loading={isPending} className="gap-1.5">
                <Save className="h-4 w-4" />Confirm Dispense
              </Button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}