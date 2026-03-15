import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { getInvoiceDetail } from '../api'
import tmLogo from '../assets/tm_logo.svg'

// ── Konstanty dodavatele ────────────────────────────────────────────────────
const SUP = {
  name:    '1. Česká obchodní, s.r.o.',
  street:  'Poptoční 340',
  cityzip: '592 14 Nové Veselí (CZ)',
  ico:     '60743395',
  dic:     'CZ60743395',
  phone:   '+420 737 288 091',
  email:   'info@truckmanager.eu',
  account: '226164811/0300',
  iban:    'CZ27 0300 0000 0002 2615 4811',
  swift:   'CEKOCZPP',
}
const SUP_EUR = {
  account: '349438195/0300',
  iban:    'CZ77 0300 0000 0003 4943 8195',
  swift:   'CEKOCZPP',
}

const PAY: Record<string, string> = {
  P: 'Převodem',
  T: 'Převodem',
  D: 'Dobírkou',
  C: 'Hotově',
}

const ORANGE = '#e87820'
const DARK   = '#2c3e50'
const GRAY   = '#9ca3af'
const LGRAY  = '#f1f5f9'
const BORDER = '#a0b4c8'

// ── Helpery ─────────────────────────────────────────────────────────────────
function fmtDate(d: string | null | undefined) {
  if (!d) return ''
  const dt = new Date(d)
  return `${String(dt.getDate()).padStart(2,'0')}.${String(dt.getMonth()+1).padStart(2,'0')}.${dt.getFullYear()}`
}
function fmtNum(n: number | string | null | undefined, dec = 2) {
  const v = Number(n ?? 0)
  return v.toLocaleString('cs-CZ', { minimumFractionDigits: dec, maximumFractionDigits: dec })
}


