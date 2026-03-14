import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { getUserSql } from '../db/userSql.js'

export async function sendSmsRoutes(app: FastifyInstance) {

  // GET /api/send-sms/context/:companyKey
  app.get('/context/:companyKey', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb, initials, employeeSchema } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    const { companyKey } = request.params as { companyKey: string }
    const schema = employeeSchema || 'provider'

    try {
      const [company] = await sql`
        SELECT C.company_key, C.id, C.company,
               CD.contract_date, CD.admittance_date, CD.prog_sent_date,
               UA.username, UA.password AS user_password
        FROM ${sql(schema + '.company')} AS C
        LEFT JOIN ${sql(schema + '.company_detail')} AS CD ON C.company_key = CD.company_key
        LEFT JOIN ONLY ${sql(schema + '.user_account')} AS UA ON C.company_key = UA.company_key
        WHERE C.company_key = ${companyKey}
      `

      const [employee] = await sql`
        SELECT surname, gsm FROM ${sql(schema + '.employee_account')} WHERE initials = ${initials}
      `

      const contacts = await sql`
        SELECT type, value, importance, send_tips
        FROM ${sql(schema + '.contact')}
        WHERE company_key = ${companyKey}
        ORDER BY importance
      `
      const persons = await sql`
        SELECT name, sex, importance, languages
        FROM ${sql(schema + '.contact_person')}
        WHERE company_key = ${companyKey}
        ORDER BY importance
      `

      const claims = await sql`
        SELECT I.series, I.id, I.number, I.maturity
        FROM ${sql(schema + '.invoice')} AS I
        WHERE I.company_key = ${companyKey}
          AND I.cancellation IS NULL
          AND I.settlement IS NULL
          AND I.maturity < CURRENT_DATE
        ORDER BY I.maturity
        LIMIT 3
      `

      // GSM recipients
      const gsmRecipients: { label: string; gsm: string; importance: number }[] = []
      const personMap: Record<number, { name: string; sex: string }> = {}
      persons.forEach((p: any) => { personMap[p.importance] = { name: p.name, sex: p.sex } })
      contacts.forEach((c: any) => {
        if (c.type === 'G') {
          const person = personMap[c.importance]
          gsmRecipients.push({
            importance: c.importance,
            label: person ? `${person.name} - ${c.value}` : `Global - ${c.value}`,
            gsm: c.value,
          })
        }
      })

      // Claim text
      const claimText = claims.map((inv: any) => {
        const mat = inv.maturity ? new Date(inv.maturity) : null
        const matStr = mat ? `spl.${String(mat.getDate()).padStart(2,'0')}.${String(mat.getMonth()+1).padStart(2,'0')}.` : ''
        return `${inv.series}${inv.id}${inv.number} ${matStr}`
      }).join(', ')

      // Context for substitution
      const today = new Date().toLocaleDateString('cs-CZ')
      const ctx: Record<string, string> = {
        id: company?.id ?? '',
        company: company?.company ?? '',
        contract_date: company?.contract_date ? new Date(company.contract_date).toLocaleDateString('cs-CZ') : '',
        admittance_date: company?.admittance_date ? new Date(company.admittance_date).toLocaleDateString('cs-CZ') : '',
        prog_sent_date: company?.prog_sent_date ? new Date(company.prog_sent_date).toLocaleDateString('cs-CZ') : '',
        sys_date: today,
        username: company?.username ?? '',
        password: company?.user_password ?? '',
        surname: employee?.surname ?? '',
        gsm: employee?.gsm ?? '',
        claim_invoice: claimText,
        global_email: '',
      }

      persons.forEach((p: any) => {
        ctx[`name${p.importance}`] = p.name
        ctx[`acc_name${p.importance}`] = p.name
        ctx[`sex${p.importance}`] = p.sex === 'M' ? 'pane' : p.sex === 'F' ? 'pani' : ''
        ctx[`acc_sex${p.importance}`] = ctx[`sex${p.importance}`]
      })
      contacts.forEach((c: any) => {
        if (c.type === 'G') ctx[`gsm${c.importance}`] = c.value
        if (c.type === 'E' && !c.importance) ctx['global_email'] = c.value
      })

      return reply.send({ context: ctx, recipients: gsmRecipients })
    } finally {
      await sql.end()
    }
  })

  // POST /api/send-sms/send
  app.post('/send', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb, initials, employeeSchema } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    const schema = employeeSchema || 'provider'
    const body = request.body as {
      company_key: number
      to: string       // phone number
      text: string
      send_immediately: boolean
      note_type: string
      note_text: string
    }

    // Strip Czech diacritics
    function stripDiacritics(s: string): string {
      const from = 'áěšČřžýíéůúďóňťľôŕĺäöüß~ÁĚŠĆŘŽÝÍÉŮÚĎÓŇŤ'
      const to =   'aescrzYIEuudontlOrlaoussAESCRZYIEUUDONT'
      let result = s
      for (let i = 0; i < from.length; i++) {
        result = result.split(from[i]).join(to[i])
      }
      return result.slice(0, 640)
    }

    const smsText = stripDiacritics(body.text)
    let smsId = 0
    let virt = ''

    try {
      if (body.send_immediately) {
        const [r] = await sql`SELECT public.send_sms_by_o2(${body.to}, ${smsText}) AS sms_id`
        smsId = r.sms_id
      } else {
        smsId = 1
        virt = 'K odeslání: '
      }

      if (smsId > 0) {
        await sql`
          INSERT INTO ${sql(schema + '.note')} (company_key, creator, type, text)
          VALUES (${body.company_key}, ${initials}, ${body.note_type},
                  ${virt + 'SMS(' + smsId + ') > ' + body.note_text + ' > ' + smsText})
        `
        return reply.send({ success: true, sms_id: smsId })
      } else {
        return reply.code(500).send({ error: 'SMS se nepodařilo odeslat' })
      }
    } finally {
      await sql.end()
    }
  })
}
