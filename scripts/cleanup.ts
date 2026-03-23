// scripts/cleanup.ts
// Deletes all product/stock documents that do NOT have a P-ID (e.g. P1001)
// Run: npx ts-node --project tsconfig.seed.json scripts/cleanup.ts

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

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

const db = getFirestore();

async function cleanup() {
  console.log("\n🧹 Starting cleanup of non-P-ID documents...\n");

  // Check if it's a valid P-ID like P1001, P1002 etc.
  function isPID(id: string) {
    return /^P\d{4,}$/.test(id);
  }

  let deleted = 0;

  // ── Delete from products ──────────────────────────────────────────────
  const productsSnap = await db.collection("products").get();
  for (const doc of productsSnap.docs) {
    if (!isPID(doc.id)) {
      console.log(`  Deleting product: ${doc.id} (${doc.data().genericName ?? doc.data().brandName ?? "?"})`);
      await doc.ref.delete();
      deleted++;
    }
  }

  // ── Delete from mainStock (and its mainLedger subcollection) ─────────
  const mainStockSnap = await db.collection("mainStock").get();
  for (const doc of mainStockSnap.docs) {
    if (!isPID(doc.id)) {
      // Delete subcollection first
      const ledgerSnap = await doc.ref.collection("mainLedger").get();
      for (const ledgerDoc of ledgerSnap.docs) {
        await ledgerDoc.ref.delete();
      }
      console.log(`  Deleting mainStock: ${doc.id} (${ledgerSnap.size} ledger entries)`);
      await doc.ref.delete();
      deleted++;
    }
  }

  // ── Delete from pharmacyStock (and its pharmacyLedger subcollection) ─
  const pharmSnap = await db.collection("pharmacyStock").get();
  for (const doc of pharmSnap.docs) {
    if (!isPID(doc.id)) {
      const ledgerSnap = await doc.ref.collection("pharmacyLedger").get();
      for (const ledgerDoc of ledgerSnap.docs) {
        await ledgerDoc.ref.delete();
      }
      console.log(`  Deleting pharmacyStock: ${doc.id} (${ledgerSnap.size} ledger entries)`);
      await doc.ref.delete();
      deleted++;
    }
  }

  console.log(`\n✅ Cleanup complete — ${deleted} documents deleted\n`);
  process.exit(0);
}

cleanup().catch((err) => {
  console.error("❌ Cleanup failed:", err);
  process.exit(1);
});