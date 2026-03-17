#!/bin/bash
# Start skript pro admin-data API backend
# Spouštěj: /services/admin-data/start.sh

# Zastav případný běžící proces
pkill -f "tsx watch.*index.ts" 2>/dev/null
sleep 1

# Vytvoř zapisovatelnou kopii projektu (root-owned originál nelze editovat)
MYDIR=/services/admin-data/patched
rm -rf "$MYDIR"
mkdir -p "$MYDIR/src"

# Zkopíruj src a konfiguraci
cp -r /services/admin-data/src/. "$MYDIR/src/"
cp /services/admin-data/tsconfig.json "$MYDIR/"
cp /services/admin-data/package.json "$MYDIR/"
ln -s /services/admin-data/node_modules "$MYDIR/node_modules"

# Patch: companies/:id — přidej url (kontakt typ H) a branch_name + PUT url upsert
python3 - <<'PYEOF'
import sys
f = '/services/admin-data/patched/src/routes/companies/index.ts'
src = open(f).read()
# GET: přidej branch_name a url subquery
old = '''               CD.credit_tip_sms, CD.contract, CD.contract_date,'''
new = '''               B.name AS branch_name,
               (SELECT value FROM provider.contact
                WHERE company_key = C.company_key AND type = 'H'
                LIMIT 1) AS url,
               CD.credit_tip_sms, CD.contract, CD.contract_date,'''
old2 = '''        LEFT JOIN provider.company_invoice_address AS CIA ON C.company_key = CIA.company_key
        WHERE C.company_key = ${id}'''
new2 = '''        LEFT JOIN provider.company_invoice_address AS CIA ON C.company_key = CIA.company_key
        LEFT JOIN provider.branch AS B ON B.branch = C.branch
        WHERE C.company_key = ${id}'''
# PUT: přidej url do body type a upsert logiku
old3 = "      account?: string; branch?: string; tariff?: string; region?: string\n    }"
new3 = "      account?: string; branch?: string; tariff?: string; region?: string\n      url?: string | null\n    }"
old4 = "      return reply.send({ success: true })\n    } finally {\n      await sql.end()\n    }\n  })\n\n  // GET /api/companies/:id/contacts"
new4 = """      if (body.url !== undefined) {
        const existing = await sql`SELECT contact_key FROM provider.contact WHERE company_key = ${id} AND type = 'H' LIMIT 1`
        if (existing.length > 0) {
          if (!body.url) {
            await sql`DELETE FROM provider.contact WHERE company_key = ${id} AND type = 'H'`
          } else {
            await sql`UPDATE provider.contact SET value = ${body.url} WHERE company_key = ${id} AND type = 'H'`
          }
        } else if (body.url) {
          await sql`INSERT INTO provider.contact (company_key, type, value, send_tips, by_name) VALUES (${id}, 'H', ${body.url}, false, false)`
        }
      }
      return reply.send({ success: true })
    } finally {
      await sql.end()
    }
  })

  // GET /api/companies/:id/contacts"""
if 'branch_name' not in src:
    src = src.replace(old, new).replace(old2, new2).replace(old3, new3).replace(old4, new4)
    open(f, 'w').write(src)
    print('Patch OK: companies url + branch_name + PUT url', file=sys.stderr)
else:
    print('Patch SKIP: already patched', file=sys.stderr)
PYEOF

# Patch: tracking_last místo car_base pro KPI "Vozidla TM"
python3 - <<'PYEOF'
import sys
f = '/services/admin-data/patched/src/routes/statistics.ts'
src = open(f).read()
old = "          FROM gps.car_base\n          WHERE active = true"
new = "          FROM gps.tracking_last\n          WHERE time >= NOW() - INTERVAL '7 days'"
if old in src:
    open(f, 'w').write(src.replace(old, new))
    print('Patch OK: tracking_last', file=sys.stderr)
else:
    print('Patch SKIP: pattern not found', file=sys.stderr)
PYEOF

# Patch: last_modif datum — ISO formát místo toLocaleDateString (cs-CZ nečte PostgreSQL)
python3 - <<'PYEOF'
import sys
f = '/services/admin-data/patched/src/routes/companies/index.ts'
src = open(f).read()
old = "const now = new Date().toLocaleDateString('cs-CZ')"
new = "const now = new Date().toISOString().split('T')[0]"
if old in src:
    open(f, 'w').write(src.replace(old, new))
    print('Patch OK: last_modif date format', file=sys.stderr)
else:
    print('Patch SKIP: last_modif pattern not found', file=sys.stderr)
PYEOF

# Patch: branch/tariff/region — NULLIF pro prázdný string (FK constraint)
python3 - <<'PYEOF'
import sys
f = '/services/admin-data/patched/src/routes/companies/index.ts'
src = open(f).read()
fixes = [
    ("COALESCE(${body.branch ?? null}, branch)", "COALESCE(NULLIF(${body.branch ?? null}, ''), branch)"),
    ("COALESCE(${body.tariff ?? null}, tariff)", "COALESCE(NULLIF(${body.tariff ?? null}, ''), tariff)"),
    ("COALESCE(${body.region ?? null}, region)", "COALESCE(NULLIF(${body.region ?? null}, ''), region)"),
]
changed = False
for old, new in fixes:
    if old in src:
        src = src.replace(old, new)
        changed = True
if changed:
    open(f, 'w').write(src)
    print('Patch OK: NULLIF for FK fields', file=sys.stderr)
else:
    print('Patch SKIP: NULLIF patterns not found', file=sys.stderr)
PYEOF

# Patch: pohledávky — hranice 14 dní po splatnosti (místo dne splatnosti)
python3 - <<'PYEOF'
import sys
f = '/services/admin-data/patched/src/routes/statistics.ts'
src = open(f).read()
import re
new_src = re.sub(r'AND (I\.)?maturity < CURRENT_DATE(?! - INTERVAL)', lambda m: m.group(0).replace('CURRENT_DATE', "CURRENT_DATE - INTERVAL '14 days'"), src)
# claims aging WHERE
new_src = new_src.replace(
    "        WHERE settlement IS NULL AND cancellation IS NULL\n        GROUP BY bucket",
    "        WHERE settlement IS NULL AND cancellation IS NULL\n          AND maturity < CURRENT_DATE - INTERVAL '14 days'\n        GROUP BY bucket"
)
if new_src != src:
    open(f, 'w').write(new_src)
    print('Patch OK: 14-day overdue threshold', file=sys.stderr)
else:
    print('Patch SKIP: 14-day threshold already applied or pattern not found', file=sys.stderr)
PYEOF

# Patch: company_count do claims query v statistics.ts
python3 - <<'PYEOF'
import sys
f = '/services/admin-data/patched/src/routes/statistics.ts'
src = open(f).read()
old = "          SELECT count(*)::int AS count, sum(total)::numeric AS total_sum\n          FROM provider.invoice\n          WHERE settlement IS NULL AND cancellation IS NULL\n            AND maturity < CURRENT_DATE - INTERVAL '14 days'"
new = "          SELECT count(*)::int AS count, sum(total)::numeric AS total_sum,\n                 count(DISTINCT company_key)::int AS company_count\n          FROM provider.invoice\n          WHERE settlement IS NULL AND cancellation IS NULL\n            AND maturity < CURRENT_DATE - INTERVAL '14 days'"
if old in src:
    open(f, 'w').write(src.replace(old, new))
    print('Patch OK: company_count in claims', file=sys.stderr)
else:
    print('Patch SKIP: company_count pattern not found', file=sys.stderr)
PYEOF

# Patch: overview — přidej expiredGpsImport do Promise.all a expired_access_with_tracking do response
python3 - <<'PYEOF'
import sys
f = '/services/admin-data/patched/src/routes/statistics.ts'
src = open(f).read()
old_active = "        // Nové smlouvy tento měsíc"
new_active = """        // Aktivní firmy (admittance_date > dnes)
        sql`
          SELECT count(*)::int AS count
          FROM provider.company_detail
          WHERE admittance_date > CURRENT_DATE
        `,
        // Nové smlouvy tento měsíc"""
old_vehicles = "        sql`\n          SELECT count(*)::int AS count\n          FROM gps.tracking_last\n          WHERE time >= NOW() - INTERVAL '7 days'\n        `.catch(() => [{ count: 0 }]),"
new_vehicles = """        sql`
          SELECT count(*)::int AS count
          FROM gps.tracking_last
          WHERE time >= NOW() - INTERVAL '7 days'
        `.catch(() => [{ count: 0 }]),
        // Firmy s GPS importem a prošlým přístupem
        sql`
          SELECT count(*)::int AS count
          FROM gps.import_service I
          LEFT JOIN provider.company_detail D ON I.company_key = D.company_key
          WHERE D.admittance_date::date < NOW()
        `.catch(() => [{ count: 0 }]),"""
old_destructure = "      const [companies, contracts, invoices, claims, diary, vehicles] = await Promise.all(["
new_destructure = "      const [companies, activeCompanies, contracts, invoices, claims, claimsByRegion, diary, vehicles, expiredGpsImport] = await Promise.all(["
old_claims_diary = "        // Záznamy deníku dnes"
new_claims_diary = """        // Pohledávky dle oblasti
        sql`
          SELECT trim(C.region) AS region,
                 count(*)::int AS count,
                 sum(I.total)::numeric AS total_sum
          FROM provider.invoice I
          JOIN provider.company C ON C.company_key = I.company_key
          WHERE I.settlement IS NULL AND I.cancellation IS NULL
            AND I.maturity < CURRENT_DATE - INTERVAL '14 days'
            AND trim(C.region) IN ('001', '002', '003')
          GROUP BY trim(C.region)
          ORDER BY trim(C.region)
        `,
        // Záznamy deníku dnes"""
old_response = "        active_vehicles: vehicles[0]?.count ?? 0,\n      })"
old_response2 = "        companies_by_tariff: companies,\n        new_contracts_this_month:"
new_response2 = "        companies_by_tariff: companies,\n        active_companies: activeCompanies[0]?.count ?? 0,\n        new_contracts_this_month:"
old_response3 = "        overdue_claims: claims[0] ?? { count: 0, total_sum: 0 },"
new_response3 = "        overdue_claims: claims[0] ?? { count: 0, total_sum: 0 },\n        overdue_claims_by_region: claimsByRegion,"
new_response = "        active_vehicles: vehicles[0]?.count ?? 0,\n        expired_access_with_tracking: expiredGpsImport[0]?.count ?? 0,\n      })"
changed = False
if old_destructure in src:
    src = src.replace(old_destructure, new_destructure); changed = True
if old_active in src:
    src = src.replace(old_active, new_active); changed = True
if old_claims_diary in src:
    src = src.replace(old_claims_diary, new_claims_diary); changed = True
if old_vehicles in src:
    src = src.replace(old_vehicles, new_vehicles); changed = True
if old_response2 in src:
    src = src.replace(old_response2, new_response2); changed = True
if old_response3 in src:
    src = src.replace(old_response3, new_response3); changed = True
if old_response in src:
    src = src.replace(old_response, new_response); changed = True
if changed:
    open(f, 'w').write(src)
    print('Patch OK: overview claimsByRegion+expiredGpsImport', file=sys.stderr)
else:
    print('Patch SKIP: overview already patched or pattern not found', file=sys.stderr)
PYEOF

# Patch: expired-access endpoint v statistics.ts (správný SQL přes gps.import_service)
python3 - <<'PYEOF'
import sys
f = '/services/admin-data/patched/src/routes/statistics.ts'
src = open(f).read()
marker = "  // GET /api/statistics/invoices-monthly — tržby per měsíc (rok)"
insert = """  // GET /api/statistics/expired-access — firmy s GPS importem a prošlým přístupem
  app.get('/expired-access', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    try {
      const rows = await sql`
        SELECT I.company_key, I.comp_id, I.comp_name, I.usr, I.import_type,
               D.admittance_date
        FROM gps.import_service I
        LEFT JOIN provider.company_detail D ON I.company_key = D.company_key
        WHERE D.admittance_date::date < NOW()
        ORDER BY I.comp_name
      `.catch(() => [])
      return reply.send(rows)
    } finally {
      await sql.end()
    }
  })

"""
if '/expired-access' not in src and marker in src:
    open(f, 'w').write(src.replace(marker, insert + marker))
    print('Patch OK: expired-access endpoint', file=sys.stderr)
else:
    print('Patch SKIP: expired-access already present or marker not found', file=sys.stderr)
PYEOF

