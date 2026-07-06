import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { getUserSql } from '../db/userSql.js'

export async function workersRoutes(app: FastifyInstance) {

  // GET /api/workers - seznam zaměstnanců
  app.get('/', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb, employeeSchema } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    try {
      const rows = await sql`
        SELECT initials, forename, surname, sex
        FROM ${sql(employeeSchema + '.employee_account')}
        WHERE provider = 'PROVIDER-CZ'
        ORDER BY surname, forename
      `
      return reply.send(rows)
    } finally {
      await sql.end()
    }
  })

  // GET /api/workers/:initials - detail zaměstnance
  app.get('/:initials', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb, employeeSchema } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    const { initials } = request.params as { initials: string }
    try {
      const rows = await sql`
        SELECT initials, forename, surname, sex, username,
               phone, gsm, fax, email, www,
               provider, region, access_date
        FROM ${sql(employeeSchema + '.employee_account')}
        WHERE initials = ${initials}
          AND provider = 'PROVIDER-CZ'
      `
      if (rows.length === 0) return reply.code(404).send({ error: 'Not found' })
      return reply.send(rows[0])
    } finally {
      await sql.end()
    }
  })
}
