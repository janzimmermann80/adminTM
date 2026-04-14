import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Spinner } from '../../components/Spinner'
import { getCompany, getCompanySummary, createDiaryEntry, getContacts, getImpersonateUrl } from '../../api'
import { formatDate } from '../../utils'
import { useAuth } from '../../context/AuthContext'
import type { CompanyDetail as ICompanyDetail } from '../../types'
import { TabInfo } from './TabInfo'
import { TabContacts } from './TabContacts'
import { TabInvoices } from './TabInvoices'
import { TabVehicles } from './TabVehicles'
import { TabNotes } from './TabNotes'
import { TabOnline } from './TabOnline'

const StatBadge = ({ label, active, total, activeLabel }: {
  label: string; active: number; total: number; activeLabel: string
}) => (
  <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5">
    <span className="text-xs text-gray-500 font-medium">{label}:</span>
    <span className={`text-xs font-bold tabular-nums ${active > 0 ? 'text-teal-700' : 'text-gray-400'}`}>
      {active}
    </span>
    <span className="text-xs text-gray-300">/</span>
    <span className="text-xs text-gray-600 tabular-nums font-semibold">{total}</span>
    <span className="text-xs text-gray-400 hidden sm:inline">({activeLabel})</span>
  </div>
)

const TABS = [
  { key: 'info',     label: 'Základní info' },
  { key: 'contacts', label: 'Kontakty' },
  { key: 'invoices', label: 'Faktury' },
  { key: 'vehicles', label: 'TruckManager' },
  { key: 'notes',    label: 'Poznámky' },
  { key: 'online',   label: 'Online' },
]

interface Props {
  companyKey: string
  initialTab?: string
  onClose?: () => void
}

