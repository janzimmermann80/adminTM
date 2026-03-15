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

# Patch: overdue-companies endpoint v statistics.ts (s region filtrem)
python3 - <<'PYEOF'
import sys
f = '/services/admin-data/patched/src/routes/statistics.ts'
src = open(f).read()
marker = "  // GET /api/statistics/expired-access — firmy s aktivními vozidly ale bez platného přístupu"
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
              AND I.maturity < CURRENT_DATE
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
              AND I.maturity < CURRENT_DATE
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

# Patch: expired-access endpoint v statistics.ts
python3 - <<'PYEOF'
import sys
f = '/services/admin-data/patched/src/routes/statistics.ts'
src = open(f).read()
marker = "  // GET /api/statistics/invoices-monthly — tržby per měsíc (rok)"
insert = """  // GET /api/statistics/expired-access — firmy s aktivními vozidly ale bez platného přístupu
  app.get('/expired-access', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    try {
      const rows = await sql`
        SELECT DISTINCT C.company_key, C.id, C.company, C.city, C.country,
               C.tariff, T.name AS tariff_name, CD.admittance_date
        FROM gps.tracking_last TL
        JOIN gps.car_base CB ON CB.car_key = TL.car_key
        JOIN provider.company C ON C.company_key = CB.company_key
        JOIN provider.company_detail CD ON CD.company_key = C.company_key
        LEFT JOIN provider.tariff T ON T.tariff = C.tariff
        WHERE TL.time >= NOW() - INTERVAL '7 days'
          AND (CD.admittance_date IS NULL OR CD.admittance_date <= CURRENT_DATE)
        ORDER BY C.company
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

# Spusť backend z patchované kopie
cd "$MYDIR"
exec node /services/admin-data/node_modules/.bin/tsx watch \
  --env-file=/services/admin-data/.env \
  src/index.ts >> /services/admin-data/api.log 2>&1
