"use client";
// app/(app)/inventory/inventory-client.tsx
import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ClipboardList, Search, Boxes, ArrowLeftRight,
  Pill, Pencil, Check, X, Filter,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getDayInventoryAction, editTransactionAction } from "@/app/actions/inventory";

interface Product { id: string; brandName: string; genericName: string; type: string; unit: string; }

interface Entry {
  id: string;
  productId: string;
  brandName: string;
  genericName: string;
  unit: string;
  ledgerType: "main" | "pharmacy";
  type: string;
  reference: string;
  quantity: number;
  price: number;
  batch: string;
  supplier: string;
  patientName: string;
  prescriptionNo: string;
  reason: string;
  userId: string;
  timestamp: string;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function getEntryLabel(entry: Entry): { label: string; icon: typeof Boxes; color: string; badgeVariant: "success" | "warning" | "critical" | "secondary" } {
  if (entry.ledgerType === "main" && entry.type === "IN")
    return { label: "Stock IN", icon: Boxes, color: "text-success", badgeVariant: "success" };
  if (entry.ledgerType === "main" && entry.reference === "TRANSFER")
    return { label: "To Pharmacy", icon: ArrowLeftRight, color: "text-warning", badgeVariant: "warning" };
  if (entry.ledgerType === "pharmacy" && entry.reference === "TRANSFER")
    return { label: "From Main", icon: ArrowLeftRight, color: "text-primary", badgeVariant: "secondary" };
  if (entry.ledgerType === "pharmacy" && entry.reference === "DISPENSE")
    return { label: "Dispensed", icon: Pill, color: "text-destructive", badgeVariant: "critical" };
  if (entry.type === "ADJUSTMENT")
    return { label: "Adjustment", icon: ClipboardList, color: "text-muted-foreground", badgeVariant: "secondary" };
  return { label: entry.type, icon: ClipboardList, color: "text-muted-foreground", badgeVariant: "secondary" };
}

type FilterType = "all" | "stock-in" | "transfer" | "dispense";

export function InventoryClient({
  products,
  activeDates,
  isAdmin,
  userId,
}: {
  products: Product[];
  activeDates: string[];
  isAdmin: boolean;
  userId: string;
}) {
  const router = useRouter();
  const today = new Date().toISOString().split("T")[0];
  const defaultDate = activeDates[0] ?? today;

  const [selectedDate, setSelectedDate] = useState(defaultDate);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(false);
  const [typeFilter, setTypeFilter] = useState<FilterType>("all");
  const [search, setSearch] = useState("");

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editQty, setEditQty] = useState("");
  const [editReason, setEditReason] = useState("");
  const [isEditing, startEdit] = useTransition();

  async function loadEntries(date: string) {
    setLoading(true);
    setEditingId(null);
    try {
      const result = await getDayInventoryAction(date);
      if (result.success) setEntries(result.data as Entry[]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadEntries(selectedDate); }, [selectedDate]);

  function handleDateChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    // Only allow dates that have data
    if (activeDates.includes(val)) setSelectedDate(val);
  }

  function startEditing(entry: Entry) {
    setEditingId(entry.id);
    setEditQty(String(entry.quantity));
    setEditReason("");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditQty("");
    setEditReason("");
  }

  function submitEdit(entry: Entry) {
    const newQty = parseInt(editQty, 10);
    if (isNaN(newQty) || newQty < 0) { toast.error("Enter a valid quantity"); return; }
    if (editReason.trim().length < 5) { toast.error("Enter a reason (min 5 characters)"); return; }

    startEdit(async () => {
      const result = await editTransactionAction({
        productId: entry.productId,
        ledgerType: entry.ledgerType,
        entryId: entry.id,
        newQuantity: newQty,
        reason: editReason.trim(),
      });
      if (result.success) {
        toast.success("Transaction updated");
        cancelEdit();
        loadEntries(selectedDate);
        router.refresh();
      } else {
        toast.error((result as any).error ?? "Update failed");
      }
    });
  }

  const filtered = entries.filter((e) => {
    if (search && !e.brandName.toLowerCase().includes(search.toLowerCase()) &&
        !e.genericName.toLowerCase().includes(search.toLowerCase())) return false;
    if (typeFilter === "stock-in" && !(e.ledgerType === "main" && e.type === "IN")) return false;
    if (typeFilter === "transfer" && e.reference !== "TRANSFER") return false;
    if (typeFilter === "dispense" && e.reference !== "DISPENSE") return false;
    return true;
  });

  // Summary counts
  const stockInCount = entries.filter((e) => e.ledgerType === "main" && e.type === "IN").length;
  const transferCount = entries.filter((e) => e.reference === "TRANSFER" && e.ledgerType === "main").length;
  const dispenseCount = entries.filter((e) => e.reference === "DISPENSE").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ClipboardList className="h-5 w-5 text-primary" />
        <h2 className="text-xl font-semibold">Daily Inventory Log</h2>
      </div>

      {/* Date + search controls */}
      <div className="flex flex-col gap-3 rounded-lg border bg-card p-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Date</label>
          <input
            type="date"
            value={selectedDate}
            onChange={handleDateChange}
            min={activeDates[activeDates.length - 1]}
            max={activeDates[0]}
            className="h-8 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <p className="text-[10px] text-muted-foreground">Only dates with data are valid</p>
        </div>

