// lib/firebaseAdmin.ts
// NODE.JS RUNTIME ONLY — never import in middleware or client components.
import "server-only";
import {
  initializeApp,
  getApps,
  getApp,
  cert,
  type App,
} from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getAuth, type Auth } from "firebase-admin/auth";

function getAdminApp(): App {
  if (getApps().length > 0) return getApp();

  let privateKey: string | undefined;

  if (process.env.FIREBASE_ADMIN_PRIVATE_KEY_BASE64) {
    privateKey = Buffer.from(
      process.env.FIREBASE_ADMIN_PRIVATE_KEY_BASE64,
      "base64"
    ).toString("utf-8");
  } else if (process.env.FIREBASE_ADMIN_PRIVATE_KEY) {
    privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, "\n");
  }

  if (!privateKey) {
    throw new Error("Firebase Admin private key missing.");
  }

  return initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID!,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL!,
      privateKey,
    }),
  });
}

let _db: Firestore | undefined;
let _auth: Auth | undefined;

export function getAdminDb(): Firestore {
  if (!_db) _db = getFirestore(getAdminApp());
  return _db;
}

export function getAdminAuth(): Auth {
  if (!_auth) _auth = getAuth(getAdminApp());
  return _auth;
}

export async function verifyIdTokenCookie(
  idToken: string
): Promise<{ uid: string } | null> {
  try {
    const decoded = await getAdminAuth().verifyIdToken(idToken);
    return { uid: decoded.uid };
  } catch (e: any) {
    console.error("[verifyIdTokenCookie] failed:", e?.code, e?.message);
    return null;
  }
}

export async function getUserDoc(uid: string) {
  const snap = await getAdminDb().collection("users").doc(uid).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() };
}