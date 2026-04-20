import React from 'react'
import { Layout } from '../components/Layout'
import { getInvoicingList } from '../api'
import { CompanyDetailModal } from '../components/CompanyDetailModal'
import { Spinner } from '../components/Spinner'
import { INVOICE_SERIES_LABELS } from '../types'
import { formatDate } from '../utils'

// ── Helpers ──────────────────────────────────────────────────────────────────

const fmtD = (s: string | null | undefined) => {
  if (!s) return ''
  const d = s.includes('T') ? s.slice(0, 10) : s.slice(0, 10)
  const [y, m, day] = d.split('-')
  return `${day}.${m}.${y}`
}

const fmtAmt = (total: number, curr_total: number | null, currency: string) => {
  const v = curr_total ?? total
  return v.toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '\u00a0' + (currency ?? 'CZK')
}

const vs = (series: string | number, companyId: string | null, number: number) =>
  `${series}${String(companyId ?? '').slice(-5)}${String(number).padStart(4, '0')}`

const PAGE_SIZE = 50

type InvoiceRow = {
  invoice_key: number
  year: number
  number: number
  series: string
  issued: string
  fulfilment: string | null
  maturity: string | null
  settlement: string | null
  cancellation: string | null
  price: number
  total: number
  curr_total: number | null
  currency: string
  proforma_number: number | null
  company_key: number | null
  id: string | null
  company: string | null
}

// ── Filtrační panel ───────────────────────────────────────────────────────────

type Filters = {
  year: string
  company_key: string
  number: string
  series: string
  settled: string
  date_from: string
  date_to: string
}

const ic = 'border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-teal-500'

type FilterPanelProps = {
  filters: Filters
  onChange: (f: Filters) => void
  onRun: () => void
  loading: boolean
  isProforma: boolean
  total: number | null
  offset: number
  count: number
  onPrev: () => void
  onNext: () => void
}

