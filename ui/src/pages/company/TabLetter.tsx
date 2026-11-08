import { useEffect, useState } from 'react'
import { getMailContext } from '../../api'
import { AiCorrespondencePanel } from '../../components/AiCorrespondencePanel'
import { Spinner } from '../../components/Spinner'

interface Props { companyKey: string }

export const TabLetter = ({ companyKey }: Props) => {
  const [address, setAddress] = useState('')
  const [signature, setSignature] = useState('')
  const [sender, setSender] = useState('1.Česká obchodní, s.r.o.\nPotoční 340\n592 14 Nové Veselí')
  const [footer, setFooter] = useState('1.Česká obchodní, s.r.o. · IČO: 60743395 · DIČ: CZ60743395')
  const [date, setDate] = useState(new Date().toLocaleDateString('cs-CZ'))
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [template, setTemplate] = useState('')
  const [html, setHtml] = useState('')
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    const load = async () => {
      const [data, templateResponse, logoResponse] = await Promise.all([
        getMailContext(companyKey),
        fetch(`${import.meta.env.BASE_URL}letterhead.html`),
        fetch(`${import.meta.env.BASE_URL}truckmanager-logo.svg`),
      ])
      if (!templateResponse.ok || !logoResponse.ok) throw new Error('Šablonu dopisu nebo logo se nepodařilo načíst.')
      const [source, logo] = await Promise.all([templateResponse.text(), logoResponse.text()])
      const document = new DOMParser().parseFromString(source, 'text/html')
      const image = document.querySelector('.header img')
      if (!image) throw new Error('Šablona dopisu neobsahuje logo.')
      image.setAttribute('src', `data:image/svg+xml;charset=utf-8,${encodeURIComponent(logo)}`)
      if (!active) return
      const ctx = data.context
      setAddress([ctx.company, ctx.street, [ctx.zip, ctx.city].filter(Boolean).join(' '), ctx.country].filter(Boolean).join('\n'))
      setSignature(['S pozdravem', ctx.employee_name, ctx.employee_phone, ctx.employee_gsm, ctx.employee_email].filter(Boolean).join('\n'))
      setTemplate('<!doctype html>\n' + document.documentElement.outerHTML)
    }
    setLoading(true)
    setError('')
    load().catch((e: unknown) => {
      if (active) setError(e instanceof Error ? e.message : 'Podklady dopisu se nepodařilo načíst.')
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [companyKey])

  const prepare = () => {
    if (!template || !address.trim() || !subject.trim() || !message.trim() || !signature.trim()) {
      setError('Doplňte adresu, předmět, text dopisu a podpis.')
      return ''
    }
    const document = new DOMParser().parseFromString(template, 'text/html')
    const setText = (selector: string, text: string) => {
      const element = document.querySelector<HTMLElement>(selector)
      if (!element) throw new Error('Šablona dopisu neobsahuje požadovanou část: ' + selector)
      element.textContent = text
      element.style.whiteSpace = 'pre-wrap'
    }
    try {
      setText('.recipient > div', address)
      setText('.sender', sender)
      setText('.meta', date)
      setText('.footer > div', footer)
      const letter = document.querySelector('.letter')
      if (!letter) throw new Error('Šablona dopisu neobsahuje textovou část.')
      letter.replaceChildren()
      const heading = document.createElement('h2')
      heading.textContent = subject
      letter.append(heading)
      for (const paragraph of message.trim().split(/\n\s*\n/)) {
        const p = document.createElement('p')
        p.textContent = paragraph
        p.style.whiteSpace = 'pre-wrap'
        letter.append(p)
      }
      const sign = document.createElement('div')
      sign.className = 'signature'
      sign.textContent = signature
      sign.style.whiteSpace = 'pre-wrap'
      letter.append(sign)
      document.title = `Dopis – ${address.split('\n')[0]}`
      setError('')
      return '<!doctype html>\n' + document.documentElement.outerHTML
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Dopis se nepodařilo sestavit.')
      return ''
    }
  }

  const preview = () => { const content = prepare(); if (content) setHtml(content) }
  const download = () => {
    const content = prepare()
    if (!content) return
    const url = URL.createObjectURL(new Blob([content], { type: 'text/html;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `dopis-${companyKey}.html`
    anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  if (loading) return <div className="flex justify-center py-8"><Spinner size={6} /></div>

  const inputClass = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm'
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">AI vytvoří pouze obsah dopisu. Adresa a podpis se doplní do hlavičkového papíru. Nic se neodesílá ani nezapisuje jako uskutečněná korespondence. Návrh uložte do HTML; při zavření detailu se neuložené úpravy ztratí.</p>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {template && <AiCorrespondencePanel
        companyKey={companyKey}
        channel="letter"
        recipient={address}
        onGeneratingChange={setGenerating}
        onDraft={draft => { setSubject(draft.subject ?? ''); setMessage(draft.message); setHtml('') }}
      />}
      <div className="grid md:grid-cols-2 gap-4">
        <label className="text-sm">Adresa příjemce<textarea className={inputClass} rows={5} value={address} onChange={e => setAddress(e.target.value)} /></label>
        <label className="text-sm">Odesílatel<textarea className={inputClass} rows={5} value={sender} onChange={e => setSender(e.target.value)} /></label>
      </div>
      <label className="block text-sm">Místo a datum<input className={inputClass} value={date} onChange={e => setDate(e.target.value)} /></label>
      <label className="block text-sm">Předmět dopisu<input className={inputClass} value={subject} onChange={e => setSubject(e.target.value)} /></label>
      <label className="block text-sm">Text dopisu<textarea className={inputClass} rows={12} value={message} onChange={e => setMessage(e.target.value)} /></label>
      <div className="grid md:grid-cols-2 gap-4">
        <label className="text-sm">Podpis<textarea className={inputClass} rows={5} value={signature} onChange={e => setSignature(e.target.value)} /></label>
        <label className="text-sm">Patička<textarea className={inputClass} rows={5} value={footer} onChange={e => setFooter(e.target.value)} /></label>
      </div>
      <div className="flex gap-3">
        <button type="button" disabled={generating || !template} onClick={preview} className="px-4 py-2 rounded-lg bg-teal-700 text-white disabled:opacity-50">Náhled dopisu</button>
        <button type="button" disabled={generating || !template} onClick={download} className="px-4 py-2 rounded-lg border border-gray-300 disabled:opacity-50">Stáhnout HTML</button>
      </div>
      {html && (
        <div>
          <p className="text-xs text-gray-500 mb-2">Náhled odpovídá poslednímu sestavení. Po úpravě textu klikněte znovu na Náhled dopisu. Kliknutím na logo v náhledu otevřete tisk / PDF. Tiskněte A4 na 100 % bez záhlaví a zápatí prohlížeče; před tiskem zkontrolujte počet stran.</p>
          <iframe title="Náhled dopisu" srcDoc={html} className="w-full border border-gray-200 rounded-lg h-[1150px]" />
        </div>
      )}
    </div>
  )
}
