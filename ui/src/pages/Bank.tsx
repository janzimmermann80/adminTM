import { useState, useEffect, useRef } from 'react'
import { Layout } from '../components/Layout'
import { Spinner } from '../components/Spinner'
import { formatDate, formatNumber } from '../utils'
import {
  getBankTransactions, matchBankTransaction, unmatchBankTransaction,
  searchBankInvoices, uploadBankXml, getBankStatements, deleteBankStatement, settleInvoice,
} from '../api'
import { InvoiceFormModal } from '../components/InvoiceFormModal'
import { CompanyDetailPanel } from './company/CompanyDetailPanel'

// ── Invoice search modal ──────────────────────────────────────────────────────
function InvoiceSearchModal({ tx, onClose, onMatched }: {
  tx: any
  onClose: () => void
  onMatched: () => void
}) {
  const isProforma = tx.vs?.charAt(0) === '5'
  const [q, setQ] = useState(tx.vs ?? '')
  const [results, setResults] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [invoiceFormTarget, setInvoiceFormTarget] = useState<{ companyKey: number; prefill: any } | null>(null)

  const search = async (val: string) => {
    if (!val.trim()) return
    setLoading(true)
    try {
      const rows = await searchBankInvoices(val, isProforma ? undefined : tx.amount, isProforma)
      setResults(rows)
    } catch {}
    finally { setLoading(false) }
  }

  useEffect(() => { if (q) search(q) }, [])

  const handleMatch = async (invoiceKey: number) => {
    setSaving(true)
    try {
      await matchBankTransaction(tx.id, invoiceKey, isProforma)
      onMatched()
    } catch (e: any) { alert(e.message) }
    finally { setSaving(false) }
  }

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div className="font-semibold text-gray-800">
            {isProforma ? 'Záloha' : 'Párování'} — {tx.credit_debit === 'CRDT' ? '+' : '-'}{formatNumber(tx.amount)} {tx.currency}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div className="flex gap-2">
            <input
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-500"
              placeholder={isProforma ? 'Číslo zálohy nebo firma...' : 'VS, číslo faktury nebo firma...'}
              value={q}
              onChange={e => setQ(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && search(q)}
              autoFocus
            />
            <button onClick={() => search(q)} disabled={loading}
              className="bg-[#0a6b6b] hover:bg-[#085858] text-white px-4 py-2 rounded-lg text-sm disabled:opacity-60">
              {loading ? <Spinner size={4}/> : 'Hledat'}
            </button>
          </div>
          <div className="max-h-72 overflow-y-auto divide-y divide-gray-100">
            {results.length === 0 && !loading && (
              <p className="text-sm text-gray-400 py-4 text-center">Žádné výsledky</p>
            )}
            {results.map(inv => (
              <div key={inv.invoice_key} className="py-3 space-y-1.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="font-mono text-sm font-semibold text-gray-800">{isProforma ? 'Z' : ''}{inv.year}/{inv.number}</span>
                    {inv.series != null && <span className="ml-2 text-xs text-gray-500">série {inv.series}</span>}
                    <span className="ml-2 text-sm text-gray-700 font-medium">{inv.company}</span>
                    {inv.settlement && <span className="ml-2 text-xs text-green-600 font-medium">uhrazeno {formatDate(inv.settlement)}</span>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-sm font-semibold text-gray-800">{formatNumber(inv.total)} {inv.currency}</span>
                    {isProforma && (
                      <button onClick={() => {
                        const series = Number(inv.series)
                        const itemName = series === 4
                          ? `Předplatné systému TruckManager Doprava & Spedice pro ${inv.quantity} vozidel`
                          : series === 1
                            ? 'Předplatné systému TruckManager Spedice'
                            : ''
                        setInvoiceFormTarget({ companyKey: inv.company_key, prefill: {
                          series: 4,
                          proforma_number: parseInt('5' + inv.series + String(inv.company_id).slice(-5) + inv.number),
                          currency: inv.currency,
                          curr_value: inv.exchange_rate && inv.exchange_rate !== 1 ? inv.exchange_rate : undefined,
                          issued: tx.transaction_date?.slice(0, 10),
                          fulfilment: tx.transaction_date?.slice(0, 10),
                          maturity: tx.transaction_date?.slice(0, 10),
                          settlement: tx.transaction_date?.slice(0, 10),
                          payment_method: 'T',
                          items: itemName ? (() => {
                            const qty = inv.quantity || 1
                            // inv.total může být null — záloha z banky tx.amount je spolehlivý základ
                            const paidTotal = inv.total != null ? Number(inv.total)
                              : (inv.currency !== 'CZK' && Number(inv.exchange_rate) > 1)
                                ? tx.amount / Number(inv.exchange_rate)
                                : tx.amount
                            const priceUnit = inv.currency === 'CZK'
                              ? Math.round(paidTotal / qty / 1.21 * 100) / 100
                              : Math.round(paidTotal / qty * 100) / 100
                            return [{ name: itemName, price_unit: priceUnit, vat_rate: inv.currency === 'CZK' ? 21 : 0, quantity: qty, discount: 0 }]
                          })() : undefined,
                        }})
                      }} disabled={saving}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 rounded-lg text-xs disabled:opacity-60">
                        Vystavit fakturu
                      </button>
                    )}
                    <button onClick={() => handleMatch(inv.invoice_key)} disabled={saving}
                      className="bg-teal-600 hover:bg-teal-700 text-white px-3 py-1 rounded-lg text-xs disabled:opacity-60">
                      {isProforma ? 'Přiřadit' : 'Spárovat'}
                    </button>
                  </div>
                </div>
                {isProforma && (
                  <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-gray-500 pl-0.5">
                    {inv.issued   && <span>Vystaveno: <span className="text-gray-700">{formatDate(inv.issued)}</span></span>}
                    {inv.maturity && <span>Splatnost: <span className="text-gray-700">{formatDate(inv.maturity)}</span></span>}
                    {inv.quantity != null && <span>Množství: <span className="text-gray-700">{inv.quantity}</span></span>}
                    {inv.payment_method && <span>Způsob platby: <span className="text-gray-700">{inv.payment_method}</span></span>}
                    {inv.car_num  && <span>SPZ: <span className="text-gray-700 font-mono">{inv.car_num}</span></span>}
                    {inv.exchange_rate && inv.exchange_rate !== 1 && <span>Kurz: <span className="text-gray-700">{inv.exchange_rate}</span></span>}
                    {inv.detail   && <span className="col-span-2 truncate" title={inv.detail}>Popis: <span className="text-gray-700">{inv.detail}</span></span>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
    {invoiceFormTarget && (
      <InvoiceFormModal
        companyKey={invoiceFormTarget.companyKey}
        prefill={invoiceFormTarget.prefill}
        onClose={() => setInvoiceFormTarget(null)}
        onSaved={() => setInvoiceFormTarget(null)}
      />
    )}
  </>
  )
}

// ── Statements accordion ─────────────────────────────────────────────────────
function StatementRow({ tx, onUnmatch, onMatch, onSettle, onOpenCompany }: {
  tx: any
  onUnmatch: (id: number) => void
  onMatch: (tx: any) => void
  onSettle: (tx: any) => void
  onOpenCompany: (companyKey: number) => void
}) {
  const isCredit = tx.credit_debit === 'CRDT'
  const isMatched = !!(tx.matched_invoice_id || tx.matched_company_key)
  const isProforma = tx.vs?.charAt(0) === '5'
  return (
    <tr className={`hover:bg-gray-50 transition-colors ${!isMatched ? 'bg-yellow-50/40' : ''}`}>
      <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap text-xs">{formatDate(tx.transaction_date)}</td>
      <td className={`px-4 py-2.5 font-mono text-right whitespace-nowrap text-sm font-medium ${isCredit ? 'text-green-700' : 'text-red-600'}`}>
        {isCredit ? '+' : '-'}{formatNumber(tx.amount)} {tx.currency}
      </td>
      <td className="px-4 py-2.5 font-mono text-xs text-gray-700">{tx.vs || <span className="text-gray-300">—</span>}</td>
      <td className="px-4 py-2.5 text-gray-600 hidden md:table-cell max-w-[160px] truncate text-xs" title={tx.counterparty_name}>
        {tx.counterparty_name || <span className="text-gray-300">—</span>}
      </td>
      <td className="px-4 py-2.5 text-xs">
        {isMatched ? (
          <button className="text-left hover:opacity-75 transition-opacity" onClick={() => tx.invoice_company_key && onOpenCompany(tx.invoice_company_key)}>
            {!isProforma && <div className="font-medium text-teal-700">{tx.invoice_year}/{tx.invoice_number}</div>}
            {isProforma && <div className="font-medium text-purple-700">Záloha</div>}
            <div className="text-gray-500 truncate max-w-[120px]">{tx.invoice_company}</div>
          </button>
        ) : (
          <span className="text-amber-600 font-medium">{isProforma ? 'Záloha — nenalezena' : 'Nespárováno'}</span>
        )}
      </td>
      <td className="px-4 py-2.5 text-xs whitespace-nowrap">
        {isMatched && !isProforma && (
          tx.invoice_settlement
            ? <span className="text-green-600 font-medium">{formatDate(tx.invoice_settlement)}</span>
            : <button onClick={() => onSettle(tx)} title="Zaplatit — vložit datum platby"
                className="inline-flex items-center gap-1 text-gray-400 hover:text-teal-600 transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
              </button>
        )}
      </td>
      <td className="px-4 py-2.5 text-right">
        {isMatched ? (
          <button onClick={() => onUnmatch(tx.id)} className="text-xs text-gray-400 hover:text-red-500 transition-colors">Odpárovat</button>
        ) : (
          <button onClick={() => onMatch(tx)} className="text-xs bg-teal-600 hover:bg-teal-700 text-white px-2.5 py-1 rounded-lg transition-colors whitespace-nowrap">
            {isProforma ? 'Najít zálohu' : 'Najít fakturu'}
          </button>
        )}
      </td>
    </tr>
  )
}

function StatementsAccordion({ onDeleted, onMatch, onUnmatch, onOpenCompany }: {
  onDeleted: () => void
  onMatch: (tx: any) => void
  onUnmatch: (id: number) => void
  onOpenCompany: (companyKey: number) => void
}) {
  const [statements, setStatements] = useState<any[]>([])
  const [open, setOpen] = useState<number | null>(null)
  const [txMap, setTxMap] = useState<Record<number, any[]>>({})
  const [loadingTx, setLoadingTx] = useState<number | null>(null)
  const [deleting, setDeleting] = useState<number | null>(null)
  const [dir, setDir] = useState('CRDT')

  const loadStatements = async () => {
    try { setStatements(await getBankStatements()) } catch {}
  }

  useEffect(() => { loadStatements() }, [])

  // Při změně směru reset načtených transakcí
  useEffect(() => { setTxMap({}) }, [dir])

  const fetchTx = async (id: number, currentDir = dir) => {
    setLoadingTx(id)
    try {
      const rows = await getBankTransactions({
        statement_id: id,
        credit_debit: currentDir || undefined,
        limit: 500,
      })
      setTxMap(m => ({ ...m, [id]: rows }))
    } catch {}
    finally { setLoadingTx(null) }
  }

  const toggleOpen = async (id: number) => {
    if (open === id) { setOpen(null); return }
    setOpen(id)
    fetchTx(id, dir)
  }

  const refreshTx = async (statementId: number) => {
    await fetchTx(statementId, dir)
    loadStatements()
  }

  const handleDirChange = (val: string) => {
    setDir(val)
    setTxMap({})
    if (open !== null) fetchTx(open, val)
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Smazat výpis a všechny jeho transakce?')) return
    setDeleting(id)
    try {
      await deleteBankStatement(id)
      await loadStatements()
      setTxMap(m => { const n = { ...m }; delete n[id]; return n })
      if (open === id) setOpen(null)
      onDeleted()
    } catch (e: any) { alert(e.message) }
    finally { setDeleting(null) }
  }

  if (statements.length === 0) return null

  return (
    <div className="mb-5 space-y-1">
      <div className="flex items-center gap-3 px-1 pb-2">
        <select
          value={dir}
          onChange={e => handleDirChange(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-teal-500 bg-white"
        >
          <option value="CRDT">Příchozí platby</option>
          <option value="DBIT">Odchozí platby</option>
          <option value="">Příchozí + odchozí</option>
        </select>
      </div>
      {statements.map(s => (
        <div key={s.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {/* Hlavička */}
          <button className="w-full flex items-center justify-between px-5 py-3 text-left hover:bg-gray-50 transition-colors" onClick={() => toggleOpen(s.id)}>
            <div className="flex flex-wrap items-center gap-3 text-sm min-w-0">
              <span className="font-medium text-gray-800 shrink-0">Výpis č. {s.seq_number ?? s.id}</span>
              {s.account_number && <span className="text-gray-500 shrink-0">Účet: <span className="font-mono">{s.account_number}</span></span>}
              {s.period_from && <span className="text-gray-500 shrink-0">{formatDate(s.period_from)}{s.period_to && s.period_to !== s.period_from ? ` – ${formatDate(s.period_to)}` : ''}</span>}
              {s.opening_balance != null && <span className="text-gray-500 shrink-0">Počáteční: <span className="font-medium text-gray-700">{formatNumber(s.opening_balance)} {s.currency}</span></span>}
              {s.closing_balance != null && <span className="text-gray-500 shrink-0">Konečný: <span className="font-medium text-gray-700">{formatNumber(s.closing_balance)} {s.currency}</span></span>}
              <span className="text-xs text-gray-400 shrink-0">{s.tx_count} transakcí · {s.matched_count} spárováno</span>
            </div>
            <div className="flex items-center gap-3 ml-3 shrink-0">
              <button onClick={e => { e.stopPropagation(); handleDelete(s.id) }} disabled={deleting === s.id}
                className="text-xs text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50">
                {deleting === s.id ? <Spinner size={3} /> : 'Smazat'}
              </button>
              <svg className={`w-4 h-4 text-gray-400 transition-transform ${open === s.id ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </button>

          {/* Transakce */}
          {open === s.id && (
            <div className="border-t border-gray-100 overflow-x-auto">
              {loadingTx === s.id ? (
                <div className="flex justify-center py-8"><Spinner size={6} /></div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wide border-b border-gray-100">
                      <th className="px-4 py-2 font-medium">Datum</th>
                      <th className="px-4 py-2 font-medium text-right">Částka</th>
                      <th className="px-4 py-2 font-medium">VS</th>
                      <th className="px-4 py-2 font-medium hidden md:table-cell">Protistrana</th>
                      <th className="px-4 py-2 font-medium">Faktura</th>
                      <th className="px-4 py-2 font-medium">Zaplaceno</th>
                      <th className="px-4 py-2 w-24"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {(txMap[s.id] ?? []).length === 0 && (
                      <tr><td colSpan={7} className="px-4 py-6 text-center text-sm text-gray-400">Žádné transakce</td></tr>
                    )}
                    {(txMap[s.id] ?? []).map(tx => (
                      <StatementRow key={tx.id} tx={tx}
                        onUnmatch={async (id) => { await onUnmatch(id); refreshTx(s.id) }}
                        onMatch={(tx) => { onMatch(tx) }}
                        onOpenCompany={onOpenCompany}
                        onSettle={async (tx) => {
                          try {
                            await settleInvoice(String(tx.matched_invoice_id), tx.transaction_date)
                            refreshTx(s.id)
                          } catch (e: any) { alert(e.message) }
                        }}
                      />
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Hlavní stránka ────────────────────────────────────────────────────────────
export const Bank = () => {
  // Upload
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<{ imported: number; skipped: number; errors: string[] } | null>(null)
  const [uploadError, setUploadError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  // Párování
  const [matchTarget, setMatchTarget] = useState<any | null>(null)
  const [statementsKey, setStatementsKey] = useState(0)
  const [companyPanelKey, setCompanyPanelKey] = useState<number | null>(null)

  const [dragOver, setDragOver] = useState(false)

  const handleUpload = async (files: FileList | File[] | null) => {
    if (!files?.length) return
    setUploading(true); setUploadResult(null); setUploadError('')
    try {
      const res = await uploadBankXml(files)
      setUploadResult(res)
      if (res.imported > 0) setStatementsKey(k => k + 1)
    } catch (e: any) { setUploadError(e.message) }
    finally { setUploading(false) }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setDragOver(false)
    const files = Array.from(e.dataTransfer.files).filter(f => f.name.toLowerCase().endsWith('.xml'))
    if (files.length) handleUpload(files)
    else setUploadError('Žádný XML soubor nebyl nalezen.')
  }

  const handleUnmatch = async (txId: number) => {
    try { await unmatchBankTransaction(txId) }
    catch (e: any) { alert(e.message) }
  }

  return (
    <Layout>
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-900">Banka — párování plateb</h1>
      </div>

      {/* Upload */}
      <div
        className={`bg-white rounded-xl border-2 shadow-sm px-5 py-6 mb-5 transition-colors ${dragOver ? 'border-[#0a6b6b] bg-teal-50' : 'border-dashed border-gray-300'}`}
        onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDragOver(true) }}
        onDragEnter={e => { e.preventDefault(); e.stopPropagation(); setDragOver(true) }}
        onDragLeave={e => { e.preventDefault(); e.stopPropagation(); setDragOver(false) }}
        onDrop={handleDrop}
      >
        <input ref={fileRef} type="file" accept=".xml" multiple className="hidden"
          onChange={e => handleUpload(e.target.files)} />
        <div className="flex flex-col items-center gap-3 text-center">
          <svg className={`w-8 h-8 ${dragOver ? 'text-[#0a6b6b]' : 'text-gray-400'} transition-colors`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"/>
          </svg>
          <div className="text-sm text-gray-500">
            Přetáhněte soubory XML sem, nebo
          </div>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 bg-[#0a6b6b] hover:bg-[#085858] text-white px-4 py-2 rounded-lg text-sm disabled:opacity-60 transition-colors"
          >
            {uploading ? <Spinner size={4}/> : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
              </svg>
            )}
            Vybrat soubory
          </button>
          <div className="text-xs text-gray-400">FINSTA / CAMT.053 XML</div>
        </div>
        {(uploadResult || uploadError) && (
          <div className="mt-4 pt-4 border-t border-gray-100 flex flex-wrap justify-center gap-3 text-sm">
            {uploadResult && <>
              <span className="text-green-600 font-medium">Importováno: {uploadResult.imported}</span>
              {uploadResult.skipped > 0 && <span className="text-gray-500">Přeskočeno: {uploadResult.skipped}</span>}
              {uploadResult.errors.length > 0 && <span className="text-red-500">{uploadResult.errors.join('; ')}</span>}
            </>}
            {uploadError && <span className="text-red-500">{uploadError}</span>}
          </div>
        )}
      </div>

      {/* Výpisy */}
      <StatementsAccordion
        key={statementsKey}
        onDeleted={() => setStatementsKey(k => k + 1)}
        onMatch={tx => setMatchTarget(tx)}
        onUnmatch={handleUnmatch}
        onOpenCompany={key => setCompanyPanelKey(key)}
      />

      {matchTarget && (
        <InvoiceSearchModal
          tx={matchTarget}
          onClose={() => setMatchTarget(null)}
          onMatched={() => setMatchTarget(null)}
        />
      )}

      {companyPanelKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setCompanyPanelKey(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <CompanyDetailPanel
              companyKey={String(companyPanelKey)}
              initialTab="invoices"
              onClose={() => setCompanyPanelKey(null)}
            />
          </div>
        </div>
      )}
    </Layout>
  )
}
