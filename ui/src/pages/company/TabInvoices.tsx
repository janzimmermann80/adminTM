import { useState, useEffect } from 'react'
import {
  getInvoices, getInvoiceEmailContacts, sendInvoiceEmail,
  settleInvoice, cancelInvoice, deleteInvoice, downloadInvoicePdf,
} from '../../api'
import { Spinner } from '../../components/Spinner'
import { Pagination } from '../../components/Pagination'
import { formatDate, formatNumber } from '../../utils'
import type { Invoice } from '../../types'
import { INVOICE_SERIES_LABELS } from '../../types'

interface Props { companyKey: string; companyId?: string }

const LIMIT = 10

// ── Email modal ──────────────────────────────────────────────────────────────
function InvoiceEmailModal({ inv, companyId, onClose, onSent }: {
  inv: Invoice
  companyId: string
  onClose: () => void
  onSent: () => void
}) {
  const vs = `${inv.series}${String(companyId).slice(-5)}${String(inv.number).padStart(4,'0')}`
  const [to, setTo]       = useState('')
  const [cc, setCc]       = useState('')
  const [subject, setSubject] = useState(`Faktura č. ${vs} – ${inv.year}`)
  const [body, setBody]   = useState(
    `Dobrý den,\n\nv příloze zasíláme fakturu č. ${vs}.\n\nS pozdravem\n1. Česká obchodní, s.r.o.`
  )
  const [sending, setSending] = useState(false)
  const [sent, setSent]   = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    getInvoiceEmailContacts(String(inv.invoice_key))
      .then(addrs => { if (addrs[0]) setTo(addrs[0]) })
      .catch(() => {})
  }, [inv.invoice_key])

  const handleSend = async () => {
    if (!to.trim()) return
    setSending(true); setError('')
    try {
      await sendInvoiceEmail(String(inv.invoice_key), { to, cc: cc || undefined, subject, body })
      setSent(true)
      setTimeout(onSent, 1200)
    } catch (e: any) { setError(e.message) }
    finally { setSending(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2 font-semibold text-gray-800">
            <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
            </svg>
            Odeslat fakturu e-mailem
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Komu *</label>
            <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              value={to} onChange={e => setTo(e.target.value)} placeholder="email@firma.cz"/>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Kopie (CC)</label>
            <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              value={cc} onChange={e => setCc(e.target.value)} placeholder="volitelně"/>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Předmět</label>
            <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              value={subject} onChange={e => setSubject(e.target.value)}/>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Text e-mailu</label>
            <textarea rows={5}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              value={body} onChange={e => setBody(e.target.value)}/>
          </div>
          <p className="text-xs text-gray-400">PDF faktura bude přiložena automaticky.</p>
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          {sent  && <p className="text-sm text-teal-700 bg-teal-50 rounded-lg px-3 py-2">E-mail odeslán.</p>}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Zrušit</button>
          <button onClick={handleSend} disabled={sending || sent || !to.trim()}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
            {sending ? <Spinner size={4}/> : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/>
              </svg>
            )}
            Odeslat
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Edit modal (uhrazení) ────────────────────────────────────────────────────
function InvoiceEditModal({ inv, companyId, onClose, onSaved }: {
  inv: Invoice
  companyId: string
  onClose: () => void
  onSaved: () => void
}) {
  const invoiceVs = (i: Invoice) => `${i.series}${String(companyId).slice(-5)}${String(i.number).padStart(4,'0')}`
  const today = new Date().toISOString().slice(0,10)
  const [date, setDate]   = useState(inv.settlement ?? today)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSettle = async () => {
    setSaving(true); setError('')
    try {
      await settleInvoice(String(inv.invoice_key), date)
      onSaved()
    } catch (e: any) { setError(e.message) }
    finally { setSaving(false) }
  }

  const handleUnsettle = async () => {
    if (!confirm('Zrušit označení jako uhrazeno?')) return
    setSaving(true); setError('')
    try {
      // null date = clear settlement (backend needs support — send empty string)
      await settleInvoice(String(inv.invoice_key), '')
      onSaved()
    } catch (e: any) { setError(e.message) }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2 font-semibold text-gray-800">
            <svg className="w-5 h-5 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
            </svg>
            Faktura {invoiceVs(inv)}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div className="px-5 py-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Datum úhrady</label>
            <input type="date"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-500"
              value={date} onChange={e => setDate(e.target.value)}/>
          </div>
          {inv.settlement && (
            <div className="text-sm text-green-600">
              Aktuálně uhrazeno: <strong>{formatDate(inv.settlement)}</strong>
            </div>
          )}
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        </div>

        <div className="flex justify-between px-5 py-4 border-t border-gray-100">
          {inv.settlement ? (
            <button onClick={handleUnsettle} disabled={saving}
              className="px-3 py-2 text-sm text-red-500 hover:bg-red-50 rounded-lg disabled:opacity-50">
              Zrušit úhradu
            </button>
          ) : <div/>}
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Zrušit</button>
            <button onClick={handleSettle} disabled={saving || !date}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 transition-colors">
              {saving ? <Spinner size={4}/> : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
                </svg>
              )}
              Uložit úhradu
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Hlavní komponenta ────────────────────────────────────────────────────────
export const TabInvoices = ({ companyKey, companyId = '' }: Props) => {
  const invoiceVs = (inv: Invoice) => `${inv.series}${String(companyId).slice(-5)}${String(inv.number).padStart(4,'0')}`
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [total, setTotal]       = useState(0)
  const [offset, setOffset]     = useState(0)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [cancelling, setCancelling] = useState<number | null>(null)
  const [deleting, setDeleting] = useState<number | null>(null)
  const [printing,   setPrinting]   = useState<number | null>(null)

  const [emailTarget, setEmailTarget] = useState<Invoice | null>(null)
  const [editTarget,  setEditTarget]  = useState<Invoice | null>(null)

  const load = async (off = 0) => {
    setLoading(true)
    try {
      const res = await getInvoices(companyKey, off, LIMIT)
      setInvoices(res.data)
      setTotal(res.total)
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [companyKey])

  const handlePage = (off: number) => { setOffset(off); load(off) }

  const handleCancel = async (inv: Invoice) => {
    if (!confirm(`Stornovat fakturu ${invoiceVs(inv)}?`)) return
    setCancelling(inv.invoice_key)
    try {
      await cancelInvoice(String(inv.invoice_key))
      load(offset)
    } catch (e: any) { alert(e.message) }
    finally { setCancelling(null) }
  }

  const handleDelete = async (inv: Invoice) => {
    if (!confirm(`Smazat fakturu ${invoiceVs(inv)}? Tato akce je nevratná.`)) return
    setDeleting(inv.invoice_key)
    try {
      await deleteInvoice(String(inv.invoice_key))
      load(offset)
    } catch (e: any) { alert(e.message) }
    finally { setDeleting(null) }
  }

  const handlePrint = async (inv: Invoice) => {
    setPrinting(inv.invoice_key)
    try {
      const blob = await downloadInvoicePdf(String(inv.invoice_key))
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank')
    } catch (e: any) { alert(e.message) }
    finally { setPrinting(null) }
  }

  if (loading && !invoices.length) return <div className="flex justify-center py-12"><Spinner size={8}/></div>

  return (
    <div>
      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm mb-4">{error}</div>}

      <div className="flex items-center justify-between mb-4">
        <span className="text-sm text-gray-500">Celkem faktur: <strong>{total}</strong></span>
        {loading && <Spinner size={4}/>}
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wide">
              <th className="px-4 py-3 font-medium">Faktura</th>
              <th className="px-4 py-3 font-medium hidden sm:table-cell">Proforma</th>
              <th className="px-4 py-3 font-medium hidden sm:table-cell">Série</th>
              <th className="px-4 py-3 font-medium">Vydáno</th>
              <th className="px-4 py-3 font-medium hidden md:table-cell">Splnění</th>
              <th className="px-4 py-3 font-medium hidden md:table-cell">Splatnost</th>
              <th className="px-4 py-3 font-medium hidden sm:table-cell">Uhrazeno</th>
              <th className="px-4 py-3 font-medium text-right">Celkem</th>
              <th className="px-4 py-3 font-medium text-right hidden lg:table-cell">Základ</th>
              <th className="px-4 py-3 font-medium hidden lg:table-cell">Storno</th>
              <th className="px-4 py-3 w-32"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {invoices.map(inv => {
              const isCancelled = Boolean(inv.cancellation)
              const isSettled   = Boolean(inv.settlement)
              return (
                <tr key={inv.invoice_key}
                  className={`hover:bg-gray-50 transition-colors group ${isCancelled ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">
                    {invoiceVs(inv)}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-teal-600 hidden sm:table-cell">
                    {inv.proforma_number ? `P${inv.proforma_number}` : ''}
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <span className="bg-gray-100 text-gray-600 rounded px-1.5 py-0.5 text-xs">
                      {INVOICE_SERIES_LABELS[inv.series] ?? inv.series}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{formatDate(inv.issued)}</td>
                  <td className="px-4 py-3 text-gray-600 hidden md:table-cell">{formatDate(inv.fulfilment)}</td>
                  <td className="px-4 py-3 text-gray-600 hidden md:table-cell">{formatDate(inv.maturity)}</td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    {isSettled ? (
                      <span className="flex items-center gap-1 text-green-600 text-xs">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/>
                        </svg>
                        {formatDate(inv.settlement)}
                      </span>
                    ) : (
                      <span className="text-orange-500 text-xs font-medium">Neuhrazeno</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums">
                    {formatNumber(inv.total)} {inv.currency !== 'CZK' ? inv.currency : 'Kč'}
                    {inv.curr_total != null && inv.currency !== 'CZK' && (
                      <div className="text-xs text-gray-400">{formatNumber(inv.curr_total)} Kč</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-500 tabular-nums hidden lg:table-cell">
                    {formatNumber(inv.price)} {inv.currency !== 'CZK' ? inv.currency : 'Kč'}
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    {isCancelled && (
                      <span className="text-red-500 text-xs font-medium">{formatDate(inv.cancellation)}</span>
                    )}
                  </td>

                  {/* Akce */}
                  <td className="px-3 py-3">
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {/* Tisk */}
                      <button title="Generovat PDF / tisk" onClick={() => handlePrint(inv)}
                        disabled={printing === inv.invoice_key}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-40">
                        {printing === inv.invoice_key ? <Spinner size={4}/> : (
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/>
                          </svg>
                        )}
                      </button>
                      {/* Odeslat e-mail */}
                      <button title="Odeslat e-mailem" onClick={() => setEmailTarget(inv)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
                        </svg>
                      </button>
                      {/* Editace (úhrada) */}
                      <button title="Označit jako uhrazeno / editovat" onClick={() => setEditTarget(inv)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-teal-600 hover:bg-teal-50 transition-colors">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                        </svg>
                      </button>
                      {/* Storno */}
                      {!isCancelled && (
                        <button title="Stornovat fakturu" onClick={() => handleCancel(inv)}
                          disabled={cancelling === inv.invoice_key}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-orange-500 hover:bg-orange-50 transition-colors disabled:opacity-40">
                          {cancelling === inv.invoice_key ? <Spinner size={4}/> : (
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"/>
                            </svg>
                          )}
                        </button>
                      )}
                      {/* Smazat */}
                      <button title="Smazat fakturu" onClick={() => handleDelete(inv)}
                        disabled={deleting === inv.invoice_key}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40">
                        {deleting === inv.invoice_key ? <Spinner size={4}/> : (
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                          </svg>
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
            {invoices.length === 0 && !loading && (
              <tr>
                <td colSpan={10} className="px-4 py-10 text-center text-gray-400">Žádné faktury</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination total={total} limit={LIMIT} offset={offset} onChange={handlePage}/>

      {/* Modály */}
      {emailTarget && (
        <InvoiceEmailModal
          inv={emailTarget}
          companyId={companyId}
          onClose={() => setEmailTarget(null)}
          onSent={() => { setEmailTarget(null); load(offset) }}
        />
      )}
      {editTarget && (
        <InvoiceEditModal
          inv={editTarget}
          companyId={companyId}
          onClose={() => setEditTarget(null)}
          onSaved={() => { setEditTarget(null); load(offset) }}
        />
      )}
    </div>
  )
}
