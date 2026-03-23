// scripts/fix-units.ts
// Standardises all tablet and capsule units to "piece"
// (replaces both "strip" and "pcs" with "piece")
// Run: npx ts-node --project tsconfig.seed.json scripts/fix-units.ts

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

async function fixUnits() {
  console.log("\n🔧 Standardising units for tablets and capsules → piece\n");

  const snap = await db.collection("products").get();
  let updated = 0;
  let skipped = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    const isTabletOrCapsule = data.type === "tablet" || data.type === "capsule";
    const needsFix = isTabletOrCapsule && (data.unit === "strip" || data.unit === "pcs");

    if (needsFix) {
      await doc.ref.update({ unit: "piece" });
      console.log(`  ✓ ${doc.id} — ${data.brandName}: "${data.unit}" → "piece"`);
      updated++;
    } else {
      skipped++;
    }
  }

  console.log(`\n✅ Done — ${updated} updated, ${skipped} already correct\n`);
  process.exit(0);
}

fixUnits().catch((err) => {
  console.error("❌ Failed:", err);
  process.exit(1);
});