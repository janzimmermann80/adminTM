import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import ExcelJS from 'exceljs'
import { getUserSql } from '../db/userSql.js'
import { createPrejimkaCsv, PrejimkaEvent, PrejimkaPoint } from '../services/prejimkaCsv.js'
import { createPrejimkaMail, PREJIMKA_RECIPIENTS, PrejimkaDestination, reservePrejimkaSend, updatePrejimkaSend } from '../services/prejimkaSend.js'
import nodemailer from 'nodemailer'
import { z } from 'zod'

const ORDER_PREFIX_GROUPS: Record<string, string[]> = {
  wood: ['ZA', 'ZB', 'ZD', 'ZM', 'ZS', 'ZJ', 'MA'],
  gps: ['LC', 'LD'],
  mm: ['MM'],
}

type OrderCheckFilters = {
  from?: string
  to?: string
  prefixGroup?: string
  companyKey?: string
  carKey?: string
}

type ParsedOrderCheckFilters = {
  from: string
  toExclusive: string
  prefixes: string[]
  companyKey: number | null
  carKey: number | null
}

type OrderCheckEvent = {
  time: string
  type: string
  pos_gps: string | null
  order_number: string
  car_key: number | null
  spz: string | null
  company_key: number | null
  company: string | null
  city_name: string | null
  zip: string | null
  country: string | null
  driver_name: string | null
}

function parseOrderCheckFilters(q: OrderCheckFilters) {
  const validDate = (value: string | undefined) => {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
    const date = new Date(`${value}T00:00:00.000Z`)
    if (Number.isNaN(date.getTime())) return null
    return date.toISOString().slice(0, 10) === value ? date : null
  }

  const from = validDate(q.from)
  const to = validDate(q.to)
  if (!from || !to) return { error: 'Zadejte platné datum od a do.' as const }

  const daySpan = (to.getTime() - from.getTime()) / 86_400_000
  if (daySpan < 0) return { error: 'Datum „do“ nesmí být před datem „od“.' as const }
  if (daySpan > 40) return { error: 'Rozsah může být maximálně 40 dní.' as const }

  const prefixGroup = q.prefixGroup ?? 'wood'
  if (prefixGroup !== 'all' && !Object.hasOwn(ORDER_PREFIX_GROUPS, prefixGroup)) {
    return { error: 'Neplatná sada prefixů objednávek.' as const }
  }

  const parseKey = (value: string | undefined) => {
    if (!value) return null
    const key = Number(value)
    return Number.isSafeInteger(key) && key > 0 ? key : NaN
  }
  const companyKey = parseKey(q.companyKey)
  const carKey = parseKey(q.carKey)
  if (Number.isNaN(companyKey) || Number.isNaN(carKey)) {
    return { error: 'Neplatný filtr firmy nebo vozidla.' as const }
  }

  const toExclusive = new Date(to.getTime() + 86_400_000).toISOString().slice(0, 10)
  return {
    from: from.toISOString().slice(0, 10),
    toExclusive,
    prefixes: prefixGroup === 'all' ? [...new Set(Object.values(ORDER_PREFIX_GROUPS).flat())] : ORDER_PREFIX_GROUPS[prefixGroup],
    companyKey,
    carKey,
  }
}

