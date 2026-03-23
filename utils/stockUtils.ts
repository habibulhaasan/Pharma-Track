// utils/stockUtils.ts
// Safe for both client and server — no firebase-admin import.
import { toDate } from "./date";

type AnyTimestamp = { toDate: () => Date } | Date | string | null | undefined;

export function isLowStock(quantity: number, reorderLevel: number): boolean {
  return quantity > 0 && quantity <= reorderLevel;
}

export function isCriticalStock(quantity: number, reorderLevel: number): boolean {
  return quantity > 0 && quantity <= Math.floor(reorderLevel * 0.5);
}

export function getStockStatus(
  quantity: number,
  reorderLevel: number
): "out" | "critical" | "low" | "normal" {
  if (quantity <= 0) return "out";
  if (isCriticalStock(quantity, reorderLevel)) return "critical";
  if (isLowStock(quantity, reorderLevel)) return "low";
  return "normal";
}

export function isExpiringSoon(expiry: AnyTimestamp, withinDays = 30): boolean {
  const date = toDate(expiry as any);
  if (!date) return false;
  const msUntilExpiry = date.getTime() - Date.now();
  const daysUntilExpiry = msUntilExpiry / (1000 * 60 * 60 * 24);
  return daysUntilExpiry >= 0 && daysUntilExpiry <= withinDays;
}

export function isExpired(expiry: AnyTimestamp): boolean {
  const date = toDate(expiry as any);
  if (!date) return false;
  return date < new Date();
}

export function calculateStockValue(quantity: number, price: number): number {
  return Math.round(quantity * price * 100) / 100;
}

export function formatQuantity(quantity: number, unit: string): string {
  return `${quantity.toLocaleString()} ${unit}`;
}

// ─── Product sort order: Tablet → Capsule → Syrup → rest ─────────────────
const TYPE_ORDER: Record<string, number> = {
  tablet: 1,
  capsule: 2,
  syrup: 3,
  injection: 4,
  drops: 5,
  cream: 6,
  ointment: 7,
  inhaler: 8,
  patch: 9,
  suppository: 10,
  other: 11,
};

export function sortProducts<T extends { type?: string; brandName?: string; genericName?: string }>(
  products: T[]
): T[] {
  return [...products].sort((a, b) => {
    const orderA = TYPE_ORDER[a.type ?? ""] ?? 99;
    const orderB = TYPE_ORDER[b.type ?? ""] ?? 99;
    if (orderA !== orderB) return orderA - orderB;
    return (a.brandName ?? "").localeCompare(b.brandName ?? "");
  });
}