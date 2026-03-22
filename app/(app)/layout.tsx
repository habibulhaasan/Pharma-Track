// app/(app)/layout.tsx
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AppShell } from "@/components/layout/app-shell";
import { cookies } from "next/headers";

export const runtime = "nodejs";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const token = cookieStore.get("__pharmacy_session")?.value;
  
  console.log("=== AppLayout Debug ===");
  console.log("Cookie present:", !!token);
  console.log("Token length:", token?.length ?? 0);
  console.log("Token preview:", token?.slice(0, 30));

  let user = null;
  try {
    user = await getCurrentUser();
    console.log("getCurrentUser result:", user ? `uid=${user.id} role=${user.role}` : "NULL");
  } catch (e: any) {
    console.error("getCurrentUser threw:", e?.message);
  }

  if (!user) {
    console.log("No user — redirecting to /login");
    redirect("/login");
  }

  return (
    <AppShell userRole={user.role} userName={user.name}>
      {children}
    </AppShell>
  );
}