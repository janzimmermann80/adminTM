import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { getUserSql } from '../db/userSql.js'

interface SearchQuery {
  // text search
  q?: string
  field?: string       // id | company | cin | street | zip | city | phone | name | username | email
  match?: string       // contains | begins

  // selection filters
  tariff?: string      // tariff code or special group
  branch?: string
  country?: string
  region?: string
  zip?: string

  // date filters on company_detail
  contract_date_from?: string
  contract_date_to?: string
  contract_date_null?: string   // 'true'
  prog_lent_date?: string
  prog_lent_date_op?: string    // >= | <= | =
  prog_sent_date?: string
  prog_sent_date_op?: string
  admittance_date?: string
  admittance_date_op?: string

  // note filters
  note_from?: string
  note_to?: string
  note_type?: string
  note_creator?: string

  // pagination
  limit?: string
  offset?: string
  order?: string
}

const SPECIAL_TARIFF_GROUPS: Record<string, string> = {
  exte: `C.tariff IN ('00','01','03','07') AND C.region IN ('001','002')`,
  exte2: `C.tariff IN ('00','01','03','07','19') AND C.region IN ('001','002')`,
  null: `C.tariff IS NULL`,
  notm: `C.tariff NOT IN ('15','17','19','21','22','23','24','25')`,
  allnostop: `C.tariff != '11'`,
  tmsim12: `C.tariff IN ('22','25')`,
  tmsimInv: `C.company_key IN (SELECT company_key FROM gps.simcard_base WHERE price>0) AND C.tin IS NOT NULL AND C.tin != ''`,
  tmsimInv2: `C.company_key IN (SELECT company_key FROM gps.simcard_base WHERE price>0) AND (C.tin IS NULL OR C.tin = '')`,
  truckmanager: `C.tariff IN ('12','13','14','15','21','22','23','24','25','26')`,
}

