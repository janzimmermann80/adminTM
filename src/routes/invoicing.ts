import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { getUserSql } from '../db/userSql.js'
import nodemailer from 'nodemailer'
import { generateInvoicePdf } from '../services/invoicePdf.js'
import QRCode from 'qrcode'

export const SERIES_NAMES: Record<number, string> = {
  1: '1-Internet', 2: '2-Modem Euro', 3: '3-Modem CZ', 4: '4-INFAX',
  5: '-----------', 6: '6-Software', 7: '7-SMS', 8: '8-Školení', 9: '9-Reklama',
}

export const PAYMENT_METHODS: Record<string, string> = {
  T: 'Převod', D: 'Dobírka', C: 'Hotově',
}

interface InvoiceListQuery {
  year?: string
  company_key?: string
  date_from?: string
  date_to?: string
  series?: string
  settled?: string    // 'yes' | 'no'
  limit?: string
  offset?: string
}

interface InvoiceItem {
  name: string
  price_unit: number
  quantity: number
  discount: number
  vat_rate: number
}

interface CreateInvoiceBody {
  company_keys: number[]      // firmy na fakturu
  issued: string              // YYYY-MM-DD
  fulfilment: string          // YYYY-MM-DD
  maturity: string            // YYYY-MM-DD
  series: number              // 1-9
  payment_method: string      // T | D | C
  year: number
  currency: string            // CZK | EUR | SKK
  curr_value: number          // kurz (1 pro CZK)
  items: InvoiceItem[]        // vybrané položky
}

// Tělo pro vystavení/editaci jedné faktury (z detailu firmy)
interface SingleInvoiceBody {
  company_key?: number
  issued: string
  fulfilment: string
  maturity: string
  settlement?: string | null
  series: number
  payment_method: string
  currency: string
  curr_value: number
  proforma_number?: number | null
  demand_notes?: number
  items: InvoiceItem[]
}

// Výpočet součtů faktury z položek (sdílené pro create/update)
function computeInvoiceTotals(items: InvoiceItem[], currValue: number) {
  let priceLow = 0, priceHigh = 0, vatLow = 0, vatHigh = 0
  let vatLowRate = 0, vatHighRate = 0
  const calcItems: Array<{
    name: string; priceUnit: number; discount: number; priceSale: number
    quantity: number; price: number; vatRate: number; vat: number; priceTotal: number
  }> = []

  for (const item of items) {
    const disc = (100 - item.discount) / 100
    const priceSale = item.price_unit * disc
    const price = priceSale * item.quantity
    const vatId = (item.vat_rate + 100) / 100
    const priceTotal = Math.round(price * vatId * 100) / 100
    const vat = priceTotal - price

    if (item.vat_rate < 17) {
      vatLowRate = item.vat_rate
      vatLow += vat
      priceLow += price
    } else {
      vatHighRate = item.vat_rate
      vatHigh += vat
      priceHigh += price
    }

    calcItems.push({ name: item.name, priceUnit: item.price_unit, discount: item.discount, priceSale, quantity: item.quantity, price, vatRate: item.vat_rate, vat, priceTotal })
  }

  const priceSum = priceLow + priceHigh
  const totalSum = priceSum + vatLow + vatHigh
  return {
    priceLow, priceHigh, vatLow, vatHigh, vatLowRate, vatHighRate, priceSum, totalSum,
    currPrice: priceSum * currValue,
    currTotal: totalSum * currValue,
    currVatLow: vatLow * currValue,
    currVatHigh: vatHigh * currValue,
    calcItems,
  }
}

