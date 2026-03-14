import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { getUserSql } from '../db/userSql.js'
import nodemailer from 'nodemailer'

const SENDERS = {
  A: { name: 'Euro Sped Online', email: 'info@euro-sped.cz' },
  B: { name: 'e-sped', email: 'info@e-sped.cz' },
  C: { name: 'TopTrucks.cz', email: 'info@toptrucks.cz' },
  D: { name: 'TruckManager.eu', email: 'info@truckmanager.eu' },
}

export async function sendMailRoutes(app: FastifyInstance) {

  // GET /api/send-mail/context/:companyKey
  app.get('/context/:companyKey', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb, initials, employeeSchema } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    const { companyKey } = request.params as { companyKey: string }
    const schema = employeeSchema || 'provider'

    try {
      // Company + detail + user_account
      const [company] = await sql`
        SELECT C.company_key, C.id, C.company, C.street, C.city, C.zip, C.country,
               C.cin, C.tin, C.bank, C.account,
               CD.contract_date, CD.admittance_date, CD.prog_sent_date,
               UA.username, UA.password AS user_password
        FROM ${sql(schema + '.company')} AS C
        LEFT JOIN ${sql(schema + '.company_detail')} AS CD ON C.company_key = CD.company_key
        LEFT JOIN ONLY ${sql(schema + '.user_account')} AS UA ON C.company_key = UA.company_key
        WHERE C.company_key = ${companyKey}
      `

      // Employee
      const [employee] = await sql`
        SELECT forename, surname, email, phone, gsm, fax
        FROM ${sql(schema + '.employee_account')}
        WHERE initials = ${initials}
      `

      // Contacts + persons (email type)
      const contacts = await sql`
        SELECT type, value, importance, send_tips
        FROM ${sql(schema + '.contact')}
        WHERE company_key = ${companyKey}
        ORDER BY importance
      `
      const persons = await sql`
        SELECT name, sex, importance
        FROM ${sql(schema + '.contact_person')}
        WHERE company_key = ${companyKey}
        ORDER BY importance
      `

      // Unsettled invoices past maturity
      const claims = await sql`
        SELECT I.series, I.id, I.number, I.maturity, I.curr_total, I.currency
        FROM ${sql(schema + '.invoice')} AS I
        JOIN ${sql(schema + '.company')} AS C ON I.company_key = C.company_key
        WHERE I.company_key = ${companyKey}
          AND I.cancellation IS NULL
          AND I.settlement IS NULL
          AND I.maturity < CURRENT_DATE
        ORDER BY I.maturity
      `

      // Build recipient list (email contacts)
      const emailRecipients: { label: string; email: string; importance: number }[] = []
      const personMap: Record<number, { name: string; sex: string }> = {}

      persons.forEach((p: any) => { personMap[p.importance] = { name: p.name, sex: p.sex } })

      contacts.forEach((c: any) => {
        if (c.type === 'E' && c.importance) {
          const person = personMap[c.importance]
          emailRecipients.push({
            importance: c.importance,
            label: person ? `${person.name} - ${c.value}` : `Globální - ${c.value}`,
            email: c.value,
          })
        }
        if (c.type === 'E' && !c.importance) {
          emailRecipients.push({ importance: 0, label: `Globální - ${c.value}`, email: c.value })
        }
      })

      // Format claim text
      const claimText = claims.map((inv: any) =>
        `${inv.series}${inv.id}${inv.number}  ${inv.maturity ? new Date(inv.maturity).toLocaleDateString('cs-CZ') : ''}  ${inv.curr_total} ${inv.currency}`
      ).join('\n')

      // Build context for template substitution
      const today = new Date().toLocaleDateString('cs-CZ')
      const ctx: Record<string, string> = {
        company_key: String(company?.company_key ?? ''),
        id: company?.id ?? '',
        company: company?.company ?? '',
        street: company?.street ?? '',
        city: company?.city ?? '',
        zip: company?.zip ?? '',
        country: company?.country ?? '',
        cin: company?.cin ?? '',
        tin: company?.tin ?? '',
        bank: company?.bank ?? '',
        account: company?.account ?? '',
        contract_date: company?.contract_date ? new Date(company.contract_date).toLocaleDateString('cs-CZ') : '',
        admittance_date: company?.admittance_date ? new Date(company.admittance_date).toLocaleDateString('cs-CZ') : '',
        prog_sent_date: company?.prog_sent_date ? new Date(company.prog_sent_date).toLocaleDateString('cs-CZ') : '',
        username: company?.username ?? '',
        password: company?.user_password ?? '',
        sys_date: today,
        employee_name: employee ? `${employee.forename} ${employee.surname}`.trim() : '',
        employee_email: employee?.email ?? '',
        employee_phone: employee?.phone ?? '',
        employee_gsm: employee?.gsm ?? '',
        employee_fax: employee?.fax ?? '',
        claim_invoice: claimText,
      }

      // Add per-person/contact entries
      persons.forEach((p: any) => {
        ctx[`name${p.importance}`] = p.name
        ctx[`sex${p.importance}`] = p.sex === 'M' ? 'pane' : p.sex === 'F' ? 'pani' : ''
      })
      contacts.forEach((c: any) => {
        if (c.type === 'T') ctx[`phone${c.importance}`] = c.value
        if (c.type === 'G') ctx[`gsm${c.importance}`] = c.value
        if (c.type === 'E' && c.importance) ctx[`email${c.importance}`] = c.value
        if (c.type === 'E' && !c.importance) ctx['email'] = c.value
        if (c.type === 'F') ctx['fax'] = c.value
      })

      return reply.send({ context: ctx, recipients: emailRecipients, senders: SENDERS })
    } finally {
      await sql.end()
    }
  })

  // POST /api/send-mail/send
  app.post('/send', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb, initials, employeeSchema } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    const schema = employeeSchema || 'provider'
    const body = request.body as {
      company_key: number
      to: string        // recipient email
      sender: 'A' | 'B' | 'C' | 'D'
      subject: string
      message: string
      bcc?: boolean
      bcc_email?: string
      note_type: string
      note_text: string
    }

    const senderInfo = SENDERS[body.sender] ?? SENDERS.D

    try {
      const transport = nodemailer.createTransport({ sendmail: true, newline: 'unix', path: '/usr/sbin/sendmail' })

      const msgHtml = body.message.replace(/\n/g, '<br>').replace(/<s>/g, '&nbsp;')

      const mailOptions: any = {
        from: `${senderInfo.name} <${senderInfo.email}>`,
        to: body.to,
        subject: body.subject,
        html: msgHtml,
        headers: {
          'X-Sender': '<info@truckmanager.eu>',
          'X-Mailer': 'NodeMailer',
          'Return-Path': `<${senderInfo.email}>`,
          'Errors-To': 'truckmanager.eu <info@truckmanager.eu>',
        },
      }

      if (body.bcc && body.bcc_email) {
        mailOptions.bcc = body.bcc_email
      }

      let sent = false
      let errMsg = ''
      try {
        await transport.sendMail(mailOptions)
        sent = true
      } catch (e: any) {
        errMsg = e.message
      }

      // Log to diary regardless
      await sql`
        INSERT INTO ${sql(schema + '.note')} (company_key, creator, type, text)
        VALUES (${body.company_key}, ${initials}, ${body.note_type}, ${'E-mail > ' + body.note_text + ' > ' + body.message})
      `

      if (!sent) {
        return reply.code(500).send({ error: 'E-mail se nepodařilo odeslat: ' + errMsg })
      }
      return reply.send({ success: true })
    } finally {
      await sql.end()
    }
  })
}