        <div className="flex-1 space-y-1 min-w-[160px]">
          <label className="text-xs font-medium text-muted-foreground">Search</label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search product…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
        </div>

        {/* Type filter */}
        <div className="flex flex-wrap gap-1">
          {([
            { key: "all", label: "All" },
            { key: "stock-in", label: `Stock IN (${stockInCount})` },
            { key: "transfer", label: `Transfer (${transferCount})` },
            { key: "dispense", label: `Dispense (${dispenseCount})` },
          ] as const).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTypeFilter(key)}
              className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                typeFilter === key
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background border-border hover:bg-muted/50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary pills */}
      {entries.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <div className="flex items-center gap-1.5 rounded-full bg-success/10 border border-success/20 px-3 py-1">
            <Boxes className="h-3.5 w-3.5 text-success" />
            <span className="text-xs font-medium text-success">
              {stockInCount} Stock IN · {entries.filter(e => e.ledgerType === "main" && e.type === "IN").reduce((s, e) => s + e.quantity, 0).toLocaleString()} pcs
            </span>
          </div>
          <div className="flex items-center gap-1.5 rounded-full bg-primary/10 border border-primary/20 px-3 py-1">
            <ArrowLeftRight className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-medium text-primary">
              {transferCount} Transfers · {entries.filter(e => e.reference === "TRANSFER" && e.ledgerType === "main").reduce((s, e) => s + e.quantity, 0).toLocaleString()} pcs
            </span>
          </div>
          <div className="flex items-center gap-1.5 rounded-full bg-destructive/10 border border-destructive/20 px-3 py-1">
            <Pill className="h-3.5 w-3.5 text-destructive" />
            <span className="text-xs font-medium text-destructive">
              {dispenseCount} Dispensed · {entries.filter(e => e.reference === "DISPENSE").reduce((s, e) => s + e.quantity, 0).toLocaleString()} pcs
            </span>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase w-16">Time</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase">Product</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase w-28">Type</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase w-24">Qty</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase hidden md:table-cell">Details</th>
                {isAdmin && <th className="px-3 py-2.5 w-16" />}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="py-12 text-center">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto" />
                </td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="py-12 text-center text-sm text-muted-foreground">
                  No transactions found for this date
                </td></tr>
              ) : (
                filtered.map((entry) => {
                  const { label, badgeVariant } = getEntryLabel(entry);
                  const isEditingThis = editingId === entry.id;

                  return (
                    <tr key={`${entry.ledgerType}-${entry.id}`}
                      className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="px-3 py-2.5">
                        <span className="text-xs text-muted-foreground tabular-nums">{formatTime(entry.timestamp)}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <p className="font-medium text-xs sm:text-sm truncate max-w-[130px] sm:max-w-none">{entry.brandName}</p>
                        <p className="hidden sm:block text-xs text-muted-foreground truncate">{entry.genericName}</p>
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge variant={badgeVariant} className="text-[10px] sm:text-xs whitespace-nowrap">{label}</Badge>
                      </td>
                      <td className="px-3 py-2.5">
                        {isEditingThis ? (
                          <input
                            type="number" min="0"
                            value={editQty}
                            onChange={(e) => setEditQty(e.target.value)}
                            autoFocus
                            className="h-7 w-16 rounded border border-primary bg-background px-2 text-xs tabular-nums focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          />
                        ) : (
                          <span className="text-sm tabular-nums font-medium">
                            {entry.quantity.toLocaleString()}
                            <span className="ml-0.5 text-xs text-muted-foreground">{entry.unit}</span>
                            {entry.originalQuantity !== undefined && (
                              <span className="ml-1 text-[10px] text-muted-foreground line-through">{(entry as any).originalQuantity}</span>
                            )}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 hidden md:table-cell">
                        {isEditingThis ? (
                          <input
                            type="text"
                            value={editReason}
                            onChange={(e) => setEditReason(e.target.value)}
                            placeholder="Reason for edit (required)"
                            className="h-7 w-full rounded border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          />
                        ) : (
                          <p className="text-xs text-muted-foreground truncate max-w-xs">
                            {entry.supplier && `From: ${entry.supplier}`}
                            {entry.patientName && `Patient: ${entry.patientName}`}
                            {entry.prescriptionNo && ` · Rx: ${entry.prescriptionNo}`}
                            {entry.batch && entry.batch !== "MIGRATED" && ` · Batch: ${entry.batch}`}
                            {entry.reason && entry.reason}
                            {(entry as any).editReason && (
                              <span className="text-warning"> · Edited: {(entry as any).editReason}</span>
                            )}
                          </p>
                        )}
                      </td>
                      {isAdmin && (
                        <td className="px-3 py-2.5">
                          {isEditingThis ? (
                            <div className="flex gap-1">
                              <button onClick={() => submitEdit(entry)} disabled={isEditing}
                                className="rounded p-1 text-success hover:bg-success/10 transition-colors">
                                <Check className="h-4 w-4" />
                              </button>
                              <button onClick={cancelEdit}
                                className="rounded p-1 text-destructive hover:bg-destructive/10 transition-colors">
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          ) : (
                            <button onClick={() => startEditing(entry)}
                              className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {filtered.length > 0 && (
        <p className="text-xs text-muted-foreground text-center">
          {filtered.length} transaction{filtered.length !== 1 ? "s" : ""} on {selectedDate}
        </p>
      )}
    </div>
  );
}