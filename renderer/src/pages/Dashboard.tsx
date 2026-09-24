import React, { useEffect, useState } from 'react'
import MetricCard from '../components/MetricCard'
import MiniChart from '../components/MiniChart'

export default function Dashboard() {
  const [metrics, setMetrics] = useState<any>(null)
  const [recent, setRecent] = useState<any[]>([])

  async function load() {
    // Try to call metrics API if available; otherwise use placeholders
    try {
      const m = (window as any).allegroMetrics?.getSummary ? await (window as any).allegroMetrics.getSummary() : null
      setMetrics(m || { orders: 0, revenue: 0, balance: 0, trend: [1,2,3,2,4] })
    } catch (err) {
      setMetrics({ orders: 0, revenue: 0, balance: 0, trend: [1,2,3,2,4] })
    }

    try {
      const imps = await (window as any).allegroAPI.database.listImports(10)
      setRecent(imps || [])
    } catch (err) {
      setRecent([])
    }
  }

  useEffect(() => { load() }, [])

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard title="Zamówienia" value={metrics ? metrics.orders : '...'} subtitle="Liczba zamówień">
          <MiniChart data={(metrics && metrics.trend) || [1,2,3]} />
        </MetricCard>
        <MetricCard title="Przychód" value={metrics ? `${metrics.revenue} PLN` : '...'} subtitle="Suma przychodów">
          <MiniChart data={(metrics && metrics.trend) || [1,2,3]} />
        </MetricCard>
        <MetricCard title="Saldo" value={metrics ? `${metrics.balance} PLN` : '...'} subtitle="Bieżące saldo">
          <MiniChart data={(metrics && metrics.trend) || [1,2,3]} />
        </MetricCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="p-4 bg-white dark:bg-gray-800 rounded shadow">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Najnowsze importy</h3>
            <button onClick={load} className="text-sm text-blue-600">Odśwież</button>
          </div>
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

        <div className="p-4 bg-white dark:bg-gray-800 rounded shadow">
          <h3 className="font-semibold">Szybkie akcje</h3>
          <div className="mt-3 space-y-2">
            <button className="w-full text-left px-3 py-2 bg-blue-600 text-white rounded">Nowy import</button>
            <button className="w-full text-left px-3 py-2 bg-gray-200 dark:bg-gray-700 rounded">Eksport raportu</button>
          </div>
        </div>
      </div>
    </div>
  )
}
