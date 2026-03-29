// services/productService.ts
import "server-only";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import type { CreateProductInput } from "@/schemas/product";

export async function getAllProducts() {
  const db = getAdminDb();
  const snap = await db
    .collection("products")
    .where("deleted", "==", false)
    .get();
  const products = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return products;
}

export async function getProductById(productId: string) {
  const db = getAdminDb();
  const doc = await db.collection("products").doc(productId).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() };
}

// Generate next sequential P-ID (P1001, P1002, ...)
async function generateProductId(): Promise<string> {
  const db = getAdminDb();
  // Get all existing P-IDs and find the highest number
  const snap = await db.collection("products").get();
  const pIds = snap.docs
    .map((d) => d.id)
    .filter((id) => /^P\d{4,}$/.test(id))
    .map((id) => parseInt(id.slice(1), 10))
    .filter((n) => !isNaN(n));

  const nextNum = pIds.length > 0 ? Math.max(...pIds) + 1 : 1001;
  return `P${nextNum}`;
}

export async function createProduct(data: CreateProductInput, userId: string) {
  const db = getAdminDb();

  // Generate sequential P-ID
  const productId = await generateProductId();
  const ref = db.collection("products").doc(productId);

  const batch = db.batch();

  batch.set(ref, {
    ...data,
    deleted: false,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    createdBy: userId,
  });

  batch.set(db.collection("mainStock").doc(productId), {
    quantity: 0,
    updatedAt: FieldValue.serverTimestamp(),
  });

  batch.set(db.collection("pharmacyStock").doc(productId), {
    quantity: 0,
    updatedAt: FieldValue.serverTimestamp(),
  });

  await batch.commit();
  return productId;
}

export async function updateProduct(
  productId: string,
  data: Partial<CreateProductInput>,
  userId: string
) {
  const db = getAdminDb();
  await db.collection("products").doc(productId).update({
    ...data,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: userId,
  });
}

export async function softDeleteProduct(productId: string, userId: string) {
  const db = getAdminDb();
  await db.collection("products").doc(productId).update({
    deleted: true,
    deletedAt: FieldValue.serverTimestamp(),
    deletedBy: userId,
  });
}