import { useState, useEffect, useRef } from 'react'
import { getSmsContext, sendSms } from '../api'
import { Spinner } from './Spinner'

interface Props {
  companyKey: string
  initialGsm: string
  initialName: string
  onClose: () => void
}

const TEMPLATES = [
  { label: 'Upomínka pohledávek', text: 'Od TruckManager.eu: prosim Vas o uhradu faktur za nase sluzby: <+claim_invoice+>', note_type: 'U' },
  { label: 'Vlastní zpráva', text: '', note_type: 'S' },
]

function stripDiacritics(s: string) {
  const from = 'áěšČčřžýíéůúďóňťľôŕĺäöüßÁĚŠČŘŽÝÍÉŮÚĎÓŇŤ'
  const to   = 'aescCrzYIEuudontlOrlaoussAESCRZYIEUUDONT'
  let r = s
  for (let i = 0; i < from.length; i++) r = r.split(from[i]).join(to[i])
  return r
}

function applyCtx(text: string, ctx: Record<string, string>) {
  let r = text
  for (const [k, v] of Object.entries(ctx)) r = r.split(`<+${k}+>`).join(v)
  return r
}

export const SendSmsModal = ({ companyKey, initialGsm, initialName, onClose }: Props) => {
  const [recipients, setRecipients] = useState<{ label: string; gsm: string }[]>([
    { label: `${initialName} - ${initialGsm}`, gsm: initialGsm },
  ])
  const [ctx, setCtx] = useState<Record<string, string>>({})
  const [to, setTo] = useState(initialGsm)
  const [text, setText] = useState('')
  const [sendNow, setSendNow] = useState(true)
  const [noteType, setNoteType] = useState('S')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const textRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    getSmsContext(companyKey).then(data => {
      if (data.recipients?.length) setRecipients(data.recipients)
      if (data.context) setCtx(data.context)
      if (!data.recipients?.find((r: any) => r.gsm === initialGsm) && data.recipients?.length) {
        setTo(data.recipients[0].gsm)
      }
    }).catch(() => {})
  }, [companyKey])

  const handleTemplate = (tpl: typeof TEMPLATES[0]) => {
    setText(applyCtx(tpl.text, ctx))
    setNoteType(tpl.note_type)
    setTimeout(() => textRef.current?.focus(), 50)
  }

  const handleSend = async () => {
    if (!text.trim() || !to) return
    setSending(true)
    setError('')
    try {
      await sendSms({
        company_key: Number(companyKey),
        to,
        text: stripDiacritics(text),
        send_immediately: sendNow,
        note_type: noteType,
        note_text: text.slice(0, 80),
      })
      setSent(true)
      setTimeout(onClose, 1200)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSending(false)
    }
  }

  const stripped = stripDiacritics(text)
  const charCount = stripped.length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        {/* Hlavička */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2 text-gray-800 font-semibold">
            <svg className="w-5 h-5 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            Odeslat SMS
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Příjemce */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Příjemce</label>
            {recipients.length > 1 ? (
              <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-500"
                value={to} onChange={e => setTo(e.target.value)}>
                {recipients.map(r => (
                  <option key={r.gsm} value={r.gsm}>{r.label}</option>
                ))}
              </select>
            ) : (
              <div className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-gray-50">
                {recipients[0]?.label ?? to}
              </div>
            )}
          </div>

          {/* Šablony */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Šablona</label>
            <div className="flex flex-wrap gap-1.5">
              {TEMPLATES.map(tpl => (
                <button key={tpl.label} onClick={() => handleTemplate(tpl)}
                  className="px-2.5 py-1 text-xs border border-gray-300 rounded-lg hover:bg-teal-50 hover:border-teal-400 hover:text-teal-700 transition-colors">
                  {tpl.label}
                </button>
              ))}
            </div>
          </div>

          {/* Zpráva */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-gray-500">Zpráva</label>
              <span className={`text-xs font-mono ${charCount > 160 ? 'text-red-500' : 'text-gray-400'}`}>
                {charCount} / 160
              </span>
            </div>
            <textarea ref={textRef} rows={5}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-500 resize-none font-mono"
              value={text} onChange={e => setText(e.target.value)}
              placeholder="Text zprávy (bez českých znaků)..." />
            {charCount > 0 && stripped !== text && (
              <p className="text-xs text-amber-500 mt-1">Diakritika bude automaticky převedena.</p>
            )}
          </div>

          {/* Odeslat ihned */}
          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
            <input type="checkbox" checked={sendNow} onChange={e => setSendNow(e.target.checked)}
              className="w-4 h-4 accent-teal-600" />
            <span className="text-gray-700">Odeslat ihned</span>
            {!sendNow && <span className="text-xs text-gray-400">(uloží do poznámek)</span>}
          </label>

          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          {sent && <p className="text-sm text-teal-700 bg-teal-50 rounded-lg px-3 py-2">SMS odeslána.</p>}
        </div>

        {/* Akce */}
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100">
          <button onClick={onClose}
            className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
            Zrušit
          </button>
          <button onClick={handleSend} disabled={sending || sent || !text.trim() || !to}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 transition-colors">
            {sending ? <Spinner size={4} /> : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            )}
            Odeslat
          </button>
        </div>
      </div>
    </div>
  )
}
