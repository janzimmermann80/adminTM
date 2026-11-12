import { useEffect, useMemo, useState } from 'react'
import { Layout } from '../components/Layout'
import { Spinner } from '../components/Spinner'
import { CompanyDetailModal } from '../components/CompanyDetailModal'
import { PrejimkaCsvModal } from '../components/PrejimkaCsvModal'
import {
  exportOrderCheck,
  getOrderCheckOptions,
  OrderCheckFilters,
  OrderCheckOptions,
  OrderCheckRow,
  runOrderCheck,
} from '../api'

const toDateInput = (date: Date) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 10)
}

const formatDateTime = (value: string) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString('cs-CZ', { dateStyle: 'short', timeStyle: 'short' })
}

const mapUrl = (coordinates: string[]) => {
  if (coordinates.length === 0) return null
  const points = coordinates.map(point => point.split(',').map(value => value.trim()).join(','))
  const middle = points.slice(1, -1)
  const waypoints = middle.length <= 8
    ? middle
    : Array.from({ length: 8 }, (_, index) => middle[Math.floor(index * (middle.length - 1) / 7)])
  const params = new URLSearchParams({
    api: '1',
    origin: points[0],
    destination: points[points.length - 1],
  })
  if (waypoints.length > 0) params.set('waypoints', waypoints.join('|'))
  return `https://www.google.com/maps/dir/?${params.toString()}`
}

const buildFilters = (
  from: string,
  to: string,
  prefixGroup: OrderCheckFilters['prefixGroup'],
  companyKey: string,
  carKey: string,
): OrderCheckFilters => ({
  from,
  to,
  prefixGroup,
  ...(companyKey ? { companyKey } : {}),
  ...(carKey ? { carKey } : {}),
})

const CompanyLink = ({ company, companyKey, onOpen }: {
  company: string | null
  companyKey: number | null
  onOpen: (key: number) => void
}) => companyKey === null
  ? <>{company ?? 'Neznámá firma'}</>
  : <button type="button" onClick={() => onOpen(companyKey)} className="text-teal-700 hover:underline text-left">
    {company ?? 'Neznámá firma'}
  </button>

const OrderRow = ({ row, index, onOpenCompany }: { row: OrderCheckRow; index: number; onOpenCompany: (key: number) => void }) => {
  const routeUrl = mapUrl(row.coordinates)
  return (
    <tr className="align-top border-t border-gray-200">
      <td className="px-3 py-3 text-gray-500">{index + 1}</td>
      <td className="px-3 py-3">
        <CompanyLink company={row.company} companyKey={row.companyKey} onOpen={onOpenCompany} />
      </td>
      <td className="px-3 py-3 whitespace-nowrap">{row.spz ?? '—'}</td>
      <td className="px-3 py-3">{row.driverName ?? '—'}</td>
      <td className="px-3 py-3 font-medium whitespace-nowrap">{row.orderNumber}</td>
      <td className="px-3 py-3 text-right whitespace-nowrap">{row.distance.toLocaleString('cs-CZ')}</td>
      <td className="px-3 py-3 min-w-64">
        <div className="space-y-1">
          {row.events.map((event, eventIndex) => (
            <div key={`${event.time}-${eventIndex}`} className="text-xs text-gray-700">
              <span className="font-medium">{event.type === 'L' ? 'Nakl.' : 'Vykl.'}</span>{' '}
              {event.city_name ?? 'Neznámé místo'}{event.zip ? `, ${event.zip}` : ''}{event.country ? ` ${event.country}` : ''}
              <span className="text-gray-400"> · {formatDateTime(event.time)}</span>
            </div>
          ))}
          {row.events.length === 0 && <span className="text-xs text-gray-400">Bez servisních bodů</span>}
        </div>
      </td>
      <td className="px-3 py-3 whitespace-nowrap">
        {routeUrl
          ? <a href={routeUrl} target="_blank" rel="noopener noreferrer" className="text-teal-700 hover:underline">Trasa</a>
          : <span className="text-gray-400">Bez GPS trasy</span>}
      </td>
      <td className="px-3 py-3 min-w-64">
        {!row.sentFiles
          ? <span className="text-red-700">Údaj není dostupný. Aktualizujte API.</span>
          : row.sentFiles.length === 0
          ? <span className="text-gray-400">Žádný záznam</span>
          : <div className="space-y-2">
            {row.sentFiles.map((file, fileIndex) => (
              <div key={fileIndex} className="text-xs text-gray-700">
                <div className="font-medium">
                  {file.sentTime ? formatDateTime(file.sentTime) : 'Bez času odeslání'}
                  {file.sentManually ? ' · ručně' : ''}
                </div>
                <div>{file.company ?? 'Neznámá firma'} · {file.fileName ?? 'Bez názvu souboru'}</div>
                {file.createdTime && <div>Vytvořeno: {formatDateTime(file.createdTime)}</div>}
                {file.sentTo && <div>Cíl: {file.sentTo}</div>}
                {file.confirmedTime && <div>Potvrzeno: {formatDateTime(file.confirmedTime)}</div>}
              </div>
            ))}
          </div>}
      </td>
    </tr>
  )
}

