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
  const cleaned = str.replace(/\s/g, '').replace('.', '').replace(',', '.');
  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? num : null;
}

function extractDetails(detailsText) {
  const out = { raw: detailsText };
  if (!detailsText) return out;
  const orderIdMatch = detailsText.match(/Identyfikator zamówienia:\s*([a-f0-9-]{36})/i);
  if (orderIdMatch) out.orderId = orderIdMatch[1];
  const valueMatch = detailsText.match(/Wartość zamówienia:\s*([0-9.,]+)/i);
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
  const lines = text.split(/\r?\n/);
  if (!lines.length) return { operations: [] };
  const headerLine = lines[0];
  const headers = splitCsvLine(headerLine, ';').map(h => h.trim());
  const idx = (name) => headers.indexOf(name);
  const operations = [];
  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw.trim()) continue;
    const cols = splitCsvLine(raw, ';');
    const op = {
      operation_date: cols[idx('Data')] || null,
      offer_name: cols[idx('Nazwa oferty')] || null,
      offer_id: cols[idx('Identyfikator oferty')] || null,
      operation_type: cols[idx('Typ operacji')] || null,
      credit: parseDecimalPl(cols[idx('Uznania')]) || 0,
      debit: parseDecimalPl(cols[idx('Obciążenia')]) || 0,
      balance: parseDecimalPl(cols[idx('Saldo')]) || null,
      raw_details: cols[idx('Szczegóły operacji')] || null
    };
    const details = extractDetails(op.raw_details);
    Object.assign(op, { related_order_id: details.orderId || null, extracted_order_value: details.orderValue || null, extracted_order_currency: details.orderCurrency || null, service_code: details.serviceCode || null, service_name: details.serviceName || null, waybill_number: details.waybill || null });
    operations.push(op);
  }
  return { operations };
}

module.exports = { parseBillingCsv };
