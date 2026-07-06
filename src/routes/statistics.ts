import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { getUserSql } from '../db/userSql.js'

// Doplní chybějící měsíce tak, aby výsledek pokrýval posledních 36 měsíců
// (od nejstaršího po nejnovější). Řádky z DB se mapují podle klíče 'YYYY-MM'.
function fill36Months<T extends Record<string, any>>(
  rows: T[],
  extra: (month: string) => T,
): T[] {
  const byMonth = new Map<string, T>()
  for (const r of rows) byMonth.set(r.month, r)
  const now = new Date()
  const result: T[] = []
  for (let i = 35; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
    const month = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
    result.push(byMonth.get(month) ?? extra(month))
  }
  return result
}

export async function statisticsRoutes(app: FastifyInstance) {

  // GET /api/statistics/overview — souhrnný přehled
  app.get('/overview', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    try {
      const [companies, activeCompanies, contracts, invoices, claims, diary, vehicles, overdueByRegion, expiredCompanies, expiredVehicles] = await Promise.all([
        // Počet firem per tariff
        sql`
          SELECT T.name AS tariff_name, T.tariff, count(C.company_key)::int AS count
          FROM provider.tariff AS T
          LEFT JOIN provider.company AS C ON C.tariff = T.tariff
          GROUP BY T.tariff, T.name
          ORDER BY count DESC
          LIMIT 15
        `,
        // Aktivní firmy s platným přístupem (admittance_date v budoucnu)
        sql`
          SELECT count(*)::int AS count
          FROM provider.company_detail
          WHERE admittance_date >= CURRENT_DATE
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
          SELECT count(*)::int AS count, count(DISTINCT company_key)::int AS company_count,
                 sum(total)::numeric AS total_sum
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
        // Vozidla TM s pozicí (poslední upload) za posledních 7 dní
        sql`
          SELECT count(DISTINCT car_key)::int AS count
          FROM gps.last_upload_log
          WHERE time >= CURRENT_DATE - INTERVAL '7 days'
        `.catch(() => [{ count: 0 }]),
        // Pohledávky po splatnosti dle oblasti
        sql`
          SELECT C.region AS region, count(*)::int AS count, sum(I.total)::numeric AS total_sum
          FROM provider.invoice AS I
          JOIN provider.company AS C ON C.company_key = I.company_key
          WHERE I.settlement IS NULL AND I.cancellation IS NULL
            AND I.maturity < CURRENT_DATE
          GROUP BY C.region
          ORDER BY total_sum DESC
        `,
        // Firmy s propadlým přístupem, ale stále aktivním GPS importem (7 dní)
        sql`
          SELECT count(DISTINCT S.company_key)::int AS count
          FROM gps.import_service AS S
          JOIN provider.company_detail AS CD ON CD.company_key = S.company_key
          WHERE CD.admittance_date < CURRENT_DATE
            AND S.last_import_time >= CURRENT_DATE - INTERVAL '7 days'
        `.catch(() => [{ count: 0 }]),
        // Počet vozidel těchto firem (aktivní GPS import za 7 dní)
        sql`
          SELECT count(DISTINCT IC.car_key)::int AS count
          FROM gps.import_car AS IC
          JOIN provider.company_detail AS CD ON CD.company_key = IC.company_key
          WHERE CD.admittance_date < CURRENT_DATE
            AND IC.last_import_time >= CURRENT_DATE - INTERVAL '7 days'
        `.catch(() => [{ count: 0 }]),
      ])
      return reply.send({
        companies_by_tariff: companies,
        active_companies: activeCompanies[0]?.count ?? 0,
        new_contracts_this_month: contracts[0]?.count ?? 0,
        invoices_this_year: invoices[0] ?? { count: 0, total_sum: 0 },
        overdue_claims: claims[0] ?? { count: 0, total_sum: 0 },
        overdue_claims_by_region: overdueByRegion,
        diary_today: diary[0]?.count ?? 0,
        active_vehicles: vehicles[0]?.count ?? 0,
        expired_access_with_tracking: expiredCompanies[0]?.count ?? 0,
        expired_access_vehicle_count: expiredVehicles[0]?.count ?? 0,
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

  // GET /api/statistics/expired-access — firmy s propadlým přístupem, ale stále aktivním GPS importem
  app.get('/expired-access', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    try {
      const rows = await sql`
        SELECT S.company_key, S.comp_id, S.comp_name, S.usr, S.import_type,
               CD.admittance_date
        FROM gps.import_service AS S
        JOIN provider.company_detail AS CD ON CD.company_key = S.company_key
        WHERE CD.admittance_date < CURRENT_DATE
          AND S.last_import_time >= CURRENT_DATE - INTERVAL '7 days'
        ORDER BY CD.admittance_date DESC
      `
      return reply.send(rows)
    } finally {
      await sql.end()
    }
  })

  // GET /api/statistics/overdue-companies — firmy s pohledávkami po splatnosti (volitelně dle oblasti)
  app.get('/overdue-companies', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    const { region } = request.query as { region?: string }
    const regionFilter = region ? sql`AND C.region = ${region}` : sql``
    try {
      const rows = await sql`
        SELECT C.company_key, C.id, C.company, C.city, C.region, C.tariff,
               T.name AS tariff_name,
               count(*)::int AS invoice_count,
               sum(I.total)::numeric AS total_sum
        FROM provider.invoice AS I
        JOIN provider.company AS C ON C.company_key = I.company_key
        LEFT JOIN provider.tariff AS T ON T.tariff = C.tariff
        WHERE I.settlement IS NULL AND I.cancellation IS NULL
          AND I.maturity < CURRENT_DATE
          ${regionFilter}
        GROUP BY C.company_key, C.id, C.company, C.city, C.region, C.tariff, T.name
        ORDER BY total_sum DESC
      `
      return reply.send(rows)
    } finally {
      await sql.end()
    }
  })

  // GET /api/statistics/lent-monthly — registrace (zapůjčení programu) per měsíc, 36 měsíců
  app.get('/lent-monthly', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    try {
      const rows = await sql`
        SELECT to_char(prog_lent_date, 'YYYY-MM') AS month, count(*)::int AS count
        FROM provider.company_detail
        WHERE prog_lent_date >= date_trunc('month', CURRENT_DATE) - INTERVAL '35 months'
          AND prog_lent_date <= CURRENT_DATE
        GROUP BY 1
        ORDER BY 1
      `
      const result = fill36Months(
        rows.map((r: any) => ({ month: r.month, count: r.count })),
        (month) => ({ month, count: 0 }),
      )
      return reply.send(result)
    } finally {
      await sql.end()
    }
  })

  // GET /api/statistics/lent-access-stats — konverze registrací (předplatili / trvalí)
  app.get('/lent-access-stats', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    try {
      const [paid, permanent] = await Promise.all([
        // Firmy, které aspoň jednou zaplatily (uhrazená nestornovaná faktura)
        sql`
          SELECT count(DISTINCT company_key)::int AS count
          FROM provider.invoice
          WHERE settlement IS NOT NULL AND cancellation IS NULL
        `,
        // Trvalí uživatelé (trvalý přístup)
        sql`
          SELECT count(*)::int AS count
          FROM provider.company_detail
          WHERE admittance = '*'
        `,
      ])
      return reply.send({
        d45: paid[0]?.count ?? 0,
        trvali: permanent[0]?.count ?? 0,
      })
    } finally {
      await sql.end()
    }
  })

  // GET /api/statistics/orders-monthly — vytvořené zakázky per měsíc (manuální / digitální), 36 měsíců
  app.get('/orders-monthly', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    try {
      const rows = await sql`
        SELECT to_char(created_time, 'YYYY-MM') AS month,
               count(*)::int AS count,
               count(*) FILTER (WHERE web_origin = 'D')::int AS digital
        FROM ta.obligation_base
        WHERE created_time >= date_trunc('month', CURRENT_DATE) - INTERVAL '35 months'
          AND created_time <= CURRENT_DATE
        GROUP BY 1
        ORDER BY 1
      `
      const result = fill36Months(
        rows.map((r: any) => ({ month: r.month, count: r.count, digital: r.digital })),
        (month) => ({ month, count: 0, digital: 0 }),
      )
      return reply.send(result)
    } finally {
      await sql.end()
    }
  })

  // GET /api/statistics/order-base-monthly — objednávky přepravcům per měsíc (potvrzené), 36 měsíců
  app.get('/order-base-monthly', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    try {
      const rows = await sql`
        SELECT to_char(created_time, 'YYYY-MM') AS month,
               count(*)::int AS count,
               count(accepted_time)::int AS accepted
        FROM ta.order_base
        WHERE created_time >= date_trunc('month', CURRENT_DATE) - INTERVAL '35 months'
          AND created_time <= CURRENT_DATE
        GROUP BY 1
        ORDER BY 1
      `
      const result = fill36Months(
        rows.map((r: any) => ({ month: r.month, count: r.count, accepted: r.accepted })),
        (month) => ({ month, count: 0, accepted: 0 }),
      )
      return reply.send(result)
    } finally {
      await sql.end()
    }
  })

  // GET /api/statistics/invoice-base-monthly — faktury per měsíc (vydané / přijaté), 36 měsíců
  app.get('/invoice-base-monthly', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    try {
      const rows = await sql`
        SELECT to_char(issued, 'YYYY-MM') AS month,
               count(*) FILTER (WHERE type = 'I')::int AS issued,
               count(*) FILTER (WHERE type = 'R')::int AS received
        FROM ta.invoice_base
        WHERE issued >= date_trunc('month', CURRENT_DATE) - INTERVAL '35 months'
          AND issued <= CURRENT_DATE
        GROUP BY 1
        ORDER BY 1
      `
      const result = fill36Months(
        rows.map((r: any) => ({ month: r.month, issued: r.issued, received: r.received })),
        (month) => ({ month, issued: 0, received: 0 }),
      )
      return reply.send(result)
    } finally {
      await sql.end()
    }
  })
}