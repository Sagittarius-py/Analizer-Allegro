import React, { useEffect, useState } from 'react'
import MiniChart from '../components/MiniChart'
import SortableTableHeader from '../components/SortableTableHeader'
import { translateCostCategory } from '../utils/localization'
import { sortRows, type SortDirection } from '../utils/tableSorting'

export default function CostsPage({ onNavigate }: { onNavigate: (page: string) => void }) {
  const [costsBreakdown, setCostsBreakdown] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [trends, setTrends] = useState<any[]>([])
  const [sourceAnalysis, setSourceAnalysis] = useState<any>(null)
  const [days, setDays] = useState(30)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [appliedDateRange, setAppliedDateRange] = useState({ dateFrom: '', dateTo: '' })
  const [filterError, setFilterError] = useState<string | null>(null)
  const [trendSortBy, setTrendSortBy] = useState('date')
  const [trendSortDirection, setTrendSortDirection] = useState<SortDirection>('asc')

  async function load() {
    const options = appliedDateRange.dateFrom || appliedDateRange.dateTo
      ? {
          dateFrom: appliedDateRange.dateFrom || null,
          dateTo: appliedDateRange.dateTo || null
        }
      : { days }
    try {
      const costs = await (window as any).allegroAPI.costs.breakdown(options)
      setCostsBreakdown(costs || [])
    } catch (err) { setCostsBreakdown([]) }

    try {
      const prods = await (window as any).allegroAPI.products.breakdown(options)
      setProducts(prods || [])
    } catch (err) { setProducts([]) }

    try {
      const trendData = await (window as any).allegroAPI.trends.data(options)
      setTrends(trendData || [])
    } catch (err) { setTrends([]) }

    try {
      const summary = await (window as any).allegroAPI.analytics.sourceSummary(options)
      setSourceAnalysis(summary && !summary.error ? summary : null)
    } catch (err) { setSourceAnalysis(null) }
  }

  useEffect(() => { load() }, [days, appliedDateRange])

  function applyDateRange() {
    if (dateFrom && dateTo && dateFrom > dateTo) {
      setFilterError('Data początkowa nie może być późniejsza niż końcowa.')
      return
    }
    setFilterError(null)
    setAppliedDateRange({ dateFrom, dateTo })
  }

  function clearDateRange() {
    setDateFrom('')
    setDateTo('')
    setFilterError(null)
    setAppliedDateRange({ dateFrom: '', dateTo: '' })
  }

  function changeDays(value: string) {
    setDays(Math.min(3650, parseInt(value, 10) || 30))
    clearDateRange()
  }

  const totalCosts = costsBreakdown.reduce((s, c) => s + (c.cost || 0), 0)
  const trendRevenue = trends.map(t => t.revenue)
  const trendCosts = trends.map(t => t.costs)
  const sortedTrends = sortRows(trends, (trend) => trend[trendSortBy], trendSortDirection)
  const orderAnalysis = sourceAnalysis && sourceAnalysis.orders
  const billingAnalysis = sourceAnalysis && sourceAnalysis.billing
  const otherRevenue = Object.entries(orderAnalysis?.activeRevenueByCurrency || {})
    .filter(([currency, value]) => currency !== 'PLN' && Number(value) !== 0)
    .map(([currency, value]) => `${Number(value).toFixed(2)} ${currency === 'N/A' ? 'nieznana waluta' : currency}`)
    .join(' · ')

  function changeTrendSort(key: string) {
    if (trendSortBy === key) setTrendSortDirection((current) => current === 'asc' ? 'desc' : 'asc')
    else {
      setTrendSortBy(key)
      setTrendSortDirection('asc')
    }
  }

  return (
    <div className="space-y-6 p-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow">ANALIZA FINANSOWA</div>
          <h2 className="section-title">Koszty i produkty</h2>
          <p className="mt-1 text-sm text-gray-500">
            {appliedDateRange.dateFrom || appliedDateRange.dateTo
              ? `Wybrany okres: ${appliedDateRange.dateFrom || 'początek danych'} – ${appliedDateRange.dateTo || 'najnowsza data danych'}`
              : 'Zakres liczony wstecz od najnowszej daty w zaimportowanych raportach.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-500">
            Zakres wykresu
            <input type="number" min={1} max={3650} value={days} onChange={e => changeDays(e.target.value)} className="p-2 border rounded w-24" />
            dni
          </label>
          <button type="button" onClick={() => onNavigate('products')} className="secondary-action px-3 py-2">Katalog produktów i VAT</button>
        </div>
      </div>

      <form className="panel grid grid-cols-1 items-end gap-3 p-4 sm:grid-cols-[1fr_1fr_auto_auto]" onSubmit={event => { event.preventDefault(); applyDateRange() }}>
        <label className="text-sm text-gray-600">
          Data początkowa
          <input type="date" value={dateFrom} onChange={event => setDateFrom(event.target.value)} className="mt-1 block w-full rounded border p-2" />
        </label>
        <label className="text-sm text-gray-600">
          Data końcowa
          <input type="date" value={dateTo} onChange={event => setDateTo(event.target.value)} className="mt-1 block w-full rounded border p-2" />
        </label>
        <button type="submit" className="secondary-action px-4 py-2">Filtruj okres</button>
        <button type="button" onClick={clearDateRange} className="secondary-action px-4 py-2">Wyczyść</button>
        {filterError ? <div role="alert" className="text-sm text-red-500 sm:col-span-4">{filterError}</div> : null}
      </form>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="metric-panel p-3">
          <div className="text-xs text-gray-500">Zamówienia</div>
          <div className="text-lg font-semibold">{orderAnalysis?.total ?? 0}</div>
          <div className="text-xs text-gray-500">Aktywne: {orderAnalysis?.active ?? 0} · anulowane: {orderAnalysis?.cancelled ?? 0}</div>
          <div className="mt-1 text-xs text-gray-500">Okres: {orderAnalysis?.dateFrom ?? '—'} – {orderAnalysis?.dateTo ?? '—'}</div>
        </div>
        <div className="metric-panel p-3">
          <div className="text-xs text-gray-500">Przychód aktywnych zamówień (PLN)</div>
          <div className="text-lg font-semibold">{orderAnalysis?.activeRevenue ?? 0} PLN</div>
          <div className="text-xs text-gray-500">Bez zamówień anulowanych</div>
          {otherRevenue ? <div className="mt-1 text-xs text-gray-500">Inne waluty (bez przeliczenia): {otherRevenue}</div> : null}
        </div>
        <div className="metric-panel p-3">
          <div className="text-xs text-gray-500">Koszty netto z rozliczeń</div>
          <div className="text-lg font-semibold">{billingAnalysis?.netCosts ?? totalCosts} PLN</div>
          <div className="text-xs text-gray-500">Koszty: {billingAnalysis?.grossCosts ?? totalCosts} · korekty: {billingAnalysis?.costCredits ?? 0} PLN</div>
        </div>
        <div className="metric-panel p-3">
          <div className="text-xs text-gray-500">Saldo na Allegro</div>
          <div className="text-lg font-semibold">{billingAnalysis?.balance ?? '—'}{billingAnalysis?.balance != null ? ' PLN' : ''}</div>
          <div className="text-xs text-gray-500">Operacje: {billingAnalysis?.operations ?? 0}</div>
          <div className="mt-1 text-xs text-gray-500">Okres: {billingAnalysis?.dateFrom ?? '—'} – {billingAnalysis?.dateTo ?? '—'}</div>
        </div>
      </div>

      <div className="info-strip text-xs text-gray-500">
        Zwroty: {orderAnalysis?.returnedUnits ?? 0} szt. w {orderAnalysis?.returnedLineItems ?? 0} pozycjach. Plik nie przypisuje pozycji do identyfikatorów zamówień, więc zwroty są raportowane zbiorczo; zakres dat ogranicza je według okresu raportu źródłowego.
        {' '}Powiązane zamówienia z rozliczeń: {billingAnalysis?.linkedOrders ?? 0} z {billingAnalysis?.orderReferences ?? 0} odwołań; bez dopasowania: {billingAnalysis?.unmatchedOrderReferences ?? 0}.
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
                <div>{translateCostCategory(c.category)}</div>
                <div>{c.cost} PLN ({c.count} operacji)</div>
              </li>
            ))}
          </ul>
        </div>

        <div className="panel p-4">
          <h3 className="font-semibold">Opłaty Allegro według oferty</h3>
          <div className="mt-3 text-sm">
            <div className="font-medium">Koszty netto: {products.reduce((sum, product) => sum + (product.totalCosts || 0), 0).toFixed(2)} PLN</div>
          </div>
          <ul className="mt-2 space-y-2 max-h-64 overflow-y-auto">
            {products.slice(0, 10).map((p, i) => (
              <li key={i} className="product-row p-2 text-xs">
                <div className="font-medium">{p.productName}</div>
                <div className="text-gray-600">
                  Netto: {p.totalCosts} PLN · obciążenia: {p.grossCosts} PLN · korekty: {p.credits} PLN · operacje: {p.operationCount}
                </div>
                <div className="mt-1 text-gray-500">
                  {p.effectivePurchaseUnitCost == null
                    ? (p.purchaseUnitNet == null ? 'Brak kosztu zakupu w katalogu' : 'Stawki VAT wymagają potwierdzenia w katalogu produktów')
                    : `Zakup netto: ${p.purchaseUnitNet.toFixed(2)} ${p.productCurrency} · efektywnie z VAT: ${p.effectivePurchaseUnitCost.toFixed(2)} ${p.productCurrency} · VAT zakupu ${p.purchaseVatRate}% (odliczenie ${p.vatDeductiblePercent}%)`}
                  {p.saleUnitGross == null ? '' : ` · sprzedaż brutto: ${p.saleUnitGross.toFixed(2)} ${p.productCurrency}`}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="panel p-4">
        <h3 className="font-semibold">
          Trend przychodu i kosztów{appliedDateRange.dateFrom || appliedDateRange.dateTo
            ? ` (${appliedDateRange.dateFrom || 'początek danych'} – ${appliedDateRange.dateTo || 'najnowsza data danych'})`
            : ` (${days} dni)`}
        </h3>
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
              <thead><tr>
                <SortableTableHeader label="Data" sortKey="date" activeSortKey={trendSortBy} direction={trendSortDirection} onSort={changeTrendSort} />
                <SortableTableHeader label="Przychód" sortKey="revenue" activeSortKey={trendSortBy} direction={trendSortDirection} onSort={changeTrendSort} />
                <SortableTableHeader label="Koszty netto" sortKey="costs" activeSortKey={trendSortBy} direction={trendSortDirection} onSort={changeTrendSort} />
                <SortableTableHeader label="Różnica" sortKey="profit" activeSortKey={trendSortBy} direction={trendSortDirection} onSort={changeTrendSort} />
              </tr></thead>
              <tbody>{sortedTrends.map((trend, index) => (
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