const FilterPanel = ({ filters, onChange, onRun, loading, isProforma, total, offset, count, onPrev, onNext }: FilterPanelProps) => {
  const set = (k: keyof Filters) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    onChange({ ...filters, [k]: e.target.value })

  const currentYear = new Date().getFullYear()
  const years = Array.from({ length: 6 }, (_, i) => currentYear - i)

  return (
    <div className="bg-white border-b border-gray-200 px-6 py-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Rok</label>
          <select value={filters.year} onChange={set('year')} className={ic}>
            <option value="">vše</option>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        {!isProforma && (
          <div>
            <label className="block text-xs text-gray-500 mb-1">Řada</label>
            <select value={filters.series} onChange={set('series')} className={ic}>
              <option value="">vše</option>
              {Object.entries(INVOICE_SERIES_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{k} – {v}</option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="block text-xs text-gray-500 mb-1">Číslo faktury</label>
          <input type="number" value={filters.number} onChange={set('number')}
            placeholder="vše" className={ic + ' w-28'} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Firma (company_key)</label>
          <input type="number" value={filters.company_key} onChange={set('company_key')}
            placeholder="vše" className={ic + ' w-32'} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Vystaveno od</label>
          <input type="date" value={filters.date_from} onChange={set('date_from')} className={ic} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">do</label>
          <input type="date" value={filters.date_to} onChange={set('date_to')} className={ic} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Úhrada</label>
          <select value={filters.settled} onChange={set('settled')} className={ic}>
            <option value="">vše</option>
            <option value="no">Neuhrazené</option>
            <option value="yes">Uhrazené</option>
          </select>
        </div>
        <button onClick={onRun} disabled={loading}
          className="px-4 py-1.5 bg-teal-600 text-white text-sm rounded hover:bg-teal-700 disabled:opacity-50 transition-colors">
          {loading ? 'Načítám…' : 'Spustit'}
        </button>
        {total != null && !loading && (
          <>
            <span className="text-xs text-gray-400">{total.toLocaleString('cs-CZ')} faktur</span>
            {total > PAGE_SIZE && (
              <div className="flex items-center gap-2 ml-2">
                <button onClick={onPrev} disabled={offset === 0}
                  className="px-3 py-1.5 text-sm rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-40 transition-colors">
                  ← Předchozí
                </button>
                <span className="text-xs text-gray-500">{offset + 1}–{offset + count}</span>
                <button onClick={onNext} disabled={count < PAGE_SIZE}
                  className="px-3 py-1.5 text-sm rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-40 transition-colors">
                  Další →
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── Tabulka faktur ────────────────────────────────────────────────────────────

type TableProps = {
  rows: InvoiceRow[]
  loading: boolean
  error: string | null
  isProforma: boolean
}

const InvoiceTable = ({ rows, loading, error, isProforma }: TableProps) => {
  const [companyModal, setCompanyModal] = React.useState<number | null>(null)

  if (loading) return <div className="flex justify-center py-16"><Spinner size={8} /></div>
  if (error)   return <div className="text-red-600 py-8 px-4">{error}</div>
  if (rows.length === 0) return <div className="text-gray-400 py-8 px-4 text-sm text-center">Žádné faktury.</div>

  return (
    <>
      {companyModal != null && (
        <CompanyDetailModal companyKey={String(companyModal)} onClose={() => setCompanyModal(null)} />
      )}
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs border-collapse">
          <thead>
            <tr className="bg-gray-100 text-gray-600 uppercase tracking-wide text-[11px]">
              <th className="px-2 py-2 text-left border-b whitespace-nowrap">VS</th>
              {!isProforma && <th className="px-2 py-2 text-left border-b whitespace-nowrap">Řada</th>}
              {isProforma && <th className="px-2 py-2 text-right border-b whitespace-nowrap">proforma_number</th>}
              <th className="px-2 py-2 text-left border-b">Firma</th>
              <th className="px-2 py-2 text-left border-b whitespace-nowrap">Vystaveno</th>
              <th className="px-2 py-2 text-left border-b whitespace-nowrap">Plnění</th>
              <th className="px-2 py-2 text-left border-b whitespace-nowrap">Splatnost</th>
              <th className="px-2 py-2 text-left border-b whitespace-nowrap">Uhrazeno</th>
              <th className="px-2 py-2 text-right border-b whitespace-nowrap">Částka</th>
              <th className="px-2 py-2 text-left border-b whitespace-nowrap">Stav</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const vsStr = vs(r.series, r.id, r.number)
              const isCancelled = !!r.cancellation
              const isSettled = !!r.settlement
              const rowCls = isCancelled
                ? 'border-b bg-red-50 text-gray-400'
                : 'border-b hover:bg-gray-50'

              return (
                <tr key={r.invoice_key} className={rowCls}>
                  <td className="px-2 py-1.5 font-mono font-medium tabular-nums">
                    <a href={`#/invoicing/${r.invoice_key}/print`} target="_blank" rel="noreferrer"
                      className="text-teal-700 hover:underline hover:text-teal-900">
                      {vsStr}
                    </a>
                  </td>
                  {!isProforma && (
                    <td className="px-2 py-1.5 text-gray-500 whitespace-nowrap">
                      {INVOICE_SERIES_LABELS[r.series] ?? r.series}
                    </td>
                  )}
                  {isProforma && (
                    <td className="px-2 py-1.5 text-right font-mono tabular-nums text-gray-500">
                      {r.proforma_number ?? '—'}
                    </td>
                  )}
                  <td className="px-2 py-1.5 max-w-[220px] truncate">
                    {r.company_key
                      ? <button onClick={() => setCompanyModal(r.company_key!)}
                          className="text-left hover:underline hover:text-teal-700 max-w-full truncate block"
                          title={r.company ?? ''}>
                          {r.company}
                        </button>
                      : <span className="text-gray-400">{r.company}</span>
                    }
                  </td>
                  <td className="px-2 py-1.5 tabular-nums whitespace-nowrap">{fmtD(r.issued)}</td>
                  <td className="px-2 py-1.5 tabular-nums whitespace-nowrap">{fmtD(r.fulfilment)}</td>
                  <td className="px-2 py-1.5 tabular-nums whitespace-nowrap">{fmtD(r.maturity)}</td>
                  <td className="px-2 py-1.5 tabular-nums whitespace-nowrap text-green-700">
                    {r.settlement ? fmtD(r.settlement) : ''}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums font-medium whitespace-nowrap">
                    {fmtAmt(r.total, r.curr_total, r.currency)}
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    {isCancelled
                      ? <span className="text-red-500 font-medium">Storno</span>
                      : isSettled
                        ? <span className="text-green-600">Uhrazeno</span>
                        : <span className="text-amber-600">Neuhrazeno</span>
                    }
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}

// ── Tab ───────────────────────────────────────────────────────────────────────

const defaultFilters = (): Filters => ({
  year: String(new Date().getFullYear()),
  company_key: '',
  number: '',
  series: '',
  settled: '',
  date_from: '',
  date_to: '',
})

const InvoiceTab = ({ isProforma }: { isProforma: boolean }) => {
  const [filters, setFilters] = React.useState<Filters>(defaultFilters)
  const [offset, setOffset] = React.useState(0)
  const [rows, setRows] = React.useState<InvoiceRow[]>([])
  const [total, setTotal] = React.useState<number | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const run = async (off = 0) => {
    setLoading(true); setError(null)
    try {
      const res = await getInvoicingList({
        year:        filters.year     || undefined,
        company_key: filters.company_key || undefined,
        number:      filters.number   || undefined,
        series:      (!isProforma && filters.series) ? filters.series : undefined,
        settled:     filters.settled  || undefined,
        date_from:   filters.date_from || undefined,
        date_to:     filters.date_to   || undefined,
        proforma:    isProforma ? 'true' : 'false',
        limit:       PAGE_SIZE,
        offset:      off,
      })
      setRows(res.data)
      setTotal(res.total)
      setOffset(off)
    } catch (e: any) {
      setError(e.message ?? 'Chyba')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <FilterPanel
        filters={filters}
        onChange={f => { setFilters(f); setTotal(null); setRows([]) }}
        onRun={() => run(0)}
        loading={loading}
        isProforma={isProforma}
        total={total}
        offset={offset}
        count={rows.length}
        onPrev={() => run(offset - PAGE_SIZE)}
        onNext={() => run(offset + PAGE_SIZE)}
      />
      <div className="flex-1 overflow-auto bg-white">
        {total === null && !loading && (
          <div className="text-gray-400 text-sm px-6 py-12 text-center">
            Nastavte filtry a klikněte na <strong>Spustit</strong>.
          </div>
        )}
        {(total !== null || loading) && (
          <InvoiceTable rows={rows} loading={loading} error={error} isProforma={isProforma} />
        )}
      </div>
    </div>
  )
}

// ── Hlavní stránka ────────────────────────────────────────────────────────────

const TABS = [
  { id: 'invoices',  label: 'Faktury' },
  { id: 'proforma',  label: 'Zálohové faktury' },
]

export const Fakturace = () => {
  const [tab, setTab] = React.useState<'invoices' | 'proforma'>('invoices')

  return (
    <Layout>
      <div className="flex flex-col h-full min-h-screen -m-3 sm:-m-6">
        {/* Záhlaví s taby */}
        <div className="bg-white border-b border-gray-200 px-6 pt-5">
          <h1 className="text-lg font-semibold text-gray-800 mb-4">Fakturace</h1>
          <div className="flex gap-0">
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id as typeof tab)}
                className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  tab === t.id
                    ? 'border-teal-600 text-teal-700'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Obsah tabu */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {tab === 'invoices' && <InvoiceTab key="inv" isProforma={false} />}
          {tab === 'proforma' && <InvoiceTab key="pro" isProforma={true} />}
        </div>
      </div>
    </Layout>
  )
}
