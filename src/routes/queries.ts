import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { getUserSql } from '../db/userSql.js'
import { readFileSync, appendFileSync } from 'node:fs'

// Seznam trvale vyřazených (nechtených) firem — IČO, jedno na řádek.
// Firmy s IČO v tomto souboru se nezobrazují v "TA adresáři".
const DISABLED_CINS_FILE = process.env.DISABLED_CINS_FILE ?? '/services/admin-www/others/disabled_cins.txt'
function getDisabledCins(): string[] {
  try {
    return readFileSync(DISABLED_CINS_FILE, 'utf-8').split('\n').map((s) => s.trim()).filter(Boolean)
  } catch {
    return []
  }
}

// ── ČNB kurz USD → CZK (denní kurz, cache na 1 hodinu) ───────────────────────
let usdRateCache: { rate: number; ts: number } | null = null
const USD_RATE_FALLBACK = 23

async function getUsdRate(): Promise<number> {
  if (usdRateCache && Date.now() - usdRateCache.ts < 3600_000) return usdRateCache.rate
  try {
    const res = await fetch(
      'https://www.cnb.cz/cs/financni-trhy/devizovy-trh/kurzy-devizoveho-trhu/kurzy-devizoveho-trhu/denni_kurz.txt',
    )
    if (!res.ok) throw new Error('CNB HTTP ' + res.status)
    const txt = await res.text()
    // Řádek formátu: USA|dolar|1|USD|22,345
    const line = txt.split('\n').find((l) => l.includes('|USD|'))
    if (!line) throw new Error('USD not found')
    const parts = line.trim().split('|')
    const amount = Number(parts[2].replace(',', '.')) || 1
    const rate = Number(parts[4].replace(',', '.')) / amount
    if (!rate || !isFinite(rate)) throw new Error('bad rate')
    usdRateCache = { rate, ts: Date.now() }
    return rate
  } catch {
    return usdRateCache?.rate ?? USD_RATE_FALLBACK
  }
}

// ── ORSR (SK) best-effort lookup ─────────────────────────────────────────────
type OrsrResult = { name: string | null; address: string | null; court: string | null; section: string | null }

async function fetchDecoded(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
  const buf = await res.arrayBuffer()
  return new TextDecoder('windows-1250').decode(buf)
}

