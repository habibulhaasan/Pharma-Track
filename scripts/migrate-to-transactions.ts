// scripts/migrate-to-transactions.ts
// ONE-TIME migration script.
// Reads all existing mainLedger and pharmacyLedger entries
// and writes them to the new transactions/{date}/{type}/ collection.
// Also builds _meta/activeDates.
// Also deletes the activityLog collection.
// SAFE to re-run — checks for existing entries before writing.
//
// Run: npx ts-node --project tsconfig.seed.json scripts/migrate-to-transactions.ts

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, Timestamp, FieldValue } from "firebase-admin/firestore";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

if (!getApps().length) {
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY_BASE64
    ? Buffer.from(process.env.FIREBASE_ADMIN_PRIVATE_KEY_BASE64, "base64").toString("utf-8")
    : process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");

  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID!,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL!,
      privateKey: privateKey!,
    }),
  });
}

const db = getFirestore();

function toDateKey(ts: any): string {
  if (!ts) return new Date().toISOString().split("T")[0];
  const d = ts.toDate ? ts.toDate() : new Date(ts.seconds * 1000);
  return d.toISOString().split("T")[0];
}

// ─── Build product map (id → brandName, genericName, unit) ───────────────
async function buildProductMap() {
  const snap = await db.collection("products").get();
  const map: Record<string, { brandName: string; genericName: string; unit: string }> = {};
  snap.docs.forEach((d) => {
    const data = d.data();
    map[d.id] = {
      brandName: data.brandName ?? "",
      genericName: data.genericName ?? "",
      unit: data.unit ?? "",
    };
  });
  console.log(`  Products loaded: ${Object.keys(map).length}`);
  return map;
}

// ─── Migrate mainLedger entries ───────────────────────────────────────────
async function migrateMainLedger(productMap: Record<string, any>) {
  const mainStockSnap = await db.collection("mainStock").get();
  let stockInCount = 0;
  let transferCount = 0;

  for (const productDoc of mainStockSnap.docs) {
    const productId = productDoc.id;
    const product = productMap[productId] ?? { brandName: productId, genericName: "", unit: "" };

    const ledgerSnap = await productDoc.ref.collection("mainLedger").get();

    for (const ledgerDoc of ledgerSnap.docs) {
      const data = ledgerDoc.data();
      const dateKey = toDateKey(data.timestamp);
      const txType = data.reference === "TRANSFER" ? "transfer" : "stockIn";

      // Check if already migrated
      const txRef = db
        .collection("transactions")
        .doc(dateKey)
        .collection(txType)
        .doc(`migrated_${productId}_${ledgerDoc.id}`);

      const existing = await txRef.get();
      if (existing.exists) continue; // skip if already migrated

      const entry: any = {
        productId,
        brandName: product.brandName,
        genericName: product.genericName,
        unit: product.unit,
        quantity: data.quantity ?? 0,
        batch: data.batch ?? "",
        userId: data.userId ?? "MIGRATION",
        entryDate: dateKey,
        timestamp: data.timestamp ?? Timestamp.now(),
        ledgerCollection: "mainStock",
        ledgerSubCollection: "mainLedger",
        ledgerId: ledgerDoc.id,
        migratedFrom: "mainLedger",
        savedAt: Timestamp.now(),
      };

      if (txType === "stockIn") {
        entry.price = data.price ?? 0;
        entry.supplier = data.supplier ?? "";
        stockInCount++;
      } else {
        entry.notes = data.notes ?? "";
        transferCount++;
      }

      await txRef.set(entry);

      // Update transactions date doc
      await db.collection("transactions").doc(dateKey).set({
        [`has${txType.charAt(0).toUpperCase() + txType.slice(1)}`]: true,
        lastUpdated: FieldValue.serverTimestamp(),
      }, { merge: true });

      // Update _meta
      await db.collection("_meta").doc("activeDates").set({
        allDates: FieldValue.arrayUnion(dateKey),
        [txType === "stockIn" ? "stockInDates" : "transferDates"]: FieldValue.arrayUnion(dateKey),
      }, { merge: true });
    }
  }

  console.log(`  Main ledger: ${stockInCount} stock-in, ${transferCount} transfer entries migrated`);
  return { stockInCount, transferCount };
}

