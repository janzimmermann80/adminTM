import assert from 'node:assert/strict'
import { test } from 'node:test'
import { LETTER_IMAGES, isLetterIllustrations } from './letterImages.js'

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
