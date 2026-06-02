import { Router, type IRouter } from "express";
import { eq, gte, desc, and } from "drizzle-orm";
import { db, retailersTable, ledgerEntriesTable, salesTable, staffTable, productsTable, invoicesTable, invoiceItemsTable, stockMovementsTable } from "@workspace/db";
import { requireAuth } from "../middleware/requireAuth";

const router: IRouter = Router();

router.get("/dashboard/summary", requireAuth, async (req, res): Promise<void> => {
  const accountId = req.session.accountId!;
  const retailers = await db.select().from(retailersTable).where(eq(retailersTable.accountId, accountId));

  let totalOutstanding = 0;
  let overdueRetailerCount = 0;
  const now = new Date();

  for (const retailer of retailers) {
    const entries = await db.select().from(ledgerEntriesTable).where(eq(ledgerEntriesTable.retailerId, retailer.id));
    const sales = entries.filter((e) => e.type === "sale").reduce((s, e) => s + parseFloat(e.amount), 0);
    const payments = entries.filter((e) => e.type === "payment").reduce((s, e) => s + parseFloat(e.amount), 0);
    const outstanding = sales - payments;
    totalOutstanding += outstanding;

    if (outstanding > 0) {
      const paymentEntries = entries.filter((e) => e.type === "payment").sort((a, b) => b.date.getTime() - a.date.getTime());
      let daysOverdue = 0;
      if (paymentEntries.length > 0) {
        daysOverdue = Math.floor((now.getTime() - paymentEntries[0].date.getTime()) / (1000 * 60 * 60 * 24));
      } else {
        const firstSale = entries.filter(e => e.type === 'sale').sort((a, b) => a.date.getTime() - b.date.getTime())[0];
        if (firstSale) daysOverdue = Math.floor((now.getTime() - firstSale.date.getTime()) / (1000 * 60 * 60 * 24));
      }
      if (daysOverdue > 30) overdueRetailerCount++;
    }
  }

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todaySalesRows = await db.select().from(salesTable).where(and(eq(salesTable.accountId, accountId), gte(salesTable.date, startOfToday)));
  const todaySales = todaySalesRows.reduce((s, e) => s + parseFloat(e.amount), 0);

  const staffList = await db.select().from(staffTable).where(eq(staffTable.accountId, accountId));
  const products = await db.select().from(productsTable).where(eq(productsTable.accountId, accountId));
  const lowStockCount = products.filter((p) => p.currentStock < 10).length;

  // Calculate profit from confirmed invoices
  const confirmedInvoices = await db
    .select({ id: invoicesTable.id })
    .from(invoicesTable)
    .where(and(eq(invoicesTable.accountId, accountId), eq(invoicesTable.status, "confirmed")));

  let totalProfit = 0;
  let todayProfit = 0;

  for (const inv of confirmedInvoices) {
    const items = await db.select().from(invoiceItemsTable).where(eq(invoiceItemsTable.invoiceId, inv.id));
    const [invoice] = await db.select({ date: invoicesTable.date }).from(invoicesTable).where(eq(invoicesTable.id, inv.id));

    for (const item of items) {
      if (item.productId) {
        const [product] = await db.select({ purchasePrice: productsTable.purchasePrice }).from(productsTable).where(eq(productsTable.id, item.productId));
        if (product?.purchasePrice) {
          const profit = (parseFloat(item.unitPrice) - parseFloat(product.purchasePrice)) * item.quantity;
          totalProfit += profit;
          if (invoice && invoice.date >= startOfToday) {
            todayProfit += profit;
          }
        }
      }
    }
  }

  res.json({
    totalOutstanding,
    todaySales,
    todayProfit,
    totalProfit,
    overdueRetailerCount,
    totalRetailers: retailers.length,
    totalStaff: staffList.length,
    totalProducts: products.length,
    lowStockCount,
  });
});

router.get("/dashboard/activity", requireAuth, async (req, res): Promise<void> => {
  const accountId = req.session.accountId!;
  const activities: {
    id: string;
    type: string;
    description: string;
    amount: number | null;
    date: string;
    entityName: string;
  }[] = [];

  const recentSales = await db
    .select({ sale: salesTable, retailerName: retailersTable.name })
    .from(salesTable)
    .innerJoin(retailersTable, eq(salesTable.retailerId, retailersTable.id))
    .where(eq(salesTable.accountId, accountId))
    .orderBy(desc(salesTable.date))
    .limit(5);

  for (const { sale, retailerName } of recentSales) {
    activities.push({ id: `sale-${sale.id}`, type: "sale", description: `Sale recorded for ${retailerName}`, amount: parseFloat(sale.amount), date: sale.date.toISOString(), entityName: retailerName });
  }

  const recentPayments = await db
    .select({ entry: ledgerEntriesTable, retailerName: retailersTable.name })
    .from(ledgerEntriesTable)
    .innerJoin(retailersTable, and(eq(ledgerEntriesTable.retailerId, retailersTable.id), eq(retailersTable.accountId, accountId)))
    .where(eq(ledgerEntriesTable.type, "payment"))
    .orderBy(desc(ledgerEntriesTable.date))
    .limit(5);

  for (const { entry, retailerName } of recentPayments) {
    activities.push({ id: `payment-${entry.id}`, type: "payment", description: `Payment received from ${retailerName}`, amount: parseFloat(entry.amount), date: entry.date.toISOString(), entityName: retailerName });
  }

  const recentMovements = await db
    .select({ movement: stockMovementsTable, productName: productsTable.name })
    .from(stockMovementsTable)
    .innerJoin(productsTable, and(eq(stockMovementsTable.productId, productsTable.id), eq(productsTable.accountId, accountId)))
    .orderBy(desc(stockMovementsTable.date))
    .limit(5);

  for (const { movement, productName } of recentMovements) {
    activities.push({ id: `stock-${movement.id}`, type: movement.type === "in" ? "stock_in" : "stock_out", description: `Stock ${movement.type === "in" ? "added" : "removed"} for ${productName}`, amount: null, date: movement.date.toISOString(), entityName: productName });
  }

  const recentRetailers = await db.select().from(retailersTable).where(eq(retailersTable.accountId, accountId)).orderBy(desc(retailersTable.createdAt)).limit(3);
  for (const retailer of recentRetailers) {
    activities.push({ id: `retailer-${retailer.id}`, type: "new_retailer", description: `New retailer onboarded: ${retailer.name}`, amount: null, date: retailer.createdAt.toISOString(), entityName: retailer.name });
  }

  activities.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  res.json(activities.slice(0, 15));
});

export default router;
