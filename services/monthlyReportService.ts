// services/monthlyReportService.ts
// Month-by-month aggregation of mainLedger / pharmacyLedger.
// Uses the SAME rules and UTC month boundaries as the Ledger page, so the
// numbers always agree with the Ledger's monthly view:
//   IN → +quantity, OUT → −quantity, ADJUSTMENT → adjustmentDelta
//   (positive adjustment counts as IN, negative as OUT)
import "server-only";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";

export type LedgerKind = "main" | "pharmacy";
export type YearScope = number | "all";

export interface ProductMonthRow {
  year: number;
  month: number;      // 1–12
  opening: number;
  in: number;
  out: number;
  closing: number;
}

export interface MonthlyProductRow {
  productId: string;
  opening: number;
  in: number;
  out: number;
  closing: number;
  remaining: number;  // live stock right now (mainStock / pharmacyStock)
}

const names = (k: LedgerKind) =>
  k === "main"
    ? { stock: "mainStock", ledger: "mainLedger" }
    : { stock: "pharmacyStock", ledger: "pharmacyLedger" };

function delta(d: FirebaseFirestore.DocumentData): number {
  const q = Number(d.quantity ?? 0);
  if (d.type === "IN") return q;
  if (d.type === "OUT") return -q;
  if (d.type === "ADJUSTMENT") return Number(d.adjustmentDelta ?? 0);
  return 0;
}

function tsMillis(ts: any): number {
  if (!ts) return 0;
  if (ts instanceof Timestamp) return ts.toMillis();
  if (ts.toDate) return ts.toDate().getTime();
  return new Date(ts).getTime();
}

/** One product → monthly opening / IN / OUT / closing for a specific year or all months. */
export async function getProductMonthlySeries(
  productId: string,
  kind: LedgerKind,
  year: YearScope
): Promise<ProductMonthRow[]> {
  const db = getAdminDb();
  const { stock, ledger } = names(kind);

  if (year === "all") {
    const snap = await db
      .collection(stock)
      .doc(productId)
      .collection(ledger)
      .select("type", "quantity", "adjustmentDelta", "timestamp")
      .get();

    const now = new Date();
    const curYear = now.getUTCFullYear();
    const curYm = curYear * 12 + now.getUTCMonth();

    let opening = 0;
    let minYm = Infinity;
    let maxYm = -Infinity;
    const ins: Record<number, number> = {};
    const outs: Record<number, number> = {};

    snap.docs.forEach((doc) => {
      const data = doc.data();
      const t = tsMillis(data.timestamp);
      const dl = delta(data);
      if (t <= 0) {
        opening += dl;
      } else {
        const d = new Date(t);
        const ym = d.getUTCFullYear() * 12 + d.getUTCMonth();
        if (ym < minYm) minYm = ym;
        if (ym > maxYm) maxYm = ym;
        if (dl > 0) ins[ym] = (ins[ym] ?? 0) + dl;
        else outs[ym] = (outs[ym] ?? 0) + Math.abs(dl);
      }
    });

    const startYm = minYm === Infinity ? curYear * 12 : minYm;
    const endYm = minYm === Infinity ? curYm : Math.max(maxYm, curYm);

    const rows: ProductMonthRow[] = [];
    let running = opening;
    for (let ym = startYm; ym <= endYm; ym++) {
      const y = Math.floor(ym / 12);
      const m = (ym % 12) + 1;
      const open = running;
      const inQty = ins[ym] ?? 0;
      const outQty = outs[ym] ?? 0;
      running = open + inQty - outQty;
      rows.push({ year: y, month: m, opening: open, in: inQty, out: outQty, closing: running });
    }
    return rows;
  }

  const yearEnd = new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0));

  // Single-field range on a subcollection → no composite index needed
  const snap = await db
    .collection(stock)
    .doc(productId)
    .collection(ledger)
    .where("timestamp", "<", Timestamp.fromDate(yearEnd))
    .get();

  const yearStart = Date.UTC(year, 0, 1);
  let opening = 0;
  const ins = Array(12).fill(0);
  const outs = Array(12).fill(0);

  snap.docs.forEach((doc) => {
    const data = doc.data();
    const t = tsMillis(data.timestamp);
    const dl = delta(data);
    if (t < yearStart) {
      opening += dl;
    } else {
      const m = new Date(t).getUTCMonth();
      if (dl > 0) ins[m] += dl;
      else outs[m] += Math.abs(dl);
    }
  });

  const rows: ProductMonthRow[] = [];
  let running = opening;
  for (let m = 0; m < 12; m++) {
    const open = running;
    running = open + ins[m] - outs[m];
    rows.push({ year, month: m + 1, opening: open, in: ins[m], out: outs[m], closing: running });
  }
  return rows;
}

