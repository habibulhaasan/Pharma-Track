// scripts/seed.ts
// Run with: npx ts-node -P tsconfig.seed.json scripts/seed.ts
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
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
const auth = getAuth();

const ADMIN_EMAIL = "admin@pharmatrack.com";
const ADMIN_PASSWORD = "Admin@123456";

const SAMPLE_PRODUCTS = [
  { genericName: "Paracetamol", brandName: "Napa", type: "tablet", company: "Beximco Pharma", unit: "strip", defaultPrice: 10, reorderLevel: 50 },
  { genericName: "Amoxicillin", brandName: "Moxacil", type: "capsule", company: "Square Pharma", unit: "strip", defaultPrice: 35, reorderLevel: 30 },
  { genericName: "Metformin", brandName: "Glucophage", type: "tablet", company: "Sanofi", unit: "strip", defaultPrice: 25, reorderLevel: 40 },
  { genericName: "Omeprazole", brandName: "Losectil", type: "capsule", company: "ACI Limited", unit: "strip", defaultPrice: 45, reorderLevel: 20 },
  { genericName: "Amlodipine", brandName: "Norvasc", type: "tablet", company: "Pfizer", unit: "strip", defaultPrice: 60, reorderLevel: 25 },
  { genericName: "Salbutamol", brandName: "Sultolin", type: "inhaler", company: "GSK", unit: "piece", defaultPrice: 180, reorderLevel: 10 },
  { genericName: "Cetirizine", brandName: "Cetrizin", type: "tablet", company: "Healthcare Pharma", unit: "strip", defaultPrice: 15, reorderLevel: 30 },
  { genericName: "Atorvastatin", brandName: "Lipitor", type: "tablet", company: "Pfizer", unit: "strip", defaultPrice: 80, reorderLevel: 20 },
  { genericName: "Insulin (Regular)", brandName: "Humulin R", type: "injection", company: "Eli Lilly", unit: "vial", defaultPrice: 350, reorderLevel: 15 },
  { genericName: "Azithromycin", brandName: "Zithromax", type: "tablet", company: "Pfizer", unit: "strip", defaultPrice: 120, reorderLevel: 15 },
];

async function seed() {
  console.log("Seeding database...\n");

  let adminUid: string;
  try {
    const existing = await auth.getUserByEmail(ADMIN_EMAIL);
    adminUid = existing.uid;
    console.log("Admin user exists.");
  } catch {
    const created = await auth.createUser({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD, displayName: "System Administrator" });
    adminUid = created.uid;
    console.log("Created admin user.");
  }

  await db.collection("users").doc(adminUid).set({
    name: "System Administrator",
    email: ADMIN_EMAIL,
    phone: "+880 1700-000000",
    role: "admin",
    status: "active",
    createdAt: Timestamp.now(),
  }, { merge: true });

  const batch = db.batch();
  for (const product of SAMPLE_PRODUCTS) {
    const productRef = db.collection("products").doc();
    const qty = Math.floor(Math.random() * 200) + 50;
    batch.set(productRef, { ...product, deleted: false, createdAt: Timestamp.now(), updatedAt: Timestamp.now() });
    batch.set(db.collection("mainStock").doc(productRef.id), { quantity: qty, updatedAt: Timestamp.now() });
    batch.set(db.collection("pharmacyStock").doc(productRef.id), { quantity: 0, updatedAt: Timestamp.now() });
    console.log(`  + ${product.genericName} qty=${qty}`);
  }
  await batch.commit();

  console.log("\nSeed complete!");
  console.log("Admin:", ADMIN_EMAIL, "/", ADMIN_PASSWORD);
  process.exit(0);
}

seed().catch((err) => { console.error("Seed failed:", err); process.exit(1); });
