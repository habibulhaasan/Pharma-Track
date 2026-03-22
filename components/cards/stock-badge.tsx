// components/cards/stock-badge.tsx
import { Badge } from "@/components/ui/badge";
import { getStockStatus } from "@/utils/stockUtils";

interface StockBadgeProps {
  quantity: number;
  reorderLevel: number;
  unit?: string;
  showQty?: boolean;
}

const statusConfig = {
  out: { variant: "critical" as const, label: "Out of Stock" },
  critical: { variant: "critical" as const, label: "Critical" },
  low: { variant: "warning" as const, label: "Low Stock" },
  normal: { variant: "success" as const, label: "In Stock" },
};

export function StockBadge({ quantity, reorderLevel, unit, showQty = true }: StockBadgeProps) {
  const status = getStockStatus(quantity, reorderLevel);
  const config = statusConfig[status];

  return (
    <div className="flex items-center gap-1.5">
      {showQty && (
        <span className="font-medium tabular-nums text-sm">
          {quantity.toLocaleString()}
          {unit && <span className="ml-0.5 text-xs text-muted-foreground">{unit}</span>}
        </span>
      )}
      {(status === "out" || status === "critical" || status === "low") && (
        <Badge variant={config.variant} className="text-[10px] py-0">
          {config.label}
        </Badge>
      )}
    </div>
  );
}
