const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const { initDatabase } = require('./init');
const { app } = require('electron');

function getDbPath() {
  const userData = app.getPath('userData');
  const folder = path.join(userData, 'allegro-profit-analyzer');
  const dbPath = path.join(folder, 'database.db');
  return { folder, dbPath };
}

function openDb() {
  const { folder, dbPath } = getDbPath();
  if (!fs.existsSync(folder) || !fs.existsSync(dbPath)) {
    // ensure DB exists and schema applied
    initDatabase(app);
  }
  const db = new Database(dbPath, { readonly: false });
  db.pragma('foreign_keys = ON');
  return db;
}

function getDatabaseInfo() {
  const { dbPath } = getDbPath();
  try {
    const stats = fs.statSync(dbPath);
    const db = new Database(dbPath, { readonly: true });
    const rowCount = db.prepare("SELECT (SELECT COUNT(*) FROM orders) as orders_count, (SELECT COUNT(*) FROM billing_operations) as billing_count").get();
    db.close();
    return {
      path: dbPath,
      size: stats.size,
      orders: rowCount.orders_count || 0,
      billing_operations: rowCount.billing_count || 0
    };
  } catch (err) {
    return { path: dbPath, error: err.message };
  }
}

async function createDatabaseBackup(destinationPath) {
  const db = openDb();
  try {
    await db.backup(destinationPath);
  } finally {
    db.close();
  }

  const backupDb = new Database(destinationPath, { readonly: true });
  try {
    const integrity = backupDb.pragma('integrity_check', { simple: true });
    if (integrity !== 'ok') throw new Error('Kopia bazy nie przeszła kontroli integralności.');
  } finally {
    backupDb.close();
  }
  return destinationPath;
}

function resetUserData() {
  const db = openDb();
  const tables = ['billing_operations', 'line_items', 'orders', 'product_cost', 'saved_reports', 'imports', 'app_settings'];
  const reset = db.transaction(() => {
    const removed = {};
    for (const table of tables) {
      removed[table] = db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count;
      db.prepare(`DELETE FROM ${table}`).run();
      db.prepare('DELETE FROM sqlite_sequence WHERE name = ?').run(table);
    }
    return removed;
  });
  const removed = reset();
  db.close();
  return removed;
}

function listImports(limit = 100) {
  const db = openDb();
  const stmt = db.prepare('SELECT id, file_name, file_type, imported_at, row_count, date_range_from, date_range_to, file_hash FROM imports ORDER BY imported_at DESC LIMIT ?');
  const rows = stmt.all(limit);
  db.close();
  return rows;
}

const crypto = require('crypto');