function stripTags(s: string): string {
  return s
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

async function orsrLookup(cin: string): Promise<OrsrResult> {
  const empty: OrsrResult = { name: null, address: null, court: null, section: null }
  try {
    const searchHtml = await fetchDecoded(
      `https://www.orsr.sk/hladaj_ico.asp?ICO=${encodeURIComponent(cin)}&SID=0`,
    )
    const linkMatch = searchHtml.match(/vypis\.asp\?ID=\d+&SID=\d+&P=\d+/i)
    if (!linkMatch) return empty
    const detailHtml = await fetchDecoded(`https://www.orsr.sk/${linkMatch[0]}`)

    const grab = (label: string): string | null => {
      const re = new RegExp(label + '[\\s\\S]*?<td[^>]*>([\\s\\S]*?)</td>', 'i')
      const m = detailHtml.match(re)
      return m ? stripTags(m[1]) || null : null
    }

    return {
      name: grab('Obchodné meno'),
      address: grab('Sídlo'),
      court: grab('Oddiel') ? null : grab('Súd'),
      section: grab('Oddiel'),
    }
  } catch {
    return empty
  }
}

export async function queriesRoutes(app: FastifyInstance) {
  // GET /api/queries/reports-schedule
  app.get('/reports-schedule', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const { company_key, type, one_time, limit, offset } = request.query as {
      company_key?: string; type?: string; one_time?: string; limit?: string; offset?: string
    }
    const oneTimeBool = one_time == null || one_time === '' ? null : one_time === 'true'
    const lim = Math.min(Number(limit) || 100, 500)
    const off = Number(offset) || 0
    const sql = getUserSql(userDb, passwordDb)
    try {
      const rows = await sql`
        SELECT schedule_id, company_key, btrim(type) AS type, title, emails,
               schedule_day, schedule_month, schedule_weekday,
               created_time, generated_time, generation_duration, generation_error,
               period_from::text AS period_from, period_to::text AS period_to,
               one_time, updated_time, generation_started, drv_keys, script_input
        FROM provider.reports_schedule
        WHERE (${company_key ?? null}::bigint IS NULL OR company_key = ${company_key ?? null}::bigint)
          AND (${type ?? null}::text IS NULL OR btrim(type) = btrim(${type ?? null}::text))
          AND (${oneTimeBool}::boolean IS NULL OR coalesce(one_time, false) = ${oneTimeBool})
        ORDER BY created_time DESC NULLS LAST
        LIMIT ${lim} OFFSET ${off}
      `
      return reply.send(rows)
    } finally {
      await sql.end()
    }
  })

  // GET /api/queries/ai-prompt
  app.get('/ai-prompt', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const { company_key, type, limit } = request.query as {
      company_key?: string; type?: string; limit?: string
    }
    const lim = Math.min(Number(limit) || 200, 500)
    const sql = getUserSql(userDb, passwordDb)
    try {
      const rows = await sql`
        SELECT prompt_id, company_key, tin, company_name, type, prompt, updated_time
        FROM ta.ai_prompt
        WHERE (${company_key ?? null}::bigint IS NULL OR company_key = ${company_key ?? null}::bigint)
          AND (${type ?? null}::text IS NULL OR btrim(type) = btrim(${type ?? null}::text))
        ORDER BY updated_time DESC NULLS LAST
        LIMIT ${lim}
      `
      return reply.send(rows)
    } finally {
      await sql.end()
    }
  })

  // GET /api/queries/address-book-no-company
  app.get('/address-book-no-company', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    try {
      const disabledCins = getDisabledCins()
      const rows = await sql`
        SELECT D.book_key, D.company_key, D.company, D.street, D.city, D.zip, D.country, D.cin
        FROM (
          SELECT Y.*, X.company AS company_our
          FROM (
            SELECT
              max(book_key)     AS book_key,
              max(company_key)  AS company_key,
              max(company)      AS company,
              max(street)       AS street,
              max(city)         AS city,
              max(zip)          AS zip,
              max(country)      AS country,
              regexp_replace(cin, E'^[\\r\\n\\t ]*|[\\r\\n\\t ]*$', '', 'g') AS cin
            FROM ta.address_book_base
            WHERE country IN ('CZ', 'SK')
              AND regexp_replace(cin, E'^[\\r\\n\\t ]*|[\\r\\n\\t ]*$', '', 'g') ~ '^[0-9]{8}$'
            GROUP BY cin
          ) AS Y
          LEFT JOIN (
            SELECT company, cin AS cin_our
            FROM provider.company
          ) AS X ON trim(Y.cin) = trim(X.cin_our)
        ) AS D
        WHERE D.company_our IS NULL
          ${disabledCins.length > 0 ? sql`AND NOT (D.cin = ANY(${disabledCins}))` : sql``}
        ORDER BY D.cin
      `
      return reply.send(rows)
    } finally {
      await sql.end()
    }
  })

  // GET /api/queries/tariffs
  app.get('/tariffs', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    try {
      const rows = await sql`
        SELECT tariff, name FROM provider.tariff ORDER BY tariff
      `
      return reply.send(rows)
    } finally {
      await sql.end()
    }
  })

  // GET /api/queries/orsr-lookup/:cin
  app.get('/orsr-lookup/:cin', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { cin } = request.params as { cin: string }
    const result = await orsrLookup(cin)
    return reply.send(result)
  })

  // GET /api/queries/api-requests-by-company
  app.get('/api-requests-by-company', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const { days } = request.query as { days?: string }
    const d = Math.min(Math.max(Number(days) || 30, 1), 365)
    const sql = getUserSql(userDb, passwordDb)
    try {
      const rows = await sql`
        SELECT E.company_key, C.company,
          count(*) FILTER (WHERE E.type = 'autocomplete')::int AS autocomplete,
          sum(E.price) FILTER (WHERE E.type = 'autocomplete')::numeric AS autocomplete_usd,
          count(*) FILTER (WHERE E.type = 'autocomplete-latest')::int AS autocomplete_latest,
          sum(E.price) FILTER (WHERE E.type = 'autocomplete-latest')::numeric AS autocomplete_latest_usd,
          count(*) FILTER (WHERE E.type = 'directions')::int AS directions,
          sum(E.price) FILTER (WHERE E.type = 'directions')::numeric AS directions_usd,
          count(*) FILTER (WHERE E.type = 'geocoding')::int AS geocoding,
          sum(E.price) FILTER (WHERE E.type = 'geocoding')::numeric AS geocoding_usd,
          count(*) FILTER (WHERE E.type = 'here-route-cost')::int AS here_route_cost,
          sum(E.price) FILTER (WHERE E.type = 'here-route-cost')::numeric AS here_route_cost_usd,
          count(*) FILTER (WHERE E.type = 'maps-javascript')::int AS maps_javascript,
          sum(E.price) FILTER (WHERE E.type = 'maps-javascript')::numeric AS maps_javascript_usd,
          count(*) FILTER (WHERE E.type = 'openai-pdf')::int AS openai_pdf,
          sum(E.price) FILTER (WHERE E.type = 'openai-pdf')::numeric AS openai_pdf_usd,
          count(*) FILTER (WHERE E.type = 'place-details')::int AS place_details,
          sum(E.price) FILTER (WHERE E.type = 'place-details')::numeric AS place_details_usd,
          count(*) FILTER (WHERE E.type = 'tollguru-route-cost')::int AS tollguru_route_cost,
          sum(E.price) FILTER (WHERE E.type = 'tollguru-route-cost')::numeric AS tollguru_route_cost_usd,
          count(*)::int AS occurrence_count,
          sum(E.price)::numeric AS total_usd
        FROM provider.external_api_requests AS E
        LEFT JOIN provider.company AS C ON C.company_key = E.company_key
        WHERE E.created_time >= CURRENT_DATE - (${d} || ' days')::interval
        GROUP BY E.company_key, C.company
        ORDER BY total_usd DESC NULLS LAST
        LIMIT 300
      `
      const rate = await getUsdRate()
      const czk = (v: any) => Math.round((Number(v) || 0) * rate * 100) / 100
      const usdRounded = Math.round(rate * 100) / 100
      const result = rows.map((r: any) => ({
        company_key: r.company_key,
        company: r.company,
        autocomplete: r.autocomplete,
        autocomplete_czk: czk(r.autocomplete_usd),
        autocomplete_latest: r.autocomplete_latest,
        autocomplete_latest_czk: czk(r.autocomplete_latest_usd),
        directions: r.directions,
        directions_czk: czk(r.directions_usd),
        geocoding: r.geocoding,
        geocoding_czk: czk(r.geocoding_usd),
        here_route_cost: r.here_route_cost,
        here_route_cost_czk: czk(r.here_route_cost_usd),
        maps_javascript: r.maps_javascript,
        maps_javascript_czk: czk(r.maps_javascript_usd),
        openai_pdf: r.openai_pdf,
        openai_pdf_czk: czk(r.openai_pdf_usd),
        place_details: r.place_details,
        place_details_czk: czk(r.place_details_usd),
        tollguru_route_cost: r.tollguru_route_cost,
        tollguru_route_cost_czk: czk(r.tollguru_route_cost_usd),
        occurrence_count: r.occurrence_count,
        total_czk: czk(r.total_usd),
        usd_rate: usdRounded,
      }))
      return reply.send(result)
    } finally {
      await sql.end()
    }
  })

  // POST /api/queries/address-book-import — vytvoří firmu z adresáře
  app.post('/address-book-import', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = (request as any).user
    const { userDb, passwordDb, provider } = user
    const body = request.body as {
      company: string; street: string; city: string; zip: string
      country: string; cin: string; region: string; tariff: string
    }
    const sql = getUserSql(userDb, passwordDb)
    try {
      if (body.cin && body.cin.trim()) {
        const existing = await sql`
          SELECT company_key, id, company FROM provider.company WHERE cin = ${body.cin}
        `
        if (existing.length > 0) {
          return reply.code(409).send({ error: 'Firma s tímto IČO již existuje', existing: existing[0] })
        }
      }
      const now = new Date().toLocaleDateString('cs-CZ')
      const [newCompany] = await sql`
        INSERT INTO provider.company (provider, company, city, country, cin, tin, last_modif, street, zip, region, tariff)
        VALUES (${provider}, ${body.company}, ${body.city ?? ''}, ${body.country ?? ''},
                ${body.cin ?? ''}, '', ${now}, ${body.street ?? ''},
                ${body.zip ?? ''}, ${body.region ?? '00'}, ${body.tariff ?? '51'})
        RETURNING company_key, id
      `
      await sql`INSERT INTO provider.company_detail (company_key) VALUES (${newCompany.company_key})`
      return reply.code(201).send({ company_key: newCompany.company_key })
    } finally {
      await sql.end()
    }
  })

  // POST /api/queries/address-book-ban — přidá IČO do seznamu trvale vyřazených firem
  app.post('/address-book-ban', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as {
      company: string; street: string; city: string; zip: string; country: string; cin: string
    }
    const cin = (body.cin ?? '').trim()
    if (!cin) {
      return reply.code(400).send({ error: 'Chybí IČO' })
    }
    try {
      appendFileSync(DISABLED_CINS_FILE, cin + '\n')
    } catch (e: any) {
      return reply.code(500).send({ error: 'Nelze zapsat do seznamu vyřazených firem: ' + (e?.message ?? e) })
    }
    return reply.send({ ok: true })
  })
}
