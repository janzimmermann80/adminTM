import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { getUserSql } from '../db/userSql.js'

interface DiaryQuery {
  owner?: string
  date?: string       // YYYY-MM-DD
  days?: string       // počet dní dopředu (default 10)
}

export async function diaryRoutes(app: FastifyInstance) {

  // GET /api/diary/employees — seznam iniciál pro owner dropdown
  app.get('/employees', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    try {
      const rows = await sql`
        SELECT initials FROM provider.employee_account ORDER BY initials
      `
      return reply.send(rows.map((r: any) => r.initials))
    } finally {
      await sql.end()
    }
  })

  // GET /api/diary — seznam záznamů
  app.get('/', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb, initials, accessRights } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    const q = request.query as DiaryQuery

    // Bit 14 (index od 0) = přístup k cizím záznamům
    const canViewOthers = accessRights ? accessRights[14] === '1' : false
    const owner = canViewOthers ? (q.owner ?? initials) : initials

    const date = q.date ?? new Date().toISOString().slice(0, 10)
    const days = Math.min(Number(q.days ?? 10), 90)

    const dateFrom = new Date(date)
    const dateTo = new Date(date)
    dateTo.setDate(dateTo.getDate() + days)

    try {
      const rows = await sql`
        SELECT D.diary_key, D.owner, D.originator, D.time, D.text,
               D.completed, D.alarm, C.company_key, C.id, C.company
        FROM provider.diary AS D
        JOIN provider.company AS C ON D.company_key = C.company_key
        WHERE D.owner = ${owner}
          AND D.time >= ${dateFrom.toISOString()}
          AND D.time <  ${dateTo.toISOString()}
        ORDER BY D.time ASC
      `
      return reply.send({ owner, date, days, data: rows })
    } finally {
      await sql.end()
    }
  })

  // POST /api/diary — nový záznam
  app.post('/', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb, initials, provider } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    const body = request.body as {
      owner: string
      company_key: number
      time: string
      text: string
    }

    try {
      const [row] = await sql`
        INSERT INTO provider.diary (owner, provider, time, text, alarm, completed, company_key, originator)
        VALUES (${body.owner}, ${provider}, ${body.time}, ${body.text}, '0', '0', ${body.company_key}, ${initials})
        RETURNING diary_key
      `
      return reply.code(201).send(row)
    } finally {
      await sql.end()
    }
  })

  // PUT /api/diary/:id — editace záznamu
  app.put('/:id', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    const { id } = request.params as { id: string }
    const body = request.body as { time?: string; text?: string }

    try {
      await sql`
        UPDATE provider.diary SET
          time = COALESCE(${body.time ?? null}, time),
          text = COALESCE(${body.text ?? null}, text)
        WHERE diary_key = ${id}
      `
      return reply.send({ success: true })
    } finally {
      await sql.end()
    }
  })

  // PATCH /api/diary/:id/complete — přepnutí splněno/nesplněno
  app.patch('/:id/complete', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    const { id } = request.params as { id: string }
    const { completed } = request.body as { completed: boolean }

    try {
      await sql`
        UPDATE provider.diary SET completed = ${completed ? '1' : '0'} WHERE diary_key = ${id}
      `
      return reply.send({ success: true })
    } finally {
      await sql.end()
    }
  })

  // DELETE /api/diary/:id — smazání záznamu
  app.delete('/:id', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    const { id } = request.params as { id: string }

    try {
      await sql`DELETE FROM provider.diary WHERE diary_key = ${id}`
      return reply.send({ success: true })
    } finally {
      await sql.end()
    }
  })
}
