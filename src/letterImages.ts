import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

export interface LetterImage {
  id: string
  name: string
  file: string
  description: string
}

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

export function isLetterIllustrations(value: unknown, library: LetterImage[] = LETTER_IMAGES): value is LetterIllustration[] {
  return Array.isArray(value) && value.length <= 2
    && value.every(item => item && typeof item === 'object'
      && typeof item.id === 'string' && library.some(image => image.id === item.id)
      && typeof item.caption === 'string' && item.caption.trim().length > 0 && item.caption.length <= 500)
    && new Set(value.map(item => item.id)).size === value.length
}

function imagesDirectory() {
  return process.env.LETTER_IMAGES_DIR
    ? resolve(process.env.LETTER_IMAGES_DIR)
    : process.env.NODE_ENV === 'production' ? '/data/letter-images' : resolve('data', 'letter-images')
}

interface StoredImage extends LetterImage {
  dataUrl: string
}

function imageFile(id: string) {
  if (!/^[a-z0-9-]{1,100}$/.test(id)) throw new Error('Invalid letter image ID')
  return join(imagesDirectory(), `${id}.json`)
}

async function readStoredImage(id: string): Promise<StoredImage> {
  const image: StoredImage = JSON.parse(await readFile(imageFile(id), 'utf8'))
  if (image.id !== id || typeof image.name !== 'string' || typeof image.description !== 'string'
    || typeof image.dataUrl !== 'string' || !image.dataUrl.startsWith('data:image/')) {
    throw new Error('Invalid stored letter image')
  }
  return { ...image, file: contentPath(id, image.dataUrl) }
}

function contentPath(id: string, dataUrl: string) {
  const version = createHash('sha256').update(dataUrl).digest('hex').slice(0, 16)
  return `/ai-correspondence/letter-images/${id}/content?v=${version}`
}

export async function listLetterImages(): Promise<LetterImage[]> {
  let files: string[]
  try {
    files = await readdir(imagesDirectory())
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return [...LETTER_IMAGES]
    throw error
  }
  const images = new Map<string, LetterImage>(LETTER_IMAGES.map(image => [image.id, image]))
  for (const file of files.filter(file => file.endsWith('.json')).sort()) {
    const { dataUrl, ...image } = await readStoredImage(file.slice(0, -5))
    images.set(image.id, image)
  }
  return [...images.values()]
}

export async function getLetterImageData(id: string) {
  try {
    return (await readStoredImage(id)).dataUrl
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined
    throw error
  }
}

export function parseLetterImageUpload(value: unknown) {
  if (!value || typeof value !== 'object') return undefined
  const { filename, description, dataUrl } = value as Record<string, unknown>
  if (typeof filename !== 'string' || !filename.trim() || filename.length > 150
    || /[\\/\x00-\x1f]/.test(filename) || !/\.(png|jpe?g|webp)$/i.test(filename)
    || typeof description !== 'string' || !description.trim() || description.length > 1000
    || typeof dataUrl !== 'string') return undefined
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl)
  if (!match) return undefined
  const data = Buffer.from(match[2], 'base64')
  if (data.length > 5 * 1024 * 1024 || data.toString('base64') !== match[2]) return undefined
  const format = match[1]
  if (!(format === 'png' && data.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
    || format === 'jpeg' && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff
    || format === 'webp' && data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP')) return undefined
  const extension = filename.split('.').pop()!.toLowerCase().replace('jpg', 'jpeg')
  if (extension !== format) return undefined
  const name = filename.trim().replace(/\.(png|jpe?g|webp)$/i, '').trim().normalize('NFC')
  if (!name) return undefined
  return { name, description: description.trim(), dataUrl }
}

export async function saveLetterImage(upload: NonNullable<ReturnType<typeof parseLetterImageUpload>>) {
  const key = upload.name.normalize('NFC').toLocaleLowerCase('cs')
  const seed = LETTER_IMAGES.find(image => image.name.toLocaleLowerCase('cs') === key)
  const id = seed?.id ?? `image-${createHash('sha256').update(key).digest('hex')}`
  const images = await listLetterImages()
  const replaced = images.some(image => image.id === id)
  if (!replaced && images.length >= 100) {
    throw Object.assign(new Error('Knihovna může obsahovat nejvýše 100 obrázků.'), { statusCode: 409 })
  }
  const image: LetterImage = {
    id, name: upload.name, description: upload.description,
    file: contentPath(id, upload.dataUrl),
  }
  await mkdir(imagesDirectory(), { recursive: true })
  const temporary = join(imagesDirectory(), `${id}-${randomUUID()}.tmp`)
  try {
    await writeFile(temporary, JSON.stringify({ ...image, dataUrl: upload.dataUrl }), { flag: 'wx' })
    await rename(temporary, imageFile(id))
  } finally {
    await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error })
  }
  return { image, replaced }
}
