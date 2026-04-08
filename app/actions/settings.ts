"use server";
// app/actions/settings.ts
import { requireAdmin } from "@/lib/auth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";

export async function saveLetterheadAction(data: Record<string, any>) {
  try {
    await requireAdmin();
    const db = getAdminDb();
    await db.collection("_meta").doc("letterhead").set({
      ...data,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return { success: true };
  } catch (err) {
    return { success: false, error: "Failed to save settings" };
  }
}

export async function getLetterheadAction() {
  const db = getAdminDb();
  const doc = await db.collection("_meta").doc("letterhead").get();
  return doc.exists ? doc.data() : {};
}