import { useState } from 'react'
import { OrderCheckFilters, OrderCheckRow, PrejimkaCsvPreview, PrejimkaDestination, preparePrejimkaCsv, sendPrejimkaCsv } from '../api'

type Props = {
  company: string
  companyKey: number
  rows: OrderCheckRow[]
  filters: OrderCheckFilters
  destinations: {
    value: PrejimkaDestination
    prefixes: readonly string[]
    label: string
    email: string
  }[]
  onClose: () => void
  onSent: () => void
}

const fallbackDestinations: Props['destinations'] = [
  { value: 'prejimky', prefixes: ['SB', 'SY', 'SS', 'SZ', 'SL', 'SP', 'SM'], label: 'Nezávislá Přejímka', email: 'gps@prejimky.cz' },
  { value: 'gpsdata', prefixes: ['LC', 'LD'], label: 'LESS & TIMBER', email: 'prejimky@gpsdata.cz' },
  { value: 'wood', prefixes: ['ZA', 'ZB', 'ZD', 'ZM', 'ZS', 'ZJ', 'ZE', 'MA', 'LW'], label: 'WOOD & PAPER', email: 'gps@wood-paper.cz' },
  { value: 'wamm', prefixes: ['MM'], label: 'WA-MM', email: 'gps@wa-mm.cz' },
]

