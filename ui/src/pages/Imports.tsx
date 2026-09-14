import React from 'react'
import { Link } from 'react-router-dom'
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

// "20 min", "12 h", "2 d" — pro zobrazení očekávané tolerance (silent threshold).
const fmtDurationMin = (mins: number): string => {
  if (mins < 60)      return `${mins} min`
  if (mins < 60 * 48) return `${Math.round(mins / 60)} h`
  return `${Math.round(mins / (60 * 24))} d`
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
  retired:            'bg-gray-200 text-gray-500 border-gray-300',
}

const CAR_STATUS_LABEL: Record<ImportCarStatus, string> = {
  ok:                 'OK',
  error:              'Chyba',
  silent:             'Nevysílá',
  'gone-from-vendor': 'Zmizelo u dodavatele',
  inactive:           'Neaktivní',
  retired:            'Vyřazeno (chybí v systému)',
}

const isCarRetiredOrInactive = (s: ImportCarStatus) => s === 'inactive' || s === 'retired'

// ── Legendy stavů ────────────────────────────────────────────────────────────

type LegendEntry = { key: string; label: string; badge: string; desc: string }

const SERVICE_STATUS_LEGEND: LegendEntry[] = [
  { key: 'ok',        label: STATUS_LABEL.ok,        badge: STATUS_BADGE.ok,
    desc: 'Servisní tik i poslední pozice v toleranci (viz „tolerance“ u typu importu).' },
  { key: 'error',     label: STATUS_LABEL.error,     badge: STATUS_BADGE.error,
    desc: 'Poslední pokus o import skončil chybou (viz sloupec Poslední chyba).' },
  { key: 'stale',     label: STATUS_LABEL.stale,     badge: STATUS_BADGE.stale,
    desc: 'Žádná nová pozice ani servisní tik po dobu delší než tolerance daného typu.' },
  { key: 'suspended', label: STATUS_LABEL.suspended, badge: STATUS_BADGE.suspended,
    desc: 'Import je administrativně pozastavený (suspended_on není null).' },
]

const CAR_STATUS_LEGEND: LegendEntry[] = [
  { key: 'ok',                label: CAR_STATUS_LABEL.ok,                badge: CAR_STATUS_BADGE.ok,
    desc: 'Poslední pozice v toleranci a auto je aktivní v systému.' },
  { key: 'error',             label: CAR_STATUS_LABEL.error,             badge: CAR_STATUS_BADGE.error,
    desc: 'U tohoto auta se poslední import nezdařil.' },
  { key: 'silent',            label: CAR_STATUS_LABEL.silent,            badge: CAR_STATUS_BADGE.silent,
    desc: 'Auto je stále ve fleetu dodavatele, ale nepřišla žádná nová pozice v rámci tolerance.' },
  { key: 'gone-from-vendor',  label: CAR_STATUS_LABEL['gone-from-vendor'], badge: CAR_STATUS_BADGE['gone-from-vendor'],
    desc: 'Auto zmizelo z fleetu u dodavatele (odpojený vůz / smazané u dodavatele).' },
  { key: 'inactive',          label: CAR_STATUS_LABEL.inactive,          badge: CAR_STATUS_BADGE.inactive,
    desc: 'Auto je v naší databázi označené jako neaktivní (inactive=true) — import ho ignoruje.' },
  { key: 'retired',           label: CAR_STATUS_LABEL.retired,           badge: CAR_STATUS_BADGE.retired,
    desc: 'Auto bylo dříve spárováno, ale řádek car_base v naší DB už neexistuje (auto smazáno).' },
]

