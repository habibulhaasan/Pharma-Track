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

export interface ProductMonthRow {
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

/** One product → 12 months of opening / IN / OUT / closing for a year. */
export async function getProductMonthlySeries(
  productId: string,
  kind: LedgerKind,
  year: number
): Promise<ProductMonthRow[]> {
  const db = getAdminDb();
  const { stock, ledger } = names(kind);
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
    rows.push({ month: m + 1, opening: open, in: ins[m], out: outs[m], closing: running });
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