function downloadCsv(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function PrejimkaCsvModal({ company, companyKey, rows, filters, destinations, onClose, onSent }: Props) {
  const recipientOptions = destinations.length ? destinations : fallbackDestinations
  const [selected, setSelected] = useState(() => new Set(rows.map(row => row.orderNumber)))
  const [previews, setPreviews] = useState<PrejimkaCsvPreview[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [destinationsByOrder, setDestinationsByOrder] = useState<Record<string, PrejimkaDestination | ''>>({})
  const [sending, setSending] = useState<string | null>(null)
  const [sendResults, setSendResults] = useState<Record<string, { ok: boolean; message: string }>>({})

  const prepare = async () => {
    if (!selected.size) {
      setError('Vyberte alespoň jednu zakázku.')
      return
    }
    setError(null)
    setLoading(true)
    try {
      const prepared = await preparePrejimkaCsv({ ...filters, companyKey: String(companyKey) }, [...selected])
      setPreviews(prepared)
      setDestinationsByOrder(Object.fromEntries(prepared.map(preview => {
        const prefix = preview.orderNumber.slice(0, 2).toUpperCase()
        return [preview.orderNumber, recipientOptions.find(destination => destination.prefixes.includes(prefix))?.value ?? '']
      })))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  const updatePreview = (index: number, field: 'gps1' | 'gps2', value: string) => {
    setPreviews(current => current?.map((item, i) => i === index ? { ...item, [field]: value } : item) ?? null)
  }

  const send = async (preview: PrejimkaCsvPreview) => {
    const destination = destinationsByOrder[preview.orderNumber]
    const recipient = recipientOptions.find(item => item.value === destination)
    if (!destination || !recipient) {
      setError(`Pro prefix zakázky ${preview.orderNumber.slice(0, 2)} není nastavený příjemce.`)
      return
    }
    if (!window.confirm(`Odeslat zakázku ${preview.orderNumber} firmy ${company} na ${recipient.label} (${recipient.email})?`)) return
    setSending(preview.orderNumber)
    try {
      const result = await sendPrejimkaCsv({ ...filters, companyKey: String(companyKey) }, preview, destination, crypto.randomUUID())
      setSendResults(current => ({ ...current, [preview.orderNumber]: { ok: true, message: `Odesláno na ${recipient.email} (číslo ${String(result.number).padStart(4, '0')}).` } }))
      onSent()
    } catch (e) {
      setSendResults(current => ({ ...current, [preview.orderNumber]: { ok: false, message: `${e instanceof Error ? e.message : String(e)} Před dalším pokusem ověřte, zda e-mail nebyl odeslán.` } }))
    } finally {
      setSending(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 overflow-y-auto p-4" role="dialog" aria-modal="true" aria-labelledby="prejimka-title">
      <div className="mx-auto my-6 max-w-5xl rounded-xl bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="prejimka-title" className="text-lg font-semibold">CSV pro přejímku – {company}</h2>
            <p className="text-sm text-gray-500">Období {filters.from} až {filters.to}. Před odesláním zkontrolujte obsah souborů a příjemce.</p>
          </div>
          <button type="button" onClick={onClose} disabled={sending !== null} className="text-sm text-gray-600 hover:underline disabled:opacity-50">Zavřít</button>
        </div>
        {error && <div role="alert" className="mt-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        {!previews ? (
          <>
            <div className="mt-4 flex gap-4 text-sm">
              <button type="button" onClick={() => setSelected(new Set(rows.map(row => row.orderNumber)))} className="text-teal-700 hover:underline">Vybrat vše</button>
              <button type="button" onClick={() => setSelected(new Set())} className="text-teal-700 hover:underline">Zrušit výběr</button>
            </div>
            <div className="mt-3 max-h-80 space-y-2 overflow-y-auto">
              {rows.map(row => (
                <label key={row.orderNumber} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={selected.has(row.orderNumber)} onChange={e => setSelected(current => {
                    const next = new Set(current)
                    if (e.target.checked) next.add(row.orderNumber)
                    else next.delete(row.orderNumber)
                    return next
                  })} />
                  {row.orderNumber} · {row.spz ?? 'Bez SPZ'}
                </label>
              ))}
            </div>
            <button type="button" onClick={prepare} disabled={loading} className="mt-4 rounded bg-teal-700 px-4 py-2 text-sm text-white disabled:opacity-50">
              {loading ? 'Připravuji…' : 'Připravit náhled CSV'}
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={() => setPreviews(null)} disabled={sending !== null} className="mt-4 text-sm text-teal-700 hover:underline disabled:opacity-50">Zpět k výběru</button>
            <div className="mt-4 space-y-6">
              {previews.map((preview, index) => {
                const safeOrder = preview.orderNumber.replace(/[^a-zA-Z0-9._-]/g, '_')
                return (
                  <section key={preview.orderNumber} className="rounded border border-gray-200 p-4">
                    <h3 className="font-semibold">{preview.orderNumber}</h3>
                    <p className="text-xs text-gray-500">{preview.pointCount.toLocaleString('cs-CZ')} GPS bodů{preview.pointCount === 0 && ' – trasa nebyla nalezena'}</p>
                    <label className="mt-3 block text-sm font-medium">Příjemce
                      <select value={destinationsByOrder[preview.orderNumber] ?? ''}
                        onChange={e => setDestinationsByOrder(current => ({ ...current, [preview.orderNumber]: e.target.value as PrejimkaDestination | '' }))}
                        disabled={sending !== null || !!sendResults[preview.orderNumber]}
                        className="mt-1 block w-full rounded border border-gray-300 p-2 text-sm">
                        <option value="">Vyberte příjemce</option>
                        {recipientOptions.map(item => <option key={item.value} value={item.value}>{item.prefixes.join(', ')} – {item.label} – {item.email}</option>)}
                      </select>
                    </label>
                    {(['gps1', 'gps2'] as const).map(field => (
                      <div key={field} className="mt-3">
                        <label className="block text-sm font-medium">{field.toUpperCase()}
                          <textarea value={preview[field]} onChange={e => updatePreview(index, field, e.target.value)} disabled={sending !== null || !!sendResults[preview.orderNumber]}
                            rows={field === 'gps1' ? 3 : 8} spellCheck={false}
                            className="mt-1 block w-full rounded border border-gray-300 p-2 font-mono text-xs" />
                        </label>
                        <button type="button" onClick={() => downloadCsv(`${field}-${safeOrder}.csv`, preview[field])}
                          className="mt-2 text-sm text-teal-700 hover:underline">Stáhnout {field.toUpperCase()}</button>
                      </div>
                    ))}
                    {sendResults[preview.orderNumber]
                      ? <p role="status" className={`mt-3 text-sm ${sendResults[preview.orderNumber].ok ? 'text-green-700' : 'text-red-700'}`}>{sendResults[preview.orderNumber].message}</p>
                      : <button type="button" onClick={() => send(preview)} disabled={sending !== null || !destinationsByOrder[preview.orderNumber]}
                        className="mt-3 rounded bg-teal-700 px-4 py-2 text-sm text-white disabled:opacity-50">
                        {sending === preview.orderNumber ? 'Odesílám…' : 'Odeslat zakázku'}
                      </button>}
                  </section>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
