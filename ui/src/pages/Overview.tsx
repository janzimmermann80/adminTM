import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Layout } from '../components/Layout'
import { Spinner } from '../components/Spinner'
import { useAuth } from '../context/AuthContext'
import {
  getStatsOverview,
  getStatsClaims,
  getStatsDiaryByOwner,
  getStatsLentMonthly,
  getDiaryUpcoming,
  getStatsExpiredAccess,
  getStatsOverdueCompanies,
} from '../api'
import { formatDate, formatNumber } from '../utils'

// ── KPI tile ─────────────────────────────────────────────────────────────────

const Tile = ({
  label, value, sub, icon, color = 'teal',
}: {
  label: string
  value: React.ReactNode
  sub?: string
  icon: React.ReactNode
  color?: 'teal' | 'amber' | 'red' | 'blue' | 'gray'
}) => {
  const bg: Record<string, string> = {
    teal:  'bg-teal-50  text-[#0a6b6b]',
    amber: 'bg-amber-50 text-amber-600',
    red:   'bg-red-50   text-red-600',
    blue:  'bg-blue-50  text-blue-600',
    gray:  'bg-gray-100 text-gray-500',
  }
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex gap-4 items-start shadow-sm">
      <div className={`w-11 h-11 rounded-lg flex items-center justify-center flex-shrink-0 ${bg[color]}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-0.5">{label}</p>
        <p className="text-2xl font-bold text-gray-800 leading-none">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
      </div>
    </div>
  )
}

// ── Lent monthly chart (36 months) ───────────────────────────────────────────

const LentChart = ({ data }: { data: { month: string; count: number }[] }) => {
  if (data.length === 0) return <div className="h-24 flex items-center justify-center text-sm text-gray-400">Načítání…</div>

  const max = Math.max(...data.map(d => d.count), 1)
  const chartH = 120
  const labelH = 28
  const valH   = 14
  const totalH = chartH + labelH + valH + 6
  const gap    = 3
  const n      = data.length
  const W      = 800
  const barW   = Math.floor((W - (n - 1) * gap) / n)

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${totalH}`} style={{ minWidth: 600, width: '100%', height: totalH }}>
        {data.map((d, i) => {
          const barH = d.count > 0 ? Math.max((d.count / max) * chartH, 3) : 0
          const x    = i * (barW + gap)
          const y    = chartH - barH
          const [yr, mo] = d.month.split('-')
          const isJan = mo === '01'

          return (
            <g key={d.month}>
              {/* year divider */}
              {isJan && i > 0 && (
                <line x1={x - gap / 2} y1={0} x2={x - gap / 2} y2={chartH + labelH + valH + 6}
                  stroke="#e5e7eb" strokeWidth={1} />
              )}
              {/* bar */}
              <rect x={x} y={y} width={barW} height={barH}
                fill={isJan ? '#0d8080' : '#0a6b6b'} rx={1} opacity={d.count > 0 ? 1 : 0} />
              {/* value above bar */}
              {d.count > 0 && (
                <text x={x + barW / 2} y={y - 3} textAnchor="middle" fontSize={9} fill="#374151">
                  {d.count}
                </text>
              )}
              {/* month label */}
              <text x={x + barW / 2} y={chartH + valH + 2} textAnchor="middle" fontSize={8} fill="#9ca3af">
                {mo}
              </text>
              {/* year label — only on January */}
              {isJan && (
                <text x={x + barW / 2} y={chartH + valH + 14} textAnchor="middle" fontSize={9}
                  fontWeight="600" fill="#4b5563">
                  {yr}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

// ── Overdue claims tile with region breakdown ─────────────────────────────────

const OverdueTile = ({
  total, count, companyCount, byRegion, showList, onToggle, activeRegion, onRegionToggle,
}: {
  total: number
  count: number
  companyCount: number
  byRegion: { region: string; count: number; total_sum: string }[]
  showList: boolean
  onToggle: () => void
  activeRegion: string | null
  onRegionToggle: (region: string) => void
}) => {
  const color = total > 0 ? 'red' : 'gray'
  const bg: Record<string, string> = {
    red:  'bg-red-50   text-red-600',
    gray: 'bg-gray-100 text-gray-500',
  }
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex gap-4 items-start shadow-sm">
      <div className={`w-11 h-11 rounded-lg flex items-center justify-center flex-shrink-0 ${bg[color]}`}>
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-0.5">Pohledávky po splatnosti min. 14 dní</p>
        <p className="text-2xl font-bold text-gray-800 leading-none">{formatNumber(total)} Kč</p>
        <div className="flex items-center gap-2 mt-1 mb-2">
          <span className="text-xs text-gray-400">{count} faktur</span>
          {companyCount > 0 && (
            <button
              onClick={onToggle}
              className="flex items-center gap-1 text-xs text-red-500 font-medium hover:text-red-700 transition-colors"
            >
              ({companyCount} firem)
              <svg className={`w-3 h-3 transition-transform ${showList ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          )}
        </div>
        {byRegion.length > 0 && (
          <div className="space-y-1">
            {byRegion.map(r => (
              <div key={r.region} className="flex items-center justify-between gap-2 text-xs">
                <span className="text-gray-500 font-medium shrink-0">Oblast {r.region}</span>
                <span className="text-gray-700 font-semibold tabular-nums">{formatNumber(Number(r.total_sum))} Kč</span>
                <button
                  onClick={() => onRegionToggle(r.region)}
                  className={`flex items-center gap-0.5 font-medium transition-colors ${activeRegion === r.region ? 'text-red-600' : 'text-gray-400 hover:text-red-500'}`}
                >
                  ({r.count})
                  <svg className={`w-3 h-3 transition-transform ${activeRegion === r.region ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Claim aging color ────────────────────────────────────────────────────────

const claimColor: Record<string, string> = {
  current: 'bg-green-100 text-green-700',
  '0-30':  'bg-amber-100 text-amber-700',
  '31-60': 'bg-orange-100 text-orange-700',
  '61-90': 'bg-red-100 text-red-700',
  '90+':   'bg-red-200 text-red-900',
}
const claimLabel: Record<string, string> = {
  current: 'Splatné',
  '0-30':  '0–30 dní',
  '31-60': '31–60 dní',
  '61-90': '61–90 dní',
  '90+':   'Nad 90 dní',
}

// ── Main component ────────────────────────────────────────────────────────────

export const Overview = () => {
  const { user } = useAuth()
  const [overview, setOverview]         = useState<any>(null)
  const [claims, setClaims]             = useState<any[]>([])
  const [diaryBy, setDiaryBy]           = useState<any[]>([])
  const [diary, setDiary]               = useState<any[]>([])
  const [lent, setLent]                 = useState<any[]>([])
  const [loading, setLoading]           = useState(true)
  const [showExpired, setShowExpired]       = useState(false)
  const [expiredList, setExpiredList]       = useState<any[] | null>(null)
  const [expiredLoading, setExpiredLoading] = useState(false)
  const [showOverdue, setShowOverdue]           = useState(false)
  const [overdueList, setOverdueList]           = useState<any[] | null>(null)
  const [overdueLoading, setOverdueLoading]     = useState(false)
  const [activeRegion, setActiveRegion]         = useState<string | null>(null)
  const [regionLists, setRegionLists]           = useState<Record<string, any[]>>({})
  const [regionLoading, setRegionLoading]       = useState(false)

  useEffect(() => {
    const initials = user?.initials ?? ''
    Promise.all([
      getStatsOverview().then(setOverview),
      getStatsClaims().then(setClaims),
      getStatsDiaryByOwner().then(setDiaryBy),
      getStatsLentMonthly().then(setLent),
      initials ? getDiaryUpcoming(initials).then((r: any) => setDiary(r.data ?? [])) : Promise.resolve(),
    ]).finally(() => setLoading(false))
  }, [])

  const handleOverdueToggle = () => {
    if (!showOverdue && overdueList === null) {
      setOverdueLoading(true)
      getStatsOverdueCompanies()
        .then(setOverdueList)
        .catch(() => setOverdueList([]))
        .finally(() => setOverdueLoading(false))
    }
    setShowOverdue(v => !v)
    setActiveRegion(null)
  }

  const handleRegionToggle = (region: string) => {
    if (activeRegion === region) {
      setActiveRegion(null)
      return
    }
    setActiveRegion(region)
    setShowOverdue(false)
    if (!regionLists[region]) {
      setRegionLoading(true)
      getStatsOverdueCompanies(region)
        .then(rows => setRegionLists(prev => ({ ...prev, [region]: rows })))
        .catch(() => setRegionLists(prev => ({ ...prev, [region]: [] })))
        .finally(() => setRegionLoading(false))
    }
  }

  const handleExpiredToggle = () => {
    if (!showExpired && expiredList === null) {
      setExpiredLoading(true)
      getStatsExpiredAccess()
        .then(setExpiredList)
        .catch(() => setExpiredList([]))
        .finally(() => setExpiredLoading(false))
    }
    setShowExpired(v => !v)
  }

  if (loading) {
    return (
      <Layout>
        <div className="flex justify-center py-24"><Spinner size={10} /></div>
      </Layout>
    )
  }

  const totalCompanies = overview?.active_companies ?? 0
  const totalOverdue = Number(overview?.overdue_claims?.total_sum ?? 0)

  return (
    <Layout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-800">Přehled</h1>
        <span className="text-sm text-gray-400">{new Date().toLocaleDateString('cs-CZ', { day: '2-digit', month: 'long', year: 'numeric' })}</span>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
        <Tile
          label="Aktivní firmy"
          value={totalCompanies}
          sub="s platným přístupem"
          color="teal"
          icon={<svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>}
        />
        <div className="col-span-2 xl:col-span-2">
          <OverdueTile
            total={totalOverdue}
            count={overview?.overdue_claims?.count ?? 0}
            companyCount={overview?.overdue_claims?.company_count ?? 0}
            byRegion={overview?.overdue_claims_by_region ?? []}
            showList={showOverdue}
            onToggle={handleOverdueToggle}
            activeRegion={activeRegion}
            onRegionToggle={handleRegionToggle}
          />
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5 flex gap-4 items-start shadow-sm">
          <div className="w-11 h-11 rounded-lg flex items-center justify-center flex-shrink-0 bg-gray-100 text-gray-500">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M8 17a2 2 0 100-4 2 2 0 000 4zm8 0a2 2 0 100-4 2 2 0 000 4zM1 3h15v13H1zM16 8h4l3 3v5h-7V8z" /></svg>
          </div>
          <div className="min-w-0">
            <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-0.5">Vozidla TM</p>
            <p className="text-2xl font-bold text-gray-800 leading-none">{overview?.active_vehicles ?? 0}</p>
            <p className="text-xs text-gray-400 mt-1">pozice za posledních 7 dní</p>
            {(overview?.expired_access_with_tracking ?? 0) > 0 && (
              <button
                onClick={handleExpiredToggle}
                className="mt-1.5 flex items-center gap-1 text-xs text-red-500 font-medium hover:text-red-700 transition-colors"
              >
                <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                {overview.expired_access_with_tracking} firem bez přístupu
                <svg className={`w-3 h-3 transition-transform ${showExpired ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Firmy s pohledávkami po splatnosti — rozbalitelná tabulka */}
      {showOverdue && (
        <div className="bg-white rounded-xl border border-red-200 shadow-sm mb-5 overflow-hidden">
          <div className="px-5 py-3 border-b border-red-100 flex items-center justify-between bg-red-50">
            <span className="text-sm font-semibold text-red-700">Firmy s pohledávkami po splatnosti</span>
            {overdueLoading
              ? <Spinner size={4} />
              : <span className="text-xs text-red-400">{overdueList?.length ?? 0} firem</span>
            }
          </div>
          {overdueLoading ? (
            <div className="flex justify-center py-8"><Spinner size={8} /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wide">
                    <th className="px-4 py-3 font-medium">ID</th>
                    <th className="px-4 py-3 font-medium">Firma</th>
                    <th className="px-4 py-3 font-medium hidden md:table-cell">Město</th>
                    <th className="px-4 py-3 font-medium hidden lg:table-cell">Tarif</th>
                    <th className="px-4 py-3 font-medium text-right">Faktur</th>
                    <th className="px-4 py-3 font-medium text-right">Dluh</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(overdueList ?? []).map((c: any) => (
                    <tr
                      key={c.company_key}
                      onClick={() => window.open(`#/company/${c.company_key}`, '_blank')}
                      className="hover:bg-red-50 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3 text-gray-400 font-mono text-xs">{c.id}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{c.company}</td>
                      <td className="px-4 py-3 text-gray-600 hidden md:table-cell">{c.city}</td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        {c.tariff_name ? (
                          <span className="inline-flex items-center bg-teal-100 text-teal-700 rounded px-1.5 py-0.5 text-xs">{c.tariff_name}</span>
                        ) : c.tariff ? (
                          <span className="text-gray-400 text-xs">{c.tariff}</span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-500 text-xs">{c.invoice_count}</td>
                      <td className="px-4 py-3 text-right font-semibold text-red-600 text-xs tabular-nums whitespace-nowrap">
                        {formatNumber(Number(c.total_sum))} Kč
                      </td>
                    </tr>
                  ))}
                  {(overdueList ?? []).length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-gray-400">Žádné pohledávky</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Firmy s pohledávkami — oblast */}
      {activeRegion && (
        <div className="bg-white rounded-xl border border-red-200 shadow-sm mb-5 overflow-hidden">
          <div className="px-5 py-3 border-b border-red-100 flex items-center justify-between bg-red-50">
            <span className="text-sm font-semibold text-red-700">Pohledávky po splatnosti — Oblast {activeRegion}</span>
            {regionLoading
              ? <Spinner size={4} />
              : <span className="text-xs text-red-400">{regionLists[activeRegion]?.length ?? 0} firem</span>
            }
          </div>
          {regionLoading ? (
            <div className="flex justify-center py-8"><Spinner size={8} /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wide">
                    <th className="px-4 py-3 font-medium">ID</th>
                    <th className="px-4 py-3 font-medium">Firma</th>
                    <th className="px-4 py-3 font-medium hidden md:table-cell">Město</th>
                    <th className="px-4 py-3 font-medium hidden lg:table-cell">Tarif</th>
                    <th className="px-4 py-3 font-medium text-right">Faktur</th>
                    <th className="px-4 py-3 font-medium text-right">Dluh</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(regionLists[activeRegion] ?? []).map((c: any) => (
                    <tr
                      key={c.company_key}
                      onClick={() => window.open(`#/company/${c.company_key}`, '_blank')}
                      className="hover:bg-red-50 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3 text-gray-400 font-mono text-xs">{c.id}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{c.company}</td>
                      <td className="px-4 py-3 text-gray-600 hidden md:table-cell">{c.city}</td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        {c.tariff_name ? (
                          <span className="inline-flex items-center bg-teal-100 text-teal-700 rounded px-1.5 py-0.5 text-xs">{c.tariff_name}</span>
                        ) : c.tariff ? (
                          <span className="text-gray-400 text-xs">{c.tariff}</span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-500 text-xs">{c.invoice_count}</td>
                      <td className="px-4 py-3 text-right font-semibold text-red-600 text-xs tabular-nums whitespace-nowrap">
                        {formatNumber(Number(c.total_sum))} Kč
                      </td>
                    </tr>
                  ))}
                  {(regionLists[activeRegion] ?? []).length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-gray-400">Žádné pohledávky</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Firmy bez přístupu — rozbalitelná tabulka */}
      {showExpired && (
        <div className="bg-white rounded-xl border border-red-200 shadow-sm mb-5 overflow-hidden">
          <div className="px-5 py-3 border-b border-red-100 flex items-center justify-between bg-red-50">
            <span className="text-sm font-semibold text-red-700">Firmy bez platného přístupu — aktivní GPS import</span>
            {expiredLoading
              ? <Spinner size={4} />
              : <span className="text-xs text-red-400">{expiredList?.length ?? 0} firem</span>
            }
          </div>
          {expiredLoading ? (
            <div className="flex justify-center py-8"><Spinner size={8} /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wide">
                    <th className="px-4 py-3 font-medium">ID</th>
                    <th className="px-4 py-3 font-medium">Firma</th>
                    <th className="px-4 py-3 font-medium hidden md:table-cell">Uživatel</th>
                    <th className="px-4 py-3 font-medium hidden lg:table-cell">Typ importu</th>
                    <th className="px-4 py-3 font-medium hidden lg:table-cell">Přístup do</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(expiredList ?? []).map((c: any) => (
                    <tr
                      key={c.company_key}
                      onClick={() => window.open(`#/company/${c.company_key}`, '_blank')}
                      className="hover:bg-red-50 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3 text-gray-400 font-mono text-xs">{c.comp_id}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{c.comp_name}</td>
                      <td className="px-4 py-3 text-gray-600 hidden md:table-cell text-xs">{c.usr}</td>
                      <td className="px-4 py-3 hidden lg:table-cell text-xs text-gray-500">{c.import_type}</td>
                      <td className="px-4 py-3 hidden lg:table-cell text-xs text-red-500 font-medium">
                        {c.admittance_date ? formatDate(c.admittance_date) : '—'}
                      </td>
                    </tr>
                  ))}
                  {(expiredList ?? []).length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-gray-400">Žádné firmy</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Lent monthly chart */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-700">Registrace za posledních 36 měsíců</h2>
          <span className="text-xs text-gray-400">{lent.reduce((s, m) => s + m.count, 0)} celkem</span>
        </div>
        <LentChart data={lent} />
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">

        {/* Claims aging */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Pohledávky po splatnosti — stáří</h2>
          {claims.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">Žádné pohledávky po splatnosti</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 uppercase">
                  <th className="text-left pb-2">Stáří</th>
                  <th className="text-right pb-2">Počet</th>
                  <th className="text-right pb-2">Suma</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {claims.map((c: any) => (
                  <tr key={c.bucket}>
                    <td className="py-2">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${claimColor[c.bucket] ?? 'bg-gray-100 text-gray-600'}`}>
                        {claimLabel[c.bucket] ?? c.bucket}
                      </span>
                    </td>
                    <td className="py-2 text-right text-gray-600">{c.count}</td>
                    <td className="py-2 text-right font-medium text-gray-800">{formatNumber(Number(c.total))} Kč</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Upcoming diary */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-1">Deník — nejbližší záznamy</h2>
          <p className="text-xs text-gray-400 mb-3">{user?.name ?? user?.initials} · 14 dní</p>
          {diary.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">Žádné záznamy</p>
          ) : (
            <ul className="divide-y divide-gray-50 max-h-60 overflow-y-auto">
              {diary.map((d: any) => (
                <li key={d.diary_key} className={`py-2 flex gap-2 ${d.completed === '1' ? 'opacity-50' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs text-gray-400 shrink-0">{formatDate(d.time)}</span>
                      {d.company && (
                        <Link to={`/company/${d.company_key}`} target="_blank" className="text-xs text-[#0a6b6b] hover:underline truncate">
                          {d.company}
                        </Link>
                      )}
                    </div>
                    <p className="text-sm text-gray-700 leading-snug">{d.text}</p>
                  </div>
                  {d.completed === '1' && (
                    <svg className="w-4 h-4 text-green-500 shrink-0 mt-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Diary by owner */}
      {diaryBy.length > 0 && (
        <div className="mt-5 bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Deník dle pracovníka — posledních 30 dní</h2>
          <div className="overflow-x-auto">
            <table className="text-sm w-full">
              <thead>
                <tr className="text-xs text-gray-400 uppercase border-b">
                  <th className="text-left pb-2 font-medium">Pracovník</th>
                  <th className="text-right pb-2 font-medium">Celkem</th>
                  <th className="text-right pb-2 font-medium">Splněno</th>
                  <th className="text-right pb-2 font-medium">Čeká</th>
                  <th className="pb-2 w-32"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {diaryBy.map((r: any) => {
                  const maxTotal = Math.max(...diaryBy.map((x: any) => x.total), 1)
                  return (
                    <tr key={r.owner}>
                      <td className="py-2 font-medium text-gray-700">{r.owner}</td>
                      <td className="py-2 text-right text-gray-600">{r.total}</td>
                      <td className="py-2 text-right text-green-600">{r.done}</td>
                      <td className="py-2 text-right text-amber-600">{r.pending}</td>
                      <td className="py-2 pl-4">
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-2 bg-[#0a6b6b] rounded-full" style={{ width: `${(r.total / maxTotal) * 100}%` }} />
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Layout>
  )
}
