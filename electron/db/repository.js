const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const { initDatabase } = require('./init');
const { app } = require('electron');
const { expectedSmartFee } = require('../smartFees');

const round2 = (value) => Math.round(value * 100) / 100;

function normalizeIsoDate(value, label) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${label} must use YYYY-MM-DD format.`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`${label} is not a valid date.`);
  }
  return value;
}

function resolveDateRange(db, options = {}) {
  let dateFrom;
  let dateTo;
  try {
    dateFrom = normalizeIsoDate(options.dateFrom, 'Start date');
    dateTo = normalizeIsoDate(options.dateTo, 'End date');
  } catch (error) {
    db.close();
    throw error;
  }
  if (dateFrom && dateTo && dateFrom > dateTo) {
    db.close();
    throw new Error('Start date must not be after end date.');
  }
  if (dateFrom || dateTo || options.days == null) return { dateFrom, dateTo };

  const requestedDays = Number(options.days);
  if (!Number.isFinite(requestedDays)) return { dateFrom: null, dateTo: null };
  const days = Math.min(3650, Math.max(1, Math.trunc(requestedDays)));
  const latestDate = db.prepare(`
    SELECT MAX(d) AS latest_date FROM (
      SELECT date(order_date) AS d FROM orders
      UNION ALL
      SELECT date(operation_date) AS d FROM billing_operations
    )
  `).get().latest_date;
  if (!latestDate) return { dateFrom: null, dateTo: null };

  const start = new Date(`${latestDate}T00:00:00.000Z`);
  start.setUTCDate(start.getUTCDate() - days + 1);
  return { dateFrom: start.toISOString().slice(0, 10), dateTo: latestDate };
}

function appendDateFilters(column, range, filters, params) {
  if (range.dateFrom) {
    filters.push(`date(${column}) >= date(?)`);
    params.push(range.dateFrom);
  }
  if (range.dateTo) {
    filters.push(`date(${column}) <= date(?)`);
    params.push(range.dateTo);
  }
}

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

function validateDatabaseFile(databasePath) {
  const backupDb = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    const integrity = backupDb.pragma('integrity_check', { simple: true });
    if (integrity !== 'ok') throw new Error('Plik bazy nie przeszedł kontroli integralności.');
    const tables = new Set(backupDb.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name));
    const requiredTables = ['imports', 'orders', 'line_items', 'billing_operations', 'operation_category_map', 'product_cost', 'saved_reports', 'app_settings'];
    const missingTables = requiredTables.filter((table) => !tables.has(table));
    if (missingTables.length) {
      throw new Error(`Plik nie jest kopią bazy Allegro Profit Analyzer (brak tabel: ${missingTables.join(', ')}).`);
    }
  } finally {
    backupDb.close();
  }
}

function restoreDatabaseBackup(sourcePath) {
  const source = path.resolve(String(sourcePath || ''));
  const { folder, dbPath } = getDbPath();
  if (!sourcePath || source.toLowerCase() === path.resolve(dbPath).toLowerCase()) {
    throw new Error('Wybierz osobny plik kopii zapasowej.');
  }
  const sourceStats = fs.statSync(source);
  if (!sourceStats.isFile()) throw new Error('Wybrana ścieżka nie wskazuje na plik kopii zapasowej.');
  validateDatabaseFile(source);

  fs.mkdirSync(folder, { recursive: true });
  const uniqueSuffix = `${process.pid}-${Date.now()}`;
  const temporaryPath = path.join(folder, `database-restore-${uniqueSuffix}.tmp`);
  const previousPath = path.join(folder, `database-before-restore-${uniqueSuffix}.tmp`);
  let movedCurrentDatabase = false;
  let installedRestoredDatabase = false;

  try {
    fs.copyFileSync(source, temporaryPath, fs.constants.COPYFILE_EXCL);
    validateDatabaseFile(temporaryPath);
    if (fs.existsSync(dbPath)) {
      fs.renameSync(dbPath, previousPath);
      movedCurrentDatabase = true;
    }
    fs.renameSync(temporaryPath, dbPath);
    installedRestoredDatabase = true;
    initDatabase(app);
    if (movedCurrentDatabase) fs.unlinkSync(previousPath);
    return dbPath;
  } catch (error) {
    if (installedRestoredDatabase && fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    if (movedCurrentDatabase && fs.existsSync(previousPath)) fs.renameSync(previousPath, dbPath);
    throw error;
  } finally {
    if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
  }
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
      p.vat_deductible_percent, p.is_auto_discovered, p.vat_verified, p.is_smart_offer, p.currency, p.notes, p.updated_at,
      fees.gross_fees as seller_fee_debits,
      fees.fee_credits as seller_fee_credits,
      fees.operation_count as seller_fee_operations,
      fees.date_from as seller_fee_date_from,
      fees.date_to as seller_fee_date_to,
      smart.fee_debits as smart_delivery_debits,
      smart.fee_credits as smart_delivery_credits,
      smart.operation_count as smart_delivery_operations,
      linked.linked_orders
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
    LEFT JOIN (
      SELECT b.offer_id,
        SUM(CASE WHEN b.debit < 0 THEN -b.debit ELSE 0 END) as fee_debits,
        SUM(CASE WHEN b.credit > 0 THEN b.credit ELSE 0 END) as fee_credits,
        COUNT(*) as operation_count
      FROM billing_operations b
        LEFT JOIN operation_category_map m ON m.operation_type = b.operation_type
        WHERE b.offer_id IS NOT NULL AND b.is_smart_delivery = 1
          AND COALESCE(m.is_cost, CASE WHEN b.debit < 0 THEN 1 ELSE 0 END) = 1
      GROUP BY b.offer_id
    ) smart ON smart.offer_id = p.offer_id
    LEFT JOIN (
      SELECT b.offer_id, COUNT(DISTINCT b.related_order_id) as linked_orders
      FROM billing_operations b
      LEFT JOIN operation_category_map m ON m.operation_type = b.operation_type
      WHERE b.offer_id IS NOT NULL AND b.related_order_id IS NOT NULL
        AND COALESCE(m.is_cost, CASE WHEN b.debit < 0 THEN 1 ELSE 0 END) = 1
      GROUP BY b.offer_id
    ) linked ON linked.offer_id = p.offer_id
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
      smartDeliveryOperations: Number(product.smart_delivery_operations || 0),
      smartDeliveryFeesNet: Math.round((Number(product.smart_delivery_debits || 0) - Number(product.smart_delivery_credits || 0)) * 100) / 100,
      linkedOrders: Number(product.linked_orders || 0),
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
  const defaultSetting = db.prepare('SELECT value FROM app_settings WHERE key = ?');
  const readDefault = (key, fallback, min, max) => {
    const stored = defaultSetting.get(key);
    const value = stored ? Number(tryParse(stored.value)) : fallback;
    return Number.isFinite(value) && value >= min && value <= max ? value : fallback;
  };
  const purchaseVatRate = readDefault('default_purchase_vat_rate', 23, 0, 100);
  const salesVatRate = readDefault('default_sales_vat_rate', 23, 0, 100);
  const deductiblePercent = readDefault('default_vat_deductible_percent', 100, 0, 100);
  const currencySetting = defaultSetting.get('default_currency');
  const configuredCurrency = currencySetting ? String(tryParse(currencySetting.value) || '').toUpperCase() : 'PLN';
  const defaultCurrency = /^[A-Z]{3}$/.test(configuredCurrency) ? configuredCurrency : 'PLN';
  const insert = db.prepare(`
    INSERT OR IGNORE INTO product_cost
      (offer_id, offer_name, unit_cost, purchase_vat_rate, sales_vat_rate, vat_deductible_percent, currency, is_auto_discovered, vat_verified, updated_at)
    VALUES (?, ?, NULL, ?, ?, ?, ?, 1, 0, ?)
  `);
  const fillName = db.prepare(`
    UPDATE product_cost SET offer_name = ?
    WHERE offer_id = ? AND (offer_name IS NULL OR TRIM(offer_name) = '')
  `);
  const now = new Date().toISOString();
  const discoverOffers = db.transaction(() => {
    let discovered = 0;
    for (const [offerId, offerName] of offers) {
      if (insert.run(offerId, offerName, purchaseVatRate, salesVatRate, deductiblePercent, defaultCurrency, now).changes) discovered += 1;
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
  const isSmartOffer = product.isSmartOffer === true ? 1 : 0;

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
      (offer_id, offer_name, sku, unit_cost, sale_price_net, purchase_vat_rate, sales_vat_rate, vat_deductible_percent, vat_verified, is_smart_offer, currency, notes, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(offer_id) DO UPDATE SET
      offer_name = excluded.offer_name,
      sku = excluded.sku,
      unit_cost = excluded.unit_cost,
      sale_price_net = excluded.sale_price_net,
      purchase_vat_rate = excluded.purchase_vat_rate,
      sales_vat_rate = excluded.sales_vat_rate,
      vat_deductible_percent = excluded.vat_deductible_percent,
      vat_verified = excluded.vat_verified,
      is_smart_offer = excluded.is_smart_offer,
      currency = excluded.currency,
      notes = excluded.notes,
      updated_at = excluded.updated_at
  `).run(offerId, offerName, sku, netCost, salePriceNet, purchaseVatRate, salesVatRate, deductiblePercent, vatVerified, isSmartOffer, currency, notes, new Date().toISOString());
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
  const db = openDb();
  const options = opts || {};
  const range = resolveDateRange(db, options);

  const orderFilters = [];
  const orderParams = [];
  appendDateFilters('order_date', range, orderFilters, orderParams);
  const orderWhere = orderFilters.length ? `WHERE ${orderFilters.join(' AND ')}` : '';
  const ordersCountRow = db.prepare(`SELECT COUNT(*) AS c FROM orders ${orderWhere}`).get(...orderParams);

  const revenueFilters = [...orderFilters, "UPPER(IFNULL(seller_status, '')) <> 'CANCELLED'"];
  const revenueRows = db.prepare(`
    SELECT COALESCE(NULLIF(UPPER(TRIM(payment_currency)), ''), 'N/A') AS currency,
      IFNULL(SUM(payment_amount), 0) AS revenue
    FROM orders
    WHERE ${revenueFilters.join(' AND ')}
    GROUP BY currency
  `).all(...orderParams);
  const revenueByCurrency = Object.fromEntries(revenueRows.map((row) => [row.currency, round2(row.revenue)]));

  const balanceFilters = [];
  const balanceParams = [];
  if (range.dateTo) {
    balanceFilters.push('date(operation_date) <= date(?)');
    balanceParams.push(range.dateTo);
  }
  const balanceWhere = balanceFilters.length ? `WHERE ${balanceFilters.join(' AND ')}` : '';
  const latestBalRow = db.prepare(`SELECT balance FROM billing_operations ${balanceWhere} ORDER BY operation_date DESC, id DESC LIMIT 1`).get(...balanceParams);
  let balance = null;
  if (latestBalRow && typeof latestBalRow.balance !== 'undefined' && latestBalRow.balance !== null) {
    balance = latestBalRow.balance;
  } else {
    const sumRow = db.prepare(`SELECT IFNULL(SUM(IFNULL(credit, 0) + IFNULL(debit, 0)), 0) AS s FROM billing_operations ${balanceWhere}`).get(...balanceParams);
    balance = sumRow.s || 0;
  }

  const trendRange = options.dateFrom || options.dateTo || options.days != null
    ? range
    : resolveDateRange(db, { days: 30 });
  const trendFilters = ["UPPER(IFNULL(seller_status, '')) <> 'CANCELLED'", "UPPER(IFNULL(payment_currency, '')) = 'PLN'"];
  const trendParams = [];
  appendDateFilters('order_date', trendRange, trendFilters, trendParams);
  const trendRows = db.prepare(`
    SELECT date(order_date) AS d, IFNULL(SUM(payment_amount), 0) AS s
    FROM orders
    WHERE ${trendFilters.join(' AND ')}
    GROUP BY d
    ORDER BY d ASC
  `).all(...trendParams);
  const trend = trendRows.map(r => Number(r.s || 0));

  db.close();

  return {
    orders: ordersCountRow.c || 0,
    revenue: revenueByCurrency.PLN || 0,
    revenueByCurrency,
    balance: Math.round((balance || 0) * 100) / 100,
    trend,
    dateFrom: range.dateFrom,
    dateTo: range.dateTo
  };
}

