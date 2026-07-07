import PdfPrinter from 'pdfmake'
import vfsFonts from 'pdfmake/build/vfs_fonts.js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

// ── Fonty (Roboto z pdfmake vfs — plná diakritika, nic se neinstaluje) ───────
const vfs = vfsFonts.pdfMake.vfs
const fonts = {
  Roboto: {
    normal: Buffer.from(vfs['Roboto-Regular.ttf'], 'base64'),
    bold: Buffer.from(vfs['Roboto-Medium.ttf'], 'base64'),
    italics: Buffer.from(vfs['Roboto-Italic.ttf'], 'base64'),
    bolditalics: Buffer.from(vfs['Roboto-MediumItalic.ttf'], 'base64'),
  },
}
const printer = new PdfPrinter(fonts)

// ── Logo (SVG) ───────────────────────────────────────────────────────────────
let LOGO_SVG = ''
try {
  const here = dirname(fileURLToPath(import.meta.url))
  LOGO_SVG = readFileSync(resolve(here, '../../ui/src/assets/tm_logo.svg'), 'utf8')
} catch {
  LOGO_SVG = ''
}

// ── Konstanty dodavatele (1:1 z InvoicePrint.tsx) ────────────────────────────
const SUP = {
  name: '1. Česká obchodní, s.r.o.',
  street: 'Poptoční 340',
  cityzip: '592 14 Nové Veselí (CZ)',
  ico: '60743395',
  dic: 'CZ60743395',
  phone: '+420 737 288 091',
  email: 'info@truckmanager.eu',
  account: '226164811/0300',
  iban: 'CZ27 0300 0000 0002 2615 4811',
  swift: 'CEKOCZPP',
}
const SUP_EUR = {
  account: '349438195/0300',
  iban: 'CZ77 0300 0000 0003 4943 8195',
  swift: 'CEKOCZPP',
}

const PAY: Record<string, string> = {
  P: 'Převodem', T: 'Převodem', D: 'Dobírkou', C: 'Hotově',
}

// ── Barvy ─────────────────────────────────────────────────────────────────────
const ORANGE = '#e87820'
const DARK = '#2c3e50'
const GRAY = '#9ca3af'
const LGRAY = '#f1f5f9'
const BORDER = '#a0b4c8'
const HEAVY = '#8098ae'
const SUB = '#7a8fa6'

// šířka obsahu na A4 (595.28 − 2×32 marže)
const CONTENT_W = 531

// ── Helpery ─────────────────────────────────────────────────────────────────
function fmtDate(d: string | null | undefined): string {
  if (!d) return ''
  const dt = new Date(d)
  return `${String(dt.getDate()).padStart(2, '0')}.${String(dt.getMonth() + 1).padStart(2, '0')}.${dt.getFullYear()}`
}
function fmtNum(n: number | string | null | undefined, dec = 2): string {
  const v = Number(n ?? 0)
  return v.toLocaleString('cs-CZ', { minimumFractionDigits: dec, maximumFractionDigits: dec })
}

