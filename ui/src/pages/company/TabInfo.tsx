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
      <dt className="text-gray-500 text-sm w-36 shrink-0">{label}</dt>
      <dd className="text-gray-900 text-sm font-medium">{value}</dd>
    </div>
  ) : null

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">{children}</h3>
)

const EditBtn = ({ onClick }: { onClick: () => void }) => (
  <button onClick={onClick} className="flex items-center gap-1 text-xs text-[#0d8080] hover:text-[#085858]">
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
    </svg>
    Upravit
  </button>
)

const SaveBar = ({ onSave, onCancel, saving }: { onSave: () => void; onCancel: () => void; saving: boolean }) => (
  <div className="flex gap-2 pt-3">
    <button onClick={onSave} disabled={saving}
      className="flex items-center gap-1.5 bg-[#0a6b6b] hover:bg-[#085858] text-white px-4 py-1.5 rounded-lg text-sm disabled:opacity-60">
      {saving ? <Spinner size={4} /> : (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      )}
      Uložit
    </button>
    <button onClick={onCancel} className="px-4 py-1.5 rounded-lg border text-sm hover:bg-gray-50">Zrušit</button>
  </div>
)

const ServiceBadge = ({ value }: { value?: string | null }) => {
  if (!value) return <span className="text-gray-300 text-xs">—</span>
  return (
    <span className="inline-flex items-center bg-teal-50 text-teal-700 border border-teal-200 rounded-full px-2.5 py-0.5 text-xs font-medium">
      {value}
    </span>
  )
}

const ServiceRow = ({ label, version, date }: { label: string; version?: string | null; date?: string | null }) => (
  <div className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0 gap-2">
    <span className="text-sm text-gray-600 shrink-0">{label}</span>
    <div className="flex items-center gap-3 min-w-0">
      <ServiceBadge value={version} />
      {date && (
        <span className="text-xs text-gray-400 shrink-0">{formatDate(date)}</span>
      )}
    </div>
  </div>
)

