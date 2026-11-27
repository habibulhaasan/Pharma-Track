// services/dailyStockService.ts
import "server-only";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";

export interface DailyStockRow {
  productId: string;
  brandName: string;
  genericName: string;
  unit: string;
  type: string;
  reorderLevel: number;
  // Main stock
  mainBalance: number;
  mainDayIn: number;      // stock-in that day
  mainDayOut: number;     // transferred to pharmacy that day
  // Pharmacy stock
  pharmBalance: number;
  pharmDayIn: number;     // received from main that day
  pharmDayOut: number;    // dispensed that day
}

export async function getDailyStockSnapshot(dateKey: string): Promise<DailyStockRow[]> {
  const db = getAdminDb();
  const [y, m, d] = dateKey.split("-").map(Number);
  const startOfDay = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
  const endOfDay   = new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999));
  const endTs = Timestamp.fromDate(endOfDay);

  const [mainSnap, pharmSnap, productsSnap] = await Promise.all([
    db.collectionGroup("mainLedger").where("timestamp", "<=", endTs).get(),
    db.collectionGroup("pharmacyLedger").where("timestamp", "<=", endTs).get(),
    db.collection("products").where("deleted", "==", false).get(),
  ]);

  const mainBalance: Record<string, number> = {};
  const mainDayIn: Record<string, number> = {};
  const mainDayOut: Record<string, number> = {};

  mainSnap.docs.forEach((doc) => {
    const data = doc.data();
    const productId = doc.ref.parent.parent?.id;
    if (!productId) return;

    let delta = 0;
    if (data.type === "IN") delta = data.quantity ?? 0;
    else if (data.type === "OUT") delta = -(data.quantity ?? 0);
    else if (data.type === "ADJUSTMENT") delta = data.adjustmentDelta ?? 0;

    mainBalance[productId] = (mainBalance[productId] ?? 0) + delta;

    const ts: Date | undefined = data.timestamp?.toDate?.();
    if (ts && ts >= startOfDay && ts <= endOfDay) {
      if (delta > 0) mainDayIn[productId] = (mainDayIn[productId] ?? 0) + delta;
      else if (delta < 0) mainDayOut[productId] = (mainDayOut[productId] ?? 0) + Math.abs(delta);
    }
  });

  const pharmBalance: Record<string, number> = {};
  const pharmDayIn: Record<string, number> = {};
  const pharmDayOut: Record<string, number> = {};

  pharmSnap.docs.forEach((doc) => {
    const data = doc.data();
    const productId = doc.ref.parent.parent?.id;
    if (!productId) return;

    let delta = 0;
    if (data.type === "IN") delta = data.quantity ?? 0;
    else if (data.type === "OUT") delta = -(data.quantity ?? 0);

    pharmBalance[productId] = (pharmBalance[productId] ?? 0) + delta;

    const ts: Date | undefined = data.timestamp?.toDate?.();
    if (ts && ts >= startOfDay && ts <= endOfDay) {
      if (delta > 0) pharmDayIn[productId] = (pharmDayIn[productId] ?? 0) + delta;
      else if (delta < 0) pharmDayOut[productId] = (pharmDayOut[productId] ?? 0) + Math.abs(delta);
    }
  });

  return productsSnap.docs.map((doc) => {
    const data = doc.data();
    const id = doc.id;
    return {
      productId: id,
      brandName: data.brandName ?? "",
      genericName: data.genericName ?? "",
      unit: data.unit ?? "",
      type: data.type ?? "",
      reorderLevel: data.reorderLevel ?? 0,
      mainBalance: mainBalance[id] ?? 0,
      mainDayIn: mainDayIn[id] ?? 0,
      mainDayOut: mainDayOut[id] ?? 0,
      pharmBalance: pharmBalance[id] ?? 0,
      pharmDayIn: pharmDayIn[id] ?? 0,
      pharmDayOut: pharmDayOut[id] ?? 0,
    };
  });
}