import { useState, useEffect, useRef } from 'react'
import { Layout } from '../components/Layout'
import { Spinner } from '../components/Spinner'
import { Pagination } from '../components/Pagination'
import { CompanyDetailModal } from '../components/CompanyDetailModal'
import { search, getSearchMeta } from '../api'
import { formatDate } from '../utils'
import type { SearchMeta } from '../types'

const LIMIT = 25

// ── helpers ───────────────────────────────────────────────────────────────────

const inp = 'border border-gray-300 rounded px-2 py-1 text-sm focus:ring-1 focus:ring-teal-500 focus:border-teal-500 outline-none w-full'
const inpSm = inp + ' text-center'

// ── types ─────────────────────────────────────────────────────────────────────

type SortField = 'id'|'company'|'cin'|'street'|'zip'|'city'|'phone'|'name'|'username'|'email'

interface TextForm {
  sort: SortField
  id: string; company: string
  cin: string; street: string
  zip: string; city: string
  phone: string; name: string
  username: string; email: string
}

interface FilterForm {
  tariff: string
  contract_date_null: boolean
  contract_date_from: string; contract_date_to: string
  prog_lent_date: string; prog_lent_date_op: string
  admittance_date: string; admittance_date_op: string
  prog_sent_date: string; prog_sent_date_op: string
  note_from: string; note_to: string
  region: string; zip: string; country: string
  note_type: string; note_creator: string
  branch: string
}

const formatId = (val: string) => {
  const digits = val.replace(/\D/g, '')
  return digits ? 'CZ' + digits.padStart(6, '0') : val
}

const emptyText = (): TextForm => ({
  sort: 'company',
  id: '', company: '', cin: '', street: '',
  zip: '', city: '', phone: '', name: '',
  username: '', email: '',
})

const emptyFilter = (): FilterForm => ({
  tariff: 'all', contract_date_null: false,
  contract_date_from: '', contract_date_to: '',
  prog_lent_date: '', prog_lent_date_op: '>=',
  admittance_date: '', admittance_date_op: '>=',
  prog_sent_date: '', prog_sent_date_op: '>=',
  note_from: '', note_to: '',
  region: '', zip: '', country: '',
  note_type: '', note_creator: '',
  branch: 'all',
})

// ── row ───────────────────────────────────────────────────────────────────────

const RadioPair = ({
  leftField, leftLabel, leftInput,
  rightField, rightLabel, rightInput,
  sort, onSort,
}: {
  leftField: SortField; leftLabel: string; leftInput: React.ReactNode
  rightField: SortField; rightLabel: string; rightInput: React.ReactNode
  sort: SortField; onSort: (f: SortField) => void
}) => (
  <tr>
    <td className="pr-1 text-right text-xs text-gray-500 whitespace-nowrap py-1">{leftLabel}:</td>
    <td className="px-1 py-1">
      <input type="radio" checked={sort === leftField} onChange={() => onSort(leftField)}
        className="accent-[#0a6b6b]" />
    </td>
    <td className="py-1">{leftInput}</td>
    <td className="py-1 pl-2">{rightInput}</td>
    <td className="px-1 py-1">
      <input type="radio" checked={sort === rightField} onChange={() => onSort(rightField)}
        className="accent-[#0a6b6b]" />
    </td>
    <td className="pl-1 text-xs text-gray-500 whitespace-nowrap py-1">:{rightLabel}</td>
  </tr>
)

// ── Vyhledávání B ─────────────────────────────────────────────────────────────

interface VehicleForm {
  car_key: string
  spz: string
  imsi: string
  tm_tel: string
}

const emptyVehicle = (): VehicleForm => ({ car_key: '', spz: '', imsi: '', tm_tel: '' })

