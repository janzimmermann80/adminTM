import { useState, useEffect } from 'react'
import { Layout } from '../components/Layout'
import { Spinner } from '../components/Spinner'
import { getStatsOrdersMonthly, getStatsOrderBaseMonthly, getStatsInvoiceBaseMonthly } from '../api'

const MonthChart = ({ data, labels, pctLabel }: {
  data: { month: string; count: number; digital: number }[]
  labels?: [string, string]
  pctLabel?: string
}) => {
  const [hover, setHover] = useState<number | null>(null)
  if (data.length === 0) return <div className="h-24 flex items-center justify-center text-sm text-gray-400">Načítání…</div>

  const max = Math.max(...data.map(d => d.count), 1)
  const topPad = 40
  const chartH = 120
  const valH   = 14
  const labelH = 28
  const totalH = topPad + chartH + valH + labelH + 6
  const gap    = 3
  const n      = data.length
  const W      = 800
  const barW   = Math.floor((W - (n - 1) * gap) / n)

  const tipLineH = 13
  const tipPad   = 6
  const tipW     = 150
  const tipH     = tipPad * 2 + (3 + 2) * tipLineH

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${totalH}`} style={{ minWidth: 600, width: '100%', height: totalH }}>
        {data.map((d, i) => {
          const barH = d.count > 0 ? Math.max((d.count / max) * chartH, 3) : 0
          const digH = d.count > 0 ? (d.digital / d.count) * barH : 0
          const x    = i * (barW + gap)
          const y    = topPad + chartH - barH
          const [yr, mo] = d.month.split('-')
          const isJan = mo === '01'
          return (
            <g key={d.month}>
              {isJan && i > 0 && (
                <line x1={x - gap / 2} y1={0} x2={x - gap / 2} y2={totalH}
                  stroke="#e5e7eb" strokeWidth={1} />
              )}
              {/* základ — manuální objednávky */}
              <rect x={x} y={y} width={barW} height={barH}
                fill={isJan ? '#0d8080' : '#0a6b6b'} rx={1} opacity={d.count > 0 ? 1 : 0} />
              {/* vrchol — digitální objednávky */}
              {digH > 0 && (
                <rect x={x} y={y} width={barW} height={digH}
                  fill="#5eead4" rx={1} />
              )}
              {d.count > 0 && (
                <text
                  transform={`translate(${x + barW / 2}, ${y - 4}) rotate(-90)`}
                  textAnchor="start" fontSize={9} fill="#374151">
                  {d.count}
                </text>
              )}
              <text x={x + barW / 2} y={topPad + chartH + valH + 2} textAnchor="middle" fontSize={8} fill="#9ca3af">
                {mo}
              </text>
              {isJan && (
                <text x={x + barW / 2} y={topPad + chartH + valH + 14} textAnchor="middle" fontSize={9}
                  fontWeight="600" fill="#4b5563">
                  {yr}
                </text>
              )}
              {/* průhledný hit-target přes celou výšku sloupce pro hover */}
              <rect x={x} y={0} width={barW} height={topPad + chartH}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(h => (h === i ? null : h))} />
            </g>
          )
        })}

        {hover !== null && labels && (() => {
          const d = data[hover]
          const [yr, mo] = d.month.split('-')
          const manual = d.count - d.digital
          const pct = d.count > 0 ? Math.round((d.digital / d.count) * 100) : 0
          const rows: { color: string; label: string; val: number }[] = [
            { color: '#0a6b6b', label: labels[0], val: manual },
            { color: '#5eead4', label: labels[1], val: d.digital },
          ]
          const cx = hover * (barW + gap) + barW / 2
          const tx = Math.min(Math.max(cx - tipW / 2, 2), W - tipW - 2)
          return (
            <g pointerEvents="none">
              <rect x={tx} y={2} width={tipW} height={tipH} rx={4}
                fill="#111827" opacity={0.92} />
              <text x={tx + tipPad} y={2 + tipPad + 10} fontSize={10} fontWeight="700" fill="#fff">
                {mo}.{yr}
              </text>
              {rows.map((r, li) => (
                <g key={li}>
                  <rect x={tx + tipPad} y={2 + tipPad + tipLineH * (li + 1) + 1} width={7} height={7} rx={1}
                    fill={r.color} />
                  <text x={tx + tipPad + 11} y={2 + tipPad + tipLineH * (li + 1) + 8} fontSize={9} fill="#e5e7eb">
                    {r.label}
                  </text>
                  <text x={tx + tipW - tipPad} y={2 + tipPad + tipLineH * (li + 1) + 8} fontSize={9}
                    textAnchor="end" fontWeight="600" fill="#fff">
                    {r.val.toLocaleString('cs-CZ')}
                  </text>
                </g>
              ))}
              <text x={tx + tipPad} y={2 + tipPad + tipLineH * 3 + 8} fontSize={9} fill="#9ca3af">
                Celkem
              </text>
              <text x={tx + tipW - tipPad} y={2 + tipPad + tipLineH * 3 + 8} fontSize={9}
                textAnchor="end" fontWeight="700" fill="#fff">
                {d.count.toLocaleString('cs-CZ')}
              </text>
              <text x={tx + tipPad} y={2 + tipPad + tipLineH * 4 + 8} fontSize={9} fill="#5eead4">
                {pctLabel ?? `Podíl ${labels[1].toLowerCase()}`}
              </text>
              <text x={tx + tipW - tipPad} y={2 + tipPad + tipLineH * 4 + 8} fontSize={9}
                textAnchor="end" fontWeight="700" fill="#5eead4">
                {pct} %
              </text>
            </g>
          )
        })()}
      </svg>
    </div>
  )
}

// ── Stacked bar chart — N samostatných řad (odspodu nahoru) ──────────────────

const StackedMonthChart = ({ data, colors, labels }: {
  data: { month: string; values: number[] }[]
  colors: string[]
  labels?: string[]
}) => {
  const [hover, setHover] = useState<number | null>(null)
  if (data.length === 0) return <div className="h-24 flex items-center justify-center text-sm text-gray-400">Načítání…</div>

  const max    = Math.max(...data.map(d => d.values.reduce((s, v) => s + v, 0)), 1)
  const topPad = 40
  const chartH = 120
  const valH   = 14
  const labelH = 28
  const totalH = topPad + chartH + valH + labelH + 6
  const gap    = 3
  const n      = data.length
  const W      = 800
  const barW   = Math.floor((W - (n - 1) * gap) / n)

  // Rozměry tooltip boxu (řádky: hlavička měsíce + segmenty + celkem)
  const tipRows = (labels?.length ?? 0) + 2
  const tipLineH = 13
  const tipPad   = 6
  const tipW     = 118
  const tipH     = tipPad * 2 + tipRows * tipLineH

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${totalH}`} style={{ minWidth: 600, width: '100%', height: totalH }}>
        {data.map((d, i) => {
          const total  = d.values.reduce((s, v) => s + v, 0)
          const totalH2 = total > 0 ? Math.max((total / max) * chartH, 3) : 0
          const x      = i * (barW + gap)
          const yTop   = topPad + chartH - totalH2
          const [yr, mo] = d.month.split('-')
          const isJan  = mo === '01'
          // segmenty odspodu nahoru
          let yCursor = topPad + chartH
          const segs = d.values.map((v, si) => {
            const h = total > 0 ? (v / total) * totalH2 : 0
            yCursor -= h
            return { y: yCursor, h, color: colors[si] }
          })
          return (
            <g key={d.month}>
              {isJan && i > 0 && (
                <line x1={x - gap / 2} y1={0} x2={x - gap / 2} y2={totalH}
                  stroke="#e5e7eb" strokeWidth={1} />
              )}
              {segs.map((s, si) => s.h > 0 && (
                <rect key={si} x={x} y={s.y} width={barW} height={s.h}
                  fill={s.color} rx={1} />
              ))}
              {total > 0 && (
                <text
                  transform={`translate(${x + barW / 2}, ${yTop - 4}) rotate(-90)`}
                  textAnchor="start" fontSize={9} fill="#374151">
                  {total}
                </text>
              )}
              <text x={x + barW / 2} y={topPad + chartH + valH + 2} textAnchor="middle" fontSize={8} fill="#9ca3af">
                {mo}
              </text>
              {isJan && (
                <text x={x + barW / 2} y={topPad + chartH + valH + 14} textAnchor="middle" fontSize={9}
                  fontWeight="600" fill="#4b5563">
                  {yr}
                </text>
              )}
              {/* průhledný hit-target přes celou výšku sloupce pro hover */}
              <rect x={x} y={0} width={barW} height={topPad + chartH}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(h => (h === i ? null : h))} />
            </g>
          )
        })}

        {hover !== null && labels && (() => {
          const d = data[hover]
          const [yr, mo] = d.month.split('-')
          const total = d.values.reduce((s, v) => s + v, 0)
          const cx = hover * (barW + gap) + barW / 2
          const tx = Math.min(Math.max(cx - tipW / 2, 2), W - tipW - 2)
          return (
            <g pointerEvents="none">
              <rect x={tx} y={2} width={tipW} height={tipH} rx={4}
                fill="#111827" opacity={0.92} />
              <text x={tx + tipPad} y={2 + tipPad + 10} fontSize={10} fontWeight="700" fill="#fff">
                {mo}.{yr}
              </text>
              {labels.map((lab, li) => (
                <g key={li}>
                  <rect x={tx + tipPad} y={2 + tipPad + tipLineH * (li + 1) + 1} width={7} height={7} rx={1}
                    fill={colors[li]} />
                  <text x={tx + tipPad + 11} y={2 + tipPad + tipLineH * (li + 1) + 8} fontSize={9} fill="#e5e7eb">
                    {lab}
                  </text>
                  <text x={tx + tipW - tipPad} y={2 + tipPad + tipLineH * (li + 1) + 8} fontSize={9}
                    textAnchor="end" fontWeight="600" fill="#fff">
                    {d.values[li].toLocaleString('cs-CZ')}
                  </text>
                </g>
              ))}
              <text x={tx + tipPad} y={2 + tipPad + tipLineH * (labels.length + 1) + 8} fontSize={9} fill="#9ca3af">
                Celkem
              </text>
              <text x={tx + tipW - tipPad} y={2 + tipPad + tipLineH * (labels.length + 1) + 8} fontSize={9}
                textAnchor="end" fontWeight="700" fill="#fff">
                {total.toLocaleString('cs-CZ')}
              </text>
            </g>
          )
        })()}
      </svg>
    </div>
  )
}

