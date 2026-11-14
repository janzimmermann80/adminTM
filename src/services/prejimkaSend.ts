import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import type { SendMailOptions } from 'nodemailer'

export const PREJIMKA_RECIPIENTS = {
  prejimky: { prefixes: ['SB', 'SY', 'SS', 'SZ', 'SL', 'SP', 'SM'], label: 'Nezávislá Přejímka', email: 'gps@prejimky.cz' },
  gpsdata: { prefixes: ['LC', 'LD'], label: 'LESS & TIMBER', email: 'prejimky@gpsdata.cz' },
  wood: { prefixes: ['ZA', 'ZB', 'ZD', 'ZM', 'ZS', 'ZJ', 'ZE', 'MA', 'LW'], label: 'WOOD & PAPER', email: 'gps@wood-paper.cz' },
  wamm: { prefixes: ['MM'], label: 'WA-MM', email: 'gps@wa-mm.cz' },
} as const

export type PrejimkaDestination = keyof typeof PREJIMKA_RECIPIENTS

export function createPrejimkaMail(number: number, company: string, companyId: string, destination: PrejimkaDestination, gps1: string, gps2: string): SendMailOptions {
  const suffix = String(number).padStart(4, '0')
  const file1 = `gps1-${suffix}.csv`
  const file2 = `gps2-${suffix}.csv`
  return {
    from: 'info@truckmanager.cz <info@truckmanager.cz>',
    to: PREJIMKA_RECIPIENTS[destination].email,
    subject: `TruckManager - ${file1}/${file2}`,
    text: `Odeslano ${new Date().toLocaleString('cs-CZ', { timeZone: 'Europe/Prague' })} firmou ${company} (${companyId})\n\nSystem TruckManager`,
    attachments: [
      { filename: file1, content: gps1, contentType: 'application/octet-stream' },
      { filename: file2, content: gps2, contentType: 'application/octet-stream' },
    ],
  }
}

let db: Database.Database | undefined

function getDb() {
  if (!db) {
    const file = process.env.PREJIMKA_DB_PATH ?? (process.env.NODE_ENV === 'production'
      ? '/data/prejimka.db'
      : resolve(process.cwd(), 'data', 'prejimka.db'))
    mkdirSync(dirname(file), { recursive: true })
    db = new Database(file)
    db.pragma('journal_mode = WAL')
    db.exec(`CREATE TABLE IF NOT EXISTS sends (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`)
  }
  return db
}

export function reservePrejimkaSend(requestId: string): number | null {
  const store = getDb()
  return store.transaction(() => {
    if (store.prepare('SELECT 1 FROM sends WHERE request_id = ?').get(requestId)) return null
    const last = store.prepare('SELECT MAX(id) AS id FROM sends').get() as { id: number | null }
    if ((last.id ?? 0) >= 9999) throw new Error('Byla vyčerpána řada čísel příloh 0001–9999. Odesílání vyžaduje správu číselné řady.')
    const result = store.prepare("INSERT INTO sends (request_id, status) VALUES (?, 'pending')").run(requestId)
    return Number(result.lastInsertRowid)
  })()
}

export function updatePrejimkaSend(requestId: string, status: 'sent' | 'failed' | 'log_failed') {
  getDb().prepare('UPDATE sends SET status = ? WHERE request_id = ?').run(status, requestId)
}
