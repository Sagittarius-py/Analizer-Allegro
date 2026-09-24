import React, { useState } from 'react'
import ImportPage from './pages/Import'
import Dashboard from './pages/Dashboard'
import UserPanel from './components/UserPanel'
import SettingsPage from './pages/Settings'
import OrdersPage from './pages/Orders'
import CostsPage from './pages/Costs'
import ReportsPage from './pages/Reports'

export default function App() {
  const [page, setPage] = useState('home')
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex">
      <UserPanel page={page} setPage={setPage} />

      <div className="flex-1 flex flex-col">
        <header className="flex items-center justify-between p-4 bg-white dark:bg-gray-800 border-b">
          <div className="flex items-center gap-3">
            <button className="md:hidden px-2 py-1 bg-gray-100 rounded" onClick={() => setMobileOpen(!mobileOpen)}>Menu</button>
            <h1 className="text-lg font-bold">Allegro Profit Analyzer</h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-sm text-gray-600">Lokalnie</div>
            <div className="w-8 h-8 rounded-full bg-gray-200" />
          </div>
        </header>

        <main className="p-6">
          <div className="max-w-6xl mx-auto">
            {page === 'home' && <Dashboard />}
            {page === 'import' && <ImportPage />}
            {page === 'orders' && <OrdersPage />}
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
