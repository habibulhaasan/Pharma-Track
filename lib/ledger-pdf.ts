// lib/ledger-pdf.ts
// PDF generation for ledger using jsPDF + jspdf-autotable
// Install: npm install jspdf jspdf-autotable

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface DayRow {
  dateKey: string;
  sortKey: number;
  in: number;
  out: number;
  balance: number;
  descriptions: string[];
  details: string[];
}

interface LedgerPDFOptions {
  productName: string;
  genericName: string;
  unit: string;
  ledgerType: "main" | "pharmacy";
  statement: DayRow[];        // full or monthly statement rows
  isFullLedger?: boolean;
  month?: number;             // 1-12 (used if !isFullLedger)
  year?: number;
}

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

/** Group statement rows by "YYYY-MM" for pagination */
function groupByMonth(rows: DayRow[]): Record<string, DayRow[]> {
  const map: Record<string, DayRow[]> = {};
  rows.forEach((row) => {
    // Opening balance rows have sortKey === 0 — attach to their labelled month
    let key: string;
    if (row.sortKey === 0) {
      // extract month label from dateKey like "Opening Balance (April 2026)"
      const match = row.dateKey.match(/\((\w+) (\d{4})\)/);
      key = match ? `${match[2]}-${String(MONTHS.indexOf(match[1]) + 1).padStart(2, "0")}` : "0000-00";
    } else {
      const d = new Date(row.sortKey);
      key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    }
    if (!map[key]) map[key] = [];
    map[key].push(row);
  });
  return map;
}

export function downloadLedgerPDF(opts: LedgerPDFOptions) {
  const { productName, genericName, unit, ledgerType, statement, isFullLedger, month, year } = opts;

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;
  const now = new Date().toLocaleString("en-GB");

  // Determine pages to render
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

    // ── Header ──────────────────────────────────────────────
    doc.setFillColor(30, 64, 175); // primary blue
    doc.rect(0, 0, pageW, 28, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text(productName, margin, 11);

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(`${genericName} · Unit: ${unit} · ${ledgerType === "pharmacy" ? "Pharmacy Stock" : "Main Stock"}`, margin, 17);
    doc.text(`Period: ${page.label}${isFullLedger ? " (Full Ledger)" : ""}`, margin, 22.5);

    // Page number top-right
    doc.setFontSize(8);
    doc.text(`Page ${pageIdx + 1} of ${totalPages}`, pageW - margin, 11, { align: "right" });
    doc.text(`Printed: ${now}`, pageW - margin, 17, { align: "right" });

    // ── Summary pills (IN / OUT / Balance) ──────────────────
    const rows = page.rows;
    const openingRow = rows.find((r) => r.descriptions.includes("Opening Balance"));
    const dataRows = rows.filter((r) => !r.descriptions.includes("Opening Balance"));
    const totalIn = dataRows.reduce((s, r) => s + r.in, 0);
    const totalOut = dataRows.reduce((s, r) => s + r.out, 0);
    const closingBal = rows.length > 0 ? rows[rows.length - 1].balance : 0;
    const openingBal = openingRow?.balance ?? 0;

    doc.setTextColor(0, 0, 0);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");

    const pillY = 33;
    const pillH = 7;
    const pills = [
      { label: `Opening: ${openingBal.toLocaleString()} ${unit}`, color: [100, 116, 139] as [number,number,number] },
      { label: `IN: +${totalIn.toLocaleString()}`, color: [22, 163, 74] as [number,number,number] },
      { label: `OUT: -${totalOut.toLocaleString()}`, color: [220, 38, 38] as [number,number,number] },
      { label: `Closing: ${closingBal.toLocaleString()} ${unit}`, color: [30, 64, 175] as [number,number,number] },
    ];
    let pillX = margin;
    pills.forEach(({ label, color }) => {
      const tw = doc.getTextWidth(label) + 6;
      doc.setFillColor(...color);
      doc.roundedRect(pillX, pillY, tw, pillH, 1.5, 1.5, "F");
      doc.setTextColor(255, 255, 255);
      doc.text(label, pillX + 3, pillY + 4.8);
      pillX += tw + 3;
    });

    // ── Table ─────────────────────────────────────────────────
    doc.setTextColor(0, 0, 0);

    const tableRows = rows.map((r) => [
      r.dateKey,
      r.descriptions.join(", ") + (r.details.length ? `\n${r.details.join(" · ")}` : ""),
      r.in > 0 ? `+${r.in.toLocaleString()}` : "—",
      r.out > 0 ? `-${r.out.toLocaleString()}` : "—",
      r.balance.toLocaleString(),
    ]);

    autoTable(doc, {
      startY: pillY + pillH + 3,
      head: [["Date", "Description", "IN", "OUT", "Balance"]],
      body: tableRows,
      foot: [[
        { content: `Closing Balance — ${page.label}`, colSpan: 2, styles: { fontStyle: "bold" } },
        { content: `+${totalIn.toLocaleString()}`, styles: { fontStyle: "bold", textColor: [22, 163, 74] } },
        { content: `-${totalOut.toLocaleString()}`, styles: { fontStyle: "bold", textColor: [220, 38, 38] } },
        { content: `${closingBal.toLocaleString()} ${unit}`, styles: { fontStyle: "bold", textColor: [30, 64, 175] } },
      ]],
      margin: { left: margin, right: margin },
      styles: { fontSize: 8, cellPadding: 2.5, overflow: "linebreak" },
      headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: "bold", fontSize: 8 },
      footStyles: { fillColor: [241, 245, 249], textColor: [0, 0, 0], fontSize: 8 },
      columnStyles: {
        0: { cellWidth: 30 },
        1: { cellWidth: "auto" },
        2: { cellWidth: 20, halign: "right", textColor: [22, 163, 74] },
        3: { cellWidth: 20, halign: "right", textColor: [220, 38, 38] },
        4: { cellWidth: 24, halign: "right", fontStyle: "bold" },
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      bodyStyles: { textColor: [30, 30, 30] },
      didParseCell(data) {
        // Highlight opening balance row
        if (
          data.section === "body" &&
          Array.isArray(data.row.raw) &&
          typeof data.row.raw[1] === "string" &&
          data.row.raw[1].startsWith("Opening Balance")
        ) {
          data.cell.styles.fillColor = [226, 232, 240];
          data.cell.styles.fontStyle = "bold";
        }
      },
      // If table overflows the page, autoTable handles it automatically
      // but we add a footer on every continuation page via addPageContent
      didDrawPage(data) {
        // Footer on every auto-split page
        const pg = (doc.internal as any).getCurrentPageInfo().pageNumber;
        doc.setFontSize(7);
        doc.setTextColor(150);
        doc.text(
          `${productName} · ${ledgerType === "pharmacy" ? "Pharmacy" : "Main"} Ledger · Page ${pg}`,
          pageW / 2,
          pageH - 6,
          { align: "center" }
        );
        doc.setTextColor(0, 0, 0);
      },
    });
  });

  const safeProduct = productName.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_]/g, "");
  const suffix = isFullLedger ? "FullLedger" : `${MONTHS[(month ?? 1) - 1]}_${year}`;
  doc.save(`Ledger_${safeProduct}_${suffix}.pdf`);
}