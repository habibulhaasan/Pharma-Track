// services/userService.ts
import "server-only";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { logActivity } from "./ledgerService";

export async function getAllUsers() {
  const db = getAdminDb();
  const snap = await db.collection("users").orderBy("createdAt", "desc").get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getPendingUsers() {
  const db = getAdminDb();
  const snap = await db
    .collection("users")
    .where("status", "==", "pending")
    .orderBy("createdAt", "asc")
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function updateUserStatus(
  targetUserId: string,
  status: "active" | "disabled",
  adminId: string
) {
  const db = getAdminDb();
  await db.collection("users").doc(targetUserId).update({
    status,
    updatedAt: FieldValue.serverTimestamp(),
  });
  await logActivity({
    userId: adminId,
    action: status === "active" ? "APPROVE_USER" : "DISABLE_USER",
    details: { targetUserId, newStatus: status },
  });
}

export async function createUserDoc(uid: string, data: { name: string; email: string; phone: string }) {
  const db = getAdminDb();
  await db.collection("users").doc(uid).set({
    name: data.name,
    email: data.email,
    phone: data.phone,
    role: "user",
    status: "pending",
    createdAt: FieldValue.serverTimestamp(),
  });
}

export async function updateLastLogin(uid: string) {
  const db = getAdminDb();
  await db.collection("users").doc(uid).update({
    lastLoginAt: FieldValue.serverTimestamp(),
  });
}

export async function getUserById(uid: string) {
  const db = getAdminDb();
  const doc = await db.collection("users").doc(uid).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() };
}
