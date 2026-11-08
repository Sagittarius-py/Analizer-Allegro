export type SortDirection = 'asc' | 'desc'

export function sortRows<T>(
  rows: T[],
  getValue: (row: T) => string | number | null | undefined,
  direction: SortDirection
): T[] {
  const multiplier = direction === 'asc' ? 1 : -1
  return rows
    .map((row, index) => ({ row, index, value: getValue(row) }))
    .sort((left, right) => {
      if (left.value == null) return right.value == null ? left.index - right.index : 1
      if (right.value == null) return -1
      const comparison = typeof left.value === 'number' && typeof right.value === 'number'
        ? left.value - right.value
        : String(left.value).localeCompare(String(right.value), 'pl-PL', { numeric: true, sensitivity: 'base' })
      return comparison === 0 ? left.index - right.index : comparison * multiplier
    })
    .map(({ row }) => row)
}
