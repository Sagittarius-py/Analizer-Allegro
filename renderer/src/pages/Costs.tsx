import React, { useEffect, useState } from 'react'
import MiniChart from '../components/MiniChart'

export default function CostsPage() {
  const [costsBreakdown, setCostsBreakdown] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [trends, setTrends] = useState<any[]>([])
  const [sourceAnalysis, setSourceAnalysis] = useState<any>(null)
  const [days, setDays] = useState(30)

  async function load() {
    try {
      const costs = await (window as any).allegroAPI.costs.breakdown()
      setCostsBreakdown(costs || [])
    } catch (err) { setCostsBreakdown([]) }

    try {
      const prods = await (window as any).allegroAPI.products.breakdown()
      setProducts(prods || [])
    } catch (err) { setProducts([]) }

    try {
      const trendData = await (window as any).allegroAPI.trends.data(days)
      setTrends(trendData || [])
    } catch (err) { setTrends([]) }

    try {
      const summary = await (window as any).allegroAPI.analytics.sourceSummary()
      setSourceAnalysis(summary && !summary.error ? summary : null)
    } catch (err) { setSourceAnalysis(null) }
  }

  useEffect(() => { load() }, [days])

  const totalCosts = costsBreakdown.reduce((s, c) => s + (c.cost || 0), 0)
  const trendRevenue = trends.map(t => t.revenue)
  const trendCosts = trends.map(t => t.costs)
  const orderAnalysis = sourceAnalysis && sourceAnalysis.orders
  const billingAnalysis = sourceAnalysis && sourceAnalysis.billing

  return (
    <div className="space-y-6 p-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow">ANALIZA FINANSOWA</div>
          <h2 className="section-title">Koszty i produkty</h2>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-500">
          Zakres wykresu
          <input type="number" min={1} max={3650} value={days} onChange={e => setDays(Math.min(3650, parseInt(e.target.value) || 30))} className="p-2 border rounded w-24" />
          dni
        </label>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="metric-panel p-3">
          <div className="text-xs text-gray-500">Zamówienia</div>
          <div className="text-lg font-semibold">{orderAnalysis?.total ?? 0}</div>
          <div className="text-xs text-gray-500">Aktywne: {orderAnalysis?.active ?? 0} · anulowane: {orderAnalysis?.cancelled ?? 0}</div>
          <div className="mt-1 text-xs text-gray-500">Okres: {orderAnalysis?.dateFrom ?? '—'} – {orderAnalysis?.dateTo ?? '—'}</div>
        </div>
        <div className="metric-panel p-3">
          <div className="text-xs text-gray-500">Przychód aktywnych zamówień</div>
          <div className="text-lg font-semibold">{orderAnalysis?.activeRevenue ?? 0} PLN</div>
          <div className="text-xs text-gray-500">Bez statusu CANCELLED</div>
        </div>
        <div className="metric-panel p-3">
          <div className="text-xs text-gray-500">Koszty netto z billing</div>
          <div className="text-lg font-semibold">{billingAnalysis?.netCosts ?? totalCosts} PLN</div>
          <div className="text-xs text-gray-500">Koszty: {billingAnalysis?.grossCosts ?? totalCosts} · korekty: {billingAnalysis?.costCredits ?? 0} PLN</div>
        </div>
        <div className="metric-panel p-3">
          <div className="text-xs text-gray-500">Saldo Allegro</div>
          <div className="text-lg font-semibold">{billingAnalysis?.balance ?? '—'}{billingAnalysis?.balance != null ? ' PLN' : ''}</div>
          <div className="text-xs text-gray-500">Operacje: {billingAnalysis?.operations ?? 0}</div>
          <div className="mt-1 text-xs text-gray-500">Okres: {billingAnalysis?.dateFrom ?? '—'} – {billingAnalysis?.dateTo ?? '—'}</div>
        </div>
      </div>

      <div className="info-strip text-xs text-gray-500">
        Zwroty: {orderAnalysis?.returnedUnits ?? 0} szt. w {orderAnalysis?.returnedLineItems ?? 0} pozycjach. Plik nie przypisuje pozycji do identyfikatorów zamówień, więc zwroty są raportowane zbiorczo.
        {' '}Powiązane zamówienia billing: {billingAnalysis?.linkedOrders ?? 0} z {billingAnalysis?.orderReferences ?? 0} odwołań; bez dopasowania: {billingAnalysis?.unmatchedOrderReferences ?? 0}.
        {' '}Zakresy dat obu raportów należy porównać przed wyciąganiem wniosków o zysku dla całego okresu.
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="panel p-4">
          <h3 className="font-semibold">Koszty wg kategorii</h3>
          <div className="mt-3 text-sm">
            <div className="font-medium">Razem: {totalCosts} PLN</div>
          </div>
          <ul className="mt-2 space-y-1">
            {costsBreakdown.map((c, i) => (
              <li key={i} className="flex justify-between text-sm">
                <div>{c.category || 'Brak kategorii'}</div>
                <div>{c.cost} PLN ({c.count} operacji)</div>
              </li>
            ))}
          </ul>
        </div>

        <div className="panel p-4">
          <h3 className="font-semibold">Koszty wg oferty</h3>
          <div className="mt-3 text-sm">
            <div className="font-medium">Koszty netto: {products.reduce((sum, product) => sum + (product.totalCosts || 0), 0).toFixed(2)} PLN</div>
          </div>
          <ul className="mt-2 space-y-2 max-h-64 overflow-y-auto">
            {products.slice(0, 10).map((p, i) => (
              <li key={i} className="product-row p-2 text-xs">
                <div className="font-medium">{p.productName}</div>
                <div className="text-gray-600">
                  Netto: {p.totalCosts} PLN | obciążenia: {p.grossCosts} | korekty: {p.credits} | operacje: {p.operationCount}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="panel p-4">
        <h3 className="font-semibold">Trend przychodu i kosztów ({days} dni)</h3>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <div className="text-sm text-gray-600 mb-2">Przychód</div>
            <MiniChart data={trendRevenue} />
          </div>
          <div>
            <div className="text-sm text-gray-600 mb-2">Koszty</div>
            <MiniChart data={trendCosts} />
          </div>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-1 text-xs">
          {trends.length ? <div className="trend-table mt-3 overflow-auto">
            <table className="w-full min-w-[520px] text-left text-xs">
              <thead><tr><th>Data</th><th>Przychód</th><th>Koszty netto</th><th>Różnica</th></tr></thead>
              <tbody>{trends.map((trend, index) => (
                <tr key={`${trend.date}-${index}`}>
                  <td>{trend.date}</td><td>{trend.revenue.toFixed(2)} PLN</td><td>{trend.costs.toFixed(2)} PLN</td><td>{trend.profit.toFixed(2)} PLN</td>
                </tr>
              ))}</tbody>
            </table>
          </div> : <p className="mt-4 text-sm text-gray-500">Brak danych w wybranym zakresie.</p>}
        </div>
      </div>
    </div>
  )
}
