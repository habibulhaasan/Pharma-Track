// app/api/ledger-export/route.ts
// Exports ledger data as xlsx — one product per sheet or single product
// GET /api/ledger-export?type=all                → all products, each on a sheet
// GET /api/ledger-export?productId=P1001&ledger=pharmacy → single product
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import ExcelJS from "exceljs";

export const runtime = "nodejs";

async function getLedgerEntries(
  productId: string,
  ledgerType: "main" | "pharmacy"
) {
  const db = getAdminDb();
  const collName = ledgerType === "main" ? "mainStock" : "pharmacyStock";
  const subColl = ledgerType === "main" ? "mainLedger" : "pharmacyLedger";

  const snap = await db
    .collection(collName)
    .doc(productId)
    .collection(subColl)
    .orderBy("timestamp", "asc")
    .get();

  return snap.docs.map((d) => {
    const data = d.data();
    const ts = data.timestamp?.toDate?.() ?? null;
    return {
      date: ts ? ts.toLocaleDateString("en-GB") : "",
      time: ts ? ts.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "",
      type: data.type ?? "",
      reference: data.reference ?? "",
      quantity: data.quantity ?? 0,
      batch: data.batch ?? "",
      supplier: data.supplier ?? "",
      patientName: data.patientName ?? "",
      prescriptionNo: data.prescriptionNo ?? "",
      reason: data.reason ?? "",
      editReason: data.editReason ?? "",
    };
  });
}

function buildRunningBalance(entries: any[]): any[] {
  let balance = 0;
  return entries.map((e) => {
    const isIn = e.type === "IN";
    const isAdj = e.type === "ADJUSTMENT";
    if (isIn) balance += e.quantity;
    else if (!isAdj) balance -= e.quantity;
    return { ...e, balance };
  });
}

function addLedgerSheet(
  wb: ExcelJS.Workbook,
  sheetName: string,
  productName: string,
  ledgerType: string,
  entries: any[]
) {
  const sheet = wb.addWorksheet(sheetName.slice(0, 31)); // Excel sheet name max 31 chars

  // Title
  sheet.mergeCells("A1:J1");
  const title = sheet.getCell("A1");
  title.value = `${productName} — ${ledgerType === "main" ? "Main Stock" : "Pharmacy"} Ledger`;
  title.font = { bold: true, size: 13, color: { argb: "FFFFFFFF" } };
  title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } };
  title.alignment = { horizontal: "center" };
  sheet.getRow(1).height = 24;

  // Headers
  const headers = ["Date", "Time", "Type", "Reference", "IN", "OUT", "Balance", "Batch", "Supplier / Patient", "Notes"];
  const headerRow = sheet.addRow(headers);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E40AF" } };
    cell.alignment = { horizontal: "center" };
    cell.border = {
      bottom: { style: "thin", color: { argb: "FFBFDBFE" } },
    };
  });

  const withBalance = buildRunningBalance(entries);

  withBalance.forEach((e, idx) => {
    const isIn = e.type === "IN";
    const isOut = e.type === "OUT";
    const detail = e.supplier || e.patientName
      ? `${e.supplier || ""}${e.patientName ? "Patient: " + e.patientName : ""}${e.prescriptionNo ? " Rx: " + e.prescriptionNo : ""}`
      : e.reason || e.editReason || "";

    const row = sheet.addRow([
      e.date,
      e.time,
      e.type,
      e.reference,
      isIn ? e.quantity : "",
      isOut ? e.quantity : "",
      e.balance,
      e.batch,
      detail,
      e.editReason ? `Edited: ${e.editReason}` : "",
    ]);

    // Alternate row shading
    if (idx % 2 === 0) {
      row.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0F9FF" } };
      });
    }

    // Color IN green, OUT red
    if (isIn) {
      row.getCell(5).font = { color: { argb: "FF16A34A" }, bold: true };
    } else if (isOut) {
      row.getCell(6).font = { color: { argb: "FFDC2626" }, bold: true };
    }

    // Balance color
    const balanceCell = row.getCell(7);
    balanceCell.font = { bold: true, color: { argb: e.balance > 0 ? "FF1D4ED8" : "FFDC2626" } };
  });

  // Totals row
  const totalIn = withBalance.filter((e) => e.type === "IN").reduce((s, e) => s + e.quantity, 0);
  const totalOut = withBalance.filter((e) => e.type === "OUT").reduce((s, e) => s + e.quantity, 0);
  const closingBalance = withBalance.length > 0 ? withBalance[withBalance.length - 1].balance : 0;

  const totalRow = sheet.addRow(["", "", "TOTALS", "", totalIn, totalOut, closingBalance, "", "", ""]);
  totalRow.eachCell((cell, col) => {
    cell.font = { bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF6FF" } };
    if (col === 5) cell.font = { bold: true, color: { argb: "FF16A34A" } };
    if (col === 6) cell.font = { bold: true, color: { argb: "FFDC2626" } };
    if (col === 7) cell.font = { bold: true, color: { argb: closingBalance > 0 ? "FF1D4ED8" : "FFDC2626" } };
  });

  // Column widths
  [12, 8, 12, 14, 10, 10, 10, 14, 30, 25].forEach((w, i) => {
    sheet.getColumn(i + 1).width = w;
  });

  return sheet;
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const exportType = searchParams.get("type"); // "all" or null
  const productId = searchParams.get("productId");
  const ledgerParam = (searchParams.get("ledger") ?? "pharmacy") as "main" | "pharmacy";

  const db = getAdminDb();
  const wb = new ExcelJS.Workbook();
  wb.creator = "PharmaTrack";
  wb.created = new Date();

  if (exportType === "all") {
    // Export ALL products — each gets two sheets (Main + Pharmacy)
    const productsSnap = await db.collection("products").where("deleted", "==", false).get();
    const products = productsSnap.docs.map((d) => ({
      id: d.id,
      brandName: d.data().brandName ?? d.id,
    }));

    // Sort: limit to avoid timeout — process all
    for (const product of products) {
      const [mainEntries, pharmEntries] = await Promise.all([
        getLedgerEntries(product.id, "main"),
        getLedgerEntries(product.id, "pharmacy"),
      ]);

      const shortName = product.brandName.replace(/[^a-zA-Z0-9 ]/g, "").slice(0, 20);

      if (mainEntries.length > 0) {
        addLedgerSheet(wb, `${shortName} Main`, product.brandName, "main", mainEntries);
      }
      if (pharmEntries.length > 0) {
        addLedgerSheet(wb, `${shortName} Pharm`, product.brandName, "pharmacy", pharmEntries);
      }
    }

    if (wb.worksheets.length === 0) {
      addLedgerSheet(wb, "No Data", "No Data", "main", []);
    }

    const filename = `PharmaTrack-All-Ledgers-${new Date().toISOString().split("T")[0]}.xlsx`;
    const buffer = await wb.xlsx.writeBuffer();

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  if (productId) {
    // Single product export
    const productDoc = await db.collection("products").doc(productId).get();
    const brandName = productDoc.data()?.brandName ?? productId;
    const entries = await getLedgerEntries(productId, ledgerParam);

    addLedgerSheet(wb, `${brandName} ${ledgerParam}`, brandName, ledgerParam, entries);

    const filename = `${brandName.replace(/[^a-zA-Z0-9]/g, "-")}-${ledgerParam}-ledger.xlsx`;
    const buffer = await wb.xlsx.writeBuffer();

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  return NextResponse.json({ error: "Provide productId or type=all" }, { status: 400 });
}