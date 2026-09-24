import React from 'react'

export default function UserPanel({ page, setPage }: { page: string; setPage: (p: string) => void }) {
  return (
    <aside className="w-64 hidden md:block bg-white dark:bg-gray-800 border-r">
      <div className="p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-pink-500 flex items-center justify-center text-white font-bold">AA</div>
          <div>
            <div className="font-semibold">Allegro Analyzer</div>
            <div className="text-xs text-gray-500">Lokalna aplikacja</div>
          </div>
        </div>

        <nav className="mt-6 space-y-1">
          <button onClick={() => setPage('home')} className={`w-full text-left px-3 py-2 rounded ${page === 'home' ? 'bg-gray-100 dark:bg-gray-700' : 'hover:bg-gray-50'}`}>Dashboard</button>
          <button onClick={() => setPage('import')} className={`w-full text-left px-3 py-2 rounded ${page === 'import' ? 'bg-gray-100 dark:bg-gray-700' : 'hover:bg-gray-50'}`}>Import</button>
          <button onClick={() => setPage('orders')} className={`w-full text-left px-3 py-2 rounded ${page === 'orders' ? 'bg-gray-100 dark:bg-gray-700' : 'hover:bg-gray-50'}`}>Zamówienia</button>
          <button onClick={() => setPage('costs')} className={`w-full text-left px-3 py-2 rounded ${page === 'costs' ? 'bg-gray-100 dark:bg-gray-700' : 'hover:bg-gray-50'}`}>Koszty</button>
          <button onClick={() => setPage('reports')} className={`w-full text-left px-3 py-2 rounded ${page === 'reports' ? 'bg-gray-100 dark:bg-gray-700' : 'hover:bg-gray-50'}`}>Raporty</button>
          <button onClick={() => setPage('settings')} className={`w-full text-left px-3 py-2 rounded ${page === 'settings' ? 'bg-gray-100 dark:bg-gray-700' : 'hover:bg-gray-50'}`}>Ustawienia</button>
        </nav>
      </div>
    </aside>
  )
}
