const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'allegro-analytics-test-'));
const app = { getPath: () => dataRoot };
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'electron') return { app };
  return originalLoad.call(this, request, parent, isMain);
};
const repo = require('../electron/db/repository');
Module._load = originalLoad;

afterAll(() => fs.rmSync(dataRoot, { recursive: true, force: true }));

describe('period-aware analytics', () => {
  it('filters every summary by the selected period and keeps currencies separate', () => {
    const importId = repo.insertImportRecord({
      fileName: 'analytics-fixture.csv',
      fileType: 'orders',
      rowCount: 5,
      dateFrom: '2026-06-02',
      dateTo: '2026-06-03',
      fileHash: 'analytics-fixture-orders'
    });
    repo.insertOrders(importId, [
      { orderId: 'pln-order', orderDate: '2026-06-02T10:00:00.000Z', sellerStatus: 'PROCESSING', paymentAmount: 100, paymentCurrency: 'PLN' },
      { orderId: 'eur-order', orderDate: '2026-06-02T11:00:00.000Z', sellerStatus: 'PROCESSING', paymentAmount: 20, paymentCurrency: 'EUR' },
      { orderId: 'cancelled-order', orderDate: '2026-06-02T12:00:00.000Z', sellerStatus: 'CANCELLED', paymentAmount: 50, paymentCurrency: 'PLN' },
      { orderId: 'cancelled-foreign-order', orderDate: '2026-06-02T13:00:00.000Z', sellerStatus: 'CANCELLED', paymentAmount: 10, paymentCurrency: 'EUR' },
      { orderId: 'later-order', orderDate: '2026-06-03T10:00:00.000Z', sellerStatus: 'PROCESSING', paymentAmount: 300, paymentCurrency: 'USD' }
    ]);

    const billingImportId = repo.insertImportRecord({
      fileName: 'analytics-fixture-billing.csv',
      fileType: 'billing',
      rowCount: 2,
      dateFrom: '2026-06-02',
      dateTo: '2026-06-03',
      fileHash: 'analytics-fixture-billing'
    });
    repo.insertBillingOperations(billingImportId, [
      { operation_date: '2026-06-02 10:00:00', offer_id: 'offer-1', offer_name: 'Product', operation_type: 'Prowizja od sprzedaży', debit: -7, credit: 0, balance: null },
      { operation_date: '2026-06-03 10:00:00', offer_id: 'offer-1', offer_name: 'Product', operation_type: 'Prowizja od sprzedaży', debit: -9, credit: 0, balance: null }
    ]);

    const oneDay = { dateFrom: '2026-06-02', dateTo: '2026-06-02' };
    const metrics = repo.getMetricsSummary(oneDay);
    expect(metrics.orders).toBe(4);
    expect(metrics.revenue).toBe(100);
    expect(metrics.revenueByCurrency).toEqual({ PLN: 100, EUR: 20 });
    expect(metrics.balance).toBe(-7);
    expect(metrics.dateFrom).toBe(oneDay.dateFrom);
    expect(metrics.dateTo).toBe(oneDay.dateTo);

    expect(repo.getCostsBreakdown(oneDay)).toEqual([
      { category: 'commission', cost: 7, count: 1 }
    ]);
    expect(repo.getProductBreakdown(oneDay).find((product) => product.productId === 'offer-1').totalCosts).toBe(7);
    expect(repo.getTrendsData(oneDay)).toEqual([
      { date: '2026-06-02', revenue: 100, costs: 7, profit: 93 }
    ]);
    const sourceSummary = repo.getSourceAnalysis(oneDay);
    expect(sourceSummary.orders.total).toBe(4);
    expect(sourceSummary.orders.activeRevenueByCurrency).toEqual({ PLN: 100, EUR: 20 });
    expect(sourceSummary.orders.cancelledValue).toBe(50);
    expect(sourceSummary.orders.cancelledValueByCurrency).toEqual({ PLN: 50, EUR: 10 });
    expect(sourceSummary.billing.operations).toBe(1);
    expect(sourceSummary.billing.netCosts).toBe(7);

    const recent = repo.getMetricsSummary({ days: 1 });
    expect(recent.orders).toBe(1);
    expect(recent.revenue).toBe(0);
    expect(recent.revenueByCurrency).toEqual({ USD: 300 });
    expect(repo.getCostsBreakdown({ days: 1 })[0].cost).toBe(9);
  });

  it('rejects invalid or reversed date ranges', () => {
    expect(() => repo.getMetricsSummary({ dateFrom: '2026-02-30' })).toThrow(/valid date/i);
    expect(() => repo.getCostsBreakdown({ dateFrom: '2026-06-03', dateTo: '2026-06-02' })).toThrow(/after end date/i);
  });

  it('restores a validated backup and leaves current data intact when the selected file is invalid', async () => {
    const backupPath = path.join(dataRoot, 'known-good-backup.db');
    await repo.createDatabaseBackup(backupPath);
    const baseline = repo.getMetricsSummary();

    const extraImportId = repo.insertImportRecord({
      fileName: 'temporary-change.csv',
      fileType: 'orders',
      rowCount: 1,
      dateFrom: '2026-06-04',
      dateTo: '2026-06-04',
      fileHash: 'temporary-change'
    });
    repo.insertOrders(extraImportId, [
      { orderId: 'temporary-order', orderDate: '2026-06-04T10:00:00.000Z', sellerStatus: 'PROCESSING', paymentAmount: 999, paymentCurrency: 'PLN' }
    ]);
    expect(repo.getMetricsSummary().orders).toBe(baseline.orders + 1);

    expect(repo.restoreDatabaseBackup(backupPath)).toBe(repo.getDatabaseInfo().path);
    expect(repo.getMetricsSummary()).toEqual(baseline);

    const invalidBackupPath = path.join(dataRoot, 'invalid-backup.db');
    fs.writeFileSync(invalidBackupPath, 'not a SQLite database');
    expect(() => repo.restoreDatabaseBackup(invalidBackupPath)).toThrow();
    expect(repo.getMetricsSummary()).toEqual(baseline);
  });
});
