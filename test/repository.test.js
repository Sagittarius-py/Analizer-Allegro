const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
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
});