export const TabInfo = ({ company, onReload }: Props) => {
  const [editBasic, setEditBasic] = useState(false)
  const [editServices, setEditServices] = useState(false)
  const [editInvoice, setEditInvoice] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

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
      setEditBasic(false); onReload()
    } catch (e: any) { setError(e.message) }
    finally { setSaving(false) }
  }

  const saveServices = async () => {
    setSaving(true); setError('')
    try {
      const body: Record<string, any> = { ...svc }
      for (const k of ['contract_date', 'prog_sent_date', 'prog_lent_date', 'admittance_date', 'forwarding_date', 'car_pool_date']) {
        if (!body[k]) body[k] = null
      }
      await updateServices(String(company.company_key), body)
      setEditServices(false); onReload()
    } catch (e: any) { setError(e.message) }
    finally { setSaving(false) }
  }

  const saveInvoice = async () => {
    setSaving(true); setError('')
    try {
      await updateInvoiceAddress(String(company.company_key), inv)
      setEditInvoice(false); onReload()
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

      {/* ── Základní údaje + Smlouvy a služby vedle sebe ─────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Základní údaje */}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-4">
            <SectionTitle>Základní údaje</SectionTitle>
            {!editBasic && <EditBtn onClick={() => setEditBasic(true)} />}
          </div>

          {editBasic ? (
            <>
              <div className="space-y-2">
                {/* Název */}
                <div>
                  <label className={labelCls}>Název firmy</label>
                  <input className={inputCls} value={basic.company} onChange={e => setBasic(p => ({ ...p, company: e.target.value }))} />
                </div>
                {/* Ulice */}
                <div>
                  <label className={labelCls}>Ulice</label>
                  <input className={inputCls} value={basic.street} onChange={e => setBasic(p => ({ ...p, street: e.target.value }))} />
                </div>
                {/* PSČ + Město + Stát + Oblast */}
                <div className="flex gap-2">
                  <div className="w-20 shrink-0">
                    <label className={labelCls}>PSČ</label>
                    <input className={inputCls} value={basic.zip} onChange={e => setBasic(p => ({ ...p, zip: e.target.value }))} />
                  </div>
                  <div className="flex-1">
                    <label className={labelCls}>Město</label>
                    <input className={inputCls} value={basic.city} onChange={e => setBasic(p => ({ ...p, city: e.target.value }))} />
                  </div>
                  <div className="w-14 shrink-0">
                    <label className={labelCls}>Stát</label>
                    <input className={inputCls} value={basic.country} onChange={e => setBasic(p => ({ ...p, country: e.target.value }))} />
                  </div>
                  <div className="w-16 shrink-0">
                    <label className={labelCls}>Oblast</label>
                    <input className={inputCls} value={basic.region} onChange={e => setBasic(p => ({ ...p, region: e.target.value }))} />
                  </div>
                </div>
                {/* IČO + DIČ */}
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className={labelCls}>IČO</label>
                    <input className={inputCls} value={basic.cin} onChange={e => setBasic(p => ({ ...p, cin: e.target.value }))} />
                  </div>
                  <div className="flex-1">
                    <label className={labelCls}>DIČ</label>
                    <input className={inputCls} value={basic.tin} onChange={e => setBasic(p => ({ ...p, tin: e.target.value }))} />
                  </div>
                </div>
                {/* Banka + Účet + Pobočka */}
                <div className="flex gap-2">
                  <div className="w-24 shrink-0">
                    <label className={labelCls}>Banka</label>
                    <input className={inputCls} value={basic.bank} onChange={e => setBasic(p => ({ ...p, bank: e.target.value }))} />
                  </div>
                  <div className="flex-1">
                    <label className={labelCls}>Číslo účtu</label>
                    <input className={inputCls} value={basic.account} onChange={e => setBasic(p => ({ ...p, account: e.target.value }))} />
                  </div>
                  <div className="w-24 shrink-0">
                    <label className={labelCls}>Pobočka</label>
                    <input className={inputCls} value={basic.branch} onChange={e => setBasic(p => ({ ...p, branch: e.target.value }))} />
                  </div>
                </div>
              </div>
              <SaveBar onSave={saveBasic} onCancel={() => setEditBasic(false)} saving={saving} />
            </>
          ) : (
            <div className="space-y-1.5 text-sm">
              {/* Název firmy */}
              <p className="font-semibold text-gray-900 text-base">{company.company}</p>
              {/* Ulice */}
              {company.street && <p className="text-gray-700">{company.street}</p>}
              {/* PSČ Město Stát Oblast */}
              <p className="text-gray-700">
                {[company.zip, company.city].filter(Boolean).join(' ')}
                {company.country && <span className="ml-2 bg-gray-100 text-gray-600 rounded px-1.5 py-0.5 text-xs font-mono">{company.country}</span>}
                {company.region && <span className="ml-2 text-gray-400 text-xs">O: {company.region}</span>}
              </p>
              {/* IČO / DIČ */}
              {(company.cin || company.tin) && (
                <p className="text-gray-500">
                  {company.cin && <span>IČO: <strong className="text-gray-800">{company.cin}</strong></span>}
                  {company.cin && company.tin && <span className="mx-2 text-gray-300">|</span>}
                  {company.tin && <span>DIČ: <strong className="text-gray-800">{company.tin}</strong></span>}
                </p>
              )}
              {/* Banka / Účet */}
              {(company.bank || company.account) && (
                <p className="text-gray-500">
                  {company.bank && <span>Banka: <strong className="text-gray-800">{company.bank}</strong></span>}
                  {company.bank && company.account && <span className="mx-2 text-gray-300">|</span>}
                  {company.account && <span>Účet: <strong className="text-gray-800">{company.account}</strong></span>}
                  {company.branch && <span className="ml-2 text-gray-400 text-xs">({company.branch})</span>}
                </p>
              )}
              {company.provider && <p className="text-gray-400 text-xs">Provider: {company.provider}</p>}
            </div>
          )}
        </div>

        {/* Smlouvy a služby */}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-4">
            <SectionTitle>Smlouvy a služby</SectionTitle>
            {!editServices && <EditBtn onClick={() => setEditServices(true)} />}
          </div>

          {editServices ? (
            <>
              <div className="space-y-3">
                {([
                  ['contract', 'contract_date', 'Smlouva'],
                  ['prog_sent', 'prog_sent_date', 'Program odeslán'],
                  ['prog_lent', 'prog_lent_date', 'Program zapůjčen'],
                  ['admittance', 'admittance_date', 'Přístup'],
                  ['forwarding', 'forwarding_date', 'Přeposílání'],
                  ['car_pool', 'car_pool_date', 'Car pool'],
                ] as [keyof typeof svc, keyof typeof svc, string][]).map(([vk, dk, label]) => (
                  <div key={vk} className="grid grid-cols-2 gap-2 border-b border-gray-50 pb-2 last:border-0">
                    <div>
                      <label className={labelCls}>{label}</label>
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
                <div className="grid grid-cols-2 gap-2">
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
              </div>
              <SaveBar onSave={saveServices} onCancel={() => setEditServices(false)} saving={saving} />
            </>
          ) : (
            <div>
              {/* Header */}
              <div className="grid grid-cols-[1fr_auto_auto] gap-2 pb-1 mb-1 border-b border-gray-100">
                <span className="text-xs text-gray-400 uppercase tracking-wide">Služba</span>
                <span className="text-xs text-gray-400 uppercase tracking-wide">Verze</span>
                <span className="text-xs text-gray-400 uppercase tracking-wide w-20 text-right">Datum</span>
              </div>
              <ServiceRow label="Smlouva"           version={company.contract}    date={company.contract_date} />
              <ServiceRow label="Program odeslán"   version={company.prog_sent}   date={company.prog_sent_date} />
              <ServiceRow label="Program zapůjčen"  version={company.prog_lent}   date={company.prog_lent_date} />
              <ServiceRow label="Přístup"           version={company.admittance}  date={company.admittance_date} />
              <ServiceRow label="Přeposílání"       version={company.forwarding}  date={company.forwarding_date} />
              <ServiceRow label="Car pool"          version={company.car_pool}    date={company.car_pool_date} />
              {company.claim_exchange && (
                <ServiceRow label="Výměna nároků" version={company.claim_exchange} />
              )}
              {/* Extra flags */}
              {(company.credit_tip_sms != null || company.advert_discount != null || company.send_emails_from_their_domain) && (
                <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-gray-50">
                  {company.credit_tip_sms != null && (
                    <span className="inline-flex items-center bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2.5 py-0.5 text-xs">
                      Credit tip SMS: <strong className="ml-1">{company.credit_tip_sms}</strong>
                    </span>
                  )}
                  {company.advert_discount != null && (
                    <span className="inline-flex items-center bg-purple-50 text-purple-700 border border-purple-200 rounded-full px-2.5 py-0.5 text-xs">
                      Sleva reklama: <strong className="ml-1">{company.advert_discount}%</strong>
                    </span>
                  )}
                  {company.send_emails_from_their_domain && (
                    <span className="inline-flex items-center gap-1 bg-green-50 text-green-700 border border-green-200 rounded-full px-2.5 py-0.5 text-xs">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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

      {/* ── Fakturační adresa ─────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex items-center justify-between mb-4">
          <SectionTitle>Fakturační adresa</SectionTitle>
          {!editInvoice && <EditBtn onClick={() => setEditInvoice(true)} />}
        </div>

        {editInvoice ? (
          <>
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
            </div>
            <SaveBar onSave={saveInvoice} onCancel={() => setEditInvoice(false)} saving={saving} />
          </>
        ) : (
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2">
            {company.invoice_company ? (
              <>
                <Row label="Firma"  value={company.invoice_company} />
                <Row label="Ulice"  value={company.invoice_street} />
                <Row label="Město"  value={company.invoice_city} />
                <Row label="PSČ"    value={company.invoice_zip} />
                <Row label="Stát"   value={company.invoice_country} />
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
