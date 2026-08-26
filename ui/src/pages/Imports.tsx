import React from 'react'
import { Layout } from '../components/Layout'
import { Spinner } from '../components/Spinner'
import {
  getImports, ImportServiceRow, ImportStatus,
  getImportCars, ImportCarRow, ImportCarStatus,
} from '../api'

// ── Helpers ──────────────────────────────────────────────────────────────────

const fmtTs = (s: string | null): string => {
  if (!s) return ''
  const d = new Date(s)
  if (isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const relativeAge = (s: string | null): string => {
  if (!s) return ''
  const ms = Date.now() - new Date(s).getTime()
  if (!isFinite(ms) || ms < 0) return ''
  const min = Math.floor(ms / 60000)
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  if (h < 48) return `${h} h`
  const d = Math.floor(h / 24)
  return `${d} d`
}

const STATUS_BADGE: Record<ImportStatus, string> = {
  ok:        'bg-emerald-100 text-emerald-800 border-emerald-200',
  error:     'bg-red-100 text-red-800 border-red-200',
  stale:     'bg-amber-100 text-amber-800 border-amber-200',
  suspended: 'bg-gray-200 text-gray-700 border-gray-300',
}

const STATUS_LABEL: Record<ImportStatus, string> = {
  ok:        'OK',
  error:     'Chyba',
  stale:     'Zaseknuté',
  suspended: 'Pozastaveno',
}

const CAR_STATUS_BADGE: Record<ImportCarStatus, string> = {
  ok:                 'bg-emerald-100 text-emerald-800 border-emerald-200',
  error:              'bg-red-100 text-red-800 border-red-200',
  silent:             'bg-amber-100 text-amber-800 border-amber-200',
  'gone-from-vendor': 'bg-orange-100 text-orange-800 border-orange-200',
  inactive:           'bg-gray-200 text-gray-500 border-gray-300',
}

const CAR_STATUS_LABEL: Record<ImportCarStatus, string> = {
  ok:                 'OK',
  error:              'Chyba',
  silent:             'Nevysílá',
  'gone-from-vendor': 'Zmizelo u dodavatele',
  inactive:           'Neaktivní',
}

// ── Ikony ────────────────────────────────────────────────────────────────────

const IconRefresh = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
)

const IconClose = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
)

// ── Cars modal ───────────────────────────────────────────────────────────────

type CarsModalProps = {
  row: ImportServiceRow
  onClose: () => void
}