// Načtení detailu faktury + položek + QR (sdílené pro detail, PDF i email)
async function loadInvoiceData(sql: any, id: string | number): Promise<any | null> {
  const [invoice, items] = await Promise.all([
    sql`
      SELECT I.invoice_key, I.year, I.number, I.series, I.provider,
             I.issued, I.fulfilment, I.maturity, I.settlement, I.cancellation,
             I.price, I.price_low, I.price_high, I.vat_low_rate, I.vat_low,
             I.vat_high_rate, I.vat_high, I.total, I.curr_price, I.curr_total,
             I.currency, I.rate, I.payment_method, I.demand_notes, I.proforma_number,
             C.company_key, C.id AS company_id, C.company, C.street, C.city, C.zip,
             C.country, C.cin, C.tin, C.bank, C.account,
             CIA.company AS inv_company, CIA.street AS inv_street,
             CIA.city AS inv_city, CIA.zip AS inv_zip, CIA.country AS inv_country
      FROM provider.invoice AS I
      LEFT JOIN provider.company AS C ON I.company_key = C.company_key
      LEFT JOIN provider.company_invoice_address AS CIA ON C.company_key = CIA.company_key
      WHERE I.invoice_key = ${id}
    `,
    sql`
      SELECT item_key, name, price_unit, discount, price_sale,
             quantity, price, vat_rate, vat, price_total, currency
      FROM provider.invoice_item
      WHERE invoice_key = ${id}
      ORDER BY item_key
    `,
  ])
  if (invoice.length === 0) return null
  const inv0 = invoice[0] as any
  const qrVs = `${inv0.series}${String(inv0.company_id ?? '').slice(-5)}${String(inv0.number).padStart(4, '0')}`
  const qrAmt = Number(inv0.curr_total ?? inv0.total ?? 0).toFixed(2)
  const qrCcy = String(inv0.currency ?? 'CZK')
  const ibanRaw = qrCcy === 'EUR' ? 'CZ7703000000000349438195' : 'CZ2703000000000226164811'
  const qrStr = `SPD*1.0*ACC:${ibanRaw}*AM:${qrAmt}*CC:${qrCcy}*X-VS:${qrVs}`
  const qr_data_url = await QRCode.toDataURL(qrStr, { width: 160, margin: 1, color: { dark: '#000000', light: '#ffffff' } }).catch(() => '')
  return { ...inv0, items, qr_data_url }
}