# Patch: lent-monthly endpoint v statistics.ts
python3 - <<'PYEOF'
import sys
f = '/services/admin-data/patched/src/routes/statistics.ts'
src = open(f).read()
marker = "  // GET /api/statistics/invoices-monthly — tržby per měsíc (rok)"
insert = """  // GET /api/statistics/lent-monthly — registrace dle měsíců (posledních 36 měsíců)
  app.get('/lent-monthly', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    try {
      const rows = await sql`
        SELECT to_char(date_trunc('month', prog_lent_date), 'YYYY-MM') AS month,
               count(*)::int AS count
        FROM provider.company_detail
        WHERE prog_lent_date >= date_trunc('month', CURRENT_DATE) - INTERVAL '35 months'
          AND prog_lent_date IS NOT NULL
        GROUP BY date_trunc('month', prog_lent_date)
        ORDER BY month
      `
      const byMonth = {}
      for (const r of rows) byMonth[r.month] = r.count
      const result = []
      for (let i = 35; i >= 0; i--) {
        const d = new Date()
        d.setDate(1)
        d.setMonth(d.getMonth() - i)
        const key = d.toISOString().slice(0, 7)
        result.push({ month: key, count: byMonth[key] ?? 0 })
      }
      return reply.send(result)
    } finally {
      await sql.end()
    }
  })

"""
if '/lent-monthly' not in src and marker in src:
    open(f, 'w').write(src.replace(marker, insert + marker))
    print('Patch OK: lent-monthly endpoint', file=sys.stderr)
else:
    print('Patch SKIP: lent-monthly already present or marker not found', file=sys.stderr)
PYEOF

# Patch: overdue-companies endpoint v statistics.ts (s region filtrem)
python3 - <<'PYEOF'
import sys
f = '/services/admin-data/patched/src/routes/statistics.ts'
src = open(f).read()
marker = "  // GET /api/statistics/invoices-monthly — tržby per měsíc (rok)"
insert = """  // GET /api/statistics/overdue-companies — firmy s pohledávkami po splatnosti
  app.get('/overdue-companies', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    const { region } = request.query as { region?: string }
    try {
      const rows = region
        ? await sql`
            SELECT C.company_key, C.id, C.company, C.city, C.country,
                   C.tariff, T.name AS tariff_name,
                   count(I.invoice_key)::int AS invoice_count,
                   sum(I.total)::numeric AS total_sum
            FROM provider.invoice I
            JOIN provider.company C ON C.company_key = I.company_key
            LEFT JOIN provider.tariff T ON T.tariff = C.tariff
            WHERE I.settlement IS NULL AND I.cancellation IS NULL
              AND I.maturity < CURRENT_DATE - INTERVAL '14 days'
              AND trim(C.region) = ${region}
            GROUP BY C.company_key, C.id, C.company, C.city, C.country, C.tariff, T.name
            ORDER BY total_sum DESC
          `
        : await sql`
            SELECT C.company_key, C.id, C.company, C.city, C.country,
                   C.tariff, T.name AS tariff_name,
                   count(I.invoice_key)::int AS invoice_count,
                   sum(I.total)::numeric AS total_sum
            FROM provider.invoice I
            JOIN provider.company C ON C.company_key = I.company_key
            LEFT JOIN provider.tariff T ON T.tariff = C.tariff
            WHERE I.settlement IS NULL AND I.cancellation IS NULL
              AND I.maturity < CURRENT_DATE - INTERVAL '14 days'
            GROUP BY C.company_key, C.id, C.company, C.city, C.country, C.tariff, T.name
            ORDER BY total_sum DESC
          `
      return reply.send(rows)
    } finally {
      await sql.end()
    }
  })

"""
if '/overdue-companies' not in src and marker in src:
    open(f, 'w').write(src.replace(marker, insert + marker))
    print('Patch OK: overdue-companies endpoint', file=sys.stderr)
else:
    print('Patch SKIP: overdue-companies already present or marker not found', file=sys.stderr)
PYEOF

# Patch: user_account PUT — nahraď ON CONFLICT za UPDATE+INSERT (tabulka nemá unikátní constraint)
python3 - <<'PYEOF'
import sys
f = '/services/admin-data/patched/src/routes/companies/index.ts'
src = open(f).read()
old = """      } else {
        await sql`
          INSERT INTO ${sql(employeeSchema + '.user_account')} (company_key, username, password)
          VALUES (${id}, ${username}, ${password})
          ON CONFLICT (company_key, username) DO UPDATE SET password = ${password}
        `
      }"""
new = """      } else {
        const existing = await sql`
          SELECT 1 FROM ONLY ${sql(employeeSchema + '.user_account')}
          WHERE company_key = ${id} AND username = ${username}
          LIMIT 1
        `
        if (existing.length > 0) {
          await sql`
            UPDATE ONLY ${sql(employeeSchema + '.user_account')}
            SET password = ${password}
            WHERE company_key = ${id} AND username = ${username}
          `
        } else {
          await sql`
            INSERT INTO ${sql(employeeSchema + '.user_account')} (company_key, username, password)
            VALUES (${id}, ${username}, ${password})
          `
        }
      }"""
if old in src:
    open(f, 'w').write(src.replace(old, new))
    print('Patch OK: user_account no ON CONFLICT', file=sys.stderr)
else:
    print('Patch SKIP: user_account ON CONFLICT already fixed', file=sys.stderr)
PYEOF

# Patch: user_account SELECT * pro person_key
python3 - <<'PYEOF'
import sys
f = '/services/admin-data/patched/src/routes/companies/index.ts'
src = open(f).read()
old = "SELECT username, password FROM ONLY ${sql(employeeSchema + '.user_account')}"
new = "SELECT * FROM ONLY ${sql(employeeSchema + '.user_account')}"
if old in src:
    open(f, 'w').write(src.replace(old, new))
    print('Patch OK: user_account SELECT *', file=sys.stderr)
else:
    print('Patch SKIP: user_account already patched', file=sys.stderr)
PYEOF

# Patch: workers route — detail pracovníků
python3 - <<'PYEOF'
import sys, os
workers_ts = '''\
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { getUserSql } from '../db/userSql.js'

export async function workersRoutes(app: FastifyInstance) {

  app.get('/', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb, employeeSchema } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    try {
      const rows = await sql`
        SELECT initials, forename, surname, sex
        FROM ${sql(employeeSchema + '.employee_account')}
        WHERE provider = 'PROVIDER-CZ'
        ORDER BY surname, forename
      `
      return reply.send(rows)
    } finally {
      await sql.end()
    }
  })

  app.get('/:initials', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb, employeeSchema } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    const { initials } = request.params as { initials: string }
    try {
      const rows = await sql`
        SELECT initials, forename, surname, sex, username,
               phone, gsm, fax, email, www,
               provider, region, access_date
        FROM ${sql(employeeSchema + '.employee_account')}
        WHERE initials = ${initials}
          AND provider = 'PROVIDER-CZ'
      `
      if (rows.length === 0) return reply.code(404).send({ error: 'Not found' })
      return reply.send(rows[0])
    } finally {
      await sql.end()
    }
  })
}
'''
open('/services/admin-data/patched/src/routes/workers.ts', 'w').write(workers_ts)

f = '/services/admin-data/patched/src/index.ts'
src = open(f).read()
if 'workersRoutes' not in src:
    src = src.replace(
        "import { bankRoutes } from './routes/bank.js'",
        "import { bankRoutes } from './routes/bank.js'\nimport { workersRoutes } from './routes/workers.js'"
    )
    src = src.replace(
        "await app.register(bankRoutes, { prefix: '/api/bank' })",
        "await app.register(bankRoutes, { prefix: '/api/bank' })\nawait app.register(workersRoutes, { prefix: '/api/workers' })"
    )
    open(f, 'w').write(src)
    print('Patch OK: workers route', file=sys.stderr)
else:
    print('Patch SKIP: workers route already present', file=sys.stderr)
PYEOF

# Patch: sendSms — nahraď send_sms_by_o2 voláním SMSbrána API
python3 - <<'PYEOF'
import sys
f = '/services/admin-data/patched/src/routes/sendSms.ts'
src = open(f).read()
old = "        const [r] = await sql`SELECT public.send_sms_by_o2(${body.to}, ${smsText}) AS sms_id`\n        smsId = r.sms_id"
new = """        const smsLogin = process.env.SMS_BRANA_LOGIN ?? ''
        const smsPass = process.env.SMS_BRANA_PASSWORD ?? ''
        const { createHash } = await import('crypto')
        const now = new Date()
        const pad = (n: number) => String(n).padStart(2, '0')
        const time = `${now.getUTCFullYear()}${pad(now.getUTCMonth()+1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`
        const salt = Math.random().toString(36).slice(2, 10)
        const auth = createHash('md5').update(smsPass + time + salt).digest('hex')
        const params = new URLSearchParams({
          login: smsLogin,
          time,
          salt,
          auth,
          action: 'send_sms',
          number: body.to,
          message: smsText,
        })
        const resp = await fetch(`https://api.smsbrana.cz/smsconnect/http.php?${params}`)
        const xml = await resp.text()
        const errMatch = xml.match(/<err>(\\d+)<\\/err>/)
        const idMatch = xml.match(/<sms_id>(\\d+)<\\/sms_id>/)
        const errCode = errMatch ? Number(errMatch[1]) : 1
        if (errCode !== 0) {
          return reply.code(500).send({ error: `SMS brána vrátila chybu: err=${errCode}` })
        }
        smsId = idMatch ? Number(idMatch[1]) : 1"""
if old in src:
    open(f, 'w').write(src.replace(old, new))
    print('Patch OK: sendSms SMSbrana API', file=sys.stderr)
else:
    print('Patch SKIP: sendSms SMSbrana already patched', file=sys.stderr)
PYEOF

# Patch: sendSms + sendMail — I.id neexistuje v invoice tabulce, použij company?.id / C.id
python3 - <<'PYEOF'
import sys

# sendSms.ts
f = '/services/admin-data/patched/src/routes/sendSms.ts'
src = open(f).read()
changed = False
if 'SELECT I.series, I.id, I.number, I.maturity' in src:
    src = src.replace('SELECT I.series, I.id, I.number, I.maturity', 'SELECT I.series, I.number, I.maturity')
    changed = True
if "return `${inv.series}${inv.id}${inv.number} ${matStr}`" in src:
    src = src.replace(
        "return `${inv.series}${inv.id}${inv.number} ${matStr}`",
        "return `${inv.series}${String(company?.id ?? '').slice(-5)}${String(inv.number).padStart(4, '0')} ${matStr}`"
    )
    changed = True
if changed:
    open(f, 'w').write(src)
    print('Patch OK: sendSms I.id fix', file=sys.stderr)
else:
    print('Patch SKIP: sendSms I.id already fixed', file=sys.stderr)

# sendMail.ts
f = '/services/admin-data/patched/src/routes/sendMail.ts'
src = open(f).read()
if 'SELECT I.series, I.id, I.number, I.maturity, I.curr_total, I.currency' in src:
    open(f, 'w').write(src.replace(
        'SELECT I.series, I.id, I.number, I.maturity, I.curr_total, I.currency',
        'SELECT I.series, C.id, I.number, I.maturity, I.curr_total, I.currency'
    ))
    print('Patch OK: sendMail I.id -> C.id fix', file=sys.stderr)
else:
    print('Patch SKIP: sendMail C.id already present', file=sys.stderr)
PYEOF

# Patch: invoice GET /:id — přidej qr_data_url do odpovědi
python3 - <<'PYEOF'
import sys
f = '/services/admin-data/patched/src/routes/invoicing.ts'
src = open(f).read()

# Import QRCode
if "import QRCode from 'qrcode'" not in src:
    src = src.replace(
        "import { generateInvoicePdf } from '../services/invoicePdf.js'",
        "import { generateInvoicePdf } from '../services/invoicePdf.js'\nimport QRCode from 'qrcode'"
    )

# Přidej qr_data_url do odpovědi GET /:id
old = "      if (invoice.length === 0) return reply.code(404).send({ error: 'Faktura nenalezena' })\n      return reply.send({ ...invoice[0], items })"
new = """      if (invoice.length === 0) return reply.code(404).send({ error: 'Faktura nenalezena' })
      const inv0 = invoice[0] as any
      const qrVs = `${inv0.series}${String(inv0.company_id ?? '').slice(-5)}${String(inv0.number).padStart(4,'0')}`
      const qrAmt = Number(inv0.curr_total ?? inv0.total ?? 0).toFixed(2)
      const qrCcy = String(inv0.currency ?? 'CZK')
      const ibanRaw = qrCcy === 'EUR' ? 'CZ7703000000000349438195' : 'CZ2703000000000226164811'
      const qrStr = `SPD*1.0*ACC:${ibanRaw}*AM:${qrAmt}*CC:${qrCcy}*X-VS:${qrVs}`
      const qr_data_url = await QRCode.toDataURL(qrStr, { width: 160, margin: 1, color: { dark: '#000000', light: '#ffffff' } }).catch(() => '')
      return reply.send({ ...inv0, items, qr_data_url })"""

