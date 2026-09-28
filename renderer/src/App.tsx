import React, { useState } from 'react'
import ImportPage from './pages/Import'
import Dashboard from './pages/Dashboard'
import UserPanel from './components/UserPanel'
import SettingsPage from './pages/Settings'
import OrdersPage from './pages/Orders'
import CostsPage from './pages/Costs'
import ReportsPage from './pages/Reports'
import ProductsPage from './pages/Products'

const pageTitles: Record<string, string> = {
  home: 'Pulpit',
  import: 'Import danych',
  orders: 'Zamówienia',
  products: 'Produkty i VAT',
  costs: 'Koszty i produkty',
  reports: 'Raporty',
  settings: 'Ustawienia'
}

export default function App() {
  const [page, setPage] = useState('home')
  const [mobileOpen, setMobileOpen] = useState(false)
  const navigateTo = (nextPage: string) => {
    setPage(nextPage)
    setMobileOpen(false)
  }

  return (
    <div className="app-shell min-h-screen flex">
      <UserPanel page={page} setPage={navigateTo} mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      <button
        aria-label="Zamknij nawigację"
        tabIndex={mobileOpen ? 0 : -1}
        className={`mobile-nav-backdrop ${mobileOpen ? 'mobile-nav-backdrop-open' : ''}`}
        onClick={() => setMobileOpen(false)}
      />

      <div className="app-main flex-1 flex flex-col">
        <header className="app-header flex items-center justify-between bg-white border-b">
          <div className="header-title-wrap">
            <button
              className="mobile-menu-button md:hidden"
              aria-label={mobileOpen ? 'Zamknij menu' : 'Otwórz menu'}
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen((open) => !open)}
            >
              <span aria-hidden="true">{mobileOpen ? '×' : '☰'}</span>
            </button>
            <span className="header-title-mark" aria-hidden="true" />
            <h1 className="page-title">{pageTitles[page] || 'Allegro Profit Analyzer'}</h1>
          </div>
          <div className="local-status">Dane lokalne</div>
        </header>

        <main className={`app-content${page === 'products' ? ' app-content-products' : ''}`}>
          <div>
            {page === 'home' && <Dashboard onNavigate={navigateTo} />}
            {page === 'import' && <ImportPage />}
            {page === 'orders' && <OrdersPage />}
            {page === 'products' && <ProductsPage />}
            {page === 'costs' && <CostsPage />}
            {page === 'reports' && <ReportsPage />}
            {page === 'settings' && (
              <div className="p-6">
                <div className="max-w-4xl">
                  <React.Suspense fallback={<div>Ładowanie...</div>}>
                    <SettingsPage />
                  </React.Suspense>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
