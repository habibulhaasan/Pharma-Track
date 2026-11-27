// app/api/monthly-report-export/route.ts
// Excel export for the Monthly Report page.
//   GET ?scope=year&kind=pharmacy&year=2025                → all products, 12 months each
//   GET ?scope=month&kind=pharmacy&year=2025&month=3       → all products, one month
//   GET ?scope=product&kind=pharmacy&year=2025&productId=P1001 → one product, 12 months
import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getCurrentUser } from "@/lib/auth";
import { getAllProducts } from "@/services/productService";
import { sortProducts } from "@/utils/stockUtils";
import {
  getAllProductsYearReport,
  getMonthlyProductReport,
  getProductMonthlySeries,
  type LedgerKind,
  type YearScope,
} from "@/services/monthlyReportService";

export const runtime = "nodejs";
export const maxDuration = 60;

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

const HEAD_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } };
const TOTAL_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } };

function styleHeader(row: ExcelJS.Row) {
  row.eachCell((c) => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = HEAD_FILL;
    c.alignment = { vertical: "middle", horizontal: "center" };
  });
  row.height = 20;
}

function styleTotal(row: ExcelJS.Row) {
  row.eachCell((c) => {
    c.font = { bold: true };
    c.fill = TOTAL_FILL;
    c.border = { top: { style: "medium" } };
  });
}