export const OrderCheck = () => {
  const today = toDateInput(new Date())
  const lastWeek = new Date()
  lastWeek.setDate(lastWeek.getDate() - 7)
  const [from, setFrom] = useState(toDateInput(lastWeek))
  const [to, setTo] = useState(today)
  const [prefixGroup, setPrefixGroup] = useState<OrderCheckFilters['prefixGroup']>('all')
  const [companyKey, setCompanyKey] = useState('')
  const [carKey, setCarKey] = useState('')
  const [companyModal, setCompanyModal] = useState<number | null>(null)
  const [csvCompany, setCsvCompany] = useState<{ company: string; companyKey: number; rows: OrderCheckRow[]; filters: OrderCheckFilters } | null>(null)
  const [csvSent, setCsvSent] = useState(false)
  const [resultFilters, setResultFilters] = useState<OrderCheckFilters | null>(null)
  const [options, setOptions] = useState<OrderCheckOptions | null>(null)
  const [rows, setRows] = useState<OrderCheckRow[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [searching, setSearching] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    getOrderCheckOptions()
      .then(data => { if (active) setOptions(data) })
      .catch(e => { if (active) setError(e.message ?? String(e)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const cars = useMemo(
    () => options?.cars.filter(car => !companyKey || String(car.company_key) === companyKey) ?? [],
    [companyKey, options],
  )

  const groupedRows = useMemo(() => {
    const groups = new Map<string, { company: string | null; companyKey: number | null; rows: OrderCheckRow[] }>()
    for (const row of rows ?? []) {
      const key = row.companyKey !== null ? `key:${row.companyKey}` : `name:${row.company ?? ''}`
      let group = groups.get(key)
      if (!group) {
        group = { company: row.company, companyKey: row.companyKey, rows: [] }
        groups.set(key, group)
      }
      group.rows.push(row)
    }

    let offset = 0
    return Array.from(groups.entries())
      .sort(([, a], [, b]) => {
        if (!a.company) return b.company ? 1 : 0
        if (!b.company) return -1
        return a.company.localeCompare(b.company, 'cs')
      })
      .map(([key, group]) => {
        const start = offset
        offset += group.rows.length
        return { key, ...group, start }
      })
  }, [rows])

  const filters = () => buildFilters(from, to, prefixGroup, companyKey, carKey)

  const validateRange = () => {
    if (!from || !to) return 'Zadejte datum od a do.'
    const start = new Date(`${from}T00:00:00`)
    const end = new Date(`${to}T00:00:00`)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 'Zadejte platné datum.'
    if (end < start) return 'Datum „do“ nesmí být před datem „od“.'
    if ((end.getTime() - start.getTime()) / 86_400_000 > 40) return 'Rozsah může být maximálně 40 dní.'
    return null
  }

  const search = async () => {
    const validationError = validateRange()
    if (validationError) {
      setError(validationError)
      return
    }
    setSearching(true)
    setError(null)
    try {
      const currentFilters = filters()
      setRows(await runOrderCheck(currentFilters))
      setResultFilters(currentFilters)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSearching(false)
    }
  }

  const exportRows = async () => {
    const validationError = validateRange()
    if (validationError) {
      setError(validationError)
      return
    }
    setExporting(true)
    setError(null)
    try {
      const blob = await exportOrderCheck(filters())
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `kontrola-objednavek-${from}-${to}.xlsx`
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setExporting(false)
    }
  }

  return (
    <Layout>
      {companyModal !== null && <CompanyDetailModal companyKey={String(companyModal)} onClose={() => setCompanyModal(null)} />}
      {csvCompany && <PrejimkaCsvModal {...csvCompany} onSent={() => setCsvSent(true)} onClose={() => {
        setCsvCompany(null)
        if (csvSent) {
          setCsvSent(false)
          setSearching(true)
          runOrderCheck(csvCompany.filters)
            .then(setRows)
            .catch(e => setError(e instanceof Error ? e.message : String(e)))
            .finally(() => setSearching(false))
        }
      }} />}
      <div className="max-w-screen-2xl mx-auto">
        <div className="mb-5">
          <h1 className="text-xl font-semibold text-gray-800">Kontrola objednávek</h1>
          <p className="text-sm text-gray-500 mt-1">Zakázky podle servisních bodů a zaznamenané GPS trasy.</p>
        </div>

        <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 mb-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-3 items-end">
            <label className="text-sm text-gray-600">
              Od
              <input type="date" value={from} onChange={e => setFrom(e.target.value)}
                className="mt-1 block w-full rounded border border-gray-300 px-2.5 py-2 text-sm" />
            </label>
            <label className="text-sm text-gray-600">
              Do
              <input type="date" value={to} onChange={e => setTo(e.target.value)}
                className="mt-1 block w-full rounded border border-gray-300 px-2.5 py-2 text-sm" />
            </label>
            <label className="text-sm text-gray-600">
              Sada prefixů
              <select value={prefixGroup} onChange={e => setPrefixGroup(e.target.value as OrderCheckFilters['prefixGroup'])}
                className="mt-1 block w-full rounded border border-gray-300 bg-white px-2.5 py-2 text-sm">
                <option value="all">Všechny prefixy</option>
                <option value="wood">ZA, ZB, ZD, ZM, ZS, ZJ, MA</option>
                <option value="gps">LC, LD</option>
                <option value="mm">MM</option>
              </select>
            </label>
            <label className="text-sm text-gray-600">
              Firma
              <select value={companyKey} onChange={e => { setCompanyKey(e.target.value); setCarKey('') }}
                className="mt-1 block w-full rounded border border-gray-300 bg-white px-2.5 py-2 text-sm">
                <option value="">Všechny firmy</option>
                {options?.companies.map(company => (
                  <option key={company.company_key} value={company.company_key}>{company.company}</option>
                ))}
              </select>
            </label>
            <label className="text-sm text-gray-600">
              SPZ
              <select value={carKey} onChange={e => setCarKey(e.target.value)}
                className="mt-1 block w-full rounded border border-gray-300 bg-white px-2.5 py-2 text-sm">
                <option value="">Všechna vozidla</option>
                {cars.map(car => <option key={car.car_key} value={car.car_key}>{car.spz} · {car.company}</option>)}
              </select>
            </label>
            <button type="button" onClick={search} disabled={loading || searching}
              className="rounded bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-50">
              {searching ? 'Načítám…' : 'Zobrazit'}
            </button>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-gray-400">Maximální rozsah je 40 dní. Výběr zahrnuje jen vozidla zařazená do exportu PREJM.</p>
            <button type="button" onClick={exportRows} disabled={loading || exporting}
              className="rounded border border-teal-700 px-3 py-1.5 text-sm font-medium text-teal-800 hover:bg-teal-50 disabled:opacity-50">
              {exporting ? 'Připravuji export…' : 'Exportovat XLSX'}
            </button>
          </div>
        </section>

        {error && <div role="alert" className="mb-4 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        {loading && <div className="py-12 flex justify-center"><Spinner size={8} /></div>}

        {!loading && rows !== null && (
          <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
              <h2 className="font-medium text-gray-800">Výsledky</h2>
              <span className="text-sm text-gray-500">{rows.length.toLocaleString('cs-CZ')} zakázek</span>
            </div>
            {rows.length === 0
              ? <p className="p-6 text-sm text-gray-500">Pro zadané filtry nebyly nalezeny žádné zakázky.</p>
              : <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="px-3 py-2">Poř.</th>
                      <th className="px-3 py-2">Firma</th>
                      <th className="px-3 py-2">SPZ</th>
                      <th className="px-3 py-2">Řidič</th>
                      <th className="px-3 py-2">Zakázka</th>
                      <th className="px-3 py-2 text-right">Km</th>
                      <th className="px-3 py-2">Pozice</th>
                      <th className="px-3 py-2">Trasa</th>
                      <th className="px-3 py-2" title="Čas zaznamenaného odeslání souboru; nemusí znamenat doručení">Odesláno</th>
                    </tr>
                  </thead>
                  {groupedRows.map(group => (
                    <tbody key={group.key}>
                      <tr className="bg-teal-50 border-t border-teal-100">
                        <th scope="rowgroup" colSpan={9} className="px-3 py-2 text-left font-semibold text-teal-900">
                          <CompanyLink company={group.company} companyKey={group.companyKey} onOpen={setCompanyModal} /> <span className="font-normal text-teal-700">({group.rows.length})</span>
                          {group.companyKey !== null && resultFilters && (
                            <button type="button" onClick={() => setCsvCompany({
                              company: group.company ?? 'Neznámá firma',
                              companyKey: group.companyKey!,
                              rows: group.rows,
                              filters: resultFilters,
                            })} className="ml-4 font-normal text-teal-700 hover:underline">Připravit CSV</button>
                          )}
                        </th>
                      </tr>
                      {group.rows.map((row, index) => <OrderRow key={row.orderNumber} row={row} index={group.start + index} onOpenCompany={setCompanyModal} />)}
                    </tbody>
                  ))}
                </table>
              </div>}
          </section>
        )}
      </div>
    </Layout>
  )
}
