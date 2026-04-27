// lib/ledger-pdf.ts
// Minimal PDF ledger with govt letterhead fetched from Firestore /_meta/letterhead
// npm install jspdf jspdf-autotable

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";

interface DayRow {
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

interface LedgerPDFOptions {
  productName: string;
  genericName: string;
  unit: string;
  ledgerType: "main" | "pharmacy";
  statement: DayRow[];
  isFullLedger?: boolean;
  month?: number; // 1-12
  year?: number;
}

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

async function fetchLetterhead(): Promise<Letterhead | null> {
  try {
    const snap = await getDoc(doc(db, "_meta", "letterhead"));
    const d = snap.exists() ? snap.data() : {};
    
    return {
      // Points to /public/logo.png
      logoUrl: d.logoUrl ?? "/logo.png", 
      officeName: d.officeName ?? "Babrijhar (Chapra Saramjani) Union Health Sub Center",
      officeAddress: d.officeAddress ?? "Sadar, Nilphamari",
    };
  } catch {
    // Basic fallback if Firestore fails
    return {
      logoUrl: "/logo.png",
      officeName: "Babrijhar (Chapra Saramjani) Union Health Sub Center",
      officeAddress: "Sadar, Nilphamari",
    };
  }
}

async function loadImageAsBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function groupByMonth(rows: DayRow[]): Record<string, DayRow[]> {
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
  return map;
}

// Draw the letterhead on a page, returns the Y position after the header block
function drawHeader(
  doc: jsPDF,
  lh: Letterhead | null,
  logoBase64: string | null,
  pageW: number,
  margin: number,
  pageLabel: string,
  productName: string,
  genericName: string,
  unit: string,
  ledgerType: string,
  pageIdx: number,
  totalPages: number,
): number {
  let y = margin;
  const logoSize = 18; 
  const logoX = margin;

  // Render the local logo
  if (logoBase64) {
    try {
      // Local public assets are usually PNG or JPG
      const fmt = logoBase64.includes("png") ? "PNG" : "JPEG";
      doc.addImage(logoBase64, fmt, logoX, y, logoSize, logoSize);
    } catch (e) {
      console.error("Logo render error:", e);
    }
  }

  // Text alignment: Start text 5mm to the right of the logo
  const textX = logoX + logoSize + 5;
  const officeName = lh?.officeName || "";
  const officeAddress = lh?.officeAddress || "";

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(20, 20, 20);
  doc.text(officeName, textX, y + 7);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.text(officeAddress, textX, y + 12);

  // Page numbering (Top Right)
  doc.setFontSize(7);
  doc.text(`Page ${pageIdx + 1} / ${totalPages}`, pageW - margin, y + 5, { align: "right" });

  y += logoSize + 4;

  // Divider Line
  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageW - margin, y);
  
  return y + 5; 
}

// Draw small summary cards in one row, returns Y after cards
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
  const gap = 3;
  const cardW = (totalW - gap * (cards.length - 1)) / cards.length;
  const cardH = 10;

  cards.forEach((c, i) => {
    const cx = margin + i * (cardW + gap);
    // light tinted bg
    doc.setFillColor(c.bgR, c.bgG, c.bgB);
    doc.roundedRect(cx, y, cardW, cardH, 1.5, 1.5, "F");
    // left accent bar
    doc.setFillColor(c.r, c.g, c.b);
    doc.roundedRect(cx, y, 2.5, cardH, 0.5, 0.5, "F");
    // label
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(c.r, c.g, c.b);
    doc.text(c.label, cx + 5, y + 4);
    // value
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(30, 30, 30);
    doc.text(c.value, cx + 5, y + 8.2);
  });

  return y + cardH + 4;
}

