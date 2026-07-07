import puppeteer from 'puppeteer'

const CHROME = process.env.PUPPETEER_EXECUTABLE_PATH
const PRINT_BASE_URL = process.env.PRINT_BASE_URL ?? 'http://localhost/new/#/invoicing'

export async function generateInvoicePdf(invoiceKey: number, token: string): Promise<Buffer> {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })
  try {
    const page = await browser.newPage()
    await page.evaluateOnNewDocument((t: string) => {
      localStorage.setItem('token', t)
    }, token)
    await page.goto(`${PRINT_BASE_URL}/${invoiceKey}/print`, { waitUntil: 'networkidle0' })
    await page.waitForSelector('[data-invoice-ready]', { timeout: 10000 })
    const pdf = await page.pdf({
      format: 'A4',
      margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' },
      printBackground: true,
    })
    return Buffer.from(pdf)
  } finally {
    await browser.close()
  }
}
