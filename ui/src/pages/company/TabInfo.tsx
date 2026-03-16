import { useState, useEffect } from 'react'
import type { CompanyDetail } from '../../types'
import { formatDate, parseApiDate } from '../../utils'
import { updateCompany, updateServices, updateInvoiceAddress, getSearchMeta } from '../../api'
import { Spinner } from '../../components/Spinner'

interface Props {
  company: CompanyDetail
  onReload: () => void
}

const Row = ({ label, value }: { label: string; value?: string | null }) =>
  value ? (
    <div className="flex gap-2">
      <dt className="text-gray-500 text-sm w-40 shrink-0">{label}</dt>
      <dd className="text-gray-900 text-sm font-medium">{value}</dd>
    </div>
  ) : null

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 mt-5 first:mt-0">{children}</h3>
)

const ServiceRow = ({
  label,
  date,
}: { label: string; version?: string | null; date?: string | null }) => {
  if (!date) return null
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
      <span className="text-sm font-bold text-green-500">{label}</span>
      <span className="text-sm text-gray-500">{formatDate(date) || ''}</span>
    </div>
  )
}

export const TabInfo = ({ company, onReload }: Props) => {
  const [addrTab, setAddrTab] = useState<'sidlo' | 'fakturacni'>('sidlo')
  const [editBasic, setEditBasic] = useState(false)
  const [editServices, setEditServices] = useState(false)
  const [editInvoice, setEditInvoice] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [cinLookupLoading, setCinLookupLoading] = useState(false)
  const [cinLookupError, setCinLookupError] = useState('')
  const [tariffs, setTariffs] = useState<{ tariff: string; name: string }[]>([])
  const [tariff, setTariff] = useState(company.tariff ?? '')
  const [tariffSaving, setTariffSaving] = useState(false)

  useEffect(() => {
    getSearchMeta().then(m => setTariffs(m.tariffs)).catch(() => {})
  }, [])

  // Basic form state
  const [basic, setBasic] = useState({
    company: company.company,
    street: company.street ?? '',
    city: company.city ?? '',
    zip: company.zip ?? '',
    country: company.country ?? '',
    cin: company.cin ?? '',
    tin: company.tin ?? '',
    bank: company.bank ?? '',
    account: company.account ?? '',
    branch: company.branch ?? '',
    region: company.region ?? '',
  })

  // Services form state
  const [svc, setSvc] = useState({
    contract: company.contract ?? '',
    contract_date: parseApiDate(company.contract_date),
    prog_sent: company.prog_sent ?? '',
    prog_sent_date: parseApiDate(company.prog_sent_date),
    prog_lent: company.prog_lent ?? '',
    prog_lent_date: parseApiDate(company.prog_lent_date),
    admittance: company.admittance ?? '',
    admittance_date: parseApiDate(company.admittance_date),
    forwarding: company.forwarding ?? '',
    forwarding_date: parseApiDate(company.forwarding_date),
    car_pool: company.car_pool ?? '',
    car_pool_date: parseApiDate(company.car_pool_date),
    claim_exchange: company.claim_exchange ?? '',
    credit_tip_sms: company.credit_tip_sms ?? '',
    advert_discount: company.advert_discount ?? '',
    send_emails_from_their_domain: company.send_emails_from_their_domain ?? false,
  })

  // Invoice address state
  const [inv, setInv] = useState({
    company: company.invoice_company ?? '',
    street: company.invoice_street ?? '',
    city: company.invoice_city ?? '',
    zip: company.invoice_zip ?? '',
    country: company.invoice_country ?? '',
  })

  const lookupCin = async () => {
    const cin = basic.cin.trim()
    if (!cin) return
    setCinLookupLoading(true); setCinLookupError(''); setEditBasic(true)
    try {
      const isSk = basic.country.trim().toUpperCase() === 'SK'
      if (isSk) {
        // Backend proxy na ORSR – endpoint /api/orsr-lookup/{cin} vrací { name, street, city, zip, country }
        const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? '/api'
        const url = API_BASE.includes('proxy.php')
          ? `${API_BASE}?path=${encodeURIComponent('/orsr-lookup/' + cin)}`
          : `${API_BASE}/orsr-lookup/${cin}`
        const token = localStorage.getItem('token') ?? ''
        const r = await fetch(url, { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } })
        if (!r.ok) throw new Error(await r.text())
        const d = await r.json()
        setBasic(p => ({
          ...p,
          company: d.name ?? p.company,
          street: d.street ?? p.street,
          city: d.city ?? p.city,
          zip: d.zip ?? p.zip,
          country: d.country ?? p.country,
        }))
      } else {
        // ARES – přímý REST dotaz (podporuje CORS)
        const r = await fetch(`https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/${cin}`)
        if (!r.ok) throw new Error('Subjekt nenalezen v ARES')
        const d = await r.json()
        const s = d.sidlo ?? {}
        const ulice = [s.nazevUlice, s.cisloDomovni && s.cisloOrientacni ? `${s.cisloDomovni}/${s.cisloOrientacni}` : s.cisloDomovni].filter(Boolean).join(' ')
        setBasic(p => ({
          ...p,
          company: d.obchodniJmeno ?? p.company,
          street: ulice || p.street,
          city: s.nazevObce ?? p.city,
          zip: s.psc ? String(s.psc) : p.zip,
          country: s.kodStatu ?? p.country,
        }))
      }
    } catch (e: any) { setCinLookupError(e.message) }
    finally { setCinLookupLoading(false) }
  }

  const changeTariff = async (val: string) => {
    setTariff(val); setTariffSaving(true)
    try { await updateCompany(String(company.company_key), { tariff: val }); onReload() }
    catch {} finally { setTariffSaving(false) }
  }

  const saveBasic = async () => {
    setSaving(true); setError('')
    try {
      await updateCompany(String(company.company_key), basic)
      setEditBasic(false)
      onReload()
    } catch (e: any) { setError(e.message) }
    finally { setSaving(false) }
  }

  const saveServices = async () => {
    setSaving(true); setError('')
    try {
      const body: Record<string, any> = { ...svc }
      // empty strings → null for all fields
      for (const k of Object.keys(body)) {
        if (body[k] === '') body[k] = null
      }
      await updateServices(String(company.company_key), body)
      setEditServices(false)
      onReload()
    } catch (e: any) { setError(e.message) }
    finally { setSaving(false) }
  }

  const saveInvoice = async () => {
    setSaving(true); setError('')
    try {
      await updateInvoiceAddress(String(company.company_key), inv)
      setEditInvoice(false)
      onReload()
    } catch (e: any) { setError(e.message) }
    finally { setSaving(false) }
  }

  const inputCls = 'border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none w-full'
  const inputRoCls = 'border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 bg-gray-50 cursor-pointer w-full outline-none'
  const labelCls = 'block text-xs text-gray-500 mb-0.5'

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>
      )}

      {/* ── Basic info + Services (side by side) ────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-6 items-start">

      {/* left: address tabs */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
        {/* Tab switcher */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5 mb-3">
          {(['sidlo', 'fakturacni'] as const).map(t => (
            <button key={t} onClick={() => { setAddrTab(t); setEditBasic(false); setEditInvoice(false) }}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${addrTab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              {t === 'sidlo' ? 'Sídlo' : (
                <>
                  Fakturační adresa
                  <span className={`ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-semibold ${Object.values(inv).some(v => v.trim()) ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'}`}>
                    {Object.values(inv).some(v => v.trim()) ? 1 : 0}
                  </span>
                </>
              )}
            </button>
          ))}
        </div>

        {addrTab === 'sidlo' && (() => {
          const ro = !editBasic
          const ic = ro ? inputRoCls : inputCls
          const activate = () => { if (ro) setEditBasic(true) }
          return (
            <div className="space-y-2">
              <div>
                <label className={labelCls}>Firma</label>
                <input className={ic} readOnly={ro} value={basic.company} onFocus={activate} onChange={e => setBasic(p => ({ ...p, company: e.target.value }))} />
              </div>
              <div>
                <label className={labelCls}>Ulice</label>
                <input className={ic} readOnly={ro} value={basic.street} onFocus={activate} onChange={e => setBasic(p => ({ ...p, street: e.target.value }))} />
              </div>
              <div className="grid grid-cols-12 gap-2">
                <div className="col-span-2">
                  <label className={labelCls}>PSČ</label>
                  <input className={ic} readOnly={ro} value={basic.zip} onFocus={activate} onChange={e => setBasic(p => ({ ...p, zip: e.target.value }))} />
                </div>
                <div className="col-span-7">
                  <label className={labelCls}>Město</label>
                  <input className={ic} readOnly={ro} value={basic.city} onFocus={activate} onChange={e => setBasic(p => ({ ...p, city: e.target.value }))} />
                </div>
                <div className="col-span-1">
                  <label className={labelCls}>Stát</label>
                  <input className={ic} readOnly={ro} value={basic.country} onFocus={activate} onChange={e => setBasic(p => ({ ...p, country: e.target.value }))} />
                </div>
                <div className="col-span-2">
                  <label className={labelCls}>Oblast</label>
                  <input className={ic} readOnly={ro} value={basic.region} onFocus={activate} onChange={e => setBasic(p => ({ ...p, region: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelCls}>IČO</label>
                  <div className="flex gap-1">
                    <input className={ic} readOnly={ro} value={basic.cin} onFocus={activate} onChange={e => setBasic(p => ({ ...p, cin: e.target.value }))} />
                    <button type="button" onClick={lookupCin} disabled={cinLookupLoading || !basic.cin.trim()}
                      title={basic.country.toUpperCase() === 'SK' ? 'Vyhledat v ORSR' : 'Vyhledat v ARES'}
                      className="shrink-0 flex items-center justify-center w-8 h-8 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-40 text-gray-600">
                      {cinLookupLoading ? <Spinner size={3} /> : (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                        </svg>
                      )}
                    </button>
                  </div>
                  {cinLookupError && <p className="text-xs text-red-500 mt-0.5">{cinLookupError}</p>}
                </div>
                <div>
                  <label className={labelCls}>DIČ</label>
                  <input className={ic} readOnly={ro} value={basic.tin} onFocus={activate} onChange={e => setBasic(p => ({ ...p, tin: e.target.value }))} />
                </div>
                <div>
                  <label className={labelCls}>Banka</label>
                  <input className={ic} readOnly={ro} value={basic.bank} onFocus={activate} onChange={e => setBasic(p => ({ ...p, bank: e.target.value }))} />
                </div>
                <div>
                  <label className={labelCls}>Číslo účtu</label>
                  <input className={ic} readOnly={ro} value={basic.account} onFocus={activate} onChange={e => setBasic(p => ({ ...p, account: e.target.value }))} />
                </div>

              </div>
              {editBasic && (
                <div className="flex gap-2 pt-1">
                  <button onClick={saveBasic} disabled={saving}
                    className="flex items-center gap-1.5 bg-blue-700 hover:bg-blue-800 text-white px-4 py-1.5 rounded-lg text-sm disabled:opacity-60">
                    {saving ? <Spinner size={4} /> : (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                    Uložit
                  </button>
                  <button onClick={() => setEditBasic(false)}
                    className="px-4 py-1.5 rounded-lg border text-sm hover:bg-gray-50">Zrušit</button>
                </div>
              )}
            </div>
          )
        })()}

        {addrTab === 'fakturacni' && (() => {
          const ro = !editInvoice
          const ic = ro ? inputRoCls : inputCls
          const activate = () => { if (ro) setEditInvoice(true) }
          return (
            <div className="space-y-2">
              <div>
                <label className={labelCls}>Firma</label>
                <input className={ic} readOnly={ro} value={inv.company} onFocus={activate} onChange={e => setInv(p => ({ ...p, company: e.target.value }))} />
              </div>
              <div>
                <label className={labelCls}>Ulice</label>
                <input className={ic} readOnly={ro} value={inv.street} onFocus={activate} onChange={e => setInv(p => ({ ...p, street: e.target.value }))} />
              </div>
              <div className="grid grid-cols-12 gap-2">
                <div className="col-span-2">
                  <label className={labelCls}>PSČ</label>
                  <input className={ic} readOnly={ro} value={inv.zip} onFocus={activate} onChange={e => setInv(p => ({ ...p, zip: e.target.value }))} />
                </div>
                <div className="col-span-9">
                  <label className={labelCls}>Město</label>
                  <input className={ic} readOnly={ro} value={inv.city} onFocus={activate} onChange={e => setInv(p => ({ ...p, city: e.target.value }))} />
                </div>
                <div className="col-span-1">
                  <label className={labelCls}>Stát</label>
                  <input className={ic} readOnly={ro} value={inv.country} onFocus={activate} onChange={e => setInv(p => ({ ...p, country: e.target.value }))} />
                </div>
              </div>
              {editInvoice && (
                <div className="flex gap-2 pt-1">
                  <button onClick={saveInvoice} disabled={saving}
                    className="flex items-center gap-1.5 bg-blue-700 hover:bg-blue-800 text-white px-4 py-1.5 rounded-lg text-sm disabled:opacity-60">
                    {saving ? <Spinner size={4} /> : (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                    Uložit
                  </button>
                  <button onClick={() => setEditInvoice(false)}
                    className="px-4 py-1.5 rounded-lg border text-sm hover:bg-gray-50">Zrušit</button>
                </div>
              )}
            </div>
          )
        })()}
      </div>

      {/* right: services */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <SectionTitle>Smlouvy a služby</SectionTitle>
          {!editServices && (
            <button onClick={() => setEditServices(true)}
              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Upravit
            </button>
          )}
        </div>

        {editServices ? (
          <div className="space-y-2">
            {([
              ['contract', 'contract_date', 'Leták'],
              ['prog_sent', 'prog_sent_date', 'Program odeslán'],
              ['prog_lent', 'prog_lent_date', 'Registrace'],
              ['admittance', 'admittance_date', 'Přístup'],
              ['forwarding', 'forwarding_date', 'Přeposílání'],
              ['car_pool', 'car_pool_date', 'Car pool'],
            ] as [keyof typeof svc, keyof typeof svc, string][]).map(([vk, dk, label]) => (
              <div key={vk} className="flex items-end gap-3 border-b border-gray-50 pb-2">
                <div className="flex-1">
                  <label className={labelCls}>{label}</label>
                  <input type="date" className={inputCls} value={String(svc[dk] ?? '')}
                    onChange={e => setSvc(p => ({ ...p, [dk]: e.target.value }))} />
                </div>
              </div>
            ))}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className={labelCls}>Výměna nároků</label>
                <input className={inputCls} value={String(svc.claim_exchange ?? '')}
                  onChange={e => setSvc(p => ({ ...p, claim_exchange: e.target.value }))} />
              </div>
              <div>
                <label className={labelCls}>Credit tip SMS</label>
                <input type="number" className={inputCls} value={String(svc.credit_tip_sms ?? '')}
                  onChange={e => setSvc(p => ({ ...p, credit_tip_sms: e.target.value }))} />
              </div>
              <div>
                <label className={labelCls}>Slevová reklama (%)</label>
                <input type="number" className={inputCls} value={String(svc.advert_discount ?? '')}
                  onChange={e => setSvc(p => ({ ...p, advert_discount: e.target.value }))} />
              </div>
              <div className="flex items-end pb-1.5">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={Boolean(svc.send_emails_from_their_domain)}
                    onChange={e => setSvc(p => ({ ...p, send_emails_from_their_domain: e.target.checked }))}
                    className="rounded" />
                  <span className="text-sm text-gray-700">E-maily z jejich domény</span>
                </label>
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={saveServices} disabled={saving}
                className="flex items-center gap-1.5 bg-blue-700 hover:bg-blue-800 text-white px-4 py-1.5 rounded-lg text-sm disabled:opacity-60">
                {saving ? <Spinner size={4} /> : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
                Uložit
              </button>
              <button onClick={() => setEditServices(false)}
                className="px-4 py-1.5 rounded-lg border text-sm hover:bg-gray-50">Zrušit</button>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            <div className="pb-2 mb-1">
              <label className="block text-xs text-gray-500 mb-0.5">Tarif</label>
              <div className="relative">
                <select value={tariff} onChange={e => changeTariff(e.target.value)} disabled={tariffSaving}
                  className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-60 appearance-none pr-7">
                  <option value="">— bez tarifu —</option>
                  {tariffs.map(t => <option key={t.tariff} value={t.tariff}>{t.name}</option>)}
                </select>
                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-400">
                  {tariffSaving ? <Spinner size={3} /> : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  )}
                </span>
              </div>
            </div>
            <ServiceRow label="Leták" version={company.contract} date={company.contract_date} />
            <ServiceRow label="Program odeslán" version={company.prog_sent} date={company.prog_sent_date} />
            <ServiceRow label="Registrace" version={company.prog_lent} date={company.prog_lent_date} />
            <ServiceRow label="Přístup" version={company.admittance} date={company.admittance_date} />
            <ServiceRow label="Přeposílání" version={company.forwarding} date={company.forwarding_date} />
            <ServiceRow label="Car pool" version={company.car_pool} date={company.car_pool_date} />
            <ServiceRow label="Výměna nároků" version={company.claim_exchange} />
            {(company.credit_tip_sms != null || company.advert_discount != null) && (
              <div className="py-1.5 flex gap-6 text-sm">
                {company.credit_tip_sms != null && (
                  <span className="text-gray-600">Credit tip SMS: <strong>{company.credit_tip_sms}</strong></span>
                )}
                {company.advert_discount != null && (
                  <span className="text-gray-600">Sleva reklama: <strong>{company.advert_discount}%</strong></span>
                )}
                {company.send_emails_from_their_domain && (
                  <span className="text-green-600 text-xs flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    E-maily z jejich domény
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      </div>
    </div>
  )
}
