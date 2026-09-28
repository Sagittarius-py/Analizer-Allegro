// Simple section-aware CSV parser for File Type A (orders with sections)
const splitCsvLine = (line, delimiter = ',') => {
  const res = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; } else { inQuotes = !inQuotes; }
      continue;
    }
    if (ch === delimiter && !inQuotes) { res.push(cur); cur = ''; continue; }
    cur += ch;
  }
  res.push(cur);
  return res;
};

function parseOrdersCsv(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  let currentHeaders = null;
  const orders = [];
  const lineItems = [];

  for (let raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('Type,')) {
      // new header
      currentHeaders = splitCsvLine(line, ',');
      continue;
    }
    if (!currentHeaders) continue; // skip until header seen
    const values = splitCsvLine(line, ',');
    const obj = {};
    for (let i = 0; i < currentHeaders.length; i++) {
      const key = currentHeaders[i];
      obj[key] = values[i] === undefined ? '' : values[i];
    }
    const type = obj['Type'] || '';
    if (type === 'order') {
      const paymentAmount = Number.parseFloat(obj['PaymentAmount']);
      orders.push({
        type: 'order',
        orderId: obj['OrderId'] || null,
        orderDate: obj['OrderDate'] || null,
        sellerStatus: obj['SellerStatus'] || null,
        marketplace: obj['Marketplace'] || null,
        paymentAmount: Number.isFinite(paymentAmount) ? paymentAmount : null,
        paymentCurrency: obj['PaymentCurrency'] || null,
        fulfillmentProvider: obj['FulfillmentProvider'] || null,
        raw: obj
      });
    } else if (type === 'lineItem') {
      const returnsQuantity = Number.parseInt(obj['ReturnsQuantity'], 10);
      lineItems.push({
        type: 'lineItem',
        lineItemId: obj['LineItemId'] || null,
        returnsQuantity: Number.isFinite(returnsQuantity) ? returnsQuantity : 0,
        raw: obj
      });
    }
  }

  return { orders, lineItems };
}

module.exports = { parseOrdersCsv };
