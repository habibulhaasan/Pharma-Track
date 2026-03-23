// scripts/add-missing-products.ts
// Adds the 23 products that exist in Products_List.csv but had no
// transaction history and were deleted during cleanup.
// These products start with zero stock — no ledger entries needed.
// Run: npx ts-node --project tsconfig.seed.json scripts/add-missing-products.ts

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
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

// Type mapping from Products_List.csv Product Type → Firestore type field
function mapType(t: string): string {
  const lower = t.toLowerCase();
  if (lower === "tablet") return "tablet";
  if (lower === "capsule") return "capsule";
  if (lower === "syrup") return "syrup";
  if (lower === "injection") return "injection";
  if (lower === "surgicals" || lower === "others" || lower === "other") return "other";
  return "other";
}

// Unit mapping by type
function mapUnit(type: string): string {
  if (type === "tablet" || type === "capsule") return "pcs";
  if (type === "syrup") return "bottle";
  if (type === "injection") return "vial";
  return "piece";
}

const MISSING_PRODUCTS: Record<string, {
  brandName: string;
  genericName: string;
  rawType: string;
  company: string;
}> = {
  P1008: { brandName: "Tab. Azithromycin",     genericName: "Azithromycin",                                      rawType: "Tablet",    company: "Govt. Supply" },
  P1009: { brandName: "Tab. Penicillin",        genericName: "Phenoxymethyl Penicillin",                          rawType: "Tablet",    company: "Govt. Supply" },
  P1011: { brandName: "Tab. Albendazol",        genericName: "Albendazole",                                       rawType: "Tablet",    company: "Govt. Supply" },
  P1018: { brandName: "Tab. Naproxen",          genericName: "Naproxen",                                          rawType: "Tablet",    company: "Govt. Supply" },
  P1020: { brandName: "Tab. Fexo 120",          genericName: "Fexofenadine Hydrochloride",                        rawType: "Tablet",    company: "Govt. Supply" },
  P1022: { brandName: "Tab. Metformin 500mg",   genericName: "Metformin Hydrochloride",                           rawType: "Tablet",    company: "Govt. Supply" },
  P1023: { brandName: "Tab. Glicazide 80mg",    genericName: "Gliclazide",                                        rawType: "Tablet",    company: "Govt. Supply" },
  P1030: { brandName: "Tab. Zinc",              genericName: "Zinc Sulphate Monohydrate",                         rawType: "Tablet",    company: "Govt. Supply" },
  P1031: { brandName: "Tab. Ketorolac",         genericName: "Ketorolac Tromethamine",                            rawType: "Tablet",    company: "Govt. Supply" },
  P1038: { brandName: "Cap. Fluconazole 50mg",  genericName: "Fluconazole",                                       rawType: "Capsule",   company: "Govt. Supply" },
  P1039: { brandName: "Cap. Flucloxacillin",    genericName: "Flucloxacillin",                                    rawType: "Capsule",   company: "Govt. Supply" },
  P1046: { brandName: "Syp. Cetirizine",        genericName: "Cetirizine",                                        rawType: "Syrup",     company: "Govt. Supply" },
  P1051: { brandName: "Drp. Nystat",            genericName: "Nystatin",                                          rawType: "Syrup",     company: "Govt. Supply" },
  P1052: { brandName: "ORS",                    genericName: "Oral Rehydration Salt (Glucose Based)",             rawType: "Others",    company: "Govt. Supply" },
  P1054: { brandName: "Povidon (Big)",          genericName: "Povidone Iodine",                                   rawType: "Surgicals", company: "Govt. Supply" },
  P1055: { brandName: "Povidon (Small)",        genericName: "Povidone Iodine",                                   rawType: "Surgicals", company: "Govt. Supply" },
  P1056: { brandName: "BP Machine",             genericName: "Machine",                                           rawType: "Surgicals", company: "Govt. Supply" },
  P1057: { brandName: "Stethoscope",            genericName: "Stethoscope",                                       rawType: "Surgicals", company: "Govt. Supply" },
  P1058: { brandName: "Thermometer",            genericName: "Thermometer",                                       rawType: "Surgicals", company: "Govt. Supply" },
  P1059: { brandName: "Savlon",                 genericName: "Savlon",                                            rawType: "Surgicals", company: "Govt. Supply" },
  P1062: { brandName: "Inj. Lidocain",          genericName: "Lidocaine",                                         rawType: "Injection", company: "Govt. Supply" },
  P1063: { brandName: "Tab. Mebendazole",       genericName: "Mebendazole",                                       rawType: "Tablet",    company: "Govt. Supply" },
  P1067: { brandName: "Tab. Nabumetone",        genericName: "Nabumetone",                                        rawType: "Tablet",    company: "Govt. Supply" },
};

async function addMissingProducts() {
  console.log("\n📦 Adding 23 missing products...\n");

  const batch = db.batch();
  let count = 0;

  for (const [pid, p] of Object.entries(MISSING_PRODUCTS)) {
    const type = mapType(p.rawType);
    const unit = mapUnit(type);

    // Check if already exists
    const existing = await db.collection("products").doc(pid).get();
    if (existing.exists) {
      console.log(`  ⏭  ${pid} already exists — skipping`);
      continue;
    }

    const productRef = db.collection("products").doc(pid);
    batch.set(productRef, {
      brandName: p.brandName,
      genericName: p.genericName,
      type,
      company: p.company,
      unit,
      defaultPrice: 0,
      reorderLevel: 10,
      deleted: false,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      migratedFrom: "Products_List.csv",
    });

    // Init stock docs with 0
    batch.set(db.collection("mainStock").doc(pid), {
      quantity: 0,
      updatedAt: Timestamp.now(),
    }, { merge: true });

    batch.set(db.collection("pharmacyStock").doc(pid), {
      quantity: 0,
      updatedAt: Timestamp.now(),
    }, { merge: true });

    console.log(`  ✓ ${pid}: ${p.brandName} (${p.genericName}) — ${type} / ${unit}`);
    count++;
  }

  await batch.commit();

  console.log(`\n✅ Done — ${count} products added with zero stock`);
  console.log(`   These products had no transaction history in any CSV.`);
  console.log(`   Use Stock IN on the app to add their current quantities.\n`);

  process.exit(0);
}

addMissingProducts().catch((err) => {
  console.error("❌ Failed:", err);
  process.exit(1);
});