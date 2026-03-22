// services/productService.ts
import "server-only";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import type { CreateProductInput } from "@/schemas/product";

export async function getAllProducts(includeDeleted = false) {
  const db = getAdminDb();
  const snap = await db.collection("products").orderBy("genericName", "asc").get();
  const products = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  if (includeDeleted) return products;
  return products.filter((p: any) => !p.deleted);
}

export async function getProductById(productId: string) {
  const db = getAdminDb();
  const doc = await db.collection("products").doc(productId).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() };
}

export async function createProduct(data: CreateProductInput, userId: string) {
  const db = getAdminDb();
  const ref = await db.collection("products").add({
    ...data,
    deleted: false,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    createdBy: userId,
  });

  const batch = db.batch();
  batch.set(db.collection("mainStock").doc(ref.id), {
    quantity: 0,
    updatedAt: FieldValue.serverTimestamp(),
  });
  batch.set(db.collection("pharmacyStock").doc(ref.id), {
    quantity: 0,
    updatedAt: FieldValue.serverTimestamp(),
  });
  await batch.commit();
  return ref.id;
}

export async function updateProduct(productId: string, data: Partial<CreateProductInput>, userId: string) {
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
    updatedAt: FieldValue.serverTimestamp(),
    deletedBy: userId,
  });
}