const CarsModal = ({ row, onClose }: CarsModalProps) => {
  const [cars, setCars] = React.useState<ImportCarRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [onlyProblems, setOnlyProblems] = React.useState(true)

  React.useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    getImportCars(row.company_key, row.import_type)
      .then(rows => { if (alive) setCars(rows) })
      .catch(e => { if (alive) setError(e.message ?? String(e)) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [row.company_key, row.import_type])

  const visible = onlyProblems
    ? cars.filter(c => c.car_status !== 'ok' && c.car_status !== 'inactive')
    : cars

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center bg-black/50 p-4 overflow-y-auto"
         onClick={onClose}>
      <div className="bg-white rounded shadow-lg max-w-6xl w-full my-8" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between px-5 py-4 border-b">
          <div>
            <div className="text-sm text-gray-500">Auta v importu</div>
            <div className="text-lg font-semibold text-gray-800">
              {row.company_name ?? `#${row.company_key}`} <span className="text-gray-400">·</span>{' '}
              <span className="font-mono text-teal-700">{row.import_type}</span>
              {row.import_name && <span className="text-gray-500 font-normal ml-2">({row.import_name})</span>}
            </div>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800 p-1"><IconClose /></button>
        </div>

        <div className="px-5 py-3 border-b flex items-center gap-4 text-sm">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={onlyProblems} onChange={e => setOnlyProblems(e.target.checked)} />
            Jen s problémem
          </label>
          <div className="text-gray-500">
            Zobrazeno {visible.length} z {cars.length}
          </div>
        </div>

        <div className="p-2">
          {loading && <div className="flex justify-center py-12"><Spinner size={8} /></div>}
          {error && <div className="text-red-600 py-6 px-3 text-sm">{error}</div>}
          {!loading && !error && visible.length === 0 && (
            <div className="text-gray-400 py-8 px-3 text-sm">Žádná auta k zobrazení.</div>
          )}
          {!loading && !error && visible.length > 0 && (
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-100 text-gray-600 uppercase tracking-wide text-[11px]">
                    <th className="px-2 py-2 text-left border-b whitespace-nowrap">Stav</th>
                    <th className="px-2 py-2 text-left border-b whitespace-nowrap">SPZ</th>
                    <th className="px-2 py-2 text-left border-b whitespace-nowrap">VIN</th>
                    <th className="px-2 py-2 text-left border-b whitespace-nowrap">ext_id</th>
                    <th className="px-2 py-2 text-left border-b whitespace-nowrap">ext_name</th>
                    <th className="px-2 py-2 text-left border-b whitespace-nowrap">Poslední pozice</th>
                    <th className="px-2 py-2 text-left border-b whitespace-nowrap">Poslední ve fleetu</th>
                    <th className="px-2 py-2 text-left border-b whitespace-nowrap">Poslední chyba</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map(c => (
                    <tr key={`${c.import_type}:${c.ext_id}`}
                        className={`border-b hover:bg-gray-50 ${c.inactive ? 'text-gray-400' : ''}`}>
                      <td className="px-2 py-1.5">
                        <span className={`inline-block px-2 py-0.5 rounded border text-[11px] font-medium ${CAR_STATUS_BADGE[c.car_status]}`}>
                          {CAR_STATUS_LABEL[c.car_status]}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 font-mono">{c.spz ?? ''}</td>
                      <td className="px-2 py-1.5 font-mono text-gray-500">{c.vin ?? ''}</td>
                      <td className="px-2 py-1.5 font-mono">{c.ext_id}</td>
                      <td className="px-2 py-1.5">{c.ext_name ?? ''}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap" title={c.last_imported_rec_time ?? ''}>
                        {fmtTs(c.last_imported_rec_time)}
                        {c.last_imported_rec_time && <span className="text-gray-400 ml-1">({relativeAge(c.last_imported_rec_time)})</span>}
                      </td>
                      <td className="px-2 py-1.5 whitespace-nowrap" title={c.last_car_import_time ?? ''}>
                        {fmtTs(c.last_car_import_time)}
                      </td>
                      <td className="px-2 py-1.5 max-w-[300px] truncate text-red-700" title={c.last_error ?? ''}>
                        {c.last_error ?? ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Hlavní stránka ──────────────────────────────────────────────────────────

export const Imports = () => {
  const [rows, setRows] = React.useState<ImportServiceRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [filter, setFilter] = React.useState<ImportStatus | 'all' | 'problems'>('problems')
  const [selected, setSelected] = React.useState<ImportServiceRow | null>(null)
  const [q, setQ] = React.useState('')

  const load = React.useCallback(() => {
    setLoading(true)
    setError(null)
    getImports()
      .then(setRows)
      .catch(e => setError(e.message ?? String(e)))
      .finally(() => setLoading(false))
  }, [])

  React.useEffect(() => { load() }, [load])

  const counts = React.useMemo(() => {
    const c: Record<ImportStatus, number> = { ok: 0, error: 0, stale: 0, suspended: 0 }
    for (const r of rows) c[r.status]++
    return c
  }, [rows])

  const visible = React.useMemo(() => {
    const term = q.trim().toLowerCase()
    return rows.filter(r => {
      if (filter === 'problems' && r.status === 'ok') return false
      if (filter !== 'all' && filter !== 'problems' && r.status !== filter) return false
      if (term) {
        const hay = [
          r.company_name, r.company_id, String(r.company_key),
          r.import_type, r.import_name, r.comp_id, r.comp_name,
        ].filter(Boolean).join(' ').toLowerCase()
        if (!hay.includes(term)) return false
      }
      return true
    })
  }, [rows, filter, q])

  const FilterBtn = ({ value, label, count, tone }: {
    value: typeof filter; label: string; count?: number; tone?: string
  }) => (
    <button
      onClick={() => setFilter(value)}
      className={`px-3 py-1.5 rounded text-sm border transition-colors ${
        filter === value
          ? 'bg-teal-600 text-white border-teal-600'
          : `bg-white text-gray-700 border-gray-300 hover:bg-gray-50 ${tone ?? ''}`
      }`}>
      {label}{count !== undefined && <span className="ml-1.5 opacity-70 tabular-nums">({count})</span>}
    </button>
  )

  return (
    <Layout>
      <div className="max-w-full">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-800">Importy</h1>
            <p className="text-sm text-gray-500">Stav napojení na dodavatele GPS/telematiky za všechny firmy.</p>
          </div>
          <button onClick={load}
                  className="flex items-center gap-2 px-3 py-1.5 rounded bg-teal-600 text-white hover:bg-teal-700 text-sm">
            <IconRefresh /> Obnovit
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-3">
          <FilterBtn value="problems" label="Problémy"    count={counts.error + counts.stale + counts.suspended} />
          <FilterBtn value="error"    label="Chyby"       count={counts.error} />
          <FilterBtn value="stale"    label="Zaseknuté"   count={counts.stale} />
          <FilterBtn value="suspended"label="Pozastavené" count={counts.suspended} />
          <FilterBtn value="ok"       label="OK"          count={counts.ok} />
          <FilterBtn value="all"      label="Vše"         count={rows.length} />
          <div className="ml-auto">
            <input
              type="text"
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Hledat firmu / typ / comp_id…"
              className="px-3 py-1.5 border border-gray-300 rounded text-sm w-64 focus:outline-none focus:border-teal-500"
            />
          </div>
        </div>

        <div className="bg-white rounded shadow-sm">
          {loading && <div className="flex justify-center py-16"><Spinner size={10} /></div>}
          {error && <div className="text-red-600 py-8 px-4">{error}</div>}
          {!loading && !error && visible.length === 0 && (
            <div className="text-gray-400 py-12 px-4 text-sm text-center">Žádné záznamy.</div>
          )}
          {!loading && !error && visible.length > 0 && (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-100 text-gray-600 uppercase tracking-wide text-[11px]">
                    <th className="px-3 py-2 text-left border-b">Stav</th>
                    <th className="px-3 py-2 text-left border-b">Firma</th>
                    <th className="px-3 py-2 text-left border-b">Typ importu</th>
                    <th className="px-3 py-2 text-left border-b">Účet u dodavatele</th>
                    <th className="px-3 py-2 text-left border-b whitespace-nowrap">Poslední běh</th>
                    <th className="px-3 py-2 text-left border-b">Poslední chyba</th>
                    <th className="px-3 py-2 text-left border-b whitespace-nowrap">Pozastaveno</th>
                    <th className="px-3 py-2 text-right border-b whitespace-nowrap">Auta</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map(r => {
                    const isProblem = r.status !== 'ok'
                    return (
                      <tr key={`${r.company_key}:${r.import_type}`}
                          onClick={() => isProblem && setSelected(r)}
                          className={`border-b transition-colors ${
                            isProblem ? 'hover:bg-gray-50 cursor-pointer' : ''
                          }`}>
                        <td className="px-3 py-2">
                          <span className={`inline-block px-2 py-0.5 rounded border text-[11px] font-medium ${STATUS_BADGE[r.status]}`}>
                            {STATUS_LABEL[r.status]}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <div className="font-medium text-gray-800">{r.company_name ?? <span className="text-gray-400">—</span>}</div>
                          <div className="text-xs text-gray-500 font-mono">
                            {r.company_id ?? `#${r.company_key}`}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="font-mono font-medium text-teal-700">{r.import_type}</div>
                          {r.import_name && <div className="text-xs text-gray-500">{r.import_name}</div>}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {r.comp_id && <div className="font-mono">{r.comp_id}</div>}
                          {r.comp_name && <div className="text-gray-500">{r.comp_name}</div>}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-xs" title={r.last_import_time ?? ''}>
                          {fmtTs(r.last_import_time) || <span className="text-gray-400">nikdy</span>}
                          {r.last_import_time && (
                            <div className="text-gray-400">{relativeAge(r.last_import_time)}</div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-red-700 text-xs max-w-[320px] truncate" title={r.last_error ?? ''}>
                          {r.last_error ?? ''}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-xs">
                          {r.suspended_on ? fmtTs(r.suspended_on) : ''}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {isProblem && (
                            <button
                              onClick={e => { e.stopPropagation(); setSelected(r) }}
                              className="text-teal-600 hover:text-teal-800 text-xs font-medium">
                              Zobrazit →
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {selected && <CarsModal row={selected} onClose={() => setSelected(null)} />}
      </div>
    </Layout>
  )
}
