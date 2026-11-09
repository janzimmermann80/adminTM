export const LETTER_IMAGES = [{
  id: 'tabule-dispecera',
  name: 'Tabule dispečera',
  file: 'letter-images/tabule-dispecera.png',
  description: 'Přehled plánování dopravy: mapa tras, vytížení vozidel na dispečerské plachtě, vyhledávání dokládek a podklady pro řidiče.',
}]

export interface LetterIllustration {
  id: string
  caption: string
}

export function isLetterIllustrations(value: unknown): value is LetterIllustration[] {
  return Array.isArray(value) && value.length <= 2
    && value.every(item => item && typeof item === 'object'
      && typeof item.id === 'string' && LETTER_IMAGES.some(image => image.id === item.id)
      && typeof item.caption === 'string' && item.caption.trim().length > 0 && item.caption.length <= 500)
    && new Set(value.map(item => item.id)).size === value.length
}
