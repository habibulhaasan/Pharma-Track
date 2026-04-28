// lib/bulk-ledger-pdf.ts
// Compiles ledger of ALL products within a date range into one PDF.
// Page 1: Table of Contents. Then one section per product (one month per PDF page).

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { db } from "@/lib/firebase";
import { doc, getDoc, collection, query, where, orderBy, getDocs, Timestamp } from "firebase/firestore";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Product {
  id: string;
  brandName: string;
  genericName: string;
  unit: string;
}

interface RawEntry {
  type: string;
  reference?: string;
  quantity: number;
  timestamp: any;
  adjustmentDelta?: number;
  supplier?: string;
  batch?: string;
  patientName?: string;
  prescriptionNo?: string;
  reason?: string;
}

interface DayRow {
  dateKey: string;
  sortKey: number;
  in: number;
  out: number;
  balance: number;
}

interface ProductSection {
  product: Product;
  months: MonthBlock[];
  totalIn: number;
  totalOut: number;
  openingBalance: number;
  closingBalance: number;
}

interface MonthBlock {
  label: string;          // "April 2026"
  monthKey: string;       // "2026-04"
  rows: DayRow[];
  openingBal: number;
  totalIn: number;
  totalOut: number;
  closingBal: number;
}

interface Letterhead {
  logoUrl: string;
  officeName: string;
  officeAddress: string;
}

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

// ── Firestore helpers ─────────────────────────────────────────────────────────

async function fetchLetterhead(): Promise<Letterhead | null> {
  try {
    const snap = await getDoc(doc(db, "_meta", "letterhead"));
    if (!snap.exists()) return null;
    const d = snap.data();
    return { logoUrl: d.logoUrl ?? "", officeName: d.officeName ?? "", officeAddress: d.officeAddress ?? "" };
  } catch { return null; }
}

async function loadImageAsBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(`/api/proxy-image?url=${encodeURIComponent(url)}`);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const r = new FileReader();
      r.onloadend = () => resolve(r.result as string);
      r.onerror = () => resolve(null);
      r.readAsDataURL(blob);
    });
  } catch { return null; }
}

