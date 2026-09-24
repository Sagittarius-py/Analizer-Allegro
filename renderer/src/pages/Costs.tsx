import React, { useEffect, useState } from 'react'
import MiniChart from '../components/MiniChart'

export default function CostsPage() {
  const [costsBreakdown, setCostsBreakdown] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [trends, setTrends] = useState<any[]>([])
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
  }

  useEffect(() => { load() }, [days])

  const totalCosts = costsBreakdown.reduce((s, c) => s + (c.cost || 0), 0)
  const totalRevenue = products.reduce((s, p) => s + (p.totalRevenue || 0), 0)
  const trendRevenue = trends.map(t => t.revenue)
  const trendCosts = trends.map(t => t.costs)

  return (
    <div className="space-y-6 p-4">
      <div>
        <h2 className="text-lg font-semibold">Koszty i produkty</h2>
        <div className="flex gap-2 mt-2">
          <input type="number" value={days} onChange={e => setDays(parseInt(e.target.value) || 30)} className="p-2 border rounded w-20" />
          <span className="text-sm text-gray-600">dni</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="p-4 bg-white dark:bg-gray-800 rounded shadow">
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

        <div className="p-4 bg-white dark:bg-gray-800 rounded shadow">
          <h3 className="font-semibold">Top produkty</h3>
          <div className="mt-3 text-sm">
            <div className="font-medium">Przychód: {totalRevenue} PLN</div>
          </div>
          <ul className="mt-2 space-y-2 max-h-64 overflow-y-auto">
            {products.slice(0, 10).map((p, i) => (
              <li key={i} className="border rounded p-1 text-xs">
                <div className="font-medium">{p.productName}</div>
                <div className="text-gray-600">
                  Przychód: {p.totalRevenue} PLN | Marża: {p.margin}% | Zamówienia: {p.orderCount}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="p-4 bg-white dark:bg-gray-800 rounded shadow">
        <h3 className="font-semibold">Trend przychodu i kosztów ({days} dni)</h3>
        <div className="mt-3 grid grid-cols-2 gap-4">
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
          {trends.map((t, i) => (
            <div key={i} className="flex justify-between text-gray-600">
              <div>{t.date}</div>
              <div>Przychód: {t.revenue} | Koszty: {t.costs} | Zysk: {t.profit}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