const SearchB = () => {
  const [form, setForm] = useState<VehicleForm>(emptyVehicle())
  const [rows, setRows] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [searched, setSearched] = useState(false)
  const [modalKey, setModalKey] = useState<string | null>(null)

  const s = (k: keyof VehicleForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }))

  const run = async (off = 0) => {
    setLoading(true); setError(''); setSearched(true)
    try {
      const res = await search({
        car_key: form.car_key  || undefined,
        spz:     form.spz      || undefined,
        imsi:    form.imsi     || undefined,
        tm_tel:  form.tm_tel   || undefined,
        limit:   LIMIT,
        offset:  off,
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

  const handlePage = (newOffset: number) => { run(newOffset); window.scrollTo(0, 0) }

  return (
    <>
      {modalKey && <CompanyDetailModal companyKey={modalKey} onClose={() => setModalKey(null)} />}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-5">
        <div className="p-5" onKeyDown={e => { if (e.key === 'Enter') run(0) }}>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Hledat dle vozidla</p>
          <table className="w-full">
            <tbody>
              <tr>
                <td className="pr-1 text-right text-xs text-gray-500 whitespace-nowrap py-1">car_key:</td>
                <td className="py-1"><input className={inp} value={form.car_key} onChange={s('car_key')} type="number" placeholder="číslo" /></td>
                <td className="py-1 pl-2"><input className={inp} value={form.spz} onChange={s('spz')} placeholder="SPZ" /></td>
                <td className="pl-1 text-xs text-gray-500 whitespace-nowrap py-1">:SPZ</td>
              </tr>
              <tr>
                <td className="pr-1 text-right text-xs text-gray-500 whitespace-nowrap py-1">IMSI:</td>
                <td className="py-1"><input className={inp} value={form.imsi} onChange={s('imsi')} placeholder="SIM IMSI" /></td>
                <td className="py-1 pl-2"><input className={inp} value={form.tm_tel} onChange={s('tm_tel')} placeholder="TM telefon" /></td>
                <td className="pl-1 text-xs text-gray-500 whitespace-nowrap py-1">:TM tel.</td>
              </tr>
            </tbody>
          </table>
          <div className="flex gap-2 mt-4">
            <button onClick={() => run(0)} disabled={loading}
              className="px-4 py-1.5 bg-[#0a6b6b] hover:bg-[#085858] text-white text-sm rounded-lg disabled:opacity-50">
              {loading ? 'Hledám…' : 'Hledat'}
            </button>
            <button onClick={() => setForm(emptyVehicle())}
              className="px-4 py-1.5 border border-gray-300 hover:bg-gray-50 text-gray-600 text-sm rounded-lg">
              Smaž vše
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 mb-4 text-sm">{error}</div>
      )}

      {(searched || loading) && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <span className="text-sm text-gray-600">
              {loading ? 'Hledám…' : total > 0
                ? <><strong>{total}</strong> záznamů</>
                : 'Žádné výsledky'}
            </span>
            {loading && <Spinner size={4} />}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">ID</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Firma</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide hidden lg:table-cell">Ulice</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide hidden xl:table-cell whitespace-nowrap">PSČ</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Město</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Stát</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide hidden xl:table-cell">Oblast</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide hidden lg:table-cell">Tarif</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide hidden xl:table-cell">Změna</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map(c => (
                  <tr key={c.company_key}
                    onClick={() => setModalKey(c.company_key)}
                    className="hover:bg-teal-50 cursor-pointer transition-colors">
                    <td className="px-3 py-2 font-mono text-xs text-gray-500">{c.id}</td>
                    <td className="px-3 py-2 font-medium text-gray-900">
                      <a href={`#/company/${c.company_key}`} target="_blank" rel="noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="hover:text-[#0a6b6b] hover:underline">{c.company}</a>
                    </td>
                    <td className="px-3 py-2 text-gray-500 hidden lg:table-cell">{c.street}</td>
                    <td className="px-3 py-2 text-gray-500 hidden xl:table-cell font-mono text-xs">{c.zip}</td>
                    <td className="px-3 py-2 text-gray-600">{c.city}</td>
                    <td className="px-3 py-2 hidden md:table-cell">
                      {c.country && <span className="bg-gray-100 text-gray-600 rounded px-1.5 py-0.5 text-xs font-mono">{c.country}</span>}
                    </td>
                    <td className="px-3 py-2 text-gray-500 hidden xl:table-cell text-xs">{c.region?.trim()}</td>
                    <td className="px-3 py-2 hidden lg:table-cell">
                      {c.tariff_name
                        ? <span className="bg-teal-100 text-[#0a6b6b] rounded px-1.5 py-0.5 text-xs">{c.tariff_name}</span>
                        : c.tariff ? <span className="text-gray-400 text-xs">{c.tariff}</span> : null}
                    </td>
                    <td className="px-3 py-2 text-gray-400 hidden xl:table-cell text-xs">{formatDate(c.last_modif)}</td>
                  </tr>
                ))}
                {rows.length === 0 && !loading && (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-gray-400">Žádné výsledky</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {total > LIMIT && (
            <div className="px-5 pb-4">
              <Pagination total={total} limit={LIMIT} offset={offset} onChange={handlePage} />
            </div>
          )}
        </div>
      )}
    </>
  )
}