export const Statistics = () => {
  const [orders, setOrders]           = useState<{ month: string; count: number; digital: number }[]>([])
  const [orderBase, setOrderBase]     = useState<{ month: string; count: number; accepted: number }[]>([])
  const [invoiceBase, setInvoiceBase] = useState<{ month: string; issued_cz: number; issued_sk: number; received: number }[]>([])
  const [loading, setLoading]         = useState(true)

  useEffect(() => {
    Promise.all([
      getStatsOrdersMonthly().then(setOrders),
      getStatsOrderBaseMonthly().then(setOrderBase),
      getStatsInvoiceBaseMonthly().then(setInvoiceBase),
    ]).finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <Layout>
        <div className="flex justify-center py-24"><Spinner size={10} /></div>
      </Layout>
    )
  }

  const total        = orders.reduce((s, m) => s + m.count, 0)
  const digital      = orders.reduce((s, m) => s + m.digital, 0)
  const digitalPct   = total > 0 ? Math.round((digital / total) * 100) : 0

  const invIssued    = invoiceBase.reduce((s, m) => s + m.issued_cz + m.issued_sk, 0)
  const invIssuedCz  = invoiceBase.reduce((s, m) => s + m.issued_cz, 0)
  const invIssuedSk  = invoiceBase.reduce((s, m) => s + m.issued_sk, 0)
  const invReceived  = invoiceBase.reduce((s, m) => s + m.received, 0)

  const obTotal      = orderBase.reduce((s, m) => s + m.count, 0)
  const obAccepted   = orderBase.reduce((s, m) => s + m.accepted, 0)
  const obAcceptedPct = obTotal > 0 ? Math.round((obAccepted / obTotal) * 100) : 0

  return (
    <Layout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-800">Statistiky</h1>
        <span className="text-sm text-gray-400">{new Date().toLocaleDateString('cs-CZ', { day: '2-digit', month: 'long', year: 'numeric' })}</span>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-700">Vytvořené zakázky za posledních 36 měsíců</h2>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3 text-xs text-gray-500">
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 rounded-sm bg-[#0a6b6b]" />
                Manuální
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 rounded-sm bg-[#5eead4]" />
                Digitální ({digitalPct} %)
              </span>
            </div>
            <span className="text-xs text-gray-400">{total.toLocaleString('cs-CZ')} celkem</span>
          </div>
        </div>
        <MonthChart data={orders} labels={['Manuální', 'Digitální']} pctLabel="Podíl digitální" />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-700">Objednávky za posledních 36 měsíců</h2>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3 text-xs text-gray-500">
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 rounded-sm bg-[#0a6b6b]" />
                Bez potvrzení
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 rounded-sm bg-[#5eead4]" />
                Digitálně potvrzeno ({obAcceptedPct} %)
              </span>
            </div>
            <span className="text-xs text-gray-400">{obTotal.toLocaleString('cs-CZ')} celkem</span>
          </div>
        </div>
        <MonthChart data={orderBase.map(d => ({ month: d.month, count: d.count, digital: d.accepted }))} labels={['Bez potvrzení', 'Digitálně potvrzeno']} pctLabel="Podíl potvrzeno" />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-700">Faktury za posledních 36 měsíců</h2>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3 text-xs text-gray-500">
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 rounded-sm bg-[#0a6b6b]" />
                Vydané CZ ({invIssuedCz.toLocaleString('cs-CZ')})
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 rounded-sm bg-[#5eead4]" />
                Vydané SK ({invIssuedSk.toLocaleString('cs-CZ')})
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 rounded-sm bg-[#f59e0b]" />
                Přijaté ({invReceived.toLocaleString('cs-CZ')})
              </span>
            </div>
            <span className="text-xs text-gray-400">{(invIssued + invReceived).toLocaleString('cs-CZ')} celkem</span>
          </div>
        </div>
        <StackedMonthChart
          data={invoiceBase.map(d => ({ month: d.month, values: [d.received, d.issued_sk, d.issued_cz] }))}
          colors={['#f59e0b', '#5eead4', '#0a6b6b']}
          labels={['Přijaté', 'Vydané SK', 'Vydané CZ']}
        />
      </div>
    </Layout>
  )
}
