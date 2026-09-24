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

function insertOrders(importId, orders) {
  if (!orders || !orders.length) return 0;
  const db = openDb();
  const insertOrder = db.prepare('INSERT OR REPLACE INTO orders (order_id, order_date, seller_status, marketplace, payment_amount, payment_currency, fulfillment_provider, import_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  const insertLine = db.prepare('INSERT OR REPLACE INTO line_items (line_item_id, returns_quantity, import_id) VALUES (?, ?, ?)');
  const txn = db.transaction((rows) => {
    for (const o of rows) {
      insertOrder.run(o.orderId, o.orderDate, o.sellerStatus, o.marketplace, o.paymentAmount, o.paymentCurrency, o.fulfillmentProvider, importId);
      // line items are not connected to orders in this MVP import; skipped
    }
  });
  txn(orders);
  db.close();
  return orders.length;
}

function insertBillingOperations(importId, operations) {
  if (!operations || !operations.length) return 0;
  const db = openDb();
  const findStmt = db.prepare('SELECT COUNT(*) as c FROM billing_operations WHERE operation_date = ? AND operation_type = ? AND IFNULL(offer_id,"") = IFNULL(?,"") AND IFNULL(balance,0) = IFNULL(?,0) AND IFNULL(credit,0) = IFNULL(?,0) AND IFNULL(debit,0) = IFNULL(?,0)');
  const insertStmt = db.prepare(`INSERT INTO billing_operations (operation_date, offer_name, offer_id, operation_type, operation_category, credit, debit, balance, raw_details, related_order_id, service_code, service_name, waybill_number, is_smart_delivery, import_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const txn = db.transaction((ops) => {
    for (const o of ops) {
      const exists = findStmt.get(o.operation_date, o.operation_type, o.offer_id, o.balance, o.credit, o.debit).c;
      if (exists) continue;
      insertStmt.run(o.operation_date, o.offer_name, o.offer_id, o.operation_type, o.operation_category || null, o.credit, o.debit, o.balance, o.raw_details || null, o.related_order_id || null, o.service_code || null, o.service_name || null, o.waybill_number || null, o.is_smart_delivery ? 1 : 0, importId);
    }
  });
  txn(operations);
  db.close();
  return operations.length;
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
  const revenueRow = db.prepare(`SELECT IFNULL(SUM(payment_amount),0) as s FROM orders ${where}`).get(...params);

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

module.exports = { openDb, getDatabaseInfo, listImports, computeHash, findImportByHash, insertImportRecord, insertOrders, insertBillingOperations, getMetricsSummary };

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
  const items = db.prepare('SELECT * FROM line_items WHERE line_item_id IN (SELECT line_item_id FROM line_items WHERE import_id = orders.import_id) LIMIT 0').all();
  // line_items currently only has line_item_id and returns_quantity in schema; fetch related rows by import
  const lineRows = db.prepare('SELECT * FROM line_items WHERE import_id = (SELECT import_id FROM orders WHERE order_id = ?)').all(orderId);
  db.close();
  return { order, lineItems: lineRows };
}

module.exports.listOrders = listOrders;
module.exports.getOrderDetails = getOrderDetails;

// Phase 7: Costs, products, trends
function getCostsBreakdown() {
  const db = openDb();
  const rows = db.prepare(`
    SELECT operation_category, SUM(debit) as total_cost, COUNT(*) as count
    FROM billing_operations
    WHERE debit > 0
    GROUP BY operation_category
    ORDER BY total_cost DESC
  `).all();
  db.close();
  return rows.map(r => ({ category: r.operation_category, cost: Math.round((r.total_cost || 0) * 100) / 100, count: r.count }));
}

function getProductBreakdown() {
  const db = openDb();
  const rows = db.prepare(`
    SELECT 
      IFNULL(pc.offer_id, o.marketplace) as product_id,
      IFNULL(pc.offer_name, 'Unknown') as product_name,
      IFNULL(pc.unit_cost, 0) as unit_cost,
      SUM(o.payment_amount) as total_revenue,
      COUNT(o.order_id) as order_count
    FROM orders o
    LEFT JOIN product_cost pc ON o.order_id = pc.offer_id
    GROUP BY product_id
    ORDER BY total_revenue DESC
    LIMIT 50
  `).all();
  db.close();
  return rows.map(r => ({
    productId: r.product_id,
    productName: r.product_name,
    unitCost: r.unit_cost,
    totalRevenue: Math.round((r.total_revenue || 0) * 100) / 100,
    orderCount: r.order_count,
    margin: Math.round(((r.total_revenue - (r.unit_cost * r.order_count)) / (r.total_revenue || 1)) * 10000) / 100
  }));
}

function getTrendsData(days = 30) {
  const db = openDb();
  const rows = db.prepare(`
    SELECT 
      date(o.order_date) as d,
      SUM(IFNULL(o.payment_amount, 0)) as revenue,
      COALESCE((SELECT SUM(debit) FROM billing_operations b WHERE date(b.operation_date) = date(o.order_date)), 0) as costs
    FROM orders o
    WHERE date(o.order_date) >= date('now', '-${days} days')
    GROUP BY d
    ORDER BY d ASC
  `).all();
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