function computeHash(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function findImportByHash(fileHash) {
  const db = openDb();
  const row = db.prepare('SELECT * FROM imports WHERE file_hash = ?').get(fileHash);
  db.close();
  return row || null;
}

function insertImportRecord({ fileName, fileType, rowCount, dateFrom = null, dateTo = null, fileHash }) {
  const db = openDb();
  const info = db.prepare('INSERT INTO imports (file_name, file_type, row_count, date_range_from, date_range_to, file_hash) VALUES (?, ?, ?, ?, ?, ?)').run(fileName, fileType, rowCount, dateFrom, dateTo, fileHash);
  const id = info.lastInsertRowid;
  db.close();
  return id;
}

function listProducts() {
  const db = openDb();
  const products = db.prepare(`
    SELECT p.offer_id, p.offer_name, p.sku, p.unit_cost, p.sale_price_net, p.purchase_vat_rate, p.sales_vat_rate,
      p.vat_deductible_percent, p.is_auto_discovered, p.vat_verified, p.currency, p.notes, p.updated_at,
      fees.gross_fees as seller_fee_debits,
      fees.fee_credits as seller_fee_credits,
      fees.operation_count as seller_fee_operations,
      fees.date_from as seller_fee_date_from,
      fees.date_to as seller_fee_date_to
    FROM product_cost p
    LEFT JOIN (
      SELECT b.offer_id,
        SUM(CASE WHEN b.debit < 0 THEN -b.debit ELSE 0 END) as gross_fees,
        SUM(CASE WHEN b.credit > 0 THEN b.credit ELSE 0 END) as fee_credits,
        COUNT(*) as operation_count,
        MIN(date(b.operation_date)) as date_from,
        MAX(date(b.operation_date)) as date_to
      FROM billing_operations b
      LEFT JOIN operation_category_map m ON m.operation_type = b.operation_type
      WHERE b.offer_id IS NOT NULL
        AND COALESCE(m.is_cost, CASE WHEN b.debit < 0 THEN 1 ELSE 0 END) = 1
      GROUP BY b.offer_id
    ) fees ON fees.offer_id = p.offer_id
    ORDER BY p.offer_name COLLATE NOCASE, p.offer_id
  `).all();
  db.close();
  return products.map((product) => {
    const netCost = product.unit_cost == null ? null : Number(product.unit_cost);
    const purchaseVat = netCost == null ? null : netCost * Number(product.purchase_vat_rate || 0) / 100;
    const deductiblePercent = Number(product.vat_deductible_percent ?? 100);
    return {
      ...product,
      unit_cost: netCost,
      sellerFeeDebits: Math.round(Number(product.seller_fee_debits || 0) * 100) / 100,
      sellerFeeCredits: Math.round(Number(product.seller_fee_credits || 0) * 100) / 100,
      sellerFeesNet: Math.round((Number(product.seller_fee_debits || 0) - Number(product.seller_fee_credits || 0)) * 100) / 100,
      sellerFeeOperations: Number(product.seller_fee_operations || 0),
      sellerFeeDateFrom: product.seller_fee_date_from,
      sellerFeeDateTo: product.seller_fee_date_to,
      purchaseVat: purchaseVat == null ? null : Math.round(purchaseVat * 100) / 100,
      nonDeductibleVat: purchaseVat == null ? null : Math.round(purchaseVat * (100 - deductiblePercent) * 100) / 10000,
      grossPurchaseCost: netCost == null || !product.vat_verified ? null : Math.round((netCost + purchaseVat * (100 - deductiblePercent) / 100) * 100) / 100,
      estimatedGrossPrice: !product.vat_verified || product.sale_price_net == null
        ? null
        : Math.round(Number(product.sale_price_net) * (1 + Number(product.sales_vat_rate || 0) / 100) * 100) / 100
    };
  });
}

function ensureProductsFromBillingOperations(operations = []) {
  const offers = new Map();
  for (const operation of operations) {
    const offerId = String(operation.offer_id || '').trim();
    const offerName = String(operation.offer_name || '').trim();
    if (offerId && offerName && !offers.has(offerId)) offers.set(offerId, offerName);
  }
  if (!offers.size) return 0;

  const db = openDb();
  const insert = db.prepare(`
    INSERT OR IGNORE INTO product_cost
      (offer_id, offer_name, unit_cost, purchase_vat_rate, sales_vat_rate, vat_deductible_percent, currency, is_auto_discovered, vat_verified, updated_at)
    VALUES (?, ?, NULL, 0, 0, 0, 'PLN', 1, 0, ?)
  `);
  const fillName = db.prepare(`
    UPDATE product_cost SET offer_name = ?
    WHERE offer_id = ? AND (offer_name IS NULL OR TRIM(offer_name) = '')
  `);
  const now = new Date().toISOString();
  const discoverOffers = db.transaction(() => {
    let discovered = 0;
    for (const [offerId, offerName] of offers) {
      if (insert.run(offerId, offerName, now).changes) discovered += 1;
      else fillName.run(offerName, offerId);
    }
    return discovered;
  });
  const discovered = discoverOffers();
  db.close();
  return discovered;
}

function saveProduct(product) {
  const offerId = String(product.offerId || '').trim();
  const offerName = String(product.offerName || '').trim();
  const sku = String(product.sku || '').trim() || null;
  const netCost = Number(product.netPurchaseCost);
  const salePriceNet = product.netSalePrice === '' || product.netSalePrice == null ? null : Number(product.netSalePrice);
  const purchaseVatRate = Number(product.purchaseVatRate);
  const salesVatRate = Number(product.salesVatRate);
  const deductiblePercent = Number(product.vatDeductiblePercent);
  const currency = String(product.currency || 'PLN').trim().toUpperCase();
  const notes = String(product.notes || '').trim() || null;
  const vatVerified = product.vatVerified === true ? 1 : 0;

  if (!offerId) throw new Error('Podaj identyfikator oferty.');
  if (!offerName) throw new Error('Podaj nazwę produktu.');
  if (!Number.isFinite(netCost) || netCost < 0) throw new Error('Koszt zakupu netto musi być liczbą nieujemną.');
  if (salePriceNet != null && (!Number.isFinite(salePriceNet) || salePriceNet < 0)) throw new Error('Cena sprzedaży netto musi być liczbą nieujemną.');
  if (!Number.isFinite(purchaseVatRate) || purchaseVatRate < 0 || purchaseVatRate > 100) throw new Error('Stawka VAT zakupu musi mieścić się w zakresie 0–100%.');
  if (!Number.isFinite(salesVatRate) || salesVatRate < 0 || salesVatRate > 100) throw new Error('Stawka VAT sprzedaży musi mieścić się w zakresie 0–100%.');
  if (!Number.isFinite(deductiblePercent) || deductiblePercent < 0 || deductiblePercent > 100) throw new Error('Odliczenie VAT musi mieścić się w zakresie 0–100%.');
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error('Waluta musi być trzyznakowym kodem, np. PLN.');

  const db = openDb();
  db.prepare(`
    INSERT INTO product_cost
      (offer_id, offer_name, sku, unit_cost, sale_price_net, purchase_vat_rate, sales_vat_rate, vat_deductible_percent, vat_verified, currency, notes, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(offer_id) DO UPDATE SET
      offer_name = excluded.offer_name,
      sku = excluded.sku,
      unit_cost = excluded.unit_cost,
      sale_price_net = excluded.sale_price_net,
      purchase_vat_rate = excluded.purchase_vat_rate,
      sales_vat_rate = excluded.sales_vat_rate,
      vat_deductible_percent = excluded.vat_deductible_percent,
      vat_verified = excluded.vat_verified,
      currency = excluded.currency,
      notes = excluded.notes,
      updated_at = excluded.updated_at
  `).run(offerId, offerName, sku, netCost, salePriceNet, purchaseVatRate, salesVatRate, deductiblePercent, vatVerified, currency, notes, new Date().toISOString());
  db.close();
  return { ok: true, offerId };
}

function deleteProduct(offerId) {
  const db = openDb();
  const result = db.prepare('DELETE FROM product_cost WHERE offer_id = ?').run(String(offerId || '').trim());
  db.close();
  return result.changes;
}

function insertOrders(importId, orders, lineItems = []) {
  if ((!orders || !orders.length) && (!lineItems || !lineItems.length)) return 0;
  const db = openDb();
  const insertOrder = db.prepare('INSERT OR REPLACE INTO orders (order_id, order_date, seller_status, marketplace, payment_amount, payment_currency, fulfillment_provider, import_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  const insertLine = db.prepare('INSERT OR REPLACE INTO line_items (line_item_id, returns_quantity, import_id) VALUES (?, ?, ?)');
  const txn = db.transaction(() => {
    for (const o of orders || []) {
      insertOrder.run(o.orderId, o.orderDate, o.sellerStatus, o.marketplace, o.paymentAmount, o.paymentCurrency, o.fulfillmentProvider, importId);
    }
    for (const item of lineItems || []) insertLine.run(item.lineItemId, item.returnsQuantity, importId);
  });
  txn();
  db.close();
  return (orders || []).length;
}

function insertBillingOperations(importId, operations) {
  if (!operations || !operations.length) return 0;
  const db = openDb();
  const findStmt = db.prepare("SELECT COUNT(*) as c FROM billing_operations WHERE operation_date = ? AND operation_type = ? AND IFNULL(offer_id, '') = IFNULL(?, '') AND IFNULL(balance, 0) = IFNULL(?, 0) AND IFNULL(credit, 0) = IFNULL(?, 0) AND IFNULL(debit, 0) = IFNULL(?, 0) AND IFNULL(raw_details, '') = IFNULL(?, '')");
  const insertStmt = db.prepare(`INSERT INTO billing_operations (operation_date, offer_name, offer_id, operation_type, operation_category, credit, debit, balance, raw_details, related_order_id, service_code, service_name, waybill_number, is_smart_delivery, import_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const categoryStmt = db.prepare('SELECT category FROM operation_category_map WHERE operation_type = ?');
  const orderStmt = db.prepare('SELECT 1 FROM orders WHERE order_id = ?');
  const txn = db.transaction((ops) => {
    let inserted = 0;
    for (const o of ops) {
      const exists = findStmt.get(o.operation_date, o.operation_type, o.offer_id, o.balance, o.credit, o.debit, o.raw_details).c;
      if (exists) continue;
      const category = categoryStmt.get(o.operation_type);
      const relatedOrderId = o.related_order_id && orderStmt.get(o.related_order_id) ? o.related_order_id : null;
      const fallbackCategory = o.debit < 0 ? 'other' : null;
      insertStmt.run(o.operation_date, o.offer_name, o.offer_id, o.operation_type, o.operation_category || (category && category.category) || fallbackCategory, o.credit, o.debit, o.balance, o.raw_details || null, relatedOrderId, o.service_code || null, o.service_name || null, o.waybill_number || null, o.is_smart_delivery ? 1 : 0, importId);
      inserted += 1;
    }
    return inserted;
  });
  const inserted = txn(operations);
  db.close();
  return inserted;
}

function linkBillingOperationsToOrders() {
  const db = openDb();
  const pending = db.prepare("SELECT id, raw_details FROM billing_operations WHERE related_order_id IS NULL AND raw_details LIKE '%Identyfikator zamówienia:%'").all();
  const findOrder = db.prepare('SELECT 1 FROM orders WHERE order_id = ?');
  const linkOrder = db.prepare('UPDATE billing_operations SET related_order_id = ? WHERE id = ?');
  const txn = db.transaction((rows) => {
    let linked = 0;
    for (const row of rows) {
      const match = row.raw_details.match(/Identyfikator zamówienia:\s*([a-f0-9-]{36})/i);
      if (match && findOrder.get(match[1])) {
        linkOrder.run(match[1], row.id);
        linked += 1;
      }
    }
    return linked;
  });
  const linked = txn(pending);
  db.close();
  return linked;
}

function getMetricsSummary(opts = {}) {
  const { dateFrom = null, dateTo = null, days = 30 } = opts || {};
  const db = openDb();

  // Build filters for orders
  const filters = [];
  const params = [];
  if (dateFrom) {
    filters.push("date(order_date) >= date(?)");
    params.push(dateFrom);
  }
  if (dateTo) {
    filters.push("date(order_date) <= date(?)");
    params.push(dateTo);
  }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  const ordersCountRow = db.prepare(`SELECT COUNT(*) as c FROM orders ${where}`).get(...params);
  const revenueFilter = filters.concat("UPPER(IFNULL(seller_status, '')) <> 'CANCELLED'");
  const revenueWhere = `WHERE ${revenueFilter.join(' AND ')}`;
  const revenueRow = db.prepare(`SELECT IFNULL(SUM(payment_amount),0) as s FROM orders ${revenueWhere}`).get(...params);

  // Latest balance from billing_operations (within optional date range)
  const balFilters = [];
  const balParams = [];
  if (dateFrom) { balFilters.push("date(operation_date) >= date(?)"); balParams.push(dateFrom); }
  if (dateTo) { balFilters.push("date(operation_date) <= date(?)"); balParams.push(dateTo); }
  const balWhere = balFilters.length ? `WHERE ${balFilters.join(' AND ')}` : '';
  const latestBalRow = db.prepare(`SELECT balance FROM billing_operations ${balWhere} ORDER BY operation_date DESC LIMIT 1`).get(...balParams);
  let balance = null;
  if (latestBalRow && typeof latestBalRow.balance !== 'undefined' && latestBalRow.balance !== null) {
    balance = latestBalRow.balance;
  } else {
    // fallback compute running sum
    const sumRow = db.prepare(`SELECT IFNULL(SUM(IFNULL(credit,0) - IFNULL(debit,0)),0) as s FROM billing_operations ${balWhere}`).get(...balParams);
    balance = sumRow.s || 0;
  }

  // Trend: daily revenue for last `days`
  const trendStmt = db.prepare(`SELECT date(order_date) as d, IFNULL(SUM(payment_amount),0) as s FROM orders WHERE date(order_date) >= date('now','-${days} days') GROUP BY d ORDER BY d ASC`);
  const trendRows = trendStmt.all();
  const trend = trendRows.map(r => Number(r.s || 0));

  db.close();

  return {
    orders: ordersCountRow.c || 0,
    revenue: Math.round((revenueRow.s || 0) * 100) / 100,
    balance: Math.round((balance || 0) * 100) / 100,
    trend
  };
}

module.exports = { openDb, getDatabaseInfo, createDatabaseBackup, resetUserData, listImports, computeHash, findImportByHash, insertImportRecord, insertOrders, insertBillingOperations, linkBillingOperationsToOrders, getMetricsSummary, listProducts, saveProduct, deleteProduct, ensureProductsFromBillingOperations };

// Settings helpers
function getSetting(key) {
  const db = openDb();
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key);
  db.close();
  return row ? row.value : null;
}

function setSetting(key, value) {
  const db = openDb();
  const now = new Date().toISOString();
  const up = db.prepare('INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at');
  up.run(key, typeof value === 'string' ? value : JSON.stringify(value), now);
  db.close();
}

function listSettings() {
  const db = openDb();
  const rows = db.prepare('SELECT key, value, updated_at FROM app_settings ORDER BY updated_at DESC').all();
  db.close();
  return rows.map(r => ({ key: r.key, value: tryParse(r.value), updated_at: r.updated_at }));
}

function deleteSetting(key) {
  const db = openDb();
  const res = db.prepare('DELETE FROM app_settings WHERE key = ?').run(key);
  db.close();
  return res.changes;
}

function tryParse(v) {
  if (v === null || typeof v === 'undefined') return null;
  try { return JSON.parse(v); } catch (e) { return v; }
}

module.exports.getSetting = getSetting;
module.exports.setSetting = setSetting;
module.exports.listSettings = listSettings;
module.exports.deleteSetting = deleteSetting;

// Orders query helpers
function listOrders({ limit = 50, offset = 0, q = null } = {}) {
  const db = openDb();
  let base = 'SELECT order_id, order_date, seller_status, marketplace, payment_amount, payment_currency, fulfillment_provider, import_id FROM orders';
  const params = [];
  if (q) {
    base += ' WHERE order_id LIKE ? OR marketplace LIKE ? OR fulfillment_provider LIKE ?';
    const like = `%${q}%`;
    params.push(like, like, like);
  }
  base += ' ORDER BY order_date DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);
  const rows = db.prepare(base).all(...params);
  db.close();
  return rows;
}

function getOrderDetails(orderId) {
  const db = openDb();
  const order = db.prepare('SELECT * FROM orders WHERE order_id = ?').get(orderId);
  const billingOperations = db.prepare('SELECT * FROM billing_operations WHERE related_order_id = ? ORDER BY operation_date').all(orderId);
  db.close();
  return { order, billingOperations };
}

module.exports.listOrders = listOrders;
module.exports.getOrderDetails = getOrderDetails;

// Phase 7: Costs, products, trends
function getCostsBreakdown() {
  const db = openDb();
  const rows = db.prepare(`
    SELECT COALESCE(b.operation_category, m.category, 'other') as category,
      SUM(CASE WHEN b.debit < 0 THEN -b.debit ELSE 0 END - CASE WHEN b.credit > 0 THEN b.credit ELSE 0 END) as total_cost,
      COUNT(*) as count
    FROM billing_operations b
    LEFT JOIN operation_category_map m ON m.operation_type = b.operation_type
    WHERE COALESCE(m.is_cost, CASE WHEN b.debit < 0 THEN 1 ELSE 0 END) = 1
    GROUP BY category
    ORDER BY total_cost DESC
  `).all();
  db.close();
  return rows.map(r => ({ category: r.category, cost: Math.round((r.total_cost || 0) * 100) / 100, count: r.count }));
}

function getProductBreakdown() {
  const db = openDb();
  const rows = db.prepare(`
    SELECT b.offer_id as product_id, MAX(b.offer_name) as product_name,
      pc.sku as sku,
      pc.unit_cost as unit_cost_net,
      pc.sale_price_net as sale_price_net,
      pc.purchase_vat_rate as purchase_vat_rate,
      pc.sales_vat_rate as sales_vat_rate,
      pc.vat_deductible_percent as vat_deductible_percent,
      pc.vat_verified as vat_verified,
      pc.is_auto_discovered as is_auto_discovered,
      pc.currency as product_currency,
      SUM(CASE WHEN b.debit < 0 THEN -b.debit ELSE 0 END) as gross_cost,
      SUM(CASE WHEN b.credit > 0 THEN b.credit ELSE 0 END) as cost_credits,
      COUNT(*) as operation_count
    FROM billing_operations b
    LEFT JOIN product_cost pc ON pc.offer_id = b.offer_id
    LEFT JOIN operation_category_map m ON m.operation_type = b.operation_type
    WHERE b.offer_id IS NOT NULL
      AND COALESCE(m.is_cost, CASE WHEN b.debit < 0 THEN 1 ELSE 0 END) = 1
    GROUP BY b.offer_id
    ORDER BY gross_cost DESC
    LIMIT 50
  `).all();
  db.close();
  return rows.map(r => ({
    productId: r.product_id,
    productName: r.product_name || 'Nieznana oferta',
    sku: r.sku,
    productCurrency: r.product_currency || 'PLN',
    purchaseUnitNet: r.unit_cost_net == null ? null : Math.round(r.unit_cost_net * 100) / 100,
    purchaseVatRate: r.purchase_vat_rate == null ? null : r.purchase_vat_rate,
    salesVatRate: r.sales_vat_rate == null ? null : r.sales_vat_rate,
    vatDeductiblePercent: r.vat_deductible_percent == null ? null : r.vat_deductible_percent,
    vatVerified: Boolean(r.vat_verified),
    isAutoDiscovered: Boolean(r.is_auto_discovered),
    effectivePurchaseUnitCost: r.unit_cost_net == null || !r.vat_verified ? null : Math.round(r.unit_cost_net * (1 + (r.purchase_vat_rate || 0) / 100 * (1 - (r.vat_deductible_percent ?? 100) / 100)) * 100) / 100,
    saleUnitGross: r.sale_price_net == null || !r.vat_verified ? null : Math.round(r.sale_price_net * (1 + (r.sales_vat_rate || 0) / 100) * 100) / 100,
    totalCosts: Math.round(((r.gross_cost || 0) - (r.cost_credits || 0)) * 100) / 100,
    grossCosts: Math.round((r.gross_cost || 0) * 100) / 100,
    credits: Math.round((r.cost_credits || 0) * 100) / 100,
    operationCount: r.operation_count
  }));
}

function getTrendsData(days = 30) {
  const db = openDb();
  const safeDays = Math.min(3650, Math.max(1, Math.trunc(Number(days) || 30)));
  const rows = db.prepare(`
    WITH order_daily AS (
      SELECT date(order_date) as d,
        SUM(CASE WHEN UPPER(IFNULL(seller_status, '')) = 'CANCELLED' THEN 0 ELSE IFNULL(payment_amount, 0) END) as revenue
      FROM orders
      WHERE date(order_date) IS NOT NULL
      GROUP BY d
    ), billing_daily AS (
      SELECT date(b.operation_date) as d,
        SUM(CASE WHEN b.debit < 0 THEN -b.debit ELSE 0 END - CASE WHEN b.credit > 0 THEN b.credit ELSE 0 END) as costs
      FROM billing_operations b
      LEFT JOIN operation_category_map m ON m.operation_type = b.operation_type
      WHERE date(b.operation_date) IS NOT NULL
        AND COALESCE(m.is_cost, CASE WHEN b.debit < 0 THEN 1 ELSE 0 END) = 1
      GROUP BY d
    ), all_days AS (
      SELECT d FROM order_daily UNION SELECT d FROM billing_daily
    )
    SELECT all_days.d,
      IFNULL(order_daily.revenue, 0) as revenue,
      IFNULL(billing_daily.costs, 0) as costs
    FROM all_days
    LEFT JOIN order_daily ON order_daily.d = all_days.d
    LEFT JOIN billing_daily ON billing_daily.d = all_days.d
    WHERE all_days.d >= date((SELECT MAX(d) FROM all_days), ?)
    ORDER BY all_days.d ASC
  `).all(`-${safeDays} days`);
  db.close();
  return rows.map(r => ({
    date: r.d,
    revenue: Math.round((r.revenue || 0) * 100) / 100,
    costs: Math.round((r.costs || 0) * 100) / 100,
    profit: Math.round(((r.revenue || 0) - (r.costs || 0)) * 100) / 100
  }));
}

module.exports.getCostsBreakdown = getCostsBreakdown;
module.exports.getProductBreakdown = getProductBreakdown;
module.exports.getTrendsData = getTrendsData;

function getSourceAnalysis() {
  const db = openDb();
  const orders = db.prepare(`
    SELECT COUNT(*) as total,
      MIN(date(order_date)) as date_from,
      MAX(date(order_date)) as date_to,
      SUM(CASE WHEN UPPER(IFNULL(seller_status, '')) = 'CANCELLED' THEN 1 ELSE 0 END) as cancelled,
      SUM(CASE WHEN UPPER(IFNULL(seller_status, '')) <> 'CANCELLED' THEN 1 ELSE 0 END) as active,
      SUM(CASE WHEN UPPER(IFNULL(seller_status, '')) = 'CANCELLED' THEN IFNULL(payment_amount, 0) ELSE 0 END) as cancelled_value,
      SUM(CASE WHEN UPPER(IFNULL(seller_status, '')) <> 'CANCELLED' THEN IFNULL(payment_amount, 0) ELSE 0 END) as active_revenue
    FROM orders
  `).get();
  const returns = db.prepare('SELECT COUNT(*) as line_items, SUM(CASE WHEN returns_quantity > 0 THEN 1 ELSE 0 END) as returned_line_items, SUM(IFNULL(returns_quantity, 0)) as returned_units FROM line_items').get();
  const billing = db.prepare(`
    SELECT COUNT(*) as operations,
      MIN(date(b.operation_date)) as date_from,
      MAX(date(b.operation_date)) as date_to,
      SUM(CASE WHEN COALESCE(m.is_cost, CASE WHEN b.debit < 0 THEN 1 ELSE 0 END) = 1 AND b.debit < 0 THEN -b.debit ELSE 0 END) as gross_costs,
      SUM(CASE WHEN COALESCE(m.is_cost, CASE WHEN b.debit < 0 THEN 1 ELSE 0 END) = 1 AND b.credit > 0 THEN b.credit ELSE 0 END) as cost_credits,
      SUM(CASE WHEN b.raw_details LIKE '%Identyfikator zamówienia:%' THEN 1 ELSE 0 END) as order_references,
      SUM(CASE WHEN b.raw_details LIKE '%Identyfikator zamówienia:%' AND b.related_order_id IS NULL THEN 1 ELSE 0 END) as unmatched_order_references
    FROM billing_operations b
    LEFT JOIN operation_category_map m ON m.operation_type = b.operation_type
  `).get();
  const latestBalance = db.prepare('SELECT balance FROM billing_operations WHERE balance IS NOT NULL ORDER BY operation_date DESC, id DESC LIMIT 1').get();
  const linkedOrders = db.prepare('SELECT COUNT(DISTINCT related_order_id) as c FROM billing_operations WHERE related_order_id IS NOT NULL').get();
  db.close();
  return {
    orders: {
      total: orders.total || 0,
      dateFrom: orders.date_from,
      dateTo: orders.date_to,
      active: orders.active || 0,
      cancelled: orders.cancelled || 0,
      cancelledValue: Math.round((orders.cancelled_value || 0) * 100) / 100,
      activeRevenue: Math.round((orders.active_revenue || 0) * 100) / 100,
      lineItems: returns.line_items || 0,
      returnedLineItems: returns.returned_line_items || 0,
      returnedUnits: returns.returned_units || 0
    },
    billing: {
      operations: billing.operations || 0,
      dateFrom: billing.date_from,
      dateTo: billing.date_to,
      orderReferences: billing.order_references || 0,
      unmatchedOrderReferences: billing.unmatched_order_references || 0,
      grossCosts: Math.round((billing.gross_costs || 0) * 100) / 100,
      costCredits: Math.round((billing.cost_credits || 0) * 100) / 100,
      netCosts: Math.round(((billing.gross_costs || 0) - (billing.cost_credits || 0)) * 100) / 100,
      balance: latestBalance ? latestBalance.balance : null,
      linkedOrders: linkedOrders.c || 0
    }
  };
}

module.exports.getSourceAnalysis = getSourceAnalysis;

// Phase 7b: Saved reports
function saveReport(name, dateFrom, dateTo, metricsSnapshot) {
  const db = openDb();
  const res = db.prepare('INSERT INTO saved_reports (name, date_from, date_to, metrics_snapshot) VALUES (?, ?, ?, ?)').run(
    name,
    dateFrom,
    dateTo,
    typeof metricsSnapshot === 'string' ? metricsSnapshot : JSON.stringify(metricsSnapshot)
  );
  db.close();
  return res.lastInsertRowid;
}

function listReports(limit = 50) {
  const db = openDb();
  const rows = db.prepare('SELECT id, name, date_from, date_to, created_at, is_pinned FROM saved_reports ORDER BY is_pinned DESC, created_at DESC LIMIT ?').all(limit);
  db.close();
  return rows;
}

function getReport(id) {
  const db = openDb();
  const row = db.prepare('SELECT * FROM saved_reports WHERE id = ?').get(id);
  db.close();
  return row ? { ...row, metrics_snapshot: tryParse(row.metrics_snapshot) } : null;
}

function deleteReport(id) {
  const db = openDb();
  const res = db.prepare('DELETE FROM saved_reports WHERE id = ?').run(id);
  db.close();
  return res.changes;
}

function pinReport(id, pinned = true) {
  const db = openDb();
  const res = db.prepare('UPDATE saved_reports SET is_pinned = ? WHERE id = ?').run(pinned ? 1 : 0, id);
  db.close();
  return res.changes;
}

module.exports.saveReport = saveReport;
module.exports.listReports = listReports;
module.exports.getReport = getReport;
module.exports.deleteReport = deleteReport;
module.exports.pinReport = pinReport;
