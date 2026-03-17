import { useState, useEffect, useMemo } from 'react'
import { getInvoiceDetail, getInvoicingMeta, getInvoicingServices, updateInvoice, createInvoiceSingle } from '../api'
import { Spinner } from './Spinner'
import { formatNumber } from '../utils'

interface ItemRow {
  _key: string
  name: string
  price_unit: string
  discount: string
  quantity: string
  vat_rate: string
}

export interface InvoicePrefillItem {
  name: string
  price_unit?: number
  discount?: number
  quantity?: number
  vat_rate?: number
}

export interface InvoicePrefill {
  series?: number
  proforma_number?: number
  currency?: string
  issued?: string
  fulfilment?: string
  maturity?: string
  settlement?: string
  payment_method?: string
  curr_value?: number
  items?: InvoicePrefillItem[]
}

interface Props {
  invoiceKey?: number    // edit mode
  companyKey?: number   // create mode
  prefill?: InvoicePrefill
  onClose: () => void
  onSaved: (invoiceKey?: number) => void
}

const todayStr = () => new Date().toISOString().slice(0, 10)
const addDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10)
const uid = () => Math.random().toString(36).slice(2)

function emptyItem(): ItemRow {
  return { _key: uid(), name: '', price_unit: '', discount: '0', quantity: '1', vat_rate: '21' }
}

function rowGross(item: ItemRow): number {
  const pu = parseFloat(item.price_unit) || 0
  const d = parseFloat(item.discount) || 0
  const q = parseFloat(item.quantity) || 0
  const v = parseFloat(item.vat_rate) || 0
  const net = pu * (1 - d / 100) * q
  return Math.round((net * (1 + v / 100)) * 100) / 100
}

function calcTotals(items: ItemRow[]) {
  let net = 0, vat = 0
  for (const item of items) {
    const pu = parseFloat(item.price_unit) || 0
    const d = parseFloat(item.discount) || 0
    const q = parseFloat(item.quantity) || 0
    const v = parseFloat(item.vat_rate) || 0
    const itemNet = pu * (1 - d / 100) * q
    const itemVat = Math.round(itemNet * (v / 100) * 100) / 100
    net += itemNet
    vat += itemVat
  }
  return { net: Math.round(net * 100) / 100, vat: Math.round(vat * 100) / 100, total: Math.round((net + vat) * 100) / 100 }
}