module.exports = { openDb, getDatabaseInfo, createDatabaseBackup, restoreDatabaseBackup, resetUserData, listImports, computeHash, findImportByHash, insertImportRecord, insertOrders, insertBillingOperations, linkBillingOperationsToOrders, getMetricsSummary, listProducts, saveProduct, deleteProduct, ensureProductsFromBillingOperations };

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
  const defaultColumns = {
    default_purchase_vat_rate: 'purchase_vat_rate',
    default_sales_vat_rate: 'sales_vat_rate',
    default_vat_deductible_percent: 'vat_deductible_percent'
  };
  const column = defaultColumns[key];
  if (column) {
    const numericValue = Number(value);
    if (Number.isFinite(numericValue) && numericValue >= 0 && numericValue <= 100) {
      db.prepare(`UPDATE product_cost SET ${column} = ? WHERE is_auto_discovered = 1 AND vat_verified = 0 AND ${column} = 0`)
        .run(numericValue);
    }
  }
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
function listOrders({
  limit = 50,
  offset = 0,
  q = null,
  dateFrom = null,
  dateTo = null,
  sortBy = 'order_date',
  sortDirection = 'desc'
} = {}) {
  dateFrom = normalizeIsoDate(dateFrom, 'Start date');
  dateTo = normalizeIsoDate(dateTo, 'End date');
  if (dateFrom && dateTo && dateFrom > dateTo) {
    throw new Error('Start date must not be after end date.');
  }
  const db = openDb();
  let base = `SELECT o.order_id, o.order_date, o.seller_status, o.marketplace, o.payment_amount, o.payment_currency,
    o.fulfillment_provider, o.import_id,
    EXISTS (SELECT 1 FROM billing_operations b WHERE b.related_order_id = o.order_id AND b.is_smart_delivery = 1) as is_smart_delivery,
    IFNULL(SUM(CASE
      WHEN COALESCE(m.is_cost, CASE WHEN b.debit < 0 THEN 1 ELSE 0 END) = 1
      THEN CASE WHEN b.debit < 0 THEN -b.debit ELSE 0 END - CASE WHEN b.credit > 0 THEN b.credit ELSE 0 END
      ELSE 0
    END), 0) as total_costs,
    IFNULL(SUM(CASE WHEN COALESCE(b.operation_category, m.category) = 'commission' THEN -(IFNULL(b.credit, 0) + IFNULL(b.debit, 0)) ELSE 0 END), 0) as commission_cost,
    IFNULL(SUM(CASE WHEN COALESCE(b.operation_category, m.category) = 'delivery' THEN -(IFNULL(b.credit, 0) + IFNULL(b.debit, 0)) ELSE 0 END), 0) as delivery_cost
    FROM orders o
    LEFT JOIN billing_operations b ON b.related_order_id = o.order_id
    LEFT JOIN operation_category_map m ON m.operation_type = b.operation_type`;
  const filters = [];
  const params = [];
  if (dateFrom) {
    filters.push('date(o.order_date) >= date(?)');
    params.push(dateFrom);
  }
  if (dateTo) {
    filters.push('date(o.order_date) <= date(?)');
    params.push(dateTo);
  }
  if (q) {
    filters.push('(o.order_id LIKE ? OR o.marketplace LIKE ? OR o.fulfillment_provider LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like, like);
  }
  if (filters.length) base += ` WHERE ${filters.join(' AND ')}`;
  const sortColumns = {
    order_id: 'order_id',
    order_date: 'order_date',
    amount_after_linked_costs: 'amount_after_linked_costs',
    is_smart_delivery: 'is_smart_delivery',
    seller_status: 'seller_status'
  };
  const sortColumn = Object.prototype.hasOwnProperty.call(sortColumns, sortBy)
    ? sortColumns[sortBy]
    : sortColumns.order_date;
  const direction = String(sortDirection).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  base = `SELECT order_rows.*,
      CASE
        WHEN order_rows.payment_amount IS NULL
          OR (order_rows.payment_currency IS NOT NULL AND order_rows.payment_currency <> 'PLN')
        THEN NULL
        ELSE order_rows.payment_amount - order_rows.total_costs
      END AS amount_after_linked_costs
    FROM (${base} GROUP BY o.order_id) AS order_rows
    ORDER BY ${sortColumn} ${direction}, order_id ASC
    LIMIT ? OFFSET ?`;
  params.push(limit, offset);
  const rows = db.prepare(base).all(...params);
  db.close();
  return rows.map(row => ({
    ...row,
    total_costs: Math.round((row.total_costs || 0) * 100) / 100,
    commission_cost: Math.round((row.commission_cost || 0) * 100) / 100,
    delivery_cost: Math.round((row.delivery_cost || 0) * 100) / 100,
    amount_after_linked_costs: row.amount_after_linked_costs == null
      ? null
      : Math.round(row.amount_after_linked_costs * 100) / 100
  }));
}

function summarizeOrderOffers(billingOperations) {
  const offers = new Map();
  for (const operation of billingOperations) {
    if (!operation.offer_id) continue;
    const offerId = String(operation.offer_id);
    let offer = offers.get(offerId);
    if (!offer) {
      offer = {
        offerId,
        offerName: operation.offer_name || 'Nieznana oferta',
        operationCount: 0,
        costOperationCount: 0,
        commissionCost: 0,
        deliveryCost: 0,
        otherCosts: 0,
        totalCosts: 0
      };
      offers.set(offerId, offer);
    }
    offer.operationCount += 1;
    if (operation.operation_category === 'internal') continue;
    const hasCost = Number(operation.debit || 0) < 0 || Number(operation.credit || 0) > 0;
    if (!hasCost) continue;
    const cost = -(Number(operation.credit || 0) + Number(operation.debit || 0));
    offer.costOperationCount += 1;
    offer.totalCosts += cost;
    if (operation.operation_category === 'commission') offer.commissionCost += cost;
    else if (operation.operation_category === 'delivery') offer.deliveryCost += cost;
    else offer.otherCosts += cost;
  }
  return [...offers.values()].map((offer) => ({
    ...offer,
    commissionCost: round2(offer.commissionCost),
    deliveryCost: round2(offer.deliveryCost),
    otherCosts: round2(offer.otherCosts),
    totalCosts: round2(offer.totalCosts)
  }));
}

function getOrderDetails(orderId) {
  const db = openDb();
  const order = db.prepare(`
    SELECT o.*,
      EXISTS (SELECT 1 FROM billing_operations b WHERE b.related_order_id = o.order_id AND b.is_smart_delivery = 1) as is_smart_delivery
    FROM orders o WHERE o.order_id = ?
  `).get(orderId);
  const billingOperations = db.prepare('SELECT * FROM billing_operations WHERE related_order_id = ? ORDER BY operation_date').all(orderId);
  db.close();
  return {
    order,
    billingOperations,
    offerSummaries: summarizeOrderOffers(billingOperations),
    financials: summarizeOrderFinancials(order, billingOperations)
  };
}

// Sums what Allegro actually billed for one order. Debits are stored as negative numbers,
// so a cost is -(credit + debit) and a refund (credit) reduces it.
function summarizeOrderFinancials(order, billingOperations) {
  if (!order) return null;
  const costOf = (category) => round2(-billingOperations
    .filter((operation) => operation.operation_category === category)
    .reduce((sum, operation) => sum + Number(operation.credit || 0) + Number(operation.debit || 0), 0));
  const hasCommission = billingOperations.some((operation) => operation.operation_category === 'commission');
  const paymentAmount = order.payment_amount == null ? null : Number(order.payment_amount);
  const commissionCost = costOf('commission');
  const waybills = new Set(billingOperations
    .filter((operation) => operation.operation_category === 'delivery' && operation.waybill_number)
    .map((operation) => operation.waybill_number));
  return {
    paymentAmount,
    commissionCost,
    deliveryCost: costOf('delivery'),
    shipments: waybills.size,
    // Ratio to the payment amount, which can include delivery paid by the buyer.
    effectiveCommissionPercent: hasCommission && paymentAmount > 0 ? round2(commissionCost / paymentAmount * 100) : null,
    smart: summarizeSmartDelivery(order, paymentAmount, billingOperations)
  };
}

// Smart! delivery fees billed for the order versus the standard-account tier table from Allegro's help.
// "Opłata dodatkowa" operations are additional services, which the Smart! refund does not cover.
function summarizeSmartDelivery(order, paymentAmount, billingOperations) {
  if (!order.is_smart_delivery) return null;
  const baseOperations = billingOperations.filter((operation) =>
    operation.is_smart_delivery && operation.operation_category === 'delivery' && !/^Opłata dodatkowa/i.test(operation.operation_type || ''));
  const chargedOperations = baseOperations.filter((operation) => Number(operation.debit) < 0);
  const charged = round2(-chargedOperations.reduce((sum, operation) => sum + Number(operation.debit), 0));
  const refunded = round2(baseOperations.reduce((sum, operation) => sum + Math.max(0, Number(operation.credit || 0)), 0));
  const shipments = new Set(chargedOperations.map((operation) => operation.waybill_number).filter(Boolean)).size || chargedOperations.length;
  const expected = paymentAmount == null || shipments === 0 ? null : expectedSmartFee(paymentAmount, shipments);
  return {
    charged,
    refunded,
    shipments,
    expectedStandardAccountFee: expected,
    differenceToStandardAccount: expected == null ? null : round2(charged - expected)
  };
}

module.exports.listOrders = listOrders;
module.exports.getOrderDetails = getOrderDetails;

// Phase 7: Costs, products, trends
function getCostsBreakdown(options = {}) {
  const db = openDb();
  const range = resolveDateRange(db, options || {});
  const filters = ["COALESCE(m.is_cost, CASE WHEN b.debit < 0 THEN 1 ELSE 0 END) = 1"];
  const params = [];
  appendDateFilters('b.operation_date', range, filters, params);
  const rows = db.prepare(`
    SELECT COALESCE(b.operation_category, m.category, 'other') as category,
      SUM(CASE WHEN b.debit < 0 THEN -b.debit ELSE 0 END - CASE WHEN b.credit > 0 THEN b.credit ELSE 0 END) as total_cost,
      COUNT(*) as count
    FROM billing_operations b
    LEFT JOIN operation_category_map m ON m.operation_type = b.operation_type
    WHERE ${filters.join(' AND ')}
    GROUP BY category
    ORDER BY total_cost DESC
  `).all(...params);
  db.close();
  return rows.map(r => ({ category: r.category, cost: Math.round((r.total_cost || 0) * 100) / 100, count: r.count }));
}

function getProductBreakdown(options = {}) {
  const db = openDb();
  const range = resolveDateRange(db, options || {});
  const filters = [
    'b.offer_id IS NOT NULL',
    'COALESCE(m.is_cost, CASE WHEN b.debit < 0 THEN 1 ELSE 0 END) = 1'
  ];
  const params = [];
  appendDateFilters('b.operation_date', range, filters, params);
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
    WHERE ${filters.join(' AND ')}
    GROUP BY b.offer_id
    ORDER BY gross_cost DESC
    LIMIT 50
  `).all(...params);
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

function getTrendsData(options = 30) {
  const db = openDb();
  const rangeOptions = typeof options === 'number' ? { days: options } : (options || {});
  const range = resolveDateRange(db, rangeOptions);
  const orderFilters = ["date(order_date) IS NOT NULL", "UPPER(IFNULL(seller_status, '')) <> 'CANCELLED'", "UPPER(IFNULL(payment_currency, '')) = 'PLN'"];
  const orderParams = [];
  appendDateFilters('order_date', range, orderFilters, orderParams);
  const billingFilters = [
    'date(b.operation_date) IS NOT NULL',
    'COALESCE(m.is_cost, CASE WHEN b.debit < 0 THEN 1 ELSE 0 END) = 1'
  ];
  const billingParams = [];
  appendDateFilters('b.operation_date', range, billingFilters, billingParams);
  const rows = db.prepare(`
    WITH order_daily AS (
      SELECT date(order_date) AS d,
        SUM(IFNULL(payment_amount, 0)) AS revenue
      FROM orders
      WHERE ${orderFilters.join(' AND ')}
      GROUP BY d
    ), billing_daily AS (
      SELECT date(b.operation_date) AS d,
        SUM(CASE WHEN b.debit < 0 THEN -b.debit ELSE 0 END - CASE WHEN b.credit > 0 THEN b.credit ELSE 0 END) AS costs
      FROM billing_operations b
      LEFT JOIN operation_category_map m ON m.operation_type = b.operation_type
      WHERE ${billingFilters.join(' AND ')}
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
    ORDER BY all_days.d ASC
  `).all(...orderParams, ...billingParams);
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

function getSourceAnalysis(options = {}) {
  const db = openDb();
  const range = resolveDateRange(db, options || {});
  const orderFilters = [];
  const orderParams = [];
  appendDateFilters('order_date', range, orderFilters, orderParams);
  const orderWhere = orderFilters.length ? `WHERE ${orderFilters.join(' AND ')}` : '';
  const orders = db.prepare(`
    SELECT COUNT(*) AS total,
      MIN(date(order_date)) AS date_from,
      MAX(date(order_date)) AS date_to,
      SUM(CASE WHEN UPPER(IFNULL(seller_status, '')) = 'CANCELLED' THEN 1 ELSE 0 END) AS cancelled,
      SUM(CASE WHEN UPPER(IFNULL(seller_status, '')) <> 'CANCELLED' THEN 1 ELSE 0 END) AS active
    FROM orders ${orderWhere}
  `).get(...orderParams);
  const revenueFilters = [...orderFilters, "UPPER(IFNULL(seller_status, '')) <> 'CANCELLED'"];
  const activeRevenueRows = db.prepare(`
    SELECT COALESCE(NULLIF(UPPER(TRIM(payment_currency)), ''), 'N/A') AS currency,
      IFNULL(SUM(payment_amount), 0) AS revenue
    FROM orders
    WHERE ${revenueFilters.join(' AND ')}
    GROUP BY currency
  `).all(...orderParams);
  const activeRevenueByCurrency = Object.fromEntries(activeRevenueRows.map((row) => [row.currency, round2(row.revenue)]));
  const cancelledValueRows = db.prepare(`
    SELECT COALESCE(NULLIF(UPPER(TRIM(payment_currency)), ''), 'N/A') AS currency,
      IFNULL(SUM(payment_amount), 0) AS value
    FROM orders
    WHERE ${[...orderFilters, "UPPER(IFNULL(seller_status, '')) = 'CANCELLED'"].join(' AND ')}
    GROUP BY currency
  `).all(...orderParams);
  const cancelledValueByCurrency = Object.fromEntries(cancelledValueRows.map((row) => [row.currency, round2(row.value)]));

  const returnFilters = [];
  const returnParams = [];
  if (range.dateFrom) {
    returnFilters.push('(i.date_range_to IS NULL OR date(i.date_range_to) >= date(?))');
    returnParams.push(range.dateFrom);
  }
  if (range.dateTo) {
    returnFilters.push('(i.date_range_from IS NULL OR date(i.date_range_from) <= date(?))');
    returnParams.push(range.dateTo);
  }
  const returnWhere = returnFilters.length ? `WHERE ${returnFilters.join(' AND ')}` : '';
  const returns = db.prepare(`
    SELECT COUNT(*) AS line_items,
      SUM(CASE WHEN li.returns_quantity > 0 THEN 1 ELSE 0 END) AS returned_line_items,
      SUM(IFNULL(li.returns_quantity, 0)) AS returned_units
    FROM line_items li
    LEFT JOIN imports i ON i.id = li.import_id
    ${returnWhere}
  `).get(...returnParams);

  const billingFilters = [];
  const billingParams = [];
  appendDateFilters('b.operation_date', range, billingFilters, billingParams);
  const billingWhere = billingFilters.length ? `WHERE ${billingFilters.join(' AND ')}` : '';
  const billing = db.prepare(`
    SELECT COUNT(*) AS operations,
      MIN(date(b.operation_date)) AS date_from,
      MAX(date(b.operation_date)) AS date_to,
      SUM(CASE WHEN COALESCE(m.is_cost, CASE WHEN b.debit < 0 THEN 1 ELSE 0 END) = 1 AND b.debit < 0 THEN -b.debit ELSE 0 END) AS gross_costs,
      SUM(CASE WHEN COALESCE(m.is_cost, CASE WHEN b.debit < 0 THEN 1 ELSE 0 END) = 1 AND b.credit > 0 THEN b.credit ELSE 0 END) AS cost_credits,
      SUM(CASE WHEN b.raw_details LIKE '%Identyfikator zamówienia:%' THEN 1 ELSE 0 END) AS order_references,
      SUM(CASE WHEN b.raw_details LIKE '%Identyfikator zamówienia:%' AND b.related_order_id IS NULL THEN 1 ELSE 0 END) AS unmatched_order_references
    FROM billing_operations b
    LEFT JOIN operation_category_map m ON m.operation_type = b.operation_type
    ${billingWhere}
  `).get(...billingParams);
  const balanceFilters = ['balance IS NOT NULL'];
  const balanceParams = [];
  if (range.dateTo) {
    balanceFilters.push('date(operation_date) <= date(?)');
    balanceParams.push(range.dateTo);
  }
  const latestBalance = db.prepare(`
    SELECT balance FROM billing_operations
    WHERE ${balanceFilters.join(' AND ')}
    ORDER BY operation_date DESC, id DESC
    LIMIT 1
  `).get(...balanceParams);
  const linkedFilters = ['related_order_id IS NOT NULL'];
  const linkedParams = [];
  appendDateFilters('operation_date', range, linkedFilters, linkedParams);
  const linkedOrders = db.prepare(`
    SELECT COUNT(DISTINCT related_order_id) AS c
    FROM billing_operations
    WHERE ${linkedFilters.join(' AND ')}
  `).get(...linkedParams);
  db.close();
  return {
    orders: {
      total: orders.total || 0,
      dateFrom: orders.date_from,
      dateTo: orders.date_to,
      active: orders.active || 0,
      cancelled: orders.cancelled || 0,
      cancelledValue: cancelledValueByCurrency.PLN || 0,
      cancelledValueByCurrency,
      activeRevenue: activeRevenueByCurrency.PLN || 0,
      activeRevenueByCurrency,
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
    },
    dateFrom: range.dateFrom,
    dateTo: range.dateTo
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

function listReports(options = 50) {
  const { limit = 50, dateFrom: rawDateFrom = null, dateTo: rawDateTo = null } =
    typeof options === 'number' ? { limit: options } : (options || {});
  const dateFrom = normalizeIsoDate(rawDateFrom, 'Start date');
  const dateTo = normalizeIsoDate(rawDateTo, 'End date');
  if (dateFrom && dateTo && dateFrom > dateTo) {
    throw new Error('Start date must not be after end date.');
  }
  const db = openDb();
  let query = 'SELECT id, name, date_from, date_to, created_at, is_pinned FROM saved_reports';
  const filters = [];
  const params = [];
  if (dateFrom) {
    filters.push('date(date_to) >= date(?)');
    params.push(dateFrom);
  }
  if (dateTo) {
    filters.push('date(date_from) <= date(?)');
    params.push(dateTo);
  }
  if (filters.length) query += ` WHERE ${filters.join(' AND ')}`;
  query += ' ORDER BY is_pinned DESC, created_at DESC LIMIT ?';
  params.push(limit);
  const rows = db.prepare(query).all(...params);
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