// ── Sestavení pdfmake docDefinition ──────────────────────────────────────────
function buildDocDefinition(inv: any, useLogo: boolean): any {
  const bank = inv.currency === 'EUR' ? SUP_EUR : SUP
  const vs = `${inv.series}${String(inv.company_id ?? '').slice(-5)}${String(inv.number).padStart(4, '0')}`

  const custName = inv.inv_company || inv.company || ''
  const custStreet = inv.inv_street || inv.street || ''
  const custZip = inv.inv_zip || inv.zip || ''
  const custCity = inv.inv_city || inv.city || ''
  const custCountry = inv.inv_country || inv.country || ''

  // DPH skupiny
  const vatMap: Record<number, { base: number; vat: number }> = {}
  for (const it of inv.items ?? []) {
    const r = Number(it.vat_rate)
    if (!vatMap[r]) vatMap[r] = { base: 0, vat: 0 }
    vatMap[r].base += Number(it.price ?? 0)
    vatMap[r].vat += Number(it.vat ?? 0)
  }
  const vatRates = Object.keys(vatMap).map(Number).sort((a, b) => a - b)
  const totalNet = vatRates.reduce((s, r) => s + vatMap[r].base, 0)
  const totalVat = vatRates.reduce((s, r) => s + vatMap[r].vat, 0)
  const total = Number(inv.curr_total ?? inv.total ?? (totalNet + totalVat))
  const ccy = inv.currency

  // ── ZÁHLAVÍ ────────────────────────────────────────────────────────────────
  const logoNode: any = useLogo && LOGO_SVG
    ? { svg: LOGO_SVG, width: 165 }
    : { text: 'TruckManager', bold: true, fontSize: 22, color: DARK, width: 'auto' }
  const header = {
    columns: [
      logoNode,
      {
        width: '*',
        stack: [
          { text: 'FAKTURA – DAŇOVÝ DOKLAD', bold: true, fontSize: 16, color: DARK, alignment: 'right' },
          { text: `číslo ${vs}`, fontSize: 11, color: DARK, alignment: 'right', margin: [0, 2, 0, 0] },
        ],
      },
    ],
    margin: [0, 0, 0, 14],
  }

  // ── DODAVATEL / ODBĚRATEL ────────────────────────────────────────────────────
  const boxLayout = {
    hLineWidth: () => 0.8, vLineWidth: () => 0.8,
    hLineColor: () => BORDER, vLineColor: () => BORDER,
    paddingLeft: () => 11, paddingRight: () => 11, paddingTop: () => 9, paddingBottom: () => 10,
  }
  const supplierStack: any[] = [
    { text: 'DODAVATEL', fontSize: 8, color: GRAY, characterSpacing: 0.6, margin: [0, 0, 0, 4] },
    { text: SUP.name, bold: true, fontSize: 13, margin: [0, 0, 0, 2] },
    { text: SUP.street, fontSize: 10 },
    { text: SUP.cityzip, fontSize: 10, margin: [0, 0, 0, 3] },
    { text: `IČO: ${SUP.ico}  ·  DIČ: ${SUP.dic}`, fontSize: 10, color: SUB, margin: [0, 1, 0, 0] },
    { text: `${SUP.phone}  ·  ${SUP.email}`, fontSize: 10, color: SUB, margin: [0, 1, 0, 0] },
  ]
  const customerStack: any[] = [
    { text: 'ODBĚRATEL', fontSize: 8, color: GRAY, characterSpacing: 0.6, margin: [0, 0, 0, 4] },
    { text: custName, bold: true, fontSize: 13, margin: [0, 0, 0, 2] },
  ]
  if (custStreet) customerStack.push({ text: custStreet, fontSize: 10 })
  customerStack.push({ text: `${custZip} ${custCity}${custCountry ? ` (${custCountry})` : ''}`, fontSize: 10, margin: [0, 0, 0, 3] })
  if (inv.cin || inv.tin) {
    const parts: string[] = []
    if (inv.cin) parts.push(`IČO: ${inv.cin}`)
    if (inv.tin) parts.push(`DIČ: ${inv.tin}`)
    customerStack.push({ text: parts.join('  ·  '), fontSize: 10, color: SUB, margin: [0, 1, 0, 0] })
  }
  // Dodavatel + Odběratel jako jedna tabulka → oba rámečky mají stejnou výšku
  const parties = {
    table: { widths: ['*', '*'], body: [[{ stack: supplierStack }, { stack: customerStack }]] },
    layout: boxLayout,
    margin: [0, 0, 0, 10],
  }

  // ── DATUMY ───────────────────────────────────────────────────────────────────
  const dateCells = [
    { label: 'DATUM VYSTAVENÍ', val: fmtDate(inv.issued), orange: false },
    { label: 'DATUM PLNĚNÍ', val: fmtDate(inv.fulfilment), orange: false },
    { label: 'DATUM SPLATNOSTI', val: fmtDate(inv.maturity), orange: true },
    { label: 'ZPŮSOB PLATBY', val: PAY[inv.payment_method] ?? inv.payment_method ?? '', orange: false },
  ].map((d) => ({
    stack: [
      { text: d.label, fontSize: 8, color: GRAY, characterSpacing: 0.5, margin: [0, 0, 0, 3] },
      { text: d.val, fontSize: 10, bold: d.orange, color: d.orange ? ORANGE : DARK },
    ],
  }))
  const dates = {
    table: { widths: ['*', '*', '*', '*'], body: [dateCells] },
    layout: {
      hLineWidth: () => 0,
      vLineWidth: (i: number) => (i === 0 || i === 4 ? 0 : 0.6),
      vLineColor: () => BORDER,
      fillColor: () => LGRAY,
      paddingLeft: () => 11, paddingRight: () => 11, paddingTop: () => 9, paddingBottom: () => 9,
    },
    margin: [0, 0, 0, 14],
  }

  // ── POLOŽKY ──────────────────────────────────────────────────────────────────
  const th = (t: string, align: 'left' | 'right') => ({
    text: t, fontSize: 8, color: GRAY, bold: true, characterSpacing: 0.5, alignment: align,
  })
  const itemsBody: any[] = [[
    th('POPIS', 'left'), th('MN.', 'right'), th('CENA/KS', 'right'),
    th('SLEVA', 'right'), th('DPH', 'right'), th('CELKEM', 'right'),
  ]]
  for (const it of inv.items ?? []) {
    itemsBody.push([
      { text: it.name, fontSize: 10, color: DARK },
      { text: fmtNum(it.quantity, 0), fontSize: 10, color: DARK, alignment: 'right' },
      { text: fmtNum(it.price_unit), fontSize: 10, color: DARK, alignment: 'right' },
      { text: Number(it.discount) > 0 ? `${fmtNum(it.discount, 0)} %` : '—', fontSize: 10, color: DARK, alignment: 'right' },
      { text: `${it.vat_rate} %`, fontSize: 10, color: DARK, alignment: 'right' },
      { text: `${fmtNum(it.price_total)} ${ccy}`, fontSize: 10, bold: true, color: DARK, alignment: 'right', noWrap: true },
    ])
  }
  const itemsTable = {
    table: { headerRows: 1, widths: ['*', 28, 58, 42, 34, 72], body: itemsBody },
    layout: {
      hLineWidth: (i: number) => (i === 0 ? 0 : i === 1 ? 1.5 : 0.6),
      hLineColor: (i: number) => (i === 1 ? HEAVY : BORDER),
      vLineWidth: () => 0,
      paddingLeft: (i: number) => (i === 0 ? 0 : 6),
      paddingRight: (i: number, node: any) => (i === node.table.widths.length - 1 ? 0 : 6),
      paddingTop: () => 6, paddingBottom: () => 6,
    },
    margin: [0, 0, 0, 0],
  }

  // ── SOUHRN DPH ───────────────────────────────────────────────────────────────
  const sumRow = (label: string, value: string, opts: { labelColor?: string; fs?: number; bold?: boolean; valBold?: boolean } = {}) => ({
    columns: [
      { text: label, color: opts.labelColor ?? GRAY, fontSize: opts.fs ?? 8.5, alignment: 'right', width: '*', bold: !!opts.bold },
      { text: value, fontSize: opts.fs ?? 8.5, alignment: 'right', width: 'auto', noWrap: true, bold: !!opts.valBold },
    ],
    columnGap: 16,
    margin: [0, 2, 0, 2],
  })
  const summaryStack: any[] = []
  for (const r of vatRates) summaryStack.push(sumRow('Základ daně', `${fmtNum(vatMap[r].base)} ${ccy}`))
  for (const r of vatRates) summaryStack.push(sumRow(`DPH ${r} %`, `${fmtNum(vatMap[r].vat)} ${ccy}`))
  if (inv.proforma_number) {
    summaryStack.push(sumRow(
      `Odpočet zálohy poskytnuté na základě zálohové faktury č. ${inv.proforma_number}`,
      `-${fmtNum(total)} ${ccy}`, { labelColor: DARK, fs: 9 },
    ))
  }
  summaryStack.push({ canvas: [{ type: 'line', x1: 0, y1: 0, x2: 230, y2: 0, lineWidth: 1.2, lineColor: HEAVY }], margin: [0, 6, 0, 6] })
  summaryStack.push({
    columns: [
      { text: 'Celkem k úhradě', bold: true, fontSize: 12, color: DARK, width: '*' },
      { text: `${inv.proforma_number ? '0,00' : fmtNum(total)} ${ccy}`, bold: true, fontSize: 15, color: DARK, alignment: 'right', width: 'auto', noWrap: true },
    ],
    columnGap: 16,
  })
  if (inv.currency === 'EUR' && inv.rate) {
    summaryStack.push(sumRow('Použitý kurz EUR/CZK', fmtNum(inv.rate, 4), {}))
    summaryStack.push(sumRow('Celkem v CZK', `${fmtNum(inv.total)} Kč`, {}))
  }
  const summary = {
    columns: [{ width: '*', text: '' }, { width: 230, stack: summaryStack }],
    margin: [0, 6, 0, 0],
  }

  // ── PLATEBNÍ ÚDAJE + POZNÁMKA ─────────────────────────────────────────────────
  const payLine = (label: string, value: string, valBold = false) => ({
    text: [{ text: label, color: SUB }, { text: value, color: '#000000', bold: valBold }],
    fontSize: 10, margin: [0, 1.5, 0, 1.5],
  })
  const payStack: any[] = [
    { text: 'Platební údaje', bold: true, fontSize: 11, color: DARK, margin: [0, 0, 0, 5] },
    payLine('Číslo účtu: ', bank.account),
    payLine('IBAN: ', bank.iban),
    payLine('SWIFT: ', bank.swift),
    payLine('Variabilní symbol: ', vs, true),
  ]
  if (inv.settlement) {
    payStack.push({ text: `Uhrazeno ${fmtDate(inv.settlement)}`, color: ORANGE, bold: true, fontSize: 10, margin: [0, 5, 0, 0] })
  }
  const qrStack: any[] = []
  if (inv.qr_data_url) {
    qrStack.push({ image: inv.qr_data_url, width: 100 })
    qrStack.push({ text: 'QR Platba', fontSize: 8, color: GRAY, alignment: 'center', margin: [0, 3, 0, 0] })
  }
  const leftCols: any[] = []
  if (qrStack.length) leftCols.push({ width: 108, stack: qrStack })
  leftCols.push({ width: '*', stack: payStack })

  const noteBox = {
    width: 200,
    stack: [
      { text: 'Poznámka', bold: true, fontSize: 10, color: DARK, margin: [0, 0, 0, 4] },
      {
        table: { widths: ['*'], heights: [56], body: [[{ text: inv.note ?? '', fontSize: 10, color: DARK }]] },
        layout: {
          hLineWidth: () => 0.8, vLineWidth: () => 0.8, hLineColor: () => BORDER, vLineColor: () => BORDER,
          paddingLeft: () => 8, paddingRight: () => 8, paddingTop: () => 6, paddingBottom: () => 6,
        },
      },
    ],
  }
  const payAndNote = {
    columns: [{ width: '*', columns: leftCols, columnGap: 16 }, noteBox],
    columnGap: 14,
    margin: [0, 14, 0, 0],
  }
  const payTopLine = { canvas: [{ type: 'line', x1: 0, y1: 0, x2: CONTENT_W, y2: 0, lineWidth: 0.8, lineColor: BORDER }], margin: [0, 14, 0, 0] }

  // ── PATIČKA ────────────────────────────────────────────────────────────────
  const footerLine = { canvas: [{ type: 'line', x1: 0, y1: 0, x2: CONTENT_W, y2: 0, lineWidth: 0.8, lineColor: BORDER }], margin: [0, 16, 0, 6] }
  const footerText = {
    text: `${SUP.name}  ·  ${SUP.street}, ${SUP.cityzip}  ·  IČO: ${SUP.ico}  ·  DIČ: ${SUP.dic}  ·  ${SUP.email}`,
    fontSize: 8, color: '#b0bec5', alignment: 'center', characterSpacing: 0.2,
  }

  return {
    pageSize: 'A4',
    pageMargins: [32, 28, 32, 34],
    defaultStyle: { font: 'Roboto', fontSize: 10, color: DARK },
    content: [header, parties, dates, itemsTable, summary, payTopLine, payAndNote, footerLine, footerText],
  }
}

function render(docDefinition: any): Promise<Buffer> {
  return new Promise<Buffer>((resolvePromise, reject) => {
    try {
      const doc = printer.createPdfKitDocument(docDefinition)
      const chunks: Buffer[] = []
      doc.on('data', (c: Buffer) => chunks.push(c))
      doc.on('end', () => resolvePromise(Buffer.concat(chunks)))
      doc.on('error', reject)
      doc.end()
    } catch (e) {
      reject(e)
    }
  })
}

/**
 * Vygeneruje PDF faktury přes pdfmake (serverově, bez prohlížeče).
 * @param inv Detail faktury ve stejném tvaru, jaký vrací GET /api/invoicing/:id
 */
export async function generateInvoicePdf(inv: any): Promise<Buffer> {
  try {
    return await render(buildDocDefinition(inv, true))
  } catch {
    // Fallback bez SVG loga (kdyby ho pdfmake neuměl vykreslit)
    return await render(buildDocDefinition(inv, false))
  }
}