if "qr_data_url" not in src and old in src:
    src = src.replace(old, new)
    open(f, 'w').write(src)
    print('Patch OK: QR kód v invoice detailu', file=sys.stderr)
else:
    print('Patch SKIP: QR kód již přítomen nebo pattern nenalezen', file=sys.stderr)
PYEOF

# Patch: invoicing settle — prázdné datum = NULL (zrušení úhrady)
python3 - <<'PYEOF'
import sys
f = '/services/admin-data/patched/src/routes/invoicing.ts'
src = open(f).read()
old = "      await sql`\n        UPDATE provider.invoice SET settlement = ${date ?? new Date().toISOString().slice(0, 10)}\n        WHERE invoice_key = ${id}\n      `"
new = "      const settlementVal = (!date || date === '') ? null : date\n      await sql`\n        UPDATE provider.invoice SET settlement = ${settlementVal}\n        WHERE invoice_key = ${id}\n      `"
if old in src:
    open(f, 'w').write(src.replace(old, new))
    print('Patch OK: settle null support', file=sys.stderr)
else:
    print('Patch SKIP: settle already patched', file=sys.stderr)
PYEOF

# Patch: invoicePdf.ts — oprav Chrome cestu (/root → /home/dev) + URL pro HashRouter
python3 - <<'PYEOF'
import sys
f = '/services/admin-data/patched/src/services/invoicePdf.ts'
src = open(f).read()
if '/root/.cache/puppeteer' in src:
    src = src.replace('/root/.cache/puppeteer', '/home/dev/.cache/puppeteer')
    open(f, 'w').write(src)
    print('Patch OK: Chrome path /root -> /home/dev', file=sys.stderr)
else:
    print('Patch SKIP: Chrome path already fixed', file=sys.stderr)
PYEOF

# Patch: invoicing.ts — přidej GET /:id/pdf endpoint
python3 - <<'PYEOF'
import sys
f = '/services/admin-data/patched/src/routes/invoicing.ts'
src = open(f).read()
marker = "  // POST /api/invoicing/:id/send-email — odeslání faktury emailem jako PDF příloha"
insert = """  // GET /api/invoicing/:id/pdf — vygeneruje a vrátí PDF faktury
  app.get('/:id/pdf', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    const { id } = request.params as { id: string }
    const token = ((request as any).headers.authorization as string ?? '').replace('Bearer ', '')
    try {
      const rows = await sql`
        SELECT I.series, I.number, I.year, C.id AS company_id
        FROM provider.invoice AS I
        LEFT JOIN provider.company AS C ON I.company_key = C.company_key
        WHERE I.invoice_key = ${id}
      `
      if (rows.length === 0) return reply.code(404).send({ error: 'Faktura nenalezena' })
      const inv = rows[0]
      const vs = `${inv.series}${String(inv.company_id ?? '').slice(-5)}${String(inv.number).padStart(4,'0')}`
      const filename = `faktura_${inv.year}_${vs}.pdf`
      const pdfBuffer = await generateInvoicePdf(Number(id), token)
      return reply
        .header('Content-Type', 'application/pdf')
        .header('Content-Disposition', `inline; filename="${filename}"`)
        .send(pdfBuffer)
    } catch (err: any) {
      request.log.error({ err }, 'pdf generation failed')
      return reply.code(500).send({ error: err.message })
    } finally {
      await sql.end()
    }
  })

"""
if "/:id/pdf" not in src and marker in src:
    open(f, 'w').write(src.replace(marker, insert + marker))
    print('Patch OK: GET /:id/pdf endpoint', file=sys.stderr)
else:
    print('Patch SKIP: pdf endpoint already present', file=sys.stderr)
PYEOF

# Patch: invoicePdf.ts — oprav URL pro HashRouter (#/)
python3 - <<'PYEOF'
import sys
f = '/services/admin-data/patched/src/services/invoicePdf.ts'
src = open(f).read()
old = "const PRINT_BASE_URL = 'http://localhost/new/invoicing'"
new = "const PRINT_BASE_URL = 'http://localhost/new/#/invoicing'"
if old in src:
    open(f, 'w').write(src.replace(old, new))
    print('Patch OK: invoicePdf HashRouter URL', file=sys.stderr)
else:
    print('Patch SKIP: invoicePdf URL already fixed', file=sys.stderr)
PYEOF

# Patch: invoicePdf.ts — přidej LD_LIBRARY_PATH pro Chrome
python3 - <<'PYEOF'
import sys
f = '/services/admin-data/patched/src/services/invoicePdf.ts'
src = open(f).read()
marker = "export async function generateInvoicePdf"
insert = "const CHROME_LIBS = '/services/admin-data/chrome-libs/lib'\n\n"
if 'CHROME_LIBS' not in src and marker in src:
    open(f, 'w').write(src.replace(marker, insert + marker))
    print('Patch OK: invoicePdf CHROME_LIBS', file=sys.stderr)
else:
    print('Patch SKIP: CHROME_LIBS already present', file=sys.stderr)
PYEOF

python3 - <<'PYEOF'
import sys, re
f = '/services/admin-data/patched/src/services/invoicePdf.ts'
src = open(f).read()
old = "    args: ['--no-sandbox', '--disable-setuid-sandbox'],"
new = "    env: { ...process.env, LD_LIBRARY_PATH: CHROME_LIBS },\n    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],"
if old in src:
    open(f, 'w').write(src.replace(old, new))
    print('Patch OK: invoicePdf Chrome launch args', file=sys.stderr)
else:
    print('Patch SKIP: Chrome launch args already patched', file=sys.stderr)
PYEOF

# Patch: invoicePdf.ts — nastav okraje PDF na 0
python3 - <<'PYEOF'
import sys
f = '/services/admin-data/patched/src/services/invoicePdf.ts'
src = open(f).read()
old = "      margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' },"
new = "      margin: { top: '0', bottom: '0', left: '0', right: '0' },"
if old in src:
    open(f, 'w').write(src.replace(old, new))
    print('Patch OK: invoicePdf margin 0', file=sys.stderr)
else:
    print('Patch SKIP: invoicePdf margin already set', file=sys.stderr)
PYEOF

# Patch: bankDb.ts — přesuň DB do /home/dev/ (bank.db v /services/admin-data je root-owned)
python3 - <<'PYEOF'
import sys
f = '/services/admin-data/patched/src/db/bankDb.ts'
src = open(f).read()
old = "const DB_PATH = process.env.BANK_DB_PATH ?? path.resolve('/services/admin-data/bank.db')"
new = "const DB_PATH = process.env.BANK_DB_PATH ?? '/home/dev/bank.db'"
if old in src:
    open(f, 'w').write(src.replace(old, new))
    print('Patch OK: bankDb path', file=sys.stderr)
else:
    print('Patch SKIP: bankDb path already patched', file=sys.stderr)
PYEOF

# Patch: bank.ts — oprav encoding detection pro ČSOB FINSTA (windows-1250 bez deklarace)
python3 - <<'PYEOF'
import sys
f = '/services/admin-data/patched/src/routes/bank.ts'
src = open(f).read()
old = """        // Detekce encodingu z XML hlavičky (windows-1250, iso-8859-2, apod.)
        const encodingMatch = rawBuffer.slice(0, 200).toString('ascii').match(/encoding=["']([^"']+)["']/i)
        const encoding = encodingMatch ? encodingMatch[1] : 'utf-8'
        const xmlContent = iconv.decode(rawBuffer, encoding)"""
new = """        // Detekce encodingu z XML hlavičky (windows-1250, iso-8859-2, apod.)
        const header = rawBuffer.slice(0, 400).toString('latin1')
        const encodingMatch = header.match(/encoding=["']([^"']+)["']/i)
        let encoding = encodingMatch ? encodingMatch[1] : ''
        // Pokud není encoding deklarován, detekujeme podle obsahu:
        // ČSOB FINSTA soubory jsou typicky windows-1250
        if (!encoding) {
          const hasHighBytes = rawBuffer.slice(0, 2000).some((b: number) => b >= 0x80 && b <= 0x9F)
          encoding = hasHighBytes ? 'windows-1250' : 'utf-8'
        }
        const xmlContent = iconv.decode(rawBuffer, encoding)"""
if old in src:
    open(f, 'w').write(src.replace(old, new))
    print('Patch OK: bank.ts encoding detection', file=sys.stderr)
else:
    print('Patch SKIP: bank.ts encoding already patched', file=sys.stderr)
PYEOF

# Patch: JWT — přidej smtpUser/smtpPass (přihlašovací credentials) do tokenu
python3 - <<'PYEOF'
import sys

f = '/services/admin-data/patched/src/types/index.ts'
src = open(f).read()
old = "  provider: string\n  region: string\n}"
new = "  provider: string\n  region: string\n  smtpUser: string\n  smtpPass: string\n}"
if old in src:
    open(f, 'w').write(src.replace(old, new))
    print('Patch OK: JwtPayload smtpUser/smtpPass', file=sys.stderr)
else:
    print('Patch SKIP: JwtPayload already patched', file=sys.stderr)

f = '/services/admin-data/patched/src/routes/auth.ts'
src = open(f).read()
old = "      provider: row.provider ?? '',\n      region: row.ui_lang ?? '',\n    }"
new = "      provider: row.provider ?? '',\n      region: row.ui_lang ?? '',\n      smtpUser: username,\n      smtpPass: password,\n    }"
if old in src:
    open(f, 'w').write(src.replace(old, new))
    print('Patch OK: auth.ts smtpUser/smtpPass', file=sys.stderr)
else:
    print('Patch SKIP: auth.ts already patched', file=sys.stderr)
PYEOF

# Patch: sendMail.ts — použij SMTP místo sendmail, credentials z přihlášeného uživatele
python3 - <<'PYEOF'
import sys
f = '/services/admin-data/patched/src/routes/sendMail.ts'
src = open(f).read()
old = "      const transport = nodemailer.createTransport({ sendmail: true, newline: 'unix', path: '/usr/sbin/sendmail' })"
new = "      const transport = nodemailer.createTransport({ host: 'nweb.euro-sped.cz', port: 25, secure: false, ignoreTLS: true, auth: { user: smtpUser, pass: smtpPass } })"
if old in src:
    open(f, 'w').write(src.replace(old, new))
    print('Patch OK: sendMail SMTP', file=sys.stderr)
else:
    print('Patch SKIP: sendMail SMTP already patched or pattern not found', file=sys.stderr)
PYEOF

# Patch: invoicing.ts — použij SMTP místo env proměnných, credentials z přihlášeného uživatele
python3 - <<'PYEOF'
import sys
f = '/services/admin-data/patched/src/routes/invoicing.ts'
src = open(f).read()
old = """      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
        port: Number(process.env.SMTP_PORT ?? 587),"""
new = """      const transporter = nodemailer.createTransport({
        host: 'nweb.euro-sped.cz',
        port: 25,
        secure: false,
        ignoreTLS: true,"""
if old in src:
    # Také nahraď auth credentials
    src2 = src.replace(old, new)
    old2 = "          user: process.env.SMTP_USER,\n          pass: process.env.SMTP_PASS,"
    new2 = "          user: smtpUser,\n          pass: smtpPass,"
    if old2 in src2:
        src2 = src2.replace(old2, new2)
    open(f, 'w').write(src2)
    print('Patch OK: invoicing SMTP', file=sys.stderr)
else:
    print('Patch SKIP: invoicing SMTP already patched or pattern not found', file=sys.stderr)
PYEOF

# Patch: invoicing.ts — destrukturuj smtpUser/smtpPass v POST /:id/send-email handleru
python3 - <<'PYEOF'
import sys
f = '/services/admin-data/patched/src/routes/invoicing.ts'
src = open(f).read()
old = "    const { userDb, passwordDb } = (request as any).user\n    const sql = getUserSql(userDb, passwordDb)\n    const { id } = request.params as { id: string }\n    const { to, cc, subject, body } = request.body as {"
new = "    const { userDb, passwordDb, smtpUser, smtpPass } = (request as any).user\n    const sql = getUserSql(userDb, passwordDb)\n    const { id } = request.params as { id: string }\n    const { to, cc, subject, body } = request.body as {"
if old in src:
    open(f, 'w').write(src.replace(old, new))
    print('Patch OK: invoicing smtpUser/smtpPass destructure', file=sys.stderr)
else:
    print('Patch SKIP: invoicing smtpUser/smtpPass already destructured', file=sys.stderr)
PYEOF

