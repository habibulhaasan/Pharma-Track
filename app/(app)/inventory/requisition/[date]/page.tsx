// app/(print)/inventory/requisition/[date]/page.tsx
// Printable requisition page.
// Lives under (print)/ which has a bare layout — no AppShell, no sidebar, no topbar.
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { RequisitionPrint } from "./requisition-print";
import { sortProducts } from "@/utils/stockUtils";

export const runtime = "nodejs";

export default async function RequisitionPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  const user = await getCurrentUser();
  if (!user) notFound();

  // Validate date format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound();

  const db = getAdminDb();

  const [letterheadDoc, transferSnap, productsSnap] = await Promise.all([
    db.collection("_meta").doc("letterhead").get(),
    db.collection("transactions").doc(date).collection("transfer").get(),
    db.collection("products").get(),
  ]);

  // Serialize letterhead: extract only plain string fields.
  // Firestore Timestamp fields (e.g. updatedAt) cannot cross the
  // Server → Client Component boundary — they are class instances.
  const rawLetterhead = letterheadDoc.exists ? letterheadDoc.data()! : {};
  const letterhead = {
    logoUrl:                typeof rawLetterhead.logoUrl                === "string" ? rawLetterhead.logoUrl                : undefined,
    officeName:             typeof rawLetterhead.officeName             === "string" ? rawLetterhead.officeName             : undefined,
    officeAddress:          typeof rawLetterhead.officeAddress          === "string" ? rawLetterhead.officeAddress          : undefined,
    submittedToName:        typeof rawLetterhead.submittedToName        === "string" ? rawLetterhead.submittedToName        : undefined,
    submittedToDesignation: typeof rawLetterhead.submittedToDesignation === "string" ? rawLetterhead.submittedToDesignation : undefined,
    submittedToOfficeName:  typeof rawLetterhead.submittedToOfficeName  === "string" ? rawLetterhead.submittedToOfficeName  : undefined,
    submittedToAddress:     typeof rawLetterhead.submittedToAddress     === "string" ? rawLetterhead.submittedToAddress     : undefined,
    requisitorName:         typeof rawLetterhead.requisitorName         === "string" ? rawLetterhead.requisitorName         : undefined,
    requisitorDesignation:  typeof rawLetterhead.requisitorDesignation  === "string" ? rawLetterhead.requisitorDesignation  : undefined,
    requisitorOfficeName:   typeof rawLetterhead.requisitorOfficeName   === "string" ? rawLetterhead.requisitorOfficeName   : undefined,
    requisitorAddress:      typeof rawLetterhead.requisitorAddress      === "string" ? rawLetterhead.requisitorAddress      : undefined,
  };

  // Build product map for type-based sorting
  const productMap: Record<string, string> = {};
  productsSnap.docs.forEach((d) => {
    productMap[d.id] = d.data().type ?? "other";
  });

  // Serialize transfer entries
  const entries = transferSnap.docs
    .map((d) => {
      const data = d.data();
      return {
        id:          d.id,
        productId:   data.productId   ?? "",
        brandName:   data.brandName   ?? "",
        genericName: data.genericName ?? "",
        unit:        data.unit        ?? "",
        quantity:    data.quantity    ?? 0,
        batch:       data.batch       ?? "",
        type:        productMap[data.productId] ?? "other",
      };
    })
    .filter((e) => e.quantity > 0);

  if (entries.length === 0) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ textAlign: "center" }}>
          <p style={{ fontSize: "1.1rem", fontWeight: 600 }}>No transfer entries found</p>
          <p style={{ color: "#666", marginTop: "6px", fontSize: ".9rem" }}>for {date}</p>
        </div>
      </div>
    );
  }

  const sorted = sortProducts(entries);

  const displayDate = new Date(date + "T00:00:00").toLocaleDateString("en-GB", {
    day: "2-digit", month: "long", year: "numeric",
  });

  return (
    <RequisitionPrint
      date={displayDate}
      rawDate={date}
      entries={sorted}
      letterhead={letterhead}
    />
  );
}