import React, { useState, useEffect } from 'react'

type ReportType = 'orders' | 'billing'

type ImportFile = {
  name: string
  content?: string
  error?: string
  path?: string
}

type Preview = {
  fileName: string
  fileType?: ReportType
  error?: string
  message?: string
  ordersCount?: number
  lineItemsCount?: number
  returnsQuantity?: number
  operationsCount?: number
  debitTotal?: number
  sample?: unknown[]
}

type ImportResult = {
  fileName: string
  status: string
  fileType?: ReportType
  error?: string
  message?: string
  insertedOrders?: number
  insertedLineItems?: number
  insertedOperations?: number
  discoveredProducts?: number
}

type ReportState<T> = Record<ReportType, T[]>

const resultStatusLabels: Record<string, string> = {
  imported: 'Zaimportowano',
  duplicate: 'Duplikat',
  error: 'Błąd'
}

const resultErrorLabels: Record<string, string> = {
  unknown_format: 'Nie rozpoznano formatu pliku',
  file_read_error: 'Nie udało się odczytać pliku',
  no_data_rows: 'Raport nie zawiera danych do importu',
  import_failed: 'Import nie powiódł się',
  database_disabled: 'Baza danych jest niedostępna'
}

export default function ImportPage() {
  const [activeType, setActiveType] = useState<ReportType>('orders')
  const [filesByType, setFilesByType] = useState<ReportState<ImportFile>>({ orders: [], billing: [] })
  const [previewsByType, setPreviewsByType] = useState<ReportState<Preview>>({ orders: [], billing: [] })
  const [resultsByType, setResultsByType] = useState<ReportState<ImportResult>>({ orders: [], billing: [] })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastDir, setLastDir] = useState<string | null>(null)
  const files = filesByType[activeType]
  const previews = previewsByType[activeType]
  const results = resultsByType[activeType]

  function setCurrentFiles(nextFiles: ImportFile[]) {
    setFilesByType((current) => ({ ...current, [activeType]: nextFiles }))
    setPreviewsByType((current) => ({ ...current, [activeType]: [] }))
    setResultsByType((current) => ({ ...current, [activeType]: [] }))
    setError(null)
  }

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const chosen = Array.from(e.target.files || [])
    const readFiles = await Promise.all(chosen.map(async (f) => {
      try {
        return { name: f.name, content: await f.text() }
      } catch (err) {
        return { name: f.name, error: String(err) }
      }
    }))
    setCurrentFiles(readFiles)
    e.target.value = ''
  }

  async function handleSelectFiles() {
    try {
      const res = await (window as any).allegroImport.selectFiles(lastDir || undefined)
      if (!Array.isArray(res)) {
        setError('Nie udało się odczytać wybranych plików.')
        return
      }
      setCurrentFiles(res)
      // remember directory of first selected file
      const firstPath = (res as ImportFile[]).find((r) => r.path && r.path.length)
      if (firstPath && firstPath.path) {
        try {
          const d = firstPath.path.replace(/\\[^\\]+$/, '')
          setLastDir(d)
          localStorage.setItem('allegro_last_dir', d)
        } catch (err) {
          // ignore
        }
      }
    } catch (err) {
      console.error('selectFiles error', err)
      setError('Nie udało się otworzyć okna wyboru plików.')
    }
  }

  async function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    const dt = e.dataTransfer
    const list = dt.files
    if (!list) return
    const dropped = Array.from(list)
    const arr = await Promise.all(dropped.map(async (f) => {
      try {
        return { name: f.name, content: await f.text() }
      } catch (err) {
        return { name: f.name, error: String(err) }
      }
    }))
    setCurrentFiles(arr)
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
  }

  const onPreview = async () => {
    if (!files.length) return;
    setLoading(true)
    setError(null)
    try {
      const res: Preview[] = await (window as any).allegroImport.parseAndPreview(files)
      const previewsByFile = new Map(res.map((preview) => [preview.fileName, preview]))
      const detectedFiles: ReportState<ImportFile> = { orders: [], billing: [] }
      const detectedPreviews: ReportState<Preview> = { orders: [], billing: [] }

      for (const file of files) {
        const preview = previewsByFile.get(file.name)
        const targetType = preview?.fileType || activeType
        detectedFiles[targetType].push(file)
        if (preview) detectedPreviews[targetType].push(preview)
      }

      setFilesByType((current) => ({
        ...current,
        ...(detectedFiles.orders.length ? { orders: detectedFiles.orders } : {}),
        ...(detectedFiles.billing.length ? { billing: detectedFiles.billing } : {})
      }))
      setPreviewsByType((current) => ({
        ...current,
        ...(detectedPreviews.orders.length ? { orders: detectedPreviews.orders } : {}),
        ...(detectedPreviews.billing.length ? { billing: detectedPreviews.billing } : {})
      }))
      if (detectedPreviews.billing.length && !detectedPreviews.orders.length) setActiveType('billing')
      if (detectedPreviews.orders.length && !detectedPreviews.billing.length) setActiveType('orders')
    } catch (err) {
      console.error('Preview error', err)
      setError('Nie udało się przygotować podglądu raportu.')
    } finally {
      setLoading(false)
    }
  }

  const onCommit = async () => {
    if (!files.length) return;
    setLoading(true)
    setError(null)
    try {
      const res: ImportResult[] = await (window as any).allegroImport.commit(files)
      const resultsByType: ReportState<ImportResult> = { orders: [], billing: [] }
      const filesByResultType: ReportState<ImportFile> = { orders: [], billing: [] }
      const fileByName = new Map(files.map((file) => [file.name, file]))
      for (const result of res) {
        const targetType = result.fileType || activeType
        resultsByType[targetType].push(result)
        const importedFile = fileByName.get(result.fileName)
        if (importedFile) filesByResultType[targetType].push(importedFile)
      }
      setFilesByType((current) => ({
        ...current,
        ...(filesByResultType.orders.length ? { orders: filesByResultType.orders } : {}),
        ...(filesByResultType.billing.length ? { billing: filesByResultType.billing } : {})
      }))
      setResultsByType((current) => ({
        ...current,
        ...(resultsByType.orders.length ? { orders: resultsByType.orders } : {}),
        ...(resultsByType.billing.length ? { billing: resultsByType.billing } : {})
      }))
      if (resultsByType.billing.length && !resultsByType.orders.length) setActiveType('billing')
      if (resultsByType.orders.length && !resultsByType.billing.length) setActiveType('orders')
    } catch (err) {
      console.error('Import error', err)
      setError('Import nie powiódł się. Sprawdź plik i spróbuj ponownie.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const d = localStorage.getItem('allegro_last_dir')
    if (d) setLastDir(d)
  }, [])

  function removeFileAt(index: number) {
    setCurrentFiles(files.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow">DANE ŹRÓDŁOWE</div>
          <h2 className="section-title">Import raportów</h2>
          <p className="mt-1 text-sm text-gray-500">Plik jest automatycznie przypisywany według kolumn w nagłówku.</p>
        </div>
        <span className="status-pill status-pill-accent">CSV Allegro</span>
      </div>

      <div className="flex border-b" role="tablist" aria-label="Rodzaj raportu">
        <button
          role="tab"
          aria-selected={activeType === 'orders'}
          onClick={() => { setActiveType('orders'); setError(null) }}
          className={`import-tab border-b-2 px-4 py-3 text-sm font-medium ${activeType === 'orders' ? 'import-tab-active' : ''}`}
        >
          Zamówienia <span className="tab-count">{filesByType.orders.length}</span>
        </button>
        <button
          role="tab"
          aria-selected={activeType === 'billing'}
          onClick={() => { setActiveType('billing'); setError(null) }}
          className={`import-tab border-b-2 px-4 py-3 text-sm font-medium ${activeType === 'billing' ? 'import-tab-active' : ''}`}
        >
          Rozliczenia <span className="tab-count">{filesByType.billing.length}</span>
        </button>
      </div>
      <p className="mt-3 text-sm text-gray-600">
        {activeType === 'orders'
          ? 'Raport zamówień: dane zamówień i pozycje z informacją o zwrotach.'
          : 'Raport rozliczeń: saldo, uznania, obciążenia i szczegóły operacji.'}
      </p>

      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        className="drop-zone p-5 sm:p-7"
      >
        <div className="flex flex-col items-center text-center">
          <div className="upload-mark" aria-hidden="true">↑</div>
          <div className="mt-3 font-semibold text-gray-800">Upuść tutaj raport {activeType === 'orders' ? 'zamówień' : 'rozliczeń'}</div>
          <div className="mt-1 text-sm text-gray-500">Obsługiwane formaty: CSV i TXT</div>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <button type="button" onClick={handleSelectFiles} className="px-4 py-2 bg-blue-600 text-white rounded">Wybierz pliki</button>
            <label className="file-input-label px-4 py-2 rounded">
              Przeglądaj komputer
              <input type="file" multiple accept=".csv,.txt,text/csv" onChange={handleFileInput} />
            </label>
          </div>
        </div>
        {lastDir ? <div className="mt-4 border-t pt-3 text-xs text-gray-500">Ostatni folder: <span className="text-gray-700">{lastDir}</span></div> : null}
      </div>

      <section className="panel p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold">Pliki do importu</h3>
            <p className="mt-1 text-xs text-gray-500">{files.length ? `${files.length} plik${files.length === 1 ? '' : 'i'} w kolejce` : 'Wybierz lub przeciągnij raport, aby rozpocząć.'}</p>
          </div>
          {files.length ? <span className="status-pill">{activeType === 'orders' ? 'Zamówienia' : 'Rozliczenia'}</span> : null}
        </div>
        {files.length > 0 ? <ul className="mt-4 space-y-2">
          {files.map((f, idx) => (
            <li key={`${f.name}-${idx}`} className="file-row flex items-center justify-between gap-3 p-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="file-mark" aria-hidden="true">CSV</div>
                <div className="min-w-0">
                  <div className="truncate font-medium text-gray-800">{f.name}</div>
                  {f.error ? <div className="mt-1 text-sm text-red-400">Nie udało się odczytać tego pliku.</div> : null}
                  {f.path ? <div className="mt-1 truncate text-xs text-gray-500">{f.path}</div> : null}
                </div>
              </div>
              <button type="button" aria-label={`Usuń ${f.name}`} onClick={() => removeFileAt(idx)} className="icon-action">×</button>
            </li>
          ))}
        </ul> : null}

        <div className="mt-4 flex flex-wrap gap-2 border-t pt-4">
          <button type="button" onClick={onPreview} disabled={loading || !files.length} className="secondary-action">{loading ? 'Analizuję…' : 'Podgląd raportu'}</button>
          <button type="button" onClick={onCommit} disabled={loading || !files.length} className="px-4 py-2 bg-green-600 text-white rounded">{loading ? 'Importuję…' : 'Importuj dane'}</button>
        </div>
        {error ? <div role="alert" className="mt-3 rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</div> : null}
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="panel p-4 sm:p-5">
          <h3 className="font-semibold">Podgląd {activeType === 'orders' ? 'zamówień' : 'rozliczeń'}</h3>
          {previews.length ? <ul className="mt-4 space-y-3">
            {previews.map((preview, idx) => (
              <li key={`${preview.fileName}-${idx}`} className="preview-row">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{preview.fileName}</div>
                    <div className="mt-1 text-xs text-gray-500">{preview.fileType === 'orders' ? 'Raport zamówień' : 'Raport rozliczeń'}</div>
                  </div>
                  {preview.error ? <span className="status-pill status-pill-error">Do sprawdzenia</span> : <span className="status-pill status-pill-success">Gotowy</span>}
                </div>
                {preview.error ? <p className="mt-3 text-sm text-red-300">{resultErrorLabels[preview.error] || 'Nie udało się odczytać tego raportu.'}</p> : (
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {preview.fileType === 'orders' ? <>
                      <div className="preview-stat"><span>Zamówienia</span><strong>{preview.ordersCount}</strong></div>
                      <div className="preview-stat"><span>Pozycje</span><strong>{preview.lineItemsCount}</strong></div>
                      <div className="preview-stat"><span>Zwroty szt.</span><strong>{preview.returnsQuantity}</strong></div>
                    </> : <>
                      <div className="preview-stat"><span>Operacje</span><strong>{preview.operationsCount}</strong></div>
                      <div className="preview-stat"><span>Obciążenia</span><strong>{Number(preview.debitTotal || 0).toFixed(2)} PLN</strong></div>
                    </>}
                  </div>
                )}
                {preview.sample?.length ? <details className="mt-3">
                  <summary className="cursor-pointer text-xs text-gray-500">Pokaż przykładowe rekordy</summary>
                  <pre className="mt-2 max-h-48 overflow-auto p-3">{JSON.stringify(preview.sample, null, 2)}</pre>
                </details> : null}
              </li>
            ))}
          </ul> : <p className="mt-3 text-sm text-gray-500">Podgląd pojawi się po analizie pliku.</p>}
        </div>

        <div className="panel p-4 sm:p-5">
          <h3 className="font-semibold">Wyniki importu</h3>
          {results.length ? <ul className="mt-4 space-y-2">
            {results.map((result, idx) => (
              <li key={`${result.fileName}-${idx}`} className="file-row flex items-start justify-between gap-3 p-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{result.fileName}</div>
                  <div className="mt-1 text-xs text-gray-500">
                    {result.insertedOrders != null ? `${result.insertedOrders} zamówień · ${result.insertedLineItems || 0} pozycji` : null}
                    {result.insertedOperations != null ? `${result.insertedOperations} operacji` : null}
                    {result.discoveredProducts ? ` · wykryto ${result.discoveredProducts} nowych produktów — uzupełnij koszt zakupu i VAT w katalogu` : null}
                    {result.status === 'duplicate' ? 'Plik został już wcześniej zaimportowany.' : null}
                    {result.error ? resultErrorLabels[result.error] || 'Nie udało się zaimportować tego pliku.' : null}
                  </div>
                </div>
                <span className={`status-pill ${result.status === 'imported' ? 'status-pill-success' : result.status === 'error' ? 'status-pill-error' : ''}`}>
                  {resultStatusLabels[result.status] || result.status}
                </span>
              </li>
            ))}
          </ul> : <p className="mt-3 text-sm text-gray-500">Po imporcie zobaczysz tu wynik każdego pliku.</p>}
        </div>
      </section>
    </div>
  )
}
