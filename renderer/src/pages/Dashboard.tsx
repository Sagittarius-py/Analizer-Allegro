import React, { useEffect, useState } from 'react'
import MetricCard from '../components/MetricCard'
import MiniChart from '../components/MiniChart'
import { CostCategoryChart, OrderStatusDonut, TrendAnalysisChart } from '../components/AnalysisCharts'

export default function Dashboard({ onNavigate }: { onNavigate: (page: string) => void }) {
  const [metrics, setMetrics] = useState<any>(null)
  const [recent, setRecent] = useState<any[]>([])
  const [trends, setTrends] = useState<any[]>([])
  const [costs, setCosts] = useState<any[]>([])
  const [sourceSummary, setSourceSummary] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const [summary, imports, trendData, costData, sourceData] = await Promise.all([
        (window as any).allegroMetrics?.getSummary ? (window as any).allegroMetrics.getSummary() : Promise.resolve(null),
        (window as any).allegroAPI?.database?.listImports ? (window as any).allegroAPI.database.listImports(10) : Promise.resolve([]),
        (window as any).allegroAPI?.trends?.data ? (window as any).allegroAPI.trends.data(30) : Promise.resolve([]),
        (window as any).allegroAPI?.costs?.breakdown ? (window as any).allegroAPI.costs.breakdown() : Promise.resolve([]),
        (window as any).allegroAPI?.analytics?.sourceSummary ? (window as any).allegroAPI.analytics.sourceSummary() : Promise.resolve(null)
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

  useEffect(() => { load() }, [])

  return (
    <div className="space-y-6">
      <div className="dashboard-hero">
        <div>
          <div className="eyebrow">CENTRUM SPRZEDAŻY</div>
          <h2 className="section-title">Wyniki w skrócie</h2>
          <p className="mt-1 text-sm text-gray-500">Podsumowanie danych zapisanych lokalnie na tym urządzeniu.</p>
        </div>
        <button onClick={load} disabled={loading} className="secondary-action px-3 py-2">{loading ? 'Odświeżam…' : 'Odśwież dane'}</button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard title="Zamówienia" value={metrics ? metrics.orders : '...'} subtitle="Liczba zamówień">
          <div className="chart-frame"><MiniChart data={trends.map((point) => point.revenue)} /></div>
        </MetricCard>
        <MetricCard title="Przychód" value={metrics ? `${metrics.revenue} PLN` : '...'} subtitle="Suma przychodów">
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
              <div className="eyebrow">OSTATNIE 30 DNI</div>
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
          <div className="eyebrow">BILLING</div>
          <h3 className="font-semibold">Największe kategorie kosztów</h3>
          <CostCategoryChart data={costs} />
          {sourceSummary?.billing?.dateFrom ? <p className="mt-4 text-xs text-gray-500">Okres billing: {sourceSummary.billing.dateFrom} – {sourceSummary.billing.dateTo}</p> : null}
        </section>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="panel p-4">
          <div className="flex items-center justify-between"><h3 className="font-semibold">Najnowsze importy</h3></div>
          <ul className="mt-3 space-y-2">
            {recent.length === 0 && <li className="text-sm text-gray-500">Brak importów</li>}
            {recent.map((r: any) => (
              <li key={r.id} className="p-2 border rounded flex justify-between items-center">
                <div>
                  <div className="font-medium">{r.file_name}</div>
                  <div className="text-xs text-gray-500">{r.file_type} • {r.row_count} wierszy • {new Date(r.imported_at).toLocaleString()}</div>
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
