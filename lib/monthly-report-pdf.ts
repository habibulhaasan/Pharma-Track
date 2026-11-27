// lib/monthly-report-pdf.ts
// Monthly report PDF generator:
// - Strictly ONE product per page (never places multiple products on a single page).
// - Supports both all-products reports and single-product ("by product") reports,
//   for either a specific year (12 months) or all months across all years ("all").
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";

const MONTHS_FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export interface PdfMonth {
  year?: number;
  month: number;
  opening: number;
  in: number;
  out: number;
  closing: number;
}

export interface PdfProduct {
  brandName: string;
  genericName: string;
  unit: string;
  months: PdfMonth[];
}

export interface YearReportPDFOptions {
  kind: "main" | "pharmacy";
  year: number | "all";
  products: PdfProduct[];
}

export interface ProductReportPDFOptions {
  kind: "main" | "pharmacy";
  year: number | "all";
  product: PdfProduct;
}

interface Letterhead {
  logoUrl: string;
  officeName: string;
  officeAddress: string;
}

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

function drawLetterhead(
  pdf: jsPDF,
  lh: Letterhead,
  logo: string | null,
  pageW: number,
  margin: number,
  logoSize: number,
  generatedLabel: string
): number {
  let y = margin;
  if (logo) {
    try {
      pdf.addImage(
        logo,
        logo.startsWith("data:image/jpeg") ? "JPEG" : "PNG",
        margin,
        y,
        logoSize,
        logoSize
      );
    } catch {}
  }

  const textX = margin + (logo ? logoSize + 4 : 0);
  const maxW = pageW - margin - textX - 38;

  pdf.setFont("helvetica", "bold");
  let pt = 10.5;
  pdf.setFontSize(pt);
  while (pdf.getTextWidth(lh.officeName) > maxW && pt > 7) {
    pt -= 0.5;
    pdf.setFontSize(pt);
  }
  pdf.setTextColor(20, 20, 20);
  if (pdf.getTextWidth(lh.officeName) <= maxW) {
    pdf.text(lh.officeName, textX, y + logoSize * 0.42);
    if (lh.officeAddress) {
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8);
      pdf.setTextColor(90, 90, 90);
      pdf.text(lh.officeAddress, textX, y + logoSize * 0.72);
    }
  } else {
    const lines: string[] = pdf.splitTextToSize(lh.officeName, maxW);
    pdf.text(lines.slice(0, 2), textX, y + 5);
    if (lh.officeAddress) {
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(7.5);
      pdf.setTextColor(90, 90, 90);
      pdf.text(lh.officeAddress, textX, y + logoSize - 2);
    }
  }

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7.5);
  pdf.setTextColor(120, 120, 120);
  pdf.text(generatedLabel, pageW - margin, y + 5, { align: "right" });

  y += logoSize + 2.5;
  pdf.setDrawColor(30, 30, 30);
  pdf.setLineWidth(0.6);
  pdf.line(margin, y, pageW - margin, y);
  pdf.setLineWidth(0.2);
  return y + 3.5;
}

function drawSummaryCards(
  pdf: jsPDF,
  pageW: number,
  margin: number,
  y: number,
  cardH: number,
  openingBal: number,
  totalIn: number,
  totalOut: number,
  closingBal: number,
  unit: string
): number {
  const unitSuffix = unit ? ` ${unit}` : "";
  const cards = [
    { label: "Opening", value: `${fmt(openingBal)}${unitSuffix}`, r: 100, g: 116, b: 139, bgR: 241, bgG: 245, bgB: 249 },
    { label: "Total IN", value: `+${fmt(totalIn)}`, r: 22, g: 163, b: 74, bgR: 220, bgG: 252, bgB: 231 },
    { label: "Total OUT", value: `-${fmt(totalOut)}`, r: 220, g: 38, b: 38, bgR: 254, bgG: 226, bgB: 226 },
    { label: "Closing", value: `${fmt(closingBal)}${unitSuffix}`, r: 30, g: 64, b: 175, bgR: 219, bgG: 234, bgB: 254 },
  ];

  const totalW = pageW - margin * 2;
  const gap = 3;
  const cardW = (totalW - gap * (cards.length - 1)) / cards.length;

  cards.forEach((c, i) => {
    const cx = margin + i * (cardW + gap);
    pdf.setFillColor(c.bgR, c.bgG, c.bgB);
    pdf.roundedRect(cx, y, cardW, cardH, 1.5, 1.5, "F");
    pdf.setFillColor(c.r, c.g, c.b);
    pdf.roundedRect(cx, y, 2.2, cardH, 0.5, 0.5, "F");
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(6.5);
    pdf.setTextColor(c.r, c.g, c.b);
    pdf.text(c.label, cx + 4.8, y + cardH * 0.4);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    pdf.setTextColor(25, 25, 25);
    pdf.text(c.value, cx + 4.8, y + cardH * 0.8);
  });

  return y + cardH + 3;
}

