import React from 'react'
import { Layout } from '../components/Layout'
import { getReportsSchedule, ReportsScheduleRow, getAiPrompt, AiPromptRow, getAddressBookNoCompany, AddressBookNoCompanyRow, getOrsrLookup, OrsrResult, getTariffs, TariffRow, importAddressBookEntry, banAddressBookEntry } from '../api'
import { CompanyDetailModal } from '../components/CompanyDetailModal'
import { Spinner } from '../components/Spinner'

// ── Dostupné dotazy ──────────────────────────────────────────────────────────

type QueryDef = {
  id: string
  label: string
  description: string
}

const QUERIES: QueryDef[] = [
  {
    id: 'reports-schedule',
    label: 'Reports Schedule',
    description: 'Plánované reporty firem (provider.reports_schedule)',
  },
  {
    id: 'ai-prompt',
    label: 'AI Prompt',
    description: 'AI prompty firem (ta.ai_prompt)',
  },
  {
    id: 'address-book-no-company',
    label: 'TA adresář',
    description: 'Záznamy v ta.address_book_base (CZ/SK) s platným IČO bez shody v provider.company',
  },
]

// ── Helpers ──────────────────────────────────────────────────────────────────

const fmtTs = (s: string | null) => {
  if (!s) return ''
  const d = new Date(s)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const fmtArr = (a: unknown[] | null) => {
  if (!a || a.length === 0) return ''
  return a.join(', ')
}

const fmtJson = (v: unknown) => {
  if (v == null) return ''
  if (typeof v === 'string') return v
  return JSON.stringify(v)
}

// ── Reports Schedule tabulka ─────────────────────────────────────────────────

type RSProps = {
  rows: ReportsScheduleRow[]
  loading: boolean
  error: string | null
}

const calcDurationMin = (created: string | null, generated: string | null): number | null => {
  if (!created || !generated) return null
  const ms = new Date(generated).getTime() - new Date(created).getTime()
  if (isNaN(ms) || ms < 0) return null
  return Math.round(ms / 6000) / 10
}

const ReportsScheduleTable = ({ rows, loading, error }: RSProps) => {
  const [modal, setModal] = React.useState<{ title: string; content: string } | null>(null)

  if (loading) return <div className="flex justify-center py-16"><Spinner size={8} /></div>
  if (error) return <div className="text-red-600 py-8 px-4">{error}</div>
  if (rows.length === 0) return <div className="text-gray-400 py-8 px-4 text-sm">Žádná data.</div>

  return (
    <>
      {modal && <TextModal title={modal.title} content={modal.content} onClose={() => setModal(null)} />}
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs border-collapse">
          <thead>
            <tr className="bg-gray-100 text-gray-600 uppercase tracking-wide text-[11px]">
              <th className="px-2 py-2 text-right border-b whitespace-nowrap">ID</th>
              <th className="px-2 py-2 text-right border-b whitespace-nowrap">company_key</th>
              <th className="px-2 py-2 text-left border-b whitespace-nowrap">type</th>
              <th className="px-2 py-2 text-left border-b whitespace-nowrap">title</th>
              <th className="px-2 py-2 text-left border-b whitespace-nowrap">emails</th>
              <th className="px-2 py-2 text-left border-b whitespace-nowrap">schedule_day</th>
              <th className="px-2 py-2 text-left border-b whitespace-nowrap">schedule_month</th>
              <th className="px-2 py-2 text-left border-b whitespace-nowrap">schedule_weekday</th>
              <th className="px-2 py-2 text-left border-b whitespace-nowrap">created_time</th>
              <th className="px-2 py-2 text-left border-b whitespace-nowrap">generated_time</th>
              <th className="px-2 py-2 text-right border-b whitespace-nowrap">Doba (min)</th>
              <th className="px-2 py-2 text-right border-b whitespace-nowrap">gen.dur.</th>
              <th className="px-2 py-2 text-left border-b whitespace-nowrap">generation_error</th>
              <th className="px-2 py-2 text-left border-b whitespace-nowrap">period_from</th>
              <th className="px-2 py-2 text-left border-b whitespace-nowrap">period_to</th>
              <th className="px-2 py-2 text-left border-b whitespace-nowrap">one_time</th>
              <th className="px-2 py-2 text-left border-b whitespace-nowrap">updated_time</th>
              <th className="px-2 py-2 text-left border-b whitespace-nowrap">generation_started</th>
              <th className="px-2 py-2 text-left border-b whitespace-nowrap">drv_keys</th>
              <th className="px-2 py-2 text-left border-b whitespace-nowrap">script_input</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const scriptStr = fmtJson(r.script_input)
              const durMin = calcDurationMin(r.created_time, r.generated_time)
              return (
                <tr key={r.schedule_id} className="border-b hover:bg-gray-50">
                  <td className="px-2 py-1.5 text-right text-gray-500 tabular-nums">{r.schedule_id}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{r.company_key}</td>
                  <td className="px-2 py-1.5 font-mono font-medium text-teal-700">{r.type?.trim()}</td>
                  <td className="px-2 py-1.5">{r.title}</td>
                  <td className="px-2 py-1.5 max-w-[200px] truncate" title={fmtArr(r.emails)}>{fmtArr(r.emails)}</td>
                  <td className="px-2 py-1.5">{fmtArr(r.schedule_day)}</td>
                  <td className="px-2 py-1.5">{fmtArr(r.schedule_month)}</td>
                  <td className="px-2 py-1.5">{fmtArr(r.schedule_weekday)}</td>
                  <td className="px-2 py-1.5 tabular-nums whitespace-nowrap">{fmtTs(r.created_time)}</td>
                  <td className="px-2 py-1.5 tabular-nums whitespace-nowrap">{fmtTs(r.generated_time)}</td>
                  <td className={`px-2 py-1.5 text-right tabular-nums font-medium ${durMin != null && durMin > 10 ? 'text-red-600' : 'text-gray-800'}`}>
                    {durMin != null ? durMin.toFixed(1) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className={`px-2 py-1.5 text-right tabular-nums ${r.generation_duration != null && r.generation_duration / 60 > 5 ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
                    {r.generation_duration != null ? (r.generation_duration / 60).toFixed(1) : ''}
                  </td>
                  <td className="px-2 py-1.5 text-red-600 max-w-[200px] truncate" title={r.generation_error ?? ''}>{r.generation_error}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap">{r.period_from}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap">{r.period_to}</td>
                  <td className="px-2 py-1.5">{r.one_time == null ? '' : r.one_time ? 'Ano' : 'Ne'}</td>
                  <td className="px-2 py-1.5 tabular-nums whitespace-nowrap">{fmtTs(r.updated_time)}</td>
                  <td className="px-2 py-1.5 tabular-nums whitespace-nowrap">{fmtTs(r.generation_started)}</td>
                  <td className="px-2 py-1.5">{fmtArr(r.drv_keys)}</td>
                  <td className="px-2 py-1.5">
                    {scriptStr ? (
                      <button onClick={() => setModal({ title: `script_input — #${r.schedule_id}`, content: scriptStr })}
                        className="text-left text-teal-700 hover:text-teal-900 hover:underline"
                        title={scriptStr}>
                        {scriptInputCounts(scriptStr)
                          ? <span className="font-mono text-[10px]">{scriptInputCounts(scriptStr)}</span>
                          : <span className="font-mono text-[10px] max-w-[200px] truncate block">{scriptStr}</span>
                        }
                      </button>
                    ) : <span className="text-gray-300">—</span>}
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

// ── Text modal ───────────────────────────────────────────────────────────────

type TextModalProps = {
  title: string
  content: string
  onClose: () => void
}

const scriptInputCounts = (content: string): string | null => {
  try {
    const p = JSON.parse(content)
    if (typeof p !== 'object' || p === null || Array.isArray(p)) return null
    const parts: string[] = []
    if (Array.isArray(p.tags)) parts.push(`tags: ${p.tags.length}`)
    if (Array.isArray(p.record_ids)) parts.push(`record_ids: ${p.record_ids.length}`)
    return parts.length ? parts.join(', ') : null
  } catch { return null }
}

const TextModal = ({ title, content, onClose }: TextModalProps) => {
  const isJson = (() => { try { JSON.parse(content); return true } catch { return false } })()
  const pretty = isJson ? JSON.stringify(JSON.parse(content), null, 2) : content
  const countInfo = scriptInputCounts(content)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-[800px] max-w-[95vw] max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <span className="font-semibold text-gray-800 text-sm">{title}</span>
            {countInfo && <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">{countInfo}</span>}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        <div className="overflow-auto flex-1 p-4">
          <pre className="text-xs font-mono whitespace-pre-wrap break-words text-gray-800 leading-relaxed">{pretty}</pre>
        </div>
        <div className="px-5 py-3 border-t border-gray-100 flex justify-end">
          <button onClick={() => { navigator.clipboard.writeText(pretty) }}
            className="text-xs px-3 py-1.5 rounded bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors mr-2">
            Kopírovat
          </button>
          <button onClick={onClose}
            className="text-xs px-3 py-1.5 rounded bg-teal-600 hover:bg-teal-700 text-white transition-colors">
            Zavřít
          </button>
        </div>
      </div>
    </div>
  )
}

// ── AI Prompt tabulka ────────────────────────────────────────────────────────

type APProps = {
  rows: AiPromptRow[]
  loading: boolean
  error: string | null
}

const AiPromptTable = ({ rows, loading, error }: APProps) => {
  const [modal, setModal] = React.useState<{ title: string; content: string } | null>(null)

  if (loading) return <div className="flex justify-center py-16"><Spinner size={8} /></div>
  if (error) return <div className="text-red-600 py-8 px-4">{error}</div>
  if (rows.length === 0) return <div className="text-gray-400 py-8 px-4 text-sm">Žádná data.</div>

  return (
    <>
      {modal && <TextModal title={modal.title} content={modal.content} onClose={() => setModal(null)} />}
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs border-collapse">
          <thead>
            <tr className="bg-gray-100 text-gray-600 uppercase tracking-wide text-[11px]">
              <th className="px-2 py-2 text-right border-b whitespace-nowrap">ID</th>
              <th className="px-2 py-2 text-right border-b whitespace-nowrap">company_key</th>
              <th className="px-2 py-2 text-left border-b whitespace-nowrap">tin</th>
              <th className="px-2 py-2 text-left border-b whitespace-nowrap">company_name</th>
              <th className="px-2 py-2 text-left border-b whitespace-nowrap">type</th>
              <th className="px-2 py-2 text-left border-b whitespace-nowrap">prompt</th>
              <th className="px-2 py-2 text-left border-b whitespace-nowrap">updated_time</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.prompt_id} className="border-b hover:bg-gray-50">
                <td className="px-2 py-1.5 text-right text-gray-500 tabular-nums">{r.prompt_id}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{r.company_key}</td>
                <td className="px-2 py-1.5 font-mono">{r.tin}</td>
                <td className="px-2 py-1.5">{r.company_name}</td>
                <td className="px-2 py-1.5 font-mono font-medium text-teal-700">{r.type}</td>
                <td className="px-2 py-1.5">
                  {r.prompt ? (
                    <button onClick={() => setModal({ title: `prompt — #${r.prompt_id} ${r.company_name ?? ''}`, content: r.prompt! })}
                      className="max-w-[400px] truncate block text-left text-teal-700 hover:text-teal-900 hover:underline"
                      title={r.prompt}>
                      {r.prompt}
                    </button>
                  ) : <span className="text-gray-300">—</span>}
                </td>
                <td className="px-2 py-1.5 tabular-nums whitespace-nowrap">{fmtTs(r.updated_time)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

// ── CIN modal (ARES / ORSR) ──────────────────────────────────────────────────

type CinModalProps = {
  cin: string
  country: string
  onClose: () => void
}

type AresData = {
  ico?: string
  obchodniJmeno?: string
  dic?: string
  sidlo?: {
    textovaAdresa?: string
    nazevUlice?: string
    cisloDomovni?: string | number
    cisloOrientacni?: string | number
    nazevObce?: string
    psc?: string | number
    kodStatu?: string
  }
  datumVzniku?: string
  datumZaniku?: string
  stavSubjektu?: string | { nazev?: string; kod?: string }
  pravniForma?: string | { nazev?: string; kod?: string }
  nace?: Array<string | { nazev?: string; kod?: string }>
}

const strVal = (v: string | { nazev?: string; kod?: string } | undefined): string | null => {
  if (!v) return null
  if (typeof v === 'string') return v || null
  return v.nazev ?? v.kod ?? null
}

const fmtDate = (s: string | undefined | null) => {
  if (!s) return null
  const d = new Date(s)
  if (isNaN(d.getTime())) return s
  return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`
}

const CinModal = ({ cin, country, onClose }: CinModalProps) => {
  const isSk = country.trim().toUpperCase() === 'SK'
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [ares, setAres] = React.useState<AresData | null>(null)
  const [orsr, setOrsr] = React.useState<OrsrResult | null>(null)

  React.useEffect(() => {
    setLoading(true); setError(null)
    if (isSk) {
      getOrsrLookup(cin)
        .then(d => setOrsr(d))
        .catch(e => setError(e.message ?? 'Chyba'))
        .finally(() => setLoading(false))
    } else {
      fetch(`https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/${cin}`)
        .then(r => { if (!r.ok) throw new Error('Subjekt nenalezen v ARES'); return r.json() })
        .then(d => setAres(d))
        .catch(e => setError(e.message ?? 'Chyba'))
        .finally(() => setLoading(false))
    }
  }, [cin, isSk])

  const extUrl = isSk
    ? `https://www.orsr.sk/hladaj_ico.asp?ICO=${cin}&SID=0`
    : `https://ares.gov.cz/ekonomicke-subjekty?ico=${cin}`

  const rows: [string, string | null][] = isSk
    ? [
        ['IČO', cin],
        ['Obchodné meno', orsr?.name ?? null],
        ['Sídlo', orsr?.address ?? null],
        ['Krajský súd', orsr?.court ?? null],
        ['Vložka č.', orsr?.section ?? null],
      ]
    : (() => {
        const s = ares?.sidlo
        const adresa = s?.textovaAdresa
          ?? [s?.nazevUlice, s?.cisloDomovni, s?.cisloOrientacni ? `/${s.cisloOrientacni}` : '', s?.nazevObce].filter(Boolean).join(' ')
          ?? null
        const naceItems = ares?.nace?.slice(0, 3).map(n =>
          typeof n === 'string' ? n : (n.nazev ?? n.kod ?? '')
        ).filter(Boolean).join(', ') ?? null
        return [
          ['IČO', ares?.ico ?? cin],
          ['Obchodní jméno', ares?.obchodniJmeno ?? null],
          ['DIČ', ares?.dic ?? null],
          ['Sídlo', adresa],
          ['Stav', strVal(ares?.stavSubjektu)],
          ['Datum vzniku', fmtDate(ares?.datumVzniku)],
          ['Datum zániku', fmtDate(ares?.datumZaniku)],
          ['NACE', naceItems],
        ] as [string, string | null][]
      })()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-[540px] max-w-[95vw] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-semibold text-gray-800">{cin}</span>
            <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-500">{isSk ? 'ORSR' : 'ARES'}</span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        <div className="p-5 min-h-[120px]">
          {loading && <div className="flex justify-center py-8"><Spinner size={6} /></div>}
          {error && (
            <div className="text-red-600 text-sm py-4">{error}</div>
          )}
          {!loading && !error && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              {rows.filter(([, v]) => v).map(([label, value]) => (
                <React.Fragment key={label}>
                  <dt className="text-gray-500 whitespace-nowrap">{label}</dt>
                  <dd className="text-gray-900 font-medium">{value}</dd>
                </React.Fragment>
              ))}
            </dl>
          )}
        </div>

        <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2">
          <a href={extUrl} target="_blank" rel="noreferrer"
            className="text-xs px-3 py-1.5 rounded bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors">
            Otevřít v {isSk ? 'ORSR' : 'ARES'} →
          </a>
          <button onClick={onClose}
            className="text-xs px-3 py-1.5 rounded bg-teal-600 hover:bg-teal-700 text-white transition-colors">
            Zavřít
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Import modal ─────────────────────────────────────────────────────────────

type ImportModalProps = {
  row: AddressBookNoCompanyRow
  onClose: () => void
  onDone: (cin: string) => void
}

const ImportModal = ({ row, onClose, onDone }: ImportModalProps) => {
  const [tariffs, setTariffs] = React.useState<TariffRow[]>([])
  const [company, setCompany] = React.useState(row.company ?? '')
  const [street, setStreet] = React.useState(row.street ?? '')
  const [city, setCity] = React.useState(row.city ?? '')
  const [zip, setZip] = React.useState(row.zip ?? '')
  const [country, setCountry] = React.useState(row.country ?? '')
  const [cin, setCin] = React.useState(row.cin ?? '')
  const [region, setRegion] = React.useState('00')
  const [tariff, setTariff] = React.useState('51')
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [importedKey, setImportedKey] = React.useState<number | null>(null)

  React.useEffect(() => {
    getTariffs().then(setTariffs).catch(() => {})
  }, [])

  const handleImport = async () => {
    if (!company.trim()) { setError('Firma nesmí být prázdná'); return }
    setLoading(true); setError(null)
    try {
      const res = await importAddressBookEntry({ company, street, city, zip, country, cin, region, tariff })
      setImportedKey(res.company_key)
      onDone(cin)
    } catch (e: any) { setError(e.message ?? 'Chyba') }
    finally { setLoading(false) }
  }

  const handleBan = async () => {
    setLoading(true); setError(null)
    try {
      await banAddressBookEntry({ company, street, city, zip, country, cin })
      onDone(cin)
      onClose()
    } catch (e: any) { setError(e.message ?? 'Chyba') }
    finally { setLoading(false) }
  }

  const ic = 'border border-gray-300 rounded px-2 py-1 text-sm w-full focus:outline-none focus:border-teal-500'

  if (importedKey != null) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <CompanyDetailModal companyKey={String(importedKey)} onClose={onClose} />
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-[420px] max-w-[95vw] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <span className="font-semibold text-sm text-gray-800">Import z adresáře — book_key {row.book_key}</span>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        <div className="p-5 flex flex-col gap-3">
          {error && <div className="text-red-600 text-xs bg-red-50 px-3 py-2 rounded">{error}</div>}
          <div className="grid grid-cols-[80px_1fr] gap-x-3 gap-y-2 items-center text-sm">
            <label className="text-gray-500 text-right">Firma</label>
            <input className={ic} value={company} onChange={e => setCompany(e.target.value)} />
            <label className="text-gray-500 text-right">Ulice</label>
            <input className={ic} value={street} onChange={e => setStreet(e.target.value)} />
            <label className="text-gray-500 text-right">Město</label>
            <input className={ic} value={city} onChange={e => setCity(e.target.value)} />
            <label className="text-gray-500 text-right">PSČ</label>
            <input className={ic} value={zip} onChange={e => setZip(e.target.value)} />
            <label className="text-gray-500 text-right">Stát</label>
            <input className={ic + ' w-16'} value={country} onChange={e => setCountry(e.target.value)} maxLength={3} />
            <label className="text-gray-500 text-right">IČO</label>
            <input className={ic} value={cin} onChange={e => setCin(e.target.value)} />
            <label className="text-gray-500 text-right">Region</label>
            <input className={ic + ' w-16'} value={region} onChange={e => setRegion(e.target.value)} maxLength={3} />
            <label className="text-gray-500 text-right">Tarif</label>
            <select className={ic} value={tariff} onChange={e => setTariff(e.target.value)}>
              {tariffs.map(t => (
                <option key={t.tariff} value={t.tariff}>{t.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-gray-100 flex justify-between">
          <button onClick={handleBan} disabled={loading}
            className="text-xs px-4 py-1.5 rounded border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors">
            Zakázat
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} disabled={loading}
              className="text-xs px-3 py-1.5 rounded bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors">
              Zrušit
            </button>
            <button onClick={handleImport} disabled={loading || !company.trim()}
              className="text-xs px-4 py-1.5 rounded bg-teal-600 hover:bg-teal-700 text-white disabled:opacity-50 transition-colors">
              {loading ? 'Ukládám…' : 'Import'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Address Book No Company tabulka ─────────────────────────────────────────

type ABNCProps = {
  rows: AddressBookNoCompanyRow[]
  loading: boolean
  error: string | null
  onRowDone: (cin: string) => void
}

const AddressBookNoCompanyTable = ({ rows, loading, error, onRowDone }: ABNCProps) => {
  const [cinModal, setCinModal] = React.useState<{ cin: string; country: string } | null>(null)
  const [companyModal, setCompanyModal] = React.useState<number | null>(null)
  const [importModal, setImportModal] = React.useState<AddressBookNoCompanyRow | null>(null)

  if (loading) return <div className="flex justify-center py-16"><Spinner size={8} /></div>
  if (error) return <div className="text-red-600 py-8 px-4">{error}</div>
  if (rows.length === 0) return <div className="text-gray-400 py-8 px-4 text-sm">Žádná data.</div>

  return (
    <>
      {cinModal && <CinModal cin={cinModal.cin} country={cinModal.country} onClose={() => setCinModal(null)} />}
      {companyModal != null && <CompanyDetailModal companyKey={String(companyModal)} onClose={() => setCompanyModal(null)} />}
      {importModal && <ImportModal row={importModal} onClose={() => setImportModal(null)} onDone={cin => { onRowDone(cin); setImportModal(null) }} />}
    <div className="overflow-x-auto">
      <table className="table-fixed w-auto text-xs border-collapse">
        <thead>
          <tr className="bg-gray-100 text-gray-600 uppercase tracking-wide text-[11px]">
            <th className="w-7 px-2 py-2 text-right border-b">#</th>
            <th className="w-16 px-2 py-2 text-right border-b">book_key</th>
            <th className="w-20 px-2 py-2 text-right border-b">company_key</th>
            <th className="w-52 px-2 py-2 text-left border-b">company</th>
            <th className="w-44 px-2 py-2 text-left border-b">street</th>
            <th className="w-32 px-2 py-2 text-left border-b">city</th>
            <th className="w-14 px-2 py-2 text-left border-b">zip</th>
            <th className="w-10 px-2 py-2 text-left border-b">country</th>
            <th className="w-20 px-2 py-2 text-left border-b">cin</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b hover:bg-gray-50">
              <td className="px-2 py-1.5 text-right text-gray-400 tabular-nums">{i + 1}</td>
              <td className="px-2 py-1.5 text-right text-gray-500 tabular-nums">
                <button onClick={() => setImportModal(r)}
                  className="text-gray-600 hover:text-teal-700 hover:underline tabular-nums">
                  {r.book_key}
                </button>
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums">
                {r.company_key
                  ? <button onClick={() => setCompanyModal(r.company_key!)}
                      className="text-teal-700 hover:underline hover:text-teal-900">
                      {r.company_key}
                    </button>
                  : ''}
              </td>
              <td className="px-2 py-1.5 font-medium max-w-0 truncate" title={r.company ?? ''}>
                {r.company
                  ? <a href={`https://www.google.com/search?q=${encodeURIComponent(r.company)}`} target="_blank" rel="noreferrer"
                      className="hover:underline hover:text-teal-700">{r.company}</a>
                  : ''}
              </td>
              <td className="px-2 py-1.5 max-w-0 truncate" title={r.street ?? ''}>{r.street}</td>
              <td className="px-2 py-1.5 max-w-0 truncate" title={r.city ?? ''}>{r.city}</td>
              <td className="px-2 py-1.5 tabular-nums">{r.zip}</td>
              <td className="px-2 py-1.5 font-mono">{r.country}</td>
              <td className="px-2 py-1.5 font-mono font-medium">
                {r.cin
                  ? <button onClick={() => setCinModal({ cin: r.cin!, country: r.country ?? 'CZ' })}
                      className="text-teal-700 hover:underline hover:text-teal-900">
                      {r.cin}
                    </button>
                  : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </>
  )
}

// ── Hlavní stránka ───────────────────────────────────────────────────────────

export const Queries = () => {
  const [activeQuery, setActiveQuery] = React.useState<string>(QUERIES[0].id)

  // Filtry sdílené
  const [companyKey, setCompanyKey] = React.useState('')
  const [type, setType] = React.useState('')
  const [oneTime, setOneTime] = React.useState<'' | 'true' | 'false'>('true')
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [fetched, setFetched] = React.useState(false)
  const [offset, setOffset] = React.useState(0)

  // Data per dotaz
  const [rsRows, setRsRows] = React.useState<ReportsScheduleRow[]>([])
  const [apRows, setApRows] = React.useState<AiPromptRow[]>([])
  const [abncRows, setAbncRows] = React.useState<AddressBookNoCompanyRow[]>([])

  const PAGE_SIZE = 100

  const runQuery = async (newOffset = 0) => {
    setLoading(true)
    setError(null)
    try {
      if (activeQuery === 'reports-schedule') {
        const data = await getReportsSchedule({
          company_key: companyKey.trim() || undefined,
          type: type.trim() || undefined,
          one_time: oneTime || undefined,
          limit: PAGE_SIZE,
          offset: newOffset || undefined,
        })
        setRsRows(data)
        setOffset(newOffset)
      } else if (activeQuery === 'ai-prompt') {
        const data = await getAiPrompt({
          company_key: companyKey.trim() || undefined,
          type: type.trim() || undefined,
        })
        setApRows(data)
        setOffset(0)
      } else if (activeQuery === 'address-book-no-company') {
        const data = await getAddressBookNoCompany()
        setAbncRows(data)
        setOffset(0)
      }
      setFetched(true)
    } catch (e: any) {
      setError(e.message ?? 'Chyba')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Layout>
      <div className="flex h-full min-h-screen">
        {/* Levý panel — seznam dotazů */}
        <aside className="w-56 flex-shrink-0 bg-white border-r border-gray-200">
          <div className="px-4 pt-5 pb-3 border-b border-gray-100">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400">Dotazy</h2>
          </div>
          <nav className="py-2">
            {QUERIES.map(q => (
              <button
                key={q.id}
                onClick={() => { setActiveQuery(q.id); setFetched(false); setRsRows([]); setApRows([]); setAbncRows([]); setError(null); setCompanyKey(''); setType(''); setOneTime(''); setOffset(0) }}
                className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                  activeQuery === q.id
                    ? 'bg-teal-50 text-teal-800 font-medium border-r-2 border-teal-600'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                {q.label}
              </button>
            ))}
          </nav>
        </aside>

        {/* Pravý panel — filtry + data */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Záhlaví + filtry */}
          <div className="bg-white border-b border-gray-200 px-6 py-4">
            <h1 className="text-lg font-semibold text-gray-800 mb-3">
              {QUERIES.find(q => q.id === activeQuery)?.label}
            </h1>
            <p className="text-xs text-gray-400 mb-4">
              {QUERIES.find(q => q.id === activeQuery)?.description}
            </p>

            {(activeQuery === 'reports-schedule' || activeQuery === 'ai-prompt' || activeQuery === 'address-book-no-company') && (
              <div className="flex flex-wrap items-end gap-3">
                {activeQuery !== 'address-book-no-company' && (
                  <>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">company_key</label>
                      <input
                        type="number"
                        value={companyKey}
                        onChange={e => setCompanyKey(e.target.value)}
                        placeholder="vše"
                        className="border border-gray-300 rounded px-2 py-1.5 text-sm w-32 focus:outline-none focus:border-teal-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">type</label>
                      <input
                        type="text"
                        value={type}
                        onChange={e => setType(e.target.value)}
                        placeholder="vše"
                        className="border border-gray-300 rounded px-2 py-1.5 text-sm w-32 font-mono focus:outline-none focus:border-teal-500"
                      />
                    </div>
                    {activeQuery === 'reports-schedule' && (
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">One time</label>
                        <select
                          value={oneTime}
                          onChange={e => setOneTime(e.target.value as '' | 'true' | 'false')}
                          className="border border-gray-300 rounded px-2 py-1.5 text-sm w-24 focus:outline-none focus:border-teal-500"
                        >
                          <option value="">vše</option>
                          <option value="true">Ano</option>
                          <option value="false">Ne</option>
                        </select>
                      </div>
                    )}
                  </>
                )}
                <button
                  onClick={() => runQuery(0)}
                  disabled={loading}
                  className="px-4 py-1.5 bg-teal-600 text-white text-sm rounded hover:bg-teal-700 disabled:opacity-50 transition-colors"
                >
                  {loading ? 'Načítám…' : 'Spustit'}
                </button>
                {fetched && !loading && (
                  <span className="text-xs text-gray-400">
                    {activeQuery === 'reports-schedule'
                      ? `${offset + 1}–${offset + rsRows.length}`
                      : activeQuery === 'address-book-no-company'
                        ? abncRows.length + ' záznamů'
                        : apRows.length + ' záznamů'}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Data */}
          <div className="flex-1 overflow-auto bg-white">
            {!fetched && !loading && (
              <div className="text-gray-400 text-sm px-6 py-12 text-center">
                Nastavte filtry a klikněte na <strong>Spustit</strong>.
              </div>
            )}
            {activeQuery === 'reports-schedule' && (fetched || loading) && (
              <>
                <ReportsScheduleTable rows={rsRows} loading={loading} error={error} />
                {fetched && !loading && (
                  <div className="flex items-center gap-3 px-4 py-3 border-t border-gray-100 bg-white">
                    <button
                      onClick={() => runQuery(offset - PAGE_SIZE)}
                      disabled={offset === 0}
                      className="px-3 py-1.5 text-sm rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      ← Předchozí
                    </button>
                    <span className="text-xs text-gray-500">
                      {offset + 1}–{offset + rsRows.length}
                    </span>
                    <button
                      onClick={() => runQuery(offset + PAGE_SIZE)}
                      disabled={rsRows.length < PAGE_SIZE}
                      className="px-3 py-1.5 text-sm rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      Další →
                    </button>
                  </div>
                )}
              </>
            )}
            {activeQuery === 'ai-prompt' && (fetched || loading) && (
              <AiPromptTable rows={apRows} loading={loading} error={error} />
            )}
            {activeQuery === 'address-book-no-company' && (fetched || loading) && (
              <AddressBookNoCompanyTable rows={abncRows} loading={loading} error={error}
                onRowDone={cin => setAbncRows(prev => prev.filter(r => r.cin !== cin))} />
            )}
          </div>
        </div>
      </div>
    </Layout>
  )
}
