import { useEffect, useState } from 'react'
import { getLetterImageContent, type LetterImage } from '../api'

export function LetterImagePreview({ image }: { image: LetterImage }) {
  const [src, setSrc] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    setSrc('')
    setError('')
    if (image.file.startsWith('/ai-correspondence/letter-images/')) {
      getLetterImageContent(image.file).then(data => { if (active) setSrc(data.dataUrl) })
        .catch(error => { if (active) setError(error instanceof Error ? error.message : 'Obrázek se nepodařilo načíst.') })
    } else {
      setSrc(`${import.meta.env.BASE_URL}${image.file}`)
    }
    return () => { active = false }
  }, [image.file])
  return <div>
    {src && <img src={src} alt={image.name} className="w-full max-h-48 object-contain border border-gray-200"
      onError={() => setError('Obrázek se nepodařilo zobrazit.')} />}
    {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
  </div>
}