// ─── Migrate pharmacyLedger entries ──────────────────────────────────────
async function migratePharmacyLedger(productMap: Record<string, any>) {
  const pharmSnap = await db.collection("pharmacyStock").get();
  let dispenseCount = 0;
  let skipped = 0;

  for (const productDoc of pharmSnap.docs) {
    const productId = productDoc.id;
    const product = productMap[productId] ?? { brandName: productId, genericName: "", unit: "" };

    const ledgerSnap = await productDoc.ref.collection("pharmacyLedger").get();

    for (const ledgerDoc of ledgerSnap.docs) {
      const data = ledgerDoc.data();

      // Skip pharmacy TRANSFER IN entries — already captured from mainLedger side
      if (data.reference === "TRANSFER" && data.type === "IN") {
        skipped++;
        continue;
      }

      const dateKey = toDateKey(data.timestamp);

      // Check if already migrated
      const txRef = db
        .collection("transactions")
        .doc(dateKey)
        .collection("dispense")
        .doc(`migrated_${productId}_${ledgerDoc.id}`);

      const existing = await txRef.get();
      if (existing.exists) continue;

      await txRef.set({
        productId,
        brandName: product.brandName,
        genericName: product.genericName,
        unit: product.unit,
        quantity: data.quantity ?? 0,
        price: 0,
        patientName: data.patientName ?? "",
        prescriptionNo: data.prescriptionNo ?? "",
        batch: data.batch ?? "",
        userId: data.userId ?? "MIGRATION",
        entryDate: dateKey,
        timestamp: data.timestamp ?? Timestamp.now(),
        ledgerCollection: "pharmacyStock",
        ledgerSubCollection: "pharmacyLedger",
        ledgerId: ledgerDoc.id,
        migratedFrom: "pharmacyLedger",
        savedAt: Timestamp.now(),
      });

      // Update date doc
      await db.collection("transactions").doc(dateKey).set({
        hasDispense: true,
        lastUpdated: FieldValue.serverTimestamp(),
      }, { merge: true });

      // Update _meta
      await db.collection("_meta").doc("activeDates").set({
        allDates: FieldValue.arrayUnion(dateKey),
        dispenseDates: FieldValue.arrayUnion(dateKey),
      }, { merge: true });

      dispenseCount++;
    }
  }

  console.log(`  Pharmacy ledger: ${dispenseCount} dispense entries migrated, ${skipped} transfer-IN skipped`);
  return dispenseCount;
}

// ─── Delete activityLog collection ────────────────────────────────────────
async function deleteActivityLog() {
  const snap = await db.collection("activityLog").get();
  if (snap.empty) {
    console.log("  activityLog already empty");
    return;
  }

  // Check if it uses the new date-based structure
  let totalDeleted = 0;

  for (const doc of snap.docs) {
    // Try deleting sub-entries if date-based
    const subSnap = await doc.ref.collection("entries").get();
    if (!subSnap.empty) {
      for (const subDoc of subSnap.docs) {
        await subDoc.ref.delete();
        totalDeleted++;
      }
    }
    await doc.ref.delete();
    totalDeleted++;
  }

  console.log(`  activityLog: ${totalDeleted} documents deleted`);
}

// ─── Main ─────────────────────────────────────────────────────────────────
async function main() {
  console.log("\n🚀 Starting migration to new transaction structure...\n");
  console.log("📋 Loading products...");
  const productMap = await buildProductMap();

  console.log("\n📥 Migrating Main Ledger (Stock IN + Transfer)...");
  const { stockInCount, transferCount } = await migrateMainLedger(productMap);

  console.log("\n💊 Migrating Pharmacy Ledger (Dispense)...");
  const dispenseCount = await migratePharmacyLedger(productMap);

  console.log("\n🗑️  Deleting activityLog collection...");
  await deleteActivityLog();

  console.log("\n✅ Migration complete!");
  console.log(`   Stock IN entries:  ${stockInCount}`);
  console.log(`   Transfer entries:  ${transferCount}`);
  console.log(`   Dispense entries:  ${dispenseCount}`);
  console.log(`   Total:             ${stockInCount + transferCount + dispenseCount}`);
  console.log("\n   mainLedger and pharmacyLedger are UNTOUCHED ✓");
  console.log("   Stock quantities are UNTOUCHED ✓");
  console.log("   activityLog DELETED ✓");
  console.log("   _meta/activeDates BUILT ✓\n");

  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});