/**
 * Parser pro ČSOB FINSTA XML výpisy
 */

import { XMLParser } from 'fast-xml-parser'
import type { ParsedStatement, ParsedTransaction } from './camt053Parser.js'

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  isArray: (tagName) => ['FINSTA03', 'FINSTA05'].includes(tagName),
})

function parseAmount(val: string | number | undefined): number {
  if (val == null || val === '' || val === '-') return 0
  return parseFloat(String(val).replace(/\s/g, '').replace(',', '.').replace('+', ''))
}

function parseDateCz(val: string | number | undefined): string {
  if (!val || val === '-') return ''
  const m = String(val).match(/^(\d{2})\.(\d{2})\.(\d{4})$/)
  if (!m) return ''
  return `${m[3]}-${m[2]}-${m[1]}`
}

function nonZero(val: string | number | undefined): string {
  if (val == null) return ''
  const s = String(val).trim()
  if (s === '' || s === '0' || /^0+$/.test(s)) return ''
  return s
}

export function isFinsta(xmlContent: string): boolean {
  return /<FINSTA[\s>]/.test(xmlContent)
}

export function parseFinsta(xmlContent: string): ParsedStatement {
  const doc = parser.parse(xmlContent)
  const finsta = doc['FINSTA']
  if (!finsta) throw new Error('Neplatný FINSTA XML — element FINSTA nenalezen')

  const stmts: any[] = Array.isArray(finsta['FINSTA03'])
    ? finsta['FINSTA03']
    : finsta['FINSTA03'] ? [finsta['FINSTA03']] : []
  if (!stmts.length) throw new Error('Neplatný FINSTA XML — element FINSTA03 nenalezen')

  const s = stmts[0]

  const currency: string = String(s['S60_MENA'] ?? 'CZK')
  const openingBalance = parseAmount(s['S60_CASTKA']) * (s['S60_CD_INDIK'] === 'D' ? -1 : 1)
  const closingBalance = parseAmount(s['S62_CASTKA']) * (s['S62_CD_INDIK'] === 'D' ? -1 : 1)
  const periodFrom = parseDateCz(s['S60_DATUM'])
  const periodTo = parseDateCz(s['S62_DATUM'])
  const accountNumber: string = String(s['S25_CISLO_UCTU'] ?? '')

  const txList: any[] = Array.isArray(s['FINSTA05'])
    ? s['FINSTA05']
    : s['FINSTA05'] ? [s['FINSTA05']] : []

  const transactions: ParsedTransaction[] = txList.map((tx: any) => {
    const creditDebit: 'CRDT' | 'DBIT' = tx['S61_CD_INDIK'] === 'D' ? 'DBIT' : 'CRDT'
    const amount = Math.abs(parseAmount(tx['S61_CASTKA']))
    const txCurrency: string = String(tx['S61_MENA'] ?? currency)
    const transactionDate = parseDateCz(tx['S61_DATUM'])
    const valueDate = parseDateCz(tx['DPROCD'] ?? tx['S61_DATUM'])

    // Pro příchozí platby: VS protistrany = S86_VARSYMPAR, jinak S86_VARSYMOUR
    const vs = creditDebit === 'CRDT'
      ? (nonZero(tx['S86_VARSYMPAR']) || nonZero(tx['S86_VARSYMOUR']))
      : (nonZero(tx['S86_VARSYMOUR']) || nonZero(tx['S86_VARSYMPAR']))
    const ks = nonZero(tx['S86_KONSTSYM'])
    const ss = creditDebit === 'CRDT'
      ? (nonZero(tx['S86_SPECSYMPAR']) || nonZero(tx['S86_SPECSYMOUR']))
      : (nonZero(tx['S86_SPECSYMOUR']) || nonZero(tx['S86_SPECSYMPAR']))

    const counterpartyName: string = String(tx['PART_ACC_ID'] ?? '')
    const counterpartyIban: string = String(tx['PART_ACCNO'] ?? '')
    const entryRef: string = String(tx['REMARK'] ?? tx['REF_TRANS_SYS'] ?? '')
    const remittanceInfo: string = [tx['S61_POST_NAR'], tx['PART_MSG_1'], tx['PART_MSG_2']]
      .filter(Boolean).join(' ').trim()

    return {
      entryRef,
      transactionDate,
      valueDate,
      amount,
      currency: txCurrency,
      creditDebit,
      counterpartyName,
      counterpartyIban,
      vs,
      ks,
      ss,
      remittanceInfo,
    }
  })

  return {
    accountIban: '',
    accountNumber,
    periodFrom,
    periodTo,
    openingBalance,
    closingBalance,
    currency,
    transactions,
  }
}