# Patch: invoicing.ts — odstraň text: body (SMTP server ořezává non-ASCII v plaintext)
python3 - <<'PYEOF'
import sys
f = '/services/admin-data/patched/src/routes/invoicing.ts'
src = open(f).read()
old = "        html: body.replace(/\\n/g, '<br>'),\n        text: body,\n        attachments:"
new = "        html: body.replace(/\\n/g, '<br>'),\n        attachments:"
if old in src:
    open(f, 'w').write(src.replace(old, new))
    print('Patch OK: invoicing remove text:body', file=sys.stderr)
else:
    print('Patch SKIP: invoicing text:body already removed', file=sys.stderr)
PYEOF

# Patch: invoicing.ts — odstraň duplicate secure: false
python3 - <<'PYEOF'
import sys
f = '/services/admin-data/patched/src/routes/invoicing.ts'
src = open(f).read()
old = "        secure: false,\n        ignoreTLS: true,\n        secure: false,"
new = "        secure: false,\n        ignoreTLS: true,"
if old in src:
    open(f, 'w').write(src.replace(old, new))
    print('Patch OK: invoicing duplicate secure removed', file=sys.stderr)
else:
    print('Patch SKIP: invoicing duplicate secure not found', file=sys.stderr)
PYEOF

# Patch: bank.ts — autoMatch: VS dekompozice (company.id), přeskočit series 5, invoices-search series filtr
python3 - <<'PYEOF'
import sys
f = '/services/admin-data/patched/src/routes/bank.ts'
src = open(f).read()

# 1. autoMatch query
old1 = "      SELECT invoice_key FROM provider.invoice\n      WHERE (series::text || RIGHT(id::text, 5) || LPAD(number::text, 4, '0')) = ${tx.vs}\n        AND cancellation IS NULL AND settlement IS NULL\n      LIMIT 1"
new1 = "      SELECT i.invoice_key FROM provider.invoice i\n      JOIN provider.company c ON c.company_key = i.company_key\n      WHERE i.series::text = LEFT(${tx.vs}, 1)\n        AND RIGHT(c.id::text, LENGTH(${tx.vs}) - 5) = SUBSTRING(${tx.vs}, 2, LENGTH(${tx.vs}) - 5)\n        AND i.number = RIGHT(${tx.vs}, 4)::int\n        AND i.cancellation IS NULL\n      LIMIT 1"
if old1 in src:
    src = src.replace(old1, new1)
    print('Patch OK: bank.ts autoMatch query', file=sys.stderr)
else:
    print('Patch SKIP: bank.ts autoMatch already patched', file=sys.stderr)

# 2. přeskočit series 5 v autoMatch
old2 = "      AND vs IS NOT NULL AND vs != '' AND credit_debit = 'CRDT'\n  `).all(statementId) as any[]"
new2 = "      AND vs IS NOT NULL AND vs != '' AND credit_debit = 'CRDT'\n      AND SUBSTR(vs, 1, 1) != '5'\n  `).all(statementId) as any[]"
if old2 in src:
    src = src.replace(old2, new2)
    print('Patch OK: bank.ts autoMatch skip series 5', file=sys.stderr)
else:
    print('Patch SKIP: bank.ts autoMatch series 5 already patched', file=sys.stderr)

# 3. invoices-search series filtr
old3 = "    const q = request.query as { q?: string; amount?: string }"
new3 = "    const q = request.query as { q?: string; amount?: string; series?: string }"
if old3 in src:
    src = src.replace(old3, new3)
    print('Patch OK: bank.ts invoices-search series param', file=sys.stderr)

old4 = "        WHERE i.cancellation IS NULL\n          ${q.q ? pgSql`AND (i.number::text ILIKE ${'%' + q.q + '%'} OR c.company ILIKE ${'%' + q.q + '%'})` : pgSql``}\n          ${q.amount ? pgSql`AND ABS(i.total - ${Number(q.amount)}) < 0.01` : pgSql``}"
new4 = "        WHERE i.cancellation IS NULL\n          ${q.series ? pgSql`AND i.series = ${Number(q.series)}` : pgSql`AND i.series != 5`}\n          ${q.q ? pgSql`AND (i.number::text ILIKE ${'%' + q.q + '%'} OR c.company ILIKE ${'%' + q.q + '%'})` : pgSql``}\n          ${q.amount ? pgSql`AND ABS(i.total - ${Number(q.amount)}) < 0.01` : pgSql``}"
if old4 in src:
    src = src.replace(old4, new4)
    print('Patch OK: bank.ts invoices-search series filter', file=sys.stderr)

open(f, 'w').write(src)
PYEOF

# Patch: companies/index.ts — services UPDATE bez COALESCE, aby bylo možné mazat hodnoty
python3 - <<'PYEOF'
import sys
f = '/services/admin-data/patched/src/routes/companies/index.ts'
src = open(f).read()
old = """      await sql`
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
      `"""
new = """      await sql`
        UPDATE provider.company_detail SET
          contract                    = ${body.contract ?? null},
          contract_date               = ${body.contract_date ?? null}::date,
          prog_sent                   = ${body.prog_sent ?? null},
          prog_sent_date              = ${body.prog_sent_date ?? null}::date,
          prog_lent                   = ${body.prog_lent ?? null},
          prog_lent_date              = ${body.prog_lent_date ?? null}::date,
          admittance                  = ${body.admittance ?? null},
          admittance_date             = ${body.admittance_date ?? null}::date,
          forwarding                  = ${body.forwarding ?? null},
          forwarding_date             = ${body.forwarding_date ?? null}::date,
          car_pool                    = ${body.car_pool ?? null},
          car_pool_date               = ${body.car_pool_date ?? null}::date,
          claim_exchange              = ${body.claim_exchange ?? null},
          credit_tip_sms              = ${body.credit_tip_sms ?? null},
          advert_discount             = ${body.advert_discount ?? null},
          send_emails_from_their_domain = ${body.send_emails_from_their_domain ?? null}
        WHERE company_key = ${id}
      `"""
if old in src:
    open(f, 'w').write(src.replace(old, new))
    print('Patch OK: services UPDATE no COALESCE', file=sys.stderr)
else:
    print('Patch SKIP: services UPDATE already patched', file=sys.stderr)
PYEOF

# Patch: companies/index.ts — přidej GET /:id/summary (souhrn aut, SIM, zakázek, faktur, objednávek)
python3 - <<'PYEOF'
import sys
f = '/services/admin-data/patched/src/routes/companies/index.ts'
src = open(f).read()
marker = "  // GET /api/companies/:id/online-log"
insert = """  // GET /api/companies/:id/summary
  app.get('/:id/summary', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    const { id } = request.params as { id: string }
    try {
      const [cars, sims, obligations, invoices, orders] = await Promise.all([
        sql`SELECT
              COUNT(*) FILTER (WHERE inactive IS NOT TRUE) AS active,
              COUNT(*) AS total
            FROM gps.car_base
            WHERE company_key = ${id}`,
        sql`SELECT
              COUNT(*) FILTER (WHERE NOT COALESCE(ie_disabled, false)) AS active,
              COUNT(*) AS total
            FROM gps.simcard_base WHERE company_key = ${id}`,
        sql`SELECT
              COUNT(*) FILTER (WHERE created_time >= NOW() - INTERVAL '7 days') AS recent,
              COUNT(*) AS total
            FROM ta.obligation_base WHERE company_key = ${id}`,
        sql`SELECT
              COUNT(*) FILTER (WHERE updated_time >= NOW() - INTERVAL '7 days') AS recent,
              COUNT(*) AS total
            FROM ta.invoice_base WHERE company_key = ${id}`,
        sql`SELECT
              COUNT(*) FILTER (WHERE created_time >= NOW() - INTERVAL '7 days') AS recent,
              COUNT(*) AS total
            FROM ta.order_base WHERE company_key = ${id}`,
      ])
      return reply.send({
        cars:        { active: Number(cars[0]?.active ?? 0),        total: Number(cars[0]?.total ?? 0) },
        sims:        { active: Number(sims[0]?.active ?? 0),        total: Number(sims[0]?.total ?? 0) },
        obligations: { recent: Number(obligations[0]?.recent ?? 0), total: Number(obligations[0]?.total ?? 0) },
        invoices:    { recent: Number(invoices[0]?.recent ?? 0),    total: Number(invoices[0]?.total ?? 0) },
        orders:      { recent: Number(orders[0]?.recent ?? 0),      total: Number(orders[0]?.total ?? 0) },
      })
    } finally {
      await sql.end()
    }
  })

"""
if '/:id/summary' not in src and marker in src:
    open(f, 'w').write(src.replace(marker, insert + marker))
    print('Patch OK: companies summary endpoint', file=sys.stderr)
else:
    print('Patch SKIP: companies summary already present', file=sys.stderr)
PYEOF

# Patch: sendMail.ts — destrukturuj smtpUser/smtpPass v POST /send handleru
python3 - <<'PYEOF'
import sys
f = '/services/admin-data/patched/src/routes/sendMail.ts'
src = open(f).read()
old = "    const { userDb, passwordDb, initials, employeeSchema } = (request as any).user\n    const sql = getUserSql(userDb, passwordDb)\n    const schema = employeeSchema || 'provider'\n    const body = request.body as {"
new = "    const { userDb, passwordDb, initials, employeeSchema, smtpUser, smtpPass } = (request as any).user\n    const sql = getUserSql(userDb, passwordDb)\n    const schema = employeeSchema || 'provider'\n    const body = request.body as {"
if old in src:
    open(f, 'w').write(src.replace(old, new))
    print('Patch OK: sendMail smtpUser/smtpPass destructure', file=sys.stderr)
else:
    print('Patch SKIP: sendMail smtpUser/smtpPass already destructured', file=sys.stderr)
PYEOF

# Patch: sendMail.ts — přidej GET/PUT /templates endpoint (ukládá do /home/dev/email_templates.json)
python3 - <<'PYEOF'
import sys
f = '/services/admin-data/patched/src/routes/sendMail.ts'
src = open(f).read()
marker = "  // POST /api/send-mail/send"
new_code = """  // GET /api/send-mail/templates
  app.get('/templates', {
    onRequest: [(app as any).authenticate],
  }, async (_request: FastifyRequest, reply: FastifyReply) => {
    const fs = await import('fs/promises')
    const path = '/home/dev/email_templates.json'
    try {
      const data = await fs.readFile(path, 'utf-8')
      return reply.send(JSON.parse(data))
    } catch {
      return reply.send([])
    }
  })

  // PUT /api/send-mail/templates
  app.put('/templates', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const fs = await import('fs/promises')
    const path = '/home/dev/email_templates.json'
    const body = request.body as any[]
    await fs.writeFile(path, JSON.stringify(body, null, 2), 'utf-8')
    return reply.send({ success: true })
  })

  """
if marker in src and "GET /api/send-mail/templates" not in src:
    open(f, 'w').write(src.replace(marker, new_code + marker))
    print('Patch OK: sendMail templates endpoints', file=sys.stderr)
else:
    print('Patch SKIP: sendMail templates already present', file=sys.stderr)
PYEOF

# Patch: invoicing.ts — přidej DELETE endpoint pro smazání faktury
python3 - <<'PYEOF'
import sys
f = '/services/admin-data/patched/src/routes/invoicing.ts'
src = open(f).read()
marker = "  // PUT /api/invoicing/:id/cancel — storno faktury"
new_endpoint = """  // DELETE /api/invoicing/:id — smazání faktury
  app.delete('/:id', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    const { id } = request.params as { id: string }
    try {
      await sql`DELETE FROM provider.invoice WHERE invoice_key = ${id}`
      return reply.send({ success: true })
    } finally {
      await sql.end()
    }
  })

  """
if marker in src and "app.delete('/:id'" not in src:
    open(f, 'w').write(src.replace(marker, new_endpoint + marker))
    print('Patch OK: invoicing DELETE endpoint', file=sys.stderr)
else:
    print('Patch SKIP: invoicing DELETE already present', file=sys.stderr)
PYEOF

# Patch: bank.ts — přidej statement_id filtr do /transactions endpointu
python3 - <<'PYEOF'
import sys
f = '/services/admin-data/patched/src/routes/bank.ts'
src = open(f).read()
old = "    const q = request.query as {\n      unmatched?: string\n      credit_debit?: string\n      date_from?: string\n      date_to?: string\n      vs?: string\n      limit?: string\n      offset?: string\n    }"
new = "    const q = request.query as {\n      unmatched?: string\n      statement_id?: string\n      credit_debit?: string\n      date_from?: string\n      date_to?: string\n      vs?: string\n      limit?: string\n      offset?: string\n    }"
if old in src:
    src = src.replace(old, new)
    old2 = "      if (q.unmatched === 'true') { sql += ' AND t.matched_invoice_id IS NULL' }"
    new2 = "      if (q.unmatched === 'true') { sql += ' AND t.matched_invoice_id IS NULL' }\n      if (q.statement_id)   { sql += ' AND t.statement_id = ?'; params.push(Number(q.statement_id)) }"
    src = src.replace(old2, new2)
    open(f, 'w').write(src)
    print('Patch OK: bank.ts statement_id filter', file=sys.stderr)
