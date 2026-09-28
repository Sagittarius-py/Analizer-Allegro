import React from 'react'

const navigation = [
  { id: 'home', label: 'Dashboard' },
  { id: 'import', label: 'Import' },
  { id: 'orders', label: 'Zamówienia' },
  { id: 'costs', label: 'Koszty' },
  { id: 'reports', label: 'Raporty' },
  { id: 'settings', label: 'Ustawienia' }
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
            <div className="text-xs text-gray-500">Profit workspace</div>
          </div>
        </div>

        <nav className="side-nav" aria-label="Sekcje aplikacji">
          {navigation.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => { setPage(item.id); onClose() }}
              aria-current={page === item.id ? 'page' : undefined}
              className={`nav-item w-full text-left px-3 py-2 ${page === item.id ? 'nav-item-active' : ''}`}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </div>
    </aside>
  )
}
