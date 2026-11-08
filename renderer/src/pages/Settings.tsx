import React, { useEffect, useState } from 'react'

export default function SettingsPage() {
  const resetPhrase = 'USUŃ WSZYSTKIE DANE'
  const [defaultCurrency, setDefaultCurrency] = useState('PLN')
  const [minimumProfitAmount, setMinimumProfitAmount] = useState('10')
  const [minimumProfitMarginPercent, setMinimumProfitMarginPercent] = useState('10')
  const [defaultPurchaseVatRate, setDefaultPurchaseVatRate] = useState('23')
  const [defaultSalesVatRate, setDefaultSalesVatRate] = useState('23')
  const [defaultVatDeductiblePercent, setDefaultVatDeductiblePercent] = useState('100')
  const [productDefaultsError, setProductDefaultsError] = useState<string | null>(null)
  const [productDefaultsNotice, setProductDefaultsNotice] = useState<string | null>(null)
  const [savingProductDefaults, setSavingProductDefaults] = useState(false)
  const [marginError, setMarginError] = useState<string | null>(null)
  const [marginNotice, setMarginNotice] = useState<string | null>(null)
  const [savingMarginRules, setSavingMarginRules] = useState(false)
  const [currencyError, setCurrencyError] = useState<string | null>(null)
  const [autoBackup, setAutoBackup] = useState(false)
  const [backupPath, setBackupPath] = useState('')
  const [backupPathError, setBackupPathError] = useState<string | null>(null)
  const [dbInfo, setDbInfo] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const [restoringBackup, setRestoringBackup] = useState(false)
  const [restoreBackupError, setRestoreBackupError] = useState<string | null>(null)
  const [restoreBackupPath, setRestoreBackupPath] = useState<string | null>(null)
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
      const amount = await (window as any).allegroSettings.get('minimum_profit_amount')
      if (amount != null && Number.isFinite(Number(amount))) setMinimumProfitAmount(String(amount))
      const margin = await (window as any).allegroSettings.get('minimum_profit_margin_percent')
      if (margin != null && Number.isFinite(Number(margin))) setMinimumProfitMarginPercent(String(margin))
    } catch (e) {}
    try {
      const [purchaseVat, salesVat, deductible] = await Promise.all([
        (window as any).allegroSettings.get('default_purchase_vat_rate'),
        (window as any).allegroSettings.get('default_sales_vat_rate'),
        (window as any).allegroSettings.get('default_vat_deductible_percent')
      ])
      if (purchaseVat != null && Number.isFinite(Number(purchaseVat)) && Number(purchaseVat) >= 0 && Number(purchaseVat) <= 100) setDefaultPurchaseVatRate(String(purchaseVat))
      if (salesVat != null && Number.isFinite(Number(salesVat)) && Number(salesVat) >= 0 && Number(salesVat) <= 100) setDefaultSalesVatRate(String(salesVat))
      if (deductible != null && Number.isFinite(Number(deductible)) && Number(deductible) >= 0 && Number(deductible) <= 100) setDefaultVatDeductiblePercent(String(deductible))
    } catch (e) {
      console.error('Product VAT defaults load failed', e)
    }
    try {
      const a = await (window as any).allegroSettings.get('auto_backup')
      setAutoBackup(a === true || a === 1 || a === 'true' || a === '1')
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

  async function saveMarginRules() {
    const amount = Number(minimumProfitAmount)
    const margin = Number(minimumProfitMarginPercent)
    if (!Number.isFinite(amount) || amount < 0 || !Number.isFinite(margin) || margin < 0 || margin >= 100) {
      setMarginError('Zysk musi być nieujemny, a marża musi mieścić się w zakresie od 0% do poniżej 100%.')
      setMarginNotice(null)
      return
    }

    setSavingMarginRules(true)
    setMarginError(null)
    setMarginNotice(null)
    try {
      const amountResult = await (window as any).allegroSettings.set('minimum_profit_amount', String(amount))
      const marginResult = await (window as any).allegroSettings.set('minimum_profit_margin_percent', String(margin))
      if (amountResult?.error || marginResult?.error) throw new Error(amountResult?.error || marginResult?.error)
      setMarginNotice('Zasady marży zostały zapisane.')
    } catch (err) {
      setMarginError(err instanceof Error ? err.message : 'Nie udało się zapisać zasad marży.')
    } finally {
      setSavingMarginRules(false)
    }
  }

  async function saveProductDefaults() {
    const purchaseVat = Number(defaultPurchaseVatRate)
    const salesVat = Number(defaultSalesVatRate)
    const deductible = Number(defaultVatDeductiblePercent)
    if ([purchaseVat, salesVat, deductible].some((value) => !Number.isFinite(value) || value < 0 || value > 100)) {
      setProductDefaultsError('Stawki VAT i procent odliczenia muszą mieścić się w zakresie 0–100%.')
      setProductDefaultsNotice(null)
      return
    }

    setSavingProductDefaults(true)
    setProductDefaultsError(null)
    setProductDefaultsNotice(null)
    try {
      const results = await Promise.all([
        (window as any).allegroSettings.set('default_purchase_vat_rate', String(purchaseVat)),
        (window as any).allegroSettings.set('default_sales_vat_rate', String(salesVat)),
        (window as any).allegroSettings.set('default_vat_deductible_percent', String(deductible))
      ])
      const failed = results.find((result: any) => result?.error)
      if (failed) throw new Error(failed.error)
      setProductDefaultsNotice('Domyślne wartości VAT zostały zapisane. Nowe oferty z importu dostaną te stawki, ale VAT nadal wymaga potwierdzenia.')
    } catch (err) {
      setProductDefaultsError(err instanceof Error ? err.message : 'Nie udało się zapisać domyślnych wartości VAT.')
    } finally {
      setSavingProductDefaults(false)
    }
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

  async function restoreDb() {
    if (!window.confirm('Przywrócenie zastąpi aktualne dane z kopii. Przed zmianą aplikacja automatycznie zapisze kopię obecnej bazy. Kontynuować?')) return
    setRestoringBackup(true)
    setRestoreBackupError(null)
    setRestoreBackupPath(null)
    try {
      const result = await (window as any).allegroSettings.restoreDb()
      if (result?.canceled) return
      if (!result?.ok) throw new Error(result?.error || 'Nie udało się przywrócić kopii bazy.')
      setRestoreBackupPath(result.backupPath)
      await load()
    } catch (err) {
      console.error('Database restore failed', err)
      setRestoreBackupError(err instanceof Error ? err.message : 'Nie udało się przywrócić kopii bazy.')
    } finally {
      setRestoringBackup(false)
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
      setMinimumProfitAmount('10')
      setMinimumProfitMarginPercent('10')
      setDefaultPurchaseVatRate('23')
      setDefaultSalesVatRate('23')
      setDefaultVatDeductiblePercent('100')
      setMarginError(null)
      setMarginNotice(null)
      setProductDefaultsError(null)
      setProductDefaultsNotice(null)
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

        <section className="border-t pt-4" aria-labelledby="margin-rules-title">
          <h3 id="margin-rules-title" className="font-semibold">Zasady marży</h3>
          <p className="mt-1 text-sm text-gray-500">Cena minimalna musi spełniać oba warunki: wymagany zysk kwotowy i marżę liczoną od ceny sprzedaży netto. Kwota jest stosowana w walucie produktu, bez przeliczenia kursowego. Zysk przed Ads.</p>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block text-sm text-gray-600">Minimalny zysk przed Ads
              <input type="number" min="0" step="0.01" value={minimumProfitAmount} onChange={event => { setMinimumProfitAmount(event.target.value); setMarginError(null); setMarginNotice(null) }} className="mt-1 w-full p-2" />
            </label>
            <label className="block text-sm text-gray-600">Minimalna marża
              <div className="mt-1 flex items-center gap-2"><input type="number" min="0" max="99.99" step="0.1" value={minimumProfitMarginPercent} onChange={event => { setMinimumProfitMarginPercent(event.target.value); setMarginError(null); setMarginNotice(null) }} className="w-full p-2" /><span>%</span></div>
            </label>
          </div>
          {marginError ? <div role="alert" className="mt-2 text-sm text-red-300">{marginError}</div> : null}
          {marginNotice ? <div role="status" className="mt-2 text-sm text-green-300">{marginNotice}</div> : null}
          <button type="button" onClick={saveMarginRules} disabled={savingMarginRules} className="mt-3 px-3 py-2 bg-blue-600 text-white rounded">{savingMarginRules ? 'Zapisuję…' : 'Zapisz zasady marży'}</button>
        </section>

        <section className="border-t pt-4" aria-labelledby="product-vat-defaults-title">
          <h3 id="product-vat-defaults-title" className="font-semibold">Domyślne wartości produktów</h3>
          <p className="mt-1 text-sm text-gray-500">Dla raportowanych pontonów, materacy i dmuchanych zabawek przyjmujemy standardowe 23% VAT. Potwierdź stawkę na fakturze i dla konkretnego towaru. Domyślne 100% odliczenia jest tylko propozycją dla podatnika VAT i zakupów związanych ze sprzedażą opodatkowaną — nie stosuj go automatycznie, jeśli warunki odliczenia nie są spełnione.</p>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="block text-sm text-gray-600">Domyślny VAT zakupu
              <div className="mt-1 flex items-center gap-2"><input type="number" min="0" max="100" step="0.01" value={defaultPurchaseVatRate} onChange={(event) => { setDefaultPurchaseVatRate(event.target.value); setProductDefaultsError(null); setProductDefaultsNotice(null) }} className="w-full p-2" /><span>%</span></div>
            </label>
            <label className="block text-sm text-gray-600">Domyślny VAT sprzedaży
              <div className="mt-1 flex items-center gap-2"><input type="number" min="0" max="100" step="0.01" value={defaultSalesVatRate} onChange={(event) => { setDefaultSalesVatRate(event.target.value); setProductDefaultsError(null); setProductDefaultsNotice(null) }} className="w-full p-2" /><span>%</span></div>
            </label>
            <label className="block text-sm text-gray-600">Domyślne odliczenie VAT zakupu
              <div className="mt-1 flex items-center gap-2"><input type="number" min="0" max="100" step="1" value={defaultVatDeductiblePercent} onChange={(event) => { setDefaultVatDeductiblePercent(event.target.value); setProductDefaultsError(null); setProductDefaultsNotice(null) }} className="w-full p-2" /><span>%</span></div>
            </label>
          </div>
          {productDefaultsError ? <div role="alert" className="mt-2 text-sm text-red-300">{productDefaultsError}</div> : null}
          {productDefaultsNotice ? <div role="status" className="mt-2 text-sm text-green-300">{productDefaultsNotice}</div> : null}
          <button type="button" onClick={saveProductDefaults} disabled={savingProductDefaults} className="mt-3 px-3 py-2 bg-blue-600 text-white rounded">{savingProductDefaults ? 'Zapisuję…' : 'Zapisz domyślne wartości produktów'}</button>
        </section>

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
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={exportDb} className="px-4 py-2 bg-green-600 text-white rounded">Eksportuj kopię bazy</button>
            <button type="button" onClick={restoreDb} disabled={restoringBackup} className="secondary-action px-4 py-2">{restoringBackup ? 'Sprawdzam i przywracam…' : 'Przywróć kopię bazy'}</button>
          </div>
          {restoreBackupError ? <div role="alert" className="mt-2 text-sm text-red-500">{restoreBackupError}</div> : null}
          {restoreBackupPath ? <div role="status" className="mt-2 break-all text-sm text-green-600">Baza została przywrócona. Zachowano kopię poprzednich danych: {restoreBackupPath}</div> : null}
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
