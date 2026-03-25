"use client";
// app/(app)/inventory/inventory-client.tsx
import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ClipboardList, Search, Boxes, ArrowLeftRight,
  Pill, Pencil, Check, X,
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
  originalQuantity?: number;
  editReason?: string;
  editedBy?: string;
}

// Product type sort order — same as sortProducts utility
const TYPE_ORDER: Record<string, number> = {
  tablet: 1, capsule: 2, syrup: 3, injection: 4,
  drops: 5, cream: 6, ointment: 7, inhaler: 8,
  patch: 9, suppository: 10, other: 11,
};

type FilterType = "all" | "stock-in" | "transfer" | "dispense";

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function getEntryMeta(entry: Entry) {
  if (entry.ledgerType === "main" && entry.type === "IN")
    return { label: "Stock IN", color: "text-success", badgeVariant: "success" as const };
  if (entry.ledgerType === "main" && entry.reference === "TRANSFER")
    return { label: "To Pharmacy", color: "text-primary", badgeVariant: "secondary" as const };
  if (entry.ledgerType === "pharmacy" && entry.reference === "TRANSFER")
    return { label: "From Main", color: "text-primary", badgeVariant: "secondary" as const };
  if (entry.ledgerType === "pharmacy" && entry.reference === "DISPENSE")
    return { label: "Dispensed", color: "text-destructive", badgeVariant: "critical" as const };
  if (entry.type === "ADJUSTMENT")
    return { label: "Adjustment", color: "text-muted-foreground", badgeVariant: "outline" as const };
  return { label: entry.type, color: "text-muted-foreground", badgeVariant: "outline" as const };
}

