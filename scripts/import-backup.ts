// scripts/import-backup.ts
// Restores a PharmaTrack JSON backup to Firestore.
// SAFE: uses merge by default — won't overwrite existing docs unless --force flag used.
//
// Usage:
//   npx ts-node --project tsconfig.seed.json scripts/import-backup.ts ./pharmatrack-backup-2025-03-31.json
//   npx ts-node --project tsconfig.seed.json scripts/import-backup.ts ./backup.json --force
//   npx ts-node --project tsconfig.seed.json scripts/import-backup.ts ./backup.json --only=products,transactions

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, Timestamp, FieldValue } from "firebase-admin/firestore";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

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

// Parse CLI args
const args = process.argv.slice(2);
const backupFile = args.find((a) => !a.startsWith("--"));
const force = args.includes("--force");
const onlyFlag = args.find((a) => a.startsWith("--only="));
const onlyCollections = onlyFlag ? onlyFlag.replace("--only=", "").split(",") : null;

if (!backupFile) {
  console.error("❌ Usage: npx ts-node scripts/import-backup.ts <backup.json> [--force] [--only=products,transactions]");
  process.exit(1);
}

// Restore a Firestore timestamp from the serialized format
function deserializeValue(val: any): any {
  if (val === null || val === undefined) return val;
  if (typeof val === "object" && val._type === "timestamp") {
    return Timestamp.fromDate(new Date(val.value));
  }
  if (Array.isArray(val)) return val.map(deserializeValue);
  if (typeof val === "object") {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(val)) {
      if (k === "_id") continue; // skip meta field
      out[k] = deserializeValue(v);
    }
    return out;
  }
  return val;
}

// Write docs in batches of 400 (Firestore limit is 500)
async function batchWrite(
  writes: Array<{ ref: FirebaseFirestore.DocumentReference; data: Record<string, any> }>,
  merge: boolean = true
) {
  const BATCH_SIZE = 400;
  let written = 0;

  for (let i = 0; i < writes.length; i += BATCH_SIZE) {
    const chunk = writes.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    for (const { ref, data } of chunk) {
      if (merge) batch.set(ref, data, { merge: true });
      else batch.set(ref, data);
    }
    await batch.commit();
    written += chunk.length;
    process.stdout.write(`\r  Written: ${written}/${writes.length}`);
  }
  console.log();
}

function shouldImport(collection: string): boolean {
  if (!onlyCollections) return true;
  return onlyCollections.includes(collection);
}

async function importProducts(data: any[]) {
  if (!shouldImport("products")) { console.log("  Skipping products"); return; }
  console.log(`\n📦 Importing ${data.length} products...`);

  const writes = data.map((doc) => ({
    ref: db.collection("products").doc(doc._id),
    data: deserializeValue(doc),
  }));
  await batchWrite(writes, !force);
  console.log(`  ✅ Products done`);
}

async function importMainStock(data: any[]) {
  if (!shouldImport("mainStock")) { console.log("  Skipping mainStock"); return; }
  console.log(`\n📦 Importing mainStock (${data.length} products)...`);

  let ledgerTotal = 0;
  for (const doc of data) {
    const { mainLedger, _id, ...stockData } = doc;

    // Write stock document
    await db.collection("mainStock").doc(_id).set(deserializeValue(stockData), { merge: !force });

    // Write ledger subcollection
    if (mainLedger?.length > 0) {
      const writes = (mainLedger as any[]).map((entry) => ({
        ref: db.collection("mainStock").doc(_id).collection("mainLedger").doc(entry._id),
        data: deserializeValue(entry),
      }));
      await batchWrite(writes, !force);
      ledgerTotal += writes.length;
    }
  }
  console.log(`  ✅ mainStock done — ${ledgerTotal} ledger entries`);
}

