// scripts/migrate.ts
// Migrates existing CSV data into Firestore.
// Run: npx ts-node --project tsconfig.seed.json scripts/migrate.ts
//
// CSV files expected in scripts/data/:
//   Pharmacy_Purchases.csv  → pharmacyStock + pharmacyLedger (IN/TRANSFER)
//   Pharmacy_Sell.csv       → pharmacyStock + pharmacyLedger (OUT/DISPENSE)
//   Main_Purchases.csv      → mainStock + mainLedger (IN)
//   Main_Sell.csv           → mainStock + mainLedger (OUT/TRANSFER)

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, Timestamp, FieldValue } from "firebase-admin/firestore";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

// ─── Init Firebase Admin ──────────────────────────────────────────────────
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

// ─── Product master (from CSV data) ──────────────────────────────────────
// Parsed from the name prefix: Tab. / Cap. / Syp. / Crm. / E/D. etc.
const PRODUCT_MASTER: Record<string, {
  genericName: string;
  brandName: string;
  type: string;
  company: string;
  unit: string;
  defaultPrice: number;
  reorderLevel: number;
}> = {
  P1001: { genericName: "Paracetamol", brandName: "Tab. Paracetamol", type: "tablet", company: "Generic", unit: "strip", defaultPrice: 0, reorderLevel: 500 },
  P1002: { genericName: "Histacin", brandName: "Tab. Histacin", type: "tablet", company: "Generic", unit: "strip", defaultPrice: 0, reorderLevel: 200 },
  P1003: { genericName: "Antacid", brandName: "Tab. Antacid", type: "tablet", company: "Generic", unit: "strip", defaultPrice: 0, reorderLevel: 500 },
  P1004: { genericName: "B/C", brandName: "Tab. B/C", type: "tablet", company: "Generic", unit: "strip", defaultPrice: 0, reorderLevel: 200 },
  P1005: { genericName: "Metronidazole 400mg", brandName: "Tab. Metro 400mg", type: "tablet", company: "Generic", unit: "strip", defaultPrice: 0, reorderLevel: 300 },
  P1006: { genericName: "Calcium", brandName: "Tab. Calcium", type: "tablet", company: "Generic", unit: "strip", defaultPrice: 0, reorderLevel: 200 },
  P1007: { genericName: "F/S", brandName: "Tab. F/S", type: "tablet", company: "Generic", unit: "strip", defaultPrice: 0, reorderLevel: 200 },
  P1010: { genericName: "Salbutamol", brandName: "Tab. Salbutamol", type: "tablet", company: "Generic", unit: "strip", defaultPrice: 0, reorderLevel: 200 },
  P1012: { genericName: "Tiemonium Methylsulphate", brandName: "Tab. Tiemonium", type: "tablet", company: "Generic", unit: "strip", defaultPrice: 0, reorderLevel: 200 },
  P1013: { genericName: "Cotrimoxazole", brandName: "Tab. Cotrim", type: "tablet", company: "Generic", unit: "strip", defaultPrice: 0, reorderLevel: 300 },
  P1014: { genericName: "Diclofenac", brandName: "Tab. Diclofen", type: "tablet", company: "Generic", unit: "strip", defaultPrice: 0, reorderLevel: 200 },
  P1015: { genericName: "Domperidone", brandName: "Tab. Domperidon", type: "tablet", company: "Generic", unit: "strip", defaultPrice: 0, reorderLevel: 200 },
  P1016: { genericName: "Amlodipine", brandName: "Tab. Amlodipine", type: "tablet", company: "Generic", unit: "strip", defaultPrice: 0, reorderLevel: 300 },
  P1017: { genericName: "Losartan Potassium", brandName: "Tab. Losartan", type: "tablet", company: "Generic", unit: "strip", defaultPrice: 0, reorderLevel: 300 },
  P1019: { genericName: "Aspirin", brandName: "Tab. Aspirin", type: "tablet", company: "Generic", unit: "strip", defaultPrice: 0, reorderLevel: 300 },
  P1021: { genericName: "Pantoprazole", brandName: "Tab. Pantoprazole", type: "tablet", company: "Generic", unit: "strip", defaultPrice: 0, reorderLevel: 200 },
  P1024: { genericName: "Cetirizine", brandName: "Tab. Cetirizine", type: "tablet", company: "Generic", unit: "strip", defaultPrice: 0, reorderLevel: 200 },
  P1025: { genericName: "Ciprofloxacin", brandName: "Tab. Ciprocin", type: "tablet", company: "Generic", unit: "strip", defaultPrice: 0, reorderLevel: 200 },
  P1027: { genericName: "Atenolol", brandName: "Tab. Atenolol", type: "tablet", company: "Generic", unit: "strip", defaultPrice: 0, reorderLevel: 300 },
  P1028: { genericName: "Montelukast", brandName: "Tab. Montelukast", type: "tablet", company: "Generic", unit: "strip", defaultPrice: 0, reorderLevel: 100 },
  P1029: { genericName: "Doxophylline", brandName: "Tab. Doxophylline", type: "tablet", company: "Generic", unit: "strip", defaultPrice: 0, reorderLevel: 100 },
  P1032: { genericName: "Indomethacin", brandName: "Cap. Indomet", type: "capsule", company: "Generic", unit: "strip", defaultPrice: 0, reorderLevel: 100 },
  P1033: { genericName: "Tetracycline", brandName: "Cap. Tetracycline", type: "capsule", company: "Generic", unit: "strip", defaultPrice: 0, reorderLevel: 100 },
  P1034: { genericName: "Doxycycline", brandName: "Cap. Doxycycline", type: "capsule", company: "Generic", unit: "strip", defaultPrice: 0, reorderLevel: 100 },
  P1035: { genericName: "Amoxicillin 250mg", brandName: "Cap. Amoxicillin 250mg", type: "capsule", company: "Generic", unit: "strip", defaultPrice: 0, reorderLevel: 200 },
  P1036: { genericName: "Amoxicillin 500mg", brandName: "Cap. Amoxicillin 500mg", type: "capsule", company: "Generic", unit: "strip", defaultPrice: 0, reorderLevel: 200 },
  P1037: { genericName: "Omeprazole 20mg", brandName: "Cap. Omeprazole 20mg", type: "capsule", company: "Generic", unit: "strip", defaultPrice: 0, reorderLevel: 200 },
  P1040: { genericName: "Paracetamol Syrup", brandName: "Syp. Paracetamol", type: "syrup", company: "Generic", unit: "bottle", defaultPrice: 0, reorderLevel: 100 },
  P1041: { genericName: "Histacin Syrup", brandName: "Syp. Histacin", type: "syrup", company: "Generic", unit: "bottle", defaultPrice: 0, reorderLevel: 50 },
  P1042: { genericName: "Salbutamol Syrup", brandName: "Syp. Salbutamol", type: "syrup", company: "Generic", unit: "bottle", defaultPrice: 0, reorderLevel: 50 },
  P1043: { genericName: "Amoxicillin Syrup", brandName: "Syp. Amoxicillin", type: "syrup", company: "Generic", unit: "bottle", defaultPrice: 0, reorderLevel: 50 },
  P1044: { genericName: "Cotrimoxazole Syrup", brandName: "Syp. Cotrim", type: "syrup", company: "Generic", unit: "bottle", defaultPrice: 0, reorderLevel: 50 },
  P1045: { genericName: "Metronidazole Syrup", brandName: "Syp. Metro", type: "syrup", company: "Generic", unit: "bottle", defaultPrice: 0, reorderLevel: 50 },
  P1047: { genericName: "Zinc Syrup", brandName: "Syp. Zinc", type: "syrup", company: "Generic", unit: "bottle", defaultPrice: 0, reorderLevel: 50 },
  P1048: { genericName: "BBL", brandName: "BBL", type: "other", company: "Generic", unit: "piece", defaultPrice: 0, reorderLevel: 10 },
  P1049: { genericName: "Perosa Cream", brandName: "Crm. Perosa", type: "cream", company: "Generic", unit: "piece", defaultPrice: 0, reorderLevel: 20 },
  P1053: { genericName: "Nebulizer Solution", brandName: "Nebulizer Solution", type: "other", company: "Generic", unit: "vial", defaultPrice: 0, reorderLevel: 10 },
  P1060: { genericName: "CBA", brandName: "CBA", type: "other", company: "Generic", unit: "piece", defaultPrice: 0, reorderLevel: 5 },
  P1061: { genericName: "Chloramphenicol Eye Drop", brandName: "E/D. Chloramphenicol", type: "drops", company: "Generic", unit: "piece", defaultPrice: 0, reorderLevel: 20 },
  P1064: { genericName: "Calcium 500mg", brandName: "Tab. Calcium 500mg", type: "tablet", company: "Generic", unit: "strip", defaultPrice: 0, reorderLevel: 200 },
  P1065: { genericName: "Barbitone", brandName: "Tab. Barbit", type: "tablet", company: "Generic", unit: "strip", defaultPrice: 0, reorderLevel: 50 },
  P1066: { genericName: "Esomeprazole", brandName: "Tab. Esomeprazole", type: "tablet", company: "Generic", unit: "strip", defaultPrice: 0, reorderLevel: 100 },
  P1068: { genericName: "Ketotifen Syrup", brandName: "Syp. Kitotifen", type: "syrup", company: "Generic", unit: "bottle", defaultPrice: 0, reorderLevel: 30 },
  P1069: { genericName: "Levofloxacin", brandName: "Tab. Levofloxacin", type: "tablet", company: "Generic", unit: "strip", defaultPrice: 0, reorderLevel: 100 },
  P1070: { genericName: "Cephradine", brandName: "Cap. Cephradin", type: "capsule", company: "Generic", unit: "strip", defaultPrice: 0, reorderLevel: 100 },
  P1071: { genericName: "Ciprofloxacin Eye Drop", brandName: "E/D. Ciprocin", type: "drops", company: "Generic", unit: "piece", defaultPrice: 0, reorderLevel: 20 },
  P1072: { genericName: "Aceclofenac", brandName: "Tab. Aceclofenac", type: "tablet", company: "Generic", unit: "strip", defaultPrice: 0, reorderLevel: 100 },
  P1073: { genericName: "Hyoscine Butylbromide", brandName: "Tab. Hyocinbutyle", type: "tablet", company: "Generic", unit: "strip", defaultPrice: 0, reorderLevel: 100 },
};

