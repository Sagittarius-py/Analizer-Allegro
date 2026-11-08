import { sortRows } from '../renderer/src/utils/tableSorting'

describe('sortRows', () => {
  it('sorts numbers and keeps missing values last in both directions', () => {
    const rows = [{ value: 10 }, { value: null }, { value: 2 }, { value: 10 }]
    expect(sortRows(rows, (row) => row.value, 'asc')).toEqual([
      { value: 2 },
      { value: 10 },
      { value: 10 },
      { value: null }
    ])
    expect(sortRows(rows, (row) => row.value, 'desc')).toEqual([
      { value: 10 },
      { value: 10 },
      { value: 2 },
      { value: null }
    ])
  })

  it('sorts text naturally and preserves source order for equal values', () => {
    const rows = [{ value: 'Oferta 10' }, { value: 'oferta 2' }, { value: 'Oferta 2' }]
    expect(sortRows(rows, (row) => row.value, 'asc')).toEqual([
      { value: 'oferta 2' },
      { value: 'Oferta 2' },
      { value: 'Oferta 10' }
    ])
  })
})
