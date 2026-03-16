import { useState, useEffect } from 'react'
import { getNotes, addNote, updateNote, deleteNote } from '../../api'
import { Spinner } from '../../components/Spinner'
import { formatDate } from '../../utils'
import type { Note } from '../../types'

interface Props { companyKey: string }

const NOTE_TYPES = ['0','M','S','K','P','N','V','?','X','H','!','Z','W','G','U','C','D','J','I','$','O','R','#','A','B','Q']
const NOTE_TYPE_LABELS: Record<string, string> = {
  '0': '- žádný',
  'M': 'M materiály zaslány',
  'S': 'S smlouva přišla',
  'K': 'K konec spolupráce',
  'P': 'P pohledávky jsou vymáhány',
  'N': 'N nabídka spolupráce',
  'V': 'V verze programu - stará',
  '?': '? rozhodují se/budou pokračovat?',
  'X': 'X nemají zájem',
  'H': 'H hotline',
  '!': '! podepíší smlouvu',
  'Z': 'Z záznamy žádali telefonicky',
  'W': 'W zaslán program, sděleno číslo',
  'G': 'G zaslán upgrade',
  'U': 'U zaslána upomínka',
  'C': 'C proč se nepřipojují?',
  'D': 'D discount - nabídka slevy',
  'J': 'J jak se Vám daří?',
  'I': 'I instalace programu osobní',
  '$': '$ nová smlouva FAXem',
  'O': 'O ostatní',
  'R': 'R rádi by spolupracovali',
  '#': '# není originál smlouvy',
  'A': 'A není aktivní',
  'B': 'B bez upgrade',
  'Q': 'Q interní - mimo premium',
}
const NOTE_TYPE_COLORS: Record<string, string> = {
  'K': 'bg-red-100 text-red-700',
  'P': 'bg-red-100 text-red-700',
  'X': 'bg-red-100 text-red-700',
  '!': 'bg-green-100 text-green-700',
  'R': 'bg-green-100 text-green-700',
  'S': 'bg-teal-100 text-[#0a6b6b]',
  'N': 'bg-teal-100 text-[#0a6b6b]',
  'H': 'bg-purple-100 text-purple-700',
  'U': 'bg-yellow-100 text-yellow-700',
}

