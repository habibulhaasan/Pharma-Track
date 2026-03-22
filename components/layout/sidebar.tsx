"use client";
// components/layout/sidebar.tsx
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Package, ArrowLeftRight, Pill,
  BarChart3, Users, LogOut, ChevronRight, ShieldCheck, Boxes,
  ClipboardList,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { logoutAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { useTransition } from "react";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/products", label: "Products", icon: Package },
  { href: "/stock/main", label: "Stock IN (Purchase)", icon: Boxes },
  { href: "/stock/transfer", label: "Stock to Pharmacy", icon: ArrowLeftRight },
  { href: "/stock/pharmacy", label: "Dispense", icon: Pill },
  { href: "/ledger", label: "Ledger", icon: ClipboardList },
  { href: "/reports", label: "Reports", icon: BarChart3, adminOnly: true },
  { href: "/admin", label: "Admin Panel", icon: ShieldCheck, adminOnly: true },
  { href: "/admin/users", label: "Users", icon: Users, adminOnly: true },
  { href: "/admin/stock-adjustment", label: "Stock Adjustment", icon: Settings, adminOnly: true },
];

interface SidebarProps {
  userRole: "admin" | "user";
  userName: string;
}

export function Sidebar({ userRole, userName }: SidebarProps) {
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  const visibleItems = navItems.filter(
    (item) => !item.adminOnly || userRole === "admin"
  );

  // De-duplicate (Reports and Ledger both use BarChart3 — just a display icon)
  const uniqueItems = visibleItems.filter(
    (item, idx, arr) => arr.findIndex((i) => i.href === item.href) === idx
  );

  function handleLogout() {
    startTransition(async () => {
      await logoutAction();
    });
  }

  return (
    <aside className="flex h-full w-60 flex-col border-r bg-card">
      {/* Logo */}
      <div className="flex h-14 items-center gap-2 border-b px-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary">
          <Pill className="h-4 w-4 text-primary-foreground" />
        </div>
        <span className="font-semibold text-sm tracking-tight">PharmaTrack</span>
        {userRole === "admin" && (
          <span className="ml-auto rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
            ADMIN
          </span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 scrollbar-thin">
        <ul className="space-y-0.5">
          {uniqueItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              pathname === item.href ||
              (item.href !== "/dashboard" &&
                item.href !== "/admin" &&
                pathname.startsWith(item.href));
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {item.label}
                  {isActive && (
                    <ChevronRight className="ml-auto h-3 w-3 opacity-60" />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* User footer */}
      <div className="border-t p-3">
        <div className="mb-2 flex items-center gap-2.5 rounded-md px-2 py-1.5">
          <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary uppercase">
            {userName.charAt(0)}
            
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium">{userName ?? "Unknown"}</p>
            <p className="text-[10px] text-muted-foreground capitalize">{userRole}</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-muted-foreground hover:text-destructive"
          onClick={handleLogout}
          loading={isPending}
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </Button>
      </div>
    </aside>
  );
}
