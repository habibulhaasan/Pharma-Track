"use client";
// components/forms/product-form-dialog.tsx
import { useTransition, useState, useEffect } from "react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Combobox } from "@/components/ui/combobox";
import { createProductAction, updateProductAction } from "@/app/actions/products";
import { ProductTypeSchema } from "@/schemas/product";
import { GENERICS, COMPANIES, UNITS } from "@/lib/product-data";

const PRODUCT_TYPES = ProductTypeSchema.options;

interface ProductFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product?: any | null;
}

export function ProductFormDialog({ open, onOpenChange, product }: ProductFormDialogProps) {
  const [isPending, startTransition] = useTransition();
  const isEdit = !!product;

  const [brandName, setBrandName]       = useState(product?.brandName ?? "");
  const [genericName, setGenericName]   = useState(product?.genericName ?? "");
  const [type, setType]                 = useState(product?.type ?? "");
  const [company, setCompany]           = useState(product?.company ?? "");
  const [unit, setUnit]                 = useState(product?.unit ?? "piece");
  const [defaultPrice, setDefaultPrice] = useState(String(product?.defaultPrice ?? "0"));
  const [reorderLevel, setReorderLevel] = useState(String(product?.reorderLevel ?? "10"));
  const [errors, setErrors]             = useState<Record<string, string>>({});

  // Sync fields whenever dialog opens or product changes
  useEffect(() => {
    if (open && product) {
      setBrandName(product.brandName ?? "");
      setGenericName(product.genericName ?? "");
      setType(product.type ?? "");
      setCompany(product.company ?? "");
      setUnit(product.unit ?? "piece");
      setDefaultPrice(String(product.defaultPrice ?? "0"));
      setReorderLevel(String(product.reorderLevel ?? "10"));
      setErrors({});
    } else if (open && !product) {
      setBrandName(""); setGenericName(""); setType("");
      setCompany(""); setUnit("piece");
      setDefaultPrice("0"); setReorderLevel("10");
      setErrors({});
    }
  }, [open, product]);

  function handleOpenChange(val: boolean) {
    if (!val) setErrors({});
    onOpenChange(val);
  }

  function validate() {
    const e: Record<string, string> = {};
    if (!brandName.trim())   e.brandName   = "Brand name is required";
    if (!genericName.trim()) e.genericName = "Generic name is required";
    if (!type)               e.type        = "Type is required";
    if (!company.trim())     e.company     = "Company is required";
    if (!unit)               e.unit        = "Unit is required";
    if (isNaN(parseFloat(defaultPrice)) || parseFloat(defaultPrice) < 0)
      e.defaultPrice = "Invalid price";
    if (isNaN(parseInt(reorderLevel)) || parseInt(reorderLevel) < 0)
      e.reorderLevel = "Invalid reorder level";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    const data = {
      brandName:    brandName.trim(),
      genericName:  genericName.trim(),
      type:         type as any,
      company:      company.trim(),
      unit:         unit.trim(),
      defaultPrice: parseFloat(defaultPrice),
      reorderLevel: parseInt(reorderLevel, 10),
    };

    startTransition(async () => {
      const result = isEdit
        ? await updateProductAction({ ...data, productId: product.id })
        : await createProductAction(data);

      if (result.success) {
        toast.success(isEdit ? "Product updated" : "Product created");
        handleOpenChange(false);
      } else {
        toast.error((result as any).error ?? "Something went wrong");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Product" : "Add New Product"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col overflow-hidden">
          <div className="overflow-y-auto px-6 py-4 space-y-4 flex-1 scrollbar-thin">

            <div className="space-y-1.5">
              <Label>Brand Name *</Label>
              <Input
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
                placeholder="Tab. Paracetamol"
                error={errors.brandName}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Generic Name *</Label>
              <Combobox
                options={GENERICS}
                value={genericName}
                onChange={setGenericName}
                placeholder="Search generic name…"
                allowCustom
                error={errors.genericName}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Type *</Label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger className={errors.type ? "border-destructive" : ""}>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {PRODUCT_TYPES.map((t: string) => (
                      <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.type && <p className="text-xs text-destructive">{errors.type}</p>}
              </div>

              <div className="space-y-1.5">
                <Label>Unit *</Label>
                <Select value={unit} onValueChange={setUnit}>
                  <SelectTrigger className={errors.unit ? "border-destructive" : ""}>
                    <SelectValue placeholder="Select unit" />
                  </SelectTrigger>
                  <SelectContent>
                    {UNITS.map((u: string) => (
                      <SelectItem key={u} value={u}>{u}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.unit && <p className="text-xs text-destructive">{errors.unit}</p>}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Company *</Label>
              <Combobox
                options={COMPANIES}
                value={company}
                onChange={setCompany}
                placeholder="Search company…"
                allowCustom
                error={errors.company}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Default Price</Label>
                <Input
                  type="number" step="0.01" min="0"
                  value={defaultPrice}
                  onChange={(e) => setDefaultPrice(e.target.value)}
                  placeholder="0.00"
                  error={errors.defaultPrice}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Reorder Level</Label>
                <Input
                  type="number" min="0"
                  value={reorderLevel}
                  onChange={(e) => setReorderLevel(e.target.value)}
                  placeholder="10"
                  error={errors.reorderLevel}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={isPending}>
              {isEdit ? "Save Changes" : "Create Product"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}