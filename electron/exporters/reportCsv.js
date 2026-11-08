function csvCell(value) {
  let text = value == null ? '' : String(value);
  if (typeof value === 'string' && /^[\s\u0000-\u001f]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function createReportCsv(report) {
  const snapshot = report.metrics_snapshot && typeof report.metrics_snapshot === 'object'
    ? report.metrics_snapshot
    : {};
  const metrics = snapshot.metrics || snapshot;
  const rows = [
    ['Sekcja', 'Metryka', 'Wartość', 'Waluta', 'Szczegóły'],
    ['Raport', 'Nazwa', report.name],
    ['Raport', 'Okres', `${report.date_from} – ${report.date_to}`]
  ];

  if (metrics.orders != null) rows.push(['Podsumowanie', 'Zamówienia', metrics.orders, '', '']);
  if (metrics.revenue != null) rows.push(['Podsumowanie', 'Przychód', metrics.revenue, 'PLN', 'Zamówienia bez anulowanych']);
  if (metrics.balance != null) rows.push(['Podsumowanie', 'Saldo Allegro', metrics.balance, 'PLN', 'Saldo na koniec okresu']);

  for (const [currency, value] of Object.entries(metrics.revenueByCurrency || {})) {
    if (currency !== 'PLN') rows.push(['Przychody wg waluty', currency, value, currency, 'Bez przeliczenia na PLN']);
  }

  for (const cost of snapshot.costs || []) {
    rows.push(['Koszty wg kategorii', cost.category, cost.cost, 'PLN', `${cost.count || 0} operacji`]);
  }

  for (const point of snapshot.trends || []) {
    rows.push(['Trend dzienny', point.date, point.revenue, 'PLN', `Koszty: ${Number(point.costs || 0)}; różnica: ${Number(point.profit || 0)}`]);
  }

  return `\uFEFF${rows.map((row) => row.map(csvCell).join(';')).join('\r\n')}\r\n`;
}

module.exports = { createReportCsv };
