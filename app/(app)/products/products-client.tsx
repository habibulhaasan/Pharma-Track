"use client";
// app/(app)/products/products-client.tsx
import { useState, useTransition, useRef } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Package, Upload, Download, X } from "lucide-react";
import { DataTable } from "@/components/tables/data-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StockBadge } from "@/components/cards/stock-badge";
import { ProductFormDialog } from "@/components/forms/product-form-dialog";
import { ConfirmDialog } from "@/components/modals/confirm-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { deleteProductAction, createProductAction } from "@/app/actions/products";
import { formatCurrency } from "@/utils/currency";

interface Product {
  id: string;
  genericName: string;
  brandName: string;
  type: string;
  company: string;
  unit: string;
  defaultPrice: number;
  reorderLevel: number;
  mainStock: number;
  pharmacyStock: number;
}

interface ProductsClientPageProps {
  products: Product[];
  isAdmin: boolean;
}

// ─── CSV/JSON Template ─────────────────────────────────────────────────────
const CSV_TEMPLATE = `brandName,genericName,type,company,unit,defaultPrice,reorderLevel
Napa,Paracetamol,tablet,Beximco Pharma,strip,10,50
Moxacil,Amoxicillin,capsule,Square Pharma,strip,35,30`;

export function ProductsClientPage({ products, isAdmin }: ProductsClientPageProps) {
  const [formOpen, setFormOpen] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importData, setImportData] = useState<any[]>([]);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();
  const [isImporting, startImporting] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  function handleEdit(product: Product) {
    setEditProduct(product);
    setFormOpen(true);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const result = await deleteProductAction({ productId: deleteTarget.id });
    if (result.success) toast.success(`${deleteTarget.genericName} removed`);
    else toast.error((result as any).error);
    setDeleteTarget(null);
  }

  // ─── CSV/JSON Import ───────────────────────────────────────────────────
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      try {
        if (file.name.endsWith(".json")) {
          const parsed = JSON.parse(text);
          const arr = Array.isArray(parsed) ? parsed : [parsed];
          validateAndSetImport(arr);
        } else {
          // CSV parse
          const lines = text.trim().split(/\r?\n/);
          const headers = lines[0].split(",").map((h) => h.trim());
          const rows = lines.slice(1).map((line) => {
            const vals = line.split(",").map((v) => v.trim());
            const obj: any = {};
            headers.forEach((h, i) => (obj[h] = vals[i] ?? ""));
            return obj;
          });
          validateAndSetImport(rows);
        }
      } catch {
        setImportErrors(["Failed to parse file. Check the format."]);
        setImportData([]);
      }
    };
    reader.readAsText(file);
    e.target.value = ""; // reset input
  }

  const REQUIRED = ["brandName", "genericName", "type", "company", "unit"];
  const VALID_TYPES = ["tablet","capsule","syrup","injection","cream","ointment","drops","inhaler","patch","suppository","other"];

  function validateAndSetImport(rows: any[]) {
    const errors: string[] = [];
    const valid: any[] = [];

    rows.forEach((row, i) => {
      const line = i + 2; // 1-indexed with header
      const missing = REQUIRED.filter((k) => !row[k]);
      if (missing.length) {
        errors.push(`Row ${line}: missing ${missing.join(", ")}`);
        return;
      }
      if (!VALID_TYPES.includes(row.type?.toLowerCase())) {
        errors.push(`Row ${line}: invalid type "${row.type}". Must be one of: ${VALID_TYPES.join(", ")}`);
        return;
      }
      valid.push({
        brandName: String(row.brandName).trim(),
        genericName: String(row.genericName).trim(),
        type: String(row.type).toLowerCase().trim(),
        company: String(row.company).trim(),
        unit: String(row.unit).trim(),
        defaultPrice: parseFloat(row.defaultPrice) || 0,
        reorderLevel: parseInt(row.reorderLevel, 10) || 10,
      });
    });

    setImportErrors(errors);
    setImportData(valid);
    if (valid.length > 0) setImportOpen(true);
  }

  function handleImportConfirm() {
    startImporting(async () => {
      let succeeded = 0;
      const failed: string[] = [];

      for (const row of importData) {
        const result = await createProductAction(row);
        if (result.success) succeeded++;
        else failed.push(row.brandName);
      }

      if (succeeded > 0) toast.success(`Imported ${succeeded} product${succeeded !== 1 ? "s" : ""}`);
      if (failed.length > 0) toast.error(`Failed: ${failed.join(", ")}`);
      setImportOpen(false);
      setImportData([]);
    });
  }

  function downloadTemplate() {
    const blob = new Blob([CSV_TEMPLATE], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "products-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  // ─── Table columns — Brand first, then Generic ─────────────────────────
  const columns = [
    {
      key: "name",
      header: "Brand / Generic",
      cell: (row: Product) => (
        <div>
          <p className="font-medium text-sm">{row.brandName}</p>
          {/* Mobile: show product ID. Desktop: show generic name */}
          <p className="text-xs text-muted-foreground sm:hidden font-mono">{row.id}</p>
          <p className="hidden sm:block text-xs text-muted-foreground">{row.genericName}</p>
        </div>
      ),
    },
    {
      key: "type",
      header: "Type",
      cell: (row: Product) => (
        <Badge variant="outline" className="text-xs capitalize">{row.type}</Badge>
      ),
      className: "hidden sm:table-cell",
    },
    {
      key: "company",
      header: "Company",
      cell: (row: Product) => <span className="text-sm text-muted-foreground">{row.company}</span>,
      className: "hidden lg:table-cell",
    },
    {
      key: "mainStock",
      header: "Main Stock",
      cell: (row: Product) => (
        <StockBadge quantity={row.mainStock} reorderLevel={row.reorderLevel} unit={row.unit} />
      ),
    },
    {
      key: "pharmStock",
      header: "Pharmacy",
      cell: (row: Product) => (
        <span className="text-sm tabular-nums">
          {row.pharmacyStock.toLocaleString()}
          <span className="ml-0.5 text-xs text-muted-foreground">{row.unit}</span>
        </span>
      ),
      className: "hidden md:table-cell",
    },
    {
      key: "price",
      header: "Price",
      cell: (row: Product) => (
        <span className="text-sm tabular-nums">{formatCurrency(row.defaultPrice)}</span>
      ),
      className: "hidden lg:table-cell",
    },
    ...(isAdmin ? [{
      key: "actions",
      header: "",
      cell: (row: Product) => (
        <div className="flex items-center gap-1 justify-end">
          <Button variant="ghost" size="icon-sm" onClick={() => handleEdit(row)}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => setDeleteTarget(row)}
            className="hover:text-destructive">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
      className: "w-20",
    }] : []),
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Package className="h-5 w-5 text-primary" />
        <h2 className="text-xl font-semibold">Products</h2>
        <span className="text-sm text-muted-foreground ml-1">({products.length})</span>
        {isAdmin && (
          <div className="ml-auto flex items-center gap-2">
            {/* Hidden file input */}
            <input ref={fileRef} type="file" accept=".csv,.json" className="hidden" onChange={handleFileChange} />
            <Button size="sm" variant="outline" onClick={downloadTemplate} className="gap-1.5 hidden sm:flex">
              <Download className="h-4 w-4" />Template
            </Button>
            <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} className="gap-1.5">
              <Upload className="h-4 w-4" />Bulk Import
            </Button>
            <Button size="sm" onClick={() => { setEditProduct(null); setFormOpen(true); }} className="gap-1.5">
              <Plus className="h-4 w-4" />Add Product
            </Button>
          </div>
        )}
      </div>

      {/* Import errors */}
      {importErrors.length > 0 && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive space-y-1">
          <p className="font-semibold">Import validation errors:</p>
          {importErrors.map((e, i) => <p key={i}>• {e}</p>)}
        </div>
      )}

      <DataTable
        data={products}
        columns={columns}
        searchKeys={["brandName", "genericName", "company", "id"]}
        searchPlaceholder="Search products…"
        emptyMessage="No products found"
      />

      {isAdmin && (
        <>
          <ProductFormDialog
            open={formOpen}
            onOpenChange={(open) => { setFormOpen(open); if (!open) setEditProduct(null); }}
            product={editProduct}
          />
          <ConfirmDialog
            open={!!deleteTarget}
            onOpenChange={(open) => !open && setDeleteTarget(null)}
            title="Remove Product"
            description={`Remove "${deleteTarget?.brandName} (${deleteTarget?.genericName})"? History is preserved.`}
            confirmLabel="Remove"
            variant="destructive"
            onConfirm={confirmDelete}
          />

          {/* Bulk import preview dialog */}
          <Dialog open={importOpen} onOpenChange={setImportOpen}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Confirm Import — {importData.length} product{importData.length !== 1 ? "s" : ""}</DialogTitle>
              </DialogHeader>
              <div className="px-6 py-2 max-h-80 overflow-y-auto scrollbar-thin">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b">
                      <th className="py-1.5 text-left text-muted-foreground font-medium">Brand</th>
                      <th className="py-1.5 text-left text-muted-foreground font-medium">Generic</th>
                      <th className="py-1.5 text-left text-muted-foreground font-medium">Type</th>
                      <th className="py-1.5 text-left text-muted-foreground font-medium">Company</th>
                      <th className="py-1.5 text-left text-muted-foreground font-medium">Unit</th>
                      <th className="py-1.5 text-right text-muted-foreground font-medium">Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importData.map((row, i) => (
                      <tr key={i} className="border-b last:border-0 hover:bg-muted/20">
                        <td className="py-1.5 font-medium">{row.brandName}</td>
                        <td className="py-1.5 text-muted-foreground">{row.genericName}</td>
                        <td className="py-1.5 capitalize">{row.type}</td>
                        <td className="py-1.5 text-muted-foreground">{row.company}</td>
                        <td className="py-1.5">{row.unit}</td>
                        <td className="py-1.5 text-right tabular-nums">{row.defaultPrice}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <DialogFooter className="px-6 pb-4">
                <Button variant="outline" onClick={() => { setImportOpen(false); setImportData([]); }}>
                  Cancel
                </Button>
                <Button loading={isImporting} onClick={handleImportConfirm}>
                  Import {importData.length} Products
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}