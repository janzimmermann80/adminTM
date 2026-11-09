import { getLetterImageContent, type LetterImage, type LetterIllustration } from '../../api'

interface LetterFields {
  address: string
  sender: string
  date: string
  footer: string
  subject: string
  message: string
  signature: string
}

async function embedImage(file: string) {
  if (file.startsWith('/ai-correspondence/letter-images/')) {
    return (await getLetterImageContent(file)).dataUrl
  }
  const response = await fetch(`${import.meta.env.BASE_URL}${file}`)
  if (!response.ok) throw new Error('Obrázek přílohy se nepodařilo načíst: ' + file)
  const blob = await response.blob()
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(blob.type)) {
    throw new Error('Obrázek přílohy nemá podporovaný formát: ' + file)
  }
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string'
      ? resolve(reader.result) : reject(new Error('Obrázek se nepodařilo vložit do HTML.'))
    reader.onerror = () => reject(new Error('Obrázek se nepodařilo přečíst.'))
    reader.readAsDataURL(blob)
  })
}

export async function composeLetter(
  template: string, fields: LetterFields, illustrations: LetterIllustration[], library: LetterImage[],
) {
  if (illustrations.length > 2 || new Set(illustrations.map(image => image.id)).size !== illustrations.length) {
    throw new Error('Vyberte nejvýše dva různé obrázky.')
  }
  const images = await Promise.all(illustrations.map(async illustration => {
    const image = library.find(item => item.id === illustration.id)
    if (!image) throw new Error('Vybraný obrázek již není v knihovně.')
    if (!illustration.caption.trim() || illustration.caption.length > 500) {
      throw new Error('Doplňte popisek každého obrázku (nejvýše 500 znaků).')
    }
    return { ...image, caption: illustration.caption, src: await embedImage(image.file) }
  }))
  const document = new DOMParser().parseFromString(template, 'text/html')
  const setText = (selector: string, text: string) => {
    const element = document.querySelector<HTMLElement>(selector)
    if (!element) throw new Error('Šablona dopisu neobsahuje požadovanou část: ' + selector)
    element.textContent = text
    element.style.whiteSpace = 'pre-wrap'
  }
  setText('.recipient > div', fields.address)
  setText('.sender', fields.sender)
  setText('.meta', fields.date)
  setText('.footer > div', fields.footer)
  const letter = document.querySelector('.letter')
  if (!letter) throw new Error('Šablona dopisu neobsahuje textovou část.')
  letter.replaceChildren()
  const heading = document.createElement('h2')
  heading.textContent = fields.subject
  letter.append(heading)
  for (const paragraph of fields.message.trim().split(/\n\s*\n/)) {
    const p = document.createElement('p')
    p.textContent = paragraph
    p.style.whiteSpace = 'pre-wrap'
    letter.append(p)
  }
  const sign = document.createElement('div')
  sign.className = 'signature'
  sign.textContent = fields.signature
  sign.style.whiteSpace = 'pre-wrap'
  letter.append(sign)
  if (images.length) {
    const appendix = document.createElement('section')
    appendix.className = `illustrations-page ${images.length === 1 ? 'single' : 'double'}`
    appendix.setAttribute('aria-label', 'Obrazová příloha dopisu')
    const content = document.createElement('div')
    content.className = 'illustrations-content'
    const title = document.createElement('h2')
    title.textContent = 'TruckManager v praxi'
    content.append(title)
    for (const image of images) {
      const figure = document.createElement('figure')
      const frame = document.createElement('div')
      frame.className = 'illustration-frame'
      const img = document.createElement('img')
      img.src = image.src
      img.alt = image.name
      frame.append(img)
      const caption = document.createElement('figcaption')
      const name = document.createElement('strong')
      name.textContent = image.name
      const description = document.createElement('div')
      description.textContent = image.caption
      caption.append(name, description)
      figure.append(frame, caption)
      content.append(figure)
    }
    appendix.append(content)
    document.body.append(appendix)
  }
  document.title = `Dopis – ${fields.address.split('\n')[0]}`
  return '<!doctype html>\n' + document.documentElement.outerHTML
}

// Measure before export so a long letter cannot push the illustrations to page 3.
export async function validateLetterPagination(html: string) {
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:1200px;height:1200px;visibility:hidden'
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error('Kontrola rozložení dopisu trvala příliš dlouho.')), 15000)
      frame.onload = () => { window.clearTimeout(timeout); resolve() }
      frame.onerror = () => { window.clearTimeout(timeout); reject(new Error('Rozložení dopisu se nepodařilo načíst.')) }
      frame.srcdoc = html
      document.body.append(frame)
    })
    const content = frame.contentDocument
    if (!content) throw new Error('Rozložení dopisu nelze zkontrolovat.')
    await Promise.all(Array.from(content.images).filter(image => image.getAttribute('src')).map(image => image.decode()))
    const page = content.querySelector<HTMLElement>('.page')
    if (!page) throw new Error('Šablona neobsahuje stránku dopisu.')
    const pixelsPerMm = page.getBoundingClientRect().width / 210
    if (content.querySelector('.illustrations-page') && page.getBoundingClientRect().height > 297 * pixelsPerMm + 1) {
      throw new Error('Text dopisu přesahuje první stranu A4. Zkraťte text nebo podpis, aby obrazová příloha zůstala na druhé straně.')
    }
    for (const section of content.querySelectorAll<HTMLElement>('.illustrations-page, .illustrations-content, .illustrations-page figcaption')) {
      if (section.scrollHeight > section.clientHeight + 1 || section.scrollWidth > section.clientWidth + 1) {
        throw new Error('Obrazová příloha přesahuje stránku. Zkraťte popisky obrázků.')
      }
    }
  } finally {
    frame.remove()
  }
}
