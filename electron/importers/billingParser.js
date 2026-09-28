const splitCsvLine = (line, delimiter = ';') => {
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

function parseDecimalPl(str) {
  if (!str) return null;
  let cleaned = str.replace(/[\s\u00a0]/g, '');
  const commaIndex = cleaned.lastIndexOf(',');
  const dotIndex = cleaned.lastIndexOf('.');
  if (commaIndex >= 0 && dotIndex >= 0) {
    cleaned = commaIndex > dotIndex
      ? cleaned.replace(/\./g, '').replace(',', '.')
      : cleaned.replace(/,/g, '');
  } else if (commaIndex >= 0) {
    cleaned = cleaned.replace(',', '.');
  }
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

function parseOperationDate(value) {
  if (!value) return null;
  const polishDate = value.match(/^(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (polishDate) {
    const [, day, month, year, hour = '00', minute = '00', second = '00'] = polishDate;
    return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
  }
  const isoDate = value.match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}(?::\d{2})?))?/);
  if (isoDate) return `${isoDate[1]} ${isoDate[2] || '00:00:00'}`;
  return null;
}

function extractDetails(detailsText) {
  const out = { raw: detailsText };
  if (!detailsText) return out;
  const orderIdMatch = detailsText.match(/Identyfikator zamówienia:\s*([a-f0-9-]{36})/i);
  if (orderIdMatch) out.orderId = orderIdMatch[1];
  const valueMatch = detailsText.match(/Wartość zamówienia:\s*(-?\d+(?:[.,]\d+)?)/i);
  if (valueMatch) out.orderValue = parseDecimalPl(valueMatch[1]);
  const currencyMatch = detailsText.match(/Waluta zamówienia:\s*(\w+)/i);
  if (currencyMatch) out.orderCurrency = currencyMatch[1];
  const serviceCodeMatch = detailsText.match(/Kod usługi:\s*([^,]+)/i);
  if (serviceCodeMatch) out.serviceCode = serviceCodeMatch[1].trim();
  const serviceNameMatch = detailsText.match(/Usługa:\s*([^,]+)/i);
  if (serviceNameMatch) out.serviceName = serviceNameMatch[1].trim();
  const waybillMatch = detailsText.match(/Numer nadania:\s*([^,]+)/i);
  if (waybillMatch) out.waybill = waybillMatch[1].trim();
  return out;
}

function parseBillingCsv(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  if (!lines.length) return { operations: [] };
  const headerLine = lines[0];
  const headers = splitCsvLine(headerLine, ';').map(h => h.trim());
  const idx = (name) => headers.indexOf(name);
  const requiredHeaders = ['Data', 'Typ operacji', 'Uznania', 'Obciążenia', 'Saldo'];
  if (requiredHeaders.some(name => idx(name) < 0)) {
    throw new Error('Invalid billing CSV header');
  }
  const operations = [];
  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw.trim()) continue;
    const cols = splitCsvLine(raw, ';');
    const op = {
      operation_date: parseOperationDate(cols[idx('Data')]),
      offer_name: cols[idx('Nazwa oferty')] || null,
      offer_id: cols[idx('Identyfikator oferty')] || null,
      operation_type: cols[idx('Typ operacji')] || null,
      credit: parseDecimalPl(cols[idx('Uznania')]) ?? 0,
      debit: parseDecimalPl(cols[idx('Obciążenia')]) ?? 0,
      balance: parseDecimalPl(cols[idx('Saldo')]),
      raw_details: cols[idx('Szczegóły operacji')] || null
    };
    const details = extractDetails(op.raw_details);
    Object.assign(op, {
      related_order_id: details.orderId || null,
      extracted_order_value: details.orderValue ?? null,
      extracted_order_currency: details.orderCurrency || null,
      service_code: details.serviceCode || null,
      service_name: details.serviceName || null,
      waybill_number: details.waybill || null,
      is_smart_delivery: /Zamówienie Smart!:\s*Tak/i.test(op.raw_details || '')
    });
    operations.push(op);
  }
  return { operations };
}

module.exports = { parseBillingCsv };