export async function searchRoutes(app: FastifyInstance) {

  // GET /api/search/meta - tariffs + branches for filter dropdowns
  app.get('/meta', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    try {
      const [tariffs, branches] = await Promise.all([
        sql`SELECT tariff, name FROM provider.tariff ORDER BY name`,
        sql`SELECT branch, name FROM provider.branch ORDER BY name`.catch(() => []),
      ])
      return reply.send({ tariffs, branches })
    } finally {
      await sql.end()
    }
  })

  // GET /api/search - main search endpoint
  app.get('/', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    const q = request.query as SearchQuery
    const limit = Math.min(Number(q.limit ?? 10), 100)
    const offset = Number(q.offset ?? 0)
    const validOrders = ['id', 'company', 'street', 'zip', 'city', 'country', 'region', 'tariff', 'last_modif']
    const order = validOrders.includes(q.order ?? '') ? q.order as string : 'company'
    const matchPrefix = q.match === 'begins' ? '' : '%'

    const whereClauses: string[] = []
    const params: unknown[] = []
    let p = 1

    const addParam = (val: unknown) => { params.push(val); return `$${p++}` }

    // --- text search ---
    if (q.q && q.field) {
      const term = `${matchPrefix}${q.q}%`
      switch (q.field) {
        case 'id':      whereClauses.push(`C.id ILIKE ${addParam(term)}`); break
        case 'company': whereClauses.push(`C.company ILIKE ${addParam(term)}`); break
        case 'cin':     whereClauses.push(`C.cin ILIKE ${addParam(term)}`); break
        case 'street':  whereClauses.push(`C.street ILIKE ${addParam(term)}`); break
        case 'zip':     whereClauses.push(`C.zip ILIKE ${addParam(term)}`); break
        case 'city':    whereClauses.push(`C.city ILIKE ${addParam(term)}`); break
        case 'phone':
          whereClauses.push(`C.company_key IN (SELECT company_key FROM provider.contact WHERE type IN ('T','G') AND value ILIKE ${addParam(term)})`)
          break
        case 'email':
          whereClauses.push(`C.company_key IN (SELECT company_key FROM provider.contact WHERE type='E' AND value ILIKE ${addParam(term)})`)
          break
        case 'name':
          whereClauses.push(`C.company_key IN (SELECT company_key FROM provider.contact_person WHERE name ILIKE ${addParam(term)})`)
          break
        case 'username':
          whereClauses.push(`C.company_key IN (SELECT company_key FROM provider.user_account WHERE username ILIKE ${addParam(term)})`)
          break
      }
    }

    // --- tariff filter ---
    if (q.tariff && q.tariff !== 'all') {
      if (SPECIAL_TARIFF_GROUPS[q.tariff]) {
        whereClauses.push(SPECIAL_TARIFF_GROUPS[q.tariff])
      } else {
        whereClauses.push(`C.tariff = ${addParam(q.tariff)}`)
      }
    }

    // --- simple filters ---
    if (q.branch && q.branch !== 'all') whereClauses.push(`C.branch = ${addParam(q.branch)}`)
    if (q.country) whereClauses.push(`C.country = ${addParam(q.country)}`)
    if (q.region)  whereClauses.push(`C.region = ${addParam(q.region)}`)
    if (q.zip)     whereClauses.push(`C.zip ILIKE ${addParam(q.zip + '%')}`)

    // --- company_detail date filters ---
    const detailClauses: string[] = []

    if (q.contract_date_null === 'true') {
      detailClauses.push('contract_date IS NULL')
    } else {
      if (q.contract_date_from) detailClauses.push(`contract_date >= ${addParam(q.contract_date_from)}`)
      if (q.contract_date_to)   detailClauses.push(`contract_date <= ${addParam(q.contract_date_to)}`)
    }

    const validOps = ['>=', '<=', '=']
    if (q.prog_lent_date) {
      const op = validOps.includes(q.prog_lent_date_op ?? '') ? q.prog_lent_date_op : '>='
      detailClauses.push(`prog_lent_date ${op} ${addParam(q.prog_lent_date)}`)
    }
    if (q.prog_sent_date) {
      const op = validOps.includes(q.prog_sent_date_op ?? '') ? q.prog_sent_date_op : '>='
      detailClauses.push(`prog_sent_date ${op} ${addParam(q.prog_sent_date)}`)
    }
    if (q.admittance_date) {
      const op = validOps.includes(q.admittance_date_op ?? '') ? q.admittance_date_op : '>='
      detailClauses.push(`admittance_date ${op} ${addParam(q.admittance_date)}`)
    }

    if (detailClauses.length > 0) {
      whereClauses.push(
        `C.company_key IN (SELECT company_key FROM provider.company_detail WHERE ${detailClauses.join(' AND ')})`
      )
    }

    // --- note filters ---
    const noteClauses: string[] = []
    if (q.note_from) noteClauses.push(`creation_date >= ${addParam(q.note_from)}`)
    if (q.note_to)   noteClauses.push(`creation_date <= ${addParam(q.note_to)}`)
    if (q.note_type)    noteClauses.push(`type = ${addParam(q.note_type)}`)
    if (q.note_creator) noteClauses.push(`creator = ${addParam(q.note_creator)}`)

    if (noteClauses.length > 0) {
      whereClauses.push(
        `C.company_key IN (SELECT company_key FROM provider.note WHERE ${noteClauses.join(' AND ')})`
      )
    }

    const whereSQL = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : ''

    const countQuery = `
      SELECT count(*)::int AS count
      FROM provider.company AS C
      LEFT JOIN provider.tariff AS T ON C.tariff = T.tariff
      ${whereSQL}
    `
    const dataQuery = `
      SELECT C.company_key, C.id, C.company, C.street, C.city, C.zip,
             C.country, C.region, C.tariff, C.last_modif, T.name AS tariff_name
      FROM provider.company AS C
      LEFT JOIN provider.tariff AS T ON C.tariff = T.tariff
      ${whereSQL}
      ORDER BY C.${order}
      LIMIT $${p++} OFFSET $${p++}
    `

    const countParams = [...params]
    const dataParams = [...params, limit, offset]

    try {
      const [countResult, dataResult] = await Promise.all([
        sql.unsafe(countQuery, countParams as any[]),
        sql.unsafe(dataQuery, dataParams as any[]),
      ])

      return reply.send({
        total: countResult[0]?.count ?? 0,
        limit,
        offset,
        data: dataResult,
      })
    } finally {
      await sql.end()
    }
  })

  // POST /api/search/export — export označených firem do CSV
  app.post('/export', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    const { keys } = request.body as { keys: number[] }

    if (!Array.isArray(keys) || keys.length === 0) {
      await sql.end()
      return reply.code(400).send({ error: 'Žádné záznamy k exportu' })
    }

    try {
    // Základní data firem
    const companies = await sql`
      SELECT C.company_key, C.id, C.tariff, C.region, C.company,
             C.street, C.city, C.zip, C.country, C.cin, C.tin,
             T.name AS tariff_name,
             CD.contract_date, CD.prog_sent_date, CD.prog_lent_date, CD.admittance_date
      FROM provider.company AS C
      LEFT JOIN provider.tariff AS T ON C.tariff = T.tariff
      LEFT JOIN provider.company_detail AS CD ON C.company_key = CD.company_key
      WHERE C.company_key = ANY(${keys})
      ORDER BY C.company
    `

    // Kontakty pro všechny firmy najednou
    const contacts = await sql`
      SELECT company_key, type, value, importance
      FROM provider.contact
      WHERE company_key = ANY(${keys})
        AND type IN ('T','G','E','F')
      ORDER BY importance
    `

    // Kontaktní osoby
    const persons = await sql`
      SELECT company_key, name, importance
      FROM provider.contact_person
      WHERE company_key = ANY(${keys})
      ORDER BY importance
    `

    // Sestavení CSV
    const contactMap = new Map<number, Record<string, string>>()
    for (const c of contacts) {
      const key = Number(c.company_key)
      if (!contactMap.has(key)) contactMap.set(key, {})
      const map = contactMap.get(key)!
      const imp = c.importance ?? ''
      if (c.type === 'T') map[`phone${imp}`] = c.value
      if (c.type === 'G') map[`gsm${imp}`]   = c.value
      if (c.type === 'E') map[`email${imp}`]  = c.value
      if (c.type === 'F') map['fax']          = c.value
    }

    const personMap = new Map<number, string[]>()
    for (const p of persons) {
      const key = Number(p.company_key)
      if (!personMap.has(key)) personMap.set(key, [])
      personMap.get(key)!.push(p.name)
    }

    const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`

    const headers = [
      'ID','Tarif','Název','Ulice','Město','PSČ','Stát','IČO','DIČ','Oblast',
      'Datum smlouvy','Datum odeslání','Datum zapůjčení','Datum přístupu',
      'Telefon 1','GSM 1','E-mail 1','Fax','Kontaktní osoby',
    ]

    const rows = companies.map((c) => {
      const ct = contactMap.get(Number(c.company_key)) ?? {}
      const ps = personMap.get(Number(c.company_key)) ?? []
      return [
        c.id, c.tariff_name ?? c.tariff, c.company,
        c.street, c.city, c.zip, c.country, c.cin, c.tin, c.region,
        c.contract_date ?? '', c.prog_sent_date ?? '',
        c.prog_lent_date ?? '', c.admittance_date ?? '',
        ct['phone1'] ?? ct['phone'] ?? '',
        ct['gsm1']   ?? ct['gsm']   ?? '',
        ct['email1'] ?? ct['email'] ?? '',
        ct['fax'] ?? '',
        ps.join(', '),
      ].map(escape).join(',')
    })

    const csv = [headers.map(escape).join(','), ...rows].join('\r\n')

    return reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', 'attachment; filename="export.csv"')
      .send('\uFEFF' + csv)  // BOM pro správné zobrazení v Excelu
    } finally {
      await sql.end()
    }
  })
}
