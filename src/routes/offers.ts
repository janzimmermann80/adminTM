import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { getUserSql } from '../db/userSql.js'

export async function offersRoutes(app: FastifyInstance) {

  // GET /api/offers/cities?q=Praha
  app.get('/cities', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    const { q } = request.query as { q?: string }
    if (!q || q.length < 2) return reply.send([])
    try {
      // Multi-country format: *CZ+SK+PL* — resolve each country to its 'A' city_key
      if (q.startsWith('*') && q.includes('+')) {
        const countries = q.replace(/\*/g, '').split('+').filter(Boolean)
        const rows = await sql`
          SELECT city_key, name, country, zip
          FROM map.city
          WHERE country = ANY(${countries}) AND size = 'A'
        `
        return reply.send(rows)
      }
      // Single country code (2-3 uppercase letters)
      if (/^[A-Z]{2,3}$/.test(q)) {
        const rows = await sql`
          SELECT city_key, name, country, zip
          FROM map.city
          WHERE country = ${q} AND size = 'A'
          LIMIT 10
        `
        return reply.send(rows)
      }
      // Country-ZIP format: CZ-123 or D-451
      if (/^[A-Za-z]{1,3}-/.test(q)) {
        const [country, zipPrefix] = q.split('-')
        const rows = await sql`
          SELECT city_key, name, country, zip
          FROM map.city
          WHERE country = ${country.toUpperCase()} AND zip ILIKE ${zipPrefix + '%'}
          ORDER BY zip LIMIT 10
        `
        return reply.send(rows)
      }
      // City name search
      const rows = await sql`
        SELECT city_key, name, country, zip
        FROM map.city
        WHERE name ILIKE ${q + '%'}
        ORDER BY name LIMIT 12
      `
      return reply.send(rows)
    } finally {
      await sql.end()
    }
  })

  // GET /api/offers?company_key=X
  app.get('/', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    const { company_key } = request.query as { company_key?: string }
    if (!company_key) return reply.code(400).send({ error: 'company_key required' })
    try {
      const rows = await sql`
        SELECT SP.sped_key, SP.last_modif, SP.is_cargo, SP.type,
               SP.source_vicinity, SP.dest_vicinity,
               SP.valid_from, SP.valid_to,
               SP.tonnage, SP.volume, SP.length, SP.price, SP.note, SP.adr,
               SP.src_key, SP.dst_key,
               S.name AS src_city, S.country AS src_country, S.zip AS src_zip,
               D.name AS dst_city, D.country AS dst_country, D.zip AS dst_zip,
               P.name AS person_name, SP.person AS person_key
        FROM users.spedition_base AS SP
        JOIN map.city AS S ON SP.src_key = S.city_key
        JOIN map.city AS D ON SP.dst_key = D.city_key
        LEFT JOIN provider.contact_person AS P ON P.person_key = SP.person
        WHERE SP.id = (SELECT id FROM provider.company WHERE company_key = ${company_key})
        ORDER BY S.country, S.name
      `
      return reply.send(rows)
    } finally {
      await sql.end()
    }
  })

  // GET /api/offers/persons?company_key=X — contact persons for company
  app.get('/persons', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    const { company_key } = request.query as { company_key?: string }
    if (!company_key) return reply.code(400).send({ error: 'company_key required' })
    try {
      const rows = await sql`
        SELECT person_key, name
        FROM provider.contact_person
        WHERE company_key = ${company_key}
        ORDER BY importance
      `
      return reply.send(rows)
    } finally {
      await sql.end()
    }
  })

  // POST /api/offers
  app.post('/', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    const body = request.body as {
      company_key: number
      is_cargo: boolean
      type: string
      src_key: string
      dst_key: string
      source_vicinity: number
      dest_vicinity: number
      valid_from: string
      valid_to: string
      tonnage: number
      volume: number
      length: number
      price?: string
      note?: string
      person: number
      adr: boolean
    }
    // Validate: both src and dst must not be multi-country simultaneously
    const srcMulti = body.src_key.includes('+')
    const dstMulti = body.dst_key.includes('+')
    if (srcMulti && dstMulti) {
      return reply.code(400).send({ error: 'Výchozí i cílové místo nesmí být zároveň celý stát' })
    }
    // Expand multi-country keys into multiple rows
    const srcKeys: string[] = srcMulti ? body.src_key.split('+') : [body.src_key]
    const dstKeys: string[] = dstMulti ? body.dst_key.split('+') : [body.dst_key]
    const pairs = srcMulti
      ? srcKeys.map(k => ({ src: k, dst: body.dst_key }))
      : dstKeys.map(k => ({ src: body.src_key, dst: k }))
    const price = body.price?.trim() || 'Dohoda'
    const tonnage = Number(String(body.tonnage).replace(',', '.')) || 0
    const volume = Math.round(Number(String(body.volume).replace(',', '.')) || 0)
    const length = Number(String(body.length).replace(',', '.')) || 0
    // Radius defaults
    let srcVicinty = body.source_vicinity
    let dstVicinity = body.dest_vicinity
    if (!body.is_cargo) {
      if (!srcVicinty) srcVicinty = 30
      if (!dstVicinity) dstVicinity = 30
    } else {
      srcVicinty = 0; dstVicinity = 0
    }
    try {
      const inserted: string[] = []
      for (const pair of pairs) {
        const [row] = await sql`
          INSERT INTO users.spedition_base
            (id, is_cargo, type, source_vicinity, dest_vicinity, valid_from, valid_to,
             tonnage, volume, length, price, note, person, adr, send_tip, src_key, dst_key, library1)
          VALUES (
            (SELECT id FROM provider.company WHERE company_key = ${body.company_key}),
            ${body.is_cargo}, ${body.type}, ${srcVicinty}, ${dstVicinity},
            ${body.valid_from}, ${body.valid_to},
            ${tonnage}, ${volume}, ${length}, ${price},
            ${body.note ?? ''}, ${body.person}, ${body.adr}, true,
            ${pair.src}, ${pair.dst}, 'K_000'
          )
          RETURNING sped_key
        `
        inserted.push(row.sped_key)
      }
      return reply.code(201).send({ sped_keys: inserted })
    } finally {
      await sql.end()
    }
  })

  // PUT /api/offers/:sped_key
  app.put('/:sped_key', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    const { sped_key } = request.params as { sped_key: string }
    const body = request.body as {
      company_key: number
      type?: string
      source_vicinity?: number
      dest_vicinity?: number
      valid_from?: string
      valid_to?: string
      tonnage?: number
      volume?: number
      length?: number
      price?: string
      note?: string
      person?: number
      adr?: boolean
    }
    try {
      await sql`
        UPDATE users.spedition_base SET
          type             = COALESCE(${body.type ?? null}, type),
          source_vicinity  = COALESCE(${body.source_vicinity ?? null}, source_vicinity),
          dest_vicinity    = COALESCE(${body.dest_vicinity ?? null}, dest_vicinity),
          valid_from       = COALESCE(${body.valid_from ?? null}, valid_from),
          valid_to         = COALESCE(${body.valid_to ?? null}, valid_to),
          tonnage          = COALESCE(${body.tonnage ?? null}, tonnage),
          volume           = COALESCE(${body.volume ?? null}, volume),
          length           = COALESCE(${body.length ?? null}, length),
          price            = COALESCE(${body.price ?? null}, price),
          note             = COALESCE(${body.note ?? null}, note),
          person           = COALESCE(${body.person ?? null}, person),
          adr              = COALESCE(${body.adr ?? null}, adr)
        WHERE sped_key = ${sped_key}
          AND id = (SELECT id FROM provider.company WHERE company_key = ${body.company_key})
      `
      return reply.send({ success: true })
    } finally {
      await sql.end()
    }
  })

  // DELETE /api/offers/:sped_key?company_key=X
  app.delete('/:sped_key', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    const { sped_key } = request.params as { sped_key: string }
    const { company_key } = request.query as { company_key?: string }
    if (!company_key) return reply.code(400).send({ error: 'company_key required' })
    try {
      await sql`
        DELETE FROM users.spedition_base
        WHERE sped_key = ${sped_key}
          AND id = (SELECT id FROM provider.company WHERE company_key = ${company_key})
      `
      return reply.send({ success: true })
    } finally {
      await sql.end()
    }
  })

  // GET /api/offers/coupling/:sped_key?company_key=X&add_radius=1.0
  app.get('/coupling/:sped_key', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    const { sped_key } = request.params as { sped_key: string }
    const q = request.query as { company_key?: string; add_radius?: string }
    if (!q.company_key) return reply.code(400).send({ error: 'company_key required' })
    const addRadius = parseFloat(q.add_radius ?? '1.0')
    try {
      // Get the offer itself
      const [offer] = await sql`
        SELECT SP.sped_key, SP.is_cargo, SP.type, SP.source_vicinity, SP.dest_vicinity,
               SP.valid_from, SP.valid_to, SP.tonnage, SP.volume, SP.price, SP.note,
               S.name AS src_city, S.country AS src_country, S.zip AS src_zip,
               D.name AS dst_city, D.country AS dst_country, D.zip AS dst_zip
        FROM users.spedition_base AS SP
        JOIN map.city AS S ON SP.src_key = S.city_key
        JOIN map.city AS D ON SP.dst_key = D.city_key
        WHERE SP.sped_key = ${sped_key}
          AND SP.id = (SELECT id FROM provider.company WHERE company_key = ${q.company_key})
      `
      if (!offer) return reply.code(404).send({ error: 'Not found' })
      // Call coupling function
      const companyId = await sql`
        SELECT id FROM provider.company WHERE company_key = ${q.company_key}
      `
      const matches = await sql`
        SELECT S.*, C.company, C.id AS company_id, C.country AS company_country
        FROM users.spedition_do_coupling(${companyId[0].id}, ${sped_key}, ${addRadius}) AS S
        JOIN provider.company AS C ON S.id = C.id
      `
      // Enrich matches with contact info
      const enriched = []
      for (const m of matches) {
        const persons = await sql`
          SELECT P.name, G.value AS gsm, T.value AS phone
          FROM provider.contact_person AS P
          LEFT JOIN provider.contact AS G ON P.company_key = G.company_key AND P.importance = G.importance AND G.type = 'G'
          LEFT JOIN provider.contact AS T ON P.company_key = T.company_key AND P.importance = T.importance AND T.type = 'T'
          WHERE P.person_key = ${m.person}
        `
        enriched.push({ ...m, person_info: persons[0] ?? null })
      }
      return reply.send({ offer, matches: enriched })
    } finally {
      await sql.end()
    }
  })
}
