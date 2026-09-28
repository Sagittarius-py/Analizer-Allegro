const assert = require('assert');
const { detectReportType } = require('../electron/importers/detectReportType');

describe('detectReportType', () => {
  it('detects Allegro orders and billing from their headers', () => {
    assert.strictEqual(detectReportType('\uFEFFType,OrderId,OrderDate,SellerStatus\n'), 'orders');
    assert.strictEqual(detectReportType('Data;Typ operacji;Uznania;Obciążenia;Saldo\n'), 'billing');
  });

  it('rejects empty and unrelated files', () => {
    assert.strictEqual(detectReportType(''), null);
    assert.strictEqual(detectReportType('id;name;value'), null);
  });
});