else:
    print('Patch SKIP: bank.ts statement_id filter already patched', file=sys.stderr)
PYEOF

# Patch: bank.ts — DELETE /statements/:id
python3 - <<'PYEOF'
import sys
f = '/services/admin-data/patched/src/routes/bank.ts'
src = open(f).read()
anchor = '  // GET /api/bank/statements/:id — detail výpisu + transakce'
new_block = '''  // DELETE /api/bank/statements/:id
  app.delete('/statements/:id', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const result = db.prepare('DELETE FROM bank_statements WHERE id = ?').run(Number(id))
    if (result.changes === 0) return reply.status(404).send({ error: 'Not found' })
    return reply.send({ ok: true })
  })

  // GET /api/bank/statements/:id — detail výpisu + transakce'''
if "app.delete('/statements/:id'" in src:
    print('Patch SKIP: bank.ts DELETE /statements/:id already present', file=sys.stderr)
elif anchor in src:
    open(f, 'w').write(src.replace(anchor, new_block))
    print('Patch OK: bank.ts DELETE /statements/:id', file=sys.stderr)
else:
    print('Patch SKIP: bank.ts DELETE /statements/:id anchor not found', file=sys.stderr)
PYEOF

# Patch: bank.ts — přidej invoice_settlement do odpovědi /transactions
python3 - <<'PYEOF'
import sys
f = '/services/admin-data/patched/src/routes/bank.ts'
src = open(f).read()
old = "          SELECT i.invoice_key, i.number, i.year, i.total, c.company\n          FROM provider.invoice i\n          LEFT JOIN provider.company c ON i.company_key = c.company_key\n          WHERE i.invoice_key = ANY(${matchedIds})"
new = "          SELECT i.invoice_key, i.number, i.year, i.total, i.settlement, c.company\n          FROM provider.invoice i\n          LEFT JOIN provider.company c ON i.company_key = c.company_key\n          WHERE i.invoice_key = ANY(${matchedIds})"
if old in src:
    src = src.replace(old, new)
    old2 = "        invoice_company: invoiceMap[t.matched_invoice_id]?.company ?? null,"
    new2 = "        invoice_company:    invoiceMap[t.matched_invoice_id]?.company ?? null,\n        invoice_settlement: invoiceMap[t.matched_invoice_id]?.settlement ?? null,"
    src = src.replace(old2, new2)
    open(f, 'w').write(src)
    print('Patch OK: bank.ts invoice_settlement', file=sys.stderr)
else:
    print('Patch SKIP: bank.ts invoice_settlement already patched', file=sys.stderr)
PYEOF

# Patch: bank.ts — přidej i.company_key do invoice SELECT a invoice_company_key do výsledku
python3 - <<'PYEOF'
import sys
f = '/services/admin-data/patched/src/routes/bank.ts'
src = open(f).read()
if 'invoice_company_key' in src:
    print('Patch SKIP: bank.ts invoice_company_key already present', file=sys.stderr)
else:
    src = src.replace(
        'SELECT i.invoice_key, i.number, i.year, i.total, i.settlement, c.company\n          FROM provider.invoice i',
        'SELECT i.invoice_key, i.number, i.year, i.total, i.settlement, i.company_key, c.company\n          FROM provider.invoice i'
    )
    src = src.replace(
        'invoice_company:    invoiceMap[t.matched_invoice_id]?.company ?? companyMap[t.matched_company_key]?.company ?? null,\n        invoice_settlement: invoiceMap[t.matched_invoice_id]?.settlement ?? null,',
        'invoice_company:     invoiceMap[t.matched_invoice_id]?.company ?? companyMap[t.matched_company_key]?.company ?? null,\n        invoice_company_key: invoiceMap[t.matched_invoice_id]?.company_key ?? t.matched_company_key ?? null,\n        invoice_settlement:  invoiceMap[t.matched_invoice_id]?.settlement ?? null,'
    )
    src = src.replace(
        'invoice_company:    invoiceMap[t.matched_invoice_id]?.company ?? companyMap[t.matched_company_key]?.company ?? null,\n        invoice_company_key: invoiceMap[t.matched_invoice_id]?.company_key ?? t.matched_company_key ?? null,\n        invoice_settlement:  invoiceMap[t.matched_invoice_id]?.settlement ?? null,',
        'invoice_company:     invoiceMap[t.matched_invoice_id]?.company ?? companyMap[t.matched_company_key]?.company ?? null,\n        invoice_company_key: invoiceMap[t.matched_invoice_id]?.company_key ?? t.matched_company_key ?? null,\n        invoice_settlement:  invoiceMap[t.matched_invoice_id]?.settlement ?? null,'
    )
    open(f, 'w').write(src)
    print('Patch OK: bank.ts invoice_company_key', file=sys.stderr)
PYEOF

# Patch: camt053Parser — nový formát ČSOB (Strd[], PRCD balance, VS: prefix, splitXmlDocuments)
python3 - <<'PYEOF'
import sys
new_content = r'''/**
 * Parser pro ČSOB SEPAXML výpisy (ISO 20022 CAMT.053)
 */

import { XMLParser } from 'fast-xml-parser'

export interface ParsedStatement {
  accountIban: string
  accountNumber: string
  periodFrom: string
  periodTo: string
  openingBalance: number
  closingBalance: number
  currency: string
  transactions: ParsedTransaction[]
}

export interface ParsedTransaction {
  entryRef: string
  transactionDate: string
  valueDate: string
  amount: number
  currency: string
  creditDebit: 'CRDT' | 'DBIT'
  counterpartyName: string
  counterpartyIban: string
  vs: string
  ks: string
  ss: string
  remittanceInfo: string
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  isArray: (tagName) => ['Ntry', 'Bal', 'TxDtls', 'Strd'].includes(tagName),
})

/** Rekurzivně najde první hodnotu klíče v objektu */
function findKey(obj: any, key: string): any {
  if (!obj || typeof obj !== 'object') return undefined
  if (key in obj) return obj[key]
  for (const v of Object.values(obj)) {
    const found = findKey(v, key)
    if (found !== undefined) return found
  }
  return undefined
}

/**
 * Rozdělí XML soubor obsahující více <Document> elementů na jednotlivé dokumenty.
 * ČSOB posílá více výpisů (různé účty) v jednom souboru jako zřetězené XML dokumenty.
 */
export function splitXmlDocuments(content: string): string[] {
  const parts = content.split(/(?=<\?xml\s)/i).map(s => s.trim()).filter(Boolean)
  return parts.length > 0 ? parts : [content]
}

export function parseCamt053(xmlContent: string): ParsedStatement {
  const doc = parser.parse(xmlContent)

  // Najdeme Stmt bez ohledu na namespace prefixes nebo hloubku zanořování
  const stmt = findKey(doc, 'Stmt')

  if (!stmt) throw new Error('Neplatný CAMT.053 XML — element Stmt nenalezen')

  // Účet
  const acctId = stmt['Acct']?.['Id']
  const accountIban: string = acctId?.['IBAN'] ?? acctId?.['Othr']?.['Id'] ?? ''
  const accountNumber: string = acctId?.['Othr']?.['Id'] ?? accountIban

  // Období
  const frToDt = stmt['FrToDt']
  const periodFrom: string = (frToDt?.['FrDtTm'] ?? frToDt?.['FrDt'] ?? '').toString().slice(0, 10)
  const periodTo: string = (frToDt?.['ToDtTm'] ?? frToDt?.['ToDt'] ?? '').toString().slice(0, 10)

  // Zůstatky — PRCD = počáteční (nový formát), OPBD = počáteční (starý), CLBD = závěrečný
  let openingBalance = 0
  let closingBalance = 0
  let currency = 'CZK'

  const balances: any[] = Array.isArray(stmt['Bal']) ? stmt['Bal'] : (stmt['Bal'] ? [stmt['Bal']] : [])
  for (const bal of balances) {
    const cd = bal['Tp']?.['CdOrPrtry']?.['Cd'] ?? ''
    const amt = bal['Amt']
    const amtVal = typeof amt === 'object' ? Number(amt['#text'] ?? amt) : Number(amt)
    const ccy = typeof amt === 'object' ? (amt['@_Ccy'] ?? 'CZK') : 'CZK'
    const sign = bal['CdtDbtInd'] === 'DBIT' ? -1 : 1
    currency = ccy
    if (cd === 'OPBD' || cd === 'PRCD') openingBalance = amtVal * sign
    if (cd === 'CLBD') closingBalance = amtVal * sign
  }

  // Transakce
  const entries: any[] = Array.isArray(stmt['Ntry']) ? stmt['Ntry'] : (stmt['Ntry'] ? [stmt['Ntry']] : [])
  const transactions: ParsedTransaction[] = entries.map((ntry: any) => parseEntry(ntry, currency))

  return {
    accountIban,
    accountNumber,
    periodFrom,
    periodTo,
    openingBalance,
    closingBalance,
    currency,
    transactions,
  }
}

function parseEntry(ntry: any, defaultCurrency: string): ParsedTransaction {
  // Částka
  const amtEl = ntry['Amt']
  const amount: number = typeof amtEl === 'object'
    ? Number(amtEl['#text'] ?? amtEl)
    : Number(amtEl)
  const currency: string = typeof amtEl === 'object' ? (amtEl['@_Ccy'] ?? defaultCurrency) : defaultCurrency
  const creditDebit: 'CRDT' | 'DBIT' = ntry['CdtDbtInd'] === 'DBIT' ? 'DBIT' : 'CRDT'

  // Datum
  const transactionDate: string = (ntry['BookgDt']?.['Dt'] ?? ntry['BookgDt']?.['DtTm'] ?? '').toString().slice(0, 10)
  const valueDate: string = (ntry['ValDt']?.['Dt'] ?? ntry['ValDt']?.['DtTm'] ?? transactionDate).toString().slice(0, 10)

  // Reference
  const entryRef: string = ntry['AcctSvcrRef'] ?? ntry['NtryRef'] ?? ''

  // Detail transakce
  const ntryDtls = ntry['NtryDtls']
  const txDtlsList: any[] = !ntryDtls ? [] : (
    Array.isArray(ntryDtls['TxDtls']) ? ntryDtls['TxDtls'] : (ntryDtls['TxDtls'] ? [ntryDtls['TxDtls']] : [])
  )
  const tx = txDtlsList[0] ?? {}

  // Protistrana
  const rltdPties = tx['RltdPties'] ?? {}
  const counterpartyName: string = creditDebit === 'CRDT'
    ? (rltdPties['Dbtr']?.['Nm'] ?? rltdPties['Dbtr']?.['Pty']?.['Nm'] ?? '')
    : (rltdPties['Cdtr']?.['Nm'] ?? rltdPties['Cdtr']?.['Pty']?.['Nm'] ?? '')
  const counterpartyAcct = creditDebit === 'CRDT'
    ? rltdPties['DbtrAcct']?.['Id']
    : rltdPties['CdtrAcct']?.['Id']
  const counterpartyIban: string = counterpartyAcct?.['IBAN'] ?? counterpartyAcct?.['Othr']?.['Id'] ?? ''

  // Variabilní a jiné symboly — nový formát: Strd[] s prefixem "VS:", "KS:", "SS:"
  const refs = tx['Refs'] ?? {}
  const addtlInfo: string = (tx['AddtlTxInf'] ?? ntry['AddtlNtryInf'] ?? '').toString()
  const rmtInf = tx['RmtInf'] ?? {}
  const rmtUstrd: string = (Array.isArray(rmtInf['Ustrd']) ? rmtInf['Ustrd'][0] : rmtInf['Ustrd']) ?? ''

  // Strd je nyní pole — každý symbol (VS, KS, SS) je ve vlastním elementu s prefixem
  const strdList: any[] = Array.isArray(rmtInf['Strd']) ? rmtInf['Strd'] : (rmtInf['Strd'] ? [rmtInf['Strd']] : [])
  const strdRefs: string[] = strdList.map(s => String(s['CdtrRefInf']?.['Ref'] ?? ''))

  const vs = extractVs(refs, addtlInfo, strdRefs, rmtUstrd)
  const ks = strdRefs.map(r => extractSymbol('KS', r)).find(v => v) || extractSymbol('KS', addtlInfo)
  const ss = strdRefs.map(r => extractSymbol('SS', r)).find(v => v) || extractSymbol('SS', addtlInfo)

  const remittanceInfo: string = rmtUstrd || addtlInfo || strdRefs.join(' ')

  return {
    entryRef,
    transactionDate,
    valueDate,
    amount,
    currency,
    creditDebit,
    counterpartyName,
    counterpartyIban,
    vs,
    ks,
    ss,
    remittanceInfo,
  }
}

function extractVs(refs: any, addtlInfo: string, strdRefs: string[], rmtUstrd: string): string {
  // 1. Structured remittance refs — nový formát: "VS:12345", starý: jen číslo
  for (const ref of strdRefs) {
    const fromRef = extractSymbol('VS', ref)
    if (fromRef) return fromRef
    if (/^\d+$/.test(ref.trim())) return ref.trim()
  }

  // 2. EndToEndId (může být ve formátu /VS/KS/SS nebo jen číslo)
  const e2e: string = refs['EndToEndId'] ?? ''
  if (e2e && e2e !== 'NOTPROVIDED') {
    const vsMatch = e2e.match(/(?:^|\/)(\d{1,10})(?:\/|$)/)
    if (vsMatch) return vsMatch[1]
    if (/^\d{1,10}$/.test(e2e.trim())) return e2e.trim()
  }

  // 3. AddtlTxInf — formát "VS:12345 KS:..."
  const vsFromAddtl = extractSymbol('VS', addtlInfo)
  if (vsFromAddtl) return vsFromAddtl

  // 4. Unstructured remittance
  const vsFromUstrd = extractSymbol('VS', rmtUstrd)
  if (vsFromUstrd) return vsFromUstrd

  return ''
}

function extractSymbol(symbol: string, text: string): string {
  if (!text) return ''
  const re = new RegExp(`(?:${symbol}[:\\s/])(\\d{1,10})(?:[/\\s]|$)`, 'i')
  const m = re.exec(text)
  return m ? m[1] : ''
}
'''
open('/services/admin-data/patched/src/services/camt053Parser.ts', 'w').write(new_content)
print('Patch OK: camt053Parser — nový formát ČSOB', file=sys.stderr)
PYEOF