// Smart date picker — shows a scrollable list of available dates
function SmartDatePicker({
  availableDates,
  selected,
  onSelect,
  label,
}: {
  availableDates: string[];
  selected: string;
  onSelect: (d: string) => void;
  label: string;
}) {
  const [open, setOpen] = useState(false);

  function fmt(iso: string) {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
    });
  }

  return (
    <div className="relative space-y-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-sm hover:bg-muted/30 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <span className={selected ? "text-foreground" : "text-muted-foreground"}>
          {selected ? fmt(selected) : "Select date…"}
        </span>
        <span className="text-muted-foreground text-xs ml-2">▾</span>
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 mt-1 w-56 rounded-md border bg-popover shadow-lg overflow-hidden">
            {availableDates.length === 0 ? (
              <p className="px-3 py-4 text-xs text-muted-foreground text-center">
                No data for this filter
              </p>
            ) : (
              <ul className="max-h-60 overflow-y-auto scrollbar-thin">
                {availableDates.map((d) => (
                  <li key={d}>
                    <button
                      type="button"
                      onClick={() => { onSelect(d); setOpen(false); }}
                      className={`w-full text-left px-3 py-2 text-sm transition-colors hover:bg-accent ${
                        d === selected ? "bg-primary text-primary-foreground hover:bg-primary/90" : ""
                      }`}
                    >
                      {fmt(d)}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      {availableDates.length > 0 && (
        <p className="text-[10px] text-muted-foreground">
          {availableDates.length} date{availableDates.length !== 1 ? "s" : ""} with data
        </p>
      )}
    </div>
  );
}

export function InventoryClient({
  products,
  isAdmin,
  userId,
  allDates,
  stockInDates,
  transferDates,
  dispenseDates,
}: {
  products: Product[];
  isAdmin: boolean;
  userId: string;
  allDates: string[];
  stockInDates: string[];
  transferDates: string[];
  dispenseDates: string[];
}) {
  const router = useRouter();
  const defaultDate = allDates[0] ?? "";

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

  // Active dates changes based on filter type
  const activeDates = typeFilter === "stock-in" ? stockInDates
    : typeFilter === "transfer" ? transferDates
    : typeFilter === "dispense" ? dispenseDates
    : allDates;

  // When filter type changes, reset date to first available
  useEffect(() => {
    if (activeDates.length > 0) {
      setSelectedDate(activeDates[0]);
    } else {
      setSelectedDate("");
      setEntries([]);
    }
  }, [typeFilter]);

  async function loadEntries(date: string) {
    if (!date) return;
    setLoading(true);
    setEditingId(null);
    try {
      const result = await getDayInventoryAction(date);
      if (result.success) {
        // Sort entries by product type order then brand name
        const sorted = (result.data as Entry[]).sort((a, b) => {
          const productA = products.find((p) => p.id === a.productId);
          const productB = products.find((p) => p.id === b.productId);
          const orderA = TYPE_ORDER[productA?.type ?? ""] ?? 99;
          const orderB = TYPE_ORDER[productB?.type ?? ""] ?? 99;
          if (orderA !== orderB) return orderA - orderB;
          return a.brandName.localeCompare(b.brandName);
        });
        setEntries(sorted);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (selectedDate) loadEntries(selectedDate);
  }, [selectedDate]);

  function startEditing(entry: Entry) {
    setEditingId(entry.id);
    setEditQty(String(entry.quantity));
    setEditReason("");
  }

  function cancelEdit() { setEditingId(null); setEditQty(""); setEditReason(""); }

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

  // Apply type + search filter
  const filtered = entries.filter((e) => {
    if (search && !e.brandName.toLowerCase().includes(search.toLowerCase()) &&
        !e.genericName.toLowerCase().includes(search.toLowerCase())) return false;
    if (typeFilter === "stock-in" && !(e.ledgerType === "main" && e.type === "IN")) return false;
    if (typeFilter === "transfer" && e.reference !== "TRANSFER") return false;
    if (typeFilter === "dispense" && e.reference !== "DISPENSE") return false;
    return true;
  });

  const stockInCount  = entries.filter((e) => e.ledgerType === "main" && e.type === "IN").length;
  const transferCount = entries.filter((e) => e.reference === "TRANSFER" && e.ledgerType === "main").length;
  const dispenseCount = entries.filter((e) => e.reference === "DISPENSE").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ClipboardList className="h-5 w-5 text-primary" />
        <h2 className="text-xl font-semibold">Daily Inventory Log</h2>
      </div>

      {/* Controls */}
      <div className="flex flex-col gap-3 rounded-lg border bg-card p-3 sm:flex-row sm:flex-wrap sm:items-start">

        {/* Type filter — pill buttons */}
        <div className="space-y-1 w-full">
          <label className="text-xs font-medium text-muted-foreground">Filter by Type</label>
          <div className="flex flex-wrap gap-1.5">
            {([
              { key: "all",      label: "All",      icon: ClipboardList, count: entries.length },
              { key: "stock-in", label: "Stock IN", icon: Boxes,         count: stockInCount },
              { key: "transfer", label: "Transfer", icon: ArrowLeftRight, count: transferCount },
              { key: "dispense", label: "Dispense", icon: Pill,           count: dispenseCount },
            ] as const).map(({ key, label, icon: Icon, count }) => (
              <button key={key} onClick={() => setTypeFilter(key)}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium border transition-colors ${
                  typeFilter === key
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background border-border hover:bg-muted/50"
                }`}
              >
                <Icon className="h-3 w-3" />
                {label}
                {selectedDate && <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${typeFilter === key ? "bg-white/20" : "bg-muted"}`}>{count}</span>}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3 w-full sm:flex-row sm:items-end">
          {/* Smart date picker — only shows dates relevant to active filter */}
          <div className="w-full sm:w-52">
            <SmartDatePicker
              availableDates={activeDates}
              selected={selectedDate}
              onSelect={setSelectedDate}
              label={`Date — ${
                typeFilter === "all" ? "all transactions"
                : typeFilter === "stock-in" ? "Stock IN only"
                : typeFilter === "transfer" ? "Transfers only"
                : "Dispenses only"
              }`}
            />
          </div>

          {/* Search */}
          <div className="flex-1 space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Search product</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input type="text" placeholder="Brand or generic name…" value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
            </div>
          </div>
        </div>
      </div>

      {/* Summary pills */}
      {entries.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {stockInCount > 0 && (
            <span className="flex items-center gap-1.5 rounded-full bg-success/10 border border-success/20 px-3 py-1 text-xs font-medium text-success">
              <Boxes className="h-3.5 w-3.5" />
              {stockInCount} IN · {entries.filter(e => e.ledgerType === "main" && e.type === "IN").reduce((s, e) => s + e.quantity, 0).toLocaleString()} pcs
            </span>
          )}
          {transferCount > 0 && (
            <span className="flex items-center gap-1.5 rounded-full bg-primary/10 border border-primary/20 px-3 py-1 text-xs font-medium text-primary">
              <ArrowLeftRight className="h-3.5 w-3.5" />
              {transferCount} Transfers · {entries.filter(e => e.reference === "TRANSFER" && e.ledgerType === "main").reduce((s, e) => s + e.quantity, 0).toLocaleString()} pcs
            </span>
          )}
          {dispenseCount > 0 && (
            <span className="flex items-center gap-1.5 rounded-full bg-destructive/10 border border-destructive/20 px-3 py-1 text-xs font-medium text-destructive">
              <Pill className="h-3.5 w-3.5" />
              {dispenseCount} Dispensed · {entries.filter(e => e.reference === "DISPENSE").reduce((s, e) => s + e.quantity, 0).toLocaleString()} pcs
            </span>
          )}
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase w-14">Time</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase">Product</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase w-24">Type</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase w-20">Qty</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase hidden md:table-cell">Details</th>
                {isAdmin && <th className="px-3 py-2.5 w-12" />}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="py-12 text-center">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto" />
                </td></tr>
              ) : !selectedDate ? (
                <tr><td colSpan={6} className="py-12 text-center text-sm text-muted-foreground">
                  No data available for this filter
                </td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="py-12 text-center text-sm text-muted-foreground">
                  No transactions found
                </td></tr>
              ) : (
                filtered.map((entry) => {
                  const { label, badgeVariant } = getEntryMeta(entry);
                  const isEditingThis = editingId === entry.id;
                  return (
                    <tr key={`${entry.ledgerType}-${entry.id}`}
                      className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="px-3 py-2.5">
                        <span className="text-xs text-muted-foreground tabular-nums">{formatTime(entry.timestamp)}</span>
                      </td>
                      <td className="px-3 py-2.5 max-w-[130px] sm:max-w-none">
                        <p className="font-medium text-xs sm:text-sm truncate">{entry.brandName}</p>
                        <p className="hidden sm:block text-xs text-muted-foreground truncate">{entry.genericName}</p>
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge variant={badgeVariant} className="text-[10px] sm:text-xs whitespace-nowrap">{label}</Badge>
                      </td>
                      <td className="px-3 py-2.5">
                        {isEditingThis ? (
                          <input type="number" min="0" value={editQty} autoFocus
                            onChange={(e) => setEditQty(e.target.value)}
                            className="h-7 w-16 rounded border border-primary bg-background px-2 text-xs tabular-nums focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
                        ) : (
                          <span className="text-sm tabular-nums font-medium">
                            {entry.quantity.toLocaleString()}
                            <span className="ml-0.5 text-xs text-muted-foreground">{entry.unit}</span>
                            {entry.originalQuantity !== undefined && (
                              <span className="ml-1 text-[10px] text-muted-foreground line-through">{entry.originalQuantity}</span>
                            )}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 hidden md:table-cell">
                        {isEditingThis ? (
                          <input type="text" value={editReason}
                            onChange={(e) => setEditReason(e.target.value)}
                            placeholder="Reason for edit (required)"
                            className="h-7 w-full rounded border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
                        ) : (
                          <p className="text-xs text-muted-foreground truncate max-w-xs">
                            {[
                              entry.supplier && `From: ${entry.supplier}`,
                              entry.patientName && `Patient: ${entry.patientName}`,
                              entry.prescriptionNo && `Rx: ${entry.prescriptionNo}`,
                              entry.batch && entry.batch !== "MIGRATED" && `Batch: ${entry.batch}`,
                              entry.reason,
                              entry.editReason && `✎ ${entry.editReason}`,
                            ].filter(Boolean).join(" · ") || "—"}
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
          Showing {filtered.length} transaction{filtered.length !== 1 ? "s" : ""} · {selectedDate}
        </p>
      )}
    </div>
  );
}
