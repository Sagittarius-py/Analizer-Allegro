import React, { useEffect, useState } from 'react'
import { ChartNoAxesCombined, FileInput, LayoutDashboard, PackageSearch, Settings2, WalletCards } from 'lucide-react'

const navigation = [
  { id: 'home', label: 'Pulpit', icon: LayoutDashboard },
  { id: 'import', label: 'Import danych', icon: FileInput },
  { id: 'orders', label: 'Zamówienia', icon: PackageSearch },
  { id: 'products', label: 'Produkty i VAT', icon: PackageSearch },
  { id: 'costs', label: 'Koszty', icon: ChartNoAxesCombined },
  { id: 'reports', label: 'Raporty', icon: WalletCards },
  { id: 'settings', label: 'Ustawienia', icon: Settings2 }
]

type UserPanelProps = {
  page: string
  setPage: (page: string) => void
  mobileOpen: boolean
  onClose: () => void
}

export default function UserPanel({ page, setPage, mobileOpen, onClose }: UserPanelProps) {
  const [minimumProfitAmount, setMinimumProfitAmount] = useState(10)
  const [minimumProfitMarginPercent, setMinimumProfitMarginPercent] = useState(10)
  const [currency, setCurrency] = useState('PLN')

  useEffect(() => {
    let active = true

    async function loadMarginRules() {
      const settings = (window as any).allegroSettings
      if (!settings?.get) return
      try {
        const [amount, margin, defaultCurrency] = await Promise.all([
          settings.get('minimum_profit_amount'),
          settings.get('minimum_profit_margin_percent'),
          settings.get('default_currency')
        ])
        if (!active) return
        if (amount != null && Number.isFinite(Number(amount)) && Number(amount) >= 0) setMinimumProfitAmount(Number(amount))
        if (margin != null && Number.isFinite(Number(margin)) && Number(margin) >= 0 && Number(margin) < 100) setMinimumProfitMarginPercent(Number(margin))
        if (typeof defaultCurrency === 'string' && /^[A-Z]{3}$/.test(defaultCurrency)) setCurrency(defaultCurrency)
      } catch (error) {
        console.error('Margin rules load failed', error)
      }
    }

    loadMarginRules()
    return () => { active = false }
  }, [page])

  const formattedMinimumProfit = new Intl.NumberFormat('pl-PL', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(minimumProfitAmount)

  return (
    <aside className={`side-panel bg-white border-r ${mobileOpen ? 'side-panel-open' : ''}`} aria-label="Nawigacja główna">
      <div className="p-4">
        <div className="flex items-center gap-3">
          <div className="brand-mark" aria-hidden="true">AA</div>
          <div>
            <div className="font-semibold">Allegro Analyzer</div>
            <div className="text-xs text-gray-500">Analiza sprzedaży i zysków</div>
          </div>
        </div>

        <nav className="side-nav" aria-label="Sekcje aplikacji">
          {navigation.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => { setPage(item.id); onClose() }}
              aria-current={page === item.id ? 'page' : undefined}
              className={`nav-item flex w-full items-center gap-3 text-left px-3 py-2 ${page === item.id ? 'nav-item-active' : ''}`}
            >
              <item.icon size={17} strokeWidth={1.8} aria-hidden="true" />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <section className="margin-rules-summary" aria-labelledby="margin-rules-summary-title">
          <h2 id="margin-rules-summary-title" className="margin-rules-heading">Zasady marży</h2>
          <div className="margin-rules-values">
            <p>Min. kwotowo: <strong>{formattedMinimumProfit}</strong></p>
            <p>Min. procentowo: <strong>{minimumProfitMarginPercent}%</strong></p>
          </div>
          <p className="margin-rules-note">Oba warunki jednocześnie. Zysk przed Ads.</p>
          <button
            type="button"
            onClick={() => { setPage('settings'); onClose() }}
            className="margin-rules-edit"
          >
            Zmień zasady
          </button>
        </section>
      </div>
    </aside>
  )
}
