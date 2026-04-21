import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import type { Invoice, BusinessProfile, InvoiceItem } from "@/lib/types";
import { formatMoney } from "@/lib/currency";

async function loadImageAsDataUrl(url: string): Promise<{ data: string; w: number; h: number } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
    const dims = await new Promise<{ w: number; h: number }>((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.width, h: img.height });
      img.onerror = () => resolve({ w: 1, h: 1 });
      img.src = dataUrl;
    });
    return { data: dataUrl, ...dims };
  } catch {
    return null;
  }
}

function safeFilename(s: string): string {
  return s.replace(/[^a-z0-9_\-]+/gi, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
}

export async function generateInvoicePdf(
  invoice: Invoice,
  business: BusinessProfile | null,
): Promise<{ blobUrl: string; filename: string }> {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 48;
  let y = margin;

  // Brand accent color (deep navy, like the reference)
  const accent: [number, number, number] = [38, 56, 86];
  const muted: [number, number, number] = [150, 150, 155];
  const ink: [number, number, number] = [40, 40, 45];

  // ─── HEADER: Logo (left) + Business info (right) ───
  const logoMaxH = 56;
  const logoMaxW = 150;
  let logoBottom = y;
  if (business?.logo_url) {
    const img = await loadImageAsDataUrl(business.logo_url);
    if (img) {
      const ratio = img.w / img.h;
      let drawW = logoMaxW;
      let drawH = drawW / ratio;
      if (drawH > logoMaxH) {
        drawH = logoMaxH;
        drawW = drawH * ratio;
      }
      try {
        const fmt = img.data.startsWith("data:image/png") ? "PNG" : "JPEG";
        doc.addImage(img.data, fmt, margin, y, drawW, drawH);
        logoBottom = y + drawH;
      } catch {
        /* ignore */
      }
    }
  }

  // Right-aligned business info
  const rightX = pageWidth - margin;
  let ry = y;
  if (business?.business_name) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...ink);
    doc.text(business.business_name, rightX, ry, { align: "right" });
    ry += 14;
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...muted);
  const extraLines = (business?.business_extra ?? "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const line of [
    business?.business_email,
    business?.business_phone,
    business?.business_address,
    ...extraLines,
  ].filter(Boolean) as string[]) {
    const wrapped = doc.splitTextToSize(line, 240);
    doc.text(wrapped, rightX, ry, { align: "right" });
    ry += wrapped.length * 11;
  }

  y = Math.max(logoBottom, ry) + 32;

  // ─── TITLE (smaller, lighter, like the reference) ───
  doc.setFont("helvetica", "normal");
  doc.setFontSize(16);
  doc.setTextColor(...accent);
  doc.text(invoice.transaction_type.toUpperCase(), margin, y);
  y += 24;

  // ─── BILL TO (left)  +  META (right) ───
  const metaLabelX = pageWidth - margin - 180;
  const metaValueX = pageWidth - margin;
  const blockTop = y;

  // Build meta rows dynamically (Invoice, Date, optional Terms, optional Due Date, Status)
  const metaRows: { label: string; value: string }[] = [
    { label: "INVOICE", value: invoice.invoice_number },
    { label: "DATE", value: format(new Date(invoice.date), "MM/dd/yyyy") },
  ];
  if (invoice.terms && invoice.terms.trim()) {
    metaRows.push({ label: "TERMS", value: invoice.terms.trim() });
  }
  if (invoice.due_date) {
    metaRows.push({
      label: "DUE DATE",
      value: format(new Date(invoice.due_date), "MM/dd/yyyy"),
    });
  }
  metaRows.push({ label: "STATUS", value: invoice.status.toUpperCase() });

  // BILL TO label
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...muted);
  doc.text("BILL TO", margin, y);

  // BILL TO value
  doc.setFontSize(10);
  doc.setTextColor(...ink);
  doc.text(invoice.client_name, margin, y + 14);

  // META rows (right aligned, label left of value)
  let metaY = y;
  for (const row of metaRows) {
    doc.setFontSize(8);
    doc.setTextColor(...muted);
    doc.text(row.label, metaLabelX, metaY);
    doc.setFontSize(10);
    doc.setTextColor(...ink);
    doc.text(row.value, metaValueX, metaY, { align: "right" });
    metaY += 14;
  }

  y = Math.max(blockTop + 56, metaY + 8);

  // ─── ITEMS TABLE ───
  // Always render a table. If no items array, synthesize a single row from the invoice totals.
  const rawItems = Array.isArray(invoice.items) ? invoice.items : [];
  const items: InvoiceItem[] =
    rawItems.length > 0
      ? rawItems
      : [
          {
            description: invoice.transaction_type || "Service",
            quantity: 1,
            unit_price: Number(invoice.amount) || 0,
            tax_rate:
              Number(invoice.amount) > 0
                ? Math.round((Number(invoice.tax_amount) / Number(invoice.amount)) * 10000) / 100
                : 0,
          },
        ];

  const body = items.map((it) => {
    const qty = Number(it.quantity) || 0;
    const unit = Number(it.unit_price) || 0;
    const rate = Number(it.tax_rate) || 0;
    const sub = Math.round(qty * unit * 100) / 100;
    const tax = Math.round(((sub * rate) / 100) * 100) / 100;
    const total = Math.round((sub + tax) * 100) / 100;
    return [
      it.description ?? "",
      String(qty),
      formatMoney(unit, invoice.currency),
      rate === 0 ? "—" : `${rate}%`,
      formatMoney(total, invoice.currency),
    ];
  });

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [["DESCRIPTION", "QTY", "UNIT PRICE", "TAX", "TOTAL"]],
    body,
    theme: "plain",
    headStyles: {
      fillColor: [245, 246, 248],
      textColor: muted,
      fontStyle: "bold",
      fontSize: 8,
      cellPadding: { top: 8, bottom: 8, left: 8, right: 8 },
    },
    bodyStyles: {
      fontSize: 10,
      textColor: ink,
      cellPadding: { top: 10, bottom: 10, left: 8, right: 8 },
      valign: "top",
    },
    columnStyles: {
      0: { cellWidth: "auto" },
      1: { halign: "right", cellWidth: 45 },
      2: { halign: "right", cellWidth: 80 },
      3: { halign: "right", cellWidth: 55 },
      4: { halign: "right", cellWidth: 85 },
    },
  });

  // @ts-expect-error lastAutoTable is added at runtime by jspdf-autotable
  y = (doc.lastAutoTable?.finalY ?? y) + 12;

  // Dashed separator before totals
  doc.setDrawColor(210);
  doc.setLineDashPattern([2, 2], 0);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);
  doc.setLineDashPattern([], 0);
  y += 16;

  // ─── TOTALS (right aligned, minimal) ───
  const totalsLabelX = pageWidth - margin - 200;
  const totalsValueX = pageWidth - margin;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...muted);
  doc.text("SUBTOTAL", totalsLabelX, y);
  doc.setTextColor(...ink);
  doc.setFontSize(10);
  doc.text(formatMoney(Number(invoice.amount), invoice.currency), totalsValueX, y, { align: "right" });
  y += 16;

  doc.setFontSize(9);
  doc.setTextColor(...muted);
  doc.text("TAX", totalsLabelX, y);
  doc.setTextColor(...ink);
  doc.setFontSize(10);
  doc.text(formatMoney(Number(invoice.tax_amount), invoice.currency), totalsValueX, y, { align: "right" });
  y += 16;

  doc.setFontSize(9);
  doc.setTextColor(...muted);
  doc.text("TOTAL", totalsLabelX, y);
  doc.setTextColor(...ink);
  doc.setFontSize(10);
  doc.text(formatMoney(Number(invoice.net_amount), invoice.currency), totalsValueX, y, { align: "right" });
  y += 18;

  // Dashed separator
  doc.setDrawColor(210);
  doc.setLineDashPattern([2, 2], 0);
  doc.line(margin, y, pageWidth - margin, y);
  doc.setLineDashPattern([], 0);
  y += 18;

  // Balance due
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...muted);
  doc.text("BALANCE DUE", totalsLabelX, y);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...ink);
  doc.text(
    `${invoice.currency.toUpperCase()} ${formatMoney(Number(invoice.net_amount), invoice.currency).replace(/^[^\d-]+/, "")}`,
    totalsValueX,
    y,
    { align: "right" },
  );
  y += 32;

  // ─── NOTES ───
  if (invoice.notes && invoice.notes.trim()) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...muted);
    doc.text("NOTES", margin, y);
    y += 12;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...ink);
    const notesWrapped = doc.splitTextToSize(invoice.notes, pageWidth - margin * 2);
    doc.text(notesWrapped, margin, y);
    y += notesWrapped.length * 13 + 12;
  }

  // ─── FOOTER ───
  const footerY = doc.internal.pageSize.getHeight() - 32;
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8);
  doc.setTextColor(...muted);
  doc.text("Generated by Budget Buddy", pageWidth / 2, footerY, { align: "center" });

  const filename = `${safeFilename(invoice.invoice_number)}_${safeFilename(
    invoice.client_name,
  )}_${invoice.date}.pdf`;

  const blob = doc.output("blob");
  const blobUrl = URL.createObjectURL(blob);
  return { blobUrl, filename };
}
