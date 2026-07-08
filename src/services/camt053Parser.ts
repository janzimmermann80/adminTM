/**
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
  parseTagValue: false,
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

  // Zůstatky
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

  // Variabilní a jiné symboly — ČSOB dává VS/KS/SS ve strukturovaných Strd[] blocích s prefixem "VS:", "KS:", "SS:"
  const refs = tx['Refs'] ?? {}
  const addtlInfo: string = (tx['AddtlTxInf'] ?? ntry['AddtlNtryInf'] ?? '').toString()
  const rmtInf = tx['RmtInf'] ?? {}
  const rmtUstrdRaw = Array.isArray(rmtInf['Ustrd']) ? rmtInf['Ustrd'][0] : rmtInf['Ustrd']
  const rmtUstrd: string = rmtUstrdRaw != null ? String(rmtUstrdRaw) : ''

  // Strd může být pole — každý symbol (VS, KS, SS) je ve vlastním elementu s prefixem
  const strdList: any[] = Array.isArray(rmtInf['Strd']) ? rmtInf['Strd'] : (rmtInf['Strd'] ? [rmtInf['Strd']] : [])
  const strdRefs: string[] = strdList.map((s: any) => String(s['CdtrRefInf']?.['Ref'] ?? ''))

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
  // 1. Structured remittance refs — nový formát ČSOB: "VS:12345", starý: jen číslo
  for (const ref of strdRefs) {
    const fromRef = extractSymbol('VS', ref)
    if (fromRef) return fromRef
    if (/^\d+$/.test(ref.trim())) return ref.trim()
  }

  // 2. EndToEndId (může být objekt/pole nebo ve formátu /VS/KS/SS)
  const e2eRaw = refs['EndToEndId']
  const e2e: string = e2eRaw == null ? '' : (typeof e2eRaw === 'object' ? String(Array.isArray(e2eRaw) ? e2eRaw[0] ?? '' : '') : String(e2eRaw))
  if (e2e && e2e !== 'NOTPROVIDED') {
    const vsFromE2e = extractSymbol('VS', e2e)
    if (vsFromE2e) return vsFromE2e
    // Formát bez oddělovače: ?/VS5408192111/SS/KS nebo /VS12345/
    const vsNoSep = /(?:^|[/?])VS(\d{1,10})(?:\/|$)/i.exec(e2e)
    if (vsNoSep) return vsNoSep[1]
    const vsMatch = e2e.match(/(?:^|\/)(\d{1,10})(?:\/|$)/)
    if (vsMatch) return vsMatch[1]
    if (/^\d{1,10}$/.test(e2e.trim())) return e2e.trim()
  }

  // 3. AddtlTxInf — formát "VS:12345 KS:..." nebo "VS 12345"
  const vsFromAddtl = extractSymbol('VS', addtlInfo)
  if (vsFromAddtl) return vsFromAddtl

  // 4. Unstructured remittance
  const vsFromUstrd = extractSymbol('VS', rmtUstrd)
  if (vsFromUstrd) return vsFromUstrd

  return ''
}

function extractSymbol(symbol: string, text: string): string {
  if (!text) return ''
  // Formáty: "VS:12345", "VS 12345", "/VS12345/"
  const re = new RegExp(`(?:${symbol}[:\\s/])(\\d{1,10})(?:[/\\s]|$)`, 'i')
  const m = re.exec(text)
  return m ? m[1] : ''
}