export function InvoiceFormModal({ invoiceKey, companyKey, prefill, onClose, onSaved }: Props) {
  const isEdit = !!invoiceKey
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [meta, setMeta] = useState<{ series: Record<string, string>; payment_methods: Record<string, string> } | null>(null)
  const [services, setServices] = useState<any[]>([])
  const [invDetail, setInvDetail] = useState<any>(null)

  const [issued, setIssued] = useState(prefill?.issued ?? todayStr())
  const [fulfilment, setFulfilment] = useState(prefill?.fulfilment ?? todayStr())
  const [maturity, setMaturity] = useState(prefill?.maturity ?? addDays(14))
  const [settlement, setSettlement] = useState(prefill?.settlement ?? '')
  const [series, setSeries] = useState(String(prefill?.series ?? 1))
  const [paymentMethod, setPaymentMethod] = useState(prefill?.payment_method ?? 'T')
  const [currency, setCurrency] = useState(prefill?.currency ?? 'CZK')
  const [currValue, setCurrValue] = useState(String(prefill?.curr_value ?? 1))
  const [proformaNumber, setProformaNumber] = useState(String(prefill?.proforma_number ?? ''))
  const [demandNotes, setDemandNotes] = useState('0')
  const [items, setItems] = useState<ItemRow[]>(
    prefill?.items?.length
      ? prefill.items.map(it => ({
          _key: uid(),
          name: it.name,
          price_unit: String(it.price_unit ?? ''),
          discount: String(it.discount ?? 0),
          quantity: String(it.quantity ?? 1),
          vat_rate: String(it.vat_rate ?? 21),
        }))
      : [emptyItem()]
  )

  useEffect(() => {
    const load = async () => {
      try {
        const [metaData, servicesData] = await Promise.all([getInvoicingMeta(), getInvoicingServices()])
        setMeta(metaData)
        setServices(servicesData)

        if (isEdit && invoiceKey) {
          const inv = await getInvoiceDetail(String(invoiceKey))
          setInvDetail(inv)
          setIssued(inv.issued?.slice(0, 10) ?? todayStr())
          setFulfilment(inv.fulfilment?.slice(0, 10) ?? todayStr())
          setMaturity(inv.maturity?.slice(0, 10) ?? addDays(14))
          setSettlement(inv.settlement?.slice(0, 10) ?? '')
          setSeries(String(inv.series ?? 1))
          setPaymentMethod(inv.payment_method ?? 'T')
          setCurrency(inv.currency ?? 'CZK')
          setCurrValue(String(inv.rate ?? 1))
          setProformaNumber(String(inv.proforma_number ?? ''))
          setDemandNotes(String(inv.demand_notes ?? 0))
          if (inv.items?.length) {
            setItems(inv.items.map((it: any) => ({
              _key: uid(),
              name: it.name ?? '',
              price_unit: String(it.price_unit ?? ''),
              discount: String(it.discount ?? 0),
              quantity: String(it.quantity ?? 1),
              vat_rate: String(it.vat_rate ?? 21),
            })))
          }
        }
      } catch (e: any) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const totals = useMemo(() => calcTotals(items), [items])
  const rate = parseFloat(currValue) || 1
  const currSymbol = currency === 'CZK' ? 'Kč' : currency

  const updateItem = (key: string, field: keyof Omit<ItemRow, '_key'>, value: string) =>
    setItems(prev => prev.map(it => it._key === key ? { ...it, [field]: value } : it))

  const removeItem = (key: string) => setItems(prev => prev.filter(it => it._key !== key))

  const addFromService = (svc: any) => setItems(prev => [...prev, {
    _key: uid(), name: svc.name,
    price_unit: String(svc.price ?? ''), discount: String(svc.discount ?? 0),
    quantity: '1', vat_rate: String(svc.vat_rate ?? 21),
  }])

  const handleSubmit = async () => {
    setSaving(true); setError('')
    try {
      const payload = {
        issued, fulfilment, maturity,
        settlement: settlement || null,
        series: Number(series),
        payment_method: paymentMethod,
        currency, curr_value: rate,
        proforma_number: proformaNumber ? Number(proformaNumber) : null,
        demand_notes: Number(demandNotes) || 0,
        items: items.filter(it => it.name.trim()).map(it => ({
          name: it.name,
          price_unit: parseFloat(it.price_unit) || 0,
          discount: parseFloat(it.discount) || 0,
          quantity: parseFloat(it.quantity) || 1,
          vat_rate: parseFloat(it.vat_rate) || 0,
        })),
      }
      if (isEdit && invoiceKey) {
        await updateInvoice(String(invoiceKey), payload)
        onSaved(invoiceKey)
      } else {
        const res = await createInvoiceSingle({ ...payload, company_key: companyKey })
        onSaved(res.invoice_key)
      }
    } catch (e: any) { setError(e.message) }
    finally { setSaving(false) }
  }

  const vs = invDetail
    ? `${invDetail.series}${String(invDetail.company_id ?? '').slice(-5)}${String(invDetail.number).padStart(4, '0')}`
    : null

  const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-500'
  const selectCls = inputCls + ' bg-white'

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 shrink-0">
          <div className="flex items-center gap-2 font-semibold text-gray-800">
            <svg className="w-5 h-5 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
            </svg>
            {isEdit ? `Editace faktury${vs ? ` ${vs}` : ''}` : 'Nová faktura'}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">
          {loading ? (
            <div className="flex justify-center py-8"><Spinner size={8}/></div>
          ) : (
            <>
              {/* Hlavička — grid 2 sloupce */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Vydáno *</label>
                  <input type="date" className={inputCls} value={issued} onChange={e => setIssued(e.target.value)}/>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Datum plnění *</label>
                  <input type="date" className={inputCls} value={fulfilment} onChange={e => setFulfilment(e.target.value)}/>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Splatnost *</label>
                  <input type="date" className={inputCls} value={maturity} onChange={e => setMaturity(e.target.value)}/>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Uhrazeno</label>
                  <input type="date" className={inputCls} value={settlement} onChange={e => setSettlement(e.target.value)}/>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Série *</label>
                  <select className={selectCls} value={series} onChange={e => setSeries(e.target.value)}>
                    {meta && Object.entries(meta.series).filter(([k]) => k !== '5').map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Způsob platby *</label>
                  <select className={selectCls} value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
                    {meta && Object.entries(meta.payment_methods).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Měna *</label>
                  <select className={selectCls} value={currency} onChange={e => {
                    setCurrency(e.target.value)
                    if (e.target.value === 'CZK') setCurrValue('1')
                  }}>
                    <option value="CZK">CZK</option>
                    <option value="EUR">EUR</option>
                    <option value="SKK">SKK</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Kurz (Kč / {currency})</label>
                  <input type="number" step="0.01" className={inputCls + (currency === 'CZK' ? ' bg-gray-50' : '')}
                    value={currValue} onChange={e => setCurrValue(e.target.value)} disabled={currency === 'CZK'}/>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Proforma č.</label>
                  <input type="number" className={inputCls} value={proformaNumber}
                    onChange={e => setProformaNumber(e.target.value)} placeholder="—"/>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Upomínky</label>
                  <input type="number" min={0} className={inputCls} value={demandNotes}
                    onChange={e => setDemandNotes(e.target.value)}/>
                </div>
              </div>

              {/* Položky */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700">Položky faktury</span>
                  {services.length > 0 && (
                    <select className="text-xs border border-gray-300 rounded-lg px-2 py-1 bg-white outline-none focus:ring-2 focus:ring-teal-500"
                      value="" onChange={e => {
                        const svc = services.find(s => String(s.service_key) === e.target.value)
                        if (svc) addFromService(svc)
                      }}>
                      <option value="">+ ze ceníku…</option>
                      {services.map(s => <option key={s.service_key} value={s.service_key}>{s.name}</option>)}
                    </select>
                  )}
                </div>
                <div className="rounded-lg border border-gray-200 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 text-gray-500 uppercase text-left">
                        <th className="px-2 py-2 font-medium">Název</th>
                        <th className="px-2 py-2 font-medium text-right w-24">Cena/{currSymbol}</th>
                        <th className="px-2 py-2 font-medium text-right w-14">Sl.%</th>
                        <th className="px-2 py-2 font-medium text-right w-14">Počet</th>
                        <th className="px-2 py-2 font-medium text-right w-14">DPH%</th>
                        <th className="px-2 py-2 font-medium text-right w-24">Celkem</th>
                        <th className="w-6"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {items.map(item => (
                        <tr key={item._key} className="hover:bg-gray-50/50">
                          <td className="px-2 py-1.5">
                            <input className="w-full outline-none text-xs text-gray-800 bg-transparent min-w-[140px]"
                              value={item.name} onChange={e => updateItem(item._key, 'name', e.target.value)}
                              placeholder="Název položky"/>
                          </td>
                          <td className="px-2 py-1.5">
                            <input type="number" step="0.01" className="w-full outline-none text-xs text-right text-gray-800 bg-transparent"
                              value={item.price_unit} onChange={e => updateItem(item._key, 'price_unit', e.target.value)}/>
                          </td>
                          <td className="px-2 py-1.5">
                            <input type="number" min="0" max="100" className="w-full outline-none text-xs text-right text-gray-800 bg-transparent"
                              value={item.discount} onChange={e => updateItem(item._key, 'discount', e.target.value)}/>
                          </td>
                          <td className="px-2 py-1.5">
                            <input type="number" step="0.5" min="0" className="w-full outline-none text-xs text-right text-gray-800 bg-transparent"
                              value={item.quantity} onChange={e => updateItem(item._key, 'quantity', e.target.value)}/>
                          </td>
                          <td className="px-2 py-1.5">
                            <input type="number" min="0" max="100" className="w-full outline-none text-xs text-right text-gray-800 bg-transparent"
                              value={item.vat_rate} onChange={e => updateItem(item._key, 'vat_rate', e.target.value)}/>
                          </td>
                          <td className="px-2 py-1.5 text-right font-medium tabular-nums text-gray-700">
                            {formatNumber(rowGross(item))}
                          </td>
                          <td className="px-1 py-1.5 text-center">
                            <button onClick={() => removeItem(item._key)}
                              className="text-gray-300 hover:text-red-500 transition-colors">
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
                              </svg>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button onClick={() => setItems(prev => [...prev, emptyItem()])}
                  className="mt-2 text-xs text-teal-600 hover:text-teal-700 font-medium">
                  + Přidat řádek
                </button>
              </div>

              {/* Rekapitulace */}
              <div className="flex justify-end">
                <div className="text-sm space-y-1 text-right min-w-[180px]">
                  <div className="flex justify-between gap-8 text-gray-500">
                    <span>Základ</span>
                    <span className="font-medium text-gray-800 tabular-nums">{formatNumber(totals.net)} {currSymbol}</span>
                  </div>
                  <div className="flex justify-between gap-8 text-gray-500">
                    <span>DPH</span>
                    <span className="font-medium text-gray-800 tabular-nums">{formatNumber(totals.vat)} {currSymbol}</span>
                  </div>
                  <div className="flex justify-between gap-8 font-bold text-gray-900 border-t border-gray-200 pt-1">
                    <span>Celkem</span>
                    <span className="tabular-nums">{formatNumber(totals.total)} {currSymbol}</span>
                  </div>
                  {currency !== 'CZK' && rate > 1 && (
                    <div className="text-xs text-gray-400 text-right">{formatNumber(Math.round(totals.total * rate * 100) / 100)} Kč</div>
                  )}
                </div>
              </div>

              {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100 shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
            Zrušit
          </button>
          <button onClick={handleSubmit} disabled={saving || loading}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 transition-colors">
            {saving ? <Spinner size={4}/> : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
              </svg>
            )}
            {isEdit ? 'Uložit změny' : 'Vystavit fakturu'}
          </button>
        </div>
      </div>
    </div>
  )
}
