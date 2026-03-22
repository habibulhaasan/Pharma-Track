// types/index.ts
// All types use a safe AnyTimestamp alias so this file can be imported
// in both server and client components without pulling in firebase-admin.

export type AnyTimestamp =
  | { toDate: () => Date; seconds: number; nanoseconds: number } // Firestore Timestamp (client or admin)
  | Date
  | string
  | null;

// ─── User ──────────────────────────────────────────────────────────────────
export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: "admin" | "user";
  status: "pending" | "active" | "disabled";
  createdAt: AnyTimestamp;
  lastLoginAt?: AnyTimestamp;
}

// ─── Product ───────────────────────────────────────────────────────────────
export interface Product {
  id: string;
  genericName: string;
  brandName: string;
  type: string;
  company: string;
  unit: string;
  defaultPrice: number;
  reorderLevel: number;
  deleted: boolean;
  createdAt: AnyTimestamp;
  updatedAt: AnyTimestamp;
}

export interface ProductWithStock extends Product {
  mainStock: number;
  pharmacyStock: number;
  isLowStock: boolean;
}

// ─── Stock ─────────────────────────────────────────────────────────────────
export interface StockLevel {
  productId: string;
  quantity: number;
  updatedAt: AnyTimestamp;
}

// ─── Main Ledger ───────────────────────────────────────────────────────────
export interface MainLedgerEntry {
  id: string;
  productId: string;
  type: "IN" | "OUT" | "ADJUSTMENT";
  quantity: number;
  batch: string;
  expiry: AnyTimestamp;
  price: number;
  supplier: string;
  reference: string;
  reason?: string;
  timestamp: AnyTimestamp;
  userId: string;
}

// ─── Pharmacy Ledger ───────────────────────────────────────────────────────
export interface PharmacyLedgerEntry {
  id: string;
  productId: string;
  type: "IN" | "OUT";
  reference: "TRANSFER" | "DISPENSE";
  quantity: number;
  batch: string;
  expiry: AnyTimestamp;
  patientName?: string;
  prescriptionNo?: string;
  timestamp: AnyTimestamp;
  userId: string;
}

// ─── Sale ──────────────────────────────────────────────────────────────────
export interface Sale {
  id: string;
  productId: string;
  quantity: number;
  price: number;
  patientName?: string;
  prescriptionNo?: string;
  timestamp: AnyTimestamp;
  userId: string;
}

// ─── Activity Log ──────────────────────────────────────────────────────────
export interface ActivityLog {
  id: string;
  userId: string;
  action: string;
  productId?: string;
  beforeQty?: number;
  afterQty?: number;
  details?: Record<string, unknown>;
  timestamp: AnyTimestamp;
  ip?: string;
}

// ─── API / Server Action responses ─────────────────────────────────────────
export interface ApiResponse<T = void> {
  success: boolean;
  data?: T;
  error?: string;
  errors?: Record<string, string[]>;
}

// ─── Dashboard ─────────────────────────────────────────────────────────────
export interface DashboardStats {
  totalProducts: number;
  lowStockCount: number;
  todayDispensed: number;
  pendingUsers: number;
  totalMainStockValue: number;
  expiryAlerts: number;
}
