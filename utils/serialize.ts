// utils/serialize.ts
// Strips Firestore Timestamps and class instances from any object,
// converting to plain primitives safe to pass to Client Components.
export function serializeProduct(p: any) {
  return {
    id: p.id,
    genericName: p.genericName ?? "",
    brandName: p.brandName ?? "",
    type: p.type ?? "",
    company: p.company ?? "",
    unit: p.unit ?? "",
    defaultPrice: p.defaultPrice ?? 0,
    reorderLevel: p.reorderLevel ?? 0,
    deleted: p.deleted ?? false,
  };
}