function numCols(sheet: ExcelJS.Worksheet, from: number, to: number) {
  for (let i = from; i <= to; i++) {
    sheet.getColumn(i).alignment = { horizontal: "right" };
    sheet.getColumn(i).numFmt = "#,##0";
  }
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const scope = sp.get("scope") ?? "year";
  const kind: LedgerKind = sp.get("kind") === "main" ? "main" : "pharmacy";
  const yearParam = sp.get("year");
  const yearScope: YearScope = yearParam === "all" ? "all" : (Number(yearParam) || new Date().getFullYear());
  const year = typeof yearScope === "number" ? yearScope : new Date().getFullYear();
  const month = Number(sp.get("month")) || 1;
  const productId = sp.get("productId") ?? "";
  const kindLabel = kind === "main" ? "Main Stock" : "Pharmacy";
  const scopeLabel = yearScope === "all" ? "AllMonths" : String(yearScope);

  try {
    const products = sortProducts(
      (await getAllProducts() as any[]).map((p) => ({
        id: p.id as string,
        brandName: (p.brandName ?? "") as string,
        genericName: (p.genericName ?? "") as string,
        unit: (p.unit ?? "") as string,
        type: (p.type ?? "") as string,
      }))
    );

    const wb = new ExcelJS.Workbook();
    wb.creator = "PharmaTrack";
    let filename = "";

    // ── Year / All-Months, all products ──────────────────────────────────
    if (scope === "year") {
      const data = await getAllProductsYearReport(kind, yearScope);
      const byId = new Map(data.map((d) => [d.productId, d.months]));

      // Sheet 1: summary (one row per product)
      const sum = wb.addWorksheet(yearScope === "all" ? "All-Time Summary" : "Year Summary");
      sum.columns = [
        { header: "Brand", key: "brand", width: 28 },
        { header: "Generic", key: "generic", width: 28 },
        { header: "Unit", key: "unit", width: 10 },
        { header: yearScope === "all" ? "Opening" : `Opening (1 Jan ${yearScope})`, key: "opening", width: 18 },
        { header: "Total IN", key: "in", width: 12 },
        { header: "Total OUT", key: "out", width: 12 },
        { header: yearScope === "all" ? "Closing" : `Closing (31 Dec ${yearScope})`, key: "closing", width: 18 },
      ];
      styleHeader(sum.getRow(1));
      numCols(sum, 4, 7);
      sum.views = [{ state: "frozen", ySplit: 1 }];

      // Sheet 2: flat monthly detail — filterable / pivot-friendly
      const det = wb.addWorksheet("Monthly Detail");
      det.columns = [
        { header: "Brand", key: "brand", width: 28 },
        { header: "Generic", key: "generic", width: 28 },
        { header: "Unit", key: "unit", width: 10 },
        { header: "Month", key: "month", width: 16 },
        { header: "Opening", key: "opening", width: 12 },
        { header: "IN", key: "in", width: 12 },
        { header: "OUT", key: "out", width: 12 },
        { header: "Balance", key: "closing", width: 12 },
      ];
      styleHeader(det.getRow(1));
      numCols(det, 5, 8);
      det.views = [{ state: "frozen", ySplit: 1 }];

      for (const p of products) {
        const months = byId.get(p.id);
        if (!months || months.length === 0) continue;
        const tin = months.reduce((s, m) => s + m.in, 0);
        const tout = months.reduce((s, m) => s + m.out, 0);
        if (months[0].opening === 0 && tin === 0 && tout === 0) continue; // inactive
        sum.addRow({
          brand: p.brandName, generic: p.genericName, unit: p.unit,
          opening: months[0].opening, in: tin, out: tout, closing: months[months.length - 1].closing,
        });
        months.forEach((m) =>
          det.addRow({
            brand: p.brandName, generic: p.genericName, unit: p.unit,
            month: `${MONTHS[m.month - 1]} ${m.year}`,
            opening: m.opening, in: m.in, out: m.out, closing: m.closing,
          })
        );
      }
      det.autoFilter = { from: "A1", to: "H1" };
      sum.autoFilter = { from: "A1", to: "G1" };
      filename = `PharmaTrack-${kindLabel.replace(" ", "")}-${scopeLabel}-monthly-report.xlsx`;
    }

    // ── One month, all products ──────────────────────────────────────────
    else if (scope === "month") {
      const data = await getMonthlyProductReport(kind, year, month);
      const byId = new Map(data.map((d) => [d.productId, d]));
      const sheet = wb.addWorksheet(`${MONTHS[month - 1]} ${year}`);
      sheet.columns = [
        { header: "Brand", key: "brand", width: 28 },
        { header: "Generic", key: "generic", width: 28 },
        { header: "Unit", key: "unit", width: 10 },
        { header: "Opening", key: "opening", width: 12 },
        { header: "IN", key: "in", width: 12 },
        { header: "OUT", key: "out", width: 12 },
        { header: "Closing", key: "closing", width: 12 },
        { header: "Remaining (current)", key: "remaining", width: 20 },
      ];
      styleHeader(sheet.getRow(1));
      numCols(sheet, 4, 8);
      sheet.views = [{ state: "frozen", ySplit: 1 }];

      for (const p of products) {
        const r = byId.get(p.id);
        if (!r || (r.opening === 0 && r.in === 0 && r.out === 0 && r.closing === 0)) continue;
        sheet.addRow({
          brand: p.brandName, generic: p.genericName, unit: p.unit,
          opening: r.opening, in: r.in, out: r.out, closing: r.closing, remaining: r.remaining,
        });
      }
      sheet.autoFilter = { from: "A1", to: "H1" };
      filename = `PharmaTrack-${kindLabel.replace(" ", "")}-${year}-${String(month).padStart(2, "0")}-report.xlsx`;
    }

    // ── One product, 12 months or all months ─────────────────────────────
    else if (scope === "product") {
      const p = products.find((x) => x.id === productId);
      if (!p) return NextResponse.json({ error: "Product not found" }, { status: 404 });
      const months = await getProductMonthlySeries(productId, kind, yearScope);
      const sheetTitle = yearScope === "all" ? "All Months" : `${yearScope}`;
      const sheet = wb.addWorksheet(sheetTitle);
      sheet.addRow([`${p.brandName} — ${p.genericName} (${p.unit}) · ${kindLabel} · ${sheetTitle}`]).font = { bold: true, size: 12 };
      sheet.addRow([]);
      sheet.columns = [
        { key: "month", width: 18 }, { key: "opening", width: 12 },
        { key: "in", width: 12 }, { key: "out", width: 12 }, { key: "closing", width: 12 },
      ];
      styleHeader(sheet.addRow(["Month", "Opening", "IN", "OUT", "Balance"]));
      months.forEach((m) =>
        sheet.addRow([`${MONTHS[m.month - 1]} ${m.year}`, m.opening, m.in, m.out, m.closing])
      );
      styleTotal(sheet.addRow([
        "Total", months[0]?.opening ?? 0,
        months.reduce((s, m) => s + m.in, 0),
        months.reduce((s, m) => s + m.out, 0),
        months.length ? months[months.length - 1].closing : 0,
      ]));
      numCols(sheet, 2, 5);
      filename = `${p.brandName.replace(/[^a-zA-Z0-9]/g, "-")}-${kindLabel.replace(" ", "")}-${scopeLabel}-monthly.xlsx`;
    } else {
      return NextResponse.json({ error: "Invalid scope" }, { status: 400 });
    }

    const buffer = await wb.xlsx.writeBuffer();
    return new NextResponse(buffer as ArrayBuffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error("monthly-report-export:", err);
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}