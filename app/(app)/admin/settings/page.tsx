// app/(app)/admin/settings/page.tsx
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { SettingsClient } from "@/app/(app)/admin/settings/settings-client";

export const runtime = "nodejs";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") redirect("/dashboard");

  const db = getAdminDb();
  const doc = await db.collection("_meta").doc("letterhead").get();
  const settings = doc.exists ? doc.data() : {};

  return <SettingsClient initialSettings={settings ?? {}} />;
}