const reportTypeLabels: Record<string, string> = {
  orders: 'Zamówienia',
  billing: 'Rozliczenia'
}

const costCategoryLabels: Record<string, string> = {
  commission: 'Prowizje',
  delivery: 'Dostawa',
  advertising: 'Reklama',
  subscription: 'Abonamenty',
  other_fee: 'Pozostałe opłaty',
  internal: 'Operacje wewnętrzne',
  other: 'Pozostałe'
}

const orderStatusLabels: Record<string, string> = {
  NEW: 'Nowe',
  PROCESSING: 'W realizacji',
  READY_FOR_PROCESSING: 'Do przygotowania',
  READY_FOR_SHIPMENT: 'Gotowe do wysyłki',
  WAITING_FOR_PAYMENT: 'Oczekuje na płatność',
  PAYMENT_REQUIRED: 'Wymaga płatności',
  PAYMENT_COMPLETED: 'Opłacone',
  PICKED_UP: 'Odebrane',
  FULFILLED: 'Zrealizowane',
  COMPLETED: 'Zakończone',
  SENT: 'Wysłane',
  CANCELLED: 'Anulowane',
  RETURNED: 'Zwrócone',
  ON_HOLD: 'Wstrzymane',
  PENDING: 'Oczekujące'
}

export function translateReportType(value: string | null | undefined) {
  if (!value) return 'Nieznany typ'
  return reportTypeLabels[value.toLowerCase()] || value
}

export function translateCostCategory(value: string | null | undefined) {
  if (!value) return 'Bez kategorii'
  return costCategoryLabels[value.toLowerCase()] || value
}

export function translateOrderStatus(value: string | null | undefined) {
  if (!value) return 'Nieznany status'
  return orderStatusLabels[value.toUpperCase()] || value.replace(/_/g, ' ')
}

export function formatLocalDate(value: string | number | Date | null | undefined) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat('pl-PL', {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(date)
}