// ── Hlavní komponenta ────────────────────────────────────────────────────────
export const InvoicePrint = () => {
  const { id } = useParams<{ id: string }>()
  const [inv, setInv] = useState<any>(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!id) return
    getInvoiceDetail(id).then(setInv).catch((e: any) => setErr(String(e.message ?? e)))
  }, [id])

  if (err)  return <div style={{ padding: 30, color: 'red', fontFamily: 'Arial' }}>Chyba: {err}</div>
  if (!inv) return <div style={{ padding: 30, fontFamily: 'Arial' }}>Načítám fakturu…</div>

  const bank = inv.currency === 'EUR' ? SUP_EUR : SUP

  const vs = `${inv.series}${String(inv.company_id ?? '').slice(-5)}${String(inv.number).padStart(4,'0')}`

  const custName    = inv.inv_company || inv.company    || ''
  const custStreet  = inv.inv_street  || inv.street     || ''
  const custZip     = inv.inv_zip     || inv.zip        || ''
  const custCity    = inv.inv_city    || inv.city       || ''
  const custCountry = inv.inv_country || inv.country    || ''

  // Skupiny DPH pro souhrn
  const vatMap: Record<number, { base: number; vat: number }> = {}
  for (const it of inv.items ?? []) {
    const r = Number(it.vat_rate)
    if (!vatMap[r]) vatMap[r] = { base: 0, vat: 0 }
    vatMap[r].base += Number(it.price      ?? 0)
    vatMap[r].vat  += Number(it.vat        ?? 0)
  }
  const vatRates = Object.keys(vatMap).map(Number).sort((a, b) => a - b)

  const totalNet = vatRates.reduce((s, r) => s + vatMap[r].base, 0)
  const totalVat = vatRates.reduce((s, r) => s + vatMap[r].vat,  0)
  const total    = Number(inv.curr_total ?? inv.total ?? (totalNet + totalVat))

  // ── Styly ─────────────────────────────────────────────────────────────────
  const page: React.CSSProperties = {
    fontFamily: 'Arial, Helvetica, sans-serif',
    fontSize: 13,
    color: DARK,
    background: '#fff',
    width: '100%',
    maxWidth: 780,
    margin: '0 auto',
    boxSizing: 'border-box',
    padding: '0 4px',
  }

  return (
    <div className="print-outer" style={{ background: '#f3f4f6', minHeight: '100vh', paddingTop: 56 }}>
      {/* ── PRINT TOOLBAR (skrytý při tisku) ─────────────────────────────── */}
      <style>{`@media print { .no-print { display: none !important; } body, .print-outer { background: white !important; padding-top: 0 !important; margin: 0 !important; min-height: 0 !important; } .print-card { box-shadow: none !important; border-radius: 0 !important; } }`}</style>
      <div className="no-print" style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        background: '#1e3a5f', height: 48,
        display: 'flex', alignItems: 'center', gap: 10, padding: '0 20px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
      }}>
        <div style={{ color: '#93b4d4', fontSize: 13, flex: 1 }}>
          Faktura č. {vs} — {inv.company}
        </div>
        <button onClick={() => window.print()} style={{
          background: ORANGE, color: '#fff', border: 'none', borderRadius: 7,
          padding: '7px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 7,
        }}>
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/>
          </svg>
          Tisknout
        </button>
        <button onClick={() => window.close()} style={{
          background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)',
          borderRadius: 7, padding: '7px 14px', fontSize: 13, cursor: 'pointer',
        }}>
          Zavřít
        </button>
      </div>

    <div data-invoice-ready className="print-card" style={{ ...page, background: '#fff', padding: '24px 28px', borderRadius: 8, boxShadow: '0 2px 16px rgba(0,0,0,0.1)' }}>

      {/* ── ZÁHLAVÍ ──────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <img src={tmLogo} alt="TruckManager" style={{ height: 52 }} />
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: DARK, letterSpacing: 0.2 }}>FAKTURA – DAŇOVÝ DOKLAD</div>
          <div style={{ fontSize: 16, color: DARK, marginTop: 2 }}>číslo {vs}</div>
        </div>
      </div>

      {/* ── DODAVATEL / ODBĚRATEL ────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
        {/* Dodavatel */}
        <div style={{ flex: 1, border: `1px solid ${BORDER}`, borderRadius: 7, padding: '11px 14px' }}>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, color: GRAY, marginBottom: 5 }}>Dodavatel</div>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 2 }}>{SUP.name}</div>
          <div style={{ lineHeight: 1.55, color: DARK }}>{SUP.street}</div>
          <div style={{ lineHeight: 1.55, color: DARK, marginBottom: 4 }}>{SUP.cityzip}</div>
          <div style={{ fontSize: 14, color: '#7a8fa6', lineHeight: 1.6 }}>
            IČO: {SUP.ico} &nbsp;·&nbsp; DIČ: {SUP.dic}
          </div>
          <div style={{ fontSize: 14, color: '#7a8fa6', lineHeight: 1.6 }}>
            {SUP.phone} &nbsp;·&nbsp; {SUP.email}
          </div>
        </div>
        {/* Odběratel */}
        <div style={{ flex: 1, border: `1px solid ${BORDER}`, borderRadius: 7, padding: '11px 14px' }}>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, color: GRAY, marginBottom: 5 }}>Odběratel</div>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 2 }}>{custName}</div>
          {custStreet && <div style={{ lineHeight: 1.55, color: DARK }}>{custStreet}</div>}
          <div style={{ lineHeight: 1.55, color: DARK, marginBottom: 4 }}>
            {custZip} {custCity}{custCountry ? ` (${custCountry})` : ''}
          </div>
          {(inv.cin || inv.tin) && (
            <div style={{ fontSize: 14, color: '#7a8fa6', lineHeight: 1.6 }}>
              {inv.cin ? `IČO: ${inv.cin}` : ''}
              {inv.cin && inv.tin ? ' \u00b7 ' : ''}
              {inv.tin ? `DIČ: ${inv.tin}` : ''}
            </div>
          )}
        </div>
      </div>

      {/* ── DATUMY ───────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', background: LGRAY, borderRadius: 7,
        marginBottom: 14, overflow: 'hidden',
      }}>
        {[
          { label: 'Datum vystavení',  val: fmtDate(inv.issued),      orange: false },
          { label: 'Datum plnění',     val: fmtDate(inv.fulfilment),  orange: false },
          { label: 'Datum splatnosti', val: fmtDate(inv.maturity),    orange: true  },
          { label: 'Způsob platby',    val: PAY[inv.payment_method] ?? inv.payment_method ?? '', orange: false },
        ].map((d, i) => (
          <div key={i} style={{ flex: 1, padding: '9px 14px', borderRight: i < 3 ? `1px solid ${BORDER}` : 'none' }}>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.7, color: GRAY, marginBottom: 4 }}>{d.label}</div>
            <div style={{ fontSize: 14, fontWeight: d.orange ? 600 : 400, color: d.orange ? ORANGE : DARK }}>{d.val}</div>
          </div>
        ))}
      </div>

      {/* ── POLOŽKY ──────────────────────────────────────────────────────── */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 0 }}>
        <thead>
          <tr style={{ borderBottom: `1.5px solid #8098ae` }}>
            <th style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.7, color: GRAY, fontWeight: 700, textAlign: 'left',   padding: '7px 6px 7px 0' }}>Popis</th>
            <th style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.7, color: GRAY, fontWeight: 700, textAlign: 'right',  padding: '7px 6px',        width: 45 }}>Mn.</th>
            <th style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.7, color: GRAY, fontWeight: 700, textAlign: 'right',  padding: '7px 6px',        width: 72 }}>Cena/ks</th>
            <th style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.7, color: GRAY, fontWeight: 700, textAlign: 'right',  padding: '7px 6px',        width: 50 }}>Sleva</th>
            <th style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.7, color: GRAY, fontWeight: 700, textAlign: 'right',  padding: '7px 6px',        width: 42 }}>DPH</th>
            <th style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.7, color: GRAY, fontWeight: 700, textAlign: 'right',  padding: '7px 0 7px 6px',  width: 110 }}>Celkem</th>
          </tr>
        </thead>
        <tbody>
          {(inv.items ?? []).map((it: any, i: number) => (
            <tr key={i} style={{ borderBottom: `1px solid ${BORDER}` }}>
              <td style={{ padding: '9px 6px 9px 0', color: DARK }}>{it.name}</td>
              <td style={{ padding: '9px 6px', textAlign: 'right', color: DARK }}>{fmtNum(it.quantity, 0)}</td>
              <td style={{ padding: '9px 6px', textAlign: 'right', color: DARK }}>{fmtNum(it.price_unit)}</td>
              <td style={{ padding: '9px 6px', textAlign: 'right', color: DARK }}>
                {Number(it.discount) > 0 ? `${fmtNum(it.discount, 0)} %` : '—'}
              </td>
              <td style={{ padding: '9px 6px', textAlign: 'right', color: DARK }}>{it.vat_rate} %</td>
              <td style={{ padding: '9px 0 9px 6px', textAlign: 'right', fontWeight: 600, color: DARK, whiteSpace: 'nowrap' }}>
                {fmtNum(it.price_total)} {inv.currency}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ── SOUHRN DPH ───────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
        <div style={{ minWidth: 280 }}>
          {/* DPH skupiny */}
          {vatRates.map(rate => (
            <div key={rate} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', gap: 24 }}>
              <span style={{ color: GRAY, fontSize: 10.5 }}>Základ daně</span>
              <span style={{ fontSize: 10.5 }}>{fmtNum(vatMap[rate].base)} {inv.currency}</span>
            </div>
          ))}
          {vatRates.map(rate => (
            <div key={`vat-${rate}`} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', gap: 24 }}>
              <span style={{ color: GRAY, fontSize: 10.5 }}>DPH {rate} %</span>
              <span style={{ fontSize: 10.5 }}>{fmtNum(vatMap[rate].vat)} {inv.currency}</span>
            </div>
          ))}

          {/* Celkem k úhradě */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
            borderTop: `1.5px solid #8098ae`, marginTop: 8, paddingTop: 8, gap: 24,
          }}>
            <span style={{ fontSize: 14.5, fontWeight: 700, color: DARK }}>Celkem k úhradě</span>
            <div style={{ fontSize: 19, fontWeight: 700, color: DARK, whiteSpace: 'nowrap' }}>
              {fmtNum(total)} {inv.currency}
            </div>
          </div>
        </div>
      </div>

      {/* ── PLATEBNÍ ÚDAJE + POZNÁMKA ─────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 14, marginTop: 20, paddingTop: 14, borderTop: `1px solid ${BORDER}`, alignItems: 'flex-start' }}>
        {/* QR + platební údaje */}
        <div style={{ display: 'flex', gap: 16, flex: 1 }}>
          {/* QR kód */}
          {inv.qr_data_url ? (
            <div style={{ flexShrink: 0, textAlign: 'center' }}>
              <img src={inv.qr_data_url} alt="QR Platba" style={{ width: 110, height: 110, display: 'block' }}/>
              <div style={{ fontSize: 10, color: GRAY, marginTop: 3, letterSpacing: 0.3 }}>QR Platba</div>
            </div>
          ) : null}

          {/* Platební údaje */}
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: DARK, marginBottom: 6 }}>Platební údaje</div>
            <div style={{ fontSize: 14, color: '#7a8fa6', lineHeight: 1.75 }}>
              <div>Číslo účtu: <span style={{ color: '#000' }}>{bank.account}</span></div>
              <div>IBAN: <span style={{ color: '#000' }}>{bank.iban}</span></div>
              <div>SWIFT: <span style={{ color: '#000' }}>{bank.swift}</span></div>
              <div>Variabilní symbol: <strong style={{ color: '#000' }}>{vs}</strong></div>
            </div>
            {inv.settlement && (
              <div style={{ fontSize: 13, fontWeight: 600, color: ORANGE, marginTop: 6 }}>
                Uhrazeno {fmtDate(inv.settlement)}
              </div>
            )}
          </div>
        </div>

        {/* Poznámka */}
        <div style={{ flex: '0 0 280px' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: DARK, marginBottom: 6 }}>Poznámka</div>
          <div style={{
            border: `1px solid ${BORDER}`, borderRadius: 5,
            minHeight: 70, padding: '8px 10px', fontSize: 12, color: DARK,
          }}>
            {inv.note ?? ''}
          </div>
        </div>
      </div>

      {/* ── PATIČKA ──────────────────────────────────────────────────────── */}
      <div style={{
        borderTop: `1px solid ${BORDER}`, marginTop: 18, paddingTop: 8,
        fontSize: 10, color: '#b0bec5', textAlign: 'center', letterSpacing: 0.2,
      }}>
        {SUP.name} &nbsp;·&nbsp; {SUP.street}, {SUP.cityzip} &nbsp;·&nbsp; IČO: {SUP.ico} &nbsp;·&nbsp; DIČ: {SUP.dic} &nbsp;·&nbsp; {SUP.email}
      </div>

    </div>
    </div>
  )
}
