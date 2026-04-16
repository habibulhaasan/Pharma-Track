// app/api/export-backup/route.ts
// Exports entire Firestore database as a structured JSON zip file.
// GET /api/export-backup
// Returns: pharmatrack-backup-{date}.zip
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getAdminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

// Convert Firestore Timestamp to ISO string for JSON serialization
function serializeValue(val: any): any {
  if (val === null || val === undefined) return val;
  if (typeof val === "object" && val.toDate) return { _type: "timestamp", value: val.toDate().toISOString() };
  if (typeof val === "object" && val._seconds !== undefined) return { _type: "timestamp", value: new Date(val._seconds * 1000).toISOString() };
  if (Array.isArray(val)) return val.map(serializeValue);
  if (typeof val === "object") {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(val)) out[k] = serializeValue(v);
    return out;
  }
  return val;
}

function serializeDoc(id: string, data: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = { _id: id };
  for (const [k, v] of Object.entries(data)) out[k] = serializeValue(v);
  return out;
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const db = getAdminDb();
  const backup: Record<string, any> = {
    _exportedAt: new Date().toISOString(),
    _exportedBy: user.id,
    _version: "1.0",
    _description: "PharmaTrack Firestore backup — use import-backup.ts to restore",
  };

  // ── 1. Products ────────────────────────────────────────────────────────
  console.log("Exporting products...");
  const productsSnap = await db.collection("products").get();
  backup.products = productsSnap.docs.map((d) => serializeDoc(d.id, d.data()));

  // ── 2. Main Stock + mainLedger subcollection ───────────────────────────
  console.log("Exporting mainStock...");
  const mainStockSnap = await db.collection("mainStock").get();
  backup.mainStock = [];
  for (const doc of mainStockSnap.docs) {
    const ledgerSnap = await doc.ref.collection("mainLedger").orderBy("timestamp", "asc").get();
    backup.mainStock.push({
      ...serializeDoc(doc.id, doc.data()),
      mainLedger: ledgerSnap.docs.map((d) => serializeDoc(d.id, d.data())),
    });
  }

  // ── 3. Pharmacy Stock + pharmacyLedger subcollection ──────────────────
  console.log("Exporting pharmacyStock...");
  const pharmStockSnap = await db.collection("pharmacyStock").get();
  backup.pharmacyStock = [];
  for (const doc of pharmStockSnap.docs) {
    const ledgerSnap = await doc.ref.collection("pharmacyLedger").orderBy("timestamp", "asc").get();
    backup.pharmacyStock.push({
      ...serializeDoc(doc.id, doc.data()),
      pharmacyLedger: ledgerSnap.docs.map((d) => serializeDoc(d.id, d.data())),
    });
  }

  // ── 4. Transactions collection ─────────────────────────────────────────
  console.log("Exporting transactions...");
  const txDatesSnap = await db.collection("transactions").get();
  backup.transactions = [];
  for (const dateDoc of txDatesSnap.docs) {
    const dateEntry: Record<string, any> = {
      _id: dateDoc.id,
      ...serializeValue(dateDoc.data()),
      stockIn: [],
      transfer: [],
      dispense: [],
    };
    const [stockInSnap, transferSnap, dispenseSnap] = await Promise.all([
      dateDoc.ref.collection("stockIn").get(),
      dateDoc.ref.collection("transfer").get(),
      dateDoc.ref.collection("dispense").get(),
    ]);
    dateEntry.stockIn = stockInSnap.docs.map((d) => serializeDoc(d.id, d.data()));
    dateEntry.transfer = transferSnap.docs.map((d) => serializeDoc(d.id, d.data()));
    dateEntry.dispense = dispenseSnap.docs.map((d) => serializeDoc(d.id, d.data()));
    backup.transactions.push(dateEntry);
  }

  // ── 5. _meta collection ───────────────────────────────────────────────
  console.log("Exporting _meta...");
  const metaSnap = await db.collection("_meta").get();
  backup._meta = metaSnap.docs.map((d) => serializeDoc(d.id, d.data()));

  // ── 6. Users (without sensitive auth data) ────────────────────────────
  console.log("Exporting users...");
  const usersSnap = await db.collection("users").get();
  backup.users = usersSnap.docs.map((d) => {
    const data = d.data();
    // Exclude any sensitive fields
    const { password, ...safe } = data as any;
    return serializeDoc(d.id, safe);
  });

  // ── Serialize to JSON ─────────────────────────────────────────────────
  const json = JSON.stringify(backup, null, 2);
  const jsonBuffer = Buffer.from(json, "utf-8");

  // Stats
  const stats = {
    products: backup.products.length,
    mainStockProducts: backup.mainStock.length,
    mainLedgerEntries: backup.mainStock.reduce((s: number, p: any) => s + (p.mainLedger?.length ?? 0), 0),
    pharmacyStockProducts: backup.pharmacyStock.length,
    pharmacyLedgerEntries: backup.pharmacyStock.reduce((s: number, p: any) => s + (p.pharmacyLedger?.length ?? 0), 0),
    transactionDates: backup.transactions.length,
    totalTransactions: backup.transactions.reduce((s: number, d: any) =>
      s + (d.stockIn?.length ?? 0) + (d.transfer?.length ?? 0) + (d.dispense?.length ?? 0), 0),
    users: backup.users.length,
  };

  console.log("Export complete:", stats);

  const dateStr = new Date().toISOString().split("T")[0];
  const filename = `pharmatrack-backup-${dateStr}.json`;

  return new NextResponse(jsonBuffer, {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "X-Export-Stats": JSON.stringify(stats),
    },
  });
}