import React, { useEffect, useState } from 'react'
import { calculateMinimumSalePrice } from '../utils/pricing'

type Product = {
  offer_id: string
  offer_name: string
  sku: string | null
  unit_cost: number | null
  sale_price_net: number | null
  purchase_vat_rate: number
  sales_vat_rate: number
  vat_deductible_percent: number
  currency: string
  notes: string | null
  updated_at: string | null
  is_auto_discovered: number
  vat_verified: number
  is_smart_offer: number
  purchaseVat: number | null
  nonDeductibleVat: number | null
  grossPurchaseCost: number | null
  estimatedGrossPrice: number | null
  sellerFeeDebits: number
  sellerFeeCredits: number
  sellerFeesNet: number
  sellerFeeOperations: number
  sellerFeeDateFrom: string | null
  sellerFeeDateTo: string | null
  smartDeliveryOperations: number
  smartDeliveryFeesNet: number
}

type ProductForm = {
  offerId: string
  offerName: string
  sku: string
  netPurchaseCost: string
  netSalePrice: string
  purchaseVatRate: string
  salesVatRate: string
  vatDeductiblePercent: string
  vatVerified: boolean
  isSmartOffer: boolean
  currency: string
  notes: string
}

const emptyForm: ProductForm = {
  offerId: '',
  offerName: '',
  sku: '',
  netPurchaseCost: '',
  netSalePrice: '',
  purchaseVatRate: '23',
  salesVatRate: '23',
  vatDeductiblePercent: '100',
  vatVerified: false,
  isSmartOffer: false,
  currency: 'PLN',
  notes: ''
}