// ─── CSV Parser ───────────────────────────────────────────────────────────
function parseCSV(filepath: string): Record<string, string>[] {
  const text = fs.readFileSync(filepath, "utf-8");
  const lines = text.replace(/\r/g, "").split("\n").filter(Boolean);
  const headers = parseCSVLine(lines[0]);
  return lines.slice(1).map((line) => {
    const vals = parseCSVLine(line);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => (obj[h.trim()] = (vals[i] ?? "").trim()));
    return obj;
  }).filter((r) => r["Product ID"]);
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (ch === "," && !inQuotes) { result.push(current); current = ""; continue; }
    current += ch;
  }
  result.push(current);
  return result;
}

// ─── Date Parser ──────────────────────────────────────────────────────────
function parseDate(dateStr: string): Date {
  // Formats seen: "14/09/2025, 1:38:41 pm" / "5/11/2025, 11:39:20 AM" / "08/11/2025, 6:00:00 AM"
  const cleaned = dateStr.trim();
  const match = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s+(.+)$/);
  if (match) {
    const [, day, month, year, time] = match;
    const d = new Date(`${year}-${month.padStart(2,"0")}-${day.padStart(2,"0")} ${time}`);
    if (!isNaN(d.getTime())) return d;
  }
  return new Date(dateStr);
}