function toDate(ts: any): Date {
  if (!ts) return new Date(0);
  if (ts.toDate) return ts.toDate();
  if (ts.seconds) return new Date(ts.seconds * 1000);
  return new Date(ts);
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

// ── Data fetching per product ─────────────────────────────────────────────────

async function fetchProductData(
  product: Product,
  ledgerType: "main" | "pharmacy",
  startDate: Date,
  endDate: Date,
): Promise<ProductSection | null> {
  const collName = ledgerType === "main" ? "mainStock" : "pharmacyStock";
  const subColl  = ledgerType === "main" ? "mainLedger" : "pharmacyLedger";
  const ref      = collection(db, collName, product.id, subColl);

  const startTs = Timestamp.fromDate(startDate);
  const endTs   = Timestamp.fromDate(endDate);

  const [rangeSnap, prevSnap] = await Promise.all([
    getDocs(query(ref, where("timestamp", ">=", startTs), where("timestamp", "<=", endTs), orderBy("timestamp", "asc"))),
    getDocs(query(ref, where("timestamp", "<", startTs), orderBy("timestamp", "asc"))),
  ]);

  if (rangeSnap.empty) return null; // skip products with no activity in range

  // Opening balance before range
  let openingBalance = 0;
  prevSnap.docs.forEach((d) => {
    const data = d.data();
    if (data.type === "IN")              openingBalance += data.quantity ?? 0;
    else if (data.type === "OUT")        openingBalance -= data.quantity ?? 0;
    else if (data.type === "ADJUSTMENT") openingBalance += data.adjustmentDelta ?? 0;
  });

  // Group entries by month
  const monthMap: Record<string, RawEntry[]> = {};
  rangeSnap.docs.forEach((d) => {
    const data = d.data() as RawEntry;
    const dt   = toDate(data.timestamp);
    const key  = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
    if (!monthMap[key]) monthMap[key] = [];
    monthMap[key].push(data);
  });

  let runningBal = openingBalance;
  let totalIn = 0, totalOut = 0;
  const months: MonthBlock[] = [];

  Object.keys(monthMap).sort().forEach((monthKey) => {
    const [y, m] = monthKey.split("-").map(Number);
    const label  = `${MONTHS[m - 1]} ${y}`;
    const mOpen  = runningBal;

    // Group by day within month
    const dayMap: Record<string, { sortKey: number; in: number; out: number }> = {};
    monthMap[monthKey].forEach((e) => {
      const d  = toDate(e.timestamp);
      const dk = fmtDate(d);
      if (!dayMap[dk]) dayMap[dk] = { sortKey: d.getTime(), in: 0, out: 0 };
      const isAdj = e.type === "ADJUSTMENT";
      const delta = isAdj ? (e.adjustmentDelta ?? 0) : e.type === "IN" ? e.quantity : -e.quantity;
      if (delta > 0) dayMap[dk].in  += delta;
      else           dayMap[dk].out += Math.abs(delta);
    });

    // Opening row + day rows
    const rows: DayRow[] = [
      { dateKey: `Opening (${label})`, sortKey: 0, in: 0, out: 0, balance: mOpen },
    ];

    let mIn = 0, mOut = 0;
    Object.entries(dayMap).sort((a, b) => a[1].sortKey - b[1].sortKey).forEach(([dk, day]) => {
      runningBal += day.in - day.out;
      mIn  += day.in;
      mOut += day.out;
      rows.push({ dateKey: dk, sortKey: day.sortKey, in: day.in, out: day.out, balance: runningBal });
    });

    totalIn  += mIn;
    totalOut += mOut;

    months.push({ label, monthKey, rows, openingBal: mOpen, totalIn: mIn, totalOut: mOut, closingBal: runningBal });
  });

  return { product, months, totalIn, totalOut, openingBalance, closingBalance: runningBal };
}

// ── PDF drawing helpers ───────────────────────────────────────────────────────

function drawLetterhead(
  doc: jsPDF,
  lh: Letterhead | null,
  logoBase64: string | null,
  pageW: number,
  margin: number,
): number {
  let y = margin;
  const logoSize = 20;

  if (logoBase64) {
    try {
      const fmt = logoBase64.startsWith("data:image/jpeg") ? "JPEG" : "PNG";
      doc.addImage(logoBase64, fmt, margin, y, logoSize, logoSize);
    } catch {}
  }

  const textX    = margin + logoSize + 4;
  const maxTextW = pageW - margin - textX;
  const officeName    = lh?.officeName    ?? "Health Office";
  const officeAddress = lh?.officeAddress ?? "";

  doc.setFont("helvetica", "bold");
  let namePt = 9;
  doc.setFontSize(namePt);
  while (doc.getTextWidth(officeName) > maxTextW && namePt > 7) {
    namePt -= 0.5;
    doc.setFontSize(namePt);
  }
  doc.setTextColor(20, 20, 20);

  if (doc.getTextWidth(officeName) <= maxTextW) {
    doc.text(officeName, textX, y + 7);
    if (officeAddress) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(90, 90, 90);
      doc.text(officeAddress, textX, y + 12);
    }
  } else {
    doc.setFontSize(8);
    const lines: string[] = doc.splitTextToSize(officeName, maxTextW);
    doc.text(lines.slice(0, 2), textX, y + 5);
    if (officeAddress) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(90, 90, 90);
      doc.text(officeAddress, textX, y + 16);
    }
  }

  y += logoSize + 3;

  // Heavy rule
  doc.setDrawColor(30, 30, 30);
  doc.setLineWidth(0.6);
  doc.line(margin, y, pageW - margin, y);
  doc.setLineWidth(0.2);
  y += 3;

  return y;
}

