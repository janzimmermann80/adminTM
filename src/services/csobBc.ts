/**
 * ČSOB Business Connector — SOAP/REST klient s mTLS
 *
 * Potřebné env proměnné:
 *   CSOB_CONTRACT_NUMBER  — číslo smlouvy CEB
 *   CSOB_CERT_PATH        — cesta k .crt souboru (default: ./certs/bccert.crt)
 *   CSOB_KEY_PATH         — cesta k .key souboru (default: ./certs/bccert.key)
 *   CSOB_SANDBOX          — "true" pro testovací prostředí
 *
 * Namespace: pokud SOAP volání vrátí chybu parsování, ověř namespace
 * v WSDL: https://www.csob.cz/portal/documents/10710/15100026/cebbc-wsdl.zip
 */

import https from 'node:https'
import fs from 'node:fs'
import path from 'node:path'
import axios from 'axios'

const PROD_SOAP_URL = 'https://ceb-bc.csob.cz/cebbc/api'
const SAND_SOAP_URL = 'https://testceb-bc.csob.cz/cebbc/api'

// Namespace z officiálního WSDL (cebbc-wsdl.zip)
const BC_NS_V4 = 'http://ceb-bc.csob.cz/CEBBCWS/GetDownloadFileList_v4'

export interface BcFileDetail {
  url: string | null
  filename: string
  type: string        // VYPIS | AVIZO | KURZY | IMPPROT
  format: string      // SEPAXML | XML | PDF | ...
  creationDateTime: string
  size: number
  status: string      // D | R | F
}

function getAgent(): https.Agent {
  const certPath = process.env.CSOB_CERT_PATH
    ?? path.resolve(process.cwd(), 'certs/bccert.crt')
  const keyPath = process.env.CSOB_KEY_PATH
    ?? path.resolve(process.cwd(), 'certs/bccert.key')

  if (!fs.existsSync(certPath)) {
    throw new Error(`ČSOB BC certifikát nenalezen: ${certPath}`)
  }
  if (!fs.existsSync(keyPath)) {
    throw new Error(`ČSOB BC privátní klíč nenalezen: ${keyPath}`)
  }

  return new https.Agent({
    cert: fs.readFileSync(certPath),
    key: fs.readFileSync(keyPath),
    rejectUnauthorized: true,
  })
}

function getSoapUrl(): string {
  return process.env.CSOB_SANDBOX === 'true' ? SAND_SOAP_URL : PROD_SOAP_URL
}

/**
 * GetDownloadFileList v4 — vrátí seznam souborů ke stažení
 */
export async function getDownloadFileList(options: {
  prevQueryTimestamp?: string
  fileType?: string    // VYPIS | AVIZO | KURZY | IMPPROT
  fileFormat?: string  // SEPAXML | XML | PDF | ...
}): Promise<{ files: BcFileDetail[]; queryTimestamp: string }> {
  const contractNumber = process.env.CSOB_CONTRACT_NUMBER
  if (!contractNumber) throw new Error('CSOB_CONTRACT_NUMBER není nastaveno v .env')

  const filterTypes = options.fileType
    ? `<v4:FileTypes><v4:FileType>${options.fileType}</v4:FileType></v4:FileTypes>`
    : ''
  const filterFormats = options.fileFormat
    ? `<v4:FileFormats><v4:FileFormat>${options.fileFormat}</v4:FileFormat></v4:FileFormats>`
    : ''
  const prevTs = options.prevQueryTimestamp
    ? `<v4:PrevQueryTimestamp>${options.prevQueryTimestamp}</v4:PrevQueryTimestamp>`
    : ''
  const filter = (filterTypes || filterFormats)
    ? `<v4:Filter>${filterTypes}${filterFormats}</v4:Filter>`
    : ''

  const soapBody = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
               xmlns:v4="${BC_NS_V4}">
  <soap:Body>
    <v4:GetDownloadFileListRequest_v4>
      <v4:ContractNumber>${contractNumber}</v4:ContractNumber>
      ${prevTs}
      ${filter}
    </v4:GetDownloadFileListRequest_v4>
  </soap:Body>
</soap:Envelope>`

  const agent = getAgent()
  const response = await axios.post(getSoapUrl(), soapBody, {
    httpsAgent: agent,
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      'SOAPAction': 'GetDownloadFileList_v4',
    },
    timeout: 30000,
  })

  return parseGetDownloadFileListResponse(response.data)
}

function parseGetDownloadFileListResponse(xml: string): {
  files: BcFileDetail[]
  queryTimestamp: string
} {
  // Jednoduchý regex parser — nahradit xml2js pokud bude potřeba
  const queryTimestamp = extractTag(xml, 'QueryTimestamp') ?? new Date().toISOString()

  const files: BcFileDetail[] = []
  const fileDetailRegex = /<(?:\w+:)?FileDetail>([\s\S]*?)<\/(?:\w+:)?FileDetail>/g
  let match: RegExpExecArray | null

  while ((match = fileDetailRegex.exec(xml)) !== null) {
    const detail = match[1]
    files.push({
      url: extractTag(detail, 'Url') ?? null,
      filename: extractTag(detail, 'Filename') ?? '',
      type: extractTag(detail, 'Type') ?? '',
      format: extractTag(detail, 'Format') ?? '',
      creationDateTime: extractTag(detail, 'CreationDateTime') ?? '',
      size: Number(extractTag(detail, 'Size') ?? 0),
      status: extractTag(detail, 'Status') ?? '',
    })
  }

  return { files, queryTimestamp }
}

function extractTag(xml: string, tag: string): string | null {
  const re = new RegExp(`<(?:\\w+:)?${tag}[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?${tag}>`)
  const m = re.exec(xml)
  return m ? m[1].trim() : null
}

/**
 * Stáhne soubor z URL vrácené GetDownloadFileList
 */
export async function downloadFile(url: string): Promise<Buffer> {
  const agent = getAgent()
  const response = await axios.get(url, {
    httpsAgent: agent,
    responseType: 'arraybuffer',
    timeout: 60000,
  })
  return Buffer.from(response.data)
}
