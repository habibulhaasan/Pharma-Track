"use client";
// app/(app)/admin/settings/settings-client.tsx
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Settings, Save, Building2, User, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveLetterheadAction } from "@/app/actions/settings";

interface LetterheadSettings {
  logoUrl?: string;
  officeName?: string;
  officeAddress?: string;
  submittedToName?: string;
  submittedToDesignation?: string;
  submittedToOfficeName?: string;
  submittedToAddress?: string;
  requisitorName?: string;
  requisitorDesignation?: string;
  requisitorOfficeName?: string;
  requisitorAddress?: string;
}

export function SettingsClient({ initialSettings }: { initialSettings: LetterheadSettings }) {
  const [form, setForm] = useState<LetterheadSettings>(initialSettings);
  const [isPending, startTransition] = useTransition();

  function set(key: keyof LetterheadSettings, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await saveLetterheadAction(form);
      if (result.success) toast.success("Settings saved");
      else toast.error((result as any).error ?? "Failed to save");
    });
  }

  const inputClass = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";
  const textareaClass = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none";

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-2">
        <Settings className="h-5 w-5 text-primary" />
        <h2 className="text-xl font-semibold">Letterhead Settings</h2>
      </div>

      <p className="text-sm text-muted-foreground">
        These details appear on printed requisitions. Configure once and reuse across all prints.
      </p>

      <form onSubmit={handleSubmit} className="space-y-6">

        {/* Office Details */}
        <div className="rounded-lg border bg-card p-4 space-y-4">
          <div className="flex items-center gap-2 border-b pb-2">
            <Building2 className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Office / Facility Details</h3>
          </div>

          <div className="space-y-1.5">
            <Label>Logo URL</Label>
            <input
              value={form.logoUrl ?? ""}
              onChange={(e) => set("logoUrl", e.target.value)}
              placeholder="https://... (link to your logo image)"
              className={inputClass}
            />
            <p className="text-[10px] text-muted-foreground">
              Use a direct image link (Google Drive shared link, Imgur, etc.)
            </p>
          </div>

          {form.logoUrl && (
            <div className="flex items-center gap-3">
              <img
                src={form.logoUrl}
                alt="Logo preview"
                className="h-16 w-16 object-contain rounded border"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
              <p className="text-xs text-muted-foreground">Logo preview</p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Office / Facility Name *</Label>
            <input
              value={form.officeName ?? ""}
              onChange={(e) => set("officeName", e.target.value)}
              placeholder="Babrijhar Union Health & Family Welfare Centre"
              className={inputClass}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Office Address</Label>
            <textarea
              rows={2}
              value={form.officeAddress ?? ""}
              onChange={(e) => set("officeAddress", e.target.value)}
              placeholder="Village, Union, Upazila, District"
              className={textareaClass}
            />
          </div>
        </div>

        {/* Submitted To */}
        <div className="rounded-lg border bg-card p-4 space-y-4">
          <div className="flex items-center gap-2 border-b pb-2">
            <User className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Submitted To</h3>
            <span className="text-xs text-muted-foreground ml-1">(appears bottom-left)</span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <input value={form.submittedToName ?? ""} onChange={(e) => set("submittedToName", e.target.value)}
                placeholder="Dr. Mohammad Rahman" className={inputClass} />
            </div>
            <div className="space-y-1.5">
              <Label>Designation</Label>
              <input value={form.submittedToDesignation ?? ""} onChange={(e) => set("submittedToDesignation", e.target.value)}
                placeholder="Upazila Health Officer" className={inputClass} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Office Name</Label>
            <input value={form.submittedToOfficeName ?? ""} onChange={(e) => set("submittedToOfficeName", e.target.value)}
              placeholder="Upazila Health Complex" className={inputClass} />
          </div>
          <div className="space-y-1.5">
            <Label>Address</Label>
            <textarea rows={2} value={form.submittedToAddress ?? ""} onChange={(e) => set("submittedToAddress", e.target.value)}
              placeholder="Upazila, District" className={textareaClass} />
          </div>
        </div>

        {/* Requisitor */}
        <div className="rounded-lg border bg-card p-4 space-y-4">
          <div className="flex items-center gap-2 border-b pb-2">
            <FileText className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Requisitor (Sender)</h3>
            <span className="text-xs text-muted-foreground ml-1">(appears bottom-right)</span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <input value={form.requisitorName ?? ""} onChange={(e) => set("requisitorName", e.target.value)}
                placeholder="Md. Habibul Hasan" className={inputClass} />
            </div>
            <div className="space-y-1.5">
              <Label>Designation</Label>
              <input value={form.requisitorDesignation ?? ""} onChange={(e) => set("requisitorDesignation", e.target.value)}
                placeholder="Health Assistant" className={inputClass} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Office Name</Label>
            <input value={form.requisitorOfficeName ?? ""} onChange={(e) => set("requisitorOfficeName", e.target.value)}
              placeholder="Babrijhar Union Health & Family Welfare Centre" className={inputClass} />
          </div>
          <div className="space-y-1.5">
            <Label>Address</Label>
            <textarea rows={2} value={form.requisitorAddress ?? ""} onChange={(e) => set("requisitorAddress", e.target.value)}
              placeholder="Village, Union, Upazila, District" className={textareaClass} />
          </div>
        </div>

        {/* Preview note */}
        <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-xs text-primary">
          After saving, go to <strong>Inventory Log → Transfer filter → select a date → Print Requisition</strong> to see the full A4 preview.
        </div>

        <Button type="submit" loading={isPending} className="gap-1.5 w-full sm:w-auto">
          <Save className="h-4 w-4" />
          Save Letterhead Settings
        </Button>
      </form>
    </div>
  );
}