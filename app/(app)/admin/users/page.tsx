// app/(app)/admin/users/page.tsx
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getAllUsers } from "@/services/userService";
import { AdminUserCard } from "@/components/cards/admin-user-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users } from "lucide-react";

export const runtime = "nodejs";

function serializeUser(u: any) {
  return {
    id: u.id,
    name: u.name ?? "",
    email: u.email ?? "",
    phone: u.phone ?? "",
    role: u.role ?? "user",
    status: u.status ?? "pending",
    createdAt: u.createdAt?.toDate?.()?.toISOString() ?? null,
  };
}

export default async function UsersPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") redirect("/dashboard");

  const allUsers = (await getAllUsers()) as any[];

  const pending = allUsers.filter((u) => u.status === "pending").map(serializeUser);
  const active = allUsers.filter((u) => u.status === "active").map(serializeUser);
  const disabled = allUsers.filter((u) => u.status === "disabled").map(serializeUser);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Users className="h-5 w-5 text-primary" />
        <h2 className="text-xl font-semibold">User Management</h2>
        <span className="ml-auto text-sm text-muted-foreground">
          {allUsers.length} total users
        </span>
      </div>

      {pending.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              Pending Approvals
              <span className="rounded-full bg-warning/15 px-2 py-0.5 text-xs font-semibold text-warning">
                {pending.length}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-2">
            {pending.map((u) => <AdminUserCard key={u.id} user={u} />)}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            Active Users
            <span className="rounded-full bg-success/15 px-2 py-0.5 text-xs font-semibold text-success">
              {active.length}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-2">
          {active.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">No active users</p>
          ) : (
            active.map((u) => <AdminUserCard key={u.id} user={u} />)
          )}
        </CardContent>
      </Card>

      {disabled.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              Disabled Users
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                {disabled.length}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-2">
            {disabled.map((u) => <AdminUserCard key={u.id} user={u} />)}
          </CardContent>
        </Card>
      )}
    </div>
  );
}