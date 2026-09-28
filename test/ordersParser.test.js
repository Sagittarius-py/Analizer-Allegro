const assert = require('assert');
const { parseOrdersCsv } = require('../electron/importers/ordersParser');

describe('ordersParser', () => {
  it('parses multi-section CSV with orders and line items', () => {
    const sample = `Type,OrderId,OrderDate,SellerStatus,Marketplace,PaymentAmount,PaymentCurrency,FulfillmentProvider
order,3b37f900-0000-0000-0000-000000000001,2026-06-29T11:31:15.900Z,NEW,allegro-pl,100.50,PLN,SELLER

Type,LineItemId,ReturnsQuantity
lineItem,4b37f900-0000-0000-0000-000000000002,0
`;
    const { orders, lineItems } = parseOrdersCsv(sample);
    assert.strictEqual(orders.length, 1);
    assert.strictEqual(lineItems.length, 1);
    assert.strictEqual(orders[0].orderId, '3b37f900-0000-0000-0000-000000000001');
    assert.strictEqual(orders[0].paymentAmount, 100.5);
    assert.strictEqual(lineItems[0].lineItemId, '4b37f900-0000-0000-0000-000000000002');
  });

  it('handles a BOM and blank order amounts in Allegro exports', () => {
    const sample = `\uFEFFType,OrderId,OrderDate,SellerStatus,Marketplace,PaymentAmount,PaymentCurrency,FulfillmentProvider
order,80c58570-6e30-11f1-a33b-a3295158b919,2026-06-22T11:50:39.853Z,CANCELLED,allegro-pl,,,SELLER`;
    const { orders } = parseOrdersCsv(sample);

    assert.strictEqual(orders.length, 1);
    assert.strictEqual(orders[0].orderId, '80c58570-6e30-11f1-a33b-a3295158b919');
    assert.strictEqual(orders[0].paymentAmount, null);
  });
});
