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
              <th className="p-2">Kwota po opłatach</th>
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
                  <td className="p-2 text-sm" title={`Płatność: ${o.payment_amount == null ? '—' : `${Number(o.payment_amount).toFixed(2)} ${o.payment_currency || 'PLN'}`} | Powiązane koszty Allegro: ${Number(o.total_costs || 0).toFixed(2)} PLN`}>
                    <div className="font-medium">{o.amount_after_linked_costs == null ? '—' : `${Number(o.amount_after_linked_costs).toFixed(2)} PLN`}</div>
                    <div className="text-xs text-gray-500">
                      {o.payment_amount == null
                        ? 'Brak kwoty płatności'
                        : o.payment_currency && o.payment_currency !== 'PLN'
                          ? `${Number(o.payment_amount).toFixed(2)} ${o.payment_currency} · opłaty ${Number(o.total_costs || 0).toFixed(2)} PLN`
                          : `Płatność ${Number(o.payment_amount).toFixed(2)} PLN · opłaty ${Number(o.total_costs || 0).toFixed(2)} PLN`}
                    </div>
                  </td>
                  <td className="p-2 text-sm">{o.is_smart_delivery ? <span className="smart-badge" title="Zamówienie z dostawą Allegro Smart!">Smart!</span> : <span className="text-gray-500">Standardowa</span>}</td>
                  <td className="p-2 text-sm"><span className={`status-pill ${o.seller_status === 'CANCELLED' ? 'status-pill-error' : ''}`}>{translateOrderStatus(o.seller_status)}</span></td>
                  <td className="p-2 text-sm"><button aria-expanded={expandedOrderId === o.order_id} onClick={() => toggleDetails(o.order_id)} className="secondary-action px-3 py-1">{expandedOrderId === o.order_id ? 'Ukryj' : 'Szczegóły'}</button></td>
                </tr>
                {expandedOrderId === o.order_id ? <tr><td colSpan={6} className="order-details-cell">
                  <section className="rounded border p-4">
                    <h3 className="font-semibold">Szczegóły zamówienia {o.order_id}</h3>
                    {detailsLoading && !selected ? <p className="mt-3 text-sm text-gray-500">Wczytywanie szczegółów…</p> : null}
                    {selected?.order?.order_id === o.order_id ? <>
                      <div className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
                        <div className="preview-stat"><span>Status</span><strong>{translateOrderStatus(selected.order?.seller_status)}</strong></div>
                        <div className="preview-stat"><span>Kwota</span><strong>{selected.order?.payment_amount == null ? '—' : `${Number(selected.order.payment_amount).toFixed(2)} ${selected.order.payment_currency || 'PLN'}`}</strong></div>
                        <div className="preview-stat"><span>Dostawa</span><strong>{selected.order?.is_smart_delivery ? <span className="smart-badge">Smart!</span> : 'Standardowa / brak danych'}</strong></div>
                        <div className="preview-stat"><span>Operacje rozliczeniowe</span><strong>{selected.billingOperations?.length || 0}</strong></div>
                      </div>
                      {selected.financials ? <div className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
                        <div className="preview-stat"><span>Prowizja (netto z rozliczeń)</span><strong>{selected.financials.commissionCost.toFixed(2)} PLN</strong></div>
                        <div className="preview-stat"><span>Opłaty za dostawę (netto z rozliczeń)</span><strong>{selected.financials.deliveryCost.toFixed(2)} PLN</strong></div>
                        <div className="preview-stat"><span>Przesyłki (numery nadania)</span><strong>{selected.financials.shipments}</strong></div>
                        <div className="preview-stat"><span>Prowizja / kwota płatności</span><strong>{selected.financials.effectiveCommissionPercent == null ? '—' : `${selected.financials.effectiveCommissionPercent.toFixed(2)}%`}</strong></div>
                      </div> : null}
                      {selected.offerSummaries?.length ? <section className="mt-4">
                        <h4 className="font-semibold">Oferty widoczne w rozliczeniach tego zamówienia</h4>
                        <p className="mt-1 text-xs text-gray-500">Zestawienie wynika z operacji Allegro przypisanych do zamówienia. Nie zastępuje listy pozycji sprzedaży — raporty nie zawierają pełnych danych o ilości ani cenie każdej oferty.</p>
                        <div className="table-scroll mt-2 overflow-auto">
                          <table className="w-full min-w-[640px] text-left text-xs">
                            <thead><tr className="text-gray-500">
                              <th className="p-2">Oferta</th><th className="p-2">Prowizja</th><th className="p-2">Dostawa</th><th className="p-2">Inne opłaty</th><th className="p-2">Razem</th>
                            </tr></thead>
                            <tbody>{selected.offerSummaries.map((offer: any) => <tr key={offer.offerId} className="border-t">
                              <td className="p-2"><strong className="block">{offer.offerName}</strong><span className="text-gray-500">ID: {offer.offerId} · {offer.operationCount} operacji</span></td>
                              <td className="p-2">{offer.commissionCost.toFixed(2)} PLN</td>
                              <td className="p-2">{offer.deliveryCost.toFixed(2)} PLN</td>
                              <td className="p-2">{offer.otherCosts.toFixed(2)} PLN</td>
                              <td className="p-2 font-semibold">{offer.totalCosts.toFixed(2)} PLN</td>
                            </tr>)}</tbody>
                          </table>
                        </div>
                      </section> : null}
                      {selected.financials?.smart ? <div className="smart-panel mt-3 rounded border p-3 text-sm">
                        <div className="smart-panel-title"><span className="smart-badge">Smart!</span><span>Opłaty za dostawę Smart! w tym zamówieniu</span>
                          <span className="inline-flex items-center ml-auto cursor-help" title="Cennik konta zwykłego (według pomocy Allegro): 30–44,99 zł → 1,59 zł; 45–64,99 zł → 3,19 zł; 65–99,99 zł → 5,19 zł; 100–149,99 zł → 7,89 zł; od 150 zł → 9,99 zł. Od 150 zł kolejne przesyłki kosztują 7,89 zł. Konto firmowe ma inne warunki, a nie uwzględniono pobrania (+4,99 zł), bo raporty nie podają formy płatności. Zwrot opłaty obejmuje tylko opłatę podstawową, bez usług dodatkowych."><svg className="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" /></svg></span>
                        </div>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                          <div className="preview-stat"><span>Opłata Smart! naliczona</span><strong>{selected.financials.smart.charged.toFixed(2)} PLN</strong></div>
                          <div className="preview-stat"><span>Zwrot opłaty Smart!</span><strong>{selected.financials.smart.refunded.toFixed(2)} PLN</strong></div>
                          <div className="preview-stat"><span>Wg cennika konta zwykłego</span><strong>{selected.financials.smart.expectedStandardAccountFee == null ? 'Brak progu / brak danych' : `${selected.financials.smart.expectedStandardAccountFee.toFixed(2)} PLN`}</strong></div>
                          <div className="preview-stat"><span>Różnica do cennika</span><strong className={selected.financials.smart.differenceToStandardAccount === 0 ? 'smart-diff-ok' : selected.financials.smart.differenceToStandardAccount == null ? '' : 'smart-diff-off'}>{selected.financials.smart.differenceToStandardAccount == null ? '—' : `${selected.financials.smart.differenceToStandardAccount.toFixed(2)} PLN`}</strong></div>
                        </div>
                      </div> : null}
                      {selected.billingOperations?.length ? <ul className="mt-3 divide-y divide-gray-700">{selected.billingOperations.map((operation: any) => <li key={operation.id} className="flex flex-wrap justify-between gap-2 py-2 text-sm"><span className="flex items-center gap-2">{operation.operation_type}{operation.is_smart_delivery ? <span className="smart-badge">Smart!</span> : null}</span><span>{(Number(operation.credit || 0) + Number(operation.debit || 0)).toFixed(2)} PLN</span></li>)}</ul> : <p className="mt-3 text-sm text-gray-500">Brak powiązanych operacji rozliczeniowych.</p>}
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