function getPeriodLabel(year: number | "all", months: PdfMonth[]): string {
  if (typeof year === "number") {
    return `Jan – Dec ${year}`;
  }
  if (months.length === 0) return "All Months";
  const first = months[0];
  const last = months[months.length - 1];
  const fy = first.year ?? new Date().getFullYear();
  const ly = last.year ?? fy;
  return `${MONTHS_SHORT[first.month - 1]} ${fy} – ${MONTHS_SHORT[last.month - 1]} ${ly} (${months.length} month${months.length === 1 ? "" : "s"})`;
}

function drawProductPage(
  pdf: jsPDF,
  lh: Letterhead,
  logo: string | null,
  kindLabel: string,
  year: number | "all",
  p: PdfProduct,
  productIdx: number,
  totalProducts: number,
  generatedLabel: string
) {
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 12;
  const rowCount = p.months.length;

  // Adapt vertical metrics so each product fits cleanly on ONE single A4 page
  const isCompact = rowCount > 16;
  const isUltraCompact = rowCount > 26;
  const logoSize = isUltraCompact ? 13.5 : isCompact ? 15.5 : 18;
  const cardH = isUltraCompact ? 8.5 : isCompact ? 9.5 : 10.5;
  const bannerH = isUltraCompact ? 10.5 : 12;

  let y = drawLetterhead(pdf, lh, logo, pageW, margin, logoSize, generatedLabel);

  // Report heading row
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9.5);
  pdf.setTextColor(20, 20, 20);
  pdf.text("MONTHLY STOCK REPORT", margin, y + 3.5);

  const periodLabel = getPeriodLabel(year, p.months);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.setTextColor(90, 90, 90);
  pdf.text(`${kindLabel}   ·   Period: ${periodLabel}`, pageW - margin, y + 3.5, { align: "right" });
  y += 6;

  // Product banner
  pdf.setFillColor(246, 247, 249);
  pdf.setDrawColor(225, 228, 232);
  pdf.roundedRect(margin, y, pageW - margin * 2, bannerH, 1.5, 1.5, "FD");

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.setTextColor(17, 24, 39);
  pdf.text(p.brandName, margin + 3.5, y + bannerH * 0.44);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7.8);
  pdf.setTextColor(100, 116, 139);
  const subInfo = [p.genericName, p.unit].filter(Boolean).join(" · ");
  if (subInfo) {
    pdf.text(subInfo, margin + 3.5, y + bannerH * 0.82);
  }

  if (totalProducts > 1) {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7.5);
    pdf.setTextColor(120, 120, 120);
    pdf.text(`Product ${productIdx + 1} of ${totalProducts}`, pageW - margin - 3.5, y + bannerH * 0.56, {
      align: "right",
    });
  }

  y += bannerH + 2.8;

  // Summary cards
  const opening = p.months[0]?.opening ?? 0;
  const totIn = p.months.reduce((s, m) => s + m.in, 0);
  const totOut = p.months.reduce((s, m) => s + m.out, 0);
  const closing = p.months.length ? p.months[p.months.length - 1].closing : 0;

  y = drawSummaryCards(pdf, pageW, margin, y, cardH, opening, totIn, totOut, closing, p.unit);

  // Adaptive table sizing so all months fit cleanly on this single page
  const availH = pageH - 13 - y;
  const totalTableRows = Math.max(rowCount + 2, 3);
  let fontSize = 8.5;
  let vPad = 2.1;

  if (rowCount > 24) {
    const maxRowH = availH / totalTableRows;
    fontSize = maxRowH < 4.5 ? 6.2 : maxRowH < 5.5 ? 6.8 : 7.3;
    vPad = Math.max(0.45, Math.min(1.2, (maxRowH - fontSize * 0.38) / 2));
  } else if (rowCount > 15) {
    fontSize = 7.8;
    vPad = 1.35;
  }

  const fallbackYear = typeof year === "number" ? year : new Date().getFullYear();

  autoTable(pdf, {
    startY: y,
    tableWidth: pageW - margin * 2,
    margin: { left: margin, right: margin, bottom: 12 },
    head: [["Month", "Opening", "IN", "OUT", "Balance"]],
    body: p.months.map((m) => {
      const mYear = m.year ?? fallbackYear;
      return [
        `${MONTHS_FULL[m.month - 1]} ${mYear}`,
        fmt(m.opening),
        m.in > 0 ? `+${fmt(m.in)}` : "–",
        m.out > 0 ? `-${fmt(m.out)}` : "–",
        fmt(m.closing),
      ];
    }),
    foot: [[
      typeof year === "number" ? `Total ${year}` : "Total (All Months)",
      fmt(opening),
      `+${fmt(totIn)}`,
      `-${fmt(totOut)}`,
      `${fmt(closing)}${p.unit ? ` ${p.unit}` : ""}`,
    ]],
    showFoot: "lastPage",
    theme: "grid",
    styles: {
      fontSize,
      cellPadding: { top: vPad, bottom: vPad, left: 2.5, right: 2.5 },
      lineColor: [215, 220, 226],
      lineWidth: 0.15,
      textColor: [35, 35, 35],
    },
    alternateRowStyles: { fillColor: [250, 251, 252] },
    headStyles: { fillColor: [31, 41, 55], textColor: 255, halign: "right", fontStyle: "bold" },
    footStyles: { fillColor: [243, 244, 246], textColor: 20, fontStyle: "bold", halign: "right" },
    columnStyles: {
      0: { halign: "left", cellWidth: 54 },
      1: { halign: "right", cellWidth: 33 },
      2: { halign: "right", cellWidth: 33 },
      3: { halign: "right", cellWidth: 33 },
      4: { halign: "right", cellWidth: 33, fontStyle: "bold" },
    },
    didParseCell: (d) => {
      if ((d.section === "head" || d.section === "foot") && d.column.index === 0) {
        d.cell.styles.halign = "left";
      }
      if (d.section === "body" || d.section === "foot") {
        if (d.column.index === 2 && String(d.cell.raw).startsWith("+")) {
          d.cell.styles.textColor = [22, 128, 61];
          d.cell.styles.fontStyle = "bold";
        }
        if (d.column.index === 3 && String(d.cell.raw).startsWith("-")) {
          d.cell.styles.textColor = [185, 28, 28];
          d.cell.styles.fontStyle = "bold";
        }
      }
    },
  });
}