export const TabNotes = ({ companyKey }: Props) => {
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [newNote, setNewNote] = useState({ type: '0', text: '' })
  const [editId, setEditId] = useState<number | null>(null)
  const [editData, setEditData] = useState({ type: '0', text: '' })

  const load = async () => {
    try {
      const data = await getNotes(companyKey)
      setNotes(data)
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [companyKey])

  const handleAdd = async () => {
    if (!newNote.text.trim()) return
    setSaving(true)
    try {
      await addNote(companyKey, newNote)
      setShowAdd(false)
      setNewNote({ type: '0', text: '' })
      await load()
    } catch (e: any) { setError(e.message) }
    finally { setSaving(false) }
  }

  const handleSaveEdit = async (nid: number) => {
    setSaving(true)
    try {
      await updateNote(companyKey, String(nid), editData)
      setEditId(null)
      await load()
    } catch (e: any) { setError(e.message) }
    finally { setSaving(false) }
  }

  const handleDelete = async (nid: number) => {
    if (!confirm('Smazat poznámku?')) return
    setSaving(true)
    try {
      await deleteNote(companyKey, String(nid))
      await load()
    } catch (e: any) { setError(e.message) }
    finally { setSaving(false) }
  }

  if (loading) return <div className="flex justify-center py-12"><Spinner size={8} /></div>

  const inputCls = 'border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-teal-500 outline-none'

  return (
    <div>
      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm mb-4">{error}</div>}

      {/* Add note form */}
      {showAdd && (
        <div className="border border-teal-200 rounded-xl bg-teal-50 p-4 mb-4">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Nová poznámka</h3>
          <div className="space-y-2">
            <select className={inputCls} value={newNote.type}
              onChange={e => setNewNote(p => ({ ...p, type: e.target.value }))}>
              {NOTE_TYPES.map(t => (
                <option key={t} value={t}>{NOTE_TYPE_LABELS[t] ?? t}</option>
              ))}
            </select>
            <textarea
              className={inputCls + ' w-full min-h-28 resize-y'}
              value={newNote.text}
              placeholder="Text poznámky..."
              onChange={e => setNewNote(p => ({ ...p, text: e.target.value }))}
              autoFocus
            />
            <div className="flex gap-2">
              <button onClick={handleAdd} disabled={saving || !newNote.text.trim()}
                className="flex items-center gap-1.5 bg-[#0a6b6b] hover:bg-[#085858] text-white px-4 py-1.5 rounded-lg text-sm disabled:opacity-60">
                {saving ? <Spinner size={4} /> : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                )}
                Přidat poznámku
              </button>
              <button onClick={() => { setShowAdd(false); setNewNote({ type: '0', text: '' }) }}
                className="px-4 py-1.5 border rounded-lg text-sm hover:bg-gray-50">Zrušit</button>
            </div>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-gray-200 mb-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wide">
              <th className="px-4 py-3 font-medium w-20">Iniciály</th>
              <th className="px-4 py-3 font-medium w-28">Datum</th>
              <th className="px-4 py-3 font-medium w-28">Typ</th>
              <th className="px-4 py-3 font-medium">Text</th>
              <th className="px-4 py-3 text-right">
                <button onClick={() => setShowAdd(true)}
                  className="w-6 h-6 flex items-center justify-center ml-auto bg-[#0a6b6b] hover:bg-[#085858] text-white rounded-full text-base leading-none transition-colors">
                  +
                </button>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {notes.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-400">Žádné poznámky</td>
              </tr>
            )}
            {notes.map(note => {
              const typeCls = NOTE_TYPE_COLORS[note.type] ?? NOTE_TYPE_COLORS.other
              const isEditing = editId === note.note_key
              return (
                <tr key={note.note_key} className="hover:bg-gray-50 group align-top">
                  {isEditing ? (
                    <td colSpan={5} className="px-4 py-3">
                      <div className="space-y-2">
                        <div className="flex gap-2 flex-wrap">
                          <select className={inputCls} value={editData.type}
                            onChange={e => setEditData(p => ({ ...p, type: e.target.value }))}>
                            {NOTE_TYPES.map(t => (
                              <option key={t} value={t}>{NOTE_TYPE_LABELS[t] ?? t}</option>
                            ))}
                          </select>
                        </div>
                        <textarea
                          className={inputCls + ' w-full min-h-24 resize-y'}
                          value={editData.text}
                          onChange={e => setEditData(p => ({ ...p, text: e.target.value }))}
                        />
                        <div className="flex gap-2">
                          <button onClick={() => handleSaveEdit(note.note_key)} disabled={saving}
                            className="flex items-center gap-1.5 bg-[#0a6b6b] hover:bg-[#085858] text-white px-4 py-1.5 rounded-lg text-sm disabled:opacity-60">
                            {saving ? <Spinner size={4} /> : (
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                            Uložit
                          </button>
                          <button onClick={() => setEditId(null)} className="px-4 py-1.5 border rounded-lg text-sm hover:bg-gray-50">Zrušit</button>
                        </div>
                      </div>
                    </td>
                  ) : (
                    <>
                      <td className="px-4 py-3 font-mono text-xs text-gray-500 whitespace-nowrap">{note.creator}</td>
                      <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{formatDate(note.creation_date)}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${typeCls}`}>
                          {note.type === '0' ? '—' : note.type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-700 whitespace-pre-wrap leading-relaxed">{note.text}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                          <button onClick={() => { setEditId(note.note_key); setEditData({ type: note.type, text: note.text }) }}
                            className="text-gray-400 hover:text-[#0d8080] transition-colors">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button onClick={() => handleDelete(note.note_key)}
                            className="text-gray-400 hover:text-red-500 transition-colors">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

    </div>
  )
}
