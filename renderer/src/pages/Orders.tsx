import React, { useEffect, useState } from 'react'

export default function OrdersPage() {
  const [orders, setOrders] = useState<any[]>([])
  const [q, setQ] = useState('')
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<any>(null)

  async function load() {
    const opts = { limit: 50, offset: page * 50, q: q || null }
    try {
      const res = await (window as any).allegroAPI.database.orders.list(opts)
      setOrders(res || [])
    } catch (err) { setOrders([]) }
  }

  useEffect(() => { load() }, [page])

  async function openDetails(orderId) {
    try {
      const d = await (window as any).allegroAPI.database.orders.get(orderId)
      setSelected(d)
    } catch (err) { console.error(err) }
  }

  return (
    <div className="p-4 bg-white dark:bg-gray-800 rounded shadow">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Zamówienia</h2>
        <div className="flex items-center gap-2">
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Szukaj" className="p-2 border rounded" />
          <button onClick={() => { setPage(0); load(); }} className="px-3 py-2 bg-blue-600 text-white rounded">Szukaj</button>
        </div>
      </div>

      <div className="mt-4">
        <table className="w-full table-auto">
          <thead>
            <tr className="text-left text-sm text-gray-500">
              <th className="p-2">ID</th>
              <th className="p-2">Data</th>
              <th className="p-2">Kwota</th>
              <th className="p-2">Status</th>
              <th className="p-2">Akcje</th>
            </tr>
          </thead>
          <tbody>
            {orders.map(o => (
              <tr key={o.order_id} className="border-t">
                <td className="p-2 text-sm">{o.order_id}</td>
                <td className="p-2 text-sm">{new Date(o.order_date).toLocaleString()}</td>
                <td className="p-2 text-sm">{o.payment_amount} {o.payment_currency}</td>
                <td className="p-2 text-sm">{o.seller_status}</td>
                <td className="p-2 text-sm"><button onClick={() => openDetails(o.order_id)} className="px-2 py-1 bg-gray-200 rounded">Szczegóły</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div className="text-sm text-gray-500">Strona: {page + 1}</div>
        <div className="space-x-2">
          <button onClick={() => setPage(p => Math.max(0, p - 1))} className="px-3 py-1 bg-gray-200 rounded">Poprzednia</button>
          <button onClick={() => setPage(p => p + 1)} className="px-3 py-1 bg-gray-200 rounded">Następna</button>
        </div>
      </div>

      {selected ? (
        <div className="mt-4 p-3 border rounded bg-gray-50">
          <h3 className="font-semibold">Szczegóły zamówienia {selected.order && selected.order.order_id}</h3>
          <pre className="text-xs mt-2 overflow-auto max-h-64">{JSON.stringify(selected, null, 2)}</pre>
          <div className="mt-2"><button onClick={() => setSelected(null)} className="px-3 py-1 bg-gray-300 rounded">Zamknij</button></div>
        </div>
      ) : null}
    </div>
  )
}
