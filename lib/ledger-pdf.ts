// lib/ledger-pdf.ts
// Single-product ledger PDF with two layout modes:
//   "paginated" — one page per month (original)
//   "compact"   — all months continuous, month label as a section divider row

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DayRow {
  dateKey: string;
  sortKey: number;
  in: number;
  out: number;
  balance: number;
  descriptions: string[];
  details: string[];
}

interface Letterhead {
  logoUrl: string;
  officeName: string;
  officeAddress: string;
}

export interface LedgerPDFOptions {
  productName: string;
  genericName: string;
  unit: string;
  ledgerType: "main" | "pharmacy";
  statement: DayRow[];
  isFullLedger?: boolean;
  month?: number;   // 1-12, used if !isFullLedger
  year?: number;
  layout?: "paginated" | "compact"; // default: paginated
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

// Fallback letterhead — uses local /logo.png so no CORS issues
const FALLBACK_LH: Letterhead = {
  logoUrl: "/logo.png",
  officeName: "Babrijhar (Chapra Saramjani) Union Health Sub Center",
  officeAddress: "Sadar, Nilphamari",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

async function fetchLetterhead(): Promise<Letterhead> {
  try {
    const snap = await getDoc(doc(db, "_meta", "letterhead"));
    if (snap.exists()) {
      const d = snap.data();
      return {
        logoUrl:      d.logoUrl      || FALLBACK_LH.logoUrl,
        officeName:   d.officeName   || FALLBACK_LH.officeName,
        officeAddress:d.officeAddress|| FALLBACK_LH.officeAddress,
      };
    }
  } catch {}
  return FALLBACK_LH;
}

async function loadImageAsBase64(url: string): Promise<string | null> {
  try {
    // Local paths (e.g. /logo.png) — fetch directly, no proxy needed
    const fetchUrl = url.startsWith("/")
      ? url
      : `/api/proxy-image?url=${encodeURIComponent(url)}`;

    const res = await fetch(fetchUrl);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const r = new FileReader();
      r.onloadend = () => resolve(r.result as string);
      r.onerror   = () => resolve(null);
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function groupByMonth(rows: DayRow[]): { label: string; key: string; rows: DayRow[] }[] {
  const map: Record<string, DayRow[]> = {};
  rows.forEach((row) => {
    let key: string;
    if (row.sortKey === 0) {
      const match = row.dateKey.match(/\((\w+) (\d{4})\)/);
      key = match
        ? `${match[2]}-${String(MONTHS.indexOf(match[1]) + 1).padStart(2, "0")}`
        : "0000-00";
    } else {
      const d = new Date(row.sortKey);
      key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    }
    if (!map[key]) map[key] = [];
    map[key].push(row);
  });

  return Object.keys(map).sort().map((k) => {
    const [y, m] = k.split("-");
    const label  = k === "0000-00" ? "Unknown Period" : `${MONTHS[Number(m) - 1]} ${y}`;
    return { label, key: k, rows: map[k] };
  });
}

// ── PDF drawing helpers ───────────────────────────────────────────────────────

function drawLetterhead(
  doc: jsPDF,
  lh: Letterhead,
  logoBase64: string | null,
  pageW: number,
  margin: number,
  rightText?: string,
): number {
  let y = margin;
  const logoSize = 20;

  // Logo
  if (logoBase64) {
    try {
      const fmt = logoBase64.startsWith("data:image/jpeg") ? "JPEG" : "PNG";
      doc.addImage(logoBase64, fmt, margin, y, logoSize, logoSize);
    } catch {}
  }

  // Office name + address
  const textX    = margin + logoSize + 4;
  const maxTextW = pageW - margin - textX - 30; // reserve right for page number

  doc.setFont("helvetica", "bold");
  let namePt = 9.5;
  doc.setFontSize(namePt);
  while (doc.getTextWidth(lh.officeName) > maxTextW && namePt > 7) {
    namePt -= 0.5;
    doc.setFontSize(namePt);
  }
  doc.setTextColor(20, 20, 20);

  if (doc.getTextWidth(lh.officeName) <= maxTextW) {
    doc.text(lh.officeName, textX, y + 8);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(90, 90, 90);
    if (lh.officeAddress) doc.text(lh.officeAddress, textX, y + 13.5);
  } else {
    doc.setFontSize(8);
    const lines: string[] = doc.splitTextToSize(lh.officeName, maxTextW);
    doc.text(lines.slice(0, 2), textX, y + 6);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(90, 90, 90);
    if (lh.officeAddress) doc.text(lh.officeAddress, textX, y + 16);
  }

  // Right-side text (page number / date)
  if (rightText) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(140, 140, 140);
    doc.text(rightText, pageW - margin, y + 5, { align: "right" });
  }

  y += logoSize + 3;

  // Heavy rule
  doc.setDrawColor(30, 30, 30);
  doc.setLineWidth(0.6);
  doc.line(margin, y, pageW - margin, y);
  doc.setLineWidth(0.2);
  doc.setDrawColor(0);
  y += 3;

  return y;
}

function drawDocTitle(
  doc: jsPDF,
  pageW: number,
  margin: number,
  y: number,
  productName: string,
  genericName: string,
  unit: string,
  ledgerType: string,
  periodLabel: string,
): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(20, 20, 20);
  doc.text("STOCK LEDGER", margin, y);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(100, 100, 100);
  doc.text(
    `${ledgerType === "pharmacy" ? "Pharmacy Stock" : "Main Stock"}   ·   Printed: ${new Date().toLocaleString("en-GB")}`,
    pageW - margin, y, { align: "right" },
  );
  y += 5;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(20, 20, 20);
  doc.text(productName, margin, y);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(110, 110, 110);
  doc.text(`   ${genericName} · ${unit}`, margin + doc.getTextWidth(productName), y);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(60, 60, 60);
  doc.text(`Period: ${periodLabel}`, pageW - margin, y, { align: "right" });
  y += 5;

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

  return y + cardH + 3;
}

// A4 usable width = 210 - 12*2 = 186mm. Columns sum to exactly 186.
function tableColStyles() {
  return {
    0: { cellWidth: 72 },                                                                    // Date — gets remaining space
    1: { cellWidth: 38, halign: "right" as const, textColor: [22, 163, 74]  as [number,number,number] },
    2: { cellWidth: 38, halign: "right" as const, textColor: [220, 38, 38]  as [number,number,number] },
    3: { cellWidth: 38, halign: "right" as const, fontStyle: "bold" as const },
  };
}

// ── PAGINATED layout (one page per month) ─────────────────────────────────────

function buildPaginated(
  doc: jsPDF,
  lh: Letterhead,
  logoBase64: string | null,
  statement: DayRow[],
  opts: LedgerPDFOptions,
  pages: { label: string; rows: DayRow[] }[],
  totalPages: number,
) {
  const { productName, genericName, unit, ledgerType } = opts;
  const pageW  = doc.internal.pageSize.getWidth();
  const pageH  = doc.internal.pageSize.getHeight();
  const margin = 12;

  pages.forEach((page, pageIdx) => {
    if (pageIdx > 0) doc.addPage();

    const rows       = page.rows;
    const openingRow = rows.find((r) => r.descriptions.includes("Opening Balance"));
    const dataRows   = rows.filter((r) => !r.descriptions.includes("Opening Balance"));
    const totalIn    = dataRows.reduce((s, r) => s + r.in,  0);
    const totalOut   = dataRows.reduce((s, r) => s + r.out, 0);
    const closingBal = rows.length > 0 ? rows[rows.length - 1].balance : 0;
    const openingBal = openingRow?.balance ?? 0;

    let y = drawLetterhead(doc, lh, logoBase64, pageW, margin, `Page ${pageIdx + 1} / ${totalPages}`);
    y = drawDocTitle(doc, pageW, margin, y, productName, genericName, unit, ledgerType, page.label);
    y = drawSummaryCards(doc, pageW, margin, y, openingBal, totalIn, totalOut, closingBal, unit);

    const tableRows = rows.map((r) => [
      r.dateKey,
      r.in  > 0 ? `+${r.in.toLocaleString()}`  : "—",
      r.out > 0 ? `-${r.out.toLocaleString()}` : "—",
      r.balance.toLocaleString(),
    ]);

    autoTable(doc, {
      startY: y,
      head: [["Date", "IN", "OUT", "Balance"]],
      body: tableRows,
      foot: [[
        { content: `Closing — ${page.label}`, styles: { fontStyle: "bold" } },
        { content: `+${totalIn.toLocaleString()}`,  styles: { fontStyle: "bold", textColor: [22, 163, 74]  } },
        { content: `-${totalOut.toLocaleString()}`, styles: { fontStyle: "bold", textColor: [220, 38, 38]  } },
        { content: `${closingBal.toLocaleString()} ${unit}`, styles: { fontStyle: "bold", textColor: [30, 64, 175] } },
      ]],
      tableWidth: pageW - margin * 2,
      margin: { left: margin, right: margin },
      styles: { fontSize: 8, cellPadding: 2.2, lineColor: [220, 220, 220], lineWidth: 0.2, overflow: "ellipsize" },
      headStyles: { fillColor: [235, 235, 235], textColor: [50, 50, 50], fontStyle: "bold", fontSize: 7.5 },
      footStyles: { fillColor: [245, 245, 245], fontSize: 7.5 },
      columnStyles: tableColStyles(),
      alternateRowStyles: { fillColor: [250, 250, 250] },
      bodyStyles: { textColor: [40, 40, 40] },
      didParseCell(data) {
        if (
          data.section === "body" &&
          Array.isArray(data.row.raw) &&
          typeof data.row.raw[0] === "string" &&
          (data.row.raw[0] as string).startsWith("Opening")
        ) {
          data.cell.styles.fillColor = [240, 240, 240];
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.textColor = [80, 80, 80];
        }
      },
      didDrawPage() {
        const pg = (doc.internal as any).getCurrentPageInfo().pageNumber;
        doc.setFontSize(6.5);
        doc.setTextColor(170, 170, 170);
        doc.text(`${productName} · ${ledgerType === "pharmacy" ? "Pharmacy" : "Main"} Ledger`, pageW / 2, pageH - 6, { align: "center" });
        doc.text(`Page ${pg}`, pageW - margin, pageH - 6, { align: "right" });
        doc.setTextColor(0);
      },
    });
  });
}

// ── COMPACT layout (all months continuous, month header rows) ─────────────────

function buildCompact(
  doc: jsPDF,
  lh: Letterhead,
  logoBase64: string | null,
  opts: LedgerPDFOptions,
  pages: { label: string; rows: DayRow[] }[],
  globalOpeningBal: number,
  globalTotalIn: number,
  globalTotalOut: number,
  globalClosingBal: number,
  periodLabel: string,
) {
  const { productName, genericName, unit, ledgerType } = opts;
  const pageW  = doc.internal.pageSize.getWidth();
  const pageH  = doc.internal.pageSize.getHeight();
  const margin = 12;

  // First page: letterhead + title + global summary
  let y = drawLetterhead(doc, lh, logoBase64, pageW, margin);
  y = drawDocTitle(doc, pageW, margin, y, productName, genericName, unit, ledgerType, periodLabel);
  y = drawSummaryCards(doc, pageW, margin, y, globalOpeningBal, globalTotalIn, globalTotalOut, globalClosingBal, unit);

  // Build one flat body with month-divider rows
  type TableRow = (string | { content: string; styles: any })[];
  const allRows: TableRow[] = [];

  pages.forEach((page) => {
    // Month divider — merged across all 4 cols, right-aligned month label
    allRows.push([
      {
        content: page.label,
        colSpan: 4,
        styles: {
          fontStyle: "bold" as const,
          fillColor: [225, 235, 255] as [number,number,number],
          textColor: [30, 64, 175]  as [number,number,number],
          fontSize: 8.5,
          cellPadding: { top: 3, bottom: 3, left: 4, right: 4 },
          halign: "right" as const,
        },
      },
    ]);

    page.rows.forEach((r) => {
      allRows.push([
        r.dateKey,
        r.in  > 0 ? `+${r.in.toLocaleString()}`  : "—",
        r.out > 0 ? `-${r.out.toLocaleString()}` : "—",
        r.balance.toLocaleString(),
      ]);
    });
  });

  autoTable(doc, {
    startY: y,
    head: [["Date", "IN", "OUT", "Balance"]],
    body: allRows,
    foot: [[
      { content: `All-time closing balance`, styles: { fontStyle: "bold" } },
      { content: `+${globalTotalIn.toLocaleString()}`,  styles: { fontStyle: "bold", textColor: [22, 163, 74]  } },
      { content: `-${globalTotalOut.toLocaleString()}`, styles: { fontStyle: "bold", textColor: [220, 38, 38]  } },
      { content: `${globalClosingBal.toLocaleString()} ${unit}`, styles: { fontStyle: "bold", textColor: [30, 64, 175] } },
    ]],
    tableWidth: pageW - margin * 2,
    margin: { left: margin, right: margin },
    styles: { fontSize: 8, cellPadding: 2, lineColor: [220, 220, 220], lineWidth: 0.2, overflow: "ellipsize" },
    headStyles: { fillColor: [235, 235, 235], textColor: [50, 50, 50], fontStyle: "bold", fontSize: 7.5 },
    footStyles: { fillColor: [245, 245, 245], fontSize: 7.5 },
    columnStyles: tableColStyles(),
    alternateRowStyles: { fillColor: [250, 250, 250] },
    bodyStyles: { textColor: [40, 40, 40] },
    didParseCell(data) {
      if (data.section !== "body" || !Array.isArray(data.row.raw)) return;
      const firstCell = data.row.raw[0];
      // Opening balance rows
      if (
        typeof firstCell === "string" &&
        (firstCell.startsWith("Opening") || firstCell.startsWith("──"))
      ) {
        if (!firstCell.startsWith("──")) {
          data.cell.styles.fillColor = [240, 240, 240];
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.textColor = [80, 80, 80];
        }
      }
    },
    didDrawPage() {
      const pg = (doc.internal as any).getCurrentPageInfo().pageNumber;
      doc.setFontSize(6.5);
      doc.setTextColor(170, 170, 170);
      doc.text(`${productName} · ${ledgerType === "pharmacy" ? "Pharmacy" : "Main"} Ledger`, pageW / 2, pageH - 6, { align: "center" });
      doc.text(`Page ${pg}`, pageW - margin, pageH - 6, { align: "right" });
      doc.setTextColor(0);
    },
  });
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function downloadLedgerPDF(opts: LedgerPDFOptions) {
  const { productName, genericName, unit, ledgerType, statement, isFullLedger, month, year, layout = "paginated" } = opts;

  const lh         = await fetchLetterhead();
  const logoBase64 = await loadImageAsBase64(lh.logoUrl);

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  // Determine pages/groups
  let pages: { label: string; rows: DayRow[] }[];
  let periodLabel: string;

  if (isFullLedger) {
    pages       = groupByMonth(statement).map(({ label, rows }) => ({ label, rows }));
    periodLabel = "Full Ledger (All Time)";
  } else {
    periodLabel = `${MONTHS[(month ?? 1) - 1]} ${year}`;
    pages       = [{ label: periodLabel, rows: statement }];
  }

  // Global totals for compact summary
  const globalDataRows    = statement.filter((r) => !r.descriptions.includes("Opening Balance"));
  const globalTotalIn     = globalDataRows.reduce((s, r) => s + r.in,  0);
  const globalTotalOut    = globalDataRows.reduce((s, r) => s + r.out, 0);
  const globalClosingBal  = statement.length > 0 ? statement[statement.length - 1].balance : 0;
  const globalOpeningRow  = statement.find((r) => r.descriptions.includes("Opening Balance"));
  const globalOpeningBal  = globalOpeningRow?.balance ?? 0;

  if (layout === "compact") {
    buildCompact(doc, lh, logoBase64, opts, pages, globalOpeningBal, globalTotalIn, globalTotalOut, globalClosingBal, periodLabel);
  } else {
    buildPaginated(doc, lh, logoBase64, statement, opts, pages, pages.length);
  }

  const safe   = productName.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_]/g, "");
  const suffix = isFullLedger
    ? `FullLedger_${layout}`
    : `${MONTHS[(month ?? 1) - 1]}_${year}`;
  doc.save(`Ledger_${safe}_${suffix}.pdf`);
}