function drawSummaryCards(
  doc: jsPDF,
  pageW: number,
  margin: number,
  y: number,
  openingBal: number,
  totalIn: number,
  totalOut: number,
  closingBal: number,
  unit: string,
): number {
  const cards = [
    { label: "Opening", value: `${openingBal.toLocaleString()} ${unit}`, r: 100, g: 116, b: 139, bgR: 241, bgG: 242, bgB: 244 },
    { label: "IN",      value: `+${totalIn.toLocaleString()}`,           r: 22,  g: 163, b: 74,  bgR: 220, bgG: 252, bgB: 231 },
    { label: "OUT",     value: `-${totalOut.toLocaleString()}`,           r: 220, g: 38,  b: 38,  bgR: 254, bgG: 226, bgB: 226 },
    { label: "Closing", value: `${closingBal.toLocaleString()} ${unit}`, r: 30,  g: 64,  b: 175, bgR: 219, bgG: 228, bgB: 255 },
  ];

  const totalW = pageW - margin * 2;
  const gap    = 3;
  const cardW  = (totalW - gap * (cards.length - 1)) / cards.length;
  const cardH  = 10;

  cards.forEach((c, i) => {
    const cx = margin + i * (cardW + gap);
    doc.setFillColor(c.bgR, c.bgG, c.bgB);
    doc.roundedRect(cx, y, cardW, cardH, 1.5, 1.5, "F");
    doc.setFillColor(c.r, c.g, c.b);
    doc.roundedRect(cx, y, 2.5, cardH, 0.5, 0.5, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(c.r, c.g, c.b);
    doc.text(c.label, cx + 5, y + 4);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(30, 30, 30);
    doc.text(c.value, cx + 5, y + 8.2);
  });

  return y + cardH + 4;
}

function drawMonthTable(
  doc: jsPDF,
  block: MonthBlock,
  unit: string,
  startY: number,
  margin: number,
  pageW: number,
  pageH: number,
  productName: string,
  ledgerType: string,
): void {
  const tableRows = block.rows.map((r) => [
    r.dateKey,
    r.in  > 0 ? `+${r.in.toLocaleString()}`  : "—",
    r.out > 0 ? `-${r.out.toLocaleString()}` : "—",
    r.balance.toLocaleString(),
  ]);

  autoTable(doc, {
    startY,
    head: [["Date", "IN", "OUT", "Balance"]],
    body: tableRows,
    foot: [[
      { content: `Closing — ${block.label}`, styles: { fontStyle: "bold" } },
      { content: `+${block.totalIn.toLocaleString()}`,  styles: { fontStyle: "bold", textColor: [22, 163, 74]  } },
      { content: `-${block.totalOut.toLocaleString()}`, styles: { fontStyle: "bold", textColor: [220, 38, 38]  } },
      { content: `${block.closingBal.toLocaleString()} ${unit}`, styles: { fontStyle: "bold", textColor: [30, 64, 175] } },
    ]],
    margin: { left: margin, right: margin },
    styles: { fontSize: 8, cellPadding: 2.2, lineColor: [220, 220, 220], lineWidth: 0.2 },
    headStyles: { fillColor: [235, 235, 235], textColor: [50, 50, 50], fontStyle: "bold", fontSize: 7.5 },
    footStyles: { fillColor: [245, 245, 245], fontSize: 7.5 },
    columnStyles: {
      0: { cellWidth: 38 },
      1: { cellWidth: 28, halign: "right", textColor: [22, 163, 74]  },
      2: { cellWidth: 28, halign: "right", textColor: [220, 38, 38]  },
      3: { cellWidth: 34, halign: "right", fontStyle: "bold"         },
    },
    alternateRowStyles: { fillColor: [250, 250, 250] },
    bodyStyles: { textColor: [40, 40, 40] },
    didParseCell(data) {
      if (
        data.section === "body" &&
        Array.isArray(data.row.raw) &&
        typeof data.row.raw[0] === "string" &&
        (data.row.raw[0] as string).startsWith("Opening")
      ) {
        data.cell.styles.fillColor  = [240, 240, 240];
        data.cell.styles.fontStyle  = "bold";
        data.cell.styles.textColor  = [80, 80, 80];
      }
    },
    didDrawPage() {
      const pg = (doc.internal as any).getCurrentPageInfo().pageNumber;
      doc.setFontSize(6.5);
      doc.setTextColor(170, 170, 170);
      doc.text(
        `${productName} · ${ledgerType === "pharmacy" ? "Pharmacy" : "Main"} Ledger`,
        pageW / 2, pageH - 6, { align: "center" },
      );
      doc.text(`Page ${pg}`, pageW - margin, pageH - 6, { align: "right" });
      doc.setTextColor(0);
    },
  });
}

// ── Main export function ──────────────────────────────────────────────────────

export interface BulkLedgerOptions {
  products: Product[];
  ledgerType: "main" | "pharmacy";
  startDate: Date;
  endDate: Date;
  onProgress?: (current: number, total: number, name: string) => void;
}

export async function downloadBulkLedgerPDF(opts: BulkLedgerOptions) {
  const { products, ledgerType, startDate, endDate, onProgress } = opts;

  // 1. Fetch letterhead + logo
  const lh         = await fetchLetterhead();
  const logoBase64 = lh?.logoUrl ? await loadImageAsBase64(lh.logoUrl) : null;

  // 2. Fetch all product data (with progress callback)
  const sections: ProductSection[] = [];
  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    onProgress?.(i + 1, products.length, p.brandName);
    const section = await fetchProductData(p, ledgerType, startDate, endDate);
    if (section) sections.push(section);
  }

  if (sections.length === 0) {
    alert("No transactions found for any product in the selected date range.");
    return;
  }

  const doc    = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW  = doc.internal.pageSize.getWidth();
  const pageH  = doc.internal.pageSize.getHeight();
  const margin = 12;

  const rangeFmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const rangeLabel = `${rangeFmt(startDate)} – ${rangeFmt(endDate)}`;
  const printedAt  = new Date().toLocaleString("en-GB");

  // ── PAGE 1: Cover + Table of Contents ──────────────────────────────────────
  let y = drawLetterhead(doc, lh, logoBase64, pageW, margin);

  // Report title block
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(20, 20, 20);
  doc.text("COMPILED STOCK LEDGER", pageW / 2, y + 6, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(90, 90, 90);
  doc.text(`${ledgerType === "pharmacy" ? "Pharmacy Stock" : "Main Stock"}   ·   Period: ${rangeLabel}`, pageW / 2, y + 12, { align: "center" });
  doc.text(`Printed: ${printedAt}`, pageW / 2, y + 17, { align: "center" });

  y += 24;

  // Thin rule under title
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageW - margin, y);
  doc.setLineWidth(0.2);
  y += 6;

  // ToC heading
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(30, 30, 30);
  doc.text("TABLE OF CONTENTS", margin, y);
  y += 5;

  // ToC summary stats
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(110, 110, 110);
  doc.text(`${sections.length} product${sections.length !== 1 ? "s" : ""} with activity in range`, margin, y);
  y += 6;

  // ToC table
  const tocRows = sections.map((s, idx) => [
    String(idx + 1),
    s.product.brandName,
    s.product.genericName,
    s.product.unit,
    `+${s.totalIn.toLocaleString()}`,
    `-${s.totalOut.toLocaleString()}`,
    `${s.closingBalance.toLocaleString()}`,
  ]);

  autoTable(doc, {
    startY: y,
    head: [["#", "Brand Name", "Generic Name", "Unit", "Total IN", "Total OUT", "Closing Bal"]],
    body: tocRows,
    margin: { left: margin, right: margin },
    styles: { fontSize: 7.5, cellPadding: 2 },
    headStyles: { fillColor: [235, 235, 235], textColor: [40, 40, 40], fontStyle: "bold", fontSize: 7.5 },
    columnStyles: {
      0: { cellWidth: 8,  halign: "center"  },
      1: { cellWidth: 45                    },
      2: { cellWidth: 45                    },
      3: { cellWidth: 14, halign: "center"  },
      4: { cellWidth: 22, halign: "right", textColor: [22, 163, 74]  },
      5: { cellWidth: 22, halign: "right", textColor: [220, 38, 38]  },
      6: { cellWidth: 24, halign: "right", fontStyle: "bold"         },
    },
    alternateRowStyles: { fillColor: [250, 250, 250] },
    bodyStyles: { textColor: [40, 40, 40] },
    didDrawPage() {
      const pg = (doc.internal as any).getCurrentPageInfo().pageNumber;
      doc.setFontSize(6.5);
      doc.setTextColor(170, 170, 170);
      doc.text("Compiled Stock Ledger · Table of Contents", pageW / 2, pageH - 6, { align: "center" });
      doc.text(`Page ${pg}`, pageW - margin, pageH - 6, { align: "right" });
      doc.setTextColor(0);
    },
  });

  // ── PRODUCT SECTIONS ────────────────────────────────────────────────────────
  sections.forEach((section) => {
    section.months.forEach((block, mIdx) => {
      doc.addPage();

      // Mini letterhead on every product page
      let y2 = drawLetterhead(doc, lh, logoBase64, pageW, margin);

      // Product + month title bar
      doc.setFillColor(245, 245, 245);
      doc.rect(margin, y2, pageW - margin * 2, 12, "F");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(20, 20, 20);
      doc.text(section.product.brandName, margin + 3, y2 + 5);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(100, 100, 100);
      doc.text(
        `${section.product.genericName} · ${section.product.unit}`,
        margin + 3, y2 + 9.5,
      );

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(30, 64, 175);
      doc.text(block.label, pageW - margin - 3, y2 + 5, { align: "right" });

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(130, 130, 130);
      doc.text(
        `${ledgerType === "pharmacy" ? "Pharmacy" : "Main Stock"}   ·   ${rangeLabel}`,
        pageW - margin - 3, y2 + 9.5, { align: "right" },
      );

      y2 += 14;

      // Summary cards for this month
      y2 = drawSummaryCards(
        doc, pageW, margin, y2,
        block.openingBal, block.totalIn, block.totalOut, block.closingBal,
        section.product.unit,
      );

      // Month table
      drawMonthTable(
        doc, block, section.product.unit, y2,
        margin, pageW, pageH,
        section.product.brandName, ledgerType,
      );
    });
  });

  // ── Save ────────────────────────────────────────────────────────────────────
  const dateStr = `${startDate.toISOString().slice(0, 10)}_${endDate.toISOString().slice(0, 10)}`;
  doc.save(`BulkLedger_${ledgerType}_${dateStr}.pdf`);
}