export const CompanyDetailPanel = ({ companyKey, initialTab = 'info', onClose }: Props) => {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [company, setCompany] = useState<ICompanyDetail | null>(null)
  const [summary, setSummary] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState(initialTab)
  const [orphanAccounts, setOrphanAccounts] = useState<any[]>([])
  const [impersonating, setImpersonating] = useState<string | null>(null)

  // Přidání záznamu do deníku
  const [diaryOpen, setDiaryOpen]   = useState(false)
  const [diaryText, setDiaryText]   = useState('')
  const [diaryDate, setDiaryDate]   = useState('')
  const [diaryTime, setDiaryTime]   = useState('')
  const [diarySaving, setDiarySaving] = useState(false)
  const [diaryError, setDiaryError] = useState('')
  const diaryRef = useRef<HTMLTextAreaElement>(null)

  const todayStr = () => new Date().toISOString().slice(0, 10)
  const nowTimeStr = () => new Date().toTimeString().slice(0, 5)

  const openDiary = () => {
    setDiaryText('')
    setDiaryDate(todayStr())
    setDiaryTime(nowTimeStr())
    setDiaryError('')
    setDiaryOpen(true)
    setTimeout(() => diaryRef.current?.focus(), 50)
  }

  const handleSaveDiary = async () => {
    if (!diaryText.trim() || !user?.initials) return
    setDiarySaving(true)
    setDiaryError('')
    try {
      await createDiaryEntry({
        owner: user.initials,
        company_key: Number(companyKey),
        time: diaryDate + 'T' + (diaryTime || '08:00') + ':00',
        text: diaryText.trim(),
      })
      setDiaryOpen(false)
    } catch (e: any) {
      setDiaryError(e.message)
    } finally {
      setDiarySaving(false)
    }
  }

  const reload = async () => {
    try {
      const data = await getCompany(companyKey)
      setCompany(data)
    } catch (e: any) {
      setError(e.message)
    }
  }

  const handleImpersonate = async (type: string, username: string) => {
    const key = `${type}:${username}`
    setImpersonating(key)
    try {
      const { url } = await getImpersonateUrl(companyKey, type, username)
      window.open(url, '_blank')
    } catch {}
    finally { setImpersonating(null) }
  }

  useEffect(() => {
    setLoading(true)
    setTab(initialTab)
    Promise.all([
      getCompany(companyKey),
      getCompanySummary(companyKey).catch(() => null),
      getContacts(companyKey).catch(() => null),
    ]).then(([c, s, ct]) => {
      setCompany(c)
      setSummary(s)
      if (ct?.userAccounts) {
        setOrphanAccounts(ct.userAccounts.filter((a: any) => a.person_key == null))
      }
    })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [companyKey])

  if (loading) return (
    <div className="flex justify-center py-24"><Spinner size={10} /></div>
  )

  if (error || !company) return (
    <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-6 py-5">
      <p className="font-medium">Chyba při načítání firmy</p>
      <p className="text-sm mt-1">{error || 'Firma nenalezena'}</p>
    </div>
  )

  return (
    <div>
      {/* Header */}
      <div className="mb-5">
        {!onClose && (
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-3 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Zpět na vyhledávání
          </button>
        )}

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 px-6 py-5">
          <div className="flex items-baseline gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-gray-900 flex items-baseline gap-3 flex-wrap">
              <span>{company.company}</span>
              <span className="text-gray-400">{company.id}</span>
              {company.admittance_date && (() => {
                const valid = company.admittance_date >= new Date().toISOString().slice(0, 10)
                return (
                  <span className={valid ? 'text-green-600' : 'text-red-500'}>
                    {formatDate(company.admittance_date)}
                  </span>
                )
              })()}
              <button
                onClick={openDiary}
                title="Přidat záznam do deníku"
                className="self-center p-1 rounded-lg text-gray-300 hover:text-[#0a6b6b] hover:bg-teal-50 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </button>
              {company.tariff_name && (
                <span className="bg-teal-100 text-[#0a6b6b] text-xs rounded-full px-2.5 py-0.5 font-medium self-center">
                  {company.tariff_name}
                </span>
              )}
            </h1>
            <div className="ml-auto flex items-center gap-3 shrink-0">
              <div className="text-right text-xs text-gray-400">
                <p>Naposledy změněno</p>
                <p className="font-medium text-gray-600">{formatDate(company.last_modif)}</p>
              </div>
              {onClose && (
                <button
                  onClick={onClose}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                  title="Zavřít"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
            <p className="text-gray-500 text-sm">
              {[companyKey, company.street, company.zip, company.city, company.country].filter(Boolean).join(' · ')}
            </p>
            {orphanAccounts.map(acc => (
              <span key={acc.username} className="flex items-center gap-1">
                <span className="font-mono text-xs text-gray-700">{acc.username}</span>
                {(['app', 'devel'] as const).map(type => (
                  <button
                    key={type}
                    onClick={() => handleImpersonate(type, acc.username)}
                    disabled={impersonating === `${type}:${acc.username}`}
                    title={`Impersonace ${type}`}
                    className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-gray-100 hover:bg-teal-100 hover:text-teal-700 text-gray-500 transition-colors disabled:opacity-50"
                  >
                    {type}
                  </button>
                ))}
              </span>
            ))}
          </div>
          {summary && (
            <div className="flex flex-wrap gap-3 mt-3">
              <StatBadge label="Auta"       active={summary.cars.active}        total={summary.cars.total}        activeLabel="7 dní" />
              <StatBadge label="SIM"        active={summary.sims.active}        total={summary.sims.total}        activeLabel="aktivní" />
              <StatBadge label="Zakázky"    active={summary.obligations.recent} total={summary.obligations.total} activeLabel="7 dní" />
              <StatBadge label="Faktury"    active={summary.invoices.recent}    total={summary.invoices.total}    activeLabel="7 dní" />
              <StatBadge label="Objednávky" active={summary.orders.recent}      total={summary.orders.total}      activeLabel="7 dní" />
            </div>
          )}
        </div>
      </div>

      {/* Inline forma pro nový deníkový záznam */}
      {diaryOpen && (
        <div className="bg-white rounded-xl shadow-sm border border-teal-200 px-5 py-4 mb-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Nový záznam do deníku</p>
          <div className="flex gap-2 mb-2">
            <input
              type="date"
              value={diaryDate}
              onChange={e => setDiaryDate(e.target.value)}
              className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-teal-500 bg-white"
            />
            <input
              type="time"
              value={diaryTime}
              onChange={e => setDiaryTime(e.target.value)}
              className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-teal-500 bg-white"
            />
          </div>
          <textarea
            ref={diaryRef}
            value={diaryText}
            onChange={e => setDiaryText(e.target.value)}
            placeholder="Text záznamu…"
            rows={3}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-500 resize-none mb-2"
          />
          {diaryError && (
            <p className="text-xs text-red-600 mb-2">{diaryError}</p>
          )}
          <div className="flex gap-2">
            <button
              onClick={handleSaveDiary}
              disabled={diarySaving || !diaryText.trim()}
              className="flex items-center gap-1.5 bg-[#0a6b6b] hover:bg-[#085858] text-white px-3 py-1.5 rounded-lg text-xs disabled:opacity-60"
            >
              {diarySaving ? <Spinner size={3} /> : (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
              Uložit
            </button>
            <button
              onClick={() => setDiaryOpen(false)}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs hover:bg-gray-50"
            >
              Zrušit
            </button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="border-b border-gray-200 overflow-x-auto">
          <nav className="flex min-w-max">
            {TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-5 py-3.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  tab === t.key
                    ? 'border-[#0a6b6b] text-[#0a6b6b] bg-teal-50'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="p-5">
          {tab === 'info'     && <TabInfo     company={company} onReload={reload} />}
          {tab === 'contacts' && <TabContacts companyKey={companyKey} companyId={String(company.id ?? '')} />}
          {tab === 'invoices' && <TabInvoices companyKey={companyKey} companyId={String(company.id ?? '')} />}
          {tab === 'vehicles' && <TabVehicles companyKey={companyKey} />}
          {tab === 'notes'    && <TabNotes    companyKey={companyKey} />}
          {tab === 'online'   && <TabOnline   companyKey={companyKey} />}
        </div>
      </div>
    </div>
  )
}
