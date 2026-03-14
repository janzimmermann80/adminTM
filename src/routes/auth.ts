import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import sql from '../db/index.js'
import { JwtPayload } from '../types/index.js'

export async function authRoutes(app: FastifyInstance) {
  app.post('/login', async (request: FastifyRequest, reply: FastifyReply) => {
    const { username, password } = request.body as { username: string; password: string }

    const rows = await sql`
      SELECT * FROM public.authenticate_employee(${username}, ${password})
    `

    if (rows.length !== 1) {
      return reply.code(401).send({ error: 'Invalid credentials' })
    }

    const row = rows[0]

    // Check access date expiry — DB vrací Date objekt nebo string
    const rawDate = row.access_date
    let expiry: Date | null = null
    if (rawDate instanceof Date) {
      expiry = rawDate
    } else if (typeof rawDate === 'string' && rawDate) {
      // formát DD.MM.YYYY nebo YYYY-MM-DD
      if (rawDate.includes('.')) {
        const [d, m, y] = rawDate.split('.')
        expiry = new Date(Number(y), Number(m) - 1, Number(d))
      } else {
        expiry = new Date(rawDate)
      }
    }
    if (expiry && expiry <= new Date()) {
      return reply.code(401).send({ error: 'Access expired' })
    }

    const payload: JwtPayload = {
      userDb: row.db_user,
      passwordDb: row.db_password,
      initials: row.initials,
      name: `${row.forename} ${row.surname}`.trim(),
      accessRights: row.access_rights ?? '',
      employeeSchema: row.employee_schema ?? '',
      provider: row.provider ?? '',
      region: row.ui_lang ?? '',
    }

    const token = (app as any).jwt.sign(payload, { expiresIn: '12h' })

    return reply.send({
      token,
      user: {
        initials: payload.initials,
        name: payload.name,
        employeeSchema: payload.employeeSchema,
        accessRights: payload.accessRights,
        provider: payload.provider,
        region: payload.region,
      },
    })
  })

  app.post('/logout', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.send({ success: true })
  })

  app.get('/me', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    return reply.send((request as any).user)
  })
}
