import React, { useEffect, useState } from 'react'

export default function SettingsPage() {
  const resetPhrase = 'USUŃ WSZYSTKIE DANE'
  const [defaultCurrency, setDefaultCurrency] = useState('PLN')
  const [currencyError, setCurrencyError] = useState<string | null>(null)
  const [autoBackup, setAutoBackup] = useState(false)
  const [backupPath, setBackupPath] = useState('')
  const [backupPathError, setBackupPathError] = useState<string | null>(null)
  const [dbInfo, setDbInfo] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const [showFactoryReset, setShowFactoryReset] = useState(false)
  const [resetAcknowledged, setResetAcknowledged] = useState(false)
  const [resetConfirmation, setResetConfirmation] = useState('')
  const [resetting, setResetting] = useState(false)
  const [resetError, setResetError] = useState<string | null>(null)
  const [resetBackupPath, setResetBackupPath] = useState<string | null>(null)

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
        alert('Nie udało się wyeksportować kopii bazy danych.')
      }
    } catch (err) {
      console.error('Database export failed', err)
      alert('Nie udało się wyeksportować kopii bazy danych.')
    }
  }

  function cancelFactoryReset() {
    setShowFactoryReset(false)
    setResetAcknowledged(false)
    setResetConfirmation('')
    setResetError(null)
  }

  async function factoryReset() {
    if (!resetAcknowledged || resetConfirmation !== resetPhrase) return
    setResetting(true)
    setResetError(null)
    setResetBackupPath(null)
    try {
      const result = await (window as any).allegroSettings.factoryReset(resetConfirmation)
      if (!result?.ok) throw new Error(result?.error || 'Reset nie powiódł się.')
      setResetBackupPath(result.backupPath)
      setDefaultCurrency('PLN')
      setAutoBackup(false)
      setBackupPath('')
      setCurrencyError(null)
      setBackupPathError(null)
      cancelFactoryReset()
      await load()
    } catch (err) {
      console.error('Factory reset failed', err)
      setResetError(err instanceof Error ? err.message : 'Nie udało się wykonać resetu.')
    } finally {
      setResetting(false)
    }
  }

  return (
    <div className="panel p-4 sm:p-5 max-w-3xl">
      <div className="eyebrow">PREFERENCJE I DANE</div>
      <h2 className="section-title">Ustawienia</h2>
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
            <div className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
              <div className="preview-stat"><span>Zamówienia</span><strong>{dbInfo.orders ?? 0}</strong></div>
              <div className="preview-stat"><span>Operacje rozliczeniowe</span><strong>{dbInfo.billing_operations ?? 0}</strong></div>
              <div className="preview-stat"><span>Rozmiar bazy</span><strong>{dbInfo.size ? `${(dbInfo.size / 1024).toFixed(1)} KB` : '—'}</strong></div>
              <div className="preview-stat col-span-full"><span>Lokalizacja</span><strong className="break-all">{dbInfo.path}</strong></div>
            </div>
          ) : <div className="text-sm text-gray-500 mt-2">Brak informacji o DB</div>}
          <div className="mt-3">
            <button onClick={exportDb} className="px-4 py-2 bg-green-600 text-white rounded">Eksportuj kopię bazy</button>
          </div>
        </div>

        <section className="factory-reset-zone" aria-labelledby="factory-reset-title">
          <div>
            <h3 id="factory-reset-title" className="font-semibold">Przywracanie stanu fabrycznego</h3>
            <p className="mt-1 text-sm text-gray-500">Usuwa zaimportowane raporty, zamówienia, rozliczenia, katalog produktów, zapisane raporty i ustawienia. Struktura aplikacji pozostaje bez zmian.</p>
          </div>
          {resetBackupPath ? <div role="status" className="mt-3 text-sm text-green-300">Reset zakończony. Kopia sprzed resetu: <span className="break-all">{resetBackupPath}</span></div> : null}
          {!showFactoryReset ? (
            <button type="button" onClick={() => { setShowFactoryReset(true); setResetError(null) }} className="factory-reset-trigger mt-3 px-3 py-2">Przywróć stan fabryczny…</button>
          ) : (
            <div className="factory-reset-confirm mt-4 space-y-3">
              <div className="text-sm text-red-200"><strong>Tej operacji nie można cofnąć.</strong> Przed usunięciem danych program automatycznie zapisze kopię bazy. Reset nie rozpocznie się, jeśli kopia nie powiedzie się.</div>
              <label className="flex items-start gap-2 text-sm text-gray-300">
                <input type="checkbox" checked={resetAcknowledged} onChange={(event) => setResetAcknowledged(event.target.checked)} />
                <span>Rozumiem, że wszystkie dane zapisane w aplikacji zostaną usunięte.</span>
              </label>
              <label className="block text-sm text-gray-400">
                Wpisz <code>{resetPhrase}</code>, aby potwierdzić
                <input value={resetConfirmation} onChange={(event) => setResetConfirmation(event.target.value)} autoComplete="off" spellCheck={false} className="mt-1 w-full p-2" />
              </label>
              {resetError ? <div role="alert" className="text-sm text-red-300">{resetError}</div> : null}
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={factoryReset} disabled={resetting || !resetAcknowledged || resetConfirmation !== resetPhrase} className="factory-reset-trigger px-3 py-2">{resetting ? 'Tworzę kopię i czyszczę dane…' : 'Utwórz kopię i usuń dane'}</button>
                <button type="button" onClick={cancelFactoryReset} disabled={resetting} className="secondary-action px-3 py-2">Anuluj</button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
