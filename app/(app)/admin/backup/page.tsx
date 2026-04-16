// app/(app)/admin/backup/page.tsx
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { BackupExportButton } from "@/components/backup-export-button";
import { Database, Shield, RotateCcw } from "lucide-react";

export const runtime = "nodejs";

export default async function BackupPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") redirect("/dashboard");

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-2">
        <Database className="h-5 w-5 text-primary" />
        <h2 className="text-xl font-semibold">Backup & Restore</h2>
      </div>

      <p className="text-sm text-muted-foreground">
        Export your entire database to a JSON file. Store it safely.
        Use the import script to restore if needed.
      </p>

      {/* Export card */}
      <BackupExportButton />

      {/* How to restore */}
      <div className="rounded-lg border bg-card p-4 space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <RotateCcw className="h-4 w-4 text-primary" />
          How to Restore
        </h3>
        <ol className="text-xs text-muted-foreground space-y-2 list-decimal list-inside">
          <li>Download the backup JSON from above</li>
          <li>If resetting Firebase — delete old data first from Firebase Console</li>
          <li>Run the import script from your local project directory:</li>
        </ol>
        <div className="rounded-md bg-muted px-3 py-2 font-mono text-[11px] space-y-1">
          <p className="text-muted-foreground"># Safe restore (merges, won't overwrite existing)</p>
          <p>npx ts-node --project tsconfig.seed.json \</p>
          <p>&nbsp;&nbsp;scripts/import-backup.ts ./pharmatrack-backup-2025-03-31.json</p>
          <br />
          <p className="text-muted-foreground"># Force restore (overwrites everything)</p>
          <p>npx ts-node --project tsconfig.seed.json \</p>
          <p>&nbsp;&nbsp;scripts/import-backup.ts ./backup.json --force</p>
          <br />
          <p className="text-muted-foreground"># Restore only specific collections</p>
          <p>npx ts-node --project tsconfig.seed.json \</p>
          <p>&nbsp;&nbsp;scripts/import-backup.ts ./backup.json --only=products,transactions</p>
        </div>

        <div className="text-xs text-muted-foreground space-y-1">
          <p className="font-medium text-foreground">Available --only= values:</p>
          <p>products, mainStock, pharmacyStock, transactions, _meta, users</p>
        </div>
      </div>

      {/* Security note */}
      <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 flex gap-3">
        <Shield className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
        <div className="text-xs text-muted-foreground space-y-1">
          <p className="font-medium text-foreground">Security Notes</p>
          <p>• Backup files contain patient names and prescription numbers — store securely</p>
          <p>• User passwords are NOT included in the backup (Firebase Auth handles those separately)</p>
          <p>• Keep backups in a private, encrypted location</p>
          <p>• Export weekly to avoid data loss</p>
        </div>
      </div>
    </div>
  );
}