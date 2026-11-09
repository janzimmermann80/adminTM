import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LETTER_IMAGES, getLetterImageData, isLetterIllustrations, listLetterImages, parseLetterImageUpload, saveLetterImage } from './letterImages.js'

const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aRZkAAAAASUVORK5CYII='

test('accepts no illustrations and a known image with a caption', () => {
  assert.equal(isLetterIllustrations([]), true)
  assert.equal(isLetterIllustrations([{ id: LETTER_IMAGES[0].id, caption: 'Přehled plánování dopravy.' }]), true)
})

test('rejects unknown images, duplicate IDs and more than two images', () => {
  assert.equal(isLetterIllustrations([{ id: '../unknown.png', caption: 'Test' }]), false)
  const image = { id: LETTER_IMAGES[0].id, caption: 'Test' }
  assert.equal(isLetterIllustrations([image, image]), false)
  assert.equal(isLetterIllustrations([image, image, image]), false)
})

test('rejects missing, empty and oversized captions and malformed values', () => {
  for (const value of [undefined, null, {}, [null], ['image'], [{ id: LETTER_IMAGES[0].id }],
    [{ id: LETTER_IMAGES[0].id, caption: '   ' }], [{ id: LETTER_IMAGES[0].id, caption: 'x'.repeat(501) }]]) {
    assert.equal(isLetterIllustrations(value), false)
  }
})

test('validates upload filenames, file signatures, formats and size', () => {
  const valid = { filename: 'Tabule dispečera.png', description: 'Popis funkce', dataUrl: png }
  assert.ok(parseLetterImageUpload(valid))
  for (const patch of [
    { filename: '../test.png' }, { filename: 'C:\\test.png' }, { filename: '.png' },
    { filename: 'test.svg' }, { filename: 'test.jpg' }, { description: '' },
    { description: 'x'.repeat(1001) }, { dataUrl: 'data:image/png;base64,SGVsbG8=' },
    { dataUrl: 'data:image/svg+xml;base64,PHN2Zz4=' },
    { dataUrl: `data:image/png;base64,${Buffer.alloc(5 * 1024 * 1024 + 1).toString('base64')}` },
  ]) {
    assert.equal(parseLetterImageUpload({ ...valid, ...patch }), undefined)
  }
})

test('persists new images, updates identical names and preserves stable selection IDs', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'admintm-letter-images-'))
  const previous = process.env.LETTER_IMAGES_DIR
  process.env.LETTER_IMAGES_DIR = directory
  try {
    assert.deepEqual(await listLetterImages(), LETTER_IMAGES)
    const upload = parseLetterImageUpload({ filename: 'Nová funkce.png', description: 'Původní popis', dataUrl: png })
    assert.ok(upload)
    const first = await saveLetterImage(upload)
    assert.equal(first.replaced, false)
    assert.equal(await getLetterImageData(first.image.id), png)
    const changedPng = `data:image/png;base64,${Buffer.concat([Buffer.from(png.split(',')[1], 'base64'), Buffer.from([0])]).toString('base64')}`
    const updated = await saveLetterImage({ ...upload, name: 'NOVÁ FUNKCE', description: 'Aktualizovaný popis', dataUrl: changedPng })
    assert.equal(updated.replaced, true)
    assert.equal(updated.image.id, first.image.id)
    assert.notEqual(updated.image.file, first.image.file)
    assert.equal(await getLetterImageData(first.image.id), changedPng)
    const images = await listLetterImages()
    assert.equal(images.length, 2)
    assert.equal(images.find(image => image.id === first.image.id)?.description, 'Aktualizovaný popis')
    assert.equal('dataUrl' in images[1], false)
    assert.equal(isLetterIllustrations([{ id: first.image.id, caption: 'Ukázka' }], images), true)
    const override = await saveLetterImage({ ...upload, name: 'Tabule dispečera' })
    assert.equal(override.image.id, LETTER_IMAGES[0].id)
    assert.equal(override.replaced, true)
    assert.equal((await listLetterImages()).length, 2)
    assert.equal(await getLetterImageData('nonexistent'), undefined)
    assert.deepEqual((await readdir(directory)).filter(file => file.endsWith('.tmp')), [])
    await assert.rejects(() => getLetterImageData('../escape'))
  } finally {
    if (previous === undefined) delete process.env.LETTER_IMAGES_DIR
    else process.env.LETTER_IMAGES_DIR = previous
    await rm(directory, { recursive: true })
  }
})