export async function downloadLedgerPDF(opts: LedgerPDFOptions) {
  const { productName, genericName, unit, ledgerType, statement, isFullLedger, month, year } = opts;

  // Fetch letterhead once, then load logo in parallel
  const lh = await fetchLetterhead();
  const logoBase64 = lh?.logoUrl ? await loadImageAsBase64(lh.logoUrl) : null;

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 12;

  // Determine pages
  let pages: { label: string; rows: DayRow[] }[] = [];

  if (isFullLedger) {
    const grouped = groupByMonth(statement);
    const sortedKeys = Object.keys(grouped).sort();
    pages = sortedKeys.map((k) => {
      const [y, m] = k.split("-");
      const label = k === "0000-00" ? "Unknown Period" : `${MONTHS[Number(m) - 1]} ${y}`;
      return { label, rows: grouped[k] };
    });
  } else {
    const label = `${MONTHS[(month ?? 1) - 1]} ${year}`;
    pages = [{ label, rows: statement }];
  }

  const totalPages = pages.length;

  pages.forEach((page, pageIdx) => {
    if (pageIdx > 0) doc.addPage();

    const rows = page.rows;
    const openingRow = rows.find((r) => r.descriptions.includes("Opening Balance"));
    const dataRows   = rows.filter((r) => !r.descriptions.includes("Opening Balance"));
    const totalIn    = dataRows.reduce((s, r) => s + r.in, 0);
    const totalOut   = dataRows.reduce((s, r) => s + r.out, 0);
    const closingBal = rows.length > 0 ? rows[rows.length - 1].balance : 0;
    const openingBal = openingRow?.balance ?? 0;

    let y = drawHeader(
      doc, lh, logoBase64, pageW, margin,
      page.label, productName, genericName, unit, ledgerType,
      pageIdx, totalPages,
    );

    y = drawSummaryCards(doc, pageW, margin, y, openingBal, totalIn, totalOut, closingBal, unit);

    // ── Table — Date | IN | OUT | Balance (no Description) ───────────────
    const tableRows = rows.map((r) => [
      r.dateKey,
      r.in  > 0 ? `+${r.in.toLocaleString()}`  : "—",
      r.out > 0 ? `-${r.out.toLocaleString()}` : "—",
      r.balance.toLocaleString(),
    ]);

   // Calculate usable width: Page width minus both side margins
// Calculate the available width inside the margins
const usableWidth = pageW - (margin * 2);

autoTable(doc, {
  startY: y,
  head: [["Date", "IN", "OUT", "Balance"]],
  body: tableRows,
  foot: [[
    { content: `Closing — ${page.label}`, styles: { fontStyle: "bold", textColor: [50, 50, 50] } },
    { content: `+${totalIn.toLocaleString()}`,  styles: { fontStyle: "bold", textColor: [22, 163, 74]  } },
    { content: `-${totalOut.toLocaleString()}`, styles: { fontStyle: "bold", textColor: [220, 38, 38]  } },
    { content: `${closingBal.toLocaleString()} ${unit}`, styles: { fontStyle: "bold", textColor: [30, 64, 175] } },
  ]],
  margin: { left: margin, right: margin },
  // Setting tableWidth to 'auto' ensures it stretches to the margins but no further
  tableWidth: 'auto', 
  styles: { 
    fontSize: 8, 
    cellPadding: 2.2, 
    lineColor: [220, 220, 220], 
    lineWidth: 0.2,
    overflow: 'linebreak' 
  },
  headStyles: {
    fillColor: [235, 235, 235],
    textColor: [50, 50, 50],
    fontStyle: "bold",
    fontSize: 7.5,
    lineColor: [200, 200, 200],
  },
  footStyles: {
    fillColor: [245, 245, 245],
    fontSize: 9,
    lineColor: [200, 200, 200],
  },
  columnStyles: {
    // Proportional widths to guarantee fit within the "window"
    0: { cellWidth: usableWidth * 0.30 },             // Date (30%)
    1: { cellWidth: usableWidth * 0.20, halign: "right", textColor: [22, 163, 74]  }, // IN
    2: { cellWidth: usableWidth * 0.20, halign: "right", textColor: [220, 38, 38]  }, // OUT
    3: { cellWidth: usableWidth * 0.30, halign: "right", fontStyle: "bold"         }, // Balance
  },
  alternateRowStyles: { fillColor: [250, 250, 250] },
  bodyStyles: { textColor: [40, 40, 40] },
  didParseCell(data) {
    if (
      data.section === "body" &&
      Array.isArray(data.row.raw) &&
      typeof data.row.raw[0] === "string" &&
      (data.row.raw[0] as string).startsWith("Opening Balance")
    ) {
      data.cell.styles.fillColor = [240, 240, 240];
      data.cell.styles.fontStyle = "bold";
      data.cell.styles.textColor = [80, 80, 80];
    }
  },
  didDrawPage(data) {
    // Keeps your original footer logic
    const pg = (doc.internal as any).getCurrentPageInfo().pageNumber;
    doc.setFontSize(6.5);
    doc.setTextColor(170, 170, 170);
    doc.text(
      `${productName} · ${ledgerType === "pharmacy" ? "Pharmacy" : "Main"} Ledger`,
      pageW / 2, pageH - 6, { align: "center" },
    );
    doc.text(`Page ${pg}`, pageW - margin, pageH - 6, { align: "right" });
    doc.setTextColor(0, 0, 0);
  },
});
  });

  // Filename: Ledger_ProductName_Month_Year.pdf

  const safe   = productName.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_]/g, "");
  const suffix = isFullLedger ? "FullLedger" : `${MONTHS[(month ?? 1) - 1]}_${year}`;
  doc.save(`Ledger_${safe}_${suffix}.pdf`);
}