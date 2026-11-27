// lib/monthly-report-pdf.ts
// One PDF for a whole year: every product gets its own block with 12 months of
// Opening / IN / OUT / Balance. Products are listed in the order passed in.
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";

const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export interface PdfMonth { month: number; opening: number; in: number; out: number; closing: number }
export interface PdfProduct { brandName: string; genericName: string; unit: string; months: PdfMonth[] }

export interface YearReportPDFOptions {
  kind: "main" | "pharmacy";
  year: number;
  products: PdfProduct[];
}

interface Letterhead { logoUrl: string; officeName: string; officeAddress: string }
const FALLBACK_LH: Letterhead = {
  logoUrl: "/logo.png",
  officeName: "Babrijhar (Chapra Saramjani) Union Health Sub Center",
  officeAddress: "Sadar, Nilphamari",
};

async function fetchLetterhead(): Promise<Letterhead> {
  try {
    const snap = await getDoc(doc(db, "_meta", "letterhead"));
    if (snap.exists()) {
      const d = snap.data();
      return {
        logoUrl: d.logoUrl || FALLBACK_LH.logoUrl,
        officeName: d.officeName || FALLBACK_LH.officeName,
        officeAddress: d.officeAddress || FALLBACK_LH.officeAddress,
      };
    }
  } catch {}
  return FALLBACK_LH;
}

async function loadImageAsBase64(url: string): Promise<string | null> {
  try {
    const fetchUrl = url.startsWith("/") ? url : `/api/proxy-image?url=${encodeURIComponent(url)}`;
    const res = await fetch(fetchUrl);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const r = new FileReader();
      r.onloadend = () => resolve(r.result as string);
      r.onerror = () => resolve(null);
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

const fmt = (v: number) => v.toLocaleString("en-US");

export async function downloadYearReportPDF(opts: YearReportPDFOptions) {
  const { kind, year, products } = opts;
  const kindLabel = kind === "main" ? "Main Stock" : "Pharmacy";

  const lh = await fetchLetterhead();
  const logo = await loadImageAsBase64(lh.logoUrl);

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 12;
  const bottom = pageH - 14;
  const BLOCK_H = 80; // title + head + 12 rows + total + gap (approx.)

  // ── Letterhead (first page only) ────────────────────────────────────────
  let y = margin;
  const logoSize = 18;
  if (logo) {
    try { pdf.addImage(logo, logo.startsWith("data:image/jpeg") ? "JPEG" : "PNG", margin, y, logoSize, logoSize); } catch {}
  }
  const textX = margin + (logo ? logoSize + 4 : 0);
  pdf.setFont("helvetica", "bold");
  let pt = 11;
  pdf.setFontSize(pt);
  const maxW = pageW - margin - textX;
  while (pdf.getTextWidth(lh.officeName) > maxW && pt > 7) { pt -= 0.5; pdf.setFontSize(pt); }
  pdf.setTextColor(20, 20, 20);
  pdf.text(lh.officeName, textX, y + 7);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.setTextColor(90, 90, 90);
  if (lh.officeAddress) pdf.text(lh.officeAddress, textX, y + 12.5);
  y += logoSize + 3;
  pdf.setDrawColor(30, 30, 30);
  pdf.setLineWidth(0.6);
  pdf.line(margin, y, pageW - margin, y);
  pdf.setLineWidth(0.2);
  y += 7;

  // ── Report title ────────────────────────────────────────────────────────
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(13);
  pdf.setTextColor(20, 20, 20);
  pdf.text(`Monthly Stock Report — ${year}`, margin, y);
  y += 5.5;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8.5);
  pdf.setTextColor(90, 90, 90);
  pdf.text(
    `${kindLabel} · ${products.length} product${products.length === 1 ? "" : "s"} · Generated ${new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}`,
    margin, y
  );
  y += 8;

  // ── One block per product ───────────────────────────────────────────────
  for (const p of products) {
    if (y + BLOCK_H > bottom) {
      pdf.addPage();
      y = margin + 2;
    }

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9.5);
    pdf.setTextColor(20, 20, 20);
    pdf.text(p.brandName, margin, y);
    const nameW = pdf.getTextWidth(p.brandName);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(110, 110, 110);
    pdf.text(`${p.genericName}${p.unit ? ` · ${p.unit}` : ""}`, margin + nameW + 3, y);
    y += 2;

    const totIn = p.months.reduce((s, m) => s + m.in, 0);
    const totOut = p.months.reduce((s, m) => s + m.out, 0);

    autoTable(pdf, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [["Month", "Opening", "IN", "OUT", "Balance"]],
      body: p.months.map((m) => [
        `${MONTHS_SHORT[m.month - 1]} ${year}`,
        fmt(m.opening),
        m.in > 0 ? `+${fmt(m.in)}` : "–",
        m.out > 0 ? `-${fmt(m.out)}` : "–",
        fmt(m.closing),
      ]),
      foot: [["Total", fmt(p.months[0].opening), `+${fmt(totIn)}`, `-${fmt(totOut)}`, fmt(p.months[11].closing)]],
      showFoot: "lastPage",
      theme: "grid",
      styles: { fontSize: 7.5, cellPadding: { top: 1, bottom: 1, left: 2, right: 2 }, lineColor: [210, 210, 210], lineWidth: 0.1 },
      headStyles: { fillColor: [31, 41, 55], textColor: 255, halign: "right", fontStyle: "bold" },
      footStyles: { fillColor: [243, 244, 246], textColor: 20, fontStyle: "bold", halign: "right" },
      columnStyles: {
        0: { halign: "left", cellWidth: 40 },
        1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right", fontStyle: "bold" },
      },
      didParseCell: (d) => {
        if (d.section === "head" && d.column.index === 0) d.cell.styles.halign = "left";
        if (d.section === "foot" && d.column.index === 0) d.cell.styles.halign = "left";
        if (d.section === "body" || d.section === "foot") {
          if (d.column.index === 2 && String(d.cell.raw).startsWith("+")) d.cell.styles.textColor = [22, 128, 61];
          if (d.column.index === 3 && String(d.cell.raw).startsWith("-")) d.cell.styles.textColor = [185, 28, 28];
        }
      },
    });

    y = (pdf as any).lastAutoTable.finalY + 7;
  }

  if (products.length === 0) {
    pdf.setFontSize(10);
    pdf.setTextColor(120, 120, 120);
    pdf.text("No stock movement found for this year.", margin, y);
  }

  // ── Page numbers ────────────────────────────────────────────────────────
  const total = pdf.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    pdf.setPage(i);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7.5);
    pdf.setTextColor(140, 140, 140);
    pdf.text(`${kindLabel} · ${year}`, margin, pageH - 7);
    pdf.text(`Page ${i} of ${total}`, pageW - margin, pageH - 7, { align: "right" });
  }

  pdf.save(`PharmaTrack-${kindLabel.replace(" ", "")}-${year}-monthly-report.pdf`);
}