const assert = require('assert');
const { parseBillingCsv } = require('../electron/importers/billingParser');

describe('billingParser', () => {
  it('parses semicolon CSV and extracts order identifier and value', () => {
    const sample = `Data;Nazwa oferty;Identyfikator oferty;Typ operacji;Uznania;Obciążenia;Saldo;Szczegóły operacji
30.06.2026 23:59;Test Oferta;offer-123;Prowizja od sprzedaży;;-11,29;1000,00;Opłata Smart!: Tak, Zamówienie Smart!: Tak, Identyfikator zamówienia: 3b37f900-0000-0000-0000-000000000001, Wartość zamówienia: 660,00, Waluta zamówienia: PLN, Kod usługi: AD_COURIER, Usługa: Opłata za dostawę, Numer nadania: AD0LXFDS0LPXZVLZS
`;
    const { operations } = parseBillingCsv(sample);
    assert.strictEqual(operations.length, 1);
    const op = operations[0];
    assert.strictEqual(op.related_order_id, '3b37f900-0000-0000-0000-000000000001');
    assert.strictEqual(op.debit, -11.29);
    assert.strictEqual(op.extracted_order_value, 660.00);
    assert.strictEqual(op.extracted_order_currency, 'PLN');
  });
});
