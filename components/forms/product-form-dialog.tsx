"use client";
// components/forms/product-form-dialog.tsx
import { useTransition, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createProductAction, updateProductAction } from "@/app/actions/products";
import { CreateProductSchema, ProductTypeSchema, type CreateProductInput } from "@/schemas/product";

const PRODUCT_TYPES = ProductTypeSchema.options;

interface ProductFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product?: any | null;
}

export function ProductFormDialog({ open, onOpenChange, product }: ProductFormDialogProps) {
  const [isPending, startTransition] = useTransition();
  const isEdit = !!product;

  const { register, handleSubmit, setValue, reset, formState: { errors } } = useForm<CreateProductInput>({
    resolver: zodResolver(CreateProductSchema),
    defaultValues: product ?? { reorderLevel: 10, defaultPrice: 0 },
  });

  function onSubmit(data: CreateProductInput) {
    startTransition(async () => {
      const result = isEdit
        ? await updateProductAction({ ...data, productId: product.id })
        : await createProductAction(data);

      if (result.success) {
        toast.success(isEdit ? "Product updated" : "Product created");
        onOpenChange(false);
        reset();
      } else {
        toast.error((result as any).error ?? "Something went wrong");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Product" : "Add New Product"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 px-6 py-4">
          {/* Brand name first, then generic — as requested */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Brand Name *</Label>
              <Input {...register("brandName")} placeholder="Napa" error={errors.brandName?.message} />
            </div>
            <div className="space-y-1.5">
              <Label>Generic Name *</Label>
              <Input {...register("genericName")} placeholder="Paracetamol" error={errors.genericName?.message} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Type *</Label>
              <Select onValueChange={(v) => setValue("type", v as any)} defaultValue={product?.type}>
                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  {PRODUCT_TYPES.map((t) => (
                    <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.type && <p className="text-xs text-destructive">{errors.type.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Unit *</Label>
              <Input {...register("unit")} placeholder="strip, bottle, vial" error={errors.unit?.message} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Company *</Label>
            <Input {...register("company")} placeholder="Square Pharmaceuticals" error={errors.company?.message} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Default Price *</Label>
              <Input
                {...register("defaultPrice", { valueAsNumber: true })}
                type="number" step="0.01" min="0"
                placeholder="0.00"
                error={errors.defaultPrice?.message}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Reorder Level *</Label>
              <Input
                {...register("reorderLevel", { valueAsNumber: true })}
                type="number" min="0"
                placeholder="10"
                error={errors.reorderLevel?.message}
              />
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={isPending}>
              {isEdit ? "Save Changes" : "Create Product"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}