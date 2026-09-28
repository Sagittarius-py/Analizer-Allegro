import React from 'react'

export default function MetricCard({ title, value, subtitle, children }: { title: string; value: string | number; subtitle?: string; children?: React.ReactNode }) {
  return (
    <div className="metric-card p-4 flex flex-col">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm text-gray-500">{title}</div>
          <div className="text-2xl font-semibold mt-1">{value}</div>
          {subtitle ? <div className="text-xs text-gray-400 mt-1">{subtitle}</div> : null}
        </div>
        <div className="w-32 h-12">{children}</div>
      </div>
    </div>
  )
}
