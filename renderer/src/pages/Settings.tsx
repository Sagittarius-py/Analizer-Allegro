import React, { useEffect, useState } from 'react'

export default function SettingsPage() {
  const [defaultCurrency, setDefaultCurrency] = useState('PLN')
  const [currencyError, setCurrencyError] = useState<string | null>(null)
  const [autoBackup, setAutoBackup] = useState(false)
  const [backupPath, setBackupPath] = useState('')
  const [backupPathError, setBackupPathError] = useState<string | null>(null)
  const [dbInfo, setDbInfo] = useState<any>(null)
  const [saving, setSaving] = useState(false)

  async function load() {
    try {
      const c = await (window as any).allegroSettings.get('default_currency')
      if (c) setDefaultCurrency(c)
    } catch (e) {}
    try {
      const a = await (window as any).allegroSettings.get('auto_backup')
      setAutoBackup(!!a)
    } catch (e) {}
    try {
      const p = await (window as any).allegroSettings.get('backup_path')
      if (p) setBackupPath(p)
    } catch (e) {}
    try {
      const info = await (window as any).allegroAPI.database.getInfo()
      setDbInfo(info)
    } catch (e) { setDbInfo(null) }
  }

  useEffect(() => { load() }, [])

  async function save() {
    // validate before saving
    const curValid = validateCurrency()
    let pathValid = await validateBackupPath()
    // if path invalid because missing, offer to create it
    if (!pathValid && backupPathError === 'Folder nie istnieje') {
      const create = window.confirm('Folder kopii nie istnieje. Utworzyć go teraz?')
      if (create) {
        try {
          const res = await (window as any).allegroSettings.createFolder(backupPath)
          if (res && res.ok) {
            // revalidate
            pathValid = await validateBackupPath()
          }
        } catch (err) {
          console.error('createFolder error', err)
        }
      }
    }

    if (!curValid || !pathValid) return
    setSaving(true)
    try {
      await (window as any).allegroSettings.set('default_currency', defaultCurrency)
      await (window as any).allegroSettings.set('auto_backup', autoBackup)
      await (window as any).allegroSettings.set('backup_path', backupPath)
      await load()
    } catch (err) {
      console.error(err)
    } finally { setSaving(false) }
  }

  function validateCurrency() {
    if (!defaultCurrency || !/^[A-Z]{3}$/.test(defaultCurrency.trim())) {
      setCurrencyError('Użyj 3-literowego kodu waluty (np. PLN)')
      return false
    }
    setCurrencyError(null)
    return true
  }

  async function validateBackupPath() {
    if (!backupPath || !backupPath.trim()) {
      setBackupPathError('Ścieżka nie może być pusta')
      return false
    }
    try {
      const res = await (window as any).allegroSettings.validatePath(backupPath)
      if (!res || !res.exists) {
        setBackupPathError('Folder nie istnieje')
        return false
      }
      if (!res.isDirectory) {
        setBackupPathError('Wskaż folder, nie plik')
        return false
      }
      setBackupPathError(null)
      return true
    } catch (err) {
      setBackupPathError('Błąd walidacji ścieżki')
      return false
    }
  }

  async function exportDb() {
    try {
      const res = await (window as any).allegroSettings.exportDb()
      if (res && res.ok) {
        alert('Kopia zapisana: ' + res.path)
      } else if (res && res.canceled) {
        // user canceled
      } else {
        alert('Błąd: ' + (res && res.error))
      }
    } catch (err) { alert('Błąd: ' + String(err)) }
  }

  return (
    <div className="p-4 bg-white dark:bg-gray-800 rounded shadow max-w-3xl">
      <h2 className="text-xl font-semibold">Ustawienia</h2>
      <div className="mt-4 grid grid-cols-1 gap-4">
        <div>
          <label className="block text-sm text-gray-600">Domyślna waluta</label>
          <input value={defaultCurrency} onChange={e => { setDefaultCurrency(e.target.value.toUpperCase()); setCurrencyError(null); }} onBlur={validateCurrency} className="mt-1 p-2 border rounded w-40" />
          {currencyError ? <div className="text-red-500 text-sm mt-1">{currencyError}</div> : null}
        </div>

        <div>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={autoBackup} onChange={e => setAutoBackup(e.target.checked)} />
            <span className="text-sm">Automatyczne kopie przy imporcie</span>
          </label>
        </div>

        <div>
          <label className="block text-sm text-gray-600">Domyślny folder kopii</label>
          <div className="flex gap-2 mt-1">
            <input value={backupPath} onChange={e => { setBackupPath(e.target.value); setBackupPathError(null); }} onBlur={validateBackupPath} className="p-2 border rounded flex-1" />
            <button onClick={async () => {
              try {
                const res = await (window as any).allegroSettings.selectFolder()
                if (res && !res.canceled && res.path) {
                  setBackupPath(res.path)
                  setBackupPathError(null)
                }
              } catch (err) {
                console.error(err)
              }
            }} className="px-3 py-2 bg-gray-200 rounded">Wybierz</button>
          </div>
          {backupPathError ? <div className="text-red-500 text-sm mt-1">{backupPathError}</div> : null}
        </div>

        <div>
          <button onClick={save} disabled={saving || !!currencyError || !!backupPathError} className="px-3 py-2 bg-blue-600 text-white rounded">{saving ? 'Zapis...' : 'Zapisz ustawienia'}</button>
        </div>

        <div className="pt-4 border-t">
          <h3 className="font-medium">Baza danych</h3>
          {dbInfo ? (
            <div className="mt-2 text-sm text-gray-600">
              <div>Ścieżka: {dbInfo.path}</div>
              <div>Rozmiar: {dbInfo.size || '-'} bytes</div>
              <div>Zamówienia: {dbInfo.orders}</div>
              <div>Operacje billingowe: {dbInfo.billing_operations}</div>
            </div>
          ) : <div className="text-sm text-gray-500 mt-2">Brak informacji o DB</div>}
          <div className="mt-3">
            <button onClick={exportDb} className="px-3 py-2 bg-green-600 text-white rounded">Eksportuj kopię DB</button>
          </div>
        </div>
      </div>
    </div>
  )
}