# Patch: camt053Parser — seqNumber (ElctrncSeqNb / LglSeqNb)
python3 - <<'PYEOF'
import sys
f = '/services/admin-data/patched/src/services/camt053Parser.ts'
src = open(f).read()
if 'seqNumber' in src:
    print('Patch SKIP: camt053Parser seqNumber already present', file=sys.stderr)
else:
    src = src.replace(
        'export interface ParsedStatement {\n  accountIban',
        'export interface ParsedStatement {\n  seqNumber: number | null\n  accountIban'
    )
    src = src.replace(
        '  // Účet\n  const acctId',
        "  // Pořadové číslo výpisu\n  const seqNumber: number | null = stmt['ElctrncSeqNb'] != null\n    ? Number(stmt['ElctrncSeqNb'])\n    : stmt['LglSeqNb'] != null ? Number(stmt['LglSeqNb']) : null\n\n  // Účet\n  const acctId"
    )
    src = src.replace(
        '  return {\n    accountIban,',
        '  return {\n    seqNumber,\n    accountIban,'
    )
    open(f, 'w').write(src)
    print('Patch OK: camt053Parser seqNumber', file=sys.stderr)
PYEOF

# Patch: bank.ts — seq_number v bank_statements
python3 - <<'PYEOF'
import sys
f = '/services/admin-data/patched/src/routes/bank.ts'
src = open(f).read()
if 'seq_number' in src:
    print('Patch SKIP: bank.ts seq_number already present', file=sys.stderr)
else:
    src = src.replace(
        'const stmtInsertStatement = db.prepare(`\n  INSERT OR IGNORE INTO bank_statements\n    (filename, account_iban, account_number, period_from, period_to,\n     opening_balance, closing_balance, currency)\n  VALUES (@filename, @account_iban, @account_number, @period_from, @period_to,\n          @opening_balance, @closing_balance, @currency)\n`)',
        "try { db.exec(`ALTER TABLE bank_statements ADD COLUMN seq_number INTEGER`) } catch {}\nconst stmtInsertStatement = db.prepare(`\n  INSERT OR IGNORE INTO bank_statements\n    (filename, account_iban, account_number, period_from, period_to,\n     opening_balance, closing_balance, currency, seq_number)\n  VALUES (@filename, @account_iban, @account_number, @period_from, @period_to,\n          @opening_balance, @closing_balance, @currency, @seq_number)\n`)"
    )
    open(f, 'w').write(src)
    print('Patch OK: bank.ts seq_number', file=sys.stderr)
PYEOF

# Patch: bank.ts — import splitXmlDocuments + multi-document upload
python3 - <<'PYEOF'
import sys
f = '/services/admin-data/patched/src/routes/bank.ts'
src = open(f).read()
old_import = "import { parseCamt053 } from '../services/camt053Parser.js'"
new_import = "import { parseCamt053, splitXmlDocuments } from '../services/camt053Parser.js'"
old_loop = """        const existing = stmtGetStatementByFilename.get(filename) as any
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
        }"""
new_loop = """        const isFinstaFile = isFinsta(xmlContent)
        const docs = isFinstaFile ? [xmlContent] : splitXmlDocuments(xmlContent)

        for (let di = 0; di < docs.length; di++) {
          const docFilename = docs.length > 1 ? `${filename}#${di + 1}` : filename
          const existing = stmtGetStatementByFilename.get(docFilename) as any
          if (existing) { skipped++; continue }

          try {
            const stmt = isFinstaFile ? parseFinsta(docs[di]) : parseCamt053(docs[di])

            const insertStmt = db.transaction(() => {
              stmtInsertStatement.run({
                filename: docFilename,
                account_iban: stmt.accountIban || null,
                account_number: stmt.accountNumber || null,
                period_from: stmt.periodFrom || null,
                period_to: stmt.periodTo || null,
                opening_balance: stmt.openingBalance,
                closing_balance: stmt.closingBalance,
                currency: stmt.currency,
                seq_number: stmt.seqNumber ?? null,
              })
              const saved = stmtGetStatementByFilename.get(docFilename) as any
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
            errors.push(`${docFilename}: ${parseErr.message}`)
          }
        }"""
if old_import in src and old_loop in src:
    src = src.replace(old_import, new_import).replace(old_loop, new_loop)
    open(f, 'w').write(src)
    print('Patch OK: bank.ts multi-document upload + splitXmlDocuments', file=sys.stderr)
elif new_import in src and new_loop in src:
    print('Patch SKIP: bank.ts multi-document already patched', file=sys.stderr)
else:
    print('Patch SKIP: bank.ts multi-document — pattern not found', file=sys.stderr)
PYEOF

# Patch: bank.ts — invoices-search pro proforma hledá v demo.proforma_invoice (SELECT *)
python3 - <<'PYEOF'
import sys
f = '/services/admin-data/patched/src/routes/bank.ts'
src = open(f).read()
old = "    const q = request.query as { q?: string; amount?: string; series?: string }\n\n    try {\n      const rows = await pgSql`\n        SELECT i.invoice_key, i.number, i.year, i.total, i.currency,\n               i.issued, i.maturity, i.settlement, c.company\n        FROM provider.invoice i\n        LEFT JOIN provider.company c ON i.company_key = c.company_key\n        WHERE i.cancellation IS NULL\n          ${q.series ? pgSql`AND i.series = ${Number(q.series)}` : pgSql`AND i.series != 5`}\n          ${q.q ? pgSql`AND (i.number::text ILIKE ${'%' + q.q + '%'} OR c.company ILIKE ${'%' + q.q + '%'})` : pgSql``}\n          ${q.amount ? pgSql`AND ABS(i.total - ${Number(q.amount)}) < 0.01` : pgSql``}\n        ORDER BY i.issued DESC\n        LIMIT 20\n      `\n      return reply.send(rows)"
new = """    const q = request.query as { q?: string; amount?: string; series?: string; proforma?: string }

    try {
      let rows: any[]

      if (q.proforma === 'true') {
        // Hledáme v demo.proforma_invoice — vracíme SELECT * + company
        // invoice_key aliasujeme na company_key, protože match ukládá company_key
        const searchTerm = (q.q ?? '').trim()
        if (/^5\\d{7,}$/.test(searchTerm)) {
          // Plný proforma VS: '5' + series(1) + company_id_right(5) + číslo
          const series = Number(searchTerm[1])
          const companyIdSuffix = searchTerm.slice(2, 7)
          const number = Number(searchTerm.slice(7))
          rows = await pgSql`
            SELECT p.company_key AS invoice_key, p.*, c.company, c.id AS company_id
            FROM demo.proforma_invoice p
            LEFT JOIN provider.company c ON p.company_key = c.company_key
            WHERE p.series = ${series}
              AND RIGHT(c.id::text, 5) = ${companyIdSuffix}
              AND p.number = ${number}
            ORDER BY p.issued DESC
            LIMIT 20
          `
        } else {
          rows = await pgSql`
            SELECT p.company_key AS invoice_key, p.*, c.company, c.id AS company_id
            FROM demo.proforma_invoice p
            LEFT JOIN provider.company c ON p.company_key = c.company_key
            ${searchTerm ? pgSql`WHERE (p.number::text ILIKE ${'%' + searchTerm + '%'} OR c.company ILIKE ${'%' + searchTerm + '%'})` : pgSql``}
            ORDER BY p.issued DESC
            LIMIT 20
          `
        }
      } else {
        rows = await pgSql`
          SELECT i.invoice_key, i.number, i.year, i.total, i.currency,
                 i.issued, i.maturity, i.settlement, c.company
          FROM provider.invoice i
          LEFT JOIN provider.company c ON i.company_key = c.company_key
          WHERE i.cancellation IS NULL
            ${q.series ? pgSql`AND i.series = ${Number(q.series)}` : pgSql`AND i.series != 5`}
            ${q.q ? pgSql`AND (i.number::text ILIKE ${'%' + q.q + '%'} OR c.company ILIKE ${'%' + q.q + '%'})` : pgSql``}
            ${q.amount ? pgSql`AND ABS(i.total - ${Number(q.amount)}) < 0.01` : pgSql``}
          ORDER BY i.issued DESC
          LIMIT 20
        `
      }
      return reply.send(rows)"""
if old in src:
    open(f, 'w').write(src.replace(old, new))
    print('Patch OK: bank.ts invoices-search proforma → demo.proforma_invoice', file=sys.stderr)
elif 'demo.proforma_invoice' in src:
    print('Patch SKIP: bank.ts invoices-search proforma already patched', file=sys.stderr)
else:
    print('Patch SKIP: bank.ts invoices-search — pattern not found', file=sys.stderr)
PYEOF

# Patch: bank.ts — match endpoint podporuje proformu (company_key → matched_company_key)
python3 - <<'PYEOF'
import sys
f = '/services/admin-data/patched/src/routes/bank.ts'
src = open(f).read()
old = "    const { invoice_key } = request.body as { invoice_key: number }\n\n    try {\n      const [inv] = await pgSql`\n        SELECT invoice_key FROM provider.invoice WHERE invoice_key = ${invoice_key}\n      `\n      if (!inv) return reply.status(404).send({ error: 'Faktura nenalezena' })\n\n      db.prepare(`\n        UPDATE bank_transactions\n        SET matched_invoice_id = ?, matched_at = datetime('now')\n        WHERE id = ?\n      `).run(invoice_key, Number(id))"
new = """    const body = request.body as { invoice_key?: number; company_key?: number }

    try {
      if (body.company_key != null) {
        // Proforma záloha — ulož company_key do matched_company_key
        const [co] = await pgSql`
          SELECT company_key FROM provider.company WHERE company_key = ${body.company_key}
        `
        if (!co) return reply.status(404).send({ error: 'Firma nenalezena' })
        db.prepare(`
          UPDATE bank_transactions
          SET matched_company_key = ?, matched_invoice_id = NULL, matched_at = datetime('now')
          WHERE id = ?
        `).run(body.company_key, Number(id))
      } else {
        const invoice_key = body.invoice_key!
        const [inv] = await pgSql`
          SELECT invoice_key FROM provider.invoice WHERE invoice_key = ${invoice_key}
        `
        if (!inv) return reply.status(404).send({ error: 'Faktura nenalezena' })
        db.prepare(`
          UPDATE bank_transactions
          SET matched_invoice_id = ?, matched_company_key = NULL, matched_at = datetime('now')
          WHERE id = ?
        `).run(invoice_key, Number(id))
      }"""
if old in src:
    open(f, 'w').write(src.replace(old, new))
    print('Patch OK: bank.ts match endpoint — proforma company_key', file=sys.stderr)
elif 'body.company_key' in src:
    print('Patch SKIP: bank.ts match — proforma already patched', file=sys.stderr)
else:
    print('Patch SKIP: bank.ts match — pattern not found', file=sys.stderr)
PYEOF

