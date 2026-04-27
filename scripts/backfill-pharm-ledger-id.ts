// scripts/backfill-pharm-ledger-id.ts
// ONE-TIME script: finds all existing transfer entries in transactions collection
// and backfills the pharmLedgerId field by matching productId + timestamp
// in pharmacyLedger subcollections.
//
// Run ONCE after deploying the new stockService:
//   npx ts-node --project tsconfig.seed.json scripts/backfill-pharm-ledger-id.ts

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
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

async function main() {
  console.log("\n🔄 Backfilling pharmLedgerId on transfer documents...\n");

  // Get all transaction date documents
  const txDatesSnap = await db.collection("transactions").get();
  let total = 0, matched = 0, alreadyHas = 0, noMatch = 0;

  for (const dateDoc of txDatesSnap.docs) {
    const transferSnap = await dateDoc.ref.collection("transfer").get();
    if (transferSnap.empty) continue;

    for (const txDoc of transferSnap.docs) {
      total++;
      const txData = txDoc.data();

      // Skip if already has pharmLedgerId
      if (txData.pharmLedgerId) {
        alreadyHas++;
        continue;
      }

      const { productId, ledgerId, timestamp } = txData;
      if (!productId || !ledgerId) {
        noMatch++;
        continue;
      }

      // Get the main ledger entry to find the pharmLedgerId stored there
      const mainLedgerRef = db.collection("mainStock").doc(productId)
        .collection("mainLedger").doc(ledgerId);
      const mainLedgerDoc = await mainLedgerRef.get();

      if (mainLedgerDoc.exists && mainLedgerDoc.data()?.pharmLedgerId) {
        // Already has cross-reference in main ledger
        const pharmLedgerId = mainLedgerDoc.data()!.pharmLedgerId;
        await txDoc.ref.update({ pharmLedgerId });
        matched++;
        process.stdout.write(`✓`);
        continue;
      }

      // Fallback: find pharmacy ledger entry by matching timestamp (within 10 seconds)
      const txTs = timestamp?.toDate?.()?.getTime() ?? 0;
      if (!txTs) { noMatch++; continue; }

      const startTs = Timestamp.fromDate(new Date(txTs - 10000));
      const endTs = Timestamp.fromDate(new Date(txTs + 10000));

      const pharmSnap = await db.collection("pharmacyStock").doc(productId)
        .collection("pharmacyLedger")
        .where("reference", "==", "TRANSFER")
        .where("timestamp", ">=", startTs)
        .where("timestamp", "<=", endTs)
        .limit(1)
        .get();

      if (!pharmSnap.empty) {
        const pharmLedgerId = pharmSnap.docs[0].id;
        // Backfill both the transaction doc and the main ledger cross-reference
        await Promise.all([
          txDoc.ref.update({ pharmLedgerId }),
          mainLedgerRef.update({ pharmLedgerId }).catch(() => {}),
          pharmSnap.docs[0].ref.update({ mainLedgerId: ledgerId }).catch(() => {}),
        ]);
        matched++;
        process.stdout.write(`✓`);
      } else {
        noMatch++;
        process.stdout.write(`✗`);
      }
    }
  }

  console.log(`\n\n✅ Backfill complete!`);
  console.log(`   Total transfers:    ${total}`);
  console.log(`   Already had ID:     ${alreadyHas}`);
  console.log(`   Matched + updated:  ${matched}`);
  console.log(`   Could not match:    ${noMatch}`);

  if (noMatch > 0) {
    console.log(`\n⚠️  ${noMatch} transfers couldn't be matched.`);
    console.log(`   These old transfers will still work for delete/edit,`);
    console.log(`   but pharmacy ledger won't be updated simultaneously.`);
    console.log(`   New transfers will have full cross-referencing.\n`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Backfill failed:", err);
  process.exit(1);
});