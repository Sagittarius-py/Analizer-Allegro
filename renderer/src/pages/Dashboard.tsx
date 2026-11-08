import React, { useEffect, useState } from 'react'
import MetricCard from '../components/MetricCard'
import MiniChart from '../components/MiniChart'
import { CostCategoryChart, OrderStatusDonut, TrendAnalysisChart } from '../components/AnalysisCharts'
import { formatLocalDate, translateReportType } from '../utils/localization'

export default function Dashboard({ onNavigate }: { onNavigate: (page: string) => void }) {
  const [periodDays, setPeriodDays] = useState<number | null>(30)
  const [metrics, setMetrics] = useState<any>(null)
  const [recent, setRecent] = useState<any[]>([])
  const [trends, setTrends] = useState<any[]>([])
  const [costs, setCosts] = useState<any[]>([])
  const [sourceSummary, setSourceSummary] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  async function load(days = periodDays) {
    setLoading(true)
    try {
      const options = days == null ? {} : { days }
      const [summary, imports, trendData, costData, sourceData] = await Promise.all([
        (window as any).allegroMetrics?.getSummary ? (window as any).allegroMetrics.getSummary(options) : Promise.resolve(null),
        (window as any).allegroAPI?.database?.listImports ? (window as any).allegroAPI.database.listImports(10) : Promise.resolve([]),
        (window as any).allegroAPI?.trends?.data ? (window as any).allegroAPI.trends.data(options) : Promise.resolve([]),
        (window as any).allegroAPI?.costs?.breakdown ? (window as any).allegroAPI.costs.breakdown(options) : Promise.resolve([]),
        (window as any).allegroAPI?.analytics?.sourceSummary ? (window as any).allegroAPI.analytics.sourceSummary(options) : Promise.resolve(null)
      ])
      setMetrics(summary && !summary.error ? summary : { orders: 0, revenue: 0, balance: 0, trend: [] })
      setRecent(Array.isArray(imports) ? imports : [])
      setTrends(Array.isArray(trendData) ? trendData : [])
      setCosts(Array.isArray(costData) ? costData : [])
      setSourceSummary(sourceData && !sourceData.error ? sourceData : null)
    } catch (err) {
      setMetrics({ orders: 0, revenue: 0, balance: 0, trend: [] })
      setRecent([])
      setTrends([])
      setCosts([])
      setSourceSummary(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load(periodDays) }, [periodDays])

  const otherCurrencies = Object.entries(metrics?.revenueByCurrency || {})
    .filter(([currency, value]) => currency !== 'PLN' && Number(value) !== 0)
    .map(([currency, value]) => `${Number(value).toFixed(2)} ${currency === 'N/A' ? 'nieznana waluta' : currency}`)
    .join(' · ')

  return (
    <div className="space-y-6">
      <div className="dashboard-hero">
        <div>
          <div className="eyebrow">CENTRUM SPRZEDAŻY</div>
          <h2 className="section-title">Wyniki w skrócie</h2>
          <p className="mt-1 text-sm text-gray-500">Okres jest liczony wstecz od najnowszej daty danych. Przychody i koszty są porównywane w PLN; inne waluty nie są przeliczane.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm text-gray-500">Okres
            <select value={periodDays ?? 'all'} onChange={(event) => setPeriodDays(event.target.value === 'all' ? null : Number(event.target.value))} className="ml-2 rounded border p-2">
              <option value="30">30 dni danych</option>
              <option value="90">90 dni danych</option>
              <option value="365">365 dni danych</option>
              <option value="all">Cały okres</option>
            </select>
          </label>
          <button onClick={() => load(periodDays)} disabled={loading} className="secondary-action px-3 py-2">{loading ? 'Odświeżam…' : 'Odśwież dane'}</button>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard title="Zamówienia" value={metrics ? metrics.orders : '...'} subtitle="Liczba zamówień">
          <div className="chart-frame"><MiniChart data={trends.map((point) => point.revenue)} /></div>
        </MetricCard>
        <MetricCard title="Przychód w PLN" value={metrics ? `${Number(metrics.revenue || 0).toFixed(2)} PLN` : '...'} subtitle={otherCurrencies ? `Pozostałe waluty: ${otherCurrencies}` : 'Zamówienia bez anulowanych'}>
          <div className="chart-frame"><MiniChart data={trends.map((point) => point.revenue)} /></div>
        </MetricCard>
        <MetricCard title="Saldo" value={metrics ? `${metrics.balance} PLN` : '...'} subtitle="Bieżące saldo">
          <div className="chart-frame"><MiniChart data={trends.map((point) => point.profit)} /></div>
        </MetricCard>
      </div>

      <div className="dashboard-chart-grid">
        <section className="panel dashboard-trend-panel p-4 sm:p-5">
          <div className="chart-panel-heading">
            <div>
              <div className="eyebrow">{periodDays == null ? 'CAŁY OKRES' : `OSTATNIE ${periodDays} DNI DANYCH`}</div>
              <h3 className="font-semibold">Przychód i koszty w czasie</h3>
            </div>
            {trends.length ? <span className="status-pill">{trends.length} dni z danymi</span> : null}
          </div>
          {trends.length ? <TrendAnalysisChart data={trends} /> : (
            <div className="chart-empty dashboard-chart-empty">
              <div>
                <div className="upload-mark mx-auto" aria-hidden="true">↗</div>
                <div className="mt-3 text-sm text-gray-500">Trend pojawi się po imporcie danych.</div>
                <button onClick={() => onNavigate('import')} className="mt-3 px-3 py-2 bg-blue-600 text-white rounded">Importuj raport</button>
              </div>
            </div>
          )}
          {trends.length ? <div className="chart-insight">
            <span>Bilans widocznego okresu</span>
            <strong>{trends.reduce((sum, point) => sum + point.profit, 0).toFixed(2)} PLN</strong>
          </div> : null}
        </section>

        <section className="panel p-4 sm:p-5">
          <div className="eyebrow">STRUKTURA ZAMÓWIEŃ</div>
          <h3 className="font-semibold">Status realizacji</h3>
          <OrderStatusDonut
            active={sourceSummary?.orders?.active || 0}
            cancelled={sourceSummary?.orders?.cancelled || 0}
          />
        </section>

        <section className="panel p-4 sm:p-5">
          <div className="eyebrow">ROZLICZENIA</div>
          <h3 className="font-semibold">Największe kategorie kosztów</h3>
          <CostCategoryChart data={costs} />
          {sourceSummary?.billing?.dateFrom ? <p className="mt-4 text-xs text-gray-500">Okres rozliczeń: {sourceSummary.billing.dateFrom} – {sourceSummary.billing.dateTo}</p> : null}
        </section>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="panel p-4">
          <div className="flex items-center justify-between"><h3 className="font-semibold">Najnowsze importy</h3></div>
          <ul className="mt-3 space-y-2">
            {recent.length === 0 && <li className="text-sm text-gray-500">Nie zaimportowano jeszcze żadnych raportów.</li>}
            {recent.map((r: any) => (
              <li key={r.id} className="p-2 border rounded flex justify-between items-center">
                <div>
                  <div className="font-medium">{r.file_name}</div>
                  <div className="text-xs text-gray-500">{translateReportType(r.file_type)} • {r.row_count} wierszy • {formatLocalDate(r.imported_at)}</div>
                </div>
                <div className="text-sm text-gray-600">{r.date_range_from || '-'} → {r.date_range_to || '-'}</div>
              </li>
            ))}
          </ul>
        </div>

        <div className="panel p-4">
          <h3 className="font-semibold">Szybkie akcje</h3>
          <div className="mt-3 space-y-2">
            <button onClick={() => onNavigate('import')} className="w-full text-left px-3 py-2 bg-blue-600 text-white rounded">Importuj raport</button>
            <button onClick={() => onNavigate('reports')} className="w-full text-left px-3 py-2 bg-gray-200 dark:bg-gray-700 rounded">Zobacz raporty</button>
          </div>
        </div>
      </div>
    </div>
  )
}