/** All products → opening / IN / OUT / closing for a single month. */
export async function getMonthlyProductReport(
  kind: LedgerKind,
  year: number,
  month: number // 1–12
): Promise<MonthlyProductRow[]> {
  const db = getAdminDb();
  const { stock, ledger } = names(kind);
  const start = Date.UTC(year, month - 1, 1);
  const end = Date.UTC(year, month, 1); // exclusive

  // One collection-group read instead of N per-product reads.
  // No filter → no collection-group index required.
  const [ledgerSnap, stockSnap] = await Promise.all([
    db.collectionGroup(ledger).select("type", "quantity", "adjustmentDelta", "timestamp").get(),
    db.collection(stock).get(),
  ]);

  const agg: Record<string, { opening: number; in: number; out: number }> = {};

  ledgerSnap.docs.forEach((doc) => {
    // path: {stock}/{productId}/{ledger}/{id}
    const productId = doc.ref.parent.parent?.id;
    if (!productId) return;
    const data = doc.data();
    const t = tsMillis(data.timestamp);
    if (t >= end) return;
    const dl = delta(data);
    const a = (agg[productId] ??= { opening: 0, in: 0, out: 0 });
    if (t < start) a.opening += dl;
    else if (dl > 0) a.in += dl;
    else a.out += Math.abs(dl);
  });

  const live: Record<string, number> = {};
  stockSnap.docs.forEach((d) => (live[d.id] = d.data().quantity ?? 0));

  const ids = new Set([...Object.keys(agg), ...Object.keys(live)]);
  return [...ids].map((productId) => {
    const a = agg[productId] ?? { opening: 0, in: 0, out: 0 };
    return {
      productId,
      opening: a.opening,
      in: a.in,
      out: a.out,
      closing: a.opening + a.in - a.out,
      remaining: live[productId] ?? 0,
    };
  });
}

export interface YearProductRow {
  productId: string;
  months: ProductMonthRow[];
}

/** All products → monthly series each for a specific year or all months. One collection-group read. */
export async function getAllProductsYearReport(
  kind: LedgerKind,
  year: YearScope
): Promise<YearProductRow[]> {
  const db = getAdminDb();
  const { ledger } = names(kind);

  const snap = await db
    .collectionGroup(ledger)
    .select("type", "quantity", "adjustmentDelta", "timestamp")
    .get();

  if (year === "all") {
    const now = new Date();
    const curYear = now.getUTCFullYear();
    const curYm = curYear * 12 + now.getUTCMonth();

    const agg: Record<
      string,
      { opening: number; minYm: number; maxYm: number; ins: Record<number, number>; outs: Record<number, number> }
    > = {};

    snap.docs.forEach((doc) => {
      const productId = doc.ref.parent.parent?.id;
      if (!productId) return;
      const data = doc.data();
      const t = tsMillis(data.timestamp);
      const dl = delta(data);
      const a = (agg[productId] ??= {
        opening: 0,
        minYm: Infinity,
        maxYm: -Infinity,
        ins: {},
        outs: {},
      });
      if (t <= 0) {
        a.opening += dl;
      } else {
        const d = new Date(t);
        const ym = d.getUTCFullYear() * 12 + d.getUTCMonth();
        if (ym < a.minYm) a.minYm = ym;
        if (ym > a.maxYm) a.maxYm = ym;
        if (dl > 0) a.ins[ym] = (a.ins[ym] ?? 0) + dl;
        else a.outs[ym] = (a.outs[ym] ?? 0) + Math.abs(dl);
      }
    });

    return Object.entries(agg).map(([productId, a]) => {
      const startYm = a.minYm === Infinity ? curYear * 12 : a.minYm;
      const endYm = a.minYm === Infinity ? curYm : Math.max(a.maxYm, curYm);
      let running = a.opening;
      const months: ProductMonthRow[] = [];
      for (let ym = startYm; ym <= endYm; ym++) {
        const y = Math.floor(ym / 12);
        const m = (ym % 12) + 1;
        const open = running;
        const inQty = a.ins[ym] ?? 0;
        const outQty = a.outs[ym] ?? 0;
        running = open + inQty - outQty;
        months.push({ year: y, month: m, opening: open, in: inQty, out: outQty, closing: running });
      }
      return { productId, months };
    });
  }

  const yearStart = Date.UTC(year, 0, 1);
  const yearEnd = Date.UTC(year + 1, 0, 1);

  const agg: Record<string, { opening: number; ins: number[]; outs: number[] }> = {};

  snap.docs.forEach((doc) => {
    const productId = doc.ref.parent.parent?.id;
    if (!productId) return;
    const data = doc.data();
    const t = tsMillis(data.timestamp);
    if (t >= yearEnd) return;
    const dl = delta(data);
    const a = (agg[productId] ??= { opening: 0, ins: Array(12).fill(0), outs: Array(12).fill(0) });
    if (t < yearStart) a.opening += dl;
    else {
      const m = new Date(t).getUTCMonth();
      if (dl > 0) a.ins[m] += dl;
      else a.outs[m] += Math.abs(dl);
    }
  });

  return Object.entries(agg).map(([productId, a]) => {
    let running = a.opening;
    const months: ProductMonthRow[] = [];
    for (let m = 0; m < 12; m++) {
      const open = running;
      running = open + a.ins[m] - a.outs[m];
      months.push({ year, month: m + 1, opening: open, in: a.ins[m], out: a.outs[m], closing: running });
    }
    return { productId, months };
  });
}