// app/(app)/dashboard/page.tsx
import { getCurrentUser } from "@/lib/auth";
import { getDashboardStats } from "@/services/reportService";
import { getAllProducts } from "@/services/productService";
import { getAllStockLevels } from "@/services/stockService";
import { StatCard } from "@/components/cards/stat-card";
import { StockBadge } from "@/components/cards/stock-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Package, AlertTriangle, Activity, Users, DollarSign, Clock } from "lucide-react";
import { formatCurrency } from "@/utils/currency";
import { getStockStatus } from "@/utils/stockUtils";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const runtime = "nodejs";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  const [stats, products, { mainMap, pharmMap }] = await Promise.all([
    getDashboardStats(),
    getAllProducts(),
    getAllStockLevels(),
  ]);

  // Serialize — strip all Timestamp fields, only pass primitives
  const lowStockItems = (products as any[])
    .map((p) => ({
      id: p.id,
      genericName: p.genericName,
      brandName: p.brandName,
      unit: p.unit,
      reorderLevel: p.reorderLevel,
      mainQty: mainMap[p.id] ?? 0,
      pharmQty: pharmMap[p.id] ?? 0,
    }))
    .filter((p) => getStockStatus(p.mainQty, p.reorderLevel) !== "normal")
    .slice(0, 10);

  const greeting =
    new Date().getHours() < 12
      ? "Good morning"
      : new Date().getHours() < 17
      ? "Good afternoon"
      : "Good evening";

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-xl font-semibold">
          {greeting}, {user?.name?.split(" ")[0]} 👋
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Here&apos;s what&apos;s happening today
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          title="Total Products"
          value={stats.totalProducts}
          icon={Package}
          subtitle="Active in catalog"
        />
        <StatCard
          title="Low Stock Alerts"
          value={stats.lowStockCount}
          icon={AlertTriangle}
          variant={stats.lowStockCount > 0 ? "warning" : "success"}
          subtitle="Need reorder"
        />
        <StatCard
          title="Dispensed Today"
          value={stats.todayDispensed}
          icon={Activity}
          variant="success"
          subtitle="Items dispensed"
        />
        {user?.role === "admin" ? (
          <StatCard
            title="Pending Approvals"
            value={stats.pendingUsers}
            icon={Users}
            variant={stats.pendingUsers > 0 ? "warning" : "default"}
            subtitle="User registrations"
          />
        ) : (
          <StatCard
            title="Stock Value"
            value={formatCurrency(stats.totalMainStockValue)}
            icon={DollarSign}
            subtitle="Main stock estimate"
          />
        )}
      </div>

      {/* Low Stock + Quick Actions */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-sm">Low Stock Items</CardTitle>
              <Link href="/stock/main">
                <Button variant="ghost" size="sm" className="text-xs h-7">
                  View All
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="p-0">
              {lowStockItems.length === 0 ? (
                <p className="px-5 pb-5 text-sm text-muted-foreground">
                  All stock levels are healthy ✓
                </p>
              ) : (
                <div className="divide-y">
                  {lowStockItems.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between px-5 py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {item.brandName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {item.genericName}
                        </p>
                      </div>
                      <div className="ml-3">
                        <StockBadge
                          quantity={item.mainQty}
                          reorderLevel={item.reorderLevel}
                          unit={item.unit}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-3">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pt-0">
              <Link href="/stock/main">
                <Button
                  variant="outline"
                  className="w-full justify-start text-sm h-9"
                  size="sm"
                >
                  <Package className="h-4 w-4 mr-2" />
                  Add Stock (Purchase)
                </Button>
              </Link>
              <Link href="/stock/transfer">
                <Button
                  variant="outline"
                  className="w-full justify-start text-sm h-9"
                  size="sm"
                >
                  <Activity className="h-4 w-4 mr-2" />
                  Transfer to Pharmacy
                </Button>
              </Link>
              <Link href="/stock/pharmacy">
                <Button
                  variant="outline"
                  className="w-full justify-start text-sm h-9"
                  size="sm"
                >
                  <Clock className="h-4 w-4 mr-2" />
                  Dispense Medicines
                </Button>
              </Link>
              {user?.role === "admin" && (
                <Link href="/admin">
                  <Button
                    variant="outline"
                    className="w-full justify-start text-sm h-9"
                    size="sm"
                  >
                    <Users className="h-4 w-4 mr-2" />
                    Admin Panel
                    {stats.pendingUsers > 0 && (
                      <Badge variant="warning" className="ml-auto text-[10px] py-0">
                        {stats.pendingUsers}
                      </Badge>
                    )}
                  </Button>
                </Link>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}