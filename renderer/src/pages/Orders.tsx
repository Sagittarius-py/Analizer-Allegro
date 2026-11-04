import React, { useEffect, useState } from 'react'
import { formatLocalDate, translateOrderStatus } from '../utils/localization'

export default function OrdersPage() {
  const [orders, setOrders] = useState<any[]>([])
  const [q, setQ] = useState('')
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<any>(null)
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [loading, setLoading] = useState(false)

  async function load() {
    const opts = { limit: 50, offset: page * 50, q: q || null }
    setLoading(true)
    try {
      const res = await (window as any).allegroAPI.database.orders.list(opts)
      setOrders(res || [])
    } catch (err) { setOrders([]) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [page])

  async function toggleDetails(orderId: string) {
    if (expandedOrderId === orderId) {
      setExpandedOrderId(null)
      setSelected(null)
      return
    }
    setExpandedOrderId(orderId)
    setSelected(null)
    setDetailsLoading(true)
    try {
      const d = await (window as any).allegroAPI.database.orders.get(orderId)
      setSelected(d)
    } catch (err) { console.error(err) }
    finally { setDetailsLoading(false) }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><div className="eyebrow">SPRZEDAŻ</div><h2 className="section-title">Zamówienia</h2></div>
        <form className="flex w-full gap-2 sm:w-auto" onSubmit={event => { event.preventDefault(); setPage(0); load() }}>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Szukaj po ID lub rynku" aria-label="Szukaj zamówień" className="min-w-0 flex-1 p-2 sm:w-72" />
          <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded">Szukaj</button>
        </form>
      </div>

      <div className="panel overflow-hidden">
        <div className="table-scroll overflow-auto">
        <table className="w-full min-w-[720px] table-auto">
          <thead>
            <tr className="text-left text-sm text-gray-500">
              <th className="p-2">ID</th>
              <th className="p-2">Data</th>
              <th className="p-2">Kwota</th>
              <th className="p-2">Dostawa</th>
              <th className="p-2">Status</th>
              <th className="p-2">Akcje</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="table-empty">Ładowanie zamówień…</td></tr>}
            {!loading && orders.length === 0 && <tr><td colSpan={6} className="table-empty">Brak zamówień. Zaimportuj raport zamówień lub zmień kryteria wyszukiwania.</td></tr>}
            {orders.map(o => (
              <React.Fragment key={o.order_id}>
                <tr className="border-t">
                  <td className="p-2 text-sm">{o.order_id}</td>
                  <td className="p-2 text-sm">{formatLocalDate(o.order_date)}</td>
                  <td className="p-2 text-sm">{o.payment_amount == null ? '—' : `${Number(o.payment_amount).toFixed(2)} ${o.payment_currency || 'PLN'}`}</td>
                  <td className="p-2 text-sm">{o.is_smart_delivery ? <span className="status-pill status-pill-success">SMART</span> : '—'}</td>
                  <td className="p-2 text-sm"><span className={`status-pill ${o.seller_status === 'CANCELLED' ? 'status-pill-error' : ''}`}>{translateOrderStatus(o.seller_status)}</span></td>
                  <td className="p-2 text-sm"><button aria-expanded={expandedOrderId === o.order_id} onClick={() => toggleDetails(o.order_id)} className="secondary-action px-3 py-1">{expandedOrderId === o.order_id ? 'Ukryj' : 'Szczegóły'}</button></td>
                </tr>
                {expandedOrderId === o.order_id ? <tr><td colSpan={6} className="p-3">
                  <section className="rounded border p-4">
                    <h3 className="font-semibold">Szczegóły zamówienia {o.order_id}</h3>
                    {detailsLoading && !selected ? <p className="mt-3 text-sm text-gray-500">Wczytywanie szczegółów…</p> : null}
                    {selected?.order?.order_id === o.order_id ? <>
                      <div className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
                        <div className="preview-stat"><span>Status</span><strong>{translateOrderStatus(selected.order?.seller_status)}</strong></div>
                        <div className="preview-stat"><span>Kwota</span><strong>{selected.order?.payment_amount == null ? '—' : `${Number(selected.order.payment_amount).toFixed(2)} ${selected.order.payment_currency || 'PLN'}`}</strong></div>
                        <div className="preview-stat"><span>Dostawa</span><strong>{selected.order?.is_smart_delivery ? 'SMART' : 'Standardowa / brak danych'}</strong></div>
                        <div className="preview-stat"><span>Operacje rozliczeniowe</span><strong>{selected.billingOperations?.length || 0}</strong></div>
                      </div>
                      {selected.financials ? <div className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
                        <div className="preview-stat"><span>Prowizja (netto z rozliczeń)</span><strong>{selected.financials.commissionCost.toFixed(2)} PLN</strong></div>
                        <div className="preview-stat"><span>Opłaty za dostawę (netto z rozliczeń)</span><strong>{selected.financials.deliveryCost.toFixed(2)} PLN</strong></div>
                        <div className="preview-stat"><span>Przesyłki (numery nadania)</span><strong>{selected.financials.shipments}</strong></div>
                        <div className="preview-stat"><span>Prowizja / kwota płatności</span><strong>{selected.financials.effectiveCommissionPercent == null ? '—' : `${selected.financials.effectiveCommissionPercent.toFixed(2)}%`}</strong></div>
                      </div> : null}
                      {selected.billingOperations?.length ? <ul className="mt-3 divide-y divide-gray-700">{selected.billingOperations.map((operation: any) => <li key={operation.id} className="flex flex-wrap justify-between gap-2 py-2 text-sm"><span className="flex items-center gap-2">{operation.operation_type}{operation.is_smart_delivery ? <span className="status-pill status-pill-success">SMART</span> : null}</span><span>{(Number(operation.credit || 0) + Number(operation.debit || 0)).toFixed(2)} PLN</span></li>)}</ul> : <p className="mt-3 text-sm text-gray-500">Brak powiązanych operacji rozliczeniowych.</p>}
                    </> : null}
                  </section>
                </td></tr> : null}
              </React.Fragment>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div className="text-sm text-gray-500">{orders.length} wyników · strona {page + 1}</div>
        <div className="space-x-2">
          <button disabled={page === 0 || loading} onClick={() => setPage(p => Math.max(0, p - 1))} className="secondary-action px-3 py-1">Poprzednia</button>
          <button disabled={orders.length < 50 || loading} onClick={() => setPage(p => p + 1)} className="secondary-action px-3 py-1">Następna</button>
        </div>
      </div>

    </div>
  )
}
