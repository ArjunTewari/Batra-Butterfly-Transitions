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

  // ── Header ──
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

  doc.text(`Challan No : ${invoice.invoiceNumber}`, margin, 21);
  doc.text(`Date : ${dateStr}( ${timeStr} )`, W / 2, 21);
  doc.text(`M/S: ${invoice.retailerName}`, margin, 26);
  doc.text(`Tran: ${invoice.staffName}`, W / 2, 26);

  doc.setDrawColor(0);
  doc.setLineWidth(0.3);
  doc.line(margin, 29, W - margin, 29);

  // ── Items table ──
  const rows: any[][] = invoice.items.map((it) => [
    it.articleCode,
    it.productName,
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
    rows.push(["", "", "", "", "", ""]);
    rows.push([
      { content: "Sub Total", styles: { halign: "left" } },
      "", "", "", "",
      { content: fmt(itemsSubtotal), styles: { halign: "right" } },
    ]);
    charges.forEach((c) => rows.push([
      { content: c.label, styles: { halign: "left" } },
      "", "", "", "",
      { content: fmt(c.amount), styles: { halign: "right" } },
    ]));
  }

  const totalQty = invoice.items.reduce((s, i) => s + i.quantity, 0);

  rows.push(["", "", "", "", "", ""]);
  rows.push([
    { content: "Grand Total :", styles: { fontStyle: "bold", halign: "left" } },
    "",
    { content: fmt(totalQty), styles: { fontStyle: "bold", halign: "right" } },
    { content: "Pcs.", styles: { fontStyle: "bold" } },
    "",
    { content: fmt(invoice.totalAmount), styles: { fontStyle: "bold", halign: "right" } },
  ]);

  autoTable(doc, {
    startY: 31,
    head: [["Product Code", "Description of Goods", "Qty", "Unit", "Price", "Amount Rs."]],
    body: rows,
    margin: { left: margin, right: margin },
    styles: { fontSize: 7.5, cellPadding: 1.5, overflow: "linebreak" },
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: [0, 0, 0],
      fontStyle: "bold",
      lineWidth: 0.2,
      lineColor: [0, 0, 0],
    },
    bodyStyles: {
      fillColor: [255, 255, 255],
      textColor: [0, 0, 0],
      lineWidth: 0.1,
      lineColor: [180, 180, 180],
    },
    columnStyles: {
      0: { cellWidth: 22 },
      1: { cellWidth: "auto" },
      2: { halign: "right", cellWidth: 14 },
      3: { halign: "center", cellWidth: 12 },
      4: { halign: "right", cellWidth: 20 },
      5: { halign: "right", cellWidth: 26 },
    },
    tableLineWidth: 0.3,
    tableLineColor: [0, 0, 0],
  });

  // ── Notes ──
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
