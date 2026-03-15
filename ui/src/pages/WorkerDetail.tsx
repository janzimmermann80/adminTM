import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Layout } from '../components/Layout'
import { Spinner } from '../components/Spinner'
import { getWorker } from '../api'

export const WorkerDetail = () => {
  const { initials } = useParams<{ initials: string }>()
  const navigate = useNavigate()
  const [worker, setWorker] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!initials) return
    getWorker(initials)
      .then(setWorker)
      .catch((e: any) => setError(e.message))
      .finally(() => setLoading(false))
  }, [initials])

  const rowCls = 'flex gap-3 py-2 border-b border-gray-100 last:border-0'
  const labelCls = 'w-28 text-xs text-gray-400 font-medium flex-shrink-0 pt-0.5'
  const valueCls = 'text-sm text-gray-800'

  return (
    <Layout>
      <div className="max-w-lg mx-auto">
        <button onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-5 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Zpět
        </button>

        {loading && (
          <div className="flex justify-center py-16"><Spinner size={8} /></div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>
        )}

        {worker && (
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            {/* Hlavička */}
            <div className="bg-gradient-to-r from-[#0a6b6b] to-[#0d8080] px-6 py-6 flex items-center gap-4">
              <div className={`w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold text-white
                ${worker.sex === 'F' ? 'bg-pink-500/80' : 'bg-white/20'}`}>
                {worker.initials}
              </div>
              <div>
                <h1 className="text-xl font-semibold text-white">
                  {worker.forename} {worker.surname}
                </h1>
                <p className="text-teal-200 text-sm mt-0.5">{worker.username}</p>
              </div>
            </div>

            {/* Kontaktní údaje */}
            <div className="px-5 py-4">
              {worker.phone && (
                <div className={rowCls}>
                  <span className={labelCls}>Telefon</span>
                  <span className={valueCls}>{worker.phone}</span>
                </div>
              )}
              {worker.gsm && (
                <div className={rowCls}>
                  <span className={labelCls}>Mobil</span>
                  <a href={`tel:${worker.gsm}`} className={valueCls + ' text-teal-700 hover:underline'}>{worker.gsm}</a>
                </div>
              )}
              {worker.fax && (
                <div className={rowCls}>
                  <span className={labelCls}>Fax</span>
                  <span className={valueCls}>{worker.fax}</span>
                </div>
              )}
              {worker.email && (
                <div className={rowCls}>
                  <span className={labelCls}>E-mail</span>
                  <a href={`mailto:${worker.email}`} className={valueCls + ' text-teal-700 hover:underline'}>{worker.email}</a>
                </div>
              )}
              {worker.www && (
                <div className={rowCls}>
                  <span className={labelCls}>Web</span>
                  <span className={valueCls}>{worker.www}</span>
                </div>
              )}
            </div>

            {/* Meta */}
            {(worker.region || worker.access_date) && (
              <div className="border-t border-gray-100 px-5 py-3 bg-gray-50 flex gap-6 text-xs text-gray-400">
                {worker.region && <span>Oblast: <span className="text-gray-600">{worker.region}</span></span>}
                {worker.access_date && (
                  <span>Přístup do: <span className="text-gray-600">
                    {new Date(worker.access_date).toLocaleDateString('cs-CZ')}
                  </span></span>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  )
}
