import React from 'react'
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
      </div>
    </aside>
  )
}
