"use client";
// components/layout/app-shell.tsx
import { useState } from "react";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { cn } from "@/lib/utils";

interface AppShellProps {
  children: React.ReactNode;
  userRole: "admin" | "user";
  userName: string;
  title?: string;
}

export function AppShell({ children, userRole, userName, title }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  function closeSidebar() { setSidebarOpen(false); }

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-background">
      {/* Mobile backdrop — tap to close */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={closeSidebar}
          aria-hidden="true"
        />
      )}

      {/* Sidebar — off-canvas on mobile, static on desktop */}
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex-shrink-0",
          "transition-transform duration-200 ease-in-out",
          "md:static md:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <Sidebar
          userRole={userRole}
          userName={userName}
          onNavigate={closeSidebar}
        />
      </div>

      {/* Main content area */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar
          title={title}
          onMenuClick={() => setSidebarOpen((v) => !v)}
        />
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-3 md:p-6 scrollbar-thin">
          {children}
        </main>
      </div>
    </div>
  );
}