# Patch: bank.ts — company name lookup pro matched_company_key v /statements/:id a /transactions
python3 - <<'PYEOF'
import sys
f = '/services/admin-data/patched/src/routes/bank.ts'
src = open(f).read()
old1 = """      const txWithInvoice = transactions.map(t => ({
        ...t,
        invoice_number:  invoiceMap[t.matched_invoice_id]?.number ?? null,
        invoice_year:    invoiceMap[t.matched_invoice_id]?.year ?? null,
        invoice_total:   invoiceMap[t.matched_invoice_id]?.total ?? null,
        invoice_company:    invoiceMap[t.matched_invoice_id]?.company ?? null,
        invoice_settlement: invoiceMap[t.matched_invoice_id]?.settlement ?? null,
      }))

      return reply.send({ ...stmt, transactions: txWithInvoice })"""
new1 = """      const matchedCompanyKeys = transactions.filter(t => t.matched_company_key).map(t => t.matched_company_key)
      let companyMap: Record<number, any> = {}
      if (matchedCompanyKeys.length > 0) {
        const companies = await pgSql`
          SELECT company_key, company FROM provider.company
          WHERE company_key = ANY(${matchedCompanyKeys})
        `
        for (const co of companies) companyMap[co.company_key] = co
      }

      const txWithInvoice = transactions.map(t => ({
        ...t,
        invoice_number:     invoiceMap[t.matched_invoice_id]?.number ?? null,
        invoice_year:       invoiceMap[t.matched_invoice_id]?.year ?? null,
        invoice_total:      invoiceMap[t.matched_invoice_id]?.total ?? null,
        invoice_company:     invoiceMap[t.matched_invoice_id]?.company ?? companyMap[t.matched_company_key]?.company ?? null,
        invoice_company_key: invoiceMap[t.matched_invoice_id]?.company_key ?? t.matched_company_key ?? null,
        invoice_settlement:  invoiceMap[t.matched_invoice_id]?.settlement ?? null,
      }))

      return reply.send({ ...stmt, transactions: txWithInvoice })"""
old2 = """      const result = transactions.map(t => ({
        ...t,
        invoice_number:  invoiceMap[t.matched_invoice_id]?.number ?? null,
        invoice_year:    invoiceMap[t.matched_invoice_id]?.year ?? null,
        invoice_total:   invoiceMap[t.matched_invoice_id]?.total ?? null,
        invoice_company:    invoiceMap[t.matched_invoice_id]?.company ?? null,
        invoice_settlement: invoiceMap[t.matched_invoice_id]?.settlement ?? null,
      }))"""
new2 = """      const matchedCompanyKeys = transactions.filter(t => t.matched_company_key).map(t => t.matched_company_key)
      let companyMap: Record<number, any> = {}
      if (matchedCompanyKeys.length > 0) {
        const companies = await pgSql`
          SELECT company_key, company FROM provider.company
          WHERE company_key = ANY(${matchedCompanyKeys})
        `
        for (const co of companies) companyMap[co.company_key] = co
      }

      const result = transactions.map(t => ({
        ...t,
        invoice_number:      invoiceMap[t.matched_invoice_id]?.number ?? null,
        invoice_year:        invoiceMap[t.matched_invoice_id]?.year ?? null,
        invoice_total:       invoiceMap[t.matched_invoice_id]?.total ?? null,
        invoice_company:     invoiceMap[t.matched_invoice_id]?.company ?? companyMap[t.matched_company_key]?.company ?? null,
        invoice_company_key: invoiceMap[t.matched_invoice_id]?.company_key ?? t.matched_company_key ?? null,
        invoice_settlement:  invoiceMap[t.matched_invoice_id]?.settlement ?? null,
      }))"""
changed = False
if old1 in src:
    src = src.replace(old1, new1)
    changed = True
if old2 in src:
    src = src.replace(old2, new2)
    changed = True
if changed:
    open(f, 'w').write(src)
    print('Patch OK: bank.ts companyMap pro matched_company_key', file=sys.stderr)
elif 'companyMap' in src:
    print('Patch SKIP: bank.ts companyMap already patched', file=sys.stderr)
else:
    print('Patch SKIP: bank.ts companyMap — pattern not found', file=sys.stderr)
PYEOF

# Patch: bank.ts — autoMatchInvoices přidá auto-match pro proforma zálohy
python3 - <<'PYEOF'
import sys
f = '/services/admin-data/patched/src/routes/bank.ts'
src = open(f).read()
old = """async function autoMatchInvoices(pgSql: any, statementId: number) {
  const transactions = db.prepare(`
    SELECT id, vs FROM bank_transactions
    WHERE statement_id = ? AND matched_invoice_id IS NULL
      AND vs IS NOT NULL AND vs != '' AND credit_debit = 'CRDT'
      AND SUBSTR(vs, 1, 1) != '5'
  `).all(statementId) as any[]

  for (const tx of transactions) {
    const [inv] = await pgSql`
      SELECT i.invoice_key FROM provider.invoice i
      JOIN provider.company c ON c.company_key = i.company_key
      WHERE i.series::text = LEFT(${tx.vs}, 1)
        AND RIGHT(c.id::text, LENGTH(${tx.vs}) - 5) = SUBSTRING(${tx.vs}, 2, LENGTH(${tx.vs}) - 5)
        AND i.number = RIGHT(${tx.vs}, 4)::int
        AND i.cancellation IS NULL
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
}"""
new = """async function autoMatchInvoices(pgSql: any, statementId: number) {
  // Regulérní faktury
  const transactions = db.prepare(`
    SELECT id, vs FROM bank_transactions
    WHERE statement_id = ? AND matched_invoice_id IS NULL
      AND vs IS NOT NULL AND vs != '' AND credit_debit = 'CRDT'
      AND SUBSTR(vs, 1, 1) != '5'
  `).all(statementId) as any[]

  for (const tx of transactions) {
    const [inv] = await pgSql`
      SELECT i.invoice_key FROM provider.invoice i
      JOIN provider.company c ON c.company_key = i.company_key
      WHERE i.series::text = LEFT(${tx.vs}, 1)
        AND RIGHT(c.id::text, LENGTH(${tx.vs}) - 5) = SUBSTRING(${tx.vs}, 2, LENGTH(${tx.vs}) - 5)
        AND i.number = RIGHT(${tx.vs}, 4)::int
        AND i.cancellation IS NULL
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

  // Proforma zálohy (VS začíná '5'): '5' + series(1) + company_id_right(5) + číslo
  const proformaTxs = db.prepare(`
    SELECT id, vs FROM bank_transactions
    WHERE statement_id = ? AND matched_company_key IS NULL
      AND vs IS NOT NULL AND LENGTH(vs) >= 8 AND credit_debit = 'CRDT'
      AND SUBSTR(vs, 1, 1) = '5'
  `).all(statementId) as any[]

  for (const tx of proformaTxs) {
    const series = Number(tx.vs[1])
    const companyIdSuffix = tx.vs.slice(2, 7)
    const number = Number(tx.vs.slice(7))
    const [pf] = await pgSql`
      SELECT p.company_key
      FROM demo.proforma_invoice p
      JOIN provider.company c ON c.company_key = p.company_key
      WHERE p.series = ${series}
        AND RIGHT(c.id::text, 5) = ${companyIdSuffix}
        AND p.number = ${number}
      LIMIT 1
    `
    if (pf) {
      db.prepare(`
        UPDATE bank_transactions
        SET matched_company_key = ?, matched_at = datetime('now')
        WHERE id = ?
      `).run(pf.company_key, tx.id)
    }
  }
}"""
if old in src:
    open(f, 'w').write(src.replace(old, new))
    print('Patch OK: bank.ts autoMatchInvoices — proforma zálohy', file=sys.stderr)
elif 'proformaTxs' in src:
    print('Patch SKIP: bank.ts autoMatch proforma already patched', file=sys.stderr)
else:
    print('Patch SKIP: bank.ts autoMatch proforma — pattern not found', file=sys.stderr)
PYEOF

# Patch: invoicing.ts — PUT /:id (editace) + POST /create (nová faktura, položky v měně faktury)
python3 - <<'PYEOF'
import sys
f = '/services/admin-data/patched/src/routes/invoicing.ts'
src = open(f).read()
if "app.put('/:id'," in src and "app.post('/create'," in src:
    print('Patch SKIP: invoicing.ts PUT/:id + POST/create already present', file=sys.stderr)
elif "// PUT /api/invoicing/:id/demands" in src:
    anchor = "  // PUT /api/invoicing/:id/demands"
    new_block = '''  // PUT /api/invoicing/:id — editace faktury (hlavicka + polozky v mene faktury)
  app.put('/:id', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    const { id } = request.params as { id: string }
    const body = request.body as {
      issued: string; fulfilment: string; maturity: string
      settlement?: string | null; series: number; payment_method: string
      currency: string; curr_value: number
      proforma_number?: number | null; demand_notes?: number
      items: InvoiceItem[]
    }
    try {
      const rate = body.curr_value || 1
      let priceLow = 0, priceHigh = 0, vatLow = 0, vatHigh = 0
      let vatLowRate = 0, vatHighRate = 0
      const calcItems: any[] = []
      for (const item of body.items) {
        const disc = (100 - item.discount) / 100
        const priceSale = item.price_unit * disc
        const price = priceSale * item.quantity
        const vatAmt = Math.round(price * (item.vat_rate / 100) * 100) / 100
        const priceTotal = price + vatAmt
        if (item.vat_rate < 17) { vatLowRate = item.vat_rate; vatLow += vatAmt; priceLow += price }
        else { vatHighRate = item.vat_rate; vatHigh += vatAmt; priceHigh += price }
        calcItems.push({ name: item.name, priceUnit: item.price_unit, discount: item.discount, priceSale, quantity: item.quantity, price, vatRate: item.vat_rate, vat: vatAmt, priceTotal })
      }
      const priceSum = priceLow + priceHigh
      const totalSum = priceSum + vatLow + vatHigh
      await sql`
        UPDATE provider.invoice SET
          issued = ${body.issued}, fulfilment = ${body.fulfilment}, maturity = ${body.maturity},
          settlement = ${body.settlement ?? null},
          series = ${body.series}, payment_method = ${body.payment_method},
          currency = ${body.currency}, rate = ${rate},
          proforma_number = ${body.proforma_number ?? null},
          demand_notes = ${body.demand_notes ?? 0},
          price = ${priceSum}, price_low = ${priceLow}, price_high = ${priceHigh},
          vat_low_rate = ${vatLowRate}, vat_low = ${vatLow},
          vat_high_rate = ${vatHighRate}, vat_high = ${vatHigh},
          total = ${totalSum},
          curr_price = ${priceSum * rate}, curr_vat_low = ${vatLow * rate},
          curr_vat_high = ${vatHigh * rate}, curr_total = ${totalSum * rate}
        WHERE invoice_key = ${id}
      `
      await sql`DELETE FROM provider.invoice_item WHERE invoice_key = ${id}`
      for (const ci of calcItems) {
        await sql`
          INSERT INTO provider.invoice_item
            (invoice_key, name, price_unit, discount, price_sale, quantity, price, vat_rate, vat, price_total, currency)
          VALUES
            (${id}, ${ci.name}, ${ci.priceUnit}, ${ci.discount}, ${ci.priceSale},
             ${ci.quantity}, ${ci.price}, ${ci.vatRate}, ${ci.vat}, ${ci.priceTotal}, ${body.currency})
        `
      }
      const [updated] = await sql`SELECT * FROM provider.invoice WHERE invoice_key = ${id}`
      return reply.send(updated)
    } catch (err: any) {
      return reply.code(500).send({ error: err.message })
    } finally {
      await sql.end()
    }
  })

  // POST /api/invoicing/create — jedna faktura, polozky v mene faktury
  app.post('/create', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb, provider } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    const body = request.body as {
      company_key: number; issued: string; fulfilment: string; maturity: string
      settlement?: string | null; series: number; payment_method: string
      currency: string; curr_value: number
      proforma_number?: number | null; demand_notes?: number
      items: InvoiceItem[]
    }
    try {
      const rate = body.curr_value || 1
      let priceLow = 0, priceHigh = 0, vatLow = 0, vatHigh = 0
      let vatLowRate = 0, vatHighRate = 0
      const calcItems: any[] = []
      for (const item of body.items) {
        const disc = (100 - item.discount) / 100
        const priceSale = item.price_unit * disc
        const price = priceSale * item.quantity
        const vatAmt = Math.round(price * (item.vat_rate / 100) * 100) / 100
        if (item.vat_rate < 17) { vatLowRate = item.vat_rate; vatLow += vatAmt; priceLow += price }
        else { vatHighRate = item.vat_rate; vatHigh += vatAmt; priceHigh += price }
        calcItems.push({ name: item.name, priceUnit: item.price_unit, discount: item.discount,
          priceSale, quantity: item.quantity, price, vatRate: item.vat_rate, vat: vatAmt, priceTotal: price + vatAmt })
      }
      const priceSum = priceLow + priceHigh
      const totalSum = priceSum + vatLow + vatHigh
      const year = new Date(body.issued).getFullYear()
      const maxResult = await sql`
        SELECT MAX(number) AS max_num FROM provider.invoice
        WHERE year = ${year} AND currency = ${body.currency} AND provider = ${provider}
      `
      const nextNum = maxResult[0]?.max_num ? Number(maxResult[0].max_num) + 1 : (body.currency === 'CZK' ? 1 : 9000)
      const [inv] = await sql`
        INSERT INTO provider.invoice
          (company_key, year, number, provider, series, issued, maturity, fulfilment,
           price, price_low, price_high, vat_low_rate, vat_low, vat_high_rate, vat_high,
           total, curr_price, curr_vat_low, curr_vat_high, curr_total,
           payment_method, currency, rate, demand_notes, proforma_number, settlement)
        VALUES
          (${body.company_key}, ${year}, ${nextNum}, ${provider}, ${body.series},
           ${body.issued}, ${body.maturity}, ${body.fulfilment},
           ${priceSum}, ${priceLow}, ${priceHigh}, ${vatLowRate}, ${vatLow}, ${vatHighRate}, ${vatHigh},
           ${totalSum}, ${priceSum * rate}, ${vatLow * rate}, ${vatHigh * rate}, ${totalSum * rate},
           ${body.payment_method}, ${body.currency}, ${rate},
           ${body.demand_notes ?? 0}, ${body.proforma_number ?? null}, ${body.settlement ?? null})
        RETURNING invoice_key
      `
      for (const ci of calcItems) {
        await sql`
          INSERT INTO provider.invoice_item
            (invoice_key, name, price_unit, discount, price_sale, quantity, price, vat_rate, vat, price_total, currency)
          VALUES
            (${inv.invoice_key}, ${ci.name}, ${ci.priceUnit}, ${ci.discount}, ${ci.priceSale},
             ${ci.quantity}, ${ci.price}, ${ci.vatRate}, ${ci.vat}, ${ci.priceTotal}, ${body.currency})
        `
      }
      return reply.code(201).send({ invoice_key: inv.invoice_key })
    } catch (err: any) {
      return reply.code(500).send({ error: err.message })
    } finally {
      await sql.end()
    }
  })

  // PUT /api/invoicing/:id/demands'''
    open(f, 'w').write(src.replace(anchor, new_block))
    print('Patch OK: invoicing.ts PUT/:id + POST/create', file=sys.stderr)
