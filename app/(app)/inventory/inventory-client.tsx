"use client";
// app/(app)/inventory/inventory-client.tsx
import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ClipboardList, Search, Boxes, ArrowLeftRight,
  Pill, Pencil, Check, X, Trash2, Calendar,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CalendarPicker } from "@/components/ui/calendar-picker";
import { getDayInventoryAction, editTransactionAction, deleteTransactionAction, changeDateTransactionAction, bulkChangeDateAction } from "@/app/actions/inventory";

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
    return { label: "Stock IN", badgeVariant: "success" as const };
  if (entry.reference === "TRANSFER")
    return { label: "Main → Pharmacy", badgeVariant: "secondary" as const };
  if (entry.ledgerType === "pharmacy" && entry.reference === "DISPENSE")
    return { label: "Dispensed", badgeVariant: "critical" as const };
  if (entry.type === "ADJUSTMENT")
    return { label: "Adjustment", badgeVariant: "outline" as const };
  return { label: entry.type, badgeVariant: "outline" as const };
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

export function InventoryClient({
  products,
  isAdmin,
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

  const [typeFilter, setTypeFilter] = useState<FilterType>("all");
  const [search, setSearch] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editQty, setEditQty] = useState("");
  const [editReason, setEditReason] = useState("");
  const [isEditing, startEdit] = useTransition();

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<Entry | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [isDeleting, startDelete] = useTransition();

  // Change date state
  const [changeDateTarget, setChangeDateTarget] = useState<Entry | null>(null);
  const [newDate, setNewDate] = useState("");
  const [isChangingDate, startChangeDate] = useTransition();

  // Bulk date change state
  const [selectedEntries, setSelectedEntries] = useState<Set<string>>(new Set());
  const [bulkDate, setBulkDate] = useState("");
  const [isBulkChanging, startBulkChange] = useTransition();

  function toggleSelect(key: string) {
    setSelectedEntries((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function selectAll() {
    setSelectedEntries(new Set(filtered.map((e) => `${e.ledgerType}-${e.id}`)));
  }

  function clearSelection() { setSelectedEntries(new Set()); }

  function confirmBulkDateChange() {
    if (!bulkDate) { toast.error("Select a new date"); return; }
    if (selectedEntries.size === 0) { toast.error("Select at least one entry"); return; }

    const entries = filtered
      .filter((e) => selectedEntries.has(`${e.ledgerType}-${e.id}`))
      .map((e) => ({ productId: e.productId, ledgerType: e.ledgerType, entryId: e.id }));

    startBulkChange(async () => {
      const result = await bulkChangeDateAction({ entries, newDate: bulkDate });
      if (result.success) {
        const d = result.data as any;
        toast.success(`Date changed for ${d.succeeded} transaction${d.succeeded !== 1 ? "s" : ""}`);
        if (d.failed?.length > 0) toast.error(`${d.failed.length} failed`);
        clearSelection();
        setBulkDate("");
        loadEntries(selectedDate);
      } else {
        toast.error((result as any).error ?? "Bulk date change failed");
      }
    });
  }

  // Active dates depends on filter type
  const activeDates =
    typeFilter === "stock-in" ? stockInDates
    : typeFilter === "transfer" ? transferDates
    : typeFilter === "dispense" ? dispenseDates
    : allDates;

  const [selectedDate, setSelectedDate] = useState(activeDates[0] ?? "");

  // When filter changes, reset to first valid date for that filter
  useEffect(() => {
    const first = activeDates[0] ?? "";
    setSelectedDate(first);
    if (!first) setEntries([]);
  }, [typeFilter]);

  async function loadEntries(date: string) {
    if (!date) return;
    setLoading(true);
    setEditingId(null);
    try {
      const result = await getDayInventoryAction(date);
      if (result.success) {
        const sorted = (result.data as Entry[]).sort((a, b) => {
          const pa = products.find((p) => p.id === a.productId);
          const pb = products.find((p) => p.id === b.productId);
          const oa = TYPE_ORDER[pa?.type ?? ""] ?? 99;
          const ob = TYPE_ORDER[pb?.type ?? ""] ?? 99;
          if (oa !== ob) return oa - ob;
          return a.brandName.localeCompare(b.brandName);
        });
        setEntries(sorted);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (selectedDate) loadEntries(selectedDate); }, [selectedDate]);

  function startEditing(entry: Entry) { setEditingId(entry.id); setEditQty(String(entry.quantity)); setEditReason(""); }
  function cancelEdit() { setEditingId(null); setEditQty(""); setEditReason(""); }

  function confirmDelete(entry: Entry) {
    if (deleteReason.trim().length < 5) { toast.error("Enter a reason (min 5 characters)"); return; }
    startDelete(async () => {
      const result = await deleteTransactionAction({
        productId: entry.productId,
        ledgerType: entry.ledgerType,
        entryId: entry.id,
        reason: deleteReason.trim(),
      });
      if (result.success) {
        toast.success("Transaction deleted and stock reversed");
        setDeleteTarget(null);
        setDeleteReason("");
        loadEntries(selectedDate);
        router.refresh();
      } else {
        toast.error((result as any).error ?? "Delete failed");
      }
    });
  }

  function confirmChangeDate(entry: Entry) {
    if (!newDate) { toast.error("Select a new date"); return; }
    startChangeDate(async () => {
      const result = await changeDateTransactionAction({
        productId: entry.productId,
        ledgerType: entry.ledgerType,
        entryId: entry.id,
        newDate,
      });
      if (result.success) {
        toast.success("Date updated");
        setChangeDateTarget(null);
        setNewDate("");
        loadEntries(selectedDate);
      } else {
        toast.error((result as any).error ?? "Date change failed");
      }
    });
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

  const stockInCount  = entries.filter((e) => e.ledgerType === "main" && e.type === "IN").length;
  const transferCount = entries.filter((e) => e.reference === "TRANSFER" && e.ledgerType === "main").length;
  const dispenseCount = entries.filter((e) => e.reference === "DISPENSE").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ClipboardList className="h-5 w-5 text-primary" />
        <h2 className="text-xl font-semibold">Daily Inventory Log</h2>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">

        {/* Left — calendar + filters */}
        <div className="space-y-3 lg:w-64 lg:flex-shrink-0">

          {/* Type filter pills */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Show transactions</p>
            <div className="flex flex-wrap gap-1.5">
              {([
                { key: "all",      label: "All",      icon: ClipboardList },
                { key: "stock-in", label: "Stock IN", icon: Boxes },
                { key: "transfer", label: "Transfer", icon: ArrowLeftRight },
                { key: "dispense", label: "Dispense", icon: Pill },
              ] as const).map(({ key, label, icon: Icon }) => (
                <button key={key} onClick={() => setTypeFilter(key)}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium border transition-colors ${
                    typeFilter === key
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background border-border hover:bg-muted/50"
                  }`}>
                  <Icon className="h-3 w-3" />{label}
                </button>
              ))}
            </div>
          </div>

          {/* Calendar */}
          <CalendarPicker
            activeDates={activeDates}
            selected={selectedDate}
            onSelect={setSelectedDate}
          />

          {selectedDate && (
            <p className="text-xs text-center text-muted-foreground">
              Showing: <span className="font-medium text-foreground">{fmtDate(selectedDate)}</span>
            </p>
          )}
        </div>

        {/* Right — results */}
        <div className="flex-1 space-y-3 min-w-0">

          {/* Search + summary */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input type="text" placeholder="Search product…" value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
            </div>
            {entries.length > 0 && (
              <div className="flex flex-wrap gap-1.5 flex-shrink-0">
                {stockInCount > 0 && (
                  <span className="flex items-center gap-1 rounded-full bg-success/10 border border-success/20 px-2.5 py-0.5 text-[11px] font-medium text-success">
                    <Boxes className="h-3 w-3" />{stockInCount} IN
                  </span>
                )}
                {transferCount > 0 && (
                  <span className="flex items-center gap-1 rounded-full bg-primary/10 border border-primary/20 px-2.5 py-0.5 text-[11px] font-medium text-primary">
                    <ArrowLeftRight className="h-3 w-3" />{transferCount} Transfer
                  </span>
                )}
                {dispenseCount > 0 && (
                  <span className="flex items-center gap-1 rounded-full bg-destructive/10 border border-destructive/20 px-2.5 py-0.5 text-[11px] font-medium text-destructive">
                    <Pill className="h-3 w-3" />{dispenseCount} Dispensed
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Bulk action toolbar */}
          {isAdmin && selectedEntries.size > 0 && (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-primary/5 border-primary/20 px-4 py-2.5">
              <span className="text-xs font-medium text-primary">
                {selectedEntries.size} selected
              </span>
              <div className="flex items-center gap-2 ml-auto flex-wrap">
                <span className="text-xs text-muted-foreground">Change all to:</span>
                <input type="date" value={bulkDate} onChange={(e) => setBulkDate(e.target.value)}
                  className="h-7 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
                <button onClick={confirmBulkDateChange} disabled={isBulkChanging || !bulkDate}
                  className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors">
                  <Calendar className="h-3.5 w-3.5" />
                  Apply Date
                </button>
                <button onClick={clearSelection}
                  className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted/50 transition-colors">
                  Clear
                </button>
              </div>
            </div>
          )}

          {/* Table */}
          <div className="overflow-hidden rounded-lg border bg-card">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    {isAdmin && (
                    <th className="px-3 py-2.5 w-8">
                      <input type="checkbox"
                        checked={selectedEntries.size === filtered.length && filtered.length > 0}
                        onChange={(e) => e.target.checked ? selectAll() : clearSelection()}
                        className="h-3.5 w-3.5 rounded border-input accent-primary cursor-pointer" />
                    </th>
                  )}
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
                      Select a date from the calendar
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
                          className={`border-b last:border-0 hover:bg-muted/20 transition-colors ${selectedEntries.has(\`\${entry.ledgerType}-\${entry.id}\`) ? "bg-primary/5" : ""}`}>
                          {isAdmin && (
                            <td className="px-3 py-2.5">
                              <input type="checkbox"
                                checked={selectedEntries.has(`${entry.ledgerType}-${entry.id}`)}
                                onChange={() => toggleSelect(`${entry.ledgerType}-${entry.id}`)}
                                className="h-3.5 w-3.5 rounded border-input accent-primary cursor-pointer" />
                            </td>
                          )}
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
                                    className="rounded p-1 text-success hover:bg-success/10 transition-colors" title="Save">
                                    <Check className="h-4 w-4" />
                                  </button>
                                  <button onClick={cancelEdit}
                                    className="rounded p-1 text-destructive hover:bg-destructive/10 transition-colors" title="Cancel">
                                    <X className="h-4 w-4" />
                                  </button>
                                </div>
                              ) : deleteTarget?.id === entry.id ? (
                                <div className="flex items-center gap-1">
                                  <input type="text" value={deleteReason}
                                    onChange={(e) => setDeleteReason(e.target.value)}
                                    placeholder="Reason…"
                                    className="h-7 w-24 rounded border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
                                  <button onClick={() => confirmDelete(entry)} disabled={isDeleting}
                                    className="rounded p-1 text-destructive hover:bg-destructive/10 transition-colors" title="Confirm delete">
                                    <Check className="h-3.5 w-3.5" />
                                  </button>
                                  <button onClick={() => { setDeleteTarget(null); setDeleteReason(""); }}
                                    className="rounded p-1 text-muted-foreground hover:bg-muted/50 transition-colors" title="Cancel">
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              ) : changeDateTarget?.id === entry.id ? (
                                <div className="flex items-center gap-1">
                                  <input type="date" value={newDate}
                                    onChange={(e) => setNewDate(e.target.value)}
                                    className="h-7 rounded border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
                                  <button onClick={() => confirmChangeDate(entry)} disabled={isChangingDate}
                                    className="rounded p-1 text-success hover:bg-success/10 transition-colors" title="Save date">
                                    <Check className="h-3.5 w-3.5" />
                                  </button>
                                  <button onClick={() => { setChangeDateTarget(null); setNewDate(""); }}
                                    className="rounded p-1 text-muted-foreground hover:bg-muted/50 transition-colors" title="Cancel">
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              ) : (
                                <div className="flex gap-0.5">
                                  <button onClick={() => startEditing(entry)} title="Edit quantity"
                                    className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                  <button onClick={() => { setChangeDateTarget(entry); setNewDate(selectedDate); }} title="Change date"
                                    className="rounded p-1 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors">
                                    <Calendar className="h-3.5 w-3.5" />
                                  </button>
                                  <button onClick={() => { setDeleteTarget(entry); setDeleteReason(""); }} title="Delete & reverse"
                                    className="rounded p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
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
              {filtered.length} transaction{filtered.length !== 1 ? "s" : ""} · {fmtDate(selectedDate)}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}