import { getAdminDb } from "@/lib/firebaseAdmin"; 
import { SettingsClient } from "./settings-client";

export default async function SettingsPage() {
  const adminDb = getAdminDb(); 
  const snap = await adminDb.collection("settings").doc("letterhead").get();

  // If document doesn't exist, use an empty object
  const data = snap.exists ? snap.data() : {};

  // We create a fresh object with ONLY strings. 
  // This physically blocks 'updatedAt' from entering the object.
  const settings = {
    logoUrl:                String(data?.logoUrl ?? ""),
    officeName:             String(data?.officeName ?? ""),
    officeAddress:          String(data?.officeAddress ?? ""),
    submittedToName:        String(data?.submittedToName ?? ""),
    submittedToDesignation: String(data?.submittedToDesignation ?? ""),
    submittedToOfficeName:  String(data?.submittedToOfficeName ?? ""),
    submittedToAddress:     String(data?.submittedToAddress ?? ""),
    requisitorName:         String(data?.requisitorName ?? ""),
    requisitorDesignation:  String(data?.requisitorDesignation ?? ""),
    requisitorOfficeName:   String(data?.requisitorOfficeName ?? ""),
    requisitorAddress:      String(data?.requisitorAddress ?? ""),
  };

  return (
    <div className="p-6">
      <SettingsClient initialSettings={settings} />
    </div>
  );
}