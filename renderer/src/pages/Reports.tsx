import React, { useEffect, useState } from 'react'
import { formatLocalDate } from '../utils/localization'

export default function ReportsPage() {
  const [reports, setReports] = useState<any[]>([])
  const [reportName, setReportName] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [appliedDateRange, setAppliedDateRange] = useState({ dateFrom: '', dateTo: '' })
  const [saving, setSaving] = useState(false)
  const [selected, setSelected] = useState<any>(null)
  const [expandedReportId, setExpandedReportId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function load(dateRange = appliedDateRange) {
    try {
      const res = await (window as any).allegroAPI.reports.list({
        limit: 50,
        dateFrom: dateRange.dateFrom || null,
        dateTo: dateRange.dateTo || null
      })
      if (!Array.isArray(res)) throw new Error(res?.error || 'Nie udało się pobrać zapisanych raportów.')
      setReports(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udało się pobrać zapisanych raportów.')
    }
  }

  useEffect(() => { load() }, [])

  function filterReports() {
    if (filterDateFrom && filterDateTo && filterDateFrom > filterDateTo) {
      setError('Data początkowa nie może być późniejsza niż końcowa.')
      return
    }
    setError(null)
    const dateRange = { dateFrom: filterDateFrom, dateTo: filterDateTo }
    setAppliedDateRange(dateRange)
    load(dateRange)
  }

  function clearReportFilters() {
    setFilterDateFrom('')
    setFilterDateTo('')
    setAppliedDateRange({ dateFrom: '', dateTo: '' })
    setError(null)
    load({ dateFrom: '', dateTo: '' })
  }

  async function saveReport() {
    if (!reportName.trim() || !dateFrom || !dateTo) {
      setError('Uzupełnij nazwę raportu i oba końce zakresu dat.')
      setNotice(null)
      return
    }
    if (dateFrom > dateTo) {
      setError('Data początkowa nie może być późniejsza niż końcowa.')
      setNotice(null)
      return
    }
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      const options = { dateFrom, dateTo }
      const [metrics, costs, sourceSummary, trends] = await Promise.all([
        (window as any).allegroMetrics.getSummary(options),
        (window as any).allegroAPI.costs.breakdown(options),
        (window as any).allegroAPI.analytics.sourceSummary(options),
        (window as any).allegroAPI.trends.data(options)
      ])
      const failedResult = [metrics, costs, sourceSummary, trends].find((result) => result?.error)
      if (failedResult) throw new Error(failedResult.error)
      const snapshot = {
        version: 1,
        generatedAt: new Date().toISOString(),
        metrics,
        costs,
        sourceSummary,
        trends
      }
      const result = await (window as any).allegroAPI.reports.save(reportName.trim(), dateFrom, dateTo, snapshot)
      if (!result?.ok) throw new Error(result?.error || 'Nie udało się zapisać raportu.')
      setReportName('')
      setDateFrom('')
      setDateTo('')
      setNotice('Raport okresowy został zapisany.')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udało się zapisać raportu.')
    }
    finally { setSaving(false) }
  }

  async function deleteReport(id: number) {
    if (!window.confirm('Usunąć raport?')) return
    try {
      await (window as any).allegroAPI.reports.delete(id)
      if (selected?.id === id) setSelected(null)
      if (expandedReportId === id) setExpandedReportId(null)
      await load()
    } catch (err) { setError(err instanceof Error ? err.message : 'Nie udało się usunąć raportu.') }
  }

  async function viewReport(id: number) {
    try {
      const r = await (window as any).allegroAPI.reports.get(id)
      setSelected(r)
      setExpandedReportId(id)
    } catch (err) { setError(err instanceof Error ? err.message : 'Nie udało się otworzyć raportu.') }
  }

  async function togglePin(id: number, pinned: boolean) {
    try {
      await (window as any).allegroAPI.reports.pin(id, !pinned)
      await load()
    } catch (err) { setError(err instanceof Error ? err.message : 'Nie udało się zmienić przypięcia raportu.') }
  }

  async function exportReport(id: number) {
    setError(null)
    setNotice(null)
    try {
      const result = await (window as any).allegroAPI.reports.exportCsv(id)
      if (result?.canceled) return
      if (!result?.ok) throw new Error(result?.error || 'Nie udało się wyeksportować raportu.')
      setNotice(`Eksport zapisano: ${result.path}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udało się wyeksportować raportu.')
    }
  }

  return (
    <div className="space-y-4 p-4">
      <div><div className="eyebrow">ZAPISANE PODSUMOWANIA</div><h2 className="section-title">Raporty</h2></div>

      <div className="panel p-4 sm:p-5">
        <h3 className="font-medium mb-3">Zapisz nowy raport</h3>
        <p className="mb-3 text-sm text-gray-500">Raport zapisuje migawkę danych wyłącznie z wybranego okresu. Przychody i koszty spoza PLN nie są dodawane do wartości PLN.</p>
        <div className="grid grid-cols-1 gap-3">
          <input
            value={reportName}
            onChange={e => setReportName(e.target.value)}
            placeholder="Nazwa raportu"
            className="p-2 border rounded"
          />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="p-2 border rounded"
            />
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="p-2 border rounded"
            />
          </div>
          <button
            onClick={saveReport}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded"
          >
            {saving ? 'Zapisuję...' : 'Zapisz raport'}
          </button>
        </div>
        {error ? <div role="alert" className="mt-3 text-sm text-red-500">{error}</div> : null}
        {notice ? <div role="status" className="mt-3 text-sm text-green-600">{notice}</div> : null}
      </div>

      <div className="panel p-4 sm:p-5">
        <h3 className="font-medium mb-3">Zapisane raporty</h3>
        <form className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto_auto]" onSubmit={event => { event.preventDefault(); filterReports() }}>
          <label className="text-sm">
            Okres od
            <input type="date" value={filterDateFrom} onChange={event => setFilterDateFrom(event.target.value)} className="mt-1 block w-full rounded border p-2" />
          </label>
          <label className="text-sm">
            Okres do
            <input type="date" value={filterDateTo} onChange={event => setFilterDateTo(event.target.value)} className="mt-1 block w-full rounded border p-2" />
          </label>
          <button type="submit" className="secondary-action self-end px-3 py-2">Filtruj</button>
          <button type="button" onClick={clearReportFilters} className="secondary-action self-end px-3 py-2">Wyczyść</button>
        </form>
        <ul className="space-y-2">
          {reports.length === 0 && <li className="text-sm text-gray-500">Brak raportów dla wybranego okresu.</li>}
          {reports.map((r: any) => (
            <li key={r.id} className="report-row p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                <div className="font-medium">
                  {r.is_pinned ? '📌 ' : ''}{r.name}
                </div>
                <div className="text-xs text-gray-600">
                  {r.date_from} → {r.date_to} | {formatLocalDate(r.created_at)}
                </div>
                </div>
                <button type="button" aria-expanded={expandedReportId === r.id} onClick={() => setExpandedReportId((current) => current === r.id ? null : r.id)} className="secondary-action px-3 py-1 text-xs">{expandedReportId === r.id ? 'Ukryj opcje' : 'Opcje raportu'}</button>
              </div>
              {expandedReportId === r.id ? <div className="mt-3 border-t pt-3">
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => togglePin(r.id, r.is_pinned)} className="px-3 py-1 text-xs bg-yellow-200 rounded">{r.is_pinned ? 'Odepnij' : 'Przypnij'}</button>
                  <button onClick={() => selected?.id === r.id ? setSelected(null) : viewReport(r.id)} className="px-3 py-1 text-xs bg-blue-400 rounded">{selected?.id === r.id ? 'Zamknij podgląd' : 'Podgląd'}</button>
                  <button onClick={() => exportReport(r.id)} className="secondary-action px-3 py-1 text-xs">Eksport CSV</button>
                  <button onClick={() => deleteReport(r.id)} className="px-3 py-1 text-xs bg-red-400 rounded">Usuń</button>
                </div>
                {selected?.id === r.id ? <div className="mt-3 text-sm">
                  <h4 className="font-medium">Raport: {selected.name}</h4>
                  <div className="mt-2">Okres: {selected.date_from} → {selected.date_to}</div>
                  {selected.metrics_snapshot?.metrics ? (() => {
                    const snapshot = selected.metrics_snapshot
                    const metrics = snapshot.metrics
                    const totalCosts = (snapshot.costs || []).reduce((sum: number, item: any) => sum + Number(item.cost || 0), 0)
                    const difference = Number(metrics.revenue || 0) - totalCosts
                    const otherCurrencies = Object.entries(metrics.revenueByCurrency || {})
                      .filter(([currency, value]) => currency !== 'PLN' && Number(value) !== 0)
                      .map(([currency, value]) => `${Number(value).toFixed(2)} ${currency}`)
                      .join(' · ')
                    return <>
                      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                        <div className="preview-stat"><span>Zamówienia</span><strong>{metrics.orders}</strong></div>
                        <div className="preview-stat"><span>Przychód w PLN</span><strong>{Number(metrics.revenue || 0).toFixed(2)} PLN</strong></div>
                        <div className="preview-stat"><span>Koszty Allegro</span><strong>{totalCosts.toFixed(2)} PLN</strong></div>
                        <div className="preview-stat"><span>Różnica orientacyjna</span><strong>{difference.toFixed(2)} PLN</strong></div>
                      </div>
                      <p className="mt-2 text-xs text-gray-500">Różnica nie uwzględnia kosztu zakupu produktów, podatku ani innych niezaimportowanych kosztów. Saldo Allegro: {Number(metrics.balance || 0).toFixed(2)} PLN.</p>
                      {otherCurrencies ? <p className="mt-1 text-xs text-gray-500">Przychody w innych walutach (bez przeliczenia): {otherCurrencies}</p> : null}
                      <h5 className="mt-4 font-medium">Koszty wg kategorii</h5>
                      {snapshot.costs?.length ? <ul className="mt-2 space-y-1">
                        {snapshot.costs.map((cost: any) => <li key={cost.category} className="flex justify-between gap-3 text-sm"><span>{cost.category}</span><span>{Number(cost.cost).toFixed(2)} PLN · {cost.count} operacji</span></li>)}
                      </ul> : <p className="mt-2 text-sm text-gray-500">Brak kosztów w tym okresie.</p>}
                    </>
                  })() : <div className="mt-2 rounded bg-gray-100 p-3 text-sm text-gray-500">Ten zapis pochodzi ze starszej wersji aplikacji i zawiera tylko migawkę podstawowych metryk.</div>}
                </div> : null}
              </div> : null}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