else:
    print('Patch SKIP: invoicing.ts anchor not found', file=sys.stderr)
PYEOF

# Patch: invoicing.ts — přejmenuj series
python3 - <<'PYEOF'
import sys
f = '/services/admin-data/patched/src/routes/invoicing.ts'
src = open(f).read()
old = "  1: '1-Internet', 2: '2-Modem Euro', 3: '3-Modem CZ', 4: '4-INFAX',\n  5: '-----------', 6: '6-Software', 7: '7-SMS', 8: '8-Školení', 9: '9-Reklama',"
new = "  1: '1-Spedice', 2: '2-Modem Euro', 3: '3-Modem CZ', 4: '4-TM+SIM',\n  5: '-----------', 6: '6-Hardware', 7: '7-SMS', 8: '8-Doprava', 9: '9-Reklama',"
if old in src:
    open(f, 'w').write(src.replace(old, new))
    print('Patch OK: invoicing.ts series names', file=sys.stderr)
else:
    print('Patch SKIP: series names already patched', file=sys.stderr)
PYEOF

# Patch: statistics.ts — přidej orders-monthly endpoint (ta.obligation)
python3 - <<'PYEOF'
import sys
f = '/services/admin-data/patched/src/routes/statistics.ts'
src = open(f).read()
anchor = '  // GET /api/statistics/lent-access-stats'
insert = '''  // GET /api/statistics/orders-monthly — zakázky dle měsíce (posledních 36 měsíců)
  app.get('/orders-monthly', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    try {
      const rows = await sql`
        SELECT to_char(date_trunc('month', created_time), 'YYYY-MM') AS month,
               count(*)::int AS count
        FROM ta.obligation_base
        WHERE created_time >= date_trunc('month', CURRENT_DATE) - INTERVAL '35 months'
        GROUP BY date_trunc('month', created_time)
        ORDER BY month
      `
      const byMonth = {}
      for (const r of rows) byMonth[r.month] = r.count
      const result = []
      for (let i = 35; i >= 0; i--) {
        const d = new Date()
        d.setDate(1)
        d.setMonth(d.getMonth() - i)
        const key = d.toISOString().slice(0, 7)
        result.push({ month: key, count: byMonth[key] ?? 0 })
      }
      return reply.send(result)
    } finally {
      await sql.end()
    }
  })

'''
if '/orders-monthly' not in src and anchor in src:
    open(f, 'w').write(src.replace(anchor, insert + anchor))
    print('Patch OK: statistics.ts orders-monthly', file=sys.stderr)
else:
    print('Patch SKIP: orders-monthly already present', file=sys.stderr)
PYEOF

# Patch: statistics.ts — přidej lent-access-stats endpoint (min. 1x předplatili + trvalí uživatelé)
python3 - <<'PYEOF'
import sys
f = '/services/admin-data/patched/src/routes/statistics.ts'
src = open(f).read()
anchor = '  // GET /api/statistics/overdue-companies — firmy s pohledávkami po splatnosti'
insert = '''  // GET /api/statistics/lent-access-stats — min. 1x předplatili + trvalí uživatelé (36 měsíců)
  app.get('/lent-access-stats', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    try {
      const [row] = await sql`
        SELECT
          count(*) FILTER (WHERE admittance_date IS NOT NULL
                             AND admittance_date >= prog_lent_date + INTERVAL '45 days')::int AS d45,
          count(*) FILTER (WHERE prog_lent_date <= CURRENT_DATE - INTERVAL '45 days'
                             AND admittance_date > CURRENT_DATE)::int                         AS trvali
        FROM provider.company_detail
        WHERE prog_lent_date >= date_trunc('month', CURRENT_DATE) - INTERVAL '35 months'
          AND prog_lent_date IS NOT NULL
      `
      return reply.send(row)
    } finally {
      await sql.end()
    }
  })

'''
if '/lent-access-stats' not in src and anchor in src:
    open(f, 'w').write(src.replace(anchor, insert + anchor))
    print('Patch OK: statistics.ts lent-access-stats', file=sys.stderr)
else:
    print('Patch SKIP: lent-access-stats already present or anchor not found', file=sys.stderr)
PYEOF

# Patch: statistics.ts — orders-monthly přidej digital (web_origin)
python3 - <<'PYEOF'
import sys
f = '/services/admin-data/patched/src/routes/statistics.ts'
src = open(f).read()
old = """        SELECT to_char(date_trunc('month', created_time), 'YYYY-MM') AS month,
               count(*)::int AS count
        FROM ta.obligation_base
        WHERE created_time >= date_trunc('month', CURRENT_DATE) - INTERVAL '35 months'
        GROUP BY date_trunc('month', created_time)
        ORDER BY month"""
new = """        SELECT to_char(date_trunc('month', created_time), 'YYYY-MM') AS month,
               count(*)::int AS count,
               count(*) FILTER (WHERE web_origin = 'D')::int AS digital
        FROM ta.obligation_base
        WHERE created_time >= date_trunc('month', CURRENT_DATE) - INTERVAL '35 months'
        GROUP BY date_trunc('month', created_time)
        ORDER BY month"""
old2 = "      const byMonth: Record<string, number> = {}\n      for (const r of rows) byMonth[r.month] = r.count\n      const result = []\n      for (let i = 35; i >= 0; i--) {\n        const d = new Date()\n        d.setDate(1)\n        d.setMonth(d.getMonth() - i)\n        const key = d.toISOString().slice(0, 7)\n        result.push({ month: key, count: byMonth[key] ?? 0 })\n      }"
new2 = "      const byMonth: Record<string, { count: number; digital: number }> = {}\n      for (const r of rows) byMonth[r.month] = { count: r.count, digital: r.digital }\n      const result = []\n      for (let i = 35; i >= 0; i--) {\n        const d = new Date()\n        d.setDate(1)\n        d.setMonth(d.getMonth() - i)\n        const key = d.toISOString().slice(0, 7)\n        result.push({ month: key, count: byMonth[key]?.count ?? 0, digital: byMonth[key]?.digital ?? 0 })\n      }"
changed = False
if old in src:
    src = src.replace(old, new); changed = True
if old2 in src:
    src = src.replace(old2, new2); changed = True
if changed:
    open(f, 'w').write(src)
    print('Patch OK: orders-monthly digital field', file=sys.stderr)
else:
    print('Patch SKIP: orders-monthly digital already present', file=sys.stderr)
PYEOF

# Patch: statistics.ts — přidej invoice-base-monthly endpoint (ta.invoice_base)
python3 - <<'PYEOF'
import sys
f = '/services/admin-data/patched/src/routes/statistics.ts'
src = open(f).read()
anchor = '  // GET /api/statistics/lent-access-stats'
insert = """  // GET /api/statistics/invoice-base-monthly — faktury dle měsíce (posledních 36 měsíců)
  app.get('/invoice-base-monthly', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    try {
      const rows = await sql`
        SELECT to_char(date_trunc('month', issued), 'YYYY-MM') AS month,
               count(*) FILTER (WHERE type = 'I')::int AS issued,
               count(*) FILTER (WHERE type = 'R')::int AS received
        FROM ta.invoice_base
        WHERE issued >= date_trunc('month', CURRENT_DATE) - INTERVAL '35 months'
          AND cancelation IS NULL
        GROUP BY date_trunc('month', issued)
        ORDER BY month
      `
      const byMonth = {}
      for (const r of rows) byMonth[r.month] = { issued: r.issued, received: r.received }
      const result = []
      for (let i = 35; i >= 0; i--) {
        const d = new Date()
        d.setDate(1)
        d.setMonth(d.getMonth() - i)
        const key = d.toISOString().slice(0, 7)
        result.push({ month: key, issued: byMonth[key]?.issued ?? 0, received: byMonth[key]?.received ?? 0 })
      }
      return reply.send(result)
    } finally {
      await sql.end()
    }
  })

"""
if '/invoice-base-monthly' not in src and anchor in src:
    open(f, 'w').write(src.replace(anchor, insert + anchor))
    print('Patch OK: invoice-base-monthly endpoint', file=sys.stderr)
else:
    print('Patch SKIP: invoice-base-monthly already present', file=sys.stderr)
PYEOF

# Patch: statistics.ts — přidej order-base-monthly endpoint (ta.order_base)
python3 - <<'PYEOF'
import sys
f = '/services/admin-data/patched/src/routes/statistics.ts'
src = open(f).read()
anchor = '  // GET /api/statistics/lent-access-stats'
insert = """  // GET /api/statistics/order-base-monthly — objednávky dle měsíce (posledních 36 měsíců)
  app.get('/order-base-monthly', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    try {
      const rows = await sql`
        SELECT to_char(date_trunc('month', created_time), 'YYYY-MM') AS month,
               count(*)::int AS count,
               count(*) FILTER (WHERE accepted_time IS NOT NULL)::int AS accepted
        FROM ta.order_base
        WHERE created_time >= date_trunc('month', CURRENT_DATE) - INTERVAL '35 months'
        GROUP BY date_trunc('month', created_time)
        ORDER BY month
      `
      const byMonth = {}
      for (const r of rows) byMonth[r.month] = { count: r.count, accepted: r.accepted }
      const result = []
      for (let i = 35; i >= 0; i--) {
        const d = new Date()
        d.setDate(1)
        d.setMonth(d.getMonth() - i)
        const key = d.toISOString().slice(0, 7)
        result.push({ month: key, count: byMonth[key]?.count ?? 0, accepted: byMonth[key]?.accepted ?? 0 })
      }
      return reply.send(result)
    } finally {
      await sql.end()
    }
  })

"""
if '/order-base-monthly' not in src and anchor in src:
    open(f, 'w').write(src.replace(anchor, insert + anchor))
    print('Patch OK: order-base-monthly endpoint', file=sys.stderr)
else:
    print('Patch SKIP: order-base-monthly already present', file=sys.stderr)
PYEOF

# Spusť backend z patchované kopie
cd "$MYDIR"
exec node /services/admin-data/node_modules/.bin/tsx watch \
  --env-file=/services/admin-data/.env \
  src/index.ts >> /services/admin-data/api.log 2>&1