const money = (value: number | null | undefined, currency = 'PLN') => value == null
  ? '—'
  : new Intl.NumberFormat('pl-PL', { style: 'currency', currency, minimumFractionDigits: 2 }).format(value)

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [minimumProfitAmount, setMinimumProfitAmount] = useState(10)
  const [minimumProfitMarginPercent, setMinimumProfitMarginPercent] = useState(10)
  const [expandedOptionsId, setExpandedOptionsId] = useState<string | null>(null)
  const [showNewProductForm, setShowNewProductForm] = useState(false)
  const [form, setForm] = useState<ProductForm>(emptyForm)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function loadProducts() {
    setLoading(true)
    try {
      const result = await (window as any).allegroAPI.products.list()
      if (!Array.isArray(result)) throw new Error(result?.error || 'Nie udało się pobrać katalogu.')
      setProducts(result)
    } catch (err) {
      console.error('Product catalog load failed', err)
      setError('Nie udało się wczytać katalogu produktów.')
    } finally {
      setLoading(false)
    }
  }

  async function loadMarginRules() {
    try {
      const settings = (window as any).allegroSettings
      if (!settings?.get) return
      const [amount, margin] = await Promise.all([
        settings.get('minimum_profit_amount'),
        settings.get('minimum_profit_margin_percent')
      ])
      if (amount != null && Number.isFinite(Number(amount)) && Number(amount) >= 0) setMinimumProfitAmount(Number(amount))
      if (margin != null && Number.isFinite(Number(margin)) && Number(margin) >= 0 && Number(margin) < 100) setMinimumProfitMarginPercent(Number(margin))
    } catch (err) {
      console.error('Margin rules load failed', err)
    }
  }

  useEffect(() => { loadProducts(); loadMarginRules() }, [])

  function updateField(field: keyof ProductForm, value: string | boolean) {
    setForm((current) => ({ ...current, [field]: value }))
    setError(null)
    setNotice(null)
  }

  function startNewProduct() {
    if (showNewProductForm) {
      closeProductEditor()
      return
    }
    setEditing(false)
    setExpandedOptionsId(null)
    setShowNewProductForm(true)
    setForm(emptyForm)
    setError(null)
    setNotice(null)
  }

  function closeProductEditor() {
    setEditing(false)
    setExpandedOptionsId(null)
    setShowNewProductForm(false)
    setForm(emptyForm)
    setError(null)
    setNotice(null)
  }

  function editProduct(product: Product) {
    setExpandedOptionsId(product.offer_id)
    setShowNewProductForm(false)
    setEditing(true)
    setForm({
      offerId: product.offer_id,
      offerName: product.offer_name,
      sku: product.sku || '',
      netPurchaseCost: product.unit_cost == null ? '' : String(product.unit_cost),
      netSalePrice: product.sale_price_net == null ? '' : String(product.sale_price_net),
      purchaseVatRate: String(product.purchase_vat_rate),
      salesVatRate: String(product.sales_vat_rate),
      vatDeductiblePercent: String(product.vat_deductible_percent),
      vatVerified: Boolean(product.vat_verified),
      isSmartOffer: Boolean(product.is_smart_offer),
      currency: product.currency || 'PLN',
      notes: product.notes || ''
    })
    setError(null)
    setNotice(null)
  }

  async function saveProduct(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      const result = await (window as any).allegroAPI.products.save(form)
      if (!result?.ok) throw new Error(result?.error || 'Nie udało się zapisać produktu.')
      setNotice(editing ? 'Dane produktu zostały zaktualizowane.' : 'Produkt został dodany do katalogu.')
      setForm(emptyForm)
      setEditing(false)
      setExpandedOptionsId(null)
      setShowNewProductForm(false)
      await loadProducts()
    } catch (err: any) {
      setError(err?.message || 'Nie udało się zapisać produktu.')
    } finally {
      setSaving(false)
    }
  }

  async function removeProduct(product: Product) {
    if (!window.confirm(`Usunąć „${product.offer_name}” z katalogu kosztów?`)) return
    try {
      const result = await (window as any).allegroAPI.products.delete(product.offer_id)
      if (result?.error) throw new Error(result.error)
      setProducts((current) => current.filter((item) => item.offer_id !== product.offer_id))
      if (form.offerId === product.offer_id) closeProductEditor()
      setNotice('Produkt został usunięty z katalogu kosztów.')
    } catch (err) {
      console.error('Product deletion failed', err)
      setError('Nie udało się usunąć produktu.')
    }
  }

  const filteredProducts = products.filter((product) => {
    const query = search.trim().toLocaleLowerCase('pl-PL')
    return !query || [product.offer_name, product.offer_id, product.sku || ''].some((value) => value.toLocaleLowerCase('pl-PL').includes(query))
  })

  const purchaseNet = Number(form.netPurchaseCost) || 0
  const purchaseVat = purchaseNet * (Number(form.purchaseVatRate) || 0) / 100
  const deductiblePercent = Number(form.vatDeductiblePercent) || 0
  const purchaseGrossCost = purchaseNet + purchaseVat * (100 - deductiblePercent) / 100
  const salesGrossPrice = form.netSalePrice === '' ? null : Number(form.netSalePrice) * (1 + (Number(form.salesVatRate) || 0) / 100)
  const minimumFormPrice = form.vatVerified && form.netPurchaseCost !== '' && Number.isFinite(Number(form.netPurchaseCost))
    ? calculateMinimumSalePrice(purchaseGrossCost, minimumProfitAmount, minimumProfitMarginPercent, Number(form.salesVatRate) || 0)
    : null

  function renderProductEditor(inline = false) {
    return (
      <section id={inline || showNewProductForm ? 'product-form' : undefined} className={`product-editor ${inline ? 'product-editor-inline p-4' : 'panel p-4 sm:p-5'}`}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-semibold">{editing ? 'Edytuj produkt' : 'Nowy produkt'}</h3>
          <span className="text-xs text-gray-500">Wymagane: ID oferty, nazwa i koszt netto</span>
        </div>
        <form className="mt-4 space-y-4" onSubmit={saveProduct}>
          <div className="product-identity-grid grid min-w-0 gap-3">
            <label className="field-label min-w-0">ID oferty Allegro *
              <input required value={form.offerId} onChange={(event) => updateField('offerId', event.target.value)} placeholder="np. 18445606385" className="mt-1 w-full p-2" />
            </label>
            <label className="field-label min-w-0">Nazwa produktu *
              <input required value={form.offerName} onChange={(event) => updateField('offerName', event.target.value)} placeholder="Nazwa widoczna w raportach" className="mt-1 w-full p-2" />
            </label>
            <label className="field-label min-w-0">SKU / kod własny
              <input value={form.sku} onChange={(event) => updateField('sku', event.target.value)} placeholder="Kod magazynowy" className="mt-1 w-full p-2" />
            </label>
          </div>

          <div className="product-pricing-grid grid min-w-0 gap-3">
            <label className="field-label">Zakup netto *
              <input required type="number" min="0" step="0.01" value={form.netPurchaseCost} onChange={(event) => updateField('netPurchaseCost', event.target.value)} placeholder="0,00" className="mt-1 w-full p-2" />
            </label>
            <label className="field-label">VAT zakupu (%)
              <input required type="number" min="0" max="100" step="0.01" value={form.purchaseVatRate} onChange={(event) => updateField('purchaseVatRate', event.target.value)} className="mt-1 w-full p-2" />
            </label>
            <label className="field-label">Odliczenie VAT (%)
              <input required type="number" min="0" max="100" step="1" value={form.vatDeductiblePercent} onChange={(event) => updateField('vatDeductiblePercent', event.target.value)} className="mt-1 w-full p-2" />
            </label>
            <label className="field-label">Sprzedaż netto
              <input type="number" min="0" step="0.01" value={form.netSalePrice} onChange={(event) => updateField('netSalePrice', event.target.value)} placeholder="Opcjonalnie" className="mt-1 w-full p-2" />
            </label>
            <label className="field-label">VAT sprzedaży (%)
              <input required type="number" min="0" max="100" step="0.01" value={form.salesVatRate} onChange={(event) => updateField('salesVatRate', event.target.value)} className="mt-1 w-full p-2" />
            </label>
            <label className="field-label">Waluta
              <input required maxLength={3} value={form.currency} onChange={(event) => updateField('currency', event.target.value.toUpperCase())} className="mt-1 w-full p-2 uppercase" />
            </label>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.isSmartOffer} onChange={(event) => updateField('isSmartOffer', event.target.checked)} />
            <span>Oferta korzysta z dostawy SMART</span>
          </label>
          <p className="text-xs text-gray-500">Warunki oznaczenia Smart! dla konta zwykłego (według pomocy Allegro): jakość sprzedaży wyższa niż Neutralny (lub co najmniej Neutralny na wszystkich kontach), brak zaległości w rozliczeniach, metoda Paczkomaty InPost z ceną wysyłki do 10,95 zł oraz ustawione warunki zwrotów z adresem w Polsce. Oznaczenia nie mają ogłoszenia ani oferty z kategorii: fajerwerki, mleka modyfikowane początkowe i leki weterynaryjne bez recepty. Aplikacja nie weryfikuje tych warunków — to ręczne oznaczenie.</p>

          <label className="field-label block">Notatki
            <textarea rows={2} value={form.notes} onChange={(event) => updateField('notes', event.target.value)} placeholder="Dostawca, wariant, daty obowiązywania kosztu…" className="mt-1 w-full p-2" />
          </label>

          <label className="vat-confirmation flex items-start gap-2 rounded border px-3 py-2 text-sm">
            <input type="checkbox" checked={form.vatVerified} onChange={(event) => updateField('vatVerified', event.target.checked)} />
            <span>Potwierdzam, że stawki VAT zakupu i sprzedaży oraz udział odliczenia są poprawne dla tego produktu.</span>
          </label>

          <div className="product-preview-grid grid min-w-0 gap-2">
            <div className="preview-stat"><span>VAT zakupu</span><strong>{form.vatVerified ? `${purchaseVat.toFixed(2)} ${form.currency}` : 'Do potwierdzenia'}</strong></div>
            <div className="preview-stat"><span>Efektywny koszt brutto</span><strong>{form.vatVerified ? `${purchaseGrossCost.toFixed(2)} ${form.currency}` : 'Do potwierdzenia'}</strong></div>
            <div className="preview-stat"><span>VAT nieodliczony</span><strong>{form.vatVerified ? `${(purchaseVat * (100 - deductiblePercent) / 100).toFixed(2)} ${form.currency}` : 'Do potwierdzenia'}</strong></div>
            <div className="preview-stat"><span>Cena brutto sprzedaży</span><strong>{!form.vatVerified || salesGrossPrice == null || !Number.isFinite(salesGrossPrice) ? '—' : `${salesGrossPrice.toFixed(2)} ${form.currency}`}</strong></div>
            <div className="preview-stat"><span>Minimalna cena netto / brutto</span><strong>{minimumFormPrice ? `${money(minimumFormPrice.net, form.currency)} / ${money(minimumFormPrice.gross, form.currency)}` : 'Potwierdź dane VAT'}</strong>{minimumFormPrice ? <button type="button" onClick={() => updateField('netSalePrice', minimumFormPrice.net.toFixed(2))} className="mt-1 text-left text-xs text-blue-600">Ustaw cenę minimalną</button> : null}</div>
          </div>
          <p className="text-xs text-gray-500">Minimalna cena spełnia jednocześnie próg zysku {money(minimumProfitAmount, form.currency)} i marży {minimumProfitMarginPercent}%, przed opłatami Allegro i Ads. Koszt uwzględnia wyłącznie VAT niepodlegający odliczeniu.</p>
          <p className="text-xs text-gray-500">Nowe pozycje z raportów nie otrzymują automatycznie założonych kosztów ani potwierdzonych stawek VAT.</p>

          {error ? <div role="alert" className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</div> : null}
          {notice ? <div role="status" className="rounded border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-300">{notice}</div> : null}
          <div className={`product-form-actions ${inline ? 'product-form-actions-inline' : ''} flex flex-wrap gap-2`}>
            <button type="submit" disabled={saving || !form.vatVerified} className="px-4 py-2 bg-green-600 text-white rounded">{saving ? 'Zapisuję…' : editing ? 'Zapisz zmiany' : 'Dodaj do katalogu'}</button>
            <button type="button" onClick={closeProductEditor} className="secondary-action px-4 py-2">Anuluj</button>
          </div>
        </form>
      </section>
    )
  }

  return (
    <div className="products-page flex min-h-0 flex-1 flex-col gap-5">
      <header className="flex shrink-0 flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow">KATALOG KOSZTÓW</div>
          <h2 className="section-title">Produkty</h2>
          <p className="mt-1 text-sm text-gray-500">Koszt zakupu, VAT i dane ofert Allegro używane w analizach marży.</p>
        </div>
        <button type="button" onClick={startNewProduct} className="px-4 py-2 bg-blue-600 text-white rounded">{showNewProductForm ? 'Zamknij formularz' : 'Dodaj produkt'}</button>
      </header>

      {showNewProductForm ? renderProductEditor() : null}

      <section className="product-catalog panel flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex flex-wrap items-end justify-between gap-3 p-4 sm:p-5">
          <div><h3 className="font-semibold">Katalog produktów</h3><p className="mt-1 text-xs text-gray-500">{products.length} produktów · {products.filter((product) => product.unit_cost == null || !product.vat_verified).length} wymaga uzupełnienia</p><p className="mt-1 text-xs text-gray-500">Progi: {minimumProfitAmount.toFixed(2)} w walucie produktu i {minimumProfitMarginPercent}% marży, oba warunki jednocześnie. Wynik jest przed opłatami Allegro i Ads.</p></div>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Szukaj: nazwa, ID oferty lub SKU" aria-label="Szukaj w katalogu produktów" className="w-full p-2 sm:w-80" />
        </div>
        <div
          className="table-scroll min-h-0 flex-1 overflow-auto"
        >
          <table className="w-full table-fixed text-left text-xs">
            <thead><tr><th className="w-[42%] p-2">Produkt</th><th className="w-[25%] p-2">Zysk / marża</th><th className="w-[18%] p-2">Sprzedaż brutto</th><th className="w-[15%] p-2">Szczegóły</th></tr></thead>
            <tbody>
              {loading && <tr><td colSpan={4} className="table-empty">Wczytywanie katalogu…</td></tr>}
              {!loading && filteredProducts.length === 0 && <tr><td colSpan={4} className="table-empty">{products.length ? 'Brak produktów pasujących do wyszukiwania.' : 'Katalog jest pusty. Zaimportuj rozliczenia lub dodaj produkt powyżej.'}</td></tr>}
              {filteredProducts.map((product) => {
                const estimatedProfit = product.vat_verified && product.sale_price_net != null && product.grossPurchaseCost != null
                  ? Math.round((product.sale_price_net - product.grossPurchaseCost) * 100) / 100
                  : null
                const estimatedMarginPercent = estimatedProfit != null && product.sale_price_net && product.sale_price_net > 0
                  ? estimatedProfit / product.sale_price_net * 100
                  : null
                const meetsMarginRules = estimatedProfit != null && estimatedMarginPercent != null &&
                  estimatedProfit >= minimumProfitAmount && estimatedMarginPercent >= minimumProfitMarginPercent
                const minimumSalePrice = product.vat_verified && product.grossPurchaseCost != null
                  ? calculateMinimumSalePrice(product.grossPurchaseCost, minimumProfitAmount, minimumProfitMarginPercent, product.sales_vat_rate)
                  : null
                return (
                  <React.Fragment key={product.offer_id}>
                  <tr>
                  <td className="min-w-0 p-2">
                    <strong className="block whitespace-normal break-words leading-snug" title={product.offer_name}>{product.offer_name}</strong>
                    <span className="block text-gray-500">SKU: {product.sku || '—'}</span>
                    <div className="mt-1 flex flex-wrap gap-1">{product.is_auto_discovered ? <span className="status-pill status-pill-accent">Z raportu</span> : null}{product.unit_cost == null ? <span className="status-pill status-pill-error">Brak kosztu</span> : null}{!product.vat_verified ? <span className="status-pill status-pill-error">VAT?</span> : null}{product.smartDeliveryOperations ? <span className="status-pill status-pill-success">SMART</span> : null}</div>
                  </td>
                  <td className="p-2">
                    {estimatedProfit == null || estimatedMarginPercent == null
                      ? <span className="status-pill">Uzupełnij dane</span>
                      : <><span className={`status-pill ${meetsMarginRules ? 'status-pill-success' : 'status-pill-error'}`}>{estimatedProfit < 0 ? 'STRATA' : meetsMarginRules ? 'PRÓG OK' : 'PONIŻEJ PROGU'}</span><strong className="mt-1 block">{money(estimatedProfit, product.currency)}</strong><span className="text-gray-500">Marża {estimatedMarginPercent.toFixed(1)}%</span></>}
                  </td>
                  <td className="p-2 font-medium">{money(product.estimatedGrossPrice, product.currency)}</td>
                  <td className="p-2"><button type="button" aria-expanded={expandedOptionsId === product.offer_id} onClick={() => setExpandedOptionsId((current) => current === product.offer_id ? null : product.offer_id)} className="secondary-action px-2 py-1">{expandedOptionsId === product.offer_id ? 'Ukryj' : 'Szczegóły'}</button></td>
                  </tr>
                  {expandedOptionsId === product.offer_id ? <tr><td colSpan={4} className="p-3">
                    {editing && form.offerId === product.offer_id ? renderProductEditor(true) : <section className="rounded border p-4">
                      <h4 className="font-semibold">Szczegóły produktu: {product.offer_name}</h4>
                      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3 lg:grid-cols-5">
                        <div><span className="text-gray-500">ID oferty</span><strong className="block break-all">{product.offer_id}</strong></div>
                        <div><span className="text-gray-500">SKU</span><strong className="block">{product.sku || '—'}</strong></div>
                        <div><span className="text-gray-500">Zakup netto</span><strong className="block">{money(product.unit_cost, product.currency)}</strong></div>
                        <div><span className="text-gray-500">VAT zakupu</span><strong className="block">{product.vat_verified ? `${product.purchase_vat_rate}% · ${money(product.purchaseVat, product.currency)}` : 'Do potwierdzenia'}</strong></div>
                        <div><span className="text-gray-500">Odliczenie VAT</span><strong className="block">{product.vat_verified ? `${product.vat_deductible_percent}%` : 'Do uzupełnienia'}</strong></div>
                        <div><span className="text-gray-500">Efektywny koszt brutto</span><strong className="block">{money(product.grossPurchaseCost, product.currency)}</strong></div>
                        <div><span className="text-gray-500">Sprzedaż netto</span><strong className="block">{money(product.sale_price_net, product.currency)}</strong></div>
                        <div><span className="text-gray-500">VAT sprzedaży</span><strong className="block">{product.vat_verified ? `${product.sales_vat_rate}%` : 'Do uzupełnienia'}</strong></div>
                        <div><span className="text-gray-500">Sprzedaż brutto</span><strong className="block">{money(product.estimatedGrossPrice, product.currency)}</strong></div>
                        <div><span className="text-gray-500">Oferta SMART</span><strong className="block">{product.is_smart_offer ? 'Tak' : 'Nie'}</strong></div>
                        <div><span className="text-gray-500">Minimalna cena netto</span><strong className="block">{money(minimumSalePrice?.net, product.currency)}</strong></div>
                        <div><span className="text-gray-500">Minimalna cena brutto</span><strong className="block">{money(minimumSalePrice?.gross, product.currency)}</strong></div>
                        <div><span className="text-gray-500">Opłaty Allegro netto</span><strong className="block">{product.sellerFeeOperations ? money(product.sellerFeesNet, product.currency) : '—'}</strong></div>
                        <div><span className="text-gray-500">Obciążenia / korekty</span><strong className="block">{money(product.sellerFeeDebits, product.currency)} / {money(product.sellerFeeCredits, product.currency)}</strong></div>
                        <div><span className="text-gray-500">SMART / dostawa · rozliczenia</span><strong className="block">{product.smartDeliveryOperations ? `${money(product.smartDeliveryFeesNet, product.currency)} · ${product.smartDeliveryOperations} operacji` : 'Brak danych'}</strong></div>
                        <div><span className="text-gray-500">Okres opłat</span><strong className="block">{product.sellerFeeDateFrom || '—'} – {product.sellerFeeDateTo || '—'}</strong></div>
                        <div><span className="text-gray-500">Wynik / marża</span><strong className="block">{estimatedProfit == null || estimatedMarginPercent == null ? 'Uzupełnij dane' : `${money(estimatedProfit, product.currency)} · ${estimatedMarginPercent.toFixed(1)}%`}</strong></div>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                          <button type="button" onClick={() => editProduct(product)} className="secondary-action px-3 py-1">Edytuj dane</button>
                          <button type="button" onClick={() => removeProduct(product)} className="secondary-action px-3 py-1 text-red-300">Usuń produkt</button>
                      </div>
                    </section>}
                  </td></tr> : null}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