async function loadOrderCheck(sql: ReturnType<typeof getUserSql>, filters: ParsedOrderCheckFilters) {
  // Resolve local midnight first so timestamp parameters enable pruning without shifting the date.
  const [bounds] = await sql`
    SELECT ${filters.from}::text::date::timestamptz AS start_at,
           ${filters.toExclusive}::text::date::timestamptz AS end_at
  `
  const prefixCondition = filters.prefixes.slice(1).reduce(
    (condition, prefix) => sql`${condition} OR upper(substr(S.order_number, 1, 2)) = ${prefix}`,
    sql`upper(substr(S.order_number, 1, 2)) = ${filters.prefixes[0]}`,
  )
  const candidates = sql`
    SELECT DISTINCT S.order_number, C.company_key
    FROM gps.service_base AS S
    LEFT JOIN gps.car_base AS C ON S.car_key = C.car_key
    WHERE S.order_number IS NOT NULL
      AND S.type = 'U'
      AND S.time >= ${bounds.start_at}::timestamptz
      AND S.time < ${bounds.end_at}::timestamptz
      AND (${prefixCondition})
      ${filters.carKey ? sql`AND S.car_key = ${filters.carKey}` : sql``}
      ${filters.companyKey ? sql`AND C.company_key = ${filters.companyKey}` : sql``}
  `
  const candidateRows = await candidates
  const orderNumbers = [...new Set(candidateRows.map(row => String(row.order_number)))]
  if (orderNumbers.length === 0) return []

  const [events, trackRows, sentRows] = await Promise.all([
    sql`
      WITH order_candidates AS (${candidates})
      SELECT S.time, S.type, S.pos_gps, S.order_number, S.car_key,
             C.spz, C.company_key, CO.company,
             MC.name AS city_name, MC.zip, MC.country,
             D.name AS driver_name
      FROM gps.service_base AS S
      INNER JOIN (SELECT DISTINCT order_number FROM order_candidates) AS OC ON OC.order_number = S.order_number
      LEFT JOIN gps.car_base AS C ON S.car_key = C.car_key
      LEFT JOIN provider.company AS CO ON C.company_key = CO.company_key
      LEFT JOIN map.city AS MC ON S.city_key = MC.city_key
      LEFT JOIN gps.driver_base AS D ON S.driver_key = D.driver_key
      WHERE S.time >= ${bounds.start_at}::timestamptz
        AND S.time < ${bounds.end_at}::timestamptz
        AND S.type IN ('L', 'U')
      ORDER BY S.order_number, S.time ASC
    `,
    sql`
      WITH track_points AS (
        SELECT X.order_number, T.pos_gps, T.distance, T.time, T.pos_key,
               row_number() OVER (PARTITION BY X.order_number ORDER BY T.time, T.pos_key) AS point_number,
               count(*) OVER (PARTITION BY X.order_number) AS point_count
        FROM gps.tracking_order AS X
        INNER JOIN gps.tracking_base AS T ON T.pos_key = X.pos_key
        WHERE X.order_number = ANY(${orderNumbers}::text[])
          AND T.time >= ${bounds.start_at}::timestamptz
          AND T.time < ${bounds.end_at}::timestamptz
          AND T.truck_status = 'M'
      )
      SELECT order_number,
             sum(distance) AS distance,
             array_agg(pos_gps ORDER BY time, pos_key) FILTER (
               WHERE point_number = 1
                  OR point_number = point_count
                  OR mod(point_number, greatest(1, ceil(point_count::numeric / 60)::bigint)) = 0
             ) AS coordinates
      FROM track_points
      GROUP BY order_number
    `,
    sql`
      WITH order_candidates AS (${candidates})
      SELECT OC.order_number, CO.company, L.file_name, L.created_time,
             L.sent_time, L.confirmed_time, L.sent_to, L.sent_manually
      FROM order_candidates AS OC
      INNER JOIN gps.wood_system_sent_log AS L
        ON upper(L.intent) = upper(OC.order_number) AND L.company_key = OC.company_key
      LEFT JOIN provider.company AS CO ON CO.company_key = L.company_key
      ORDER BY L.created_time DESC, L.sent_time DESC, L.file_name
    `,
  ])

  const byOrder = new Map<string, {
    orderNumber: string
    carKey: number | null
    companyKey: number | null
    company: string | null
    spz: string | null
    driverName: string | null
    distance: number
    events: OrderCheckEvent[]
    coordinates: string[]
    sentFiles: {
      company: string | null
      fileName: string | null
      createdTime: string | null
      sentTime: string | null
      confirmedTime: string | null
      sentTo: string | null
      sentManually: boolean | null
    }[]
  }>()

  for (const event of events) {
    const key = String(event.order_number)
    let order = byOrder.get(key)
    if (!order) {
      order = {
        orderNumber: key,
        carKey: event.car_key === null ? null : Number(event.car_key),
        companyKey: event.company_key === null ? null : Number(event.company_key),
        company: event.company ?? null,
        spz: event.spz ?? null,
        driverName: event.driver_name ?? null,
        distance: 0,
        events: [],
        coordinates: [],
        sentFiles: [],
      }
      byOrder.set(key, order)
    }
    order.events.push({
      ...event,
      time: event.time instanceof Date ? event.time.toISOString() : String(event.time),
    } as OrderCheckEvent)
  }

  for (const point of trackRows) {
    const order = byOrder.get(String(point.order_number))
    if (!order) continue
    const rawCoordinates: unknown[] = Array.isArray(point.coordinates) ? point.coordinates : []
    for (const rawValue of rawCoordinates) {
      const raw = typeof rawValue === 'string' ? rawValue : ''
      const coords = raw.replace(/^\(|\)$/g, '').split(',')
      if (coords.length === 2 && coords.every((part: string) => Number.isFinite(Number(part)))) {
        order.coordinates.push(`${coords[0].trim()},${coords[1].trim()}`)
      }
    }
    order.distance = Number(point.distance ?? 0)
  }

  const timestamp = (value: unknown) =>
    value instanceof Date ? value.toISOString() : value == null ? null : String(value)

  for (const sent of sentRows) {
    const order = byOrder.get(String(sent.order_number))
    if (!order) continue
    order.sentFiles.push({
      company: sent.company ?? null,
      fileName: sent.file_name ?? null,
      createdTime: timestamp(sent.created_time),
      sentTime: timestamp(sent.sent_time),
      confirmedTime: timestamp(sent.confirmed_time),
      sentTo: sent.sent_to ?? null,
      sentManually: sent.sent_manually ?? null,
    })
  }

  return Array.from(byOrder.values()).sort((a, b) => a.orderNumber.localeCompare(b.orderNumber))
}

