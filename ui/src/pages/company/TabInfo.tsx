import { useState } from 'react'
import type { CompanyDetail } from '../../types'
import { formatDate, parseApiDate } from '../../utils'
import { updateCompany, updateServices, updateInvoiceAddress } from '../../api'
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
  version,
  date,
}: { label: string; version?: string | null; date?: string | null }) => (
  <div className="flex items-center gap-3 py-1.5 border-b border-gray-50 last:border-0">
    <span className="text-sm text-gray-600 w-36 shrink-0">{label}</span>
    <span className="text-sm font-medium text-gray-900 flex-1">{version || '—'}</span>
    <span className="text-sm text-gray-500">{formatDate(date) || '—'}</span>
  </div>
)

export const TabInfo = ({ company, onReload }: Props) => {
  const [editBasic, setEditBasic] = useState(false)
  const [editServices, setEditServices] = useState(false)
  const [editInvoice, setEditInvoice] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

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
      // empty strings → null for dates
      for (const k of ['contract_date','prog_sent_date','prog_lent_date','admittance_date','forwarding_date','car_pool_date']) {
        if (!body[k]) body[k] = null
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

  const inputCls = 'border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none w-full'
  const labelCls = 'block text-xs text-gray-500 mb-0.5'

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>
      )}

      {/* ── Basic info ──────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <SectionTitle>Základní údaje</SectionTitle>
          {!editBasic && (
            <button onClick={() => setEditBasic(true)}
              className="flex items-center gap-1 text-xs text-[#0d8080] hover:text-[#085858]">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Upravit
            </button>
          )}
        </div>

        {editBasic ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {([
              ['company', 'Název firmy'],
              ['street', 'Ulice'],
              ['city', 'Město'],
              ['zip', 'PSČ'],
              ['country', 'Stát'],
              ['cin', 'IČO'],
              ['tin', 'DIČ'],
              ['bank', 'Banka'],
              ['account', 'Číslo účtu'],
              ['branch', 'Pobočka'],
              ['region', 'Oblast'],
            ] as [keyof typeof basic, string][]).map(([k, l]) => (
              <div key={k}>
                <label className={labelCls}>{l}</label>
                <input className={inputCls} value={basic[k]} onChange={e => setBasic(p => ({ ...p, [k]: e.target.value }))} />
              </div>
            ))}
            <div className="col-span-full flex gap-2 pt-2">
              <button onClick={saveBasic} disabled={saving}
                className="flex items-center gap-1.5 bg-[#0a6b6b] hover:bg-[#085858] text-white px-4 py-1.5 rounded-lg text-sm disabled:opacity-60">
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
          </div>
        ) : (
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2">
            <Row label="Název firmy" value={company.company} />
            <Row label="IČO" value={company.cin} />
            <Row label="DIČ" value={company.tin} />
            <Row label="Ulice" value={company.street} />
            <Row label="Město" value={company.city} />
            <Row label="PSČ" value={company.zip} />
            <Row label="Stát" value={company.country} />
            <Row label="Oblast" value={company.region} />
            <Row label="Banka" value={company.bank} />
            <Row label="Číslo účtu" value={company.account} />
            <Row label="Pobočka" value={company.branch} />
            <Row label="Provider" value={company.provider} />
          </dl>
        )}
      </div>

      <hr className="border-gray-100" />

      {/* ── Services / contract dates ────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <SectionTitle>Smlouvy a služby</SectionTitle>
          {!editServices && (
            <button onClick={() => setEditServices(true)}
              className="flex items-center gap-1 text-xs text-[#0d8080] hover:text-[#085858]">
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
              ['contract', 'contract_date', 'Smlouva'],
              ['prog_sent', 'prog_sent_date', 'Program odeslán'],
              ['prog_lent', 'prog_lent_date', 'Program zapůjčen'],
              ['admittance', 'admittance_date', 'Přístup'],
              ['forwarding', 'forwarding_date', 'Přeposílání'],
              ['car_pool', 'car_pool_date', 'Car pool'],
            ] as [keyof typeof svc, keyof typeof svc, string][]).map(([vk, dk, label]) => (
              <div key={vk} className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end border-b border-gray-50 pb-2">
                <div className="sm:col-span-2">
                  <label className={labelCls}>{label} — verze</label>
                  <input className={inputCls} value={String(svc[vk] ?? '')}
                    onChange={e => setSvc(p => ({ ...p, [vk]: e.target.value }))} />
                </div>
                <div>
                  <label className={labelCls}>Datum</label>
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
                className="flex items-center gap-1.5 bg-[#0a6b6b] hover:bg-[#085858] text-white px-4 py-1.5 rounded-lg text-sm disabled:opacity-60">
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
            <div className="grid grid-cols-3 text-xs text-gray-400 uppercase pb-1.5 gap-3">
              <span className="col-span-1">Služba</span>
              <span>Verze</span>
              <span>Datum</span>
            </div>
            <ServiceRow label="Smlouva" version={company.contract} date={company.contract_date} />
            <ServiceRow label="Program odeslán" version={company.prog_sent} date={company.prog_sent_date} />
            <ServiceRow label="Program zapůjčen" version={company.prog_lent} date={company.prog_lent_date} />
            <ServiceRow label="Přístup" version={company.admittance} date={company.admittance_date} />
            <ServiceRow label="Přeposílání" version={company.forwarding} date={company.forwarding_date} />
            <ServiceRow label="Car pool" version={company.car_pool} date={company.car_pool_date} />
            {company.claim_exchange && <ServiceRow label="Výměna nároků" version={company.claim_exchange} />}
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

      <hr className="border-gray-100" />

      {/* ── Invoice address ──────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <SectionTitle>Fakturační adresa</SectionTitle>
          {!editInvoice && (
            <button onClick={() => setEditInvoice(true)}
              className="flex items-center gap-1 text-xs text-[#0d8080] hover:text-[#085858]">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Upravit
            </button>
          )}
        </div>

        {editInvoice ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {([
              ['company', 'Firma'],
              ['street', 'Ulice'],
              ['city', 'Město'],
              ['zip', 'PSČ'],
              ['country', 'Stát'],
            ] as [keyof typeof inv, string][]).map(([k, l]) => (
              <div key={k}>
                <label className={labelCls}>{l}</label>
                <input className={inputCls} value={inv[k]} onChange={e => setInv(p => ({ ...p, [k]: e.target.value }))} />
              </div>
            ))}
            <div className="col-span-full flex gap-2 pt-2">
              <button onClick={saveInvoice} disabled={saving}
                className="flex items-center gap-1.5 bg-[#0a6b6b] hover:bg-[#085858] text-white px-4 py-1.5 rounded-lg text-sm disabled:opacity-60">
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
          </div>
        ) : (
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2">
            {company.invoice_company ? (
              <>
                <Row label="Firma" value={company.invoice_company} />
                <Row label="Ulice" value={company.invoice_street} />
                <Row label="Město" value={company.invoice_city} />
                <Row label="PSČ" value={company.invoice_zip} />
                <Row label="Stát" value={company.invoice_country} />
              </>
            ) : (
              <p className="text-sm text-gray-400 col-span-2">Fakturační adresa není vyplněna (použije se adresa firmy)</p>
            )}
          </dl>
        )}
      </div>
    </div>
  )
}
