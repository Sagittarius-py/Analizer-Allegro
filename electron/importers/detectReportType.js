function detectReportType(text) {
  const header = String(text || '')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .find((line) => line.trim());
  if (!header) return null;

  const columns = header.split(header.includes(';') ? ';' : ',').map((column) => column.trim());
  if (['Type', 'OrderId', 'OrderDate', 'SellerStatus'].every((column) => columns.includes(column))) {
    return 'orders';
  }
  if (['Data', 'Typ operacji', 'Uznania', 'Obciążenia', 'Saldo'].every((column) => columns.includes(column))) {
    return 'billing';
  }
  return null;
}

module.exports = { detectReportType };