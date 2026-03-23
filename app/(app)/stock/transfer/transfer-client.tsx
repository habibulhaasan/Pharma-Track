"use client";
// app/(app)/stock/transfer/transfer-client.tsx
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ArrowLeftRight, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { transferAction } from "@/app/actions/transfer";

interface Product {
  id: string;
  genericName: string;
  brandName: string;
  unit: string;
  reorderLevel: number;
  mainStock: number;
  pharmacyStock: number;
}

export function TransferClient({ products }: { products: Product[] }) {
  const [quantities, setQuantities] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    products.forEach((p) => (init[p.id] = ""));
    return init;
  });
  const [batches, setBatches] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    products.forEach((p) => (init[p.id] = ""));
    return init;
  });

  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [search, setSearch] = useState("");
  const [isPending, startTransition] = useTransition();

  const toTransfer = products.filter((p) => parseFloat(quantities[p.id]) > 0);
  const filledCount = toTransfer.length;

  const filtered = products.filter(
    (p) =>
      p.brandName.toLowerCase().includes(search.toLowerCase()) ||
      p.genericName.toLowerCase().includes(search.toLowerCase())
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (filledCount === 0) { toast.error("Enter quantity for at least one product"); return; }

    const overStock = toTransfer.filter((p) => parseInt(quantities[p.id], 10) > p.mainStock);
    if (overStock.length > 0) {
      toast.error(`Insufficient main stock: ${overStock.map((p) => p.brandName).join(", ")}`);
      return;
    }

    startTransition(async () => {
      let succeeded = 0;
      const failed: string[] = [];
      for (const product of toTransfer) {
        const result = await transferAction({
          productId: product.id,
          quantity: parseInt(quantities[product.id], 10),
          batch: batches[product.id] || `TRF-${date}`,
          expiry: null,
          notes: `Transfer ${date}`,
        });
        if (result.success) succeeded++;
        else failed.push(product.brandName);
      }
      if (succeeded > 0) toast.success(`Transferred ${succeeded} product${succeeded !== 1 ? "s" : ""} to pharmacy`);
      if (failed.length > 0) toast.error(`Failed: ${failed.join(", ")}`);
      setQuantities((prev) => { const n = { ...prev }; products.forEach((p) => (n[p.id] = "")); return n; });
      setBatches((prev) => { const n = { ...prev }; products.forEach((p) => (n[p.id] = "")); return n; });
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ArrowLeftRight className="h-5 w-5 text-primary" />
        <h2 className="text-xl font-semibold">Transfer — Main → Pharmacy</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="flex flex-col gap-3 rounded-lg border bg-card p-3 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="h-8 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
          </div>
          <div className="flex-1 space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Search</label>
            <input type="text" placeholder="Filter products…" value={search} onChange={(e) => setSearch(e.target.value)}
              className="h-8 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
          </div>
          <div className="flex items-center justify-between gap-2 sm:ml-auto sm:justify-end">
            {filledCount > 0 && <span className="text-xs text-muted-foreground">{filledCount} item{filledCount !== 1 ? "s" : ""}</span>}
            <Button type="submit" loading={isPending} disabled={filledCount === 0} className="gap-1.5">
              <Save className="h-4 w-4" />Transfer
            </Button>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="px-2 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase w-6">#</th>
                  <th className="px-2 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase">Product</th>
                  <th className="px-2 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase w-16">Main</th>
                  <th className="px-2 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase w-16 hidden sm:table-cell">Pharm.</th>
                  <th className="px-2 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase w-16">Qty</th>
                  <th className="px-2 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase w-24 hidden md:table-cell">Batch</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((product, idx) => {
                  const qty = parseFloat(quantities[product.id]) || 0;
                  const hasQty = qty > 0;
                  const over = qty > product.mainStock;
                  return (
                    <tr key={product.id} className={`border-b last:border-0 transition-colors ${over ? "bg-destructive/5" : hasQty ? "bg-primary/5" : "hover:bg-muted/20"}`}>
                      <td className="px-2 py-2 text-xs text-muted-foreground">{idx + 1}</td>
                      <td className="px-2 py-2 max-w-[120px] sm:max-w-none">
                        <p className="font-medium text-xs sm:text-sm truncate">{product.brandName}</p>
                        <p className="hidden sm:block text-xs text-muted-foreground truncate">{product.genericName}</p>
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap">
                        <span className={`text-xs font-medium tabular-nums ${product.mainStock === 0 ? "text-destructive" : ""}`}>
                          {product.mainStock}
                          <span className="ml-0.5 text-muted-foreground font-normal text-[10px]">{product.unit}</span>
                        </span>
                      </td>
                      <td className="px-2 py-2 hidden sm:table-cell whitespace-nowrap">
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {product.pharmacyStock} <span className="text-[10px]">{product.unit}</span>
                        </span>
                      </td>
                      <td className="px-2 py-2">
                        <input type="number" min="0" max={product.mainStock} value={quantities[product.id]} placeholder="0"
                          disabled={product.mainStock === 0}
                          onChange={(e) => setQuantities((prev) => ({ ...prev, [product.id]: e.target.value }))}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              const inputs = Array.from(document.querySelectorAll<HTMLInputElement>("input[data-trf-qty]"));
                              const i = inputs.indexOf(e.currentTarget as HTMLInputElement);
                              inputs[i + 1]?.focus();
                            }
                          }}
                          data-trf-qty
                          className={`h-8 w-14 sm:w-20 rounded-md border bg-background px-2 text-xs sm:text-sm tabular-nums focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-40 ${over ? "border-destructive" : hasQty ? "border-primary" : "border-input"}`}
                        />
                        {over && <p className="text-[10px] text-destructive mt-0.5">Max {product.mainStock}</p>}
                      </td>
                      <td className="px-2 py-2 hidden md:table-cell">
                        <input type="text" value={batches[product.id]} placeholder="Batch no."
                          onChange={(e) => setBatches((prev) => ({ ...prev, [product.id]: e.target.value }))}
                          className="h-8 w-24 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={6} className="py-10 text-center text-sm text-muted-foreground">No products found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {filledCount > 0 && (
          <div className="sticky bottom-4 flex justify-end">
            <div className="rounded-lg border bg-card shadow-lg px-4 py-2 flex items-center gap-3">
              <span className="text-sm text-muted-foreground">{filledCount} item{filledCount !== 1 ? "s" : ""} to transfer</span>
              <Button type="submit" loading={isPending} className="gap-1.5">
                <Save className="h-4 w-4" />Confirm Transfer
              </Button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}