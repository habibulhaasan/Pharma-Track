"use client";
// components/cards/admin-user-card.tsx
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { UserCheck, UserX, User, Phone, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { approveUserAction, disableUserAction } from "@/app/actions/users";
import { formatRelative } from "@/utils/date";

interface AdminUserCardProps {
  user: {
    id: string;
    name: string;
    email: string;
    phone: string;
    role: string;
    status: string;
    createdAt: any;
  };
}

const statusBadge: Record<string, any> = {
  pending: { variant: "warning", label: "Pending" },
  active: { variant: "success", label: "Active" },
  disabled: { variant: "critical", label: "Disabled" },
};

export function AdminUserCard({ user }: AdminUserCardProps) {
  const [isPending, startTransition] = useTransition();
  const [localStatus, setLocalStatus] = useState(user.status);

  function handleApprove() {
    startTransition(async () => {
      const result = await approveUserAction({ userId: user.id, status: "active" });
      if (result.success) {
        toast.success(`${user.name} approved`);
        setLocalStatus("active");
      } else {
        toast.error((result as any).error);
      }
    });
  }

  function handleDisable() {
    startTransition(async () => {
      const result = await disableUserAction({ userId: user.id });
      if (result.success) {
        toast.success(`${user.name} disabled`);
        setLocalStatus("disabled");
      } else {
        toast.error((result as any).error);
      }
    });
  }

  const badge = statusBadge[localStatus] ?? statusBadge.pending;

  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card p-3 hover:bg-muted/20 transition-colors">
      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary uppercase">
        {user.name.charAt(0)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-medium truncate">{user.name}</p>
          <Badge variant={badge.variant} className="text-[10px] py-0 px-1.5">{badge.label}</Badge>
        </div>
        <div className="flex items-center gap-3 mt-0.5">
          <span className="text-xs text-muted-foreground truncate flex items-center gap-1">
            <Mail className="h-3 w-3" />{user.email}
          </span>
          {user.phone && (
            <span className="text-xs text-muted-foreground hidden sm:flex items-center gap-1">
              <Phone className="h-3 w-3" />{user.phone}
            </span>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground mt-0.5">{formatRelative(user.createdAt)}</p>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {localStatus !== "active" && (
          <Button size="sm" variant="success" onClick={handleApprove} disabled={isPending} className="h-7 px-2 text-xs gap-1">
            <UserCheck className="h-3.5 w-3.5" />Approve
          </Button>
        )}
        {localStatus !== "disabled" && (
          <Button size="sm" variant="outline" onClick={handleDisable} disabled={isPending} className="h-7 px-2 text-xs gap-1 hover:text-destructive hover:border-destructive">
            <UserX className="h-3.5 w-3.5" />Disable
          </Button>
        )}
      </div>
    </div>
  );
}