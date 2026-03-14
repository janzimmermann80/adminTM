import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { getUserSql } from '../../db/userSql.js'

interface SearchQuery {
  q?: string
  field?: string   // id | company | cin | city | phone | email | name
  region?: string
  country?: string
  tariff?: string
  limit?: string
  offset?: string
  order?: string
}

export async function companiesRoutes(app: FastifyInstance) {

  // GET /api/companies - search & list
  app.get('/', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    const q = request.query as SearchQuery
    const limit = Math.min(Number(q.limit ?? 25), 100)
    const offset = Number(q.offset ?? 0)
    const order = ['id', 'company', 'city', 'country', 'region', 'tariff', 'last_modif'].includes(q.order ?? '')
      ? (q.order as string) : 'company'

    let conditions = sql`WHERE 1=1`

    if (q.q) {
      const field = q.field ?? 'company'
      const term = `%${q.q}%`
      if (field === 'id') {
        conditions = sql`WHERE C.id ILIKE ${term}`
      } else if (field === 'company') {
        conditions = sql`WHERE C.company ILIKE ${term}`
      } else if (field === 'cin') {
        conditions = sql`WHERE C.cin ILIKE ${term}`
      } else if (field === 'city') {
        conditions = sql`WHERE C.city ILIKE ${term}`
      } else if (field === 'email') {
        conditions = sql`WHERE C.company_key IN (
          SELECT company_key FROM provider.contact WHERE type='E' AND value ILIKE ${term}
        )`
      } else if (field === 'phone') {
        conditions = sql`WHERE C.company_key IN (
          SELECT company_key FROM provider.contact WHERE type IN ('T','G') AND value ILIKE ${term}
        )`
      } else if (field === 'name') {
        conditions = sql`WHERE C.company_key IN (
          SELECT company_key FROM provider.contact_person WHERE name ILIKE ${term}
        )`
      }
    }

    if (q.region) {
      conditions = sql`${conditions} AND C.region = ${q.region}`
    }
    if (q.country) {
      conditions = sql`${conditions} AND C.country = ${q.country}`
    }
    if (q.tariff) {
      conditions = sql`${conditions} AND C.tariff = ${q.tariff}`
    }

    try {
      const [{ count }] = await sql`
        SELECT count(*)::int AS count
        FROM provider.company AS C
        ${conditions}
      `

      const rows = await sql`
        SELECT C.company_key, C.id, C.company, C.street, C.city, C.zip,
               C.country, C.region, C.tariff, C.cin, C.last_modif,
               T.name AS tariff_name
        FROM provider.company AS C
        LEFT JOIN provider.tariff AS T ON C.tariff = T.tariff
        ${conditions}
        ORDER BY ${sql(order)}
        LIMIT ${limit} OFFSET ${offset}
      `

      return reply.send({ total: count, limit, offset, data: rows })
    } finally {
      await sql.end()
    }
  })

  // GET /api/companies/:id - company detail
  app.get('/:id', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    const { id } = request.params as { id: string }

    try {
      const rows = await sql`
        SELECT C.company_key, C.id, C.company, C.street, C.city, C.zip,
               C.country, C.cin, C.tin, C.bank, C.account, C.branch,
               C.tariff, C.region, C.provider, C.last_modif, C.parent_key,
               CD.credit_tip_sms, CD.contract, CD.contract_date,
               CD.prog_sent, CD.prog_sent_date, CD.prog_lent, CD.prog_lent_date,
               CD.admittance, CD.admittance_date, CD.forwarding, CD.forwarding_date,
               CD.car_pool, CD.car_pool_date, CD.claim_exchange, CD.advert_discount,
               CD.show_date, CD.send_emails_from_their_domain,
               CIA.company AS invoice_company, CIA.street AS invoice_street,
               CIA.city AS invoice_city, CIA.zip AS invoice_zip, CIA.country AS invoice_country
        FROM provider.company AS C
        LEFT JOIN provider.company_detail AS CD ON C.company_key = CD.company_key
        LEFT JOIN provider.company_invoice_address AS CIA ON C.company_key = CIA.company_key
        WHERE C.company_key = ${id}
      `

      if (rows.length === 0) return reply.code(404).send({ error: 'Company not found' })
      return reply.send(rows[0])
    } finally {
      await sql.end()
    }
  })

  // POST /api/companies - create new company
  app.post('/', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    const user = (request as any).user
    const body = request.body as {
      company: string; city: string; street?: string; zip?: string
      country: string; cin?: string; tin?: string; region: string; tariff: string
    }

    try {
      // Check duplicate CIN
      if (body.cin) {
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
        VALUES (${user.provider}, ${body.company}, ${body.city}, ${body.country},
                ${body.cin ?? ''}, ${body.tin ?? ''}, ${now}, ${body.street ?? ''},
                ${body.zip ?? ''}, ${body.region}, ${body.tariff})
        RETURNING company_key, id
      `

      await sql`INSERT INTO provider.company_detail (company_key) VALUES (${newCompany.company_key})`

      return reply.code(201).send(newCompany)
    } finally {
      await sql.end()
    }
  })

  // PUT /api/companies/:id - update basic company info
  app.put('/:id', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    const { id } = request.params as { id: string }
    const body = request.body as {
      company?: string; street?: string; city?: string; zip?: string
      country?: string; cin?: string; tin?: string; bank?: string
      account?: string; branch?: string; tariff?: string; region?: string
    }

    const now = new Date().toLocaleDateString('cs-CZ')

    try {
      await sql`
        UPDATE provider.company SET
          company = COALESCE(${body.company ?? null}, company),
          street  = COALESCE(${body.street ?? null}, street),
          city    = COALESCE(${body.city ?? null}, city),
          zip     = COALESCE(${body.zip ?? null}, zip),
          country = COALESCE(${body.country ?? null}, country),
          cin     = COALESCE(${body.cin ?? null}, cin),
          tin     = COALESCE(${body.tin ?? null}, tin),
          bank    = COALESCE(${body.bank ?? null}, bank),
          account = COALESCE(${body.account ?? null}, account),
          branch  = COALESCE(${body.branch ?? null}, branch),
          tariff  = COALESCE(${body.tariff ?? null}, tariff),
          region  = COALESCE(${body.region ?? null}, region),
          last_modif = ${now}
        WHERE company_key = ${id}
      `
      return reply.send({ success: true })
    } finally {
      await sql.end()
    }
  })

  // GET /api/companies/:id/contacts - contact persons + contacts
  app.get('/:id/contacts', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    const { id } = request.params as { id: string }

    try {
      const persons = await sql`
        SELECT person_key, importance, name, sex, languages, send_offers
        FROM provider.contact_person
        WHERE company_key = ${id}
        ORDER BY importance
      `
      const contacts = await sql`
        SELECT contact_key, importance, type, value, send_tips, by_name, local_tips, forward_tm
        FROM provider.contact
        WHERE company_key = ${id} AND type IN ('T','G','F','E','I','U','S','C')
        ORDER BY importance
      `
      const { employeeSchema } = (request as any).user
      const userAccounts = await sql`
        SELECT username, password FROM ONLY ${sql(employeeSchema + '.user_account')}
        WHERE company_key = ${id}
        ORDER BY username
      `
      return reply.send({ persons, contacts, userAccounts })
    } finally {
      await sql.end()
    }
  })

  // GET /api/companies/:id/invoices - invoice list
  app.get('/:id/invoices', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    const { id } = request.params as { id: string }
    const q = request.query as { limit?: string; offset?: string }
    const limit = Math.min(Number(q.limit ?? 10), 50)
    const offset = Number(q.offset ?? 0)

    try {
      const [{ count }] = await sql`
        SELECT count(*)::int AS count FROM provider.invoice WHERE company_key = ${id}
      `
      const rows = await sql`
        SELECT I.invoice_key, I.year, I.number, I.series, I.issued, I.fulfilment,
               I.maturity, I.settlement, I.cancellation, I.price, I.total,
               I.curr_total, I.curr_price, I.currency, I.demand_notes,
               I.rate, I.price_high, I.price_low, I.vat_high, I.vat_high_rate,
               I.vat_low, I.vat_low_rate, I.curr_vat_high, I.curr_vat_low,
               I.proforma_number, C.id
        FROM provider.invoice AS I
        JOIN provider.company AS C ON I.company_key = C.company_key
        WHERE I.company_key = ${id}
        ORDER BY I.fulfilment DESC
        LIMIT ${limit} OFFSET ${offset}
      `
      return reply.send({ total: count, limit, offset, data: rows })
    } finally {
      await sql.end()
    }
  })

  // PUT /api/companies/:id/invoices/:iid - update invoice
  app.put('/:id/invoices/:iid', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    const { id, iid } = request.params as { id: string; iid: string }
    const b = request.body as Record<string, any>

    try {
      await sql`
        UPDATE provider.invoice SET
          series         = COALESCE(${b.series ?? null}, series),
          number         = COALESCE(${b.number != null ? Number(b.number) : null}, number),
          year           = COALESCE(${b.year != null ? Number(b.year) : null}, year),
          issued         = COALESCE(${b.issued ?? null}, issued),
          fulfilment     = COALESCE(${b.fulfilment ?? null}, fulfilment),
          maturity       = COALESCE(${b.maturity ?? null}, maturity),
          settlement     = ${b.settlement !== undefined ? (b.settlement || null) : sql`settlement`},
          cancellation   = ${b.cancellation !== undefined ? (b.cancellation || null) : sql`cancellation`},
          price          = COALESCE(${b.price != null ? Number(b.price) : null}, price),
          total          = COALESCE(${b.total != null ? Number(b.total) : null}, total),
          curr_total     = COALESCE(${b.curr_total != null ? Number(b.curr_total) : null}, curr_total),
          curr_price     = COALESCE(${b.curr_price != null ? Number(b.curr_price) : null}, curr_price),
          currency       = COALESCE(${b.currency ?? null}, currency),
          demand_notes   = COALESCE(${b.demand_notes != null ? Number(b.demand_notes) : null}, demand_notes),
          rate           = COALESCE(${b.rate != null ? Number(b.rate) : null}, rate),
          price_high     = COALESCE(${b.price_high != null ? Number(b.price_high) : null}, price_high),
          price_low      = COALESCE(${b.price_low != null ? Number(b.price_low) : null}, price_low),
          vat_high       = COALESCE(${b.vat_high != null ? Number(b.vat_high) : null}, vat_high),
          vat_high_rate  = COALESCE(${b.vat_high_rate != null ? Number(b.vat_high_rate) : null}, vat_high_rate),
          vat_low        = COALESCE(${b.vat_low != null ? Number(b.vat_low) : null}, vat_low),
          vat_low_rate   = COALESCE(${b.vat_low_rate != null ? Number(b.vat_low_rate) : null}, vat_low_rate),
          curr_vat_high  = COALESCE(${b.curr_vat_high != null ? Number(b.curr_vat_high) : null}, curr_vat_high),
          curr_vat_low   = COALESCE(${b.curr_vat_low != null ? Number(b.curr_vat_low) : null}, curr_vat_low),
          proforma_number = ${b.proforma_number !== undefined ? (b.proforma_number != null ? Number(b.proforma_number) : null) : sql`proforma_number`}
        WHERE invoice_key = ${iid} AND company_key = ${id}
      `
      return reply.send({ success: true })
    } finally {
      await sql.end()
    }
  })

  // DELETE /api/companies/:id/invoices/:iid - delete invoice
  app.delete('/:id/invoices/:iid', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    const { id, iid } = request.params as { id: string; iid: string }

    try {
      await sql`DELETE FROM provider.invoice WHERE invoice_key = ${iid} AND company_key = ${id}`
      return reply.send({ success: true })
    } finally {
      await sql.end()
    }
  })

  // GET /api/companies/:id/vehicles - vehicles (TruckManager)
  app.get('/:id/vehicles', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    const { id } = request.params as { id: string }

    try {
      const rows = await sql`
        SELECT C.car_key, C.spz, C.make, NOT C.inactive AS active, C.production_year,
               C.tonnage, C.capacity, C.axles, C.euro_emission, C.length, C.width, C.height,
               C.sim_imsi, C.export_allowed, C.driver_key, C.driver2_key,
               C.stazka_certified, C.home_stand_key,
               M.name AS home_stand_name, M.zip AS home_stand_zip, M.country AS home_stand_country
        FROM gps.car_base C
        LEFT JOIN map.city M ON M.city_key = C.home_stand_key
        WHERE C.company_key = ${id}
        ORDER BY C.inactive ASC, C.spz
      `
      return reply.send(rows)
    } finally {
      await sql.end()
    }
  })

  // POST /api/companies/:id/vehicles - new vehicle
  app.post('/:id/vehicles', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    const { id } = request.params as { id: string }
    const body = request.body as {
      spz: string; make?: string; tonnage?: number; capacity?: number
      euro_emission?: string; axles?: number; stazka_certified?: boolean; home_stand_key?: number
    }

    try {
      const [row] = await sql`
        INSERT INTO gps.car_base (company_key, spz, make, tonnage, capacity, euro_emission, axles,
                                  stazka_certified, home_stand_key, inactive)
        VALUES (${id}, ${body.spz}, ${body.make ?? ''}, ${body.tonnage ?? null},
                ${body.capacity ?? null}, ${body.euro_emission ?? null}, ${body.axles ?? null},
                ${body.stazka_certified ?? false}, ${body.home_stand_key ?? null}, false)
        RETURNING car_key
      `
      return reply.code(201).send(row)
    } finally {
      await sql.end()
    }
  })

  // PUT /api/companies/:id/vehicles/:vid - update vehicle
  app.put('/:id/vehicles/:vid', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    const { vid } = request.params as { id: string; vid: string }
    const body = request.body as {
      spz?: string; make?: string; tonnage?: number | null; capacity?: number | null
      euro_emission?: string | null; axles?: number | null; active?: boolean
      stazka_certified?: boolean; home_stand_key?: number | null
    }

    try {
      await sql`
        UPDATE gps.car_base SET
          spz               = COALESCE(${body.spz ?? null}, spz),
          make              = COALESCE(${body.make ?? null}, make),
          tonnage           = ${body.tonnage !== undefined ? body.tonnage : sql`tonnage`},
          capacity          = ${body.capacity !== undefined ? body.capacity : sql`capacity`},
          euro_emission     = ${body.euro_emission !== undefined ? body.euro_emission : sql`euro_emission`},
          axles             = ${body.axles !== undefined ? body.axles : sql`axles`},
          inactive          = ${body.active !== undefined ? !body.active : sql`inactive`},
          stazka_certified  = ${body.stazka_certified !== undefined ? body.stazka_certified : sql`stazka_certified`},
          home_stand_key    = ${body.home_stand_key !== undefined ? body.home_stand_key : sql`home_stand_key`}
        WHERE car_key = ${vid}
      `
      return reply.send({ success: true })
    } finally {
      await sql.end()
    }
  })

  // GET /api/companies/:id/drivers - drivers
  app.get('/:id/drivers', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    const { id } = request.params as { id: string }

    try {
      const rows = await sql`
        SELECT driver_key, name, phone, adr, active, wage_hourly, wage_km, currency, expenses
        FROM gps.driver_base
        WHERE company_key = ${id}
        ORDER BY active DESC, name
      `
      return reply.send(rows)
    } finally {
      await sql.end()
    }
  })

  // POST /api/companies/:id/drivers - new driver
  app.post('/:id/drivers', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    const { id } = request.params as { id: string }
    const body = request.body as { name: string; phone?: string; wage_km?: number; wage_hourly?: number; currency?: string }

    try {
      const [row] = await sql`
        INSERT INTO gps.driver_base (company_key, name, phone, wage_km, wage_hourly, currency, active)
        VALUES (${id}, ${body.name}, ${body.phone ?? ''}, ${body.wage_km ?? null},
                ${body.wage_hourly ?? null}, ${body.currency ?? 'CZK'}, true)
        RETURNING driver_key
      `
      return reply.code(201).send(row)
    } finally {
      await sql.end()
    }
  })

  // PUT /api/companies/:id/drivers/:did - update driver
  app.put('/:id/drivers/:did', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    const { did } = request.params as { id: string; did: string }
    const body = request.body as { name?: string; phone?: string; active?: boolean; wage_km?: number | null; wage_hourly?: number | null; currency?: string }

    try {
      await sql`
        UPDATE gps.driver_base SET
          name        = COALESCE(${body.name ?? null}, name),
          phone       = COALESCE(${body.phone ?? null}, phone),
          active      = COALESCE(${body.active ?? null}, active),
          wage_km     = ${body.wage_km !== undefined ? body.wage_km : sql`wage_km`},
          wage_hourly = ${body.wage_hourly !== undefined ? body.wage_hourly : sql`wage_hourly`},
          currency    = COALESCE(${body.currency ?? null}, currency)
        WHERE driver_key = ${did}
      `
      return reply.send({ success: true })
    } finally {
      await sql.end()
    }
  })

  // DELETE /api/companies/:id/drivers/:did
  app.delete('/:id/drivers/:did', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    const { did } = request.params as { id: string; did: string }

    try {
      await sql`DELETE FROM gps.driver_base WHERE driver_key = ${did}`
      return reply.send({ success: true })
    } finally {
      await sql.end()
    }
  })

  // POST /api/companies/:id/contacts/persons - new contact person
  app.post('/:id/contacts/persons', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    const { id } = request.params as { id: string }
    const body = request.body as { name: string; sex?: string; send_offers?: boolean; languages?: string[] }

    try {
      // Find next importance
      const [{ max }] = await sql`
        SELECT COALESCE(MAX(importance), 0) AS max FROM provider.contact_person WHERE company_key = ${id}
      `
      const importance = (max as number) + 1
      const [row] = await sql`
        INSERT INTO provider.contact_person (company_key, importance, name, sex, send_offers, languages)
        VALUES (${id}, ${importance}, ${body.name}, ${body.sex ?? 'M'}, ${body.send_offers ?? false}, ${body.languages ?? []})
        RETURNING person_key, importance
      `
      return reply.code(201).send(row)
    } finally {
      await sql.end()
    }
  })

  // PUT /api/companies/:id/contacts/persons/:pid - update contact person
  app.put('/:id/contacts/persons/:pid', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    const { pid } = request.params as { id: string; pid: string }
    const body = request.body as { name?: string; sex?: string; send_offers?: boolean; languages?: string[] }

    try {
      await sql`
        UPDATE provider.contact_person SET
          name        = COALESCE(${body.name ?? null}, name),
          sex         = COALESCE(${body.sex ?? null}, sex),
          send_offers = COALESCE(${body.send_offers ?? null}, send_offers),
          languages   = COALESCE(${body.languages ?? null}, languages)
        WHERE person_key = ${pid}
      `
      return reply.send({ success: true })
    } finally {
      await sql.end()
    }
  })

  // DELETE /api/companies/:id/contacts/persons/:pid
  app.delete('/:id/contacts/persons/:pid', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    const { id, pid } = request.params as { id: string; pid: string }

    try {
      // Get importance to also delete related contacts
      const [person] = await sql`SELECT importance FROM provider.contact_person WHERE person_key = ${pid}`
      if (person) {
        await sql`DELETE FROM provider.contact WHERE company_key = ${id} AND importance = ${person.importance}`
      }
      await sql`DELETE FROM provider.contact_person WHERE person_key = ${pid}`
      return reply.send({ success: true })
    } finally {
      await sql.end()
    }
  })

  // PUT /api/companies/:id/user-account — upsert user_account
  app.put('/:id/user-account', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb, employeeSchema } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    const { id } = request.params as { id: string }
    const { username, password, username_old } = request.body as { username: string; password: string; username_old?: string }

    try {
      if (username_old) {
        await sql`
          UPDATE ONLY ${sql(employeeSchema + '.user_account')}
          SET username = ${username}, password = ${password}
          WHERE company_key = ${id} AND username = ${username_old}
        `
      } else {
        await sql`
          INSERT INTO ${sql(employeeSchema + '.user_account')} (company_key, username, password)
          VALUES (${id}, ${username}, ${password})
          ON CONFLICT (company_key, username) DO UPDATE SET password = ${password}
        `
      }
      return reply.send({ ok: true })
    } finally {
      await sql.end()
    }
  })

  // POST /api/companies/:id/contacts - add contact entry
  app.post('/:id/contacts', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    const { id } = request.params as { id: string }
    const body = request.body as { importance: number; type: string; value: string; send_tips?: boolean; forward_tm?: boolean }

    try {
      const [row] = await sql`
        INSERT INTO provider.contact (company_key, importance, type, value, send_tips, by_name, local_tips, forward_tm)
        VALUES (${id}, ${body.importance}, ${body.type}, ${body.value},
                ${body.send_tips ?? false}, false, false, ${body.forward_tm ?? false})
        RETURNING contact_key
      `
      return reply.code(201).send(row)
    } finally {
      await sql.end()
    }
  })

  // PUT /api/companies/:id/contacts/:cid - update contact entry
  app.put('/:id/contacts/:cid', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    const { cid } = request.params as { id: string; cid: string }
    const body = request.body as { type?: string; value?: string; send_tips?: boolean; forward_tm?: boolean }

    try {
      await sql`
        UPDATE provider.contact SET
          type       = COALESCE(${body.type ?? null}, type),
          value      = COALESCE(${body.value ?? null}, value),
          send_tips  = COALESCE(${body.send_tips ?? null}, send_tips),
          forward_tm = COALESCE(${body.forward_tm ?? null}, forward_tm)
        WHERE contact_key = ${cid}
      `
      return reply.send({ success: true })
    } finally {
      await sql.end()
    }
  })

  // DELETE /api/companies/:id/contacts/:cid
  app.delete('/:id/contacts/:cid', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    const { cid } = request.params as { id: string; cid: string }

    try {
      await sql`DELETE FROM provider.contact WHERE contact_key = ${cid}`
      return reply.send({ success: true })
    } finally {
      await sql.end()
    }
  })

  // PUT /api/companies/:id/invoice-address
  app.put('/:id/invoice-address', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    const { id } = request.params as { id: string }
    const body = request.body as { company: string; street?: string; city?: string; zip?: string; country?: string }

    try {
      await sql`
        INSERT INTO provider.company_invoice_address (company_key, company, street, city, zip, country)
        VALUES (${id}, ${body.company}, ${body.street ?? ''}, ${body.city ?? ''}, ${body.zip ?? ''}, ${body.country ?? ''})
        ON CONFLICT (company_key) DO UPDATE SET
          company = EXCLUDED.company,
          street  = EXCLUDED.street,
          city    = EXCLUDED.city,
          zip     = EXCLUDED.zip,
          country = EXCLUDED.country
      `
      return reply.send({ success: true })
    } finally {
      await sql.end()
    }
  })

  // PUT /api/companies/:id/services - update company_detail services
  app.put('/:id/services', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    const { id } = request.params as { id: string }
    const body = request.body as {
      contract?: string | null; contract_date?: string | null
      prog_sent?: string | null; prog_sent_date?: string | null
      prog_lent?: string | null; prog_lent_date?: string | null
      admittance?: string | null; admittance_date?: string | null
      forwarding?: string | null; forwarding_date?: string | null
      car_pool?: string | null; car_pool_date?: string | null
      claim_exchange?: string | null
      credit_tip_sms?: number | null
      advert_discount?: number | null
      send_emails_from_their_domain?: boolean | null
    }

    try {
      await sql`
        UPDATE provider.company_detail SET
          contract                    = COALESCE(${body.contract ?? null}, contract),
          contract_date               = COALESCE(${body.contract_date ?? null}::date, contract_date),
          prog_sent                   = COALESCE(${body.prog_sent ?? null}, prog_sent),
          prog_sent_date              = COALESCE(${body.prog_sent_date ?? null}::date, prog_sent_date),
          prog_lent                   = COALESCE(${body.prog_lent ?? null}, prog_lent),
          prog_lent_date              = COALESCE(${body.prog_lent_date ?? null}::date, prog_lent_date),
          admittance                  = COALESCE(${body.admittance ?? null}, admittance),
          admittance_date             = COALESCE(${body.admittance_date ?? null}::date, admittance_date),
          forwarding                  = COALESCE(${body.forwarding ?? null}, forwarding),
          forwarding_date             = COALESCE(${body.forwarding_date ?? null}::date, forwarding_date),
          car_pool                    = COALESCE(${body.car_pool ?? null}, car_pool),
          car_pool_date               = COALESCE(${body.car_pool_date ?? null}::date, car_pool_date),
          claim_exchange              = COALESCE(${body.claim_exchange ?? null}, claim_exchange),
          credit_tip_sms              = COALESCE(${body.credit_tip_sms ?? null}, credit_tip_sms),
          advert_discount             = COALESCE(${body.advert_discount ?? null}, advert_discount),
          send_emails_from_their_domain = COALESCE(${body.send_emails_from_their_domain ?? null}, send_emails_from_their_domain)
        WHERE company_key = ${id}
      `
      return reply.send({ success: true })
    } finally {
      await sql.end()
    }
  })

  // GET /api/companies/:id/notes
  app.get('/:id/notes', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    const { id } = request.params as { id: string }

    try {
      const rows = await sql`
        SELECT note_key, creator, creation_date, type, text
        FROM provider.note
        WHERE company_key = ${id}
        ORDER BY creation_date DESC
        LIMIT 100
      `
      return reply.send(rows)
    } finally {
      await sql.end()
    }
  })

  // POST /api/companies/:id/notes
  app.post('/:id/notes', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    const { id } = request.params as { id: string }
    const creator = (request as any).user.initials
    const body = request.body as { type: string; text: string }

    try {
      const [row] = await sql`
        INSERT INTO provider.note (company_key, creator, creation_date, type, text)
        VALUES (${id}, ${creator}, NOW(), ${body.type}, ${body.text})
        RETURNING note_key, creator, creation_date, type, text
      `
      return reply.code(201).send(row)
    } finally {
      await sql.end()
    }
  })

  // PUT /api/companies/:id/notes/:nid
  app.put('/:id/notes/:nid', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    const { nid } = request.params as { id: string; nid: string }
    const body = request.body as { type?: string; text?: string; creation_date?: string }

    try {
      await sql`
        UPDATE provider.note SET
          type          = COALESCE(${body.type ?? null}, type),
          text          = COALESCE(${body.text ?? null}, text),
          creation_date = COALESCE(${body.creation_date ?? null}::date, creation_date)
        WHERE note_key = ${nid}
      `
      return reply.send({ success: true })
    } finally {
      await sql.end()
    }
  })

  // DELETE /api/companies/:id/notes/:nid
  app.delete('/:id/notes/:nid', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    const { nid } = request.params as { id: string; nid: string }

    try {
      await sql`DELETE FROM provider.note WHERE note_key = ${nid}`
      return reply.send({ success: true })
    } finally {
      await sql.end()
    }
  })

  // GET /api/companies/:id/online-log
  app.get('/:id/online-log', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    const { id } = request.params as { id: string }

    try {
      const rows = await sql`
        SELECT action, time, detail
        FROM provider.log_internet
        WHERE company_key = ${id}
        ORDER BY time DESC
        LIMIT 200
      `
      return reply.send(rows)
    } finally {
      await sql.end()
    }
  })

  // GET /api/companies/:id/simcards
  app.get('/:id/simcards', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    const { id } = request.params as { id: string }

    try {
      const rows = await sql`
        SELECT SB.imsi, SB.number, SB.tariff, ST.name AS tariff_name, SB.price,
               SB.our_sim, SB.ie_disabled, SB.serial_number, CB.spz, CB.car_key
        FROM gps.simcard_base SB
        LEFT JOIN gps.simcard_tariff ST ON SB.tariff = ST.tariff
        LEFT JOIN gps.car_base CB ON CB.sim_imsi = SB.imsi
        WHERE SB.company_key = ${id}
        ORDER BY SB.imsi
      `
      return reply.send(rows)
    } finally {
      await sql.end()
    }
  })

  // GET /api/companies/:id/simcard-tariffs
  app.get('/:id/simcard-tariffs', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)

    try {
      const rows = await sql`
        SELECT tariff, name FROM gps.simcard_tariff ORDER BY name
      `
      return reply.send(rows)
    } finally {
      await sql.end()
    }
  })

  // PUT /api/companies/:id/simcards/:imsi
  app.put('/:id/simcards/:imsi', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    const { id, imsi } = request.params as { id: string; imsi: string }
    const body = request.body as {
      imsi?: string
      number?: string
      price?: number | null
      our_sim?: boolean
      ie_disabled?: boolean
    }

    try {
      await sql`
        UPDATE gps.simcard_base SET
          imsi        = COALESCE(${body.imsi ?? null}, imsi),
          number      = COALESCE(${body.number ?? null}, number),
          price       = ${body.price !== undefined ? body.price : sql`price`},
          our_sim     = COALESCE(${body.our_sim ?? null}, our_sim),
          ie_disabled = COALESCE(${body.ie_disabled ?? null}, ie_disabled)
        WHERE imsi = ${imsi} AND company_key = ${id}
      `
      return reply.send({ success: true })
    } finally {
      await sql.end()
    }
  })

  // DELETE /api/companies/:id/simcards/:imsi
  app.delete('/:id/simcards/:imsi', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    const { id, imsi } = request.params as { id: string; imsi: string }

    try {
      await sql`DELETE FROM gps.simcard_base WHERE imsi = ${imsi} AND company_key = ${id}`
      return reply.send({ success: true })
    } finally {
      await sql.end()
    }
  })

  // GET /api/companies/:id/simcards/:imsi/upload-log
  app.get('/:id/simcards/:imsi/upload-log', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    const { imsi } = request.params as { id: string; imsi: string }
    const q = request.query as { limit?: string }
    const limit = Math.min(Number(q.limit ?? 100), 500)

    try {
      const rows = await sql`
        SELECT log_key, time, gsmnet, gsmnet_id, method, file_size, overhead_size,
               position_recs, service_recs, message_recs, ip_addr, ip_port,
               version, program_ver, pda_imei, detail
        FROM gps.upload_log
        WHERE sim_imsi = ${imsi}
        ORDER BY time DESC
        LIMIT ${limit}
      `
      return reply.send(rows)
    } finally {
      await sql.end()
    }
  })

  // GET /api/companies/:id/simcards/:imsi/service-data
  app.get('/:id/simcards/:imsi/service-data', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    const { id, imsi } = request.params as { id: string; imsi: string }
    const q = request.query as { limit?: string }
    const limit = Math.min(Number(q.limit ?? 100), 500)

    try {
      const cars = await sql`
        SELECT car_key FROM gps.car_base WHERE sim_imsi = ${imsi} AND company_key = ${id} LIMIT 1
      `
      if (cars.length === 0) return reply.send([])

      const rows = await sql`
        SELECT S.service_key, S.time, S.descr, S.code,
               D.name AS driver_name
        FROM gps.service_base S
        LEFT JOIN gps.driver_base D ON S.driver_key = D.driver_key
        WHERE S.car_key = ${cars[0].car_key} AND S.code = 'TST'
        ORDER BY S.time DESC
        LIMIT ${limit}
      `
      return reply.send(rows)
    } finally {
      await sql.end()
    }
  })

  // GET /api/companies/:id/simcards/:imsi/sms
  app.get('/:id/simcards/:imsi/sms', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    const { id, imsi } = request.params as { id: string; imsi: string }
    const q = request.query as { limit?: string }
    const limit = Math.min(Number(q.limit ?? 50), 200)

    try {
      const sims = await sql`
        SELECT number FROM gps.simcard_base WHERE imsi = ${imsi} AND company_key = ${id} LIMIT 1
      `
      if (sims.length === 0 || !sims[0].number) return reply.send([])

      const rows = await sql`
        SELECT id, phone, msg, created, received, sent, send_attempts, delivered, failed, err
        FROM provider.sms_sent
        WHERE company_key = ${id} AND phone LIKE ${'%' + sims[0].number.trim() + '%'}
        ORDER BY created DESC
        LIMIT ${limit}
      `
      return reply.send(rows)
    } finally {
      await sql.end()
    }
  })
}