export async function invoicingRoutes(app: FastifyInstance) {

  // GET /api/invoicing/services — položky pro fakturu
  app.get('/services', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb, provider } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    try {
      const rows = await sql`
        SELECT service_key, name, price, discount, vat_rate
        FROM provider.invoice_service
        WHERE provider = ${provider}
        ORDER BY service_key
      `
      return reply.send(rows)
    } finally {
      await sql.end()
    }
  })

  // GET /api/invoicing/meta — série + platební metody
  app.get('/meta', {
    onRequest: [(app as any).authenticate],
  }, async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.send({ series: SERIES_NAMES, payment_methods: PAYMENT_METHODS })
  })

  // GET /api/invoicing/cnb-rate/:code — denní kurz ČNB pro danou měnu (na 1 jednotku)
  app.get('/cnb-rate/:code', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { code } = request.params as { code: string }
    const upper = (code ?? '').trim().toUpperCase()
    if (upper === 'CZK') return reply.send({ code: 'CZK', rate: 1, date: '' })
    try {
      const res = await fetch(
        'https://www.cnb.cz/cs/financni-trhy/devizovy-trh/kurzy-devizoveho-trhu/kurzy-devizoveho-trhu/denni_kurz.txt',
      )
      if (!res.ok) throw new Error('CNB HTTP ' + res.status)
      const txt = await res.text()
      const lines = txt.split('\n')
      // 1. řádek: "DD.MM.YYYY #NNN"
      const date = (lines[0].trim().match(/^\d{2}\.\d{2}\.\d{4}/)?.[0]) ?? ''
      // Řádek formátu: země|měna|množství|kód|kurz
      const line = lines.find((l) => l.split('|')[3] === upper)
      if (!line) return reply.code(404).send({ error: `Měna ${upper} nenalezena v kurzovním lístku ČNB` })
      const parts = line.trim().split('|')
      const amount = Number(parts[2].replace(',', '.')) || 1
      const rate = Number(parts[4].replace(',', '.')) / amount
      if (!rate || !isFinite(rate)) throw new Error('bad rate')
      return reply.send({ code: upper, rate: Math.round(rate * 1000) / 1000, date })
    } catch (e: any) {
      return reply.code(502).send({ error: 'Nepodařilo se načíst kurz ČNB: ' + (e?.message ?? 'chyba') })
    }
  })

  // GET /api/invoicing — seznam faktur s filtry
  app.get('/', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    const q = request.query as InvoiceListQuery
    const limit = Math.min(Number(q.limit ?? 25), 200)
    const offset = Number(q.offset ?? 0)

    const whereClauses: string[] = []
    const params: unknown[] = []
    let p = 1
    const addParam = (v: unknown) => { params.push(v); return `$${p++}` }

    if (q.year) whereClauses.push(`I.year = ${addParam(Number(q.year))}`)
    if (q.company_key) whereClauses.push(`I.company_key = ${addParam(Number(q.company_key))}`)
    if (q.date_from) whereClauses.push(`I.issued >= ${addParam(q.date_from)}`)
    if (q.date_to) whereClauses.push(`I.issued <= ${addParam(q.date_to)}`)
    if (q.series) whereClauses.push(`I.series = ${addParam(Number(q.series))}`)
    if (q.settled === 'yes') whereClauses.push(`I.settlement IS NOT NULL`)
    if (q.settled === 'no') whereClauses.push(`I.settlement IS NULL AND I.cancellation IS NULL`)

    const where = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : ''

    const countQuery = `
      SELECT count(*)::int AS count
      FROM provider.invoice AS I
      ${where}
    `
    const dataQuery = `
      SELECT I.invoice_key, I.year, I.number, I.series, I.provider,
             I.issued, I.fulfilment, I.maturity, I.settlement, I.cancellation,
             I.price, I.total, I.curr_total, I.currency, I.payment_method,
             I.demand_notes, I.proforma_number, I.rate,
             C.company_key, C.id, C.company
      FROM provider.invoice AS I
      LEFT JOIN provider.company AS C ON I.company_key = C.company_key
      ${where}
      ORDER BY I.issued DESC, I.number DESC
      LIMIT $${p++} OFFSET $${p++}
    `

    const countParams = [...params]
    const dataParams = [...params, limit, offset]

    try {
      const [countResult, dataResult] = await Promise.all([
        sql.unsafe(countQuery, countParams as any[]),
        sql.unsafe(dataQuery, dataParams as any[]),
      ])
      return reply.send({ total: countResult[0]?.count ?? 0, limit, offset, data: dataResult })
    } finally {
      await sql.end()
    }
  })

  // GET /api/invoicing/:id — detail faktury + položky
  app.get('/:id', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    const { id } = request.params as { id: string }

    try {
      const data = await loadInvoiceData(sql, id)
      if (!data) return reply.code(404).send({ error: 'Faktura nenalezena' })
      return reply.send(data)
    } finally {
      await sql.end()
    }
  })

  // POST /api/invoicing/:id/send-email — odeslání faktury emailem jako PDF příloha
  app.post('/:id/send-email', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    const { id } = request.params as { id: string }
    const { to, cc, subject, body } = request.body as {
      to: string; cc?: string; subject: string; body: string
    }

    try {
      const data = await loadInvoiceData(sql, id)
      if (!data) return reply.code(404).send({ error: 'Faktura nenalezena' })

      const pdfBuffer = await generateInvoicePdf(data)

      const vs = `${data.series}${String(data.company_id ?? '').slice(-5)}${String(data.number).padStart(4, '0')}`
      const filename = `faktura_${data.year}_${vs}.pdf`

      const transporter = process.env.SMTP_HOST
        ? nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: Number(process.env.SMTP_PORT ?? 587),
            secure: false,
            auth: process.env.SMTP_USER
              ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
              : undefined,
          })
        : nodemailer.createTransport({
            sendmail: true,
            newline: 'unix',
            path: process.env.SENDMAIL_PATH ?? '/usr/sbin/sendmail',
          })

      await transporter.sendMail({
        from: '"1. Česká obchodní, s.r.o." <info@truckmanager.eu>',
        to,
        cc: cc || undefined,
        subject,
        html: body.replace(/\n/g, '<br>'),
        text: body,
        attachments: [{ filename, content: pdfBuffer, contentType: 'application/pdf' }],
      })

      return reply.send({ ok: true })
    } catch (err: any) {
      request.log.error({ err }, 'send-email failed')
      return reply.code(500).send({ error: err.message })
    } finally {
      await sql.end()
    }
  })

  // GET /api/invoicing/:id/email-contacts — kontakty firmy pro předvyplnění emailu
  app.get('/:id/email-contacts', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    const { id } = request.params as { id: string }

    try {
      const contacts = await sql`
        SELECT ct.value
        FROM provider.invoice I
        JOIN provider.contact ct ON ct.company_key = I.company_key
        WHERE I.invoice_key = ${id}
          AND ct.value IS NOT NULL AND ct.value != ''
          AND ct.type IN ('U', 'E')
        ORDER BY ct.send_tips = 't' DESC, ct.contact_key
        LIMIT 5
      `
      return reply.send(contacts.map((c: any) => c.value))
    } catch (err: any) {
      return reply.code(500).send({ error: err.message })
    } finally {
      await sql.end()
    }
  })

  // POST /api/invoicing/invoice — vystavení faktury pro jednu nebo více firem
  app.post('/invoice', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb, provider } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    const body = request.body as CreateInvoiceBody

    if (!body.company_keys?.length || !body.items?.length) {
      await sql.end()
      return reply.code(400).send({ error: 'Chybí firmy nebo položky faktury' })
    }

    const currValue = body.curr_value || 1

    // Výpočet součtů
    let priceLow = 0, priceHigh = 0, vatLow = 0, vatHigh = 0
    let vatLowRate = 0, vatHighRate = 0
    const calcItems: Array<{
      name: string; priceUnit: number; discount: number; priceSale: number
      quantity: number; price: number; vatRate: number; vat: number; priceTotal: number
    }> = []

    for (const item of body.items) {
      const disc = (100 - item.discount) / 100
      const priceSale = item.price_unit * disc
      const price = priceSale * item.quantity
      const vatId = (item.vat_rate + 100) / 100
      const priceTotal = Math.round(price * vatId * 100) / 100
      const vat = priceTotal - price

      if (item.vat_rate < 17) {
        vatLowRate = item.vat_rate
        vatLow += vat
        priceLow += price
      } else {
        vatHighRate = item.vat_rate
        vatHigh += vat
        priceHigh += price
      }

      calcItems.push({ name: item.name, priceUnit: item.price_unit, discount: item.discount, priceSale, quantity: item.quantity, price, vatRate: item.vat_rate, vat, priceTotal })
    }

    const priceSum = priceLow + priceHigh
    const totalSum = priceSum + vatLow + vatHigh
    const currPrice = priceSum / currValue
    const currTotal = totalSum / currValue
    const currVatLow = vatLow / currValue
    const currVatHigh = vatHigh / currValue

    try {
      // Zjisti nejvyšší číslo faktury pro daný rok a měnu
      const maxResult = await sql`
        SELECT MAX(number) AS max_num
        FROM provider.invoice
        WHERE year = ${body.year} AND currency = ${body.currency} AND provider = ${provider}
      `
      let nextNum = maxResult[0]?.max_num ? Number(maxResult[0].max_num) + 1
        : (body.currency === 'CZK' ? 1 : 9000)

      const createdKeys: number[] = []
      const errors: string[] = []

      for (const companyKey of body.company_keys) {
        try {
          const [inv] = await sql`
            INSERT INTO provider.invoice (
              company_key, year, number, provider, series, issued, maturity, fulfilment,
              price, price_low, price_high, vat_low_rate, vat_low, vat_high_rate, vat_high,
              total, curr_price, curr_vat_low, curr_vat_high, curr_total,
              payment_method, currency, rate, demand_notes
            ) VALUES (
              ${companyKey}, ${body.year}, ${nextNum}, ${provider}, ${body.series},
              ${body.issued}, ${body.maturity}, ${body.fulfilment},
              ${priceSum}, ${priceLow}, ${priceHigh}, ${vatLowRate}, ${vatLow},
              ${vatHighRate}, ${vatHigh}, ${totalSum},
              ${currPrice}, ${currVatLow}, ${currVatHigh}, ${currTotal},
              ${body.payment_method}, ${body.currency}, ${currValue}, 0
            )
            RETURNING invoice_key
          `

          for (const ci of calcItems) {
            await sql`
              INSERT INTO provider.invoice_item (
                invoice_key, name, price_unit, discount, price_sale,
                quantity, price, vat_rate, vat, price_total, currency
              ) VALUES (
                ${inv.invoice_key}, ${ci.name}, ${ci.priceUnit / currValue},
                ${ci.discount}, ${ci.priceSale / currValue},
                ${ci.quantity}, ${ci.price / currValue},
                ${ci.vatRate}, ${ci.vat / currValue}, ${ci.priceTotal / currValue},
                ${body.currency}
              )
            `
          }

          createdKeys.push(inv.invoice_key)
          nextNum++
        } catch (err: any) {
          errors.push(`company_key=${companyKey}: ${err.message}`)
        }
      }

      return reply.code(201).send({ created: createdKeys.length, invoice_keys: createdKeys, errors })
    } finally {
      await sql.end()
    }
  })

  // PUT /api/invoicing/:id/settle — zaplatit fakturu
  app.put('/:id/settle', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    const { id } = request.params as { id: string }
    const { date } = request.body as { date?: string }

    try {
      await sql`
        UPDATE provider.invoice SET settlement = ${date ?? new Date().toISOString().slice(0, 10)}
        WHERE invoice_key = ${id}
      `
      return reply.send({ success: true })
    } finally {
      await sql.end()
    }
  })

  // PUT /api/invoicing/:id/cancel — storno faktury
  app.put('/:id/cancel', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    const { id } = request.params as { id: string }

    try {
      await sql`
        UPDATE provider.invoice SET cancellation = ${new Date().toISOString().slice(0, 10)}
        WHERE invoice_key = ${id}
      `
      return reply.send({ success: true })
    } finally {
      await sql.end()
    }
  })

  // PUT /api/invoicing/:id/demands — inkrementovat upomínky
  app.put('/:id/demands', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    const { id } = request.params as { id: string }

    try {
      await sql`
        UPDATE provider.invoice SET demand_notes = COALESCE(demand_notes, 0) + 1
        WHERE invoice_key = ${id}
      `
      return reply.send({ success: true })
    } finally {
      await sql.end()
    }
  })

  // POST /api/invoicing/create — vystavení jedné faktury z detailu firmy
  app.post('/create', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb, provider } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    const body = request.body as SingleInvoiceBody

    if (!body.company_key || !body.items?.length) {
      await sql.end()
      return reply.code(400).send({ error: 'Chybí firma nebo položky faktury' })
    }

    const currValue = body.curr_value || 1
    const year = Number(String(body.issued).slice(0, 4)) || new Date().getFullYear()
    const c = computeInvoiceTotals(body.items, currValue)

    try {
      const maxResult = await sql`
        SELECT MAX(number) AS max_num
        FROM provider.invoice
        WHERE year = ${year} AND currency = ${body.currency} AND provider = ${provider}
      `
      const nextNum = maxResult[0]?.max_num ? Number(maxResult[0].max_num) + 1
        : (body.currency === 'CZK' ? 1 : 9000)

      const [inv] = await sql`
        INSERT INTO provider.invoice (
          company_key, year, number, provider, series, issued, maturity, fulfilment, settlement,
          price, price_low, price_high, vat_low_rate, vat_low, vat_high_rate, vat_high,
          total, curr_price, curr_vat_low, curr_vat_high, curr_total,
          payment_method, currency, rate, demand_notes, proforma_number
        ) VALUES (
          ${body.company_key}, ${year}, ${nextNum}, ${provider}, ${body.series},
          ${body.issued}, ${body.maturity}, ${body.fulfilment}, ${body.settlement ?? null},
          ${c.priceSum}, ${c.priceLow}, ${c.priceHigh}, ${c.vatLowRate}, ${c.vatLow},
          ${c.vatHighRate}, ${c.vatHigh}, ${c.totalSum},
          ${c.currPrice}, ${c.currVatLow}, ${c.currVatHigh}, ${c.currTotal},
          ${body.payment_method}, ${body.currency}, ${currValue}, ${body.demand_notes ?? 0},
          ${body.proforma_number ?? null}
        )
        RETURNING invoice_key
      `

      for (const ci of c.calcItems) {
        await sql`
          INSERT INTO provider.invoice_item (
            invoice_key, name, price_unit, discount, price_sale,
            quantity, price, vat_rate, vat, price_total, currency
          ) VALUES (
            ${inv.invoice_key}, ${ci.name}, ${ci.priceUnit},
            ${ci.discount}, ${ci.priceSale},
            ${ci.quantity}, ${ci.price},
            ${ci.vatRate}, ${ci.vat}, ${ci.priceTotal},
            ${body.currency}
          )
        `
      }

      return reply.code(201).send({ invoice_key: inv.invoice_key })
    } finally {
      await sql.end()
    }
  })

  // PUT /api/invoicing/:id — editace faktury (přepočítá součty i položky)
  app.put('/:id', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    const { id } = request.params as { id: string }
    const body = request.body as SingleInvoiceBody

    if (!body.items?.length) {
      await sql.end()
      return reply.code(400).send({ error: 'Faktura musí mít alespoň jednu položku' })
    }

    const currValue = body.curr_value || 1
    const c = computeInvoiceTotals(body.items, currValue)

    try {
      const upd = await sql`
        UPDATE provider.invoice SET
          issued = ${body.issued}, fulfilment = ${body.fulfilment}, maturity = ${body.maturity},
          settlement = ${body.settlement ?? null}, series = ${body.series},
          payment_method = ${body.payment_method}, currency = ${body.currency}, rate = ${currValue},
          proforma_number = ${body.proforma_number ?? null}, demand_notes = ${body.demand_notes ?? 0},
          price = ${c.priceSum}, price_low = ${c.priceLow}, price_high = ${c.priceHigh},
          vat_low_rate = ${c.vatLowRate}, vat_low = ${c.vatLow},
          vat_high_rate = ${c.vatHighRate}, vat_high = ${c.vatHigh}, total = ${c.totalSum},
          curr_price = ${c.currPrice}, curr_vat_low = ${c.currVatLow},
          curr_vat_high = ${c.currVatHigh}, curr_total = ${c.currTotal}
        WHERE invoice_key = ${id}
        RETURNING invoice_key
      `
      if (upd.length === 0) return reply.code(404).send({ error: 'Faktura nenalezena' })

      await sql`DELETE FROM provider.invoice_item WHERE invoice_key = ${id}`
      for (const ci of c.calcItems) {
        await sql`
          INSERT INTO provider.invoice_item (
            invoice_key, name, price_unit, discount, price_sale,
            quantity, price, vat_rate, vat, price_total, currency
          ) VALUES (
            ${id}, ${ci.name}, ${ci.priceUnit},
            ${ci.discount}, ${ci.priceSale},
            ${ci.quantity}, ${ci.price},
            ${ci.vatRate}, ${ci.vat}, ${ci.priceTotal},
            ${body.currency}
          )
        `
      }

      return reply.send({ invoice_key: Number(id), success: true })
    } finally {
      await sql.end()
    }
  })

  // DELETE /api/invoicing/:id — smazání faktury i s položkami
  app.delete('/:id', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    const { id } = request.params as { id: string }

    try {
      await sql`DELETE FROM provider.invoice_item WHERE invoice_key = ${id}`
      await sql`DELETE FROM provider.invoice WHERE invoice_key = ${id}`
      return reply.send({ success: true })
    } finally {
      await sql.end()
    }
  })

  // GET /api/invoicing/:id/pdf — vygenerování PDF faktury
  app.get('/:id/pdf', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    const { id } = request.params as { id: string }
    try {
      const data = await loadInvoiceData(sql, id)
      if (!data) return reply.code(404).send({ error: 'Faktura nenalezena' })
      const vs = `${data.series}${String(data.company_id ?? '').slice(-5)}${String(data.number).padStart(4, '0')}`
      const filename = `faktura_${data.year}_${vs}.pdf`
      const pdfBuffer = await generateInvoicePdf(data)
      return reply
        .header('Content-Type', 'application/pdf')
        .header('Content-Disposition', `inline; filename="${filename}"`)
        .send(pdfBuffer)
    } catch (err: any) {
      request.log.error({ err }, 'invoice pdf failed')
      return reply.code(500).send({ error: err.message })
    } finally {
      await sql.end()
    }
  })
}