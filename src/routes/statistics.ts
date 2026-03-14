import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { getUserSql } from '../db/userSql.js'

export async function statisticsRoutes(app: FastifyInstance) {

  // GET /api/statistics/overview — souhrnný přehled
  app.get('/overview', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    try {
      const [companies, contracts, invoices, claims, diary, vehicles] = await Promise.all([
        // Počet firem per tariff
        sql`
          SELECT T.name AS tariff_name, T.tariff, count(C.company_key)::int AS count
          FROM provider.tariff AS T
          LEFT JOIN provider.company AS C ON C.tariff = T.tariff
          GROUP BY T.tariff, T.name
          ORDER BY count DESC
          LIMIT 15
        `,
        // Nové smlouvy tento měsíc
        sql`
          SELECT count(*)::int AS count
          FROM provider.company_detail
          WHERE contract_date >= date_trunc('month', CURRENT_DATE)
        `,
        // Fakturace tento rok
        sql`
          SELECT count(*)::int AS count, sum(total)::numeric AS total_sum
          FROM provider.invoice
          WHERE year = EXTRACT(YEAR FROM CURRENT_DATE)::int
            AND cancellation IS NULL
        `,
        // Pohledávky (nezaplacené po splatnosti)
        sql`
          SELECT count(*)::int AS count, sum(total)::numeric AS total_sum
          FROM provider.invoice
          WHERE settlement IS NULL AND cancellation IS NULL
            AND maturity < CURRENT_DATE
        `,
        // Záznamy deníku dnes
        sql`
          SELECT count(*)::int AS count
          FROM provider.diary
          WHERE time::date = CURRENT_DATE
        `,
        // Aktivní vozidla s TM
        sql`
          SELECT count(*)::int AS count
          FROM gps.car_base
          WHERE active = true
        `.catch(() => [{ count: 0 }]),
      ])
      return reply.send({
        companies_by_tariff: companies,
        new_contracts_this_month: contracts[0]?.count ?? 0,
        invoices_this_year: invoices[0] ?? { count: 0, total_sum: 0 },
        overdue_claims: claims[0] ?? { count: 0, total_sum: 0 },
        diary_today: diary[0]?.count ?? 0,
        active_vehicles: vehicles[0]?.count ?? 0,
      })
    } finally {
      await sql.end()
    }
  })

  // GET /api/statistics/invoices-monthly — tržby per měsíc (rok)
  app.get('/invoices-monthly', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    const { year } = request.query as { year?: string }
    const y = Number(year ?? new Date().getFullYear())
    try {
      const rows = await sql`
        SELECT
          EXTRACT(MONTH FROM fulfilment)::int AS month,
          count(*)::int AS count,
          sum(total)::numeric AS total,
          sum(CASE WHEN settlement IS NOT NULL THEN total ELSE 0 END)::numeric AS paid
        FROM provider.invoice
        WHERE year = ${y} AND cancellation IS NULL
        GROUP BY EXTRACT(MONTH FROM fulfilment)
        ORDER BY month
      `
      // Doplnit prázdné měsíce
      const byMonth: Record<number, any> = {}
      for (const r of rows) byMonth[r.month] = r
      const result = Array.from({ length: 12 }, (_, i) => ({
        month: i + 1,
        count: byMonth[i + 1]?.count ?? 0,
        total: Number(byMonth[i + 1]?.total ?? 0),
        paid: Number(byMonth[i + 1]?.paid ?? 0),
      }))
      return reply.send(result)
    } finally {
      await sql.end()
    }
  })

  // GET /api/statistics/contracts-monthly — nové smlouvy per měsíc
  app.get('/contracts-monthly', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    const { year } = request.query as { year?: string }
    const y = Number(year ?? new Date().getFullYear())
    try {
      const rows = await sql`
        SELECT
          EXTRACT(MONTH FROM contract_date)::int AS month,
          count(*)::int AS count
        FROM provider.company_detail
        WHERE EXTRACT(YEAR FROM contract_date) = ${y}
          AND contract_date IS NOT NULL
        GROUP BY EXTRACT(MONTH FROM contract_date)
        ORDER BY month
      `
      const byMonth: Record<number, number> = {}
      for (const r of rows) byMonth[r.month] = r.count
      const result = Array.from({ length: 12 }, (_, i) => ({
        month: i + 1,
        count: byMonth[i + 1] ?? 0,
      }))
      return reply.send(result)
    } finally {
      await sql.end()
    }
  })

  // GET /api/statistics/claims — pohledávky stáří
  app.get('/claims', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    try {
      const rows = await sql`
        SELECT
          CASE
            WHEN maturity >= CURRENT_DATE THEN 'current'
            WHEN maturity >= CURRENT_DATE - INTERVAL '30 days' THEN '0-30'
            WHEN maturity >= CURRENT_DATE - INTERVAL '60 days' THEN '31-60'
            WHEN maturity >= CURRENT_DATE - INTERVAL '90 days' THEN '61-90'
            ELSE '90+'
          END AS bucket,
          count(*)::int AS count,
          sum(total)::numeric AS total
        FROM provider.invoice
        WHERE settlement IS NULL AND cancellation IS NULL
        GROUP BY bucket
        ORDER BY bucket
      `
      return reply.send(rows)
    } finally {
      await sql.end()
    }
  })

  // GET /api/statistics/diary-by-owner — záznamy deníku per zaměstnanec (posledních 30 dní)
  app.get('/diary-by-owner', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    try {
      const rows = await sql`
        SELECT owner, count(*)::int AS total,
          sum(CASE WHEN completed = '1' THEN 1 ELSE 0 END)::int AS done,
          sum(CASE WHEN completed = '0' THEN 1 ELSE 0 END)::int AS pending
        FROM provider.diary
        WHERE time >= CURRENT_DATE - INTERVAL '30 days'
        GROUP BY owner
        ORDER BY total DESC
      `
      return reply.send(rows)
    } finally {
      await sql.end()
    }
  })

  // GET /api/statistics/tariff-distribution — rozložení tarifů
  app.get('/tariff-distribution', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    try {
      const rows = await sql`
        SELECT T.tariff, T.name, count(C.company_key)::int AS count
        FROM provider.tariff AS T
        JOIN provider.company AS C ON C.tariff = T.tariff
        GROUP BY T.tariff, T.name
        HAVING count(C.company_key) > 0
        ORDER BY count DESC
      `
      return reply.send(rows)
    } finally {
      await sql.end()
    }
  })
}
