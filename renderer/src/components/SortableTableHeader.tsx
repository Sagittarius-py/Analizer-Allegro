import React from 'react'
import type { SortDirection } from '../utils/tableSorting'

type Props = {
  label: string
  sortKey: string
  activeSortKey: string
  direction: SortDirection
  onSort: (sortKey: string) => void
  className?: string
}

export default function SortableTableHeader({
  label,
  sortKey,
  activeSortKey,
  direction,
  onSort,
  className = ''
}: Props) {
  const active = sortKey === activeSortKey
  return (
    <th aria-sort={active ? direction === 'asc' ? 'ascending' : 'descending' : 'none'} className={className}>
      <button type="button" onClick={() => onSort(sortKey)} className="inline-flex items-center gap-1 text-left hover:text-current focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
        {label}
        <span aria-hidden="true" className="text-[10px] opacity-70">{active ? direction === 'asc' ? '↑' : '↓' : '↕'}</span>
      </button>
    </th>
  )
}
