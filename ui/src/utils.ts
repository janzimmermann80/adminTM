export const formatDate = (d: string | Date | null | undefined): string => {
  if (!d) return ''
  if (d instanceof Date) {
    const dd = String(d.getDate()).padStart(2, '0')
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    return `${dd}.${mm}.${d.getFullYear()}`
  }
  // ISO datetime: 2024-01-15T10:30:00.000Z
  if (d.includes('T')) {
    const date = new Date(d)
    const dd = String(date.getDate()).padStart(2, '0')
    const mm = String(date.getMonth() + 1).padStart(2, '0')
    return `${dd}.${mm}.${date.getFullYear()}`
  }
  // YYYY-MM-DD
  if (d.match(/^\d{4}-\d{2}-\d{2}/)) {
    const [y, m, day] = d.slice(0, 10).split('-')
    return `${day}.${m}.${y}`
  }
  // Already DD.MM.YYYY
  return d.slice(0, 10)
}

export const formatNumber = (n: number | null | undefined, decimals = 2): string => {
  if (n == null) return ''
  const parts = Number(n).toFixed(decimals).split('.')
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0')
  return parts.join(',')
}

export const formatCurrency = (amount: number | null | undefined, currency = 'CZK'): string => {
  if (amount == null) return ''
  return `${formatNumber(amount)} ${currency}`
}

export const parseApiDate = (d: string | null | undefined): string => {
  // Convert YYYY-MM-DD to input[type=date] format (YYYY-MM-DD) — no change needed
  // Convert DD.MM.YYYY to YYYY-MM-DD for input
  if (!d) return ''
  if (d.match(/^\d{2}\.\d{2}\.\d{4}/)) {
    const [day, m, y] = d.slice(0, 10).split('.')
    return `${y}-${m}-${day}`
  }
  return d.slice(0, 10)
}
