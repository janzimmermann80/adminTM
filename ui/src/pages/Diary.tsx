import { useState, useEffect, useRef } from 'react'
import { Layout } from '../components/Layout'
import { Spinner } from '../components/Spinner'
import { useAuth } from '../context/AuthContext'
import { formatDate } from '../utils'
import {
  getDiaryWindow, getDiaryEmployees,
  completeDiaryEntry, updateDiaryEntry,
} from '../api'
import { CompanyDetailPanel } from './company/CompanyDetailPanel'

// Posun data o N dní
function shiftDate(base: string, days: number): string {
  const d = new Date(base)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

// Záhlaví dne — pěkně česky
function dayLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  const today = todayStr()
  const tomorrow = shiftDate(today, 1)
  if (dateStr === today) return 'Dnes'
  if (dateStr === tomorrow) return 'Zítra'
  return d.toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' })
}

export const Diary = () => {
  const { user } = useAuth()
  const [owner, setOwner] = useState<string>('')
  const [employees, setEmployees] = useState<string[]>([])
  const [entries, setEntries] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // Zobrazované okno: od `windowStart` (YYYY-MM-DD), WINDOW_DAYS dní dopředu
  const WINDOW_DAYS = 21
  const PAST_DAYS   = 7  // zobrazujeme i 7 dní zpět
  const [windowStart, setWindowStart] = useState<string>(() => shiftDate(todayStr(), -PAST_DAYS))

  // Modal firmy
  const [companyPanel, setCompanyPanel] = useState<number | null>(null)

  // Inline editace existujícího záznamu
  const [editingId, setEditingId]   = useState<number | null>(null)
  const [editText, setEditText]     = useState('')
  const [editDate, setEditDate]     = useState('')
  const [editTime, setEditTime]     = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const editRef = useRef<HTMLTextAreaElement>(null)

  const canViewOthers = user?.accessRights?.[14] === '1'

  // Načtení zaměstnanců
  useEffect(() => {
    if (!canViewOthers) return
    getDiaryEmployees().then(setEmployees).catch(() => {})
  }, [canViewOthers])

  // Nastavení výchozího ownera
  useEffect(() => {
    if (user?.initials) setOwner(user.initials)
  }, [user])

  const load = async (o = owner, start = windowStart) => {
    if (!o) return
    setLoading(true)
    setError('')
    try {
      const res = await getDiaryWindow(o, start, WINDOW_DAYS + PAST_DAYS)
      setEntries(res.data ?? [])
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { if (owner) load() }, [owner, windowStart])

  // Toggle splněno/nesplněno
  const handleToggleComplete = async (entry: any) => {
    const newVal = entry.completed !== '1'
    setEntries(prev => prev.map(e =>
      e.diary_key === entry.diary_key ? { ...e, completed: newVal ? '1' : '0' } : e
    ))
    try {
      await completeDiaryEntry(entry.diary_key, newVal)
    } catch {
      // Rollback
      setEntries(prev => prev.map(e =>
        e.diary_key === entry.diary_key ? { ...e, completed: entry.completed } : e
      ))
    }
  }

  // Otevři inline formu pro editaci záznamu
  const openEdit = (entry: any) => {
    setEditingId(entry.diary_key)
    setEditText(entry.text ?? '')
    setEditDate((entry.time ?? '').slice(0, 10))
    setEditTime((entry.time ?? '').slice(11, 16))
    setTimeout(() => editRef.current?.focus(), 50)
  }

  // Uložení upraveného záznamu
  const handleSaveEdit = async (diaryKey: number) => {
    if (!editText.trim()) return
    setEditSaving(true)
    const newTime = editDate + 'T' + (editTime || '08:00') + ':00'
    try {
      await updateDiaryEntry(diaryKey, editText.trim(), newTime)
      setEntries(prev => prev.map(e =>
        e.diary_key === diaryKey ? { ...e, text: editText.trim(), time: newTime } : e
      ))
      setEditingId(null)
    } catch (e: any) { setError(e.message) }
    finally { setEditSaving(false) }
  }

  // Skupiny po dnech
  const grouped: Record<string, any[]> = {}
  for (const e of entries) {
    const day = (e.time ?? '').slice(0, 10)
    if (!grouped[day]) grouped[day] = []
    grouped[day].push(e)
  }
  const sortedDays = Object.keys(grouped).sort()

  const today = todayStr()

  return (
    <Layout>
      <div className="max-w-3xl mx-auto">
        {/* Hlavička */}
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <h1 className="text-xl font-bold text-gray-900 mr-auto">Deník</h1>

          {/* Owner selector — jen pro uživatele s právem 14 */}
          {canViewOthers && employees.length > 0 && (
            <select
              value={owner}
              onChange={e => { setOwner(e.target.value); setWindowStart(shiftDate(todayStr(), -PAST_DAYS)) }}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-teal-500 bg-white"
            >
              {employees.map(emp => (
                <option key={emp} value={emp}>{emp}</option>
              ))}
            </select>
          )}

          {/* Navigace týdnem */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setWindowStart(s => shiftDate(s, -7))}
              className="p-1.5 rounded-lg border border-gray-300 hover:bg-gray-50 text-gray-600 transition-colors"
              title="Týden zpět"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={() => setWindowStart(shiftDate(todayStr(), -PAST_DAYS))}
              className="px-3 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-50 text-sm text-gray-600 transition-colors"
            >
              Dnes
            </button>
            <button
              onClick={() => setWindowStart(s => shiftDate(s, 7))}
              className="p-1.5 rounded-lg border border-gray-300 hover:bg-gray-50 text-gray-600 transition-colors"
              title="Týden dopředu"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm mb-4">{error}</div>
        )}

        {loading ? (
          <div className="flex justify-center py-16"><Spinner size={8} /></div>
        ) : sortedDays.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-12 text-center text-gray-400 text-sm">
            Žádné záznamy v tomto období
          </div>
        ) : (
          <div className="space-y-4">
            {sortedDays.map(day => {
              const isToday   = day === today
              const isPast    = day < today
              const dayItems  = grouped[day]
              return (
                <div key={day}>
                  {/* Den záhlaví */}
                  <div className={`flex items-center gap-2 mb-1.5 px-1`}>
                    <span className={`text-xs font-semibold uppercase tracking-wide ${
                      isToday ? 'text-[#0a6b6b]' : isPast ? 'text-gray-400' : 'text-gray-500'
                    }`}>
                      {dayLabel(day)}
                    </span>
                    <div className={`flex-1 h-px ${isToday ? 'bg-[#0a6b6b]/30' : 'bg-gray-200'}`} />
                    <span className="text-xs text-gray-400">{formatDate(day)}</span>
                  </div>

                  {/* Záznamy dne */}
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm divide-y divide-gray-100">
                    {dayItems.map(entry => {
                      const done       = entry.completed === '1'
                      const isEditing  = editingId === entry.diary_key
                      const time       = entry.time?.slice(11, 16) ?? ''
                      return (
                        <div key={entry.diary_key} className={done ? 'opacity-50' : ''}>
                          <div className="flex items-start gap-3 px-4 py-3">
                            {/* Checkbox splnění */}
                            <button
                              onClick={() => handleToggleComplete(entry)}
                              title={done ? 'Označit jako nesplněno' : 'Označit jako splněno'}
                              className={`mt-0.5 w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                                done
                                  ? 'bg-green-500 border-green-500 text-white'
                                  : 'border-gray-300 hover:border-[#0a6b6b] text-transparent hover:text-[#0a6b6b]'
                              }`}
                            >
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            </button>

                            {/* Obsah */}
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mb-0.5">
                                {time && (
                                  <span className="text-xs text-gray-400 font-mono">{time}</span>
                                )}
                                {entry.company_key && entry.company && (
                                  <button
                                    onClick={() => setCompanyPanel(entry.company_key)}
                                    className="text-xs font-medium text-[#0a6b6b] hover:underline truncate text-left"
                                  >
                                    {entry.company}
                                  </button>
                                )}
                                {entry.originator && entry.originator !== owner && (
                                  <span className="text-xs text-gray-400">({entry.originator})</span>
                                )}
                              </div>
                              <p className="text-sm text-gray-700 leading-snug whitespace-pre-wrap">{entry.text}</p>
                            </div>

                            {/* Akce: Upravit záznam */}
                            {!done && (
                              <button
                                onClick={() => isEditing ? setEditingId(null) : openEdit(entry)}
                                title="Upravit záznam"
                                className={`flex-shrink-0 mt-0.5 p-1 rounded-lg transition-colors ${
                                  isEditing
                                    ? 'bg-teal-100 text-[#0a6b6b]'
                                    : 'text-gray-300 hover:text-[#0a6b6b] hover:bg-teal-50'
                                }`}
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                              </button>
                            )}
                          </div>

                          {/* Inline forma pro editaci záznamu */}
                          {isEditing && (
                            <div className="mx-4 mb-3 p-3 bg-teal-50 rounded-lg border border-teal-200">
                              <div className="flex gap-2 mb-2">
                                <input
                                  type="date"
                                  value={editDate}
                                  onChange={e => setEditDate(e.target.value)}
                                  className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-teal-500 bg-white"
                                />
                                <input
                                  type="time"
                                  value={editTime}
                                  onChange={e => setEditTime(e.target.value)}
                                  className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-teal-500 bg-white"
                                />
                              </div>
                              <textarea
                                ref={editRef}
                                value={editText}
                                onChange={e => setEditText(e.target.value)}
                                rows={3}
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-500 resize-none mb-2"
                              />
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleSaveEdit(entry.diary_key)}
                                  disabled={editSaving || !editText.trim()}
                                  className="flex items-center gap-1.5 bg-[#0a6b6b] hover:bg-[#085858] text-white px-3 py-1.5 rounded-lg text-xs disabled:opacity-60"
                                >
                                  {editSaving ? <Spinner size={3} /> : (
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                  )}
                                  Uložit
                                </button>
                                <button
                                  onClick={() => setEditingId(null)}
                                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs hover:bg-gray-50"
                                >
                                  Zrušit
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {companyPanel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setCompanyPanel(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <CompanyDetailPanel
              companyKey={String(companyPanel)}
              onClose={() => setCompanyPanel(null)}
            />
          </div>
        </div>
      )}
    </Layout>
  )
}
