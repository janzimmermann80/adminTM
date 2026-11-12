import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createPrejimkaCsv } from './prejimkaCsv.js'

test('creates both CSVs with all loading, unloading and route points', () => {
  const csv = createPrejimkaCsv('MM123', [
    { type: 'L', time: '2026-11-05 08:15', position: '(49.5,14.25)', spz: '1A23456' },
    { type: 'U', time: '2026-11-05 10:30', position: null, spz: '1A23456' },
  ], [
    { time: '2026-11-05 08:16', position: '(49.5,14.25)' },
    { time: '2026-11-05 09:00', position: '(49.6,14.3)' },
    { time: '2026-11-05 10:29', position: '(49.7,14.4)' },
  ], 123.5)
  assert.equal(csv.gps1, 'MM123;MM123;1A23456;2026-11-05 08:15;N49.5,E14.25;2026-11-05 10:30;123.5')
  assert.equal(csv.gps2, 'H;MM123;MM123\r\nN49.5,E14.25;2026-11-05 08:16\r\nN49.6,E14.3;2026-11-05 09:00\r\nN49.7,E14.4;2026-11-05 10:29')
})

test('rejects missing GPS positions instead of producing invalid data', () => {
  assert.throws(() => createPrejimkaCsv('MM123', [{ type: 'L', time: '2026-11-05 08:15', position: null, spz: null }], [], 0), /GPS/)
  assert.throws(() => createPrejimkaCsv('MM123', [], [], 0), /servisní/)
})
