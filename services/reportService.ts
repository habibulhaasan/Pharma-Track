// services/reportService.ts
import "server-only";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";

export async function getStockValueReport() {
  const db = getAdminDb();
  const [productsSnap, mainStockSnap] = await Promise.all([
    db.collection("products").where("deleted", "==", false).get(),
    db.collection("mainStock").get(),
  ]);

  const stockMap: Record<string, number> = {};
  mainStockSnap.docs.forEach((d) => {
    stockMap[d.id] = d.data().quantity ?? 0;
  });

  const rows = productsSnap.docs.map((d) => {
    const product = d.data();
    const qty = stockMap[d.id] ?? 0;
    return {
      id: d.id,
      genericName: product.genericName,
      brandName: product.brandName,
      unit: product.unit,
      quantity: qty,
      defaultPrice: product.defaultPrice ?? 0,
      totalValue: qty * (product.defaultPrice ?? 0),
      reorderLevel: product.reorderLevel ?? 0,
      isLowStock: qty <= (product.reorderLevel ?? 0),
    };
  });

  const totalValue = rows.reduce((sum, r) => sum + r.totalValue, 0);
  const lowStockCount = rows.filter((r) => r.isLowStock).length;

  return { rows, totalValue, lowStockCount };
}

export async function getExpiryReport(withinDays = 90) {
  const db = getAdminDb();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + withinDays);

  // Query main ledger entries with expiry before cutoff
  const productsSnap = await db.collection("products").where("deleted", "==", false).get();
  const results: any[] = [];

  await Promise.all(
    productsSnap.docs.map(async (productDoc) => {
      const ledgerSnap = await db
        .collection("mainStock")
        .doc(productDoc.id)
        .collection("mainLedger")
        .where("type", "==", "IN")
        .get();

      ledgerSnap.docs.forEach((ledgerDoc) => {
        const data = ledgerDoc.data();
        if (data.expiry) {
          const expiryDate =
            data.expiry instanceof Timestamp ? data.expiry.toDate() : new Date(data.expiry);
          if (expiryDate <= cutoff) {
            results.push({
              productId: productDoc.id,
              genericName: productDoc.data().genericName,
              brandName: productDoc.data().brandName,
              batch: data.batch,
              expiry: expiryDate,
              quantity: data.quantity,
              daysUntilExpiry: Math.ceil(
                (expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
              ),
            });
          }
        }
      });
    })
  );

  return results.sort((a, b) => a.expiry - b.expiry);
}

export async function getDashboardStats(userId?: string) {
  const db = getAdminDb();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [productsSnap, mainStockSnap, pendingUsersSnap, todaySalesSnap] =
    await Promise.all([
      db.collection("products").where("deleted", "==", false).get(),
      db.collection("mainStock").get(),
      db.collection("users").where("status", "==", "pending").get(),
      db
        .collection("sales")
        .where("timestamp", ">=", Timestamp.fromDate(today))
        .get(),
    ]);

  const stockMap: Record<string, number> = {};
  mainStockSnap.docs.forEach((d) => {
    stockMap[d.id] = d.data().quantity ?? 0;
  });

  const lowStockCount = productsSnap.docs.filter((d) => {
    const qty = stockMap[d.id] ?? 0;
    return qty <= (d.data().reorderLevel ?? 0);
  }).length;

  const totalValue = productsSnap.docs.reduce((sum, d) => {
    const qty = stockMap[d.id] ?? 0;
    return sum + qty * (d.data().defaultPrice ?? 0);
  }, 0);

  return {
    totalProducts: productsSnap.size,
    lowStockCount,
    todayDispensed: todaySalesSnap.size,
    pendingUsers: pendingUsersSnap.size,
    totalMainStockValue: totalValue,
    expiryAlerts: 0, // computed separately
  };
}
