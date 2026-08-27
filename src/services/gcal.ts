// Google Calendar API — OAuth2 + CRUD událostí (bez googleapis balíčku, čisté REST)
// Tokeny a mapování v JSON souboru (bez DB migrace) — pro jednoho uživatele (JZ).
import fs from 'node:fs'
import path from 'node:path'

const CLIENT_ID = process.env.GCAL_CLIENT_ID ?? ''
const CLIENT_SECRET = process.env.GCAL_CLIENT_SECRET ?? ''
const REDIRECT_URI = process.env.GCAL_REDIRECT_URI ?? 'http://localhost:3001/api/gcal/callback'
const SCOPE = 'https://www.googleapis.com/auth/calendar'

// Soubor s tokenem + mapováním diary_key -> google_event_id
const STORE_PATH = process.env.GCAL_STORE_PATH ?? path.resolve(process.cwd(), 'gcal_store.json')

interface Store {
  refresh_token?: string
  access_token?: string
  expiry?: number
  map?: Record<string, string>  // diary_key -> google_event_id
}

function loadStore(): Store {
  try { return JSON.parse(fs.readFileSync(STORE_PATH, 'utf8')) } catch { return {} }
}
function saveStore(s: Store) {
  try { fs.writeFileSync(STORE_PATH, JSON.stringify(s, null, 2)) } catch {}
}

export function gcalAuthUrl(owner: string) {
  const p = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    state: owner,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`
}

async function tokenRequest(body: Record<string, string>) {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  })
  if (!r.ok) throw new Error('Google token error: ' + (await r.text()))
  return r.json() as Promise<{ access_token: string; refresh_token?: string; expires_in: number }>
}

// vymění authorization code za tokeny a uloží refresh_token do souboru
export async function gcalExchangeCode(code: string) {
  const t = await tokenRequest({
    code, client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
    redirect_uri: REDIRECT_URI, grant_type: 'authorization_code',
  })
  if (!t.refresh_token) throw new Error('Google nevrátil refresh_token (zkus propojení zrušit a znovu povolit)')
  const s = loadStore()
  s.refresh_token = t.refresh_token
  s.access_token = t.access_token
  s.expiry = Date.now() + t.expires_in * 1000
  saveStore(s)
}

export function gcalIsConnected() {
  return !!loadStore().refresh_token
}

export function gcalDisconnect() {
  const s = loadStore()
  delete s.refresh_token; delete s.access_token; delete s.expiry
  saveStore(s)
}

// platný access_token (případně refresh)
async function gcalAccessToken(): Promise<string | null> {
  const s = loadStore()
  if (!s.refresh_token) return null
  if (s.access_token && s.expiry && s.expiry > Date.now() + 60000) return s.access_token
  const t = await tokenRequest({
    refresh_token: s.refresh_token, client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
    grant_type: 'refresh_token',
  })
  s.access_token = t.access_token
  s.expiry = Date.now() + t.expires_in * 1000
  saveStore(s)
  return t.access_token
}

async function gcalFetch(method: string, pathPart: string, body?: any) {
  const token = await gcalAccessToken()
  if (!token) return null  // není propojeno — tiše přeskočit
  const calId = encodeURIComponent(process.env.GCAL_CALENDAR_ID ?? 'primary')
  const r = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calId}${pathPart}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (r.status === 204) return {}
  if (r.status === 404 || r.status === 410) return null  // událost už neexistuje
  if (!r.ok) throw new Error(`Google Calendar ${method} ${pathPart}: ${await r.text()}`)
  return r.json()
}

function toEvent(d: { time: string; text: string; company?: string }) {
  const start = new Date(d.time)
  const end = new Date(start.getTime() + 30 * 60000)
  const iso = (x: Date) => x.toISOString()
  return {
    summary: (d.company ? `${d.company} — ` : '') + (d.text ?? '').slice(0, 200),
    description: d.text ?? '',
    start: { dateTime: iso(start), timeZone: 'Europe/Prague' },
    end: { dateTime: iso(end), timeZone: 'Europe/Prague' },
  }
}

// mapování diary_key -> google_event_id (v souboru)
export function gcalGetEventId(diaryKey: string | number) {
  return loadStore().map?.[String(diaryKey)] ?? null
}
function gcalSetEventId(diaryKey: string | number, eventId: string | null) {
  const s = loadStore()
  if (!s.map) s.map = {}
  if (eventId) s.map[String(diaryKey)] = eventId
  else delete s.map[String(diaryKey)]
  saveStore(s)
}

export async function gcalCreateFor(diaryKey: string | number, d: { time: string; text: string; company?: string }) {
  const ev = await gcalFetch('POST', '/events', toEvent(d))
  if (ev?.id) gcalSetEventId(diaryKey, ev.id)
  return ev?.id ?? null
}
export async function gcalUpdateFor(diaryKey: string | number, d: { time: string; text: string; company?: string }) {
  const evId = gcalGetEventId(diaryKey)
  if (!evId) return
  await gcalFetch('PUT', `/events/${encodeURIComponent(evId)}`, toEvent(d))
}
export async function gcalDeleteFor(diaryKey: string | number) {
  const evId = gcalGetEventId(diaryKey)
  if (!evId) return
  await gcalFetch('DELETE', `/events/${encodeURIComponent(evId)}`)
  gcalSetEventId(diaryKey, null)
}

// načte události v rozsahu (pro zobrazení Google událostí v deníku)
export async function gcalList(timeMin: string, timeMax: string) {
  const p = new URLSearchParams({ timeMin, timeMax, singleEvents: 'true', orderBy: 'startTime' })
  const res = await gcalFetch('GET', `/events?${p}`)
  return res?.items ?? []
}