function addFooters(pdf: jsPDF, kindLabel: string, scopeShort: string, products: PdfProduct[]) {
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 12;
  const total = pdf.getNumberOfPages();

  for (let i = 1; i <= total; i++) {
    pdf.setPage(i);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7.5);
    pdf.setTextColor(140, 140, 140);
    const prodPrefix = products.length === total && products[i - 1] ? `${products[i - 1].brandName} · ` : "";
    pdf.text(`${prodPrefix}${kindLabel} · ${scopeShort}`, margin, pageH - 6.5);
    pdf.text(`Page ${i} of ${total}`, pageW - margin, pageH - 6.5, { align: "right" });
  }
}

/** All products monthly PDF — strictly ONE product per page. */
export async function downloadYearReportPDF(opts: YearReportPDFOptions) {
  const { kind, year, products } = opts;
  const kindLabel = kind === "main" ? "Main Stock" : "Pharmacy";
  const scopeShort = year === "all" ? "All Months" : String(year);
  const generatedLabel = `Generated: ${new Date().toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })}`;

  const lh = await fetchLetterhead();
  const logo = await loadImageAsBase64(lh.logoUrl);

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const margin = 12;

  if (products.length === 0) {
    let y = drawLetterhead(pdf, lh, logo, pageW, margin, 18, generatedLabel);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(12);
    pdf.setTextColor(20, 20, 20);
    pdf.text(`Monthly Stock Report — ${scopeShort}`, margin, y + 6);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.setTextColor(120, 120, 120);
    pdf.text("No stock movement found for this period.", margin, y + 15);
  } else {
    // Strictly place EACH product on its own page — never multiple products on one page
    products.forEach((p, idx) => {
      if (idx > 0) {
        pdf.addPage();
      }
      drawProductPage(pdf, lh, logo, kindLabel, year, p, idx, products.length, generatedLabel);
    });
  }

  addFooters(pdf, kindLabel, scopeShort, products);

  const fileScope = year === "all" ? "AllMonths" : String(year);
  pdf.save(`PharmaTrack-${kindLabel.replace(" ", "")}-${fileScope}-monthly-report.pdf`);
}

/** Single product ("by product") monthly PDF — for a specific year or all months. */
export async function downloadProductMonthlyPDF(opts: ProductReportPDFOptions) {
  const { kind, year, product } = opts;
  const kindLabel = kind === "main" ? "Main Stock" : "Pharmacy";
  const scopeShort = year === "all" ? "All Months" : String(year);
  const generatedLabel = `Generated: ${new Date().toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })}`;

  const lh = await fetchLetterhead();
  const logo = await loadImageAsBase64(lh.logoUrl);

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  drawProductPage(pdf, lh, logo, kindLabel, year, product, 0, 1, generatedLabel);
  addFooters(pdf, kindLabel, scopeShort, [product]);

  const safeBrand = product.brandName.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_-]/g, "");
  const fileScope = year === "all" ? "AllMonths" : String(year);
  pdf.save(`MonthlyReport_${safeBrand}_${kindLabel.replace(" ", "")}_${fileScope}.pdf`);
}
