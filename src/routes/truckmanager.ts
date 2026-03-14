import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { getUserSql } from '../db/userSql.js'

export async function truckmanagerRoutes(app: FastifyInstance) {

  // GET /api/truckmanager/messages
  app.get('/messages', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    const q = request.query as { company_key?: string; car_key?: string; unsent?: string; limit?: string }
    const limit = Math.min(Number(q.limit ?? 100), 500)

    let conditions = sql`WHERE IM.direction_to_car = true AND IM.type IN ('D','C')`
    if (q.company_key) conditions = sql`${conditions} AND IM.company_key = ${q.company_key}`
    if (q.car_key)     conditions = sql`${conditions} AND IM.car_key = ${q.car_key}`
    if (q.unsent === '1') conditions = sql`${conditions} AND IM.sent_time IS NULL`

    try {
      const rows = await sql`
        SELECT IM.msg_key, IM.car_key, IM.company_key, IM.type,
               IM.time, IM.push_attempt_time, IM.sent_time, IM.read_by_tm,
               C.company,
               CB.spz, CB.sim_imsi,
               SB.number AS sim_number
        FROM gps.instant_message_base AS IM
        LEFT JOIN provider.company AS C ON IM.company_key = C.company_key
        LEFT JOIN gps.car_base AS CB ON IM.car_key = CB.car_key
        LEFT JOIN gps.simcard_base AS SB ON CB.sim_imsi = SB.imsi
        ${conditions}
        ORDER BY IM.msg_key DESC
        LIMIT ${limit}
      `
      return reply.send(rows)
    } finally {
      await sql.end()
    }
  })

  // GET /api/truckmanager/vehicles - vehicles with SIM phone for SMS sending
  app.get('/vehicles', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    const q = request.query as { company_key?: string; q?: string }

    let companyFilter = sql``
    if (q.company_key) companyFilter = sql`AND CB.company_key = ${q.company_key}`

    let searchFilter = sql``
    if (q.q) {
      const term = `%${q.q}%`
      searchFilter = sql`AND (CB.spz ILIKE ${term} OR CB.make ILIKE ${term} OR C.company ILIKE ${term})`
    }

    try {
      const rows = await sql`
        SELECT CB.car_key, CB.spz, CB.make, CB.company_key, CB.sim_imsi,
               NOT CB.inactive AS active,
               C.company,
               SB.number AS sim_number
        FROM gps.car_base AS CB
        LEFT JOIN provider.company AS C ON CB.company_key = C.company_key
        LEFT JOIN gps.simcard_base AS SB ON CB.sim_imsi = SB.imsi
        WHERE CB.sim_imsi IS NOT NULL AND CB.sim_imsi != ''
          AND SB.number IS NOT NULL AND SB.number != ''
          ${companyFilter}
          ${searchFilter}
        ORDER BY CB.inactive ASC, CB.spz
        LIMIT 200
      `
      return reply.send(rows)
    } finally {
      await sql.end()
    }
  })

  // POST /api/truckmanager/send-sms
  app.post('/send-sms', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb, initials, employeeSchema } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    const body = request.body as { company_key: number; number: string; text: string }

    if (!body.company_key || !body.number || !body.text) {
      return reply.code(400).send({ error: 'Chybí parametry' })
    }

    const phone = body.number.startsWith('+') ? body.number.slice(1) : body.number

    try {
      const [result] = await sql`SELECT public.send_sms(${body.company_key}, ${'+' + phone}, ${body.text}) AS result`

      if (result.result > 0) {
        // Log note to employee diary
        if (employeeSchema) {
          await sql`
            INSERT INTO ${sql(employeeSchema + '.note')} (company_key, creator, type, text)
            VALUES (${body.company_key}, ${initials}, 'O', ${'TMSMS(' + phone + '|' + body.text + ')'})
          `
        }
        return reply.send({ success: true, result: result.result })
      } else {
        return reply.code(500).send({ error: 'Odeslání SMS se nezdařilo' })
      }
    } finally {
      await sql.end()
    }
  })
}
