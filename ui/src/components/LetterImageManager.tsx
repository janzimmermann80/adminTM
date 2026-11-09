import { useEffect, useState } from 'react'
import { getLetterImages, uploadLetterImage, type LetterImage } from '../api'

interface Props {
  onChange?: (images: LetterImage[]) => void
}

export function LetterImageManager({ onChange }: Props) {
  const [images, setImages] = useState<LetterImage[]>([])
  const [file, setFile] = useState<File | null>(null)
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [inputKey, setInputKey] = useState(0)

  useEffect(() => {
    let active = true
    getLetterImages().then(data => { if (active) setImages(data) })
      .catch(error => { if (active) setError(error instanceof Error ? error.message : 'Knihovnu obrázků se nepodařilo načíst.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const save = async () => {
    if (!file || !description.trim()) {
      setError('Vyberte soubor a doplňte popis funkce pro AI.')
      return
    }
    if (file.size > 5 * 1024 * 1024 || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setError('Vyberte PNG, JPEG nebo WebP do 5 MB.')
      return
    }
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Soubor nelze přečíst.'))
        reader.onerror = () => reject(new Error('Soubor nelze přečíst.'))
        reader.readAsDataURL(file)
      })
      const image = new Image()
      image.src = dataUrl
      await image.decode()
      const result = await uploadLetterImage(file.name, description, dataUrl)
      const updated = await getLetterImages()
      setImages(updated)
      onChange?.(updated)
      setNotice(`${result.replaced ? 'Aktualizováno' : 'Přidáno'}: ${result.image.name}. Pro aktualizaci náhledu dopisu jej znovu sestavte.`)
      setFile(null)
      setInputKey(key => key + 1)
      setDescription('')
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Obrázek se nepodařilo uložit.')
    } finally {
      setBusy(false)
    }
  }

  return <section className="border-t border-violet-200 pt-3 space-y-3">
    <h4 className="text-sm font-semibold text-violet-900">Grafické soubory pro dopisy</h4>
    <p className="text-xs text-violet-800">Společná knihovna pro všechny AI typy dopisů. Název souboru bez přípony určuje funkci. Stejný název (bez ohledu na velikost písmen nebo příponu) aktualizuje obrázek i popis. Soubory se ukládají ihned na server, nezávisle na tlačítku Uložit AI typy.</p>
    {loading ? <p className="text-xs">Načítám knihovnu…</p> : <ul className="text-xs text-violet-900 space-y-1">
      {images.map(image => <li key={image.id}><strong>{image.name}</strong> — {image.description}</li>)}
    </ul>}
    <fieldset disabled={busy || loading} className="space-y-2">
      <label className="block text-xs text-violet-900">Přidat / aktualizovat obrázek
        <input key={inputKey} type="file" accept="image/png,image/jpeg,image/webp" className="block w-full mt-1"
          onChange={event => {
            const selected = event.target.files?.[0] ?? null
            setFile(selected)
            setNotice('')
            setError('')
            const name = selected?.name.replace(/\.(png|jpe?g|webp)$/i, '').trim().normalize('NFC')
            const existing = images.find(image => image.name.toLocaleLowerCase('cs') === name?.toLocaleLowerCase('cs'))
            setDescription(existing?.description ?? name ?? '')
          }} />
      </label>
      <label className="block text-xs text-violet-900">Popis funkce pro AI
        <textarea value={description} maxLength={1000} rows={3}
          onChange={event => setDescription(event.target.value)}
          className="w-full border border-violet-200 rounded-lg px-3 py-2 text-sm bg-white" />
      </label>
      <button type="button" onClick={save} disabled={!file || !description.trim()}
        className="px-3 py-2 text-xs font-medium bg-violet-600 text-white rounded-lg disabled:opacity-50">
        {busy ? 'Ukládám obrázek…' : 'Nahrát / aktualizovat obrázek'}
      </button>
    </fieldset>
    {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
    {notice && <p role="status" className="text-xs text-green-800">{notice}</p>}
  </section>
}
