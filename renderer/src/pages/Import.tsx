import React, { useState, useEffect } from 'react'

export default function ImportPage() {
  const [files, setFiles] = useState([])
  const [previews, setPreviews] = useState([])
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [lastDir, setLastDir] = useState<string | null>(null)

  const handleFileInput = async (e) => {
    const chosen = Array.from(e.target.files || [])
    const readFiles = await Promise.all(chosen.map(async (f) => {
      const text = await f.text()
      return { name: f.name, content: text }
    }))
    setFiles(readFiles)
  }

  async function handleSelectFiles() {
    try {
      const res = await (window as any).allegroImport.selectFiles(lastDir || undefined)
      if (!res) return
      setFiles(res)
      // remember directory of first selected file
      const firstPath = res.find((r) => r && r.path && r.path.length)
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
    }
  }

  async function handleDrop(e) {
    e.preventDefault()
    const dt = e.dataTransfer
    const list = dt.files
    if (!list) return
    const arr = []
    for (let i = 0; i < list.length; i++) {
      const f = list[i]
      try {
        const txt = await f.text()
        arr.push({ name: f.name, content: txt })
      } catch (err) {
        arr.push({ name: f.name, error: String(err) })
      }
    }
    setFiles(arr)
  }

  function handleDragOver(e) {
    e.preventDefault()
  }

  const onPreview = async () => {
    if (!files.length) return;
    setLoading(true)
    try {
      const res = await (window as any).allegroImport.parseAndPreview(files)
      setPreviews(res)
    } finally {
      setLoading(false)
    }
  }

  const onCommit = async () => {
    if (!files.length) return;
    setLoading(true)
    try {
      const res = await (window as any).allegroImport.commit(files)
      setResults(res)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const d = localStorage.getItem('allegro_last_dir')
    if (d) setLastDir(d)
  }, [])

  function removeFileAt(index) {
    setFiles((prev) => prev.filter((_, i) => i !== index))
  }

  return (
    <div className="p-6">
      <h2 className="text-xl font-semibold">Import plików</h2>
      <p className="text-sm text-gray-600">Wybierz pliki CSV wygenerowane z Allegro (orders / billing)</p>

      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        className="mt-4 p-4 border-dashed border-2 border-gray-300 rounded"
      >
        <div className="mb-2">Przeciągnij pliki tutaj</div>
        <div className="flex items-center gap-2">
          <button onClick={handleSelectFiles} className="px-3 py-2 bg-gray-700 text-white rounded">Wybierz pliki (systemowy dialog)</button>
          <div className="text-sm text-gray-500">albo</div>
          <input type="file" multiple onChange={handleFileInput} />
        </div>
        {lastDir ? <div className="mt-2 text-xs text-gray-500">Ostatni folder: {lastDir}</div> : null}
      </div>

      <div className="mt-4">
        <h4 className="font-medium">Wybrane pliki</h4>
        {files.length === 0 && <div className="text-sm text-gray-500">Brak plików</div>}
        <ul className="mt-2 space-y-2">
          {files.map((f, idx) => (
            <li key={`${f.name}-${idx}`} className="flex items-center justify-between p-2 border rounded">
              <div>
                <div className="font-medium">{f.name}</div>
                {f.error ? <div className="text-red-500 text-sm">Błąd: {f.error}</div> : null}
                {f.path ? <div className="text-xs text-gray-500">{f.path}</div> : null}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => removeFileAt(idx)} className="px-2 py-1 bg-red-500 text-white rounded">Usuń</button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-4 space-x-2">
        <button onClick={onPreview} disabled={loading || !files.length} className="px-3 py-2 bg-blue-600 text-white rounded">{loading ? 'Ładowanie...' : 'Preview'}</button>
        <button onClick={onCommit} disabled={loading || !files.length} className="px-3 py-2 bg-green-600 text-white rounded">{loading ? 'Importuje...' : 'Importuj'}</button>
      </div>

      <div className="mt-6">
        <h3 className="font-medium">Podgląd</h3>
        <pre className="bg-gray-100 p-2 mt-2 rounded max-h-64 overflow-auto">{JSON.stringify(previews, null, 2)}</pre>
      </div>

      <div className="mt-6">
        <h3 className="font-medium">Wyniki importu</h3>
        <pre className="bg-gray-100 p-2 mt-2 rounded max-h-64 overflow-auto">{JSON.stringify(results, null, 2)}</pre>
      </div>
    </div>
  )
}
