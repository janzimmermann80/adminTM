import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Layout } from '../components/Layout'
import { Spinner } from '../components/Spinner'
import { Pagination } from '../components/Pagination'
import { search, getSearchMeta } from '../api'
import { formatDate } from '../utils'
import type { Company, SearchMeta } from '../types'

const LIMIT = 25

const FIELDS = [
  { value: 'company', label: 'Název firmy' },
  { value: 'id', label: 'ID' },
  { value: 'cin', label: 'IČO' },
  { value: 'city', label: 'Město' },
  { value: 'phone', label: 'Telefon' },
  { value: 'email', label: 'E-mail' },
  { value: 'name', label: 'Kontaktní osoba' },
]

export const Search = () => {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const [query, setQuery] = useState(searchParams.get('q') ?? '')
  const [field, setField] = useState(searchParams.get('field') ?? 'company')
  const [tariff, setTariff] = useState(searchParams.get('tariff') ?? '')
  const [country, setCountry] = useState(searchParams.get('country') ?? '')
  const [offset, setOffset] = useState(Number(searchParams.get('offset') ?? 0))

  const [results, setResults] = useState<Company[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [meta, setMeta] = useState<SearchMeta>({ tariffs: [], branches: [] })
  const [showFilters, setShowFilters] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    getSearchMeta().then(setMeta).catch(() => {})
    inputRef.current?.focus()
  }, [])

  const doSearch = useCallback(async (off = offset) => {
    setLoading(true)
    setError('')
    try {
      const res = await search({
        q: query || undefined,
        field: query ? field : undefined,
        tariff: tariff || undefined,
        country: country || undefined,
        limit: LIMIT,
        offset: off,
        order: 'company',
      })
      setResults(res.data)
      setTotal(res.total)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [query, field, tariff, country, offset])

  useEffect(() => {
    doSearch(offset)
  }, []) // initial load

  const handleSearch = (e?: React.FormEvent) => {
    e?.preventDefault()
    setOffset(0)
    doSearch(0)
  }

  const handlePageChange = (newOffset: number) => {
    setOffset(newOffset)
    doSearch(newOffset)
    window.scrollTo(0, 0)
  }

  const handleRowClick = (key: number) => {
    window.open(`#/company/${key}`, '_blank')
  }

  return (
    <Layout>
      {/* Page header */}
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-semibold text-gray-800">Firmy</h1>
      </div>

      {/* Search form */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 mb-5">
        <form onSubmit={handleSearch}>
          <div className="flex gap-2 flex-wrap">
            {/* Field selector */}
            <select
              value={field}
              onChange={e => setField(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none"
            >
              {FIELDS.map(f => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>

            {/* Text input */}
            <div className="relative flex-1 min-w-0 sm:min-w-48">
              <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Hledat..."
                className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none"
              />
            </div>

            <button
              type="submit"
              className="flex items-center gap-1.5 bg-[#0a6b6b] hover:bg-[#085858] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              {loading ? <Spinner size={4} /> : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              )}
              Hledat
            </button>

            <button
              type="button"
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-1.5 border px-3 py-2 rounded-lg text-sm transition-colors ${
                showFilters || tariff || country
                  ? 'border-teal-500 bg-teal-50 text-teal-700'
                  : 'border-gray-300 hover:bg-gray-50 text-gray-600'
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
              </svg>
              Filtry
              {(tariff || country) && (
                <span className="bg-teal-600 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                  {[tariff, country].filter(Boolean).length}
                </span>
              )}
            </button>
          </div>

          {/* Extended filters */}
          {showFilters && (
            <div className="mt-4 pt-4 border-t border-gray-100 flex gap-3 flex-wrap">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Tarif</label>
                <select
                  value={tariff}
                  onChange={e => setTariff(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-teal-500 outline-none"
                >
                  <option value="">— vše —</option>
                  {meta.tariffs.map(t => (
                    <option key={t.tariff} value={t.tariff}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Stát</label>
                <input
                  type="text"
                  value={country}
                  onChange={e => setCountry(e.target.value)}
                  placeholder="CZ, SK, ..."
                  className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-24 focus:ring-2 focus:ring-teal-500 outline-none"
                />
              </div>
              {(tariff || country) && (
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={() => { setTariff(''); setCountry('') }}
                    className="text-sm text-red-500 hover:text-red-700 underline"
                  >
                    Vymazat filtry
                  </button>
                </div>
              )}
            </div>
          )}
        </form>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 mb-4 text-sm">
          {error}
        </div>
      )}

      {/* Results */}
      {loading && !results.length ? (
        <div className="flex justify-center py-16"><Spinner size={10} /></div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <span className="text-sm text-gray-600">
              {total > 0 ? (
                <>Nalezeno <strong>{total}</strong> záznamů</>
              ) : (
                'Žádné výsledky'
              )}
            </span>
            {loading && <Spinner size={4} />}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wide">
                  <th className="px-4 py-3 font-medium">ID</th>
                  <th className="px-4 py-3 font-medium">Firma</th>
                  <th className="px-4 py-3 font-medium hidden md:table-cell">Město</th>
                  <th className="px-4 py-3 font-medium hidden lg:table-cell">Stát</th>
                  <th className="px-4 py-3 font-medium hidden lg:table-cell">Tarif</th>
                  <th className="px-4 py-3 font-medium hidden xl:table-cell">IČO</th>
                  <th className="px-4 py-3 font-medium hidden xl:table-cell">Změněno</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {results.map(c => (
                  <tr
                    key={c.company_key}
                    onClick={() => handleRowClick(c.company_key)}
                    className="hover:bg-teal-50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 text-gray-400 font-mono text-xs">{c.id}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{c.company}</td>
                    <td className="px-4 py-3 text-gray-600 hidden md:table-cell">{c.city}</td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      {c.country && (
                        <span className="inline-flex items-center bg-gray-100 text-gray-700 rounded px-1.5 py-0.5 text-xs font-mono">
                          {c.country}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      {c.tariff_name ? (
                        <span className="inline-flex items-center bg-teal-100 text-teal-700 rounded px-1.5 py-0.5 text-xs">
                          {c.tariff_name}
                        </span>
                      ) : c.tariff ? (
                        <span className="text-gray-400 text-xs">{c.tariff}</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-gray-500 hidden xl:table-cell font-mono text-xs">{c.cin}</td>
                    <td className="px-4 py-3 text-gray-400 hidden xl:table-cell text-xs">{formatDate(c.last_modif)}</td>
                  </tr>
                ))}
                {results.length === 0 && !loading && (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-gray-400">
                      Žádné výsledky. Zkuste jiný dotaz.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {total > LIMIT && (
            <div className="px-5 pb-4">
              <Pagination total={total} limit={LIMIT} offset={offset} onChange={handlePageChange} />
            </div>
          )}
        </div>
      )}
    </Layout>
  )
}
