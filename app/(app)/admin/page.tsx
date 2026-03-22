// app/(app)/admin/page.tsx
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getPendingUsers, getAllUsers } from "@/services/userService";
import { getDashboardStats } from "@/services/reportService";
import { AdminUserCard } from "@/components/cards/admin-user-card";
import { StatCard } from "@/components/cards/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, UserCheck, UserX, Package, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

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

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") redirect("/dashboard");

  const [pendingUsers, allUsers, stats] = await Promise.all([
    getPendingUsers(),
    getAllUsers(),
    getDashboardStats(),
  ]);

  const serializedPending = (pendingUsers as any[]).map(serializeUser);
  const activeUsers = (allUsers as any[]).filter((u) => u.status === "active");
  const disabledUsers = (allUsers as any[]).filter((u) => u.status === "disabled");

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-primary" />
        <h2 className="text-xl font-semibold">Admin Panel</h2>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          title="Pending Approvals"
          value={serializedPending.length}
          icon={Users}
          variant={serializedPending.length > 0 ? "warning" : "default"}
        />
        <StatCard
          title="Active Users"
          value={activeUsers.length}
          icon={UserCheck}
          variant="success"
        />
        <StatCard
          title="Disabled Users"
          value={disabledUsers.length}
          icon={UserX}
          variant={disabledUsers.length > 0 ? "danger" : "default"}
        />
        <StatCard
          title="Total Products"
          value={stats.totalProducts}
          icon={Package}
        />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            Pending Approvals
            {serializedPending.length > 0 && (
              <span className="rounded-full bg-warning/15 px-2 py-0.5 text-xs font-semibold text-warning">
                {serializedPending.length}
              </span>
            )}
          </CardTitle>
          <Link href="/admin/users">
            <Button variant="ghost" size="sm" className="text-xs h-7">
              All Users →
            </Button>
          </Link>
        </CardHeader>
        <CardContent className="pt-0">
          {serializedPending.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No pending approvals
            </p>
          ) : (
            <div className="space-y-2">
              {serializedPending.map((u) => (
                <AdminUserCard key={u.id} user={u} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[
          { href: "/products", label: "Manage Products", desc: "Add, edit, soft-delete products" },
          { href: "/reports", label: "View Reports", desc: "Stock value, expiry, activity" },
          { href: "/admin/users", label: "Manage Users", desc: "Approve, activate, disable users" },
        ].map((item) => (
          <Link key={item.href} href={item.href}>
            <Card className="hover:border-primary/50 hover:shadow-sm transition-all cursor-pointer h-full">
              <CardContent className="p-4">
                <p className="text-sm font-semibold">{item.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}