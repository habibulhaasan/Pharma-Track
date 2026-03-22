"use server";
// app/actions/auth.ts
import { setSessionCookie, clearSession } from "@/lib/auth";
import { createUserDoc, updateLastLogin } from "@/services/userService";
import { RegisterSchema } from "@/schemas/user";
import { handleActionError } from "@/utils/errorHandler";
import { redirect } from "next/navigation";

export async function registerUserDocAction(
  uid: string,
  data: { name: string; email: string; phone: string }
) {
  try {
    RegisterSchema.omit({ password: true }).parse(data);
    await createUserDoc(uid, data);
    return { success: true };
  } catch (error) {
    return handleActionError(error);
  }
}

export async function createSessionAction(idToken: string) {
  try {
    if (!idToken) return { success: false, error: "No token provided" };

    const { getAdminDb, verifyIdTokenCookie } = await import("@/lib/firebaseAdmin");

    const verified = await verifyIdTokenCookie(idToken);
    if (!verified) {
      return { success: false, error: "Invalid token. Please try signing in again." };
    }

    const userDoc = await getAdminDb().collection("users").doc(verified.uid).get();
    if (!userDoc.exists) {
      return { success: false, error: "Account not found. Contact an administrator." };
    }

    const userData = userDoc.data()!;

    if (userData.status === "pending") {
      return { success: false, error: "Your account is pending admin approval." };
    }
    if (userData.status === "disabled") {
      return { success: false, error: "Your account has been disabled. Contact an administrator." };
    }

    await setSessionCookie(idToken);
    await updateLastLogin(verified.uid);

    return {
      success: true,
      redirectTo: userData.role === "admin" ? "/admin" : "/dashboard",
    };
  } catch (error) {
    console.error("createSessionAction error:", error);
    return handleActionError(error);
  }
}

export async function logoutAction() {
  await clearSession();
  redirect("/login");
}