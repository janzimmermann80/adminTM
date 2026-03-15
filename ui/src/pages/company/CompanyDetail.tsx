import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Layout } from '../../components/Layout'
import { Spinner } from '../../components/Spinner'
import { getCompany } from '../../api'
import { formatDate } from '../../utils'
import type { CompanyDetail as ICompanyDetail } from '../../types'
import { TabInfo } from './TabInfo'
import { TabContacts } from './TabContacts'
import { TabInvoices } from './TabInvoices'
import { TabVehicles } from './TabVehicles'
import { TabNotes } from './TabNotes'

const TABS = [
  { key: 'info', label: 'Základní info' },
  { key: 'contacts', label: 'Kontakty' },
  { key: 'invoices', label: 'Faktury' },
  { key: 'vehicles', label: 'TruckManager' },
  { key: 'notes', label: 'Poznámky' },
]

export const CompanyDetail = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [company, setCompany] = useState<ICompanyDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState('info')

  const reload = async () => {
    if (!id) return
    try {
      const data = await getCompany(id)
      setCompany(data)
    } catch (e: any) {
      setError(e.message)
    }
  }

  useEffect(() => {
    if (!id) return
    setLoading(true)
    getCompany(id)
      .then(setCompany)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return (
    <Layout>
      <div className="flex justify-center py-24"><Spinner size={10} /></div>
    </Layout>
  )

  if (error || !company) return (
    <Layout>
      <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-6 py-5">
        <p className="font-medium">Chyba při načítání firmy</p>
        <p className="text-sm mt-1">{error || 'Firma nenalezena'}</p>
      </div>
    </Layout>
  )

  return (
    <Layout>
      {/* Header */}
      <div className="mb-5">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-3 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Zpět na vyhledávání
        </button>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 px-6 py-5">
          <div className="flex flex-wrap items-start gap-4 justify-between">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <span className="text-gray-400 font-mono text-sm">{company.id}</span>
                {company.tariff_name && (
                  <span className="bg-teal-100 text-[#0a6b6b] text-xs rounded-full px-2.5 py-0.5 font-medium">
                    {company.tariff_name}
                  </span>
                )}
                {company.country && (
                  <span className="bg-gray-100 text-gray-600 text-xs rounded px-2 py-0.5 font-mono">
                    {company.country}
                  </span>
                )}
              </div>
              <h1 className="text-2xl font-bold text-gray-900">{company.company}</h1>
              <p className="text-gray-500 text-sm mt-1">
                {[company.street, company.zip, company.city].filter(Boolean).join(', ')}
              </p>
            </div>
            <div className="text-right text-xs text-gray-400">
              <p>Naposledy změněno</p>
              <p className="font-medium text-gray-600">{formatDate(company.last_modif)}</p>
            </div>
          </div>
        </div>
      </div>

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
          {tab === 'contacts' && <TabContacts companyKey={String(id)} />}
          {tab === 'invoices' && <TabInvoices companyKey={String(id)} companyId={String(company?.id ?? '')} />}
          {tab === 'vehicles' && <TabVehicles companyKey={String(id)} />}
          {tab === 'notes'    && <TabNotes    companyKey={String(id)} />}
        </div>
      </div>
    </Layout>
  )
}
