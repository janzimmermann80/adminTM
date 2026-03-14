import { useState, useEffect } from 'react'
import { getInvoices } from '../../api'
import { Spinner } from '../../components/Spinner'
import { Pagination } from '../../components/Pagination'
import { formatDate, formatNumber } from '../../utils'
import type { Invoice } from '../../types'
import { INVOICE_SERIES_LABELS } from '../../types'

interface Props { companyKey: string }

const LIMIT = 10

export const TabInvoices = ({ companyKey }: Props) => {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = async (off = 0) => {
    setLoading(true)
    try {
      const res = await getInvoices(companyKey, off, LIMIT)
      setInvoices(res.data)
      setTotal(res.total)
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [companyKey])

  const handlePage = (off: number) => {
    setOffset(off)
    load(off)
  }

  if (loading && !invoices.length) return <div className="flex justify-center py-12"><Spinner size={8} /></div>

  return (
    <div>
      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm mb-4">{error}</div>}

      <div className="flex items-center justify-between mb-4">
        <span className="text-sm text-gray-500">Celkem faktur: <strong>{total}</strong></span>
        {loading && <Spinner size={4} />}
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wide">
              <th className="px-4 py-3 font-medium">Číslo</th>
              <th className="px-4 py-3 font-medium hidden sm:table-cell">Série</th>
              <th className="px-4 py-3 font-medium">Vydáno</th>
              <th className="px-4 py-3 font-medium hidden md:table-cell">Splnění</th>
              <th className="px-4 py-3 font-medium hidden md:table-cell">Splatnost</th>
              <th className="px-4 py-3 font-medium hidden sm:table-cell">Uhrazeno</th>
              <th className="px-4 py-3 font-medium text-right">Celkem</th>
              <th className="px-4 py-3 font-medium text-right hidden lg:table-cell">Základ</th>
              <th className="px-4 py-3 font-medium hidden lg:table-cell">Storno</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {invoices.map(inv => {
              const isCancelled = Boolean(inv.cancellation)
              const isSettled = Boolean(inv.settlement)
              return (
                <tr key={inv.invoice_key}
                  className={`hover:bg-gray-50 transition-colors ${isCancelled ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">
                    {inv.year}/{inv.series}{inv.number}
                    {inv.proforma_number && (
                      <span className="ml-1 text-teal-500">(P{inv.proforma_number})</span>
                    )}
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <span className="bg-gray-100 text-gray-600 rounded px-1.5 py-0.5 text-xs">
                      {INVOICE_SERIES_LABELS[inv.series] ?? inv.series}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{formatDate(inv.issued)}</td>
                  <td className="px-4 py-3 text-gray-600 hidden md:table-cell">{formatDate(inv.fulfilment)}</td>
                  <td className="px-4 py-3 text-gray-600 hidden md:table-cell">{formatDate(inv.maturity)}</td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    {isSettled ? (
                      <span className="flex items-center gap-1 text-green-600 text-xs">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        {formatDate(inv.settlement)}
                      </span>
                    ) : (
                      <span className="text-orange-500 text-xs font-medium">Neuhrazeno</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums">
                    {formatNumber(inv.total)} {inv.currency !== 'CZK' ? inv.currency : 'Kč'}
                    {inv.curr_total != null && inv.currency !== 'CZK' && (
                      <div className="text-xs text-gray-400">{formatNumber(inv.curr_total)} Kč</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-500 tabular-nums hidden lg:table-cell">
                    {formatNumber(inv.price)} {inv.currency !== 'CZK' ? inv.currency : 'Kč'}
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    {isCancelled && (
                      <span className="text-red-500 text-xs font-medium">
                        {formatDate(inv.cancellation)}
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
            {invoices.length === 0 && !loading && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-gray-400">Žádné faktury</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination total={total} limit={LIMIT} offset={offset} onChange={handlePage} />
    </div>
  )
}
