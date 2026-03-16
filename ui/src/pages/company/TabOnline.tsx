import { useState, useEffect } from 'react'
import { getOnlineLog } from '../../api'
import { Spinner } from '../../components/Spinner'

interface Props { companyKey: string }

const PAGE_SIZE = 20

export const TabOnline = ({ companyKey }: Props) => {
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(0)
  const [filter, setFilter] = useState('')

  useEffect(() => {
    setLoading(true)
    getOnlineLog(companyKey)
      .then(setRows)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [companyKey])

  if (loading) return <div className="flex justify-center py-16"><Spinner size={8} /></div>
  if (error) return <div className="text-red-600 text-sm p-4">{error}</div>

  const filtered = filter
    ? rows.filter(r =>
        (r.action ?? '').toLowerCase().includes(filter.toLowerCase()) ||
        (r.detail ?? '').toLowerCase().includes(filter.toLowerCase())
      )
    : rows

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  const formatDt = (t: string) => {
    if (!t) return '—'
    const d = new Date(t)
    if (isNaN(d.getTime())) return t
    return d.toLocaleString('cs-CZ', { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            className="pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg w-full outline-none focus:ring-2 focus:ring-teal-500"
            placeholder="Hledat akci nebo detail…"
            value={filter}
            onChange={e => { setFilter(e.target.value); setPage(0) }}
          />
        </div>
        <span className="text-sm text-gray-400">{filtered.length} záznamů</span>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">Žádné záznamy</div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                  <th className="text-left px-4 py-2.5 font-medium w-48">Datum a čas</th>
                  <th className="text-left px-4 py-2.5 font-medium w-40">Akce</th>
                  <th className="text-left px-4 py-2.5 font-medium">Detail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paged.map((row, i) => (
                  <tr key={i} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-2 font-mono text-xs text-gray-500 whitespace-nowrap">{formatDt(row.time)}</td>
                    <td className="px-4 py-2 text-gray-700 whitespace-nowrap">{row.action ?? '—'}</td>
                    <td className="px-4 py-2 text-gray-500 text-xs break-all">{row.detail ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <span className="text-xs text-gray-400">
                Strana {page + 1} / {totalPages}
              </span>
              <div className="flex gap-1">
                <button
                  onClick={() => setPage(0)}
                  disabled={page === 0}
                  className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40"
                >|&lt;</button>
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40"
                >&lt;</button>
                <button
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40"
                >&gt;</button>
                <button
                  onClick={() => setPage(totalPages - 1)}
                  disabled={page >= totalPages - 1}
                  className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40"
                >&gt;|</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