const Legend = ({ entries, title }: { entries: LegendEntry[]; title: string }) => {
  const [open, setOpen] = React.useState(false)
  return (
    <div className="mb-3 bg-white border border-gray-200 rounded">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50">
        <span className="text-gray-500">{open ? '▾' : '▸'}</span>
        <span className="text-gray-700 font-medium">Vysvětlivky — {title}</span>
      </button>
      {open && (
        <div className="px-3 pb-3 pt-1 grid gap-2 sm:grid-cols-2">
          {entries.map(e => (
            <div key={e.key} className="flex items-start gap-2 text-xs">
              <span className={`inline-block px-2 py-0.5 rounded border text-[11px] font-medium whitespace-nowrap ${e.badge}`}>
                {e.label}
              </span>
              <span className="text-gray-600 leading-snug">{e.desc}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const ServiceStatusLegend = () => <Legend entries={SERVICE_STATUS_LEGEND} title="stavy importních služeb" />
const CarStatusLegend     = () => <Legend entries={CAR_STATUS_LEGEND}     title="stavy jednotlivých aut" />

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

  const activeCars  = cars.filter(c => !isCarRetiredOrInactive(c.car_status))
  const retiredCars = cars.filter(c =>  isCarRetiredOrInactive(c.car_status))

  const visibleActive = onlyProblems
    ? activeCars.filter(c => c.car_status !== 'ok')
    : activeCars

  // Když v aktivních není žádný problém, ale existují vyřazená/neaktivní — otevři je automaticky.
  const [showRetired, setShowRetired] = React.useState(false)
  React.useEffect(() => {
    if (!loading && visibleActive.length === 0 && retiredCars.length > 0) setShowRetired(true)
  }, [loading, visibleActive.length, retiredCars.length])

  const CarsTable = ({ list, muted }: { list: ImportCarRow[]; muted?: boolean }) => (
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
          {list.map(c => (
            <tr key={`${c.import_type}:${c.ext_id}`}
                className={`border-b hover:bg-gray-50 ${muted ? 'text-gray-400' : ''}`}>
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
  )

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
            <div className="text-xs text-gray-500 mt-1">
              {row.no_gps
                ? 'Import bez GPS dat'
                : `Očekávaná tolerance: tichá pauza ${fmtDurationMin(row.silent_min)}, ztraceno z fleetu ${row.gone_days} d`}
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
            Aktivní: {visibleActive.length} z {activeCars.length}
            {retiredCars.length > 0 && <span className="ml-3">Vyřazená/neaktivní: {retiredCars.length}</span>}
          </div>
        </div>

        <div className="px-5 pt-3"><CarStatusLegend /></div>

        <div className="p-2">
          {loading && <div className="flex justify-center py-12"><Spinner size={8} /></div>}
          {error && <div className="text-red-600 py-6 px-3 text-sm">{error}</div>}
          {!loading && !error && cars.length === 0 && (
            <div className="text-gray-400 py-8 px-3 text-sm">Žádná auta v importu.</div>
          )}
          {!loading && !error && cars.length > 0 && (
            <>
              {visibleActive.length > 0
                ? <CarsTable list={visibleActive} />
                : <div className="text-gray-400 py-8 px-3 text-sm">
                    {onlyProblems ? 'Žádná aktivní auta s problémem.' : 'Žádná aktivní auta.'}
                  </div>}

              {retiredCars.length > 0 && (
                <div className="mt-4 border-t pt-3">
                  <button
                    onClick={() => setShowRetired(v => !v)}
                    className="w-full text-left px-3 py-2 text-xs uppercase tracking-wide text-gray-500 hover:bg-gray-50 rounded">
                    {showRetired ? '▾' : '▸'} Vyřazená / neaktivní auta ({retiredCars.length})
                    <span className="ml-2 normal-case tracking-normal text-gray-400 text-[11px]">
                      — import je přeskakuje, můžeš je z importu odstranit
                    </span>
                  </button>
                  {showRetired && <div className="mt-2"><CarsTable list={retiredCars} muted /></div>}
                </div>
              )}
            </>
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

  const orphanCount = React.useMemo(
    () => rows.filter(r => r.orphan_company).length,
    [rows],
  )

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

  const activeRows = React.useMemo(() => visible.filter(r => !r.orphan_company), [visible])
  const orphanRows = React.useMemo(() => visible.filter(r =>  r.orphan_company), [visible])
  const [showOrphans, setShowOrphans] = React.useState(false)

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
            <h1 className="text-2xl font-semibold text-gray-800">Importy GPS</h1>
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

        <ServiceStatusLegend />

        <div className="bg-white rounded shadow-sm">
          {loading && <div className="flex justify-center py-16"><Spinner size={10} /></div>}
          {error && <div className="text-red-600 py-8 px-4">{error}</div>}
          {!loading && !error && visible.length === 0 && (
            <div className="text-gray-400 py-12 px-4 text-sm text-center">Žádné záznamy.</div>
          )}
          {!loading && !error && activeRows.length > 0 && (
            <ImportsTable rows={activeRows} onOpen={setSelected} />
          )}
          {!loading && !error && activeRows.length === 0 && orphanRows.length > 0 && (
            <div className="text-gray-400 py-8 px-4 text-sm text-center">
              Žádné aktivní firmy odpovídají filtru. Sirotky viz níže.
            </div>
          )}
        </div>

        {!loading && !error && orphanRows.length > 0 && (
          <div className="mt-4 bg-white rounded shadow-sm">
            <button
              onClick={() => setShowOrphans(v => !v)}
              className="w-full flex items-center gap-2 px-4 py-3 text-left border-b hover:bg-gray-50">
              <span className="text-gray-500">{showOrphans ? '▾' : '▸'}</span>
              <span className="font-medium text-gray-700">
                Sirotčí importy — firma už neexistuje ({orphanRows.length}{orphanCount !== orphanRows.length && `/${orphanCount}`})
              </span>
              <span className="ml-2 text-xs text-gray-400">
                — company_key není v provider.company; import můžeš zrušit
              </span>
            </button>
            {showOrphans && <ImportsTable rows={orphanRows} onOpen={setSelected} muted />}
          </div>
        )}

        {selected && <CarsModal row={selected} onClose={() => setSelected(null)} />}
      </div>
    </Layout>
  )
}

// ── Sdílená tabulka řádků importů ────────────────────────────────────────────

type ImportsTableProps = {
  rows: ImportServiceRow[]
  onOpen: (r: ImportServiceRow) => void
  muted?: boolean
}

const ImportsTable = ({ rows, onOpen, muted }: ImportsTableProps) => (
  <div className="overflow-x-auto">
    <table className="min-w-full text-sm border-collapse">
      <thead>
        <tr className="bg-gray-100 text-gray-600 uppercase tracking-wide text-[11px]">
          <th className="px-3 py-2 text-left border-b">Stav</th>
          <th className="px-3 py-2 text-left border-b">Firma</th>
          <th className="px-3 py-2 text-left border-b">Typ importu</th>
          <th className="px-3 py-2 text-left border-b">Účet u dodavatele</th>
          <th className="px-3 py-2 text-left border-b whitespace-nowrap">Poslední aktivita</th>
          <th className="px-3 py-2 text-right border-b whitespace-nowrap">Auta</th>
          <th className="px-3 py-2 text-left border-b">Poslední chyba</th>
          <th className="px-3 py-2 text-left border-b whitespace-nowrap">Pozastaveno</th>
          <th className="px-3 py-2 text-right border-b whitespace-nowrap">Detail</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(r => {
          const isProblem = r.status !== 'ok'
          return (
            <tr key={`${r.company_key}:${r.import_type}`}
                onClick={() => onOpen(r)}
                className={`border-b transition-colors hover:bg-gray-50 cursor-pointer ${
                  muted ? 'text-gray-500' : ''
                }`}>
              <td className="px-3 py-2">
                <span className={`inline-block px-2 py-0.5 rounded border text-[11px] font-medium ${STATUS_BADGE[r.status]}`}>
                  {STATUS_LABEL[r.status]}
                </span>
              </td>
              <td className="px-3 py-2">
                {r.company_name
                  ? <Link
                      to={`/company/${r.company_key}`}
                      target="_blank"
                      rel="noreferrer"
                      onClick={e => e.stopPropagation()}
                      className="font-medium text-gray-800 hover:text-teal-700 hover:underline">
                      {r.company_name}
                    </Link>
                  : <span className="font-medium text-gray-400">— firma neexistuje —</span>}
                <div className="text-xs text-gray-500 font-mono">
                  {r.company_id ?? `#${r.company_key}`}
                </div>
              </td>
              <td className="px-3 py-2">
                <div className="font-mono font-medium text-teal-700">{r.import_type}</div>
                {r.import_name && <div className="text-xs text-gray-500">{r.import_name}</div>}
                <div className="text-[10px] text-gray-400 mt-0.5">
                  {r.no_gps ? 'bez GPS' : `tolerance ${fmtDurationMin(r.silent_min)}`}
                </div>
              </td>
              <td className="px-3 py-2 text-xs">
                {r.comp_id && <div className="font-mono">{r.comp_id}</div>}
                {r.comp_name && <div className="text-gray-500">{r.comp_name}</div>}
              </td>
              <td className="px-3 py-2 whitespace-nowrap text-xs" title={`servis: ${r.last_import_time ?? '-'} | nejnovější pozice: ${r.newest_rec ?? '-'}`}>
                {(() => {
                  const rec = r.newest_rec ? new Date(r.newest_rec).getTime() : 0
                  const svc = r.last_import_time ? new Date(r.last_import_time).getTime() : 0
                  const pick = rec >= svc ? r.newest_rec : r.last_import_time
                  if (!pick) return <span className="text-gray-400">nikdy</span>
                  return <>
                    {fmtTs(pick)}
                    <div className="text-gray-400">{relativeAge(pick)}</div>
                  </>
                })()}
              </td>
              <td className="px-3 py-2 text-right text-xs tabular-nums">
                {r.total_cars > 0 ? (
                  <>
                    <div>{r.active_cars}<span className="text-gray-400">{r.active_cars !== r.total_cars && ` z ${r.total_cars}`}</span></div>
                    {r.cars_with_error > 0 && (
                      <div className="text-red-600">{r.cars_with_error} s chybou</div>
                    )}
                    {(r.inactive_cars > 0 || r.retired_cars > 0) && (
                      <div className="text-gray-400">
                        {r.inactive_cars > 0 && `${r.inactive_cars} neaktiv.`}
                        {r.inactive_cars > 0 && r.retired_cars > 0 && ' · '}
                        {r.retired_cars > 0 && `${r.retired_cars} vyřaz.`}
                      </div>
                    )}
                  </>
                ) : <span className="text-gray-400">0</span>}
              </td>
              <td className="px-3 py-2 text-red-700 text-xs max-w-[320px] truncate" title={r.last_error ?? ''}>
                {r.last_error ?? ''}
              </td>
              <td className="px-3 py-2 whitespace-nowrap text-xs">
                {r.suspended_on ? fmtTs(r.suspended_on) : ''}
              </td>
              <td className="px-3 py-2 text-right">
                <button
                  onClick={e => { e.stopPropagation(); onOpen(r) }}
                  className={`text-xs font-medium ${
                    isProblem ? 'text-teal-600 hover:text-teal-800' : 'text-gray-400 hover:text-teal-700'
                  }`}>
                  Zobrazit →
                </button>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  </div>
)
