import React, { useEffect, useRef, useState } from 'react'

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
  currency: 'PLN',
  notes: ''
}

const money = (value: number | null | undefined, currency = 'PLN') => value == null
  ? '—'
  : new Intl.NumberFormat('pl-PL', { style: 'currency', currency, minimumFractionDigits: 2 }).format(value)

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [productTableWidth, setProductTableWidth] = useState(0)
  const productTableRef = useRef<HTMLTableElement>(null)
  const productTableScrollerRef = useRef<HTMLDivElement>(null)
  const stickyScrollerRef = useRef<HTMLDivElement>(null)
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

  useEffect(() => { loadProducts() }, [])

  useEffect(() => {
    const measureTable = () => setProductTableWidth(productTableRef.current?.scrollWidth || 0)
    measureTable()
    const observer = new ResizeObserver(measureTable)
    if (productTableRef.current) observer.observe(productTableRef.current)
    if (productTableScrollerRef.current) observer.observe(productTableScrollerRef.current)
    return () => observer.disconnect()
  }, [products.length, search, loading])

  function syncHorizontalScroll(source: HTMLDivElement, target: HTMLDivElement | null) {
    if (target && target.scrollLeft !== source.scrollLeft) target.scrollLeft = source.scrollLeft
  }

  function updateField(field: keyof ProductForm, value: string | boolean) {
    setForm((current) => ({ ...current, [field]: value }))
    setError(null)
    setNotice(null)
  }

  function startNewProduct() {
    setEditing(false)
    setForm(emptyForm)
    setError(null)
    setNotice(null)
  }

  function editProduct(product: Product) {
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
      currency: product.currency || 'PLN',
      notes: product.notes || ''
    })
    setError(null)
    setNotice(null)
    document.getElementById('product-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
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
      if (form.offerId === product.offer_id) startNewProduct()
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

  return (
    <div className="products-page flex min-h-0 flex-1 flex-col gap-5">
      <header className="flex shrink-0 flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow">KATALOG KOSZTÓW</div>
          <h2 className="section-title">Produkty</h2>
          <p className="mt-1 text-sm text-gray-500">Koszt zakupu, VAT i dane ofert Allegro używane w analizach marży.</p>
        </div>
        <button type="button" onClick={startNewProduct} className="px-4 py-2 bg-blue-600 text-white rounded">Dodaj produkt</button>
      </header>

      <div className="product-workspace grid min-h-0 flex-1 gap-5">
      <section id="product-form" className="product-editor panel min-h-0 overflow-auto p-4 sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-semibold">{editing ? 'Edytuj produkt' : 'Dane produktu'}</h3>
          <span className="text-xs text-gray-500">Wymagane: ID oferty, nazwa i koszt netto</span>
        </div>
        <form className="mt-4 space-y-4" onSubmit={saveProduct}>
          <div className="product-identity-grid grid gap-3">
            <label className="field-label product-offer-id">ID oferty Allegro *
              <input required value={form.offerId} onChange={(event) => updateField('offerId', event.target.value)} placeholder="np. 18445606385" className="mt-1 w-full p-2" />
            </label>
            <label className="field-label product-offer-name">Nazwa produktu *
              <input required value={form.offerName} onChange={(event) => updateField('offerName', event.target.value)} placeholder="Nazwa widoczna w raportach" className="mt-1 w-full p-2" />
            </label>
            <label className="field-label product-sku">SKU / kod własny
              <input value={form.sku} onChange={(event) => updateField('sku', event.target.value)} placeholder="Kod magazynowy" className="mt-1 w-full p-2" />
            </label>
          </div>

          <div className="product-pricing-grid grid gap-3">
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

          <label className="field-label block">Notatki
            <textarea rows={2} value={form.notes} onChange={(event) => updateField('notes', event.target.value)} placeholder="Dostawca, wariant, daty obowiązywania kosztu…" className="mt-1 w-full p-2" />
          </label>

          <label className="vat-confirmation flex items-start gap-2 rounded border px-3 py-2 text-sm">
            <input type="checkbox" checked={form.vatVerified} onChange={(event) => updateField('vatVerified', event.target.checked)} />
            <span>Potwierdzam, że stawki VAT zakupu i sprzedaży oraz udział odliczenia są poprawne dla tego produktu.</span>
          </label>

          <div className="product-preview-grid grid gap-2">
            <div className="preview-stat"><span>VAT zakupu</span><strong>{form.vatVerified ? `${purchaseVat.toFixed(2)} ${form.currency}` : 'Do potwierdzenia'}</strong></div>
            <div className="preview-stat"><span>Efektywny koszt brutto</span><strong>{form.vatVerified ? `${purchaseGrossCost.toFixed(2)} ${form.currency}` : 'Do potwierdzenia'}</strong></div>
            <div className="preview-stat"><span>VAT nieodliczony</span><strong>{form.vatVerified ? `${(purchaseVat * (100 - deductiblePercent) / 100).toFixed(2)} ${form.currency}` : 'Do potwierdzenia'}</strong></div>
            <div className="preview-stat"><span>Cena brutto sprzedaży</span><strong>{!form.vatVerified || salesGrossPrice == null || !Number.isFinite(salesGrossPrice) ? '—' : `${salesGrossPrice.toFixed(2)} ${form.currency}`}</strong></div>
          </div>
          <p className="text-xs text-gray-500">Koszt brutto uwzględnia wyłącznie VAT niepodlegający odliczeniu. Nowe pozycje z raportów nie otrzymują automatycznie założonych kosztów ani potwierdzonych stawek VAT.</p>

          {error ? <div role="alert" className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</div> : null}
          {notice ? <div role="status" className="rounded border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-300">{notice}</div> : null}
          <div className="product-form-actions flex flex-wrap gap-2">
            <button type="submit" disabled={saving || !form.vatVerified} className="px-4 py-2 bg-green-600 text-white rounded">{saving ? 'Zapisuję…' : editing ? 'Zapisz zmiany' : 'Dodaj do katalogu'}</button>
            {editing ? <button type="button" onClick={startNewProduct} className="secondary-action px-4 py-2">Anuluj edycję</button> : null}
          </div>
        </form>
      </section>

      <section className="product-catalog panel flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex flex-wrap items-end justify-between gap-3 p-4 sm:p-5">
          <div><h3 className="font-semibold">Katalog produktów</h3><p className="mt-1 text-xs text-gray-500">{products.length} produktów · {products.filter((product) => product.unit_cost == null || !product.vat_verified).length} wymaga uzupełnienia</p></div>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Szukaj: nazwa, ID oferty lub SKU" aria-label="Szukaj w katalogu produktów" className="w-full p-2 sm:w-80" />
        </div>
        {productTableWidth > (productTableScrollerRef.current?.clientWidth || 0) ? <div
          ref={stickyScrollerRef}
          className="product-sticky-scrollbar table-scroll shrink-0"
          role="region"
          aria-label="Przewijanie poziome tabeli produktów"
          tabIndex={0}
          onScroll={(event) => syncHorizontalScroll(event.currentTarget, productTableScrollerRef.current)}
        ><div style={{ width: productTableWidth, height: 1 }} /></div> : null}
        <div
          ref={productTableScrollerRef}
          className="table-scroll min-h-0 flex-1 overflow-auto"
          onScroll={(event) => syncHorizontalScroll(event.currentTarget, stickyScrollerRef.current)}
        >
          <table ref={productTableRef} className="w-full min-w-[1460px] text-left text-xs">
            <thead><tr><th>ID oferty</th><th>Produkt / SKU</th><th>Zakup netto</th><th>VAT zakupu</th><th>Odliczenie</th><th>Koszt brutto</th><th>Sprzedaż netto</th><th>VAT sprzedaży</th><th>Sprzedaż brutto</th><th>Opłaty Allegro netto</th><th>Operacje / okres</th><th>Akcje</th></tr></thead>
            <tbody>
              {loading && <tr><td colSpan={12} className="table-empty">Wczytywanie katalogu…</td></tr>}
              {!loading && filteredProducts.length === 0 && <tr><td colSpan={12} className="table-empty">{products.length ? 'Brak produktów pasujących do wyszukiwania.' : 'Katalog jest pusty. Zaimportuj rozliczenia lub dodaj produkt powyżej.'}</td></tr>}
              {filteredProducts.map((product) => (
                <tr key={product.offer_id}>
                  <td>{product.offer_id}</td>
                  <td><strong className="block min-w-[340px] whitespace-normal break-words leading-snug text-gray-800" title={product.offer_name}>{product.offer_name}</strong><span className="text-gray-500">SKU: {product.sku || '—'}</span><div className="mt-1 flex flex-wrap gap-1">{product.is_auto_discovered ? <span className="status-pill status-pill-accent">Wykryty z raportu</span> : null}{product.unit_cost == null ? <span className="status-pill status-pill-error">Brak kosztu</span> : null}{!product.vat_verified ? <span className="status-pill status-pill-error">Potwierdź VAT</span> : null}</div></td>
                  <td>{money(product.unit_cost, product.currency)}</td>
                  <td>{product.vat_verified ? `${product.purchase_vat_rate}% (${money(product.purchaseVat, product.currency)})` : 'Do uzupełnienia'}</td>
                  <td>{product.vat_verified ? `${product.vat_deductible_percent}%` : 'Do uzupełnienia'}</td>
                  <td><strong>{money(product.grossPurchaseCost, product.currency)}</strong></td>
                  <td>{money(product.sale_price_net, product.currency)}</td>
                  <td>{product.vat_verified ? `${product.sales_vat_rate}%` : 'Do uzupełnienia'}</td>
                  <td>{money(product.estimatedGrossPrice, product.currency)}</td>
                  <td><strong>{product.sellerFeeOperations ? money(product.sellerFeesNet, product.currency) : '—'}</strong><div className="text-gray-500">Obciążenia {money(product.sellerFeeDebits, product.currency)} · korekty {money(product.sellerFeeCredits, product.currency)}</div></td>
                  <td>{product.sellerFeeOperations ? <><div>{product.sellerFeeOperations} operacji</div><div className="text-gray-500">{product.sellerFeeDateFrom || '—'} – {product.sellerFeeDateTo || '—'}</div></> : '—'}</td>
                  <td><div className="flex gap-2"><button type="button" onClick={() => editProduct(product)} className="secondary-action px-2 py-1">Edytuj</button><button type="button" onClick={() => removeProduct(product)} className="icon-action" aria-label={`Usuń ${product.offer_name}`}>×</button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      </div>
    </div>
  )
}
