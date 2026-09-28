import React, { useEffect, useState } from 'react'

export default function ReportsPage() {
  const [reports, setReports] = useState<any[]>([])
  const [reportName, setReportName] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [saving, setSaving] = useState(false)
  const [selected, setSelected] = useState<any>(null)

  async function load() {
    try {
      const res = await (window as any).allegroAPI.reports.list(50)
      setReports(res || [])
    } catch (err) { setReports([]) }
  }

  useEffect(() => { load() }, [])

  async function saveReport() {
    if (!reportName.trim() || !dateFrom || !dateTo) {
      alert('Uzupełnij wszystkie pola')
      return
    }
    setSaving(true)
    try {
      // get current metrics
      const metrics = await (window as any).allegroMetrics.getSummary()
      const res = await (window as any).allegroAPI.reports.save(reportName, dateFrom, dateTo, metrics)
      if (res && res.ok) {
        setReportName('')
        setDateFrom('')
        setDateTo('')
        await load()
      }
    } catch (err) { console.error(err) }
    finally { setSaving(false) }
  }

  async function deleteReport(id) {
    if (!window.confirm('Usunąć raport?')) return
    try {
      await (window as any).allegroAPI.reports.delete(id)
      await load()
    } catch (err) { console.error(err) }
  }

  async function viewReport(id) {
    try {
      const r = await (window as any).allegroAPI.reports.get(id)
      setSelected(r)
    } catch (err) { console.error(err) }
  }

  async function togglePin(id, pinned) {
    try {
      await (window as any).allegroAPI.reports.pin(id, !pinned)
      await load()
    } catch (err) { console.error(err) }
  }

  return (
    <div className="space-y-4 p-4">
      <div><div className="eyebrow">ZAPISANE MIGAWKI</div><h2 className="section-title">Raporty</h2></div>

      <div className="panel p-4 sm:p-5">
        <h3 className="font-medium mb-3">Zapisz nowy raport</h3>
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
      </div>

      <div className="panel p-4 sm:p-5">
        <h3 className="font-medium mb-3">Zapisane raporty</h3>
        <ul className="space-y-2">
          {reports.length === 0 && <li className="text-sm text-gray-500">Brak raportów</li>}
          {reports.map((r: any) => (
            <li key={r.id} className="report-row flex flex-wrap items-center justify-between gap-3 p-3">
              <div>
                <div className="font-medium">
                  {r.is_pinned ? '📌 ' : ''}{r.name}
                </div>
                <div className="text-xs text-gray-600">
                  {r.date_from} → {r.date_to} | {new Date(r.created_at).toLocaleString()}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => togglePin(r.id, r.is_pinned)}
                  className="px-3 py-1 text-xs bg-yellow-200 rounded"
                >
                  {r.is_pinned ? 'Odepnij' : 'Przypnij'}
                </button>
                <button
                  onClick={() => viewReport(r.id)}
                  className="px-3 py-1 text-xs bg-blue-400 rounded"
                >
                  Podgląd
                </button>
                <button
                  onClick={() => deleteReport(r.id)}
                  className="px-3 py-1 text-xs bg-red-400 rounded"
                >
                  Usuń
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {selected ? (
        <div className="panel p-4 sm:p-5">
          <h3 className="font-medium">Raport: {selected.name}</h3>
          <div className="mt-3 text-sm">
            <div>Okres: {selected.date_from} → {selected.date_to}</div>
            <div className="mt-2 text-xs bg-gray-100 p-2 rounded overflow-auto max-h-48">
              <pre>{JSON.stringify(selected.metrics_snapshot, null, 2)}</pre>
            </div>
          </div>
          <button
            onClick={() => setSelected(null)}
            className="mt-2 px-3 py-1 bg-gray-400 rounded text-sm"
          >
            Zamknij
          </button>
        </div>
      ) : null}
    </div>
  )
}
