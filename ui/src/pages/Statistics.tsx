import { useState, useEffect } from 'react'
import { Layout } from '../components/Layout'
import { Spinner } from '../components/Spinner'
import { getStatsOrdersMonthly, getStatsOrderBaseMonthly, getStatsInvoiceBaseMonthly } from '../api'

const MonthChart = ({ data }: { data: { month: string; count: number; digital: number }[] }) => {
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
            </g>
          )
        })}
      </svg>
    </div>
  )
}

// ── Stacked bar chart — dvě samostatné řady ───────────────────────────────────

const StackedMonthChart = ({ data, colorA, colorB }: {
  data: { month: string; a: number; b: number }[]
  colorA: string
  colorB: string
}) => {
  if (data.length === 0) return <div className="h-24 flex items-center justify-center text-sm text-gray-400">Načítání…</div>

  const max    = Math.max(...data.map(d => d.a + d.b), 1)
  const topPad = 40
  const chartH = 120
  const valH   = 14
  const labelH = 28
  const totalH = topPad + chartH + valH + labelH + 6
  const gap    = 3
  const n      = data.length
  const W      = 800
  const barW   = Math.floor((W - (n - 1) * gap) / n)

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${totalH}`} style={{ minWidth: 600, width: '100%', height: totalH }}>
        {data.map((d, i) => {
          const total  = d.a + d.b
          const totalH2 = total > 0 ? Math.max((total / max) * chartH, 3) : 0
          const aH     = total > 0 ? (d.a / total) * totalH2 : 0
          const bH     = totalH2 - aH
          const x      = i * (barW + gap)
          const yTop   = topPad + chartH - totalH2
          const [yr, mo] = d.month.split('-')
          const isJan  = mo === '01'
          return (
            <g key={d.month}>
              {isJan && i > 0 && (
                <line x1={x - gap / 2} y1={0} x2={x - gap / 2} y2={totalH}
                  stroke="#e5e7eb" strokeWidth={1} />
              )}
              {/* spodní část — b (přijaté) */}
              {bH > 0 && (
                <rect x={x} y={yTop + aH} width={barW} height={bH}
                  fill={colorB} rx={1} />
              )}
              {/* horní část — a (vydané) */}
              {aH > 0 && (
                <rect x={x} y={yTop} width={barW} height={aH}
                  fill={colorA} rx={1} />
              )}
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
            </g>
          )
        })}
      </svg>
    </div>
  )
}

export const Statistics = () => {
  const [orders, setOrders]           = useState<{ month: string; count: number; digital: number }[]>([])
  const [orderBase, setOrderBase]     = useState<{ month: string; count: number; accepted: number }[]>([])
  const [invoiceBase, setInvoiceBase] = useState<{ month: string; issued: number; received: number }[]>([])
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

  const invIssued    = invoiceBase.reduce((s, m) => s + m.issued, 0)
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
        <MonthChart data={orders} />
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
        <MonthChart data={orderBase.map(d => ({ month: d.month, count: d.count, digital: d.accepted }))} />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-700">Faktury za posledních 36 měsíců</h2>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3 text-xs text-gray-500">
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 rounded-sm bg-[#0a6b6b]" />
                Vydané ({invIssued.toLocaleString('cs-CZ')})
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
          data={invoiceBase.map(d => ({ month: d.month, a: d.issued, b: d.received }))}
          colorA="#0a6b6b"
          colorB="#f59e0b"
        />
      </div>
    </Layout>
  )
}
