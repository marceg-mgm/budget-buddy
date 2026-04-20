import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import type { Invoice, BusinessProfile } from "@/lib/types";
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

  // ─── HEADER: Logo (left) + Business info (right) ───
  const logoMaxH = 60;
  const logoMaxW = 160;
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
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(20);
  const rightX = pageWidth - margin;
  let ry = y;
  if (business?.business_name) {
    doc.text(business.business_name, rightX, ry, { align: "right" });
    ry += 16;
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(80);
  for (const line of [
    business?.business_email,
    business?.business_phone,
    business?.business_address,
  ].filter(Boolean) as string[]) {
    const wrapped = doc.splitTextToSize(line, 240);
    doc.text(wrapped, rightX, ry, { align: "right" });
    ry += wrapped.length * 12;
  }

  y = Math.max(logoBottom, ry) + 24;

  // ─── TITLE ───
  doc.setFont("helvetica", "bold");
  doc.setFontSize(26);
  doc.setTextColor(15);
  doc.text(invoice.transaction_type.toUpperCase(), margin, y);
  y += 8;

  // Subtle separator
  doc.setDrawColor(220);
  doc.setLineWidth(1);
  doc.line(margin, y + 4, pageWidth - margin, y + 4);
  y += 24;

  // Invoice # and Date
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(80);
  doc.text(`Number: `, margin, y);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15);
  doc.text(invoice.invoice_number, margin + 50, y);

  doc.setFont("helvetica", "normal");
  doc.setTextColor(80);
  doc.text(`Date: `, margin + 220, y);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15);
  doc.text(format(new Date(invoice.date), "MMMM d, yyyy"), margin + 250, y);

  y += 20;

  doc.setFont("helvetica", "normal");
  doc.setTextColor(80);
  doc.text(`Status: `, margin, y);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15);
  doc.text(invoice.status.toUpperCase(), margin + 50, y);
  y += 28;

  // ─── BILL TO ───
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(120);
  doc.text("BILL TO", margin, y);
  y += 14;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(15);
  doc.text(invoice.client_name, margin, y);
  y += 28;

  // ─── AMOUNTS TABLE ───
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [["Description", "Amount"]],
    body: [
      ["Subtotal", formatMoney(Number(invoice.amount), invoice.currency)],
      ["Tax", formatMoney(Number(invoice.tax_amount), invoice.currency)],
    ],
    foot: [["Net Amount", formatMoney(Number(invoice.net_amount), invoice.currency)]],
    theme: "plain",
    headStyles: {
      fillColor: [245, 245, 245],
      textColor: 80,
      fontStyle: "bold",
      fontSize: 10,
    },
    bodyStyles: { fontSize: 11, textColor: 30 },
    footStyles: {
      fillColor: [15, 15, 15],
      textColor: 255,
      fontStyle: "bold",
      fontSize: 12,
    },
    columnStyles: {
      0: { cellWidth: "auto" },
      1: { halign: "right", cellWidth: 160 },
    },
  });

  // @ts-expect-error lastAutoTable is added at runtime by jspdf-autotable
  y = (doc.lastAutoTable?.finalY ?? y) + 28;

  // ─── NOTES ───
  if (invoice.notes && invoice.notes.trim()) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(120);
    doc.text("NOTES", margin, y);
    y += 14;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(40);
    const notesWrapped = doc.splitTextToSize(invoice.notes, pageWidth - margin * 2);
    doc.text(notesWrapped, margin, y);
    y += notesWrapped.length * 13 + 12;
  }

  // ─── FOOTER ───
  const footerY = doc.internal.pageSize.getHeight() - 32;
  doc.setDrawColor(230);
  doc.line(margin, footerY - 12, pageWidth - margin, footerY - 12);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8);
  doc.setTextColor(140);
  doc.text("Generated by Budget Buddy", pageWidth / 2, footerY, { align: "center" });

  const filename = `${safeFilename(invoice.invoice_number)}_${safeFilename(
    invoice.client_name,
  )}_${invoice.date}.pdf`;

  const blob = doc.output("blob");
  const blobUrl = URL.createObjectURL(blob);
  return { blobUrl, filename };
}