// ─── Main Migration ───────────────────────────────────────────────────────
async function migrate() {
  const dataDir = path.join(process.cwd(), "scripts", "data");
  console.log("\n🚀 Starting migration...\n");

  // ── Step 1: Create all product documents using P-IDs as doc IDs ──────
  console.log("📦 Creating products...");
  const productBatch = db.batch();
  for (const [pid, product] of Object.entries(PRODUCT_MASTER)) {
    const ref = db.collection("products").doc(pid);
    productBatch.set(ref, {
      ...product,
      deleted: false,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      migratedFrom: "csv",
    }, { merge: true });

    // Init stock docs
    const mainRef = db.collection("mainStock").doc(pid);
    const pharmRef = db.collection("pharmacyStock").doc(pid);
    productBatch.set(mainRef, { quantity: 0, updatedAt: Timestamp.now() }, { merge: true });
    productBatch.set(pharmRef, { quantity: 0, updatedAt: Timestamp.now() }, { merge: true });
  }
  await productBatch.commit();
  console.log(`  ✓ ${Object.keys(PRODUCT_MASTER).length} products created\n`);

  // ── Step 2: Compute running stock from all CSV transactions ──────────
  // We replay all transactions in date order to compute correct final quantities

  const mainStockQty: Record<string, number> = {};
  const pharmStockQty: Record<string, number> = {};
  Object.keys(PRODUCT_MASTER).forEach((pid) => {
    mainStockQty[pid] = 0;
    pharmStockQty[pid] = 0;
  });

  // ── Step 3: Migrate Main Purchases (IN to main stock) ────────────────
  console.log("📥 Migrating Main Purchases...");
  const mainPurchases = parseCSV(path.join(dataDir, "Main_Purchases.csv"));
  let mpCount = 0;
  for (const row of mainPurchases) {
    const pid = row["Product ID"];
    const qty = parseInt(row["Quantity"]) || 0;
    if (!pid || qty === 0) continue;

    const date = parseDate(row["Date"]);
    mainStockQty[pid] = (mainStockQty[pid] || 0) + qty;

    await db.collection("mainStock").doc(pid).collection("mainLedger").add({
      type: "IN",
      quantity: qty,
      batch: "MIGRATED",
      expiry: null,
      price: parseFloat(row["Unit Price ($)"]) || 0,
      supplier: row["Comments"] || "Migrated",
      reference: "CSV_MIGRATION",
      timestamp: Timestamp.fromDate(date),
      userId: "MIGRATION",
      migratedFrom: "Main_Purchases.csv",
    });
    mpCount++;
  }
  console.log(`  ✓ ${mpCount} main purchase entries\n`);

  // ── Step 4: Migrate Main Sell (OUT from main stock = transfer to pharmacy) ──
  console.log("📤 Migrating Main Sell (Main Stock OUT)...");
  const mainSell = parseCSV(path.join(dataDir, "Main_Sell.csv"));
  let msCount = 0;
  for (const row of mainSell) {
    const pid = row["Product ID"];
    const qty = parseInt(row["Quantity"]) || 0;
    if (!pid || qty === 0) continue;

    const date = parseDate(row["Date"]);
    mainStockQty[pid] = (mainStockQty[pid] || 0) - qty;

    await db.collection("mainStock").doc(pid).collection("mainLedger").add({
      type: "OUT",
      reference: "TRANSFER",
      quantity: qty,
      batch: "MIGRATED",
      expiry: null,
      price: 0,
      supplier: "",
      timestamp: Timestamp.fromDate(date),
      userId: "MIGRATION",
      migratedFrom: "Main_Sell.csv",
    });
    msCount++;
  }
  console.log(`  ✓ ${msCount} main sell entries\n`);

  // ── Step 5: Migrate Pharmacy Purchases (IN to pharmacy = transferred in) ──
  console.log("📥 Migrating Pharmacy Purchases (Pharmacy Stock IN)...");
  const pharmPurchases = parseCSV(path.join(dataDir, "Pharmacy_Purchases.csv"));
  let ppCount = 0;
  for (const row of pharmPurchases) {
    const pid = row["Product ID"];
    const qty = parseInt(row["Quantity"]) || 0;
    if (!pid || qty === 0) continue;

    const date = parseDate(row["Date"]);
    pharmStockQty[pid] = (pharmStockQty[pid] || 0) + qty;

    await db.collection("pharmacyStock").doc(pid).collection("pharmacyLedger").add({
      type: "IN",
      reference: "TRANSFER",
      quantity: qty,
      batch: "MIGRATED",
      expiry: null,
      timestamp: Timestamp.fromDate(date),
      userId: "MIGRATION",
      migratedFrom: "Pharmacy_Purchases.csv",
      notes: row["Comments"] || "",
    });
    ppCount++;
  }
  console.log(`  ✓ ${ppCount} pharmacy purchase entries\n`);

  // ── Step 6: Migrate Pharmacy Sell (OUT from pharmacy = dispensed) ────
  console.log("📤 Migrating Pharmacy Sell (Dispensed)...");
  const pharmSell = parseCSV(path.join(dataDir, "Pharmacy_Sell.csv"));
  let psCount = 0;
  for (const row of pharmSell) {
    const pid = row["Product ID"];
    const qty = parseInt(row["Quantity"]) || 0;
    if (!pid || qty === 0) continue;

    const date = parseDate(row["Date"]);
    pharmStockQty[pid] = (pharmStockQty[pid] || 0) - qty;

    await db.collection("pharmacyStock").doc(pid).collection("pharmacyLedger").add({
      type: "OUT",
      reference: "DISPENSE",
      quantity: qty,
      batch: "MIGRATED",
      expiry: null,
      patientName: "",
      prescriptionNo: "",
      timestamp: Timestamp.fromDate(date),
      userId: "MIGRATION",
      migratedFrom: "Pharmacy_Sell.csv",
    });

    // Also create a sale record
    await db.collection("sales").add({
      productId: pid,
      quantity: qty,
      price: parseFloat(row["Unit Price ($)"]) || 0,
      patientName: "",
      prescriptionNo: "",
      timestamp: Timestamp.fromDate(date),
      userId: "MIGRATION",
    });
    psCount++;
  }
  console.log(`  ✓ ${psCount} pharmacy sell (dispense) entries\n`);

  // ── Step 7: Update final stock quantities ───────────────────────────
  console.log("📊 Updating final stock quantities...");
  const stockBatch = db.batch();
  for (const pid of Object.keys(PRODUCT_MASTER)) {
    const mainQty = Math.max(0, mainStockQty[pid] || 0);
    const pharmQty = Math.max(0, pharmStockQty[pid] || 0);

    stockBatch.set(db.collection("mainStock").doc(pid), {
      quantity: mainQty,
      updatedAt: Timestamp.now(),
    }, { merge: true });

    stockBatch.set(db.collection("pharmacyStock").doc(pid), {
      quantity: pharmQty,
      updatedAt: Timestamp.now(),
    }, { merge: true });

    if (mainQty > 0 || pharmQty > 0) {
      console.log(`  ${pid}: main=${mainQty}, pharmacy=${pharmQty}`);
    }
  }
  await stockBatch.commit();

  console.log("\n✅ Migration complete!");
  console.log(`   Products:           ${Object.keys(PRODUCT_MASTER).length}`);
  console.log(`   Main purchases:     ${mpCount}`);
  console.log(`   Main sell:          ${msCount}`);
  console.log(`   Pharmacy purchases: ${ppCount}`);
  console.log(`   Pharmacy sell:      ${psCount}`);
  console.log(`   Total ledger rows:  ${mpCount + msCount + ppCount + psCount}\n`);

  process.exit(0);
}

migrate().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});