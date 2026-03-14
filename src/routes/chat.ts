import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import Anthropic from '@anthropic-ai/sdk'
import { getUserSql } from '../db/userSql.js'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

// ─── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Jsi asistent pro správu zákaznické databáze firmy 1. Česká obchodní / euro-sped.cz.
Pracuješ s daty firem, které jsou zákazníky nebo obchodními partnery.
Odpovídáš stručně a věcně v češtině. Používáš markdown pro formátování odpovědí.
Časy a data zobrazuj ve formátu DD.MM.YYYY.

Databáze obsahuje:
- Firmy (company): název, město, stát, IČO, DIČ, tarif, region
- Tarify: truckmanager, notm, tmsim12, tmsimInv, exte, allnostop, free, trial...
- Kontaktní osoby a kontakty (telefony, e-maily)
- Faktury: číslo, série, datum vystavení, splatnost, částka
- Deník: záznamy aktivit ke každé firmě
- Spediční nabídky: trasy T (nákladní) a C (celní), data, tonáže
- Vozidla a řidiči (TruckManager)

Při hledání firmy nejprve zavolej search_companies. Pro detailní info použij get_company.
Pokud uživatel mluví o konkrétní firmě (zmiňuje název, ID nebo kontext), vždy ji nejprve vyhledej.`

// ─── Tool definitions ─────────────────────────────────────────────────────────

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'search_companies',
    description: 'Hledá firmy v databázi. Použij pro nalezení firmy nebo seznam firem dle kritérií.',
    input_schema: {
      type: 'object' as const,
      properties: {
        q: { type: 'string', description: 'Hledaný výraz (název, IČO, město, e-mail...)' },
        field: {
          type: 'string',
          enum: ['company', 'id', 'cin', 'city', 'email', 'phone', 'name'],
          description: 'Pole pro hledání (default: company)'
        },
        tariff: { type: 'string', description: 'Filtr tarifu (např. truckmanager, notm, free)' },
        country: { type: 'string', description: 'Kód státu (CZ, SK, PL, DE...)' },
        limit: { type: 'number', description: 'Max počet výsledků, default 10, max 50' },
      },
      required: [],
    },
  },
  {
    name: 'get_company',
    description: 'Načte kompletní detail firmy: základní data, kontakty, kontaktní osoby, aktivní služby.',
    input_schema: {
      type: 'object' as const,
      properties: {
        company_key: { type: 'string', description: 'Klíč firmy (číslo, např. "12345")' },
      },
      required: ['company_key'],
    },
  },
  {
    name: 'get_company_invoices',
    description: 'Načte faktury firmy. Umí filtrovat nezaplacené nebo přeplacené.',
    input_schema: {
      type: 'object' as const,
      properties: {
        company_key: { type: 'string', description: 'Klíč firmy' },
        settled: { type: 'string', enum: ['yes', 'no'], description: 'yes = uhrazené, no = neuhrazené' },
        limit: { type: 'number', description: 'Max počet faktur, default 10' },
      },
      required: ['company_key'],
    },
  },
  {
    name: 'get_company_diary',
    description: 'Načte záznamy z deníku firmy (aktivity, poznámky, úkoly).',
    input_schema: {
      type: 'object' as const,
      properties: {
        company_key: { type: 'string', description: 'Klíč firmy' },
        limit: { type: 'number', description: 'Max počet záznamů, default 20' },
      },
      required: ['company_key'],
    },
  },
  {
    name: 'get_company_offers',
    description: 'Načte spediční nabídky (trasy) firmy.',
    input_schema: {
      type: 'object' as const,
      properties: {
        company_key: { type: 'string', description: 'Klíč firmy' },
      },
      required: ['company_key'],
    },
  },
  {
    name: 'get_company_vehicles',
    description: 'Načte vozidla a řidiče firmy z TruckManageru.',
    input_schema: {
      type: 'object' as const,
      properties: {
        company_key: { type: 'string', description: 'Klíč firmy' },
      },
      required: ['company_key'],
    },
  },
  {
    name: 'search_diary_global',
    description: 'Fulltextové vyhledávání v deníku napříč všemi firmami.',
    input_schema: {
      type: 'object' as const,
      properties: {
        q: { type: 'string', description: 'Hledaný text v záznamu' },
        owner: { type: 'string', description: 'Iniciály vlastníka záznamu (volitelné)' },
        limit: { type: 'number', description: 'Max počet výsledků, default 20' },
      },
      required: ['q'],
    },
  },
]

// ─── Tool status texts ────────────────────────────────────────────────────────

function toolStatusText(name: string): string {
  const map: Record<string, string> = {
    search_companies: 'Hledám firmy v databázi...',
    get_company: 'Načítám detail firmy...',
    get_company_invoices: 'Načítám faktury...',
    get_company_diary: 'Načítám deník...',
    get_company_offers: 'Načítám spediční nabídky...',
    get_company_vehicles: 'Načítám vozidla a řidiče...',
    search_diary_global: 'Prohledávám deník...',
  }
  return map[name] ?? `Volám ${name}...`
}

// ─── Tool executors ───────────────────────────────────────────────────────────

async function executeTool(name: string, input: Record<string, unknown>, sql: ReturnType<typeof getUserSql>): Promise<unknown> {
  try {
    switch (name) {

      case 'search_companies': {
        const { q, field = 'company', tariff, country, limit = 10 } = input as {
          q?: string; field?: string; tariff?: string; country?: string; limit?: number
        }
        const lim = Math.min(Number(limit), 50)
        let conditions = sql`WHERE 1=1`
        if (q) {
          const term = `%${q}%`
          if (field === 'id') conditions = sql`WHERE C.id ILIKE ${term}`
          else if (field === 'company') conditions = sql`WHERE C.company ILIKE ${term}`
          else if (field === 'cin') conditions = sql`WHERE C.cin ILIKE ${term}`
          else if (field === 'city') conditions = sql`WHERE C.city ILIKE ${term}`
          else if (field === 'email') conditions = sql`WHERE C.company_key IN (SELECT company_key FROM provider.contact WHERE type='E' AND value ILIKE ${term})`
          else if (field === 'phone') conditions = sql`WHERE C.company_key IN (SELECT company_key FROM provider.contact WHERE type IN ('T','G') AND value ILIKE ${term})`
          else if (field === 'name') conditions = sql`WHERE C.company_key IN (SELECT company_key FROM provider.contact_person WHERE name ILIKE ${term})`
        }
        if (tariff) conditions = sql`${conditions} AND C.tariff = ${tariff}`
        if (country) conditions = sql`${conditions} AND C.country = ${country}`

        const [{ count }] = await sql`SELECT count(*)::int AS count FROM provider.company AS C ${conditions}`
        const rows = await sql`
          SELECT C.company_key, C.id, C.company, C.city, C.country, C.tariff, C.cin, C.last_modif,
                 T.name AS tariff_name
          FROM provider.company AS C
          LEFT JOIN provider.tariff AS T ON C.tariff = T.tariff
          ${conditions}
          ORDER BY C.company
          LIMIT ${lim}
        `
        return { total: count, data: rows }
      }

      case 'get_company': {
        const { company_key } = input as { company_key: string }
        const [company] = await sql`
          SELECT C.company_key, C.id, C.company, C.street, C.city, C.zip, C.country,
                 C.cin, C.tin, C.bank, C.account, C.branch, C.tariff, C.region,
                 C.last_modif, T.name AS tariff_name,
                 CD.contract, CD.contract_date, CD.prog_sent, CD.prog_sent_date,
                 CD.prog_lent, CD.prog_lent_date, CD.admittance, CD.admittance_date,
                 CD.forwarding, CD.forwarding_date, CD.car_pool, CD.car_pool_date,
                 CD.credit_tip_sms, CD.advert_discount
          FROM provider.company AS C
          LEFT JOIN provider.tariff AS T ON C.tariff = T.tariff
          LEFT JOIN provider.company_detail AS CD ON C.company_key = CD.company_key
          WHERE C.company_key = ${company_key}
        `
        if (!company) return { error: 'Firma nenalezena' }

        const persons = await sql`
          SELECT P.name, P.sex, P.languages, P.send_offers,
                 array_agg(json_build_object('type', CT.type, 'value', CT.value) ORDER BY CT.importance) FILTER (WHERE CT.contact_key IS NOT NULL) AS contacts
          FROM provider.contact_person AS P
          LEFT JOIN provider.contact AS CT ON P.company_key = CT.company_key AND P.importance = CT.importance
          WHERE P.company_key = ${company_key}
          GROUP BY P.person_key, P.name, P.sex, P.languages, P.send_offers, P.importance
          ORDER BY P.importance
        `
        const contacts = await sql`
          SELECT type, value FROM provider.contact
          WHERE company_key = ${company_key} AND importance = 0
          ORDER BY type
        `
        return { company, persons, contacts }
      }

      case 'get_company_invoices': {
        const { company_key, settled, limit = 10 } = input as {
          company_key: string; settled?: string; limit?: number
        }
        const lim = Math.min(Number(limit), 50)
        let cond = sql`WHERE I.company_key = ${company_key}`
        if (settled === 'no') cond = sql`${cond} AND I.settlement IS NULL AND I.cancellation IS NULL`
        if (settled === 'yes') cond = sql`${cond} AND I.settlement IS NOT NULL`

        const [{ count }] = await sql`SELECT count(*)::int AS count FROM provider.invoice AS I ${cond}`
        const rows = await sql`
          SELECT invoice_key, year, number, series, issued, maturity, settlement,
                 cancellation, curr_total, currency, demand_notes
          FROM provider.invoice AS I
          ${cond}
          ORDER BY I.fulfilment DESC
          LIMIT ${lim}
        `
        return { total: count, data: rows }
      }

      case 'get_company_diary': {
        const { company_key, limit = 20 } = input as { company_key: string; limit?: number }
        const lim = Math.min(Number(limit), 100)
        const rows = await sql`
          SELECT D.diary_key, D.owner, D.originator, D.time, D.text, D.completed
          FROM provider.diary AS D
          WHERE D.company_key = ${company_key}
          ORDER BY D.time DESC
          LIMIT ${lim}
        `
        return { data: rows }
      }

      case 'get_company_offers': {
        const { company_key } = input as { company_key: string }
        const rows = await sql`
          SELECT S.sped_key, S.type, S.from_key, S.to_key,
                 S.date_from, S.date_to, S.tonnage, S.volume,
                 S.sped_type, S.note, S.price, S.last_modif,
                 FC.name AS from_name, FC.country AS from_country,
                 TC.name AS to_name, TC.country AS to_country,
                 CP.name AS contact_name
          FROM users.spedition_base AS S
          LEFT JOIN map.city AS FC ON S.from_key = FC.city_key
          LEFT JOIN map.city AS TC ON S.to_key = TC.city_key
          LEFT JOIN provider.contact_person AS CP ON S.person_key = CP.person_key
          WHERE S.company_key = ${company_key}
          ORDER BY S.last_modif DESC
        `
        return { data: rows }
      }

      case 'get_company_vehicles': {
        const { company_key } = input as { company_key: string }
        const vehicles = await sql`
          SELECT car_key, spz, make, NOT inactive AS active, production_year,
                 tonnage, capacity, axles, euro_emission
          FROM gps.car_base
          WHERE company_key = ${company_key}
          ORDER BY inactive ASC, spz
        `
        const drivers = await sql`
          SELECT driver_key, name, phone, adr, active, wage_km, wage_hourly, currency
          FROM gps.driver_base
          WHERE company_key = ${company_key}
          ORDER BY active DESC, name
        `
        return { vehicles, drivers }
      }

      case 'search_diary_global': {
        const { q, owner, limit = 20 } = input as { q: string; owner?: string; limit?: number }
        const lim = Math.min(Number(limit), 100)
        const term = `%${q}%`
        let cond = sql`WHERE D.text ILIKE ${term}`
        if (owner) cond = sql`${cond} AND D.owner = ${owner}`

        const rows = await sql`
          SELECT D.diary_key, D.owner, D.time, D.text, D.completed,
                 C.company_key, C.id, C.company
          FROM provider.diary AS D
          JOIN provider.company AS C ON D.company_key = C.company_key
          ${cond}
          ORDER BY D.time DESC
          LIMIT ${lim}
        `
        return { data: rows }
      }

      default:
        return { error: `Neznámý nástroj: ${name}` }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { error: `Chyba při volání ${name}: ${msg}` }
  }
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function chatRoutes(app: FastifyInstance) {

  // POST /api/chat — SSE stream
  app.post('/', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {

    if (!process.env.ANTHROPIC_API_KEY) {
      return reply.code(503).send({ error: 'ANTHROPIC_API_KEY není nastaven na serveru.' })
    }

    const { userDb, passwordDb } = (request as any).user
    const body = request.body as {
      messages: Array<{ role: 'user' | 'assistant'; content: string }>
      company_key?: string
    }

    // SSE headers
    reply.raw.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
    reply.raw.setHeader('Cache-Control', 'no-cache')
    reply.raw.setHeader('Connection', 'keep-alive')
    reply.raw.setHeader('X-Accel-Buffering', 'no')
    reply.raw.flushHeaders()

    const send = (data: object) => {
      reply.raw.write(`data: ${JSON.stringify(data)}\n\n`)
    }

    const sql = getUserSql(userDb, passwordDb)

    try {
      // Build context-aware system prompt
      let systemPrompt = SYSTEM_PROMPT
      if (body.company_key) {
        systemPrompt += `\n\nAktuálně prohlížená firma má company_key=${body.company_key}. Pokud uživatel mluví o "této firmě" nebo "té firmě", myslí tuto.`
      }

      const messages: Anthropic.MessageParam[] = body.messages.map(m => ({
        role: m.role,
        content: m.content,
      }))

      // Agentic loop — max 5 rounds
      for (let round = 0; round < 5; round++) {
        const toolCalls: Array<{ id: string; name: string; inputStr: string }> = []
        let currentTool: { id: string; name: string; inputStr: string } | null = null
        let hasToolUse = false

        const stream = anthropic.messages.stream({
          model: 'claude-sonnet-4-6',
          max_tokens: 4096,
          system: systemPrompt,
          tools: TOOLS,
          messages,
        })

        for await (const event of stream) {
          if (event.type === 'content_block_start') {
            if (event.content_block.type === 'tool_use') {
              hasToolUse = true
              currentTool = { id: event.content_block.id, name: event.content_block.name, inputStr: '' }
              send({ type: 'status', text: toolStatusText(event.content_block.name) })
            }
          } else if (event.type === 'content_block_delta') {
            if (event.delta.type === 'text_delta') {
              send({ type: 'chunk', text: event.delta.text })
            } else if (event.delta.type === 'input_json_delta' && currentTool) {
              currentTool.inputStr += event.delta.partial_json
            }
          } else if (event.type === 'content_block_stop') {
            if (currentTool) {
              toolCalls.push(currentTool)
              currentTool = null
            }
          }
        }

        const finalMsg = await stream.finalMessage()

        if (!hasToolUse || finalMsg.stop_reason !== 'tool_use') {
          // Done
          break
        }

        // Execute tools in parallel
        const toolResults = await Promise.all(
          toolCalls.map(async (tc) => {
            let inputObj: Record<string, unknown> = {}
            try { inputObj = JSON.parse(tc.inputStr) } catch { /* empty input */ }
            const result = await executeTool(tc.name, inputObj, sql)
            send({ type: 'tool_result', tool: tc.name, count: Array.isArray((result as any)?.data) ? (result as any).data.length : undefined })
            return {
              type: 'tool_result' as const,
              tool_use_id: tc.id,
              content: JSON.stringify(result),
            }
          })
        )

        messages.push({ role: 'assistant', content: finalMsg.content })
        messages.push({ role: 'user', content: toolResults })
      }

      send({ type: 'done' })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      send({ type: 'error', text: msg })
    } finally {
      await sql.end()
      reply.raw.end()
    }
  })
}
