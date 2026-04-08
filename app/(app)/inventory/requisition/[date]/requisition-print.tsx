"use client";
// app/(app)/inventory/requisition/[date]/requisition-print.tsx
// Full A4 printable requisition. Auto-opens print dialog on load.
// Two-column product layout matching the hand-drawn sketch.
import { useEffect } from "react";
import { Printer } from "lucide-react";

interface Entry {
  id: string;
  productId: string;
  brandName: string;
  genericName: string;
  unit: string;
  quantity: number;
  batch?: string;
}

interface Letterhead {
  logoUrl?: string;
  officeName?: string;
  officeAddress?: string;
  submittedToName?: string;
  submittedToDesignation?: string;
  submittedToOfficeName?: string;
  submittedToAddress?: string;
  requisitorName?: string;
  requisitorDesignation?: string;
  requisitorOfficeName?: string;
  requisitorAddress?: string;
}

export function RequisitionPrint({
  date,
  rawDate,
  entries,
  letterhead,
}: {
  date: string;
  rawDate: string;
  entries: Entry[];
  letterhead: Letterhead;
}) {
  // Auto-trigger print dialog after page loads
  useEffect(() => {
    const timer = setTimeout(() => window.print(), 800);
    return () => clearTimeout(timer);
  }, []);

  // Split entries into two columns
  const half = Math.ceil(entries.length / 2);
  const leftCol = entries.slice(0, half);
  const rightCol = entries.slice(half);

  // Make both columns equal length by padding
  const maxRows = Math.max(leftCol.length, rightCol.length);
  const paddedLeft = [...leftCol, ...Array(maxRows - leftCol.length).fill(null)];
  const paddedRight = [...rightCol, ...Array(maxRows - rightCol.length).fill(null)];

  return (
    <>
      {/* Print button — hidden during actual print */}
      <div className="no-print fixed top-4 right-4 z-50 flex gap-2">
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-lg hover:bg-primary/90 transition-colors"
        >
          <Printer className="h-4 w-4" />
          Print / Save PDF
        </button>
        <button
          onClick={() => window.close()}
          className="flex items-center gap-2 rounded-lg border bg-background px-4 py-2 text-sm font-medium shadow-lg hover:bg-muted/50 transition-colors"
        >
          Close
        </button>
      </div>

      {/* A4 Page */}
      <div className="a4-page">

        {/* ── LETTERHEAD ─────────────────────────────────────── */}
        <div className="letterhead">
          {/* Logo + Office info */}
          <div className="letterhead-top">
            <div className="logo-box">
              {letterhead.logoUrl ? (
                <img src={letterhead.logoUrl} alt="Logo" className="logo-img" />
              ) : (
                <div className="logo-placeholder">LOGO</div>
              )}
            </div>

            <div className="office-center">
              <div className="office-name">
                {letterhead.officeName || "Office Name"}
              </div>
              <div className="office-address">
                {letterhead.officeAddress || "Office Address"}
              </div>
            </div>

            <div className="date-box">
              <div className="date-label">Date:</div>
              <div className="date-value">{date}</div>
            </div>
          </div>

          {/* Divider */}
          <div className="header-divider" />

          {/* Requisition For title */}
          <div className="requisition-title-wrap">
            <div className="requisition-title">Requisition For</div>
          </div>
        </div>

        {/* ── PRODUCT TABLE ──────────────────────────────────── */}
        <table className="product-table">
          <thead>
            <tr>
              <th className="col-sl">Sl.</th>
              <th className="col-name">Medicine Name</th>
              <th className="col-qty">QTY</th>
              <th className="col-divider"></th>
              <th className="col-sl">Sl.</th>
              <th className="col-name">Medicine Name</th>
              <th className="col-qty">QTY</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: maxRows }).map((_, i) => {
              const left = paddedLeft[i];
              const right = paddedRight[i];
              return (
                <tr key={i} className={i % 2 === 0 ? "row-even" : "row-odd"}>
                  {/* Left column */}
                  <td className="col-sl">{left ? i + 1 : ""}</td>
                  <td className="col-name">
                    {left ? (
                      <>
                        <span className="med-brand">{left.brandName}</span>
                        {left.genericName && left.genericName !== left.brandName && (
                          <span className="med-generic"> ({left.genericName})</span>
                        )}
                      </>
                    ) : ""}
                  </td>
                  <td className="col-qty">{left ? `${left.quantity} ${left.unit}` : ""}</td>

                  {/* Center divider */}
                  <td className="col-divider"></td>

                  {/* Right column */}
                  <td className="col-sl">{right ? half + i + 1 : ""}</td>
                  <td className="col-name">
                    {right ? (
                      <>
                        <span className="med-brand">{right.brandName}</span>
                        {right.genericName && right.genericName !== right.brandName && (
                          <span className="med-generic"> ({right.genericName})</span>
                        )}
                      </>
                    ) : ""}
                  </td>
                  <td className="col-qty">{right ? `${right.quantity} ${right.unit}` : ""}</td>
                </tr>
              );
            })}

            {/* Extra blank rows to fill page — minimum 25 rows total */}
            {Array.from({ length: Math.max(0, 25 - maxRows) }).map((_, i) => (
              <tr key={`blank-${i}`} className={i % 2 === 0 ? "row-even" : "row-odd"}>
                <td className="col-sl"></td>
                <td className="col-name"></td>
                <td className="col-qty"></td>
                <td className="col-divider"></td>
                <td className="col-sl"></td>
                <td className="col-name"></td>
                <td className="col-qty"></td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* ── SIGNATURES ─────────────────────────────────────── */}
        <div className="signatures">
          <div className="sig-block">
            <div className="sig-line"></div>
            <div className="sig-name">{letterhead.submittedToName || "Submitted To Name"}</div>
            <div className="sig-detail">{letterhead.submittedToDesignation || "Designation"}</div>
            <div className="sig-detail">{letterhead.submittedToOfficeName || "Office Name"}</div>
            <div className="sig-detail">{letterhead.submittedToAddress || "Address"}</div>
          </div>

          <div className="sig-block sig-right">
            <div className="sig-line"></div>
            <div className="sig-name">{letterhead.requisitorName || "Requisitor Name"}</div>
            <div className="sig-detail">{letterhead.requisitorDesignation || "Designation"}</div>
            <div className="sig-detail">{letterhead.requisitorOfficeName || "Office Name"}</div>
            <div className="sig-detail">{letterhead.requisitorAddress || "Address"}</div>
          </div>
        </div>

        {/* Total count */}
        <div className="total-line">
          Total medicines: <strong>{entries.length}</strong> &nbsp;|&nbsp;
          Total quantity: <strong>{entries.reduce((s, e) => s + e.quantity, 0).toLocaleString()}</strong> pieces
        </div>
      </div>

      {/* ── STYLES ─────────────────────────────────────────── */}
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }

        body {
          background: #e5e5e5;
          font-family: 'Times New Roman', serif;
        }

        .no-print { }

        /* A4 page */
        .a4-page {
          width: 210mm;
          min-height: 297mm;
          margin: 20px auto;
          background: white;
          padding: 15mm 15mm 12mm 15mm;
          box-shadow: 0 4px 24px rgba(0,0,0,0.15);
          display: flex;
          flex-direction: column;
        }

        /* Letterhead */
        .letterhead { margin-bottom: 6mm; }

        .letterhead-top {
          display: flex;
          align-items: flex-start;
          gap: 8mm;
          margin-bottom: 3mm;
        }

        .logo-box { flex-shrink: 0; }

        .logo-img {
          width: 20mm;
          height: 20mm;
          object-fit: contain;
        }

        .logo-placeholder {
          width: 20mm;
          height: 20mm;
          border: 1.5px solid #333;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 9pt;
          color: #666;
        }

        .office-center {
          flex: 1;
          text-align: center;
        }

        .office-name {
          font-size: 14pt;
          font-weight: bold;
          line-height: 1.3;
        }

        .office-address {
          font-size: 10pt;
          color: #444;
          margin-top: 1mm;
          line-height: 1.4;
        }

        .date-box {
          flex-shrink: 0;
          text-align: right;
          font-size: 10pt;
        }

        .date-label { font-weight: bold; }
        .date-value { margin-top: 1mm; }

        .header-divider {
          border-top: 2px solid #333;
          margin: 3mm 0;
        }

        .requisition-title-wrap {
          text-align: center;
          margin-bottom: 4mm;
        }

        .requisition-title {
          display: inline-block;
          border: 2px solid #333;
          padding: 2mm 8mm;
          font-size: 13pt;
          font-weight: bold;
          letter-spacing: 1px;
        }

        /* Product table */
        .product-table {
          width: 100%;
          border-collapse: collapse;
          flex: 1;
          font-size: 10pt;
        }

        .product-table thead tr {
          background: #f0f0f0;
          border-top: 2px solid #333;
          border-bottom: 2px solid #333;
        }

        .product-table th {
          padding: 2mm 2mm;
          text-align: left;
          font-weight: bold;
          font-size: 10pt;
        }

        .product-table td {
          padding: 1.5mm 2mm;
          font-size: 9.5pt;
          border-bottom: 0.5px solid #ddd;
          vertical-align: top;
        }

        .col-sl { width: 8mm; text-align: center; }
        .col-name { }
        .col-qty { width: 20mm; text-align: center; white-space: nowrap; }
        .col-divider {
          width: 3mm;
          border-left: 1.5px solid #999 !important;
          border-right: 1.5px solid #999 !important;
          background: #f8f8f8;
          padding: 0 !important;
        }

        .row-even { background: white; }
        .row-odd { background: #fafafa; }

        .med-brand { font-weight: 500; }
        .med-generic { font-size: 8.5pt; color: #555; }

        /* Signatures */
        .signatures {
          display: flex;
          justify-content: space-between;
          margin-top: 12mm;
          padding-top: 4mm;
        }

        .sig-block { width: 45%; }
        .sig-right { text-align: right; }

        .sig-line {
          border-top: 1.5px solid #333;
          margin-bottom: 2mm;
        }

        .sig-name {
          font-size: 10.5pt;
          font-weight: bold;
          line-height: 1.4;
        }

        .sig-detail {
          font-size: 9.5pt;
          color: #444;
          line-height: 1.4;
        }

        .total-line {
          text-align: center;
          font-size: 9pt;
          color: #666;
          margin-top: 4mm;
          border-top: 0.5px solid #ddd;
          padding-top: 2mm;
        }

        /* Print styles */
        @media print {
          body { background: white; margin: 0; }

          .no-print { display: none !important; }

          .a4-page {
            width: 100%;
            min-height: 100vh;
            margin: 0;
            padding: 12mm 14mm 10mm 14mm;
            box-shadow: none;
          }

          @page {
            size: A4 portrait;
            margin: 0;
          }
        }
      `}</style>
    </>
  );
}