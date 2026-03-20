import React from 'react'
import { Layout } from '../components/Layout'
import { getReportsSchedule, ReportsScheduleRow, getAiPrompt, AiPromptRow } from '../api'
import { Spinner } from '../components/Spinner'

// ── Dostupné dotazy ──────────────────────────────────────────────────────────

type QueryDef = {
  id: string
  label: string
  description: string
}

const QUERIES: QueryDef[] = [
  {
    id: 'reports-schedule',
    label: 'Reports Schedule',
    description: 'Plánované reporty firem (provider.reports_schedule)',
  },
  {
    id: 'ai-prompt',
    label: 'AI Prompt',
    description: 'AI prompty firem (ta.ai_prompt)',
  },
]

// ── Helpers ──────────────────────────────────────────────────────────────────

const fmtTs = (s: string | null) => {
  if (!s) return ''
  const d = new Date(s)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const fmtArr = (a: unknown[] | null) => {
  if (!a || a.length === 0) return ''
  return a.join(', ')
}

const fmtJson = (v: unknown) => {
  if (v == null) return ''
  if (typeof v === 'string') return v
  return JSON.stringify(v)
}

// ── Reports Schedule tabulka ─────────────────────────────────────────────────

type RSProps = {
  rows: ReportsScheduleRow[]
  loading: boolean
  error: string | null
}

const calcDurationMin = (created: string | null, generated: string | null): number | null => {
  if (!created || !generated) return null
  const ms = new Date(generated).getTime() - new Date(created).getTime()
  if (isNaN(ms) || ms < 0) return null
  return Math.round(ms / 6000) / 10
}

const ReportsScheduleTable = ({ rows, loading, error }: RSProps) => {
  const [modal, setModal] = React.useState<{ title: string; content: string } | null>(null)

  if (loading) return <div className="flex justify-center py-16"><Spinner size={8} /></div>
  if (error) return <div className="text-red-600 py-8 px-4">{error}</div>
  if (rows.length === 0) return <div className="text-gray-400 py-8 px-4 text-sm">Žádná data.</div>

  return (
    <>
      {modal && <TextModal title={modal.title} content={modal.content} onClose={() => setModal(null)} />}
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs border-collapse">
          <thead>
            <tr className="bg-gray-100 text-gray-600 uppercase tracking-wide text-[11px]">
              <th className="px-2 py-2 text-right border-b whitespace-nowrap">ID</th>
              <th className="px-2 py-2 text-right border-b whitespace-nowrap">company_key</th>
              <th className="px-2 py-2 text-left border-b whitespace-nowrap">type</th>
              <th className="px-2 py-2 text-left border-b whitespace-nowrap">title</th>
              <th className="px-2 py-2 text-left border-b whitespace-nowrap">emails</th>
              <th className="px-2 py-2 text-left border-b whitespace-nowrap">schedule_day</th>
              <th className="px-2 py-2 text-left border-b whitespace-nowrap">schedule_month</th>
              <th className="px-2 py-2 text-left border-b whitespace-nowrap">schedule_weekday</th>
              <th className="px-2 py-2 text-left border-b whitespace-nowrap">created_time</th>
              <th className="px-2 py-2 text-left border-b whitespace-nowrap">generated_time</th>
              <th className="px-2 py-2 text-right border-b whitespace-nowrap">Doba (min)</th>
              <th className="px-2 py-2 text-right border-b whitespace-nowrap">gen.dur.</th>
              <th className="px-2 py-2 text-left border-b whitespace-nowrap">generation_error</th>
              <th className="px-2 py-2 text-left border-b whitespace-nowrap">period_from</th>
              <th className="px-2 py-2 text-left border-b whitespace-nowrap">period_to</th>
              <th className="px-2 py-2 text-left border-b whitespace-nowrap">one_time</th>
              <th className="px-2 py-2 text-left border-b whitespace-nowrap">updated_time</th>
              <th className="px-2 py-2 text-left border-b whitespace-nowrap">generation_started</th>
              <th className="px-2 py-2 text-left border-b whitespace-nowrap">drv_keys</th>
              <th className="px-2 py-2 text-left border-b whitespace-nowrap">script_input</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const scriptStr = fmtJson(r.script_input)
              const durMin = calcDurationMin(r.created_time, r.generated_time)
              return (
                <tr key={r.schedule_id} className="border-b hover:bg-gray-50">
                  <td className="px-2 py-1.5 text-right text-gray-500 tabular-nums">{r.schedule_id}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{r.company_key}</td>
                  <td className="px-2 py-1.5 font-mono font-medium text-teal-700">{r.type?.trim()}</td>
                  <td className="px-2 py-1.5">{r.title}</td>
                  <td className="px-2 py-1.5 max-w-[200px] truncate" title={fmtArr(r.emails)}>{fmtArr(r.emails)}</td>
                  <td className="px-2 py-1.5">{fmtArr(r.schedule_day)}</td>
                  <td className="px-2 py-1.5">{fmtArr(r.schedule_month)}</td>
                  <td className="px-2 py-1.5">{fmtArr(r.schedule_weekday)}</td>
                  <td className="px-2 py-1.5 tabular-nums whitespace-nowrap">{fmtTs(r.created_time)}</td>
                  <td className="px-2 py-1.5 tabular-nums whitespace-nowrap">{fmtTs(r.generated_time)}</td>
                  <td className={`px-2 py-1.5 text-right tabular-nums font-medium ${durMin != null && durMin > 10 ? 'text-red-600' : 'text-gray-800'}`}>
                    {durMin != null ? durMin.toFixed(1) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className={`px-2 py-1.5 text-right tabular-nums ${r.generation_duration != null && r.generation_duration / 60 > 5 ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
                    {r.generation_duration != null ? (r.generation_duration / 60).toFixed(1) : ''}
                  </td>
                  <td className="px-2 py-1.5 text-red-600 max-w-[200px] truncate" title={r.generation_error ?? ''}>{r.generation_error}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap">{r.period_from}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap">{r.period_to}</td>
                  <td className="px-2 py-1.5">{r.one_time == null ? '' : r.one_time ? 'Ano' : 'Ne'}</td>
                  <td className="px-2 py-1.5 tabular-nums whitespace-nowrap">{fmtTs(r.updated_time)}</td>
                  <td className="px-2 py-1.5 tabular-nums whitespace-nowrap">{fmtTs(r.generation_started)}</td>
                  <td className="px-2 py-1.5">{fmtArr(r.drv_keys)}</td>
                  <td className="px-2 py-1.5">
                    {scriptStr ? (
                      <button onClick={() => setModal({ title: `script_input — #${r.schedule_id}`, content: scriptStr })}
                        className="text-left text-teal-700 hover:text-teal-900 hover:underline"
                        title={scriptStr}>
                        {scriptInputCounts(scriptStr)
                          ? <span className="font-mono text-[10px]">{scriptInputCounts(scriptStr)}</span>
                          : <span className="font-mono text-[10px] max-w-[200px] truncate block">{scriptStr}</span>
                        }
                      </button>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}

// ── Text modal ───────────────────────────────────────────────────────────────

type TextModalProps = {
  title: string
  content: string
  onClose: () => void
}

const scriptInputCounts = (content: string): string | null => {
  try {
    const p = JSON.parse(content)
    if (typeof p !== 'object' || p === null || Array.isArray(p)) return null
    const parts: string[] = []
    if (Array.isArray(p.tags)) parts.push(`tags: ${p.tags.length}`)
    if (Array.isArray(p.record_ids)) parts.push(`record_ids: ${p.record_ids.length}`)
    return parts.length ? parts.join(', ') : null
  } catch { return null }
}

const TextModal = ({ title, content, onClose }: TextModalProps) => {
  const isJson = (() => { try { JSON.parse(content); return true } catch { return false } })()
  const pretty = isJson ? JSON.stringify(JSON.parse(content), null, 2) : content
  const countInfo = scriptInputCounts(content)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-[800px] max-w-[95vw] max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <span className="font-semibold text-gray-800 text-sm">{title}</span>
            {countInfo && <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">{countInfo}</span>}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        <div className="overflow-auto flex-1 p-4">
          <pre className="text-xs font-mono whitespace-pre-wrap break-words text-gray-800 leading-relaxed">{pretty}</pre>
        </div>
        <div className="px-5 py-3 border-t border-gray-100 flex justify-end">
          <button onClick={() => { navigator.clipboard.writeText(pretty) }}
            className="text-xs px-3 py-1.5 rounded bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors mr-2">
            Kopírovat
          </button>
          <button onClick={onClose}
            className="text-xs px-3 py-1.5 rounded bg-teal-600 hover:bg-teal-700 text-white transition-colors">
            Zavřít
          </button>
        </div>
      </div>
    </div>
  )
}

// ── AI Prompt tabulka ────────────────────────────────────────────────────────

type APProps = {
  rows: AiPromptRow[]
  loading: boolean
  error: string | null
}

const AiPromptTable = ({ rows, loading, error }: APProps) => {
  const [modal, setModal] = React.useState<{ title: string; content: string } | null>(null)

  if (loading) return <div className="flex justify-center py-16"><Spinner size={8} /></div>
  if (error) return <div className="text-red-600 py-8 px-4">{error}</div>
  if (rows.length === 0) return <div className="text-gray-400 py-8 px-4 text-sm">Žádná data.</div>

  return (
    <>
      {modal && <TextModal title={modal.title} content={modal.content} onClose={() => setModal(null)} />}
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs border-collapse">
          <thead>
            <tr className="bg-gray-100 text-gray-600 uppercase tracking-wide text-[11px]">
              <th className="px-2 py-2 text-right border-b whitespace-nowrap">ID</th>
              <th className="px-2 py-2 text-right border-b whitespace-nowrap">company_key</th>
              <th className="px-2 py-2 text-left border-b whitespace-nowrap">tin</th>
              <th className="px-2 py-2 text-left border-b whitespace-nowrap">company_name</th>
              <th className="px-2 py-2 text-left border-b whitespace-nowrap">type</th>
              <th className="px-2 py-2 text-left border-b whitespace-nowrap">prompt</th>
              <th className="px-2 py-2 text-left border-b whitespace-nowrap">updated_time</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.prompt_id} className="border-b hover:bg-gray-50">
                <td className="px-2 py-1.5 text-right text-gray-500 tabular-nums">{r.prompt_id}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{r.company_key}</td>
                <td className="px-2 py-1.5 font-mono">{r.tin}</td>
                <td className="px-2 py-1.5">{r.company_name}</td>
                <td className="px-2 py-1.5 font-mono font-medium text-teal-700">{r.type}</td>
                <td className="px-2 py-1.5">
                  {r.prompt ? (
                    <button onClick={() => setModal({ title: `prompt — #${r.prompt_id} ${r.company_name ?? ''}`, content: r.prompt! })}
                      className="max-w-[400px] truncate block text-left text-teal-700 hover:text-teal-900 hover:underline"
                      title={r.prompt}>
                      {r.prompt}
                    </button>
                  ) : <span className="text-gray-300">—</span>}
                </td>
                <td className="px-2 py-1.5 tabular-nums whitespace-nowrap">{fmtTs(r.updated_time)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

// ── Hlavní stránka ───────────────────────────────────────────────────────────

export const Queries = () => {
  const [activeQuery, setActiveQuery] = React.useState<string>(QUERIES[0].id)

  // Filtry sdílené
  const [companyKey, setCompanyKey] = React.useState('')
  const [type, setType] = React.useState('')
  const [oneTime, setOneTime] = React.useState<'' | 'true' | 'false'>('true')
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [fetched, setFetched] = React.useState(false)
  const [offset, setOffset] = React.useState(0)

  // Data per dotaz
  const [rsRows, setRsRows] = React.useState<ReportsScheduleRow[]>([])
  const [apRows, setApRows] = React.useState<AiPromptRow[]>([])

  const PAGE_SIZE = 100

  const runQuery = async (newOffset = 0) => {
    setLoading(true)
    setError(null)
    try {
      if (activeQuery === 'reports-schedule') {
        const data = await getReportsSchedule({
          company_key: companyKey.trim() || undefined,
          type: type.trim() || undefined,
          one_time: oneTime || undefined,
          limit: PAGE_SIZE,
          offset: newOffset || undefined,
        })
        setRsRows(data)
        setOffset(newOffset)
      } else if (activeQuery === 'ai-prompt') {
        const data = await getAiPrompt({
          company_key: companyKey.trim() || undefined,
          type: type.trim() || undefined,
        })
        setApRows(data)
        setOffset(0)
      }
      setFetched(true)
    } catch (e: any) {
      setError(e.message ?? 'Chyba')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Layout>
      <div className="flex h-full min-h-screen">
        {/* Levý panel — seznam dotazů */}
        <aside className="w-56 flex-shrink-0 bg-white border-r border-gray-200">
          <div className="px-4 pt-5 pb-3 border-b border-gray-100">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400">Dotazy</h2>
          </div>
          <nav className="py-2">
            {QUERIES.map(q => (
              <button
                key={q.id}
                onClick={() => { setActiveQuery(q.id); setFetched(false); setRsRows([]); setApRows([]); setError(null); setCompanyKey(''); setType(''); setOneTime(''); setOffset(0) }}
                className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                  activeQuery === q.id
                    ? 'bg-teal-50 text-teal-800 font-medium border-r-2 border-teal-600'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                {q.label}
              </button>
            ))}
          </nav>
        </aside>

        {/* Pravý panel — filtry + data */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Záhlaví + filtry */}
          <div className="bg-white border-b border-gray-200 px-6 py-4">
            <h1 className="text-lg font-semibold text-gray-800 mb-3">
              {QUERIES.find(q => q.id === activeQuery)?.label}
            </h1>
            <p className="text-xs text-gray-400 mb-4">
              {QUERIES.find(q => q.id === activeQuery)?.description}
            </p>

            {(activeQuery === 'reports-schedule' || activeQuery === 'ai-prompt') && (
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">company_key</label>
                  <input
                    type="number"
                    value={companyKey}
                    onChange={e => setCompanyKey(e.target.value)}
                    placeholder="vše"
                    className="border border-gray-300 rounded px-2 py-1.5 text-sm w-32 focus:outline-none focus:border-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">type</label>
                  <input
                    type="text"
                    value={type}
                    onChange={e => setType(e.target.value)}
                    placeholder="vše"
                    className="border border-gray-300 rounded px-2 py-1.5 text-sm w-32 font-mono focus:outline-none focus:border-teal-500"
                  />
                </div>
                {activeQuery === 'reports-schedule' && (
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">One time</label>
                    <select
                      value={oneTime}
                      onChange={e => setOneTime(e.target.value as '' | 'true' | 'false')}
                      className="border border-gray-300 rounded px-2 py-1.5 text-sm w-24 focus:outline-none focus:border-teal-500"
                    >
                      <option value="">vše</option>
                      <option value="true">Ano</option>
                      <option value="false">Ne</option>
                    </select>
                  </div>
                )}
                <button
                  onClick={() => runQuery(0)}
                  disabled={loading}
                  className="px-4 py-1.5 bg-teal-600 text-white text-sm rounded hover:bg-teal-700 disabled:opacity-50 transition-colors"
                >
                  {loading ? 'Načítám…' : 'Spustit'}
                </button>
                {fetched && !loading && (
                  <span className="text-xs text-gray-400">
                    {activeQuery === 'reports-schedule'
                      ? `${offset + 1}–${offset + rsRows.length}`
                      : apRows.length + ' záznamů'}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Data */}
          <div className="flex-1 overflow-auto bg-white">
            {!fetched && !loading && (
              <div className="text-gray-400 text-sm px-6 py-12 text-center">
                Nastavte filtry a klikněte na <strong>Spustit</strong>.
              </div>
            )}
            {activeQuery === 'reports-schedule' && (fetched || loading) && (
              <>
                <ReportsScheduleTable rows={rsRows} loading={loading} error={error} />
                {fetched && !loading && (
                  <div className="flex items-center gap-3 px-4 py-3 border-t border-gray-100 bg-white">
                    <button
                      onClick={() => runQuery(offset - PAGE_SIZE)}
                      disabled={offset === 0}
                      className="px-3 py-1.5 text-sm rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      ← Předchozí
                    </button>
                    <span className="text-xs text-gray-500">
                      {offset + 1}–{offset + rsRows.length}
                    </span>
                    <button
                      onClick={() => runQuery(offset + PAGE_SIZE)}
                      disabled={rsRows.length < PAGE_SIZE}
                      className="px-3 py-1.5 text-sm rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      Další →
                    </button>
                  </div>
                )}
              </>
            )}
            {activeQuery === 'ai-prompt' && (fetched || loading) && (
              <AiPromptTable rows={apRows} loading={loading} error={error} />
            )}
          </div>
        </div>
      </div>
    </Layout>
  )
}
