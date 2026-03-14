import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { getUserSql } from '../db/userSql.js'
import { parseCamt053 } from '../services/camt053Parser.js'
import { isFinsta, parseFinsta } from '../services/finstaParser.js'
import multipart from '@fastify/multipart'
import db from '../db/bankDb.js'
import iconv from 'iconv-lite'

const stmtInsertStatement = db.prepare(`
  INSERT OR IGNORE INTO bank_statements
    (filename, account_iban, account_number, period_from, period_to,
     opening_balance, closing_balance, currency)
  VALUES (@filename, @account_iban, @account_number, @period_from, @period_to,
          @opening_balance, @closing_balance, @currency)
`)

const stmtGetStatementByFilename = db.prepare(
  'SELECT id FROM bank_statements WHERE filename = ?'
)

const stmtInsertTransaction = db.prepare(`
  INSERT INTO bank_transactions
    (statement_id, entry_ref, transaction_date, value_date, amount, currency,
     credit_debit, counterparty_name, counterparty_iban, vs, ks, ss, remittance_info)
  VALUES (@statement_id, @entry_ref, @transaction_date, @value_date, @amount, @currency,
          @credit_debit, @counterparty_name, @counterparty_iban, @vs, @ks, @ss, @remittance_info)
`)

export async function bankRoutes(app: FastifyInstance) {
  await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } })

  // POST /api/bank/upload-xml — nahrání jednoho nebo více CAMT.053 XML výpisů
  app.post('/upload-xml', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const pgSql = getUserSql(userDb, passwordDb)

    let imported = 0
    let skipped = 0
    const errors: string[] = []

    try {
      const parts = request.parts()
      for await (const part of parts) {
        if (part.type !== 'file') continue
        const filename = part.filename || `upload_${Date.now()}.xml`

        const chunks: Buffer[] = []
        for await (const chunk of part.file) chunks.push(chunk)
        const rawBuffer = Buffer.concat(chunks)
        // Detekce encodingu z XML hlavičky (windows-1250, iso-8859-2, apod.)
        const encodingMatch = rawBuffer.slice(0, 200).toString('ascii').match(/encoding=["']([^"']+)["']/i)
        const encoding = encodingMatch ? encodingMatch[1] : 'utf-8'
        const xmlContent = iconv.decode(rawBuffer, encoding)

        const existing = stmtGetStatementByFilename.get(filename) as any
        if (existing) { skipped++; continue }

        try {
          const stmt = isFinsta(xmlContent) ? parseFinsta(xmlContent) : parseCamt053(xmlContent)

          const insertStmt = db.transaction(() => {
            stmtInsertStatement.run({
              filename,
              account_iban: stmt.accountIban || null,
              account_number: stmt.accountNumber || null,
              period_from: stmt.periodFrom || null,
              period_to: stmt.periodTo || null,
              opening_balance: stmt.openingBalance,
              closing_balance: stmt.closingBalance,
              currency: stmt.currency,
            })
            const saved = stmtGetStatementByFilename.get(filename) as any
            for (const tx of stmt.transactions) {
              stmtInsertTransaction.run({
                statement_id: saved.id,
                entry_ref: tx.entryRef || null,
                transaction_date: tx.transactionDate || null,
                value_date: tx.valueDate || null,
                amount: tx.amount,
                currency: tx.currency,
                credit_debit: tx.creditDebit,
                counterparty_name: tx.counterpartyName || null,
                counterparty_iban: tx.counterpartyIban || null,
                vs: tx.vs || null,
                ks: tx.ks || null,
                ss: tx.ss || null,
                remittance_info: tx.remittanceInfo || null,
              })
            }
            return saved.id
          })

          const statementId = insertStmt()
          await autoMatchInvoices(pgSql, statementId)
          imported++
        } catch (parseErr: any) {
          errors.push(`${filename}: ${parseErr.message}`)
        }
      }

      return reply.send({ imported, skipped, errors })
    } catch (err: any) {
      return reply.status(500).send({ error: err.message })
    } finally {
      await pgSql.end()
    }
  })

  // GET /api/bank/statements — seznam výpisů
  app.get('/statements', {
    onRequest: [(app as any).authenticate],
  }, async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const rows = db.prepare(`
        SELECT s.*,
               COUNT(t.id) AS tx_count,
               COUNT(t.matched_invoice_id) AS matched_count
        FROM bank_statements s
        LEFT JOIN bank_transactions t ON t.statement_id = s.id
        GROUP BY s.id
        ORDER BY s.period_from DESC, s.downloaded_at DESC
      `).all()
      return reply.send(rows)
    } catch (err: any) {
      return reply.status(500).send({ error: err.message })
    }
  })

  // GET /api/bank/statements/:id — detail výpisu + transakce
  app.get('/statements/:id', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const pgSql = getUserSql(userDb, passwordDb)
    const { id } = request.params as { id: string }

    try {
      const stmt = db.prepare('SELECT * FROM bank_statements WHERE id = ?').get(Number(id)) as any
      if (!stmt) return reply.status(404).send({ error: 'Výpis nenalezen' })

      const transactions = db.prepare(`
        SELECT * FROM bank_transactions WHERE statement_id = ?
        ORDER BY transaction_date DESC, id
      `).all(Number(id)) as any[]

      const matchedIds = transactions
        .filter(t => t.matched_invoice_id)
        .map(t => t.matched_invoice_id)

      let invoiceMap: Record<number, any> = {}
      if (matchedIds.length > 0) {
        const invoices = await pgSql`
          SELECT i.invoice_key, i.number, i.year, i.total, c.company
          FROM provider.invoice i
          LEFT JOIN provider.company c ON i.company_key = c.company_key
          WHERE i.invoice_key = ANY(${matchedIds})
        `
        for (const inv of invoices) invoiceMap[inv.invoice_key] = inv
      }

      const txWithInvoice = transactions.map(t => ({
        ...t,
        invoice_number:  invoiceMap[t.matched_invoice_id]?.number ?? null,
        invoice_year:    invoiceMap[t.matched_invoice_id]?.year ?? null,
        invoice_total:   invoiceMap[t.matched_invoice_id]?.total ?? null,
        invoice_company: invoiceMap[t.matched_invoice_id]?.company ?? null,
      }))

      return reply.send({ ...stmt, transactions: txWithInvoice })
    } catch (err: any) {
      return reply.status(500).send({ error: err.message })
    } finally {
      await pgSql.end()
    }
  })

  // GET /api/bank/transactions — seznam transakcí
  app.get('/transactions', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const pgSql = getUserSql(userDb, passwordDb)
    const q = request.query as {
      unmatched?: string
      credit_debit?: string
      date_from?: string
      date_to?: string
      vs?: string
      limit?: string
      offset?: string
    }
    const limit = Math.min(Number(q.limit ?? 50), 200)
    const offset = Number(q.offset ?? 0)

    try {
      let sql = `
        SELECT t.*, s.filename, s.period_from, s.period_to
        FROM bank_transactions t
        JOIN bank_statements s ON t.statement_id = s.id
        WHERE 1=1
      `
      const params: any[] = []
      if (q.unmatched === 'true') { sql += ' AND t.matched_invoice_id IS NULL' }
      if (q.credit_debit) { sql += ' AND t.credit_debit = ?'; params.push(q.credit_debit) }
      if (q.date_from)    { sql += ' AND t.transaction_date >= ?'; params.push(q.date_from) }
      if (q.date_to)      { sql += ' AND t.transaction_date <= ?'; params.push(q.date_to) }
      if (q.vs)           { sql += ' AND t.vs = ?'; params.push(q.vs) }
      sql += ' ORDER BY t.transaction_date DESC, t.id DESC LIMIT ? OFFSET ?'
      params.push(limit, offset)

      const transactions = db.prepare(sql).all(...params) as any[]

      const matchedIds = transactions
        .filter(t => t.matched_invoice_id)
        .map(t => t.matched_invoice_id)

      let invoiceMap: Record<number, any> = {}
      if (matchedIds.length > 0) {
        const invoices = await pgSql`
          SELECT i.invoice_key, i.number, i.year, i.total, c.company
          FROM provider.invoice i
          LEFT JOIN provider.company c ON i.company_key = c.company_key
          WHERE i.invoice_key = ANY(${matchedIds})
        `
        for (const inv of invoices) invoiceMap[inv.invoice_key] = inv
      }

      const result = transactions.map(t => ({
        ...t,
        invoice_number:  invoiceMap[t.matched_invoice_id]?.number ?? null,
        invoice_year:    invoiceMap[t.matched_invoice_id]?.year ?? null,
        invoice_total:   invoiceMap[t.matched_invoice_id]?.total ?? null,
        invoice_company: invoiceMap[t.matched_invoice_id]?.company ?? null,
      }))

      return reply.send(result)
    } catch (err: any) {
      return reply.status(500).send({ error: err.message })
    } finally {
      await pgSql.end()
    }
  })

  // POST /api/bank/transactions/:id/match
  app.post('/transactions/:id/match', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const pgSql = getUserSql(userDb, passwordDb)
    const { id } = request.params as { id: string }
    const { invoice_key } = request.body as { invoice_key: number }

    try {
      const [inv] = await pgSql`
        SELECT invoice_key FROM provider.invoice WHERE invoice_key = ${invoice_key}
      `
      if (!inv) return reply.status(404).send({ error: 'Faktura nenalezena' })

      db.prepare(`
        UPDATE bank_transactions
        SET matched_invoice_id = ?, matched_at = datetime('now')
        WHERE id = ?
      `).run(invoice_key, Number(id))

      const updated = db.prepare('SELECT * FROM bank_transactions WHERE id = ?').get(Number(id))
      return reply.send(updated)
    } catch (err: any) {
      return reply.status(500).send({ error: err.message })
    } finally {
      await pgSql.end()
    }
  })

  // DELETE /api/bank/transactions/:id/match
  app.delete('/transactions/:id/match', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    try {
      db.prepare(`
        UPDATE bank_transactions
        SET matched_invoice_id = NULL, matched_at = NULL
        WHERE id = ?
      `).run(Number(id))
      const updated = db.prepare('SELECT * FROM bank_transactions WHERE id = ?').get(Number(id))
      return reply.send(updated)
    } catch (err: any) {
      return reply.status(500).send({ error: err.message })
    }
  })

  // GET /api/bank/invoices-search
  app.get('/invoices-search', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const pgSql = getUserSql(userDb, passwordDb)
    const q = request.query as { q?: string; amount?: string }

    try {
      const rows = await pgSql`
        SELECT i.invoice_key, i.number, i.year, i.total, i.currency,
               i.issued, i.maturity, i.settlement, c.company
        FROM provider.invoice i
        LEFT JOIN provider.company c ON i.company_key = c.company_key
        WHERE i.cancellation IS NULL
          ${q.q ? pgSql`AND (i.number::text ILIKE ${'%' + q.q + '%'} OR c.company ILIKE ${'%' + q.q + '%'})` : pgSql``}
          ${q.amount ? pgSql`AND ABS(i.total - ${Number(q.amount)}) < 0.01` : pgSql``}
        ORDER BY i.issued DESC
        LIMIT 20
      `
      return reply.send(rows)
    } catch (err: any) {
      return reply.status(500).send({ error: err.message })
    } finally {
      await pgSql.end()
    }
  })
}

async function autoMatchInvoices(pgSql: any, statementId: number) {
  const transactions = db.prepare(`
    SELECT id, vs FROM bank_transactions
    WHERE statement_id = ? AND matched_invoice_id IS NULL
      AND vs IS NOT NULL AND vs != '' AND credit_debit = 'CRDT'
  `).all(statementId) as any[]

  for (const tx of transactions) {
    const [inv] = await pgSql`
      SELECT invoice_key FROM provider.invoice
      WHERE (series::text || RIGHT(id::text, 5) || LPAD(number::text, 4, '0')) = ${tx.vs}
        AND cancellation IS NULL AND settlement IS NULL
      LIMIT 1
    `
    if (inv) {
      db.prepare(`
        UPDATE bank_transactions
        SET matched_invoice_id = ?, matched_at = datetime('now')
        WHERE id = ?
      `).run(inv.invoice_key, tx.id)
    }
  }
}
