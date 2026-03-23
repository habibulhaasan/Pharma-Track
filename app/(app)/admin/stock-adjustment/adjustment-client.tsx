// app/(app)/admin/stock-adjustment/adjustment-client.tsx
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Settings, AlertTriangle } from "lucide-react";
import { DataTable } from "@/components/tables/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { adjustStockAction } from "@/app/actions/stock";

interface Product {
  id: string;
  genericName: string;
  brandName: string;
  unit: string;
  mainStock: number;
  pharmacyStock: number;
  reorderLevel: number;
}

export function StockAdjustmentClient({ products }: { products: Product[] }) {
  const [selected, setSelected] = useState<Product | null>(null);
  const [open, setOpen] = useState(false);
  const [stockType, setStockType] = useState<"main" | "pharmacy">("main");
  const [newQty, setNewQty] = useState("");
  const [reason, setReason] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function openAdjust(product: Product) {
    setSelected(product);
    setStockType("main");
    setNewQty(String(product.mainStock));
    setReason("");
    setOpen(true);
  }

  const currentQty = selected
    ? stockType === "main" ? selected.mainStock : selected.pharmacyStock
    : 0;
  const diff = parseInt(newQty, 10) - currentQty;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    startTransition(async () => {
      const result = await adjustStockAction({
        productId: selected.id,
        stockType,
        newQuantity: parseInt(newQty, 10),
        reason,
      });
      if (result.success) {
        const data = result.data as any;
        toast.success(`Stock adjusted: ${data.beforeQty} → ${data.afterQty} ${selected.unit}`);
        setOpen(false);
        router.refresh();
      } else {
        toast.error((result as any).error ?? "Adjustment failed");
      }
    });
  }

  const columns = [
    {
      key: "product",
      header: "Product",
      cell: (row: Product) => (
        <div>
          <p className="font-medium text-sm">{row.genericName}</p>
          <p className="text-xs text-muted-foreground">{row.brandName}</p>
        </div>
      ),
    },
    {
      key: "mainStock",
      header: "Main Stock",
      cell: (row: Product) => <span className="text-sm tabular-nums">{row.mainStock} {row.unit}</span>,
    },
    {
      key: "pharmStock",
      header: "Pharmacy",
      cell: (row: Product) => <span className="text-sm tabular-nums text-muted-foreground">{row.pharmacyStock} {row.unit}</span>,
    },
    {
      key: "actions",
      header: "",
      cell: (row: Product) => (
        <Button size="sm" variant="outline" onClick={() => openAdjust(row)} className="h-7 text-xs gap-1">
          <Settings className="h-3.5 w-3.5" />Adjust
        </Button>
      ),
      className: "w-24",
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Settings className="h-5 w-5 text-primary" />
        <h2 className="text-xl font-semibold">Stock Correction</h2>
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
        <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
        <p>Stock adjustments are admin-only operations and create permanent ledger entries. A mandatory reason is required for every adjustment.</p>
      </div>

      <DataTable
        data={products}
        columns={columns}
        searchKeys={["genericName", "brandName"]}
        searchPlaceholder="Search products..."
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Adjust Stock — {selected?.genericName}</DialogTitle>
            <DialogDescription>This creates a permanent ADJUSTMENT ledger entry.</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="flex flex-col overflow-hidden">
            <div className="overflow-y-auto px-6 py-4 space-y-4 flex-1 scrollbar-thin">
            <div className="space-y-1.5">
              <Label>Stock Type</Label>
              <Select
                value={stockType}
                onValueChange={(v) => {
                  setStockType(v as "main" | "pharmacy");
                  setNewQty(String(v === "main" ? selected?.mainStock : selected?.pharmacyStock));
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="main">Main Stock (current: {selected?.mainStock})</SelectItem>
                  <SelectItem value="pharmacy">Pharmacy Stock (current: {selected?.pharmacyStock})</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>New Quantity *</Label>
              <Input
                type="number" min="0" required
                value={newQty}
                onChange={(e) => setNewQty(e.target.value)}
                placeholder="Enter corrected quantity"
              />
              {newQty && !isNaN(parseInt(newQty)) && (
                <p className={`text-xs font-medium ${diff > 0 ? "text-success" : diff < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                  {diff === 0 ? "No change" : `${diff > 0 ? "+" : ""}${diff} ${selected?.unit}`}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Reason * (min. 10 characters)</Label>
              <Textarea
                required minLength={10} maxLength={500}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Explain why this adjustment is needed (e.g., physical count discrepancy, damaged goods removed)"
                rows={3}
              />
              <p className="text-xs text-muted-foreground text-right">{reason.length}/500</p>
            </div>

            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button
                type="submit"
                loading={isPending}
                variant={diff < 0 ? "destructive" : "default"}
                disabled={!newQty || reason.length < 10}
              >
                Apply Adjustment
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}