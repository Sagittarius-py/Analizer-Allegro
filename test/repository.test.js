const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const Database = require('better-sqlite3');
const { parseBillingCsv } = require('../electron/importers/billingParser');
const { parseOrdersCsv } = require('../electron/importers/ordersParser');

const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'allegro-analyzer-test-'));
const app = { isPackaged: false, getPath: () => dataRoot };
const ipcHandlers = new Map();
const ipcMain = { handle: (channel, handler) => ipcHandlers.set(channel, handler) };
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'electron') return { app, ipcMain };
  return originalLoad.call(this, request, parent, isMain);
};
const repo = require('../electron/db/repository');
app.isPackaged = true;
const { registerIpcHandlers } = require('../electron/ipc');
registerIpcHandlers();
app.isPackaged = false;
Module._load = originalLoad;

afterAll(() => fs.rmSync(dataRoot, { recursive: true, force: true }));

describe('report import IPC', () => {
  it('previews and commits the project reports independently, then analyzes their actual records', async () => {
    const reportsPath = path.join(__dirname, '..', 'Raports');
    const billingText = fs.readFileSync(path.join(reportsPath, 'allegro-billing-2026-09-22.csv'), 'utf8');
    const ordersText = fs.readFileSync(path.join(reportsPath, '2026-09-22-22_30_09.csv'), 'utf8');
    const billing = parseBillingCsv(billingText);
    const orders = parseOrdersCsv(ordersText);

    assert.strictEqual(billing.operations.length, 399);
    const uniqueBillingOffers = new Map(billing.operations
      .filter((operation) => operation.offer_id && operation.offer_name)
      .map((operation) => [operation.offer_id, operation.offer_name]));
    assert.strictEqual(orders.orders.length, 60);
    assert.strictEqual(orders.lineItems.length, 62);
    assert.strictEqual(orders.lineItems.reduce((sum, item) => sum + item.returnsQuantity, 0), 3);

    const billingFile = { name: 'allegro-billing-2026-09-22.csv', content: billingText };
    const ordersFile = { name: '2026-09-22-22_30_09.csv', content: ordersText };
    const previewBilling = await ipcHandlers.get('import:parseAndPreview')(null, [billingFile], 'orders');
    const previewOrders = await ipcHandlers.get('import:parseAndPreview')(null, [ordersFile], 'billing');
    assert.strictEqual(previewBilling[0].fileType, 'billing');
    assert.strictEqual(previewBilling[0].operationsCount, billing.operations.length);
    assert.strictEqual(previewOrders[0].fileType, 'orders');
    assert.strictEqual(previewOrders[0].ordersCount, orders.orders.length);
    assert.strictEqual(previewOrders[0].lineItemsCount, orders.lineItems.length);

    const billingResult = await ipcHandlers.get('import:commit')(null, [billingFile], 'orders');
    assert.strictEqual(billingResult[0].status, 'imported');
    assert.strictEqual(billingResult[0].fileType, 'billing');
    const insertedOperations = billingResult[0].insertedOperations;
    assert.ok(insertedOperations > 0);
    assert.strictEqual(billingResult[0].discoveredProducts, uniqueBillingOffers.size);

    const autoProducts = (await ipcHandlers.get('products:list')()).filter((product) => product.is_auto_discovered);
    assert.strictEqual(autoProducts.length, uniqueBillingOffers.size);
    assert.ok(autoProducts.every((product) => product.unit_cost === null && product.vat_verified === 0));
    for (const product of autoProducts) {
      assert.strictEqual(product.offer_name, uniqueBillingOffers.get(product.offer_id));
      assert.strictEqual(product.purchaseVat, null);
      assert.strictEqual(product.grossPurchaseCost, null);
    }
    const offerFees = autoProducts.find((product) => product.offer_id === autoProducts[0].offer_id);
    const categoryDb = repo.openDb();
    const feeTypes = new Set(categoryDb.prepare('SELECT operation_type FROM operation_category_map WHERE is_cost = 1').all().map((row) => row.operation_type));
    categoryDb.close();
    const actualOfferCostOperations = billing.operations.filter((operation) =>
      operation.offer_id === autoProducts[0].offer_id && feeTypes.has(operation.operation_type)
    );
    const actualOfferDebits = actualOfferCostOperations.reduce((sum, operation) => sum + Math.abs(operation.debit), 0);
    assert.strictEqual(offerFees.sellerFeeOperations, actualOfferCostOperations.length);
    assert.strictEqual(offerFees.sellerFeeDebits, Math.round(actualOfferDebits * 100) / 100);
    assert.strictEqual(offerFees.sellerFeesNet, Math.round((actualOfferCostOperations.reduce((sum, operation) => sum + Math.max(0, -operation.debit), 0) - actualOfferCostOperations.reduce((sum, operation) => sum + Math.max(0, operation.credit), 0)) * 100) / 100);
    assert.strictEqual(offerFees.unit_cost, null);
    assert.strictEqual(offerFees.grossPurchaseCost, null);

    const firstAutoProduct = autoProducts[0];
    const completedProduct = await ipcHandlers.get('products:save')(null, {
      offerId: firstAutoProduct.offer_id,
      offerName: firstAutoProduct.offer_name,
      sku: 'SKU-MANUAL',
      netPurchaseCost: '50',
      netSalePrice: '100',
      purchaseVatRate: '23',
      salesVatRate: '23',
      vatDeductiblePercent: '100',
      vatVerified: true,
      currency: 'PLN',
      notes: ''
    });
    assert.strictEqual(completedProduct.ok, true);

    const duplicateBilling = await ipcHandlers.get('import:commit')(null, [billingFile], 'orders');
    assert.strictEqual(duplicateBilling[0].status, 'duplicate');
    assert.strictEqual(duplicateBilling[0].discoveredProducts, 0);
    const preservedProduct = (await ipcHandlers.get('products:list')()).find((product) => product.offer_id === firstAutoProduct.offer_id);
    assert.strictEqual(preservedProduct.unit_cost, 50);
    assert.strictEqual(preservedProduct.sku, 'SKU-MANUAL');
    assert.strictEqual(preservedProduct.vat_verified, 1);

    const ordersResult = await ipcHandlers.get('import:commit')(null, [ordersFile], 'billing');
    assert.strictEqual(ordersResult[0].status, 'imported');
    assert.strictEqual(ordersResult[0].fileType, 'orders');
    assert.strictEqual(ordersResult[0].insertedOrders, orders.orders.length);
    assert.strictEqual(ordersResult[0].insertedLineItems, orders.lineItems.length);
    assert.ok(ordersResult[0].linkedBillingOperations > 0);

    const expectedRevenue = orders.orders
      .filter((order) => order.sellerStatus !== 'CANCELLED')
      .reduce((sum, order) => sum + (order.paymentAmount || 0), 0);
    const analysis = repo.getSourceAnalysis();
    assert.strictEqual(analysis.orders.total, 60);
    assert.strictEqual(analysis.orders.cancelled, 8);
    assert.strictEqual(analysis.orders.active, 52);
    assert.strictEqual(analysis.orders.dateFrom, '2026-06-11');
    assert.strictEqual(analysis.orders.dateTo, '2026-06-29');
    assert.strictEqual(analysis.orders.returnedUnits, 3);
    assert.strictEqual(analysis.orders.lineItems, 62);
    assert.strictEqual(analysis.orders.activeRevenue, Math.round(expectedRevenue * 100) / 100);
    assert.strictEqual(analysis.billing.operations, insertedOperations);
    assert.strictEqual(analysis.billing.dateFrom, '2026-06-01');
    assert.strictEqual(analysis.billing.dateTo, '2026-06-30');
    assert.strictEqual(analysis.billing.balance, 22.5);
    assert.ok(analysis.billing.netCosts > 0);
    assert.ok(analysis.billing.linkedOrders > 0);
    assert.ok(analysis.billing.unmatchedOrderReferences > 0);
    assert.ok(repo.getCostsBreakdown().some((category) => category.category === 'delivery'));
    assert.ok(repo.getProductBreakdown().length > 0);
    assert.strictEqual(
      Math.round(repo.getTrendsData(30).reduce((sum, day) => sum + day.revenue, 0) * 100) / 100,
      Math.round(expectedRevenue * 100) / 100
    );
  });

  it('saves per-offer cost, purchase VAT, sales VAT, and VAT deductibility through IPC', async () => {
    const db = repo.openDb();
    db.prepare('INSERT OR REPLACE INTO product_cost (offer_id, offer_name, unit_cost, currency) VALUES (?, ?, ?, ?)')
      .run('legacy-offer', 'Produkt ze starego katalogu', 12.5, 'PLN');
    db.close();

    const saved = await ipcHandlers.get('products:save')(null, {
      offerId: 'offer-vat-1',
      offerName: 'Produkt testowy',
      sku: 'SKU-001',
      netPurchaseCost: '100',
      netSalePrice: '160',
      purchaseVatRate: '23',
      salesVatRate: '8',
      vatDeductiblePercent: '50',
      vatVerified: true,
      currency: 'PLN',
      notes: 'Testowy dostawca'
    });

    assert.deepStrictEqual(saved, { ok: true, offerId: 'offer-vat-1' });
    const products = await ipcHandlers.get('products:list')();
    const product = products.find((item) => item.offer_id === 'offer-vat-1');
    const legacy = products.find((item) => item.offer_id === 'legacy-offer');
    assert.strictEqual(product.sku, 'SKU-001');
    assert.strictEqual(product.purchaseVat, 23);
    assert.strictEqual(product.nonDeductibleVat, 11.5);
    assert.strictEqual(product.grossPurchaseCost, 111.5);
    assert.strictEqual(product.estimatedGrossPrice, 172.8);
    assert.strictEqual(legacy.unit_cost, 12.5);
    const productImportId = repo.insertImportRecord({
      fileName: 'product-cost-test.csv', fileType: 'billing', rowCount: 1, fileHash: 'product-cost-test-hash'
    });
    repo.insertBillingOperations(productImportId, [{
      operation_date: '2026-06-30 12:00:00', operation_type: 'Prowizja od sprzedaży',
      offer_id: 'offer-vat-1', offer_name: 'Produkt testowy', debit: -2, credit: 0, balance: null
    }]);
    const offerAnalysis = repo.getProductBreakdown().find((item) => item.productId === 'offer-vat-1');
    assert.strictEqual(offerAnalysis.purchaseVatRate, 23);
    assert.strictEqual(offerAnalysis.effectivePurchaseUnitCost, 111.5);
    assert.strictEqual(offerAnalysis.saleUnitGross, 172.8);

    const invalidSave = await ipcHandlers.get('products:save')(null, { ...product, offerId: '', netPurchaseCost: '-1' });
    assert.match(invalidSave.error, /identyfikator/i);
    const deleted = await ipcHandlers.get('products:delete')(null, 'offer-vat-1');
    assert.strictEqual(deleted.deleted, 1);
    const remaining = await ipcHandlers.get('products:list')();
    assert.strictEqual(remaining.some((item) => item.offer_id === 'offer-vat-1'), false);
  });

  it('requires the exact reset phrase, backs up first, clears user data, and preserves category defaults', async () => {
    const resetHandler = ipcHandlers.get('settings:factoryReset');
    const rejected = await resetHandler(null, 'USUŃ DANE');
    assert.match(rejected.error, /USUŃ WSZYSTKIE DANE/);
    assert.ok(repo.listImports().length > 0);

    const createBackup = repo.createDatabaseBackup;
    repo.createDatabaseBackup = async () => { throw new Error('simulated backup failure'); };
    const backupFailure = await resetHandler(null, 'USUŃ WSZYSTKIE DANE');
    repo.createDatabaseBackup = createBackup;
    assert.ok(backupFailure.error);
    assert.ok(repo.listImports().length > 0);

    const beforeReset = repo.openDb();
    const expectedCounts = {
      orders: beforeReset.prepare('SELECT COUNT(*) AS count FROM orders').get().count,
      billing: beforeReset.prepare('SELECT COUNT(*) AS count FROM billing_operations').get().count,
      products: beforeReset.prepare('SELECT COUNT(*) AS count FROM product_cost').get().count
    };
    beforeReset.close();

    const resetResult = await resetHandler(null, 'USUŃ WSZYSTKIE DANE');
    assert.strictEqual(resetResult.ok, true);
    assert.ok(fs.existsSync(resetResult.backupPath));

    const backup = new Database(resetResult.backupPath, { readonly: true });
    try {
      assert.strictEqual(backup.prepare('SELECT COUNT(*) AS count FROM orders').get().count, expectedCounts.orders);
      assert.strictEqual(backup.prepare('SELECT COUNT(*) AS count FROM billing_operations').get().count, expectedCounts.billing);
      assert.strictEqual(backup.prepare('SELECT COUNT(*) AS count FROM product_cost').get().count, expectedCounts.products);
    } finally {
      backup.close();
    }

    assert.strictEqual(repo.listImports().length, 0);
    assert.strictEqual(repo.listProducts().length, 0);
    const db = repo.openDb();
    assert.strictEqual(db.prepare('SELECT COUNT(*) AS count FROM orders').get().count, 0);
    assert.strictEqual(db.prepare('SELECT COUNT(*) AS count FROM billing_operations').get().count, 0);
    assert.strictEqual(db.prepare('SELECT COUNT(*) AS count FROM saved_reports').get().count, 0);
    assert.strictEqual(db.prepare('SELECT COUNT(*) AS count FROM app_settings').get().count, 0);
    assert.strictEqual(db.prepare('SELECT COUNT(*) AS count FROM operation_category_map').get().count, 11);
    db.close();

    const newImportId = repo.insertImportRecord({
      fileName: 'after-reset.csv', fileType: 'orders', rowCount: 1, fileHash: 'after-reset-hash'
    });
    assert.strictEqual(newImportId, 1);
  });
});