// ── main component ────────────────────────────────────────────────────────────

export const Vyhledavani = () => {
  const [tab, setTab] = useState<'a' | 'b'>('a')
  const [meta, setMeta] = useState<SearchMeta>({ tariffs: [], branches: [] })
  const [modalKey, setModalKey] = useState<string | null>(null)
  const [text, setText] = useState<TextForm>(emptyText())
  const [filter, setFilter] = useState<FilterForm>(emptyFilter())
  const [results, setResults] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [searched, setSearched] = useState(false)
  const [order, setOrder] = useState<string>('company')
  const firstRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    getSearchMeta().then(setMeta).catch(() => {})
    firstRef.current?.focus()
  }, [])

  const t = (k: keyof TextForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setText(prev => ({ ...prev, [k]: e.target.value }))
  const f = (k: keyof FilterForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setFilter(prev => ({ ...prev, [k]: e.target.value }))

  const buildParams = (off: number, matchMode: 'contains' | 'begins' | 'selecting') => {
    const p: Record<string, string | number | undefined> = {
      limit: LIMIT,
      offset: off,
      order,
    }
    if (matchMode === 'contains' || matchMode === 'begins') {
      let val = text[text.sort as keyof TextForm] as string
      if (text.sort === 'id') val = formatId(val)
      if (val) {
        p.q = val
        p.field = text.sort
        p.match = matchMode
      }
    }
    if (matchMode === 'selecting' || (matchMode !== 'selecting' && !p.q)) {
      // always send filter params when selecting, or as extra filter in text search
      if (filter.tariff !== 'all')      p.tariff = filter.tariff
      if (filter.contract_date_null)    p.contract_date_null = 'true'
      if (filter.contract_date_from)    p.contract_date_from = filter.contract_date_from
      if (filter.contract_date_to)      p.contract_date_to = filter.contract_date_to
      if (filter.prog_lent_date)        { p.prog_lent_date = filter.prog_lent_date; p.prog_lent_date_op = filter.prog_lent_date_op }
      if (filter.admittance_date)       { p.admittance_date = filter.admittance_date; p.admittance_date_op = filter.admittance_date_op }
      if (filter.prog_sent_date)        { p.prog_sent_date = filter.prog_sent_date; p.prog_sent_date_op = filter.prog_sent_date_op }
      if (filter.note_from)             p.note_from = filter.note_from
      if (filter.note_to)               p.note_to = filter.note_to
      if (filter.region)                p.region = filter.region
      if (filter.zip)                   p.zip = filter.zip
      if (filter.country)               p.country = filter.country
      if (filter.note_type)             p.note_type = filter.note_type
      if (filter.note_creator)          p.note_creator = filter.note_creator
      if (filter.branch !== 'all')      p.branch = filter.branch
    }
    return p
  }

  const doSearch = async (off: number, mode: 'contains' | 'begins' | 'selecting') => {
    setLoading(true)
    setError('')
    setSearched(true)
    try {
      const res = await search(buildParams(off, mode))
      setResults(res.data)
      setTotal(res.total)
      setOffset(off)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handlePage = (newOffset: number) => {
    doSearch(newOffset, 'contains')
    window.scrollTo(0, 0)
  }

  const thCls = (col: string) =>
    `px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer hover:text-[#0a6b6b] select-none whitespace-nowrap ${order === col ? 'text-[#0a6b6b]' : ''}`

  const sortBy = (col: string) => {
    setOrder(col)
  }

  const SortArrow = ({ col }: { col: string }) =>
    order === col
      ? <span className="ml-1 text-[#0a6b6b]">↑</span>
      : <span className="ml-1 text-gray-300">↕</span>

  return (
    <Layout>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold text-gray-800">Vyhledávání</h1>
        <div className="flex gap-0 border border-gray-300 rounded-lg overflow-hidden text-sm">
          <button
            onClick={() => setTab('a')}
            className={`px-4 py-1.5 transition-colors ${tab === 'a' ? 'bg-[#0a6b6b] text-white font-medium' : 'text-gray-600 hover:bg-gray-50'}`}>
            Hledání A
          </button>
          <button
            onClick={() => setTab('b')}
            className={`px-4 py-1.5 border-l border-gray-300 transition-colors ${tab === 'b' ? 'bg-[#0a6b6b] text-white font-medium' : 'text-gray-600 hover:bg-gray-50'}`}>
            Hledání B
          </button>
        </div>
      </div>

      {tab === 'b' && <SearchB />}

      {tab === 'a' && <><div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-5">
        <div className="grid grid-cols-1 xl:grid-cols-2 divide-y xl:divide-y-0 xl:divide-x divide-gray-100">

          {/* ── Left: text search ───────────────────────────────── */}
          <div className="p-5" onKeyDown={e => { if (e.key === 'Enter') doSearch(0, 'contains') }}>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Hledat dle textu</p>
            <table className="w-full">
              <tbody>
                <RadioPair
                  leftField="id" leftLabel="ID"
                  leftInput={<input ref={firstRef} className={inp} value={text.id}
                    onChange={t('id')}
                    onFocus={() => setText(p => ({ ...p, sort: 'id' }))}
                    onBlur={() => setText(p => ({ ...p, id: formatId(p.id) }))}
                    placeholder="CZ0…" />}
                  rightField="company" rightLabel="Firma"
                  rightInput={<input className={inp} value={text.company} onChange={t('company')} onFocus={() => setText(p => ({ ...p, sort: 'company' }))} />}
                  sort={text.sort} onSort={s => setText(p => ({ ...p, sort: s }))}
                />
                <RadioPair
                  leftField="cin" leftLabel="IČO"
                  leftInput={<input className={inp} value={text.cin} onChange={t('cin')} onFocus={() => setText(p => ({ ...p, sort: 'cin' }))} />}
                  rightField="street" rightLabel="Ulice"
                  rightInput={<input className={inp} value={text.street} onChange={t('street')} onFocus={() => setText(p => ({ ...p, sort: 'street' }))} />}
                  sort={text.sort} onSort={s => setText(p => ({ ...p, sort: s }))}
                />
                <RadioPair
                  leftField="zip" leftLabel="PSČ"
                  leftInput={<input className={inp} value={text.zip} onChange={t('zip')} onFocus={() => setText(p => ({ ...p, sort: 'zip' }))} />}
                  rightField="city" rightLabel="Město"
                  rightInput={<input className={inp} value={text.city} onChange={t('city')} onFocus={() => setText(p => ({ ...p, sort: 'city' }))} />}
                  sort={text.sort} onSort={s => setText(p => ({ ...p, sort: s }))}
                />
                <RadioPair
                  leftField="phone" leftLabel="Tel"
                  leftInput={<input className={inp} value={text.phone} onChange={t('phone')} onFocus={() => setText(p => ({ ...p, sort: 'phone' }))} />}
                  rightField="name" rightLabel="Jméno"
                  rightInput={<input className={inp} value={text.name} onChange={t('name')} onFocus={() => setText(p => ({ ...p, sort: 'name' }))} />}
                  sort={text.sort} onSort={s => setText(p => ({ ...p, sort: s }))}
                />
                <RadioPair
                  leftField="username" leftLabel="Už.jméno"
                  leftInput={<input className={inp} value={text.username} onChange={t('username')} onFocus={() => setText(p => ({ ...p, sort: 'username' }))} />}
                  rightField="email" rightLabel="E-mail"
                  rightInput={<input className={inp} value={text.email} onChange={t('email')} onFocus={() => setText(p => ({ ...p, sort: 'email' }))} />}
                  sort={text.sort} onSort={s => setText(p => ({ ...p, sort: s }))}
                />
              </tbody>
            </table>
            <div className="flex gap-2 mt-4">
              <button onClick={() => doSearch(0, 'contains')}
                className="px-4 py-1.5 bg-[#0a6b6b] hover:bg-[#085858] text-white text-sm rounded-lg">
                Obsahuje
              </button>
              <button onClick={() => doSearch(0, 'begins')}
                className="px-4 py-1.5 bg-[#0a6b6b] hover:bg-[#085858] text-white text-sm rounded-lg">
                Začíná
              </button>
              <button onClick={() => setText(emptyText())}
                className="px-4 py-1.5 border border-gray-300 hover:bg-gray-50 text-gray-600 text-sm rounded-lg">
                Smaž vše
              </button>
            </div>
          </div>

          {/* ── Right: filter search ─────────────────────────────── */}
          <div className="p-5">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Filtrování</p>
            <table className="w-full text-sm">
              <tbody>
                {/* row 1: Smlouva + Registrace */}
                <tr>
                  <td className="text-xs text-gray-500 pr-2 py-1 whitespace-nowrap">Smlouva:</td>
                  <td className="py-1" colSpan={2}>
                    <div className="flex items-center gap-1">
                      <select value={filter.tariff} onChange={f('tariff')} className="border border-gray-300 rounded px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-teal-500 flex-1 min-w-0">
                        <option value="all">— vše —</option>
                        {meta.tariffs.map(t => <option key={t.tariff} value={t.tariff}>{t.name}</option>)}
                        <option value="null">Bez tarifu</option>
                        <option value="exte">Zpravodaj CZ</option>
                        <option value="exte2">Zpravodaj CZ+INZ</option>
                        <option value="notm">NE-TruckMan.</option>
                        <option value="allnostop">VŠE bez Zastav.</option>
                        <option value="tmsim12">TM + SIM 1,2</option>
                        <option value="tmsimInv">Fakt. SIM s DIČ</option>
                        <option value="tmsimInv2">Fakt. SIM bez DIČ</option>
                        <option value="truckmanager">TruckManager</option>
                      </select>
                      <label className="flex items-center gap-1 text-xs text-gray-500 whitespace-nowrap">
                        <input type="checkbox" checked={filter.contract_date_null} onChange={e => setFilter(p => ({ ...p, contract_date_null: e.target.checked }))} className="accent-[#0a6b6b]" />
                        null
                      </label>
                    </div>
                  </td>
                  <td className="text-xs text-gray-500 pl-3 pr-1 py-1 whitespace-nowrap">Registrace:</td>
                  <td className="py-1"><input type="date" className={inp} value={filter.prog_lent_date} onChange={f('prog_lent_date')} /></td>
                  <td className="py-1 pl-1">
                    <select value={filter.prog_lent_date_op} onChange={f('prog_lent_date_op')} className="border border-gray-300 rounded px-1 py-1 text-xs outline-none">
                      <option>&gt;=</option><option>&lt;=</option><option>=</option>
                    </select>
                  </td>
                </tr>
                {/* row 2: Smlouva datum + Přístup */}
                <tr>
                  <td className="text-xs text-gray-500 pr-2 py-1 whitespace-nowrap">Smlouva:</td>
                  <td className="py-1"><input type="date" className={inp} value={filter.contract_date_from} onChange={f('contract_date_from')} /></td>
                  <td className="py-1 pl-1"><input type="date" className={inp} value={filter.contract_date_to} onChange={f('contract_date_to')} /></td>
                  <td className="text-xs text-gray-500 pl-3 pr-1 py-1 whitespace-nowrap">Přístup:</td>
                  <td className="py-1"><input type="date" className={inp} value={filter.admittance_date} onChange={f('admittance_date')} /></td>
                  <td className="py-1 pl-1">
                    <select value={filter.admittance_date_op} onChange={f('admittance_date_op')} className="border border-gray-300 rounded px-1 py-1 text-xs outline-none">
                      <option>&gt;=</option><option>&lt;=</option><option>=</option>
                    </select>
                  </td>
                </tr>
                {/* row 3: Oblast + PSČ + Program */}
                <tr>
                  <td className="text-xs text-gray-500 pr-2 py-1 whitespace-nowrap">Oblast:</td>
                  <td className="py-1"><input className={inpSm} value={filter.region} onChange={f('region')} maxLength={3} placeholder="001" /></td>
                  <td className="py-1 pl-1">
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-gray-500 whitespace-nowrap">PSČ:</span>
                      <input className={inpSm} value={filter.zip} onChange={f('zip')} />
                    </div>
                  </td>
                  <td className="text-xs text-gray-500 pl-3 pr-1 py-1 whitespace-nowrap">Program:</td>
                  <td className="py-1"><input type="date" className={inp} value={filter.prog_sent_date} onChange={f('prog_sent_date')} /></td>
                  <td className="py-1 pl-1">
                    <select value={filter.prog_sent_date_op} onChange={f('prog_sent_date_op')} className="border border-gray-300 rounded px-1 py-1 text-xs outline-none">
                      <option>&gt;=</option><option>&lt;=</option><option>=</option>
                    </select>
                  </td>
                </tr>
                {/* row 4: Poznámka + Země */}
                <tr>
                  <td className="text-xs text-gray-500 pr-2 py-1 whitespace-nowrap">Poznámka:</td>
                  <td className="py-1"><input type="date" className={inp} value={filter.note_from} onChange={f('note_from')} /></td>
                  <td className="py-1 pl-1"><input type="date" className={inp} value={filter.note_to} onChange={f('note_to')} /></td>
                  <td className="text-xs text-gray-500 pl-3 pr-1 py-1 whitespace-nowrap">Země:</td>
                  <td className="py-1" colSpan={2}><input className={inp} value={filter.country} onChange={f('country')} placeholder="CZ, SK…" maxLength={3} /></td>
                </tr>
                {/* row 5: Kód + Iniciály + Obor */}
                <tr>
                  <td className="text-xs text-gray-500 pr-2 py-1 whitespace-nowrap">Kód:</td>
                  <td className="py-1"><input className={inpSm} value={filter.note_type} onChange={f('note_type')} maxLength={1} /></td>
                  <td className="py-1 pl-1">
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-gray-500 whitespace-nowrap">Iniciály:</span>
                      <input className={inpSm} value={filter.note_creator} onChange={f('note_creator')} maxLength={2} />
                    </div>
                  </td>
                  <td className="text-xs text-gray-500 pl-3 pr-1 py-1 whitespace-nowrap">Obor:</td>
                  <td className="py-1" colSpan={2}>
                    <select value={filter.branch} onChange={f('branch')} className="border border-gray-300 rounded px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-teal-500 w-full">
                      <option value="all">— vše —</option>
                      {meta.branches.map((b: any) => <option key={b.branch} value={b.branch}>{b.name}</option>)}
                    </select>
                  </td>
                </tr>
              </tbody>
            </table>
            <div className="flex gap-2 mt-4">
              <button onClick={() => doSearch(0, 'selecting')}
                className="px-4 py-1.5 bg-[#0a6b6b] hover:bg-[#085858] text-white text-sm rounded-lg">
                Výběr
              </button>
              <button onClick={() => setFilter(emptyFilter())}
                className="px-4 py-1.5 border border-gray-300 hover:bg-gray-50 text-gray-600 text-sm rounded-lg">
                Smaž vše
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 mb-4 text-sm">{error}</div>
      )}

      {/* Results */}
      {(searched || loading) && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <span className="text-sm text-gray-600">
              {loading ? 'Hledám…' : total > 0
                ? <><strong>{total}</strong> záznamů</>
                : 'Žádné výsledky'}
            </span>
            {loading && <Spinner size={4} />}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className={thCls('id')} onClick={() => sortBy('id')}>ID<SortArrow col="id" /></th>
                  <th className={thCls('company')} onClick={() => sortBy('company')}>Firma<SortArrow col="company" /></th>
                  <th className={thCls('street') + ' hidden lg:table-cell'} onClick={() => sortBy('street')}>Ulice<SortArrow col="street" /></th>
                  <th className={thCls('zip') + ' hidden xl:table-cell'} onClick={() => sortBy('zip')}>PSČ<SortArrow col="zip" /></th>
                  <th className={thCls('city')} onClick={() => sortBy('city')}>Město<SortArrow col="city" /></th>
                  <th className={thCls('country') + ' hidden md:table-cell'} onClick={() => sortBy('country')}>Stát<SortArrow col="country" /></th>
                  <th className={thCls('region') + ' hidden xl:table-cell'} onClick={() => sortBy('region')}>Oblast<SortArrow col="region" /></th>
                  <th className={thCls('tariff') + ' hidden lg:table-cell'} onClick={() => sortBy('tariff')}>Tarif<SortArrow col="tariff" /></th>
                  <th className={thCls('last_modif') + ' hidden xl:table-cell'} onClick={() => sortBy('last_modif')}>Změna<SortArrow col="last_modif" /></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {results.map(c => (
                  <tr key={c.company_key}
                    onClick={() => setModalKey(c.company_key)}
                    className="hover:bg-teal-50 cursor-pointer transition-colors">
                    <td className="px-3 py-2 font-mono text-xs text-gray-500">{c.id}</td>
                    <td className="px-3 py-2 font-medium text-gray-900">
                      <a
                        href={`#/company/${c.company_key}`}
                        target="_blank"
                        rel="noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="hover:text-[#0a6b6b] hover:underline"
                      >{c.company}</a>
                    </td>
                    <td className="px-3 py-2 text-gray-500 hidden lg:table-cell">{c.street}</td>
                    <td className="px-3 py-2 text-gray-500 hidden xl:table-cell font-mono text-xs">{c.zip}</td>
                    <td className="px-3 py-2 text-gray-600">{c.city}</td>
                    <td className="px-3 py-2 hidden md:table-cell">
                      {c.country && <span className="bg-gray-100 text-gray-600 rounded px-1.5 py-0.5 text-xs font-mono">{c.country}</span>}
                    </td>
                    <td className="px-3 py-2 text-gray-500 hidden xl:table-cell text-xs">{c.region?.trim()}</td>
                    <td className="px-3 py-2 hidden lg:table-cell">
                      {c.tariff_name
                        ? <span className="bg-teal-100 text-[#0a6b6b] rounded px-1.5 py-0.5 text-xs">{c.tariff_name}</span>
                        : c.tariff ? <span className="text-gray-400 text-xs">{c.tariff}</span> : null}
                    </td>
                    <td className="px-3 py-2 text-gray-400 hidden xl:table-cell text-xs">{formatDate(c.last_modif)}</td>
                  </tr>
                ))}
                {results.length === 0 && !loading && (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-gray-400">Žádné výsledky</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {total > LIMIT && (
            <div className="px-5 pb-4">
              <Pagination total={total} limit={LIMIT} offset={offset} onChange={handlePage} />
            </div>
          )}
        </div>
      )}

      {modalKey && (
        <CompanyDetailModal
          companyKey={modalKey}
          onClose={() => setModalKey(null)}
        />
      )}
      </>}
    </Layout>
  )
}
