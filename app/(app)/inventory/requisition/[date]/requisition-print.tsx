"use client";
// app/(print)/inventory/requisition/[date]/requisition-print.tsx
//
// Renders a professional A4 inventory requisition.
// • Organisation name auto-shrinks via JS to always fit one line
// • No generic name shown — brand name only
// • No blank padding rows — table ends at last real entry
// • Print renders the document only, zero app chrome
// • window.print() triggers the browser's native PDF dialog (not a screenshot)

import { useEffect, useRef } from "react";
import { Printer, X } from "lucide-react";

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
  const orgNameRef = useRef<HTMLDivElement>(null);

  // Auto-scale org name font so it always fits on one line
  useEffect(() => {
    const el = orgNameRef.current;
    if (!el) return;
    let size = 18;
    el.style.fontSize = `${size}pt`;
    while (el.scrollWidth > el.clientWidth && size > 8) {
      size -= 0.5;
      el.style.fontSize = `${size}pt`;
    }
  }, [letterhead.officeName]);

  // Auto-trigger print dialog (generates real PDF via browser engine)
  useEffect(() => {
    const t = setTimeout(() => window.print(), 700);
    return () => clearTimeout(t);
  }, []);

  // Two-column split — only real entries, NO padding rows
  const half     = Math.ceil(entries.length / 2);
  const leftCol  = entries.slice(0, half);
  const rightCol = entries.slice(half);
  const maxRows  = Math.max(leftCol.length, rightCol.length);
  const totalQty = entries.reduce((s, e) => s + e.quantity, 0);

  return (
    <>
      {/* ── Screen-only controls ──────────────────────────── */}
      <div className="rq-toolbar no-print">
        <button className="rq-btn-print" onClick={() => window.print()}>
          <Printer size={14} strokeWidth={2} />
          Print / Save PDF
        </button>
        <button className="rq-btn-close" onClick={() => window.close()}>
          <X size={14} strokeWidth={2} />
          Close
        </button>
      </div>

      {/* ── A4 Document ───────────────────────────────────── */}
      <div className="rq-page">

        {/* ═══ LETTERHEAD ═══════════════════════════════════ */}
        <header className="rq-lh">
          <div className="rq-lh-row">

            {/* Logo */}
            <div className="rq-logo-wrap">
              {letterhead.logoUrl ? (
                <img src={letterhead.logoUrl} alt="Logo" className="rq-logo-img" />
              ) : (
                <div className="rq-logo-placeholder">LOGO</div>
              )}
            </div>

            {/* Centre — org name + address */}
            <div className="rq-lh-centre">
              <div className="rq-org-name" ref={orgNameRef}>
                {letterhead.officeName || "Organisation Name"}
              </div>
              {letterhead.officeAddress && (
                <div className="rq-org-address">{letterhead.officeAddress}</div>
              )}
            </div>

            {/* Date */}
            <div className="rq-lh-date">
              <span className="rq-date-label">Date</span>
              <span className="rq-date-value">{date}</span>
            </div>

          </div>

          {/* Heavy rule */}
          <div className="rq-rule-heavy" />

          {/* Title badge */}
          <div className="rq-title-row">
            <span className="rq-title-badge">INVENTORY REQUISITION</span>
          </div>
        </header>

        {/* ═══ MEDICINE TABLE ═══════════════════════════════ */}
        <table className="rq-table">
          <thead>
            <tr>
              <th className="rq-th rq-col-sl">Sl.</th>
              <th className="rq-th rq-col-name">Medicine Name</th>
              <th className="rq-th rq-col-qty">Qty</th>
              <th className="rq-th rq-col-gap" aria-hidden="true" />
              <th className="rq-th rq-col-sl">Sl.</th>
              <th className="rq-th rq-col-name">Medicine Name</th>
              <th className="rq-th rq-col-qty">Qty</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: maxRows }).map((_, i) => {
              const L = leftCol[i]  ?? null;
              const R = rightCol[i] ?? null;
              return (
                <tr key={i} className={i % 2 === 0 ? "rq-row-even" : "rq-row-odd"}>
                  <td className="rq-td rq-col-sl">{L ? i + 1 : ""}</td>
                  <td className="rq-td rq-col-name">{L ? L.brandName : ""}</td>
                  <td className="rq-td rq-col-qty">{L ? `${L.quantity} ${L.unit}` : ""}</td>

                  <td className="rq-td rq-col-gap" aria-hidden="true" />

                  <td className="rq-td rq-col-sl">{R ? half + i + 1 : ""}</td>
                  <td className="rq-td rq-col-name">{R ? R.brandName : ""}</td>
                  <td className="rq-td rq-col-qty">{R ? `${R.quantity} ${R.unit}` : ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* ═══ SUMMARY ══════════════════════════════════════ */}
        <div className="rq-summary">
          <span>Total items: <strong>{entries.length}</strong></span>
          <span className="rq-summary-sep">|</span>
          <span>Total quantity: <strong>{totalQty.toLocaleString()}</strong></span>
        </div>

        {/* ═══ SIGNATURES ═══════════════════════════════════ */}
        <div className="rq-sigs">
          <div className="rq-sig rq-sig-left">
            <div className="rq-sig-line" />
            <p className="rq-sig-name">{letterhead.submittedToName || "Submitted To"}</p>
            {letterhead.submittedToDesignation && (
              <p className="rq-sig-detail">{letterhead.submittedToDesignation}</p>
            )}
            {letterhead.submittedToOfficeName && (
              <p className="rq-sig-detail">{letterhead.submittedToOfficeName}</p>
            )}
            {letterhead.submittedToAddress && (
              <p className="rq-sig-detail">{letterhead.submittedToAddress}</p>
            )}
          </div>

          <div className="rq-sig rq-sig-right">
            <div className="rq-sig-line" />
            <p className="rq-sig-name">{letterhead.requisitorName || "Requisitor"}</p>
            {letterhead.requisitorDesignation && (
              <p className="rq-sig-detail">{letterhead.requisitorDesignation}</p>
            )}
            {letterhead.requisitorOfficeName && (
              <p className="rq-sig-detail">{letterhead.requisitorOfficeName}</p>
            )}
            {letterhead.requisitorAddress && (
              <p className="rq-sig-detail">{letterhead.requisitorAddress}</p>
            )}
          </div>
        </div>

      </div>{/* /rq-page */}

      {/* ══════════════════════════════════════════════════════
          STYLES — rq- prefix keeps these isolated from globals
         ══════════════════════════════════════════════════════ */}
      <style>{`
        /* ── Reset ─────────────────────────────────────────── */
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        html, body {
          background: #c8c8c8;
          font-family: 'Times New Roman', Times, serif;
          color: #111;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        /* ── Toolbar ───────────────────────────────────────── */
        .rq-toolbar {
          position: fixed;
          top: 16px;
          right: 20px;
          z-index: 999;
          display: flex;
          gap: 8px;
          align-items: center;
        }

        .rq-btn-print, .rq-btn-close {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 18px;
          font-size: 12.5px;
          font-family: system-ui, -apple-system, sans-serif;
          font-weight: 500;
          border-radius: 5px;
          cursor: pointer;
          border: none;
          letter-spacing: .01em;
          transition: background .12s;
        }
        .rq-btn-print {
          background: #1a4fd6;
          color: #fff;
          box-shadow: 0 2px 8px rgba(26,79,214,.30);
        }
        .rq-btn-print:hover { background: #1540b8; }
        .rq-btn-close {
          background: #fff;
          color: #333;
          border: 1.5px solid #ccc;
        }
        .rq-btn-close:hover { background: #f2f2f2; }

        /* ── A4 page (screen preview) ──────────────────────── */
        .rq-page {
          width: 210mm;
          min-height: 297mm;
          margin: 28px auto 48px;
          background: #fff;
          padding: 13mm 16mm 13mm 16mm;
          box-shadow: 0 8px 40px rgba(0,0,0,.22);
          display: flex;
          flex-direction: column;
        }

        /* ── Letterhead ────────────────────────────────────── */
        .rq-lh { margin-bottom: 4mm; }

        .rq-lh-row {
          display: flex;
          align-items: center;
          gap: 5mm;
          width: 100%;
          margin-bottom: 3mm;
        }

        .rq-logo-wrap { flex-shrink: 0; }

        .rq-logo-img {
          display: block;
          width: 20mm;
          height: 20mm;
          object-fit: contain;
        }

        .rq-logo-placeholder {
          width: 20mm;
          height: 20mm;
          border: 1px dashed #ccc;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 7.5pt;
          color: #aaa;
          letter-spacing: .5px;
          font-family: system-ui, sans-serif;
        }

        /* Centre column: clips to available width so JS can measure */
        .rq-lh-centre {
          flex: 1;
          text-align: center;
          overflow: hidden;
          min-width: 0;
        }

        /*
         * Org name — always one line.
         * JS sets font-size starting at 18pt and steps down by 0.5pt
         * until scrollWidth <= clientWidth.
         */
        .rq-org-name {
          font-size: 18pt;          /* JS overrides this */
          font-weight: 700;
          line-height: 1.15;
          white-space: nowrap;      /* single line enforced */
          overflow: hidden;
          width: 100%;
          display: block;
        }

        /* Address is slightly smaller than the org name */
        .rq-org-address {
          font-size: 9pt;           /* always 9pt — just smaller than org name */
          color: #555;
          margin-top: 1.5mm;
          line-height: 1.4;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .rq-lh-date {
          flex-shrink: 0;
          min-width: 28mm;
          text-align: right;
          display: flex;
          flex-direction: column;
          gap: 1mm;
        }
        .rq-date-label {
          font-size: 7pt;
          font-weight: 700;
          letter-spacing: .08em;
          text-transform: uppercase;
          color: #777;
        }
        .rq-date-value { font-size: 9.5pt; }

        .rq-rule-heavy {
          border: none;
          border-top: 2px solid #111;
          margin-bottom: 3mm;
        }

        .rq-title-row {
          text-align: center;
          margin-bottom: 4mm;
        }
        .rq-title-badge {
          display: inline-block;
          border: 1.5px solid #222;
          padding: 1.5mm 9mm;
          font-size: 10.5pt;
          font-weight: 700;
          letter-spacing: 2.5px;
        }

        /* ── Medicine table ────────────────────────────────── */
        .rq-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 9pt;
        }

        .rq-table thead tr {
          background: #efefef;
          border-top: 1.5px solid #222;
          border-bottom: 1.5px solid #222;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        .rq-th {
          padding: 1.8mm 2.5mm;
          font-size: 9pt;
          font-weight: 700;
          text-align: left;
        }

        .rq-td {
          padding: 1.4mm 2.5mm;
          font-size: 9pt;
          border-bottom: 0.4px solid #e4e4e4;
          vertical-align: middle;
        }

        .rq-col-sl   { width: 9mm;  text-align: center; }
        .rq-col-name { /* flex remaining width */ }
        .rq-col-qty  { width: 22mm; text-align: center; white-space: nowrap; }
        .rq-col-gap  {
          width: 5mm;
          padding: 0 !important;
          border-left:  1.5px solid #bbb !important;
          border-right: 1.5px solid #bbb !important;
          background: #f8f8f8;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        .rq-row-even { background: #fff; }
        .rq-row-odd  { background: #fafafa; -webkit-print-color-adjust: exact; print-color-adjust: exact; }

        /* ── Summary ───────────────────────────────────────── */
        .rq-summary {
          display: flex;
          align-items: center;
          gap: 6mm;
          justify-content: center;
          margin-top: 3mm;
          padding-top: 2.5mm;
          border-top: 1px solid #ddd;
          font-size: 8.5pt;
          color: #666;
        }
        .rq-summary strong { color: #111; }
        .rq-summary-sep { color: #ccc; }

        /* ── Signatures ────────────────────────────────────── */
        .rq-sigs {
          display: flex;
          justify-content: space-between;
          margin-top: 14mm;
          page-break-inside: avoid;
          break-inside: avoid;
        }

        .rq-sig { width: 42%; }
        .rq-sig-right { text-align: right; }

        .rq-sig-line {
          border-top: 1.5px solid #222;
          margin-bottom: 2mm;
        }
        .rq-sig-name {
          font-size: 9.5pt;
          font-weight: 700;
          line-height: 1.5;
        }
        .rq-sig-detail {
          font-size: 8.5pt;
          color: #555;
          line-height: 1.5;
        }

        /* ═══════════════════════════════════════════════════
           PRINT
           @page supplies physical margins → browser generates
           a proper page-geometry PDF, not a screen screenshot.
           .rq-page is then reset to fill that canvas exactly.
           ═══════════════════════════════════════════════════ */
        @media print {
          @page {
            size: A4 portrait;
            margin: 13mm 16mm 13mm 16mm;
          }

          html, body {
            background: #fff !important;
            margin: 0 !important;
            padding: 0 !important;
          }

          .no-print { display: none !important; }

          .rq-page {
            width:      100%  !important;
            min-height: 0     !important;
            margin:     0     !important;
            padding:    0     !important;
            box-shadow: none  !important;
          }
        }
      `}</style>
    </>
  );
}