import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { getUserSql } from '../db/userSql.js'

export async function campaignsRoutes(app: FastifyInstance) {

  // GET /api/campaigns - list all campaigns
  app.get('/', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    try {
      const rows = await sql`
        SELECT campaign_id, name, type, number, language,
               start_date, stop_date, sending_interval, subject,
               LEFT(content, 100) AS content_preview
        FROM marketing.campaign
        ORDER BY name, type, language, number
      `
      return reply.send(rows)
    } finally {
      await sql.end()
    }
  })

  // GET /api/campaigns/:id - campaign detail
  app.get('/:id', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    const { id } = request.params as { id: string }
    try {
      const [row] = await sql`SELECT * FROM marketing.campaign WHERE campaign_id = ${id}`
      if (!row) return reply.code(404).send({ error: 'Not found' })
      return reply.send(row)
    } finally {
      await sql.end()
    }
  })

  // POST /api/campaigns - create campaign
  app.post('/', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    const body = request.body as {
      name: string; type: string; number: number; language: string
      sending_interval?: number; start_date?: string; stop_date?: string
      subject?: string; content?: string
    }
    try {
      const [row] = await sql`
        INSERT INTO marketing.campaign (name, type, number, language, sending_interval, start_date, stop_date, subject, content)
        VALUES (${body.name}, ${body.type}, ${body.number}, ${body.language},
                ${body.sending_interval ?? null}, ${body.start_date ?? null}, ${body.stop_date ?? null},
                ${body.subject ?? null}, ${body.content ?? ''})
        RETURNING campaign_id
      `
      return reply.code(201).send(row)
    } finally {
      await sql.end()
    }
  })

  // PUT /api/campaigns/:id - update campaign
  app.put('/:id', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    const { id } = request.params as { id: string }
    const body = request.body as {
      name?: string; type?: string; number?: number; language?: string
      sending_interval?: number | null; start_date?: string | null; stop_date?: string | null
      subject?: string | null; content?: string
    }
    try {
      await sql`
        UPDATE marketing.campaign SET
          name             = COALESCE(${body.name ?? null}, name),
          type             = COALESCE(${body.type ?? null}, type),
          number           = COALESCE(${body.number ?? null}, number),
          language         = COALESCE(${body.language ?? null}, language),
          sending_interval = COALESCE(${body.sending_interval ?? null}, sending_interval),
          start_date       = ${body.start_date !== undefined ? body.start_date : sql`start_date`},
          stop_date        = ${body.stop_date !== undefined ? body.stop_date : sql`stop_date`},
          subject          = ${body.subject !== undefined ? body.subject : sql`subject`},
          content          = COALESCE(${body.content ?? null}, content)
        WHERE campaign_id = ${id}
      `
      return reply.send({ success: true })
    } finally {
      await sql.end()
    }
  })

  // DELETE /api/campaigns/:id
  app.delete('/:id', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    const { id } = request.params as { id: string }
    try {
      await sql`DELETE FROM marketing.campaign WHERE campaign_id = ${id}`
      return reply.send({ success: true })
    } finally {
      await sql.end()
    }
  })

  // GET /api/campaigns/subscribers - list subscribers
  app.get('/subscribers', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    const q = request.query as { q?: string; type?: string; company_key?: string; unsubscribed?: string; limit?: string; offset?: string }
    const limit = Math.min(Number(q.limit ?? 50), 200)
    const offset = Number(q.offset ?? 0)

    let cond = sql`WHERE 1=1`
    if (q.q) cond = sql`${cond} AND (SUB.contact ILIKE ${'%' + q.q + '%'} OR C.company ILIKE ${'%' + q.q + '%'})`
    if (q.type) cond = sql`${cond} AND SUB.type = ${q.type}`
    if (q.company_key) cond = sql`${cond} AND SUB.company_key = ${q.company_key}`
    if (q.unsubscribed === '1') cond = sql`${cond} AND SUB.unsubscribed_date IS NOT NULL`
    if (q.unsubscribed === '0') cond = sql`${cond} AND SUB.unsubscribed_date IS NULL`

    try {
      const [{ count }] = await sql`
        SELECT count(*)::int AS count
        FROM marketing.subscriber AS SUB
        LEFT JOIN provider.company AS C ON SUB.company_key = C.company_key
        ${cond}
      `
      const rows = await sql`
        SELECT SUB.subscriber_id, SUB.contact, SUB.type, SUB.company_key,
               SUB.person_key, SUB.unsubscribed_date, SUB.note,
               C.company, C.id AS company_id,
               CP.name AS person_name
        FROM marketing.subscriber AS SUB
        LEFT JOIN provider.company AS C ON SUB.company_key = C.company_key
        LEFT JOIN provider.contact_person AS CP ON SUB.person_key = CP.person_key
        ${cond}
        ORDER BY SUB.subscriber_id DESC
        LIMIT ${limit} OFFSET ${offset}
      `
      return reply.send({ total: count, limit, offset, data: rows })
    } finally {
      await sql.end()
    }
  })

  // DELETE /api/campaigns/subscribers/:id - unsubscribe (set date)
  app.delete('/subscribers/:id', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    const { id } = request.params as { id: string }
    try {
      await sql`UPDATE marketing.subscriber SET unsubscribed_date = NOW() WHERE subscriber_id = ${id}`
      return reply.send({ success: true })
    } finally {
      await sql.end()
    }
  })

  // GET /api/campaigns/stats - stats per campaign (sent count, clicks, unsubscribes)
  app.get('/stats', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    const q = request.query as { date_from?: string; date_to?: string }

    let dateCond = sql`WHERE 1=1`
    if (q.date_from) dateCond = sql`${dateCond} AND S.sent_date >= ${q.date_from + ' 00:00:00'}`
    if (q.date_to)   dateCond = sql`${dateCond} AND S.sent_date <= ${q.date_to + ' 23:59:59'}`

    try {
      const rows = await sql`
        SELECT C.campaign_id, C.name, C.type, C.number, C.language, C.subject,
               COUNT(S.msg_id)::int AS sent_count,
               COUNT(S.msg_id) FILTER (WHERE S.click_dates IS NOT NULL)::int AS click_count
        FROM marketing.campaign AS C
        LEFT JOIN marketing.sent AS S ON S.campaign_id = C.campaign_id
        ${dateCond}
        GROUP BY C.campaign_id, C.name, C.type, C.number, C.language, C.subject
        ORDER BY C.name, C.type, C.language, C.number
      `

      // Unsubscribe count per campaign (by matching sent subscriber_ids)
      const unsubRows = await sql`
        SELECT S.campaign_id, COUNT(*)::int AS unsub_count
        FROM marketing.sent AS S
        JOIN marketing.subscriber AS SUB ON S.subscriber_id = SUB.subscriber_id
        WHERE SUB.unsubscribed_date IS NOT NULL
        ${q.date_from ? sql`AND S.sent_date >= ${q.date_from + ' 00:00:00'}` : sql``}
        ${q.date_to ? sql`AND S.sent_date <= ${q.date_to + ' 23:59:59'}` : sql``}
        GROUP BY S.campaign_id
      `
      const unsubMap: Record<number, number> = {}
      unsubRows.forEach((r: any) => { unsubMap[r.campaign_id] = r.unsub_count })

      const result = rows.map((r: any) => ({
        ...r,
        unsub_count: unsubMap[r.campaign_id] ?? 0,
        click_rate: r.sent_count > 0 ? Math.round((r.click_count / r.sent_count) * 100) : 0,
      }))

      return reply.send(result)
    } finally {
      await sql.end()
    }
  })
}
