// app/(app)/inventory/requisition/[date]/page.tsx
// A4 printable requisition page for transfers on a specific date.
// Opens in new tab, auto-triggers print dialog.
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { RequisitionPrint } from "@/app/(app)/inventory/requisition/[date]/requisition-print";
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

  // Fetch letterhead settings and transfer entries in parallel
  const [letterheadDoc, transferSnap, productsSnap] = await Promise.all([
    db.collection("_meta").doc("letterhead").get(),
    db.collection("transactions").doc(date).collection("transfer").get(),
    db.collection("products").get(),
  ]);

  const letterhead = letterheadDoc.exists ? letterheadDoc.data()! : {};

  // Build product map for type-based sorting
  const productMap: Record<string, string> = {};
  productsSnap.docs.forEach((d) => {
    productMap[d.id] = d.data().type ?? "other";
  });

  // Serialize transfer entries
  const entries = transferSnap.docs
    .map((d) => {
      const data = d.data();
      const ts = data.timestamp?.toDate?.() ?? null;
      return {
        id: d.id,
        productId: data.productId ?? "",
        brandName: data.brandName ?? "",
        genericName: data.genericName ?? "",
        unit: data.unit ?? "",
        quantity: data.quantity ?? 0,
        batch: data.batch ?? "",
        type: productMap[data.productId] ?? "other",
      };
    })
    .filter((e) => e.quantity > 0);

  if (entries.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-lg font-semibold">No transfer entries found</p>
          <p className="text-muted-foreground text-sm mt-1">for {date}</p>
        </div>
      </div>
    );
  }

  // Sort by type (Tablet → Capsule → Syrup → rest) then brand name
  const sorted = sortProducts(entries);

  // Format date for display
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