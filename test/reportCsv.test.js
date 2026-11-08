const { createReportCsv } = require('../electron/exporters/reportCsv');

describe('saved report CSV export', () => {
  it('exports period summaries, currency breakdowns, costs, and trends as spreadsheet-safe CSV', () => {
    const csv = createReportCsv({
      name: '=2+2; "report"',
      date_from: '2026-06-02',
      date_to: '2026-06-03',
      metrics_snapshot: {
        metrics: {
          orders: 4,
          revenue: 100,
          revenueByCurrency: { PLN: 100, EUR: 20 },
          balance: -7
        },
        costs: [{ category: 'commission', cost: 7, count: 1 }],
        trends: [{ date: '2026-06-02', revenue: 100, costs: 7, profit: 93 }]
      }
    });

    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('"\'=2+2; ""report"""');
    expect(csv).toContain('"EUR";"20";"EUR";"Bez przeliczenia na PLN"');
    expect(csv).toContain('"Koszty wg kategorii";"commission";"7";"PLN";"1 operacji"');
    expect(csv).toContain('"Trend dzienny";"2026-06-02";"100";"PLN";"Koszty: 7; różnica: 93"');
  });

  it('supports older basic metric snapshots', () => {
    const csv = createReportCsv({
      name: 'Stary raport',
      date_from: '2026-01-01',
      date_to: '2026-01-31',
      metrics_snapshot: { orders: 2, revenue: 50, balance: 12, trend: [1, 2] }
    });

    expect(csv).toContain('"Podsumowanie";"Zamówienia";"2"');
    expect(csv).toContain('"Podsumowanie";"Przychód";"50";"PLN"');
  });
});