async function importPharmacyStock(data: any[]) {
  if (!shouldImport("pharmacyStock")) { console.log("  Skipping pharmacyStock"); return; }
  console.log(`\n💊 Importing pharmacyStock (${data.length} products)...`);

  let ledgerTotal = 0;
  for (const doc of data) {
    const { pharmacyLedger, _id, ...stockData } = doc;

    await db.collection("pharmacyStock").doc(_id).set(deserializeValue(stockData), { merge: !force });

    if (pharmacyLedger?.length > 0) {
      const writes = (pharmacyLedger as any[]).map((entry) => ({
        ref: db.collection("pharmacyStock").doc(_id).collection("pharmacyLedger").doc(entry._id),
        data: deserializeValue(entry),
      }));
      await batchWrite(writes, !force);
      ledgerTotal += writes.length;
    }
  }
  console.log(`  ✅ pharmacyStock done — ${ledgerTotal} ledger entries`);
}

async function importTransactions(data: any[]) {
  if (!shouldImport("transactions")) { console.log("  Skipping transactions"); return; }
  console.log(`\n📋 Importing transactions (${data.length} dates)...`);

  let total = 0;
  for (const dateDoc of data) {
    const { stockIn, transfer, dispense, _id, ...dateData } = dateDoc;

    // Write date document
    await db.collection("transactions").doc(_id).set(deserializeValue(dateData), { merge: !force });

    // Write subcollections
    for (const [type, entries] of [["stockIn", stockIn], ["transfer", transfer], ["dispense", dispense]] as const) {
      if (entries?.length > 0) {
        const writes = (entries as any[]).map((entry: any) => ({
          ref: db.collection("transactions").doc(_id).collection(type).doc(entry._id),
          data: deserializeValue(entry),
        }));
        await batchWrite(writes, !force);
        total += writes.length;
      }
    }
  }
  console.log(`  ✅ Transactions done — ${total} entries across all dates`);
}

async function importMeta(data: any[]) {
  if (!shouldImport("_meta")) { console.log("  Skipping _meta"); return; }
  console.log(`\n⚙️  Importing _meta (${data.length} docs)...`);

  const writes = data.map((doc) => ({
    ref: db.collection("_meta").doc(doc._id),
    data: deserializeValue(doc),
  }));
  await batchWrite(writes, !force);
  console.log(`  ✅ _meta done`);
}

async function importUsers(data: any[]) {
  if (!shouldImport("users")) { console.log("  Skipping users"); return; }
  console.log(`\n👤 Importing users (${data.length})...`);

  const writes = data.map((doc) => ({
    ref: db.collection("users").doc(doc._id),
    data: deserializeValue(doc),
  }));
  // Always merge for users to preserve auth-related fields
  await batchWrite(writes, true);
  console.log(`  ✅ Users done`);
}

async function main() {
  const filePath = path.resolve(process.cwd(), backupFile!);

  if (!fs.existsSync(filePath)) {
    console.error(`❌ File not found: ${filePath}`);
    process.exit(1);
  }

  console.log(`\n🔄 PharmaTrack Backup Restore`);
  console.log(`   File:   ${filePath}`);
  console.log(`   Mode:   ${force ? "FORCE (overwrite existing)" : "SAFE (merge, skip existing)"}`);
  console.log(`   Only:   ${onlyCollections ? onlyCollections.join(", ") : "all collections"}`);

  if (force) {
    console.log("\n⚠️  FORCE mode: existing documents WILL be overwritten.");
    console.log("   Press Ctrl+C within 5 seconds to cancel...");
    await new Promise((r) => setTimeout(r, 5000));
  }

  const raw = fs.readFileSync(filePath, "utf-8");
  const backup = JSON.parse(raw);

  console.log(`\n📄 Backup info:`);
  console.log(`   Exported at: ${backup._exportedAt}`);
  console.log(`   Version:     ${backup._version}`);
  console.log(`   Products:    ${backup.products?.length ?? 0}`);
  console.log(`   Tx dates:    ${backup.transactions?.length ?? 0}`);

  await importProducts(backup.products ?? []);
  await importMainStock(backup.mainStock ?? []);
  await importPharmacyStock(backup.pharmacyStock ?? []);
  await importTransactions(backup.transactions ?? []);
  await importMeta(backup._meta ?? []);
  await importUsers(backup.users ?? []);

  console.log("\n✅ Restore complete!\n");
  console.log("Next steps:");
  console.log("  1. Verify data in Firebase Console");
  console.log("  2. Check stock quantities match expectations");
  console.log("  3. Open the app and confirm Inventory Log shows correct dates\n");

  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Restore failed:", err);
  process.exit(1);
});