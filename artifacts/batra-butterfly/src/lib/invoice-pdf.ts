import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface InvoiceItem {
  productName: string;
  articleCode: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface InvoiceData {
  invoiceNumber: string;
  date: string;
  retailerName: string;
  staffName: string;
  items: InvoiceItem[];
  totalAmount: number;
  miscCharge?: number | null;
  claimCharge?: number | null;
  cashDeposit?: number | null;
  gstCharge?: number | null;
  packingCharge?: number | null;
  notes?: string | null;
}

const fmt = (n: number) =>
  n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function buildInvoicePDF(invoice: InvoiceData): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a5" });
  const W = doc.internal.pageSize.getWidth();
  const margin = 10;

  // ── Header ──────────────────────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("ESTIMATE", W / 2, 14, { align: "center" });

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");

  const dateStr = new Date(invoice.date).toLocaleDateString("en-IN", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
  const timeStr = new Date(invoice.date).toLocaleTimeString("en-IN", {
    hour: "2-digit", minute: "2-digit", hour12: true,
  });

  // Row 1
  doc.text(`Challan No : ${invoice.invoiceNumber}`, margin, 21);
  doc.text(`Date : ${dateStr}( ${timeStr} )`, W / 2, 21);
  // Row 2
  doc.text(`M/S: ${invoice.retailerName}`, margin, 26);
  doc.text(`Tran: ${invoice.staffName}`, W / 2, 26);

  // Divider
  doc.setDrawColor(0);
  doc.setLineWidth(0.3);
  doc.line(margin, 29, W - margin, 29);

  // ── Items table ──────────────────────────────────────────────────────────
  const rows = invoice.items.map((it) => [
    `${it.productName}\n${it.articleCode}`,
    fmt(it.quantity),
    "Pcs.",
    fmt(it.unitPrice),
    fmt(it.totalPrice),
  ]);

  const itemsSubtotal = invoice.items.reduce((s, i) => s + i.totalPrice, 0);
  const charges: { label: string; amount: number }[] = [
    { label: "Misc", amount: invoice.miscCharge ?? 0 },
    { label: "Claim", amount: invoice.claimCharge ?? 0 },
    { label: "Cash Deposit", amount: invoice.cashDeposit ?? 0 },
    { label: "GST", amount: invoice.gstCharge ?? 0 },
    { label: "Packing", amount: invoice.packingCharge ?? 0 },
  ].filter((c) => c.amount > 0);

  const hasCharges = charges.length > 0;

  if (hasCharges) {
    rows.push(["", "", "", "", ""]);
    rows.push(["Sub Total", "", "", "", fmt(itemsSubtotal)]);
    charges.forEach((c) => rows.push([c.label, "", "", "", fmt(c.amount)]));
  }

  const totalQty = invoice.items.reduce((s, i) => s + i.quantity, 0);

  autoTable(doc, {
    startY: 31,
    head: [["Description of Goods", "Qty", "Unit", "Price", "Amount Rs."]],
    body: rows,
    foot: [[
      { content: "Grand Total :", colSpan: 2, styles: { fontStyle: "bold", halign: "left" } },
      { content: fmt(totalQty), styles: { fontStyle: "bold", halign: "right" } },
      "",
      { content: `\u20b9 ${fmt(invoice.totalAmount)}`, styles: { fontStyle: "bold", halign: "right" } },
    ]],
    margin: { left: margin, right: margin },
    styles: { fontSize: 7.5, cellPadding: 1.5, overflow: "linebreak" },
    headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: "bold", lineWidth: 0.2, lineColor: [0, 0, 0] },
    footStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], lineWidth: 0.2, lineColor: [0, 0, 0] },
    bodyStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], lineWidth: 0.1, lineColor: [180, 180, 180] },
    columnStyles: {
      0: { cellWidth: "auto" },
      1: { halign: "right", cellWidth: 18 },
      2: { halign: "center", cellWidth: 14 },
      3: { halign: "right", cellWidth: 22 },
      4: { halign: "right", cellWidth: 28 },
    },
    tableLineWidth: 0.3,
    tableLineColor: [0, 0, 0],
  });

  if (invoice.notes) {
    const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 3;
    doc.setFontSize(7);
    doc.setFont("helvetica", "italic");
    doc.text(`Note: ${invoice.notes}`, margin, finalY);
  }

  return doc;
}

export function downloadInvoicePDF(invoice: InvoiceData): void {
  const doc = buildInvoicePDF(invoice);
  doc.save(`${invoice.invoiceNumber}.pdf`);
}

export function openInvoicePDF(invoice: InvoiceData): void {
  const doc = buildInvoicePDF(invoice);
  const blob = doc.output("blob");
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank");
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