export async function truckmanagerRoutes(app: FastifyInstance) {

  app.post('/order-check/prejimka-send', {
    onRequest: [(app as any).authenticate],
    bodyLimit: 10 * 1024 * 1024,
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const schema = z.object({
      from: z.string(), to: z.string(), prefixGroup: z.string(),
      companyKey: z.string(), carKey: z.string().optional(),
      orderNumber: z.string().min(1).max(20).regex(/^[^;\r\n]+$/),
      destination: z.enum(['prejimky', 'gpsdata', 'wood', 'wamm']),
      gps1: z.string().min(1).max(1_000_000),
      gps2: z.string().min(1).max(8_000_000),
      requestId: z.string().uuid(),
    })
    const parsed = schema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: 'Neplatné údaje pro odeslání.' })
    const body = parsed.data
    const filters = parseOrderCheckFilters(body)
    if ('error' in filters) return reply.code(400).send({ error: filters.error })
    if (!filters.companyKey) return reply.code(400).send({ error: 'Vyberte firmu.' })
    const gps1Fields = body.gps1.split(';')
    const gps2Header = body.gps2.split(/\r?\n/, 1)[0].split(';')
    if (gps1Fields[0] !== body.orderNumber || gps1Fields[1] !== body.orderNumber ||
        gps2Header.length !== 3 || gps2Header[0] !== 'H' || gps2Header[1] !== body.orderNumber || gps2Header[2] !== body.orderNumber) {
      return reply.code(400).send({ error: 'Čísla zakázky v CSV neodpovídají vybrané zakázce.' })
    }

    const { userDb, passwordDb, smtpUser, smtpPass } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    try {
      const [bounds] = await sql`
        SELECT ${filters.from}::text::date::timestamptz AS start_at,
               ${filters.toExclusive}::text::date::timestamptz AS end_at
      `
      const [candidate] = await sql`
        SELECT S.car_key, CO.company, CO.id
        FROM gps.service_base S
        JOIN gps.car_base C ON C.car_key = S.car_key
        JOIN provider.company CO ON CO.company_key = C.company_key
        WHERE C.company_key = ${filters.companyKey}
          AND S.order_number = ${body.orderNumber}
          AND upper(substr(S.order_number, 1, 2)) = ANY(${filters.prefixes}::text[])
          AND S.type = 'U'
          AND S.time >= ${bounds.start_at}::timestamptz AND S.time < ${bounds.end_at}::timestamptz
          ${filters.carKey ? sql`AND S.car_key = ${filters.carKey}` : sql``}
        ORDER BY S.time DESC, S.service_key DESC LIMIT 1
      `
      if (!candidate) return reply.code(400).send({ error: 'Zakázka neodpovídá vybrané firmě nebo filtrům.' })

      const [permissions] = await sql`
        SELECT has_table_privilege(current_user, 'gps.wood_system_sent_log', 'INSERT') AS can_insert,
               pg_get_serial_sequence('gps.wood_system_sent_log', 'log_id') AS sequence,
               has_sequence_privilege(current_user, pg_get_serial_sequence('gps.wood_system_sent_log', 'log_id'), 'USAGE') AS sequence_usage,
               has_sequence_privilege(current_user, pg_get_serial_sequence('gps.wood_system_sent_log', 'log_id'), 'UPDATE') AS sequence_update
      `
      if (!permissions.can_insert || !permissions.sequence || (!permissions.sequence_usage && !permissions.sequence_update)) {
        return reply.code(403).send({ error: 'Chybí oprávnění k záznamu odeslání. E-mail nebyl odeslán.' })
      }

      const number = reservePrejimkaSend(body.requestId)
      if (number === null) return reply.code(409).send({ error: 'Tento požadavek již byl zpracován nebo jeho výsledek není znám. Před opakováním ověřte odeslání.' })
      const mail = createPrejimkaMail(number, candidate.company, candidate.id ?? '', body.destination as PrejimkaDestination, body.gps1, body.gps2)
      const transport = nodemailer.createTransport({
        host: process.env.SMTP_HOST ?? 'nweb.euro-sped.cz',
        port: Number(process.env.SMTP_PORT ?? 25),
        secure: false,
        ignoreTLS: true,
        auth: smtpUser ? { user: smtpUser, pass: smtpPass } : undefined,
      })
      try {
        await transport.sendMail(mail)
      } catch (error) {
        updatePrejimkaSend(body.requestId, 'failed')
        request.log.error({ err: error, requestId: body.requestId }, 'Přejímka SMTP send failed')
        return reply.code(502).send({ error: 'Odeslání SMTP selhalo nebo jeho výsledek není znám. Před opakováním ověřte doručení.' })
      } finally {
        transport.close()
      }
      const suffix = String(number).padStart(4, '0')
      try {
        await sql`
          INSERT INTO gps.wood_system_sent_log (company_key, intent, file_name, sent_time, car_key, sent_to, sent_manually)
          VALUES
            (${filters.companyKey}, ${body.orderNumber}, ${`gps1-${suffix}.csv`}, current_timestamp, ${candidate.car_key}, ${PREJIMKA_RECIPIENTS[body.destination].email}, true),
            (${filters.companyKey}, ${body.orderNumber}, ${`gps2-${suffix}.csv`}, current_timestamp, ${candidate.car_key}, ${PREJIMKA_RECIPIENTS[body.destination].email}, true)
        `
      } catch (error) {
        request.log.error({ err: error, requestId: body.requestId, orderNumber: body.orderNumber }, 'Přejímka sent but log failed')
        try {
          updatePrejimkaSend(body.requestId, 'log_failed')
        } catch (statusError) {
          request.log.error({ err: statusError, requestId: body.requestId }, 'Přejímka local status update failed')
        }
        return reply.code(500).send({ error: `E-mail se zakázkou ${body.orderNumber} byl přijat SMTP serverem, ale nepodařilo se uložit záznam o odeslání. Neposílejte jej znovu.` })
      }
      try {
        updatePrejimkaSend(body.requestId, 'sent')
      } catch (error) {
        request.log.error({ err: error, requestId: body.requestId }, 'Přejímka sent but local status update failed')
        return reply.code(500).send({ error: 'E-mail byl přijat SMTP serverem a zaznamenán, ale nepodařilo se uložit místní stav. Neposílejte jej znovu.' })
      }
      return reply.send({ success: true, number })
    } finally {
      await sql.end()
    }
  })

  app.post('/order-check/prejimka-preview', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as OrderCheckFilters & { orders?: unknown }
    const filters = parseOrderCheckFilters(body ?? {})
    if ('error' in filters) return reply.code(400).send({ error: filters.error })
    if (!filters.companyKey || !Array.isArray(body.orders) || body.orders.length === 0 ||
      body.orders.some(order => typeof order !== 'string' || !order.trim() || /[;\r\n]/.test(order))) {
      return reply.code(400).send({ error: 'Vyberte firmu a platné zakázky pro přípravu CSV.' })
    }
    const orders = [...new Set<string>(body.orders)]
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    try {
      const [bounds] = await sql`
        SELECT ${filters.from}::text::date::timestamptz AS start_at,
               ${filters.toExclusive}::text::date::timestamptz AS end_at
      `
      const candidates = await sql`
        SELECT DISTINCT S.order_number
        FROM gps.service_base S
        JOIN gps.car_base C ON C.car_key = S.car_key
        WHERE C.company_key = ${filters.companyKey}
          AND S.order_number = ANY(${orders}::text[])
          AND upper(substr(S.order_number, 1, 2)) = ANY(${filters.prefixes}::text[])
          AND S.type = 'U'
          AND S.time >= ${bounds.start_at}::timestamptz AND S.time < ${bounds.end_at}::timestamptz
          ${filters.carKey ? sql`AND S.car_key = ${filters.carKey}` : sql``}
      `
      if (candidates.length !== orders.length) {
        return reply.code(400).send({ error: 'Některé zakázky neodpovídají vybrané firmě nebo filtrům. Načtěte výsledky znovu.' })
      }
      const events = await sql`
        SELECT S.order_number, S.type, to_char(S.time, 'YYYY-MM-DD HH24:MI') AS time,
               S.pos_gps::text AS position, C.spz
        FROM gps.service_base S
        JOIN gps.car_base C ON C.car_key = S.car_key
        WHERE C.company_key = ${filters.companyKey}
          AND S.order_number = ANY(${orders}::text[])
          AND S.type IN ('L', 'U')
          AND S.time >= ${bounds.start_at}::timestamptz AND S.time < ${bounds.end_at}::timestamptz
        ORDER BY S.order_number, S.time, S.service_key
      `
      const points = await sql`
        SELECT X.order_number, to_char(T.time, 'YYYY-MM-DD HH24:MI') AS time,
               T.pos_gps::text AS position,
               sum(coalesce(T.distance, 0)::numeric) OVER (PARTITION BY X.order_number)::text AS distance
        FROM gps.tracking_order X
        JOIN gps.tracking_base T ON T.pos_key = X.pos_key
        JOIN gps.car_base C ON C.car_key = T.car_key
        WHERE C.company_key = ${filters.companyKey}
          AND X.order_number = ANY(${orders}::text[])
          AND T.time >= ${bounds.start_at}::timestamptz AND T.time < ${bounds.end_at}::timestamptz
          AND T.truck_status = 'M'
        ORDER BY X.order_number, T.time, T.pos_key
      `
      const eventsByOrder = new Map<string, PrejimkaEvent[]>()
      const pointsByOrder = new Map<string, (PrejimkaPoint & { distance: string })[]>()
      for (const event of events) {
        const order = String(event.order_number)
        const list = eventsByOrder.get(order) ?? []
        list.push({ type: event.type, time: event.time, position: event.position, spz: event.spz })
        eventsByOrder.set(order, list)
      }
      for (const point of points) {
        const order = String(point.order_number)
        const list = pointsByOrder.get(order) ?? []
        list.push({ time: point.time, position: point.position, distance: point.distance })
        pointsByOrder.set(order, list)
      }
      const results = orders.map(orderNumber => {
        const orderEvents = eventsByOrder.get(orderNumber) ?? []
        const orderPoints = pointsByOrder.get(orderNumber) ?? []
        const distance = orderPoints[0]?.distance ?? '0'
        try {
          return {
            orderNumber,
            pointCount: orderPoints.length,
            ...createPrejimkaCsv(orderNumber, orderEvents, orderPoints, distance),
          }
        } catch (error) {
          throw new Error(`Zakázka ${orderNumber}: ${error instanceof Error ? error.message : String(error)}`)
        }
      })
      return reply.send(results)
    } finally {
      await sql.end()
    }
  })

  // GET /api/truckmanager/order-check/options
  app.get('/order-check/options', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    try {
      const [companies, cars] = await Promise.all([
        sql`
          SELECT DISTINCT C.company_key, C.company
          FROM gps.car_base AS CB
          INNER JOIN gps.export_car AS EC ON CB.car_key = EC.car_key
          INNER JOIN provider.company AS C ON CB.company_key = C.company_key
          WHERE EC.export_type = 'PREJM'
          ORDER BY C.company
        `,
        sql`
          SELECT DISTINCT CB.car_key, CB.company_key, CB.spz, C.company
          FROM gps.car_base AS CB
          INNER JOIN gps.export_car AS EC ON CB.car_key = EC.car_key
          INNER JOIN provider.company AS C ON CB.company_key = C.company_key
          WHERE EC.export_type = 'PREJM'
          ORDER BY C.company, CB.spz
        `,
      ])
      return reply.send({ companies, cars })
    } finally {
      await sql.end()
    }
  })

  // POST /api/truckmanager/order-check
  app.post('/order-check', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as OrderCheckFilters
    const filters = parseOrderCheckFilters(body ?? {})
    if ('error' in filters) return reply.code(400).send({ error: filters.error })
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    try {
      return reply.send(await loadOrderCheck(sql, filters))
    } finally {
      await sql.end()
    }
  })

  // POST /api/truckmanager/order-check/export
  app.post('/order-check/export', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as OrderCheckFilters
    const filters = parseOrderCheckFilters(body ?? {})
    if ('error' in filters) return reply.code(400).send({ error: filters.error })
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    try {
      const rows = await loadOrderCheck(sql, filters)
      const workbook = new ExcelJS.Workbook()
      const sheet = workbook.addWorksheet('Kontrola objednávek')
      sheet.columns = [
        { header: 'Poř.', key: 'index', width: 7 },
        { header: 'Firma', key: 'company', width: 30 },
        { header: 'SPZ', key: 'spz', width: 14 },
        { header: 'Řidič', key: 'driver', width: 24 },
        { header: 'Zakázka', key: 'order', width: 20 },
        { header: 'Km', key: 'distance', width: 12 },
        { header: 'Pozice', key: 'events', width: 70 },
        { header: 'Odesláno', key: 'sent', width: 70 },
      ]
      rows.forEach((row, index) => {
        sheet.addRow({
          index: index + 1,
          company: row.company ?? '',
          spz: row.spz ?? '',
          driver: row.driverName ?? '',
          order: row.orderNumber,
          distance: row.distance,
          events: row.events.map(event =>
            `${event.type === 'L' ? 'Nakl.' : 'Vykl.'} ${event.city_name ?? ''}, ${event.zip ?? ''} ${event.country ?? ''} ${event.time}`,
          ).join('\n'),
          sent: row.sentFiles.length
            ? row.sentFiles.map(file =>
              `${file.company ?? 'Neznámá firma'} | ${file.fileName ?? 'Bez názvu souboru'}${file.createdTime ? ` | Vytvořeno: ${file.createdTime}` : ''} | ${file.sentTime ? `Odesláno: ${file.sentTime}` : 'Bez času odeslání'}${file.sentTo ? ` | Cíl: ${file.sentTo}` : ''}${file.confirmedTime ? ` | Potvrzeno: ${file.confirmedTime}` : ''}${file.sentManually ? ' | Ručně' : ''}`,
            ).join('\n')
            : 'Žádný záznam',
        })
      })
      sheet.getRow(1).font = { bold: true }
      sheet.views = [{ state: 'frozen', ySplit: 1 }]
      const buffer = await workbook.xlsx.writeBuffer()
      return reply
        .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        .header('Content-Disposition', 'attachment; filename="kontrola-objednavek.xlsx"')
        .send(Buffer.from(buffer))
    } finally {
      await sql.end()
    }
  })

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
