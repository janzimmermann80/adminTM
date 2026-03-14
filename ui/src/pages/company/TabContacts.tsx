import { useState, useEffect } from 'react'
import { getContacts, addPerson, updatePerson, deletePerson, addContact, updateContact, deleteContact } from '../../api'
import { Spinner } from '../../components/Spinner'
import type { ContactPerson, Contact } from '../../types'
import { CONTACT_TYPE_LABELS } from '../../types'

interface Props { companyKey: string }

const TYPE_ICONS: Record<string, JSX.Element> = {
  T: <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>,
  G: <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>,
  E: <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>,
  F: <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>,
  I: <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9" /></svg>,
}

export const TabContacts = ({ companyKey }: Props) => {
  const [persons, setPersons] = useState<ContactPerson[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  // Add person form
  const [showAddPerson, setShowAddPerson] = useState(false)
  const [newPerson, setNewPerson] = useState({ name: '', sex: 'M', send_offers: false })

  // Add contact form
  const [addContactFor, setAddContactFor] = useState<number | null>(null)
  const [newContact, setNewContact] = useState({ type: 'T', value: '', send_tips: false, forward_tm: false })

  // Edit states
  const [editPerson, setEditPerson] = useState<number | null>(null)
  const [editPersonData, setEditPersonData] = useState<Partial<ContactPerson>>({})

  const load = async () => {
    try {
      const data = await getContacts(companyKey)
      setPersons(data.persons)
      setContacts(data.contacts)
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [companyKey])

  const handleAddPerson = async () => {
    setSaving(true)
    try {
      await addPerson(companyKey, newPerson)
      setShowAddPerson(false)
      setNewPerson({ name: '', sex: 'M', send_offers: false })
      await load()
    } catch (e: any) { setError(e.message) }
    finally { setSaving(false) }
  }

  const handleDeletePerson = async (pid: number) => {
    if (!confirm('Smazat kontaktní osobu i všechny její kontakty?')) return
    setSaving(true)
    try { await deletePerson(companyKey, String(pid)); await load() }
    catch (e: any) { setError(e.message) }
    finally { setSaving(false) }
  }

  const handleSavePerson = async (pid: number) => {
    setSaving(true)
    try {
      await updatePerson(companyKey, String(pid), editPersonData)
      setEditPerson(null)
      await load()
    } catch (e: any) { setError(e.message) }
    finally { setSaving(false) }
  }

  const handleAddContact = async (importance: number) => {
    setSaving(true)
    try {
      await addContact(companyKey, { ...newContact, importance })
      setAddContactFor(null)
      setNewContact({ type: 'T', value: '', send_tips: false, forward_tm: false })
      await load()
    } catch (e: any) { setError(e.message) }
    finally { setSaving(false) }
  }

  const handleDeleteContact = async (cid: number) => {
    setSaving(true)
    try { await deleteContact(companyKey, String(cid)); await load() }
    catch (e: any) { setError(e.message) }
    finally { setSaving(false) }
  }

  const inputCls = 'border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-teal-500 outline-none'

  if (loading) return <div className="flex justify-center py-12"><Spinner size={8} /></div>

  // Group contacts by importance (= person group)
  const contactsByImportance = contacts.reduce((acc, c) => {
    const k = c.importance ?? 0
    if (!acc[k]) acc[k] = []
    acc[k].push(c)
    return acc
  }, {} as Record<number, Contact[]>)

  // Contacts not tied to any person (importance 0 or not matching)
  const personImportances = new Set(persons.map(p => p.importance))
  const unassignedContacts = contacts.filter(c => !personImportances.has(c.importance))

  return (
    <div>
      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm mb-4">{error}</div>}

      {/* Persons with their contacts */}
      <div className="space-y-4 mb-6">
        {persons.map(person => {
          const pContacts = contactsByImportance[person.importance] ?? []
          const isEditing = editPerson === person.person_key

          return (
            <div key={person.person_key} className="border border-gray-200 rounded-xl overflow-hidden">
              {/* Person header */}
              <div className="bg-gray-50 px-4 py-3 flex items-center justify-between gap-3">
                {isEditing ? (
                  <div className="flex items-center gap-2 flex-wrap flex-1">
                    <input className={inputCls + ' flex-1 min-w-32'} value={editPersonData.name ?? person.name}
                      onChange={e => setEditPersonData(p => ({ ...p, name: e.target.value }))} placeholder="Jméno" />
                    <select className={inputCls} value={editPersonData.sex ?? person.sex}
                      onChange={e => setEditPersonData(p => ({ ...p, sex: e.target.value }))}>
                      <option value="M">Muž</option>
                      <option value="F">Žena</option>
                    </select>
                    <label className="flex items-center gap-1.5 text-sm">
                      <input type="checkbox" checked={editPersonData.send_offers ?? person.send_offers}
                        onChange={e => setEditPersonData(p => ({ ...p, send_offers: e.target.checked }))} />
                      Nabídky
                    </label>
                    <button onClick={() => handleSavePerson(person.person_key)} disabled={saving}
                      className="bg-[#0a6b6b] text-white px-3 py-1.5 rounded-lg text-sm hover:bg-[#085858] disabled:opacity-60">
                      {saving ? <Spinner size={3} /> : 'Uložit'}
                    </button>
                    <button onClick={() => setEditPerson(null)} className="px-3 py-1.5 border rounded-lg text-sm hover:bg-gray-100">Zrušit</button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center text-[#0a6b6b] text-sm font-medium">
                      {person.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <span className="font-medium text-gray-900">{person.name}</span>
                      <span className="ml-2 text-xs text-gray-400">{person.sex === 'F' ? 'Žena' : 'Muž'}</span>
                      {person.send_offers && (
                        <span className="ml-2 bg-green-100 text-green-700 text-xs rounded px-1.5 py-0.5">Nabídky</span>
                      )}
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-2 shrink-0">
                  {!isEditing && (
                    <button onClick={() => { setEditPerson(person.person_key); setEditPersonData({}) }}
                      className="text-gray-400 hover:text-[#0d8080] transition-colors">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                  )}
                  <button onClick={() => handleDeletePerson(person.person_key)}
                    className="text-gray-400 hover:text-red-500 transition-colors">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Contacts list */}
              <div className="divide-y divide-gray-50">
                {pContacts.map(c => (
                  <div key={c.contact_key} className="px-4 py-2.5 flex items-center gap-3 group">
                    <span className="text-[#0d8080] shrink-0">{TYPE_ICONS[c.type] ?? null}</span>
                    <span className="text-xs text-gray-400 w-16 shrink-0">{CONTACT_TYPE_LABELS[c.type] ?? c.type}</span>
                    <span className="text-sm text-gray-900 flex-1 font-medium">{c.value}</span>
                    <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      {c.send_tips && <span className="text-xs bg-yellow-100 text-yellow-700 rounded px-1.5">Tips</span>}
                      {c.forward_tm && <span className="text-xs bg-purple-100 text-purple-700 rounded px-1.5">TM</span>}
                      <button onClick={() => handleDeleteContact(c.contact_key)}
                        className="text-gray-300 hover:text-red-500">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}

                {/* Add contact form */}
                {addContactFor === person.importance ? (
                  <div className="px-4 py-3 bg-teal-50 flex items-center gap-2 flex-wrap">
                    <select className={inputCls} value={newContact.type}
                      onChange={e => setNewContact(p => ({ ...p, type: e.target.value }))}>
                      {Object.entries(CONTACT_TYPE_LABELS).map(([v, l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </select>
                    <input className={inputCls + ' flex-1 min-w-32'} value={newContact.value} placeholder="Hodnota"
                      onChange={e => setNewContact(p => ({ ...p, value: e.target.value }))} />
                    <label className="flex items-center gap-1 text-sm">
                      <input type="checkbox" checked={newContact.send_tips}
                        onChange={e => setNewContact(p => ({ ...p, send_tips: e.target.checked }))} /> Tips
                    </label>
                    <label className="flex items-center gap-1 text-sm">
                      <input type="checkbox" checked={newContact.forward_tm}
                        onChange={e => setNewContact(p => ({ ...p, forward_tm: e.target.checked }))} /> TM
                    </label>
                    <button onClick={() => handleAddContact(person.importance)} disabled={saving || !newContact.value}
                      className="bg-[#0a6b6b] text-white px-3 py-1.5 rounded-lg text-sm hover:bg-[#085858] disabled:opacity-60">
                      Přidat
                    </button>
                    <button onClick={() => setAddContactFor(null)} className="text-sm text-gray-500 hover:text-gray-700">Zrušit</button>
                  </div>
                ) : (
                  <button onClick={() => setAddContactFor(person.importance)}
                    className="w-full px-4 py-2 text-sm text-[#0d8080] hover:bg-teal-50 flex items-center gap-1 transition-colors">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Přidat kontakt
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Unassigned contacts */}
      {unassignedContacts.length > 0 && (
        <div className="mb-6">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Obecné kontakty</h3>
          <div className="border border-gray-200 rounded-xl divide-y divide-gray-50">
            {unassignedContacts.map(c => (
              <div key={c.contact_key} className="px-4 py-2.5 flex items-center gap-3 group">
                <span className="text-[#0d8080] shrink-0">{TYPE_ICONS[c.type] ?? null}</span>
                <span className="text-xs text-gray-400 w-16 shrink-0">{CONTACT_TYPE_LABELS[c.type] ?? c.type}</span>
                <span className="text-sm text-gray-900 flex-1 font-medium">{c.value}</span>
                <button onClick={() => handleDeleteContact(c.contact_key)}
                  className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add person */}
      {showAddPerson ? (
        <div className="border border-teal-200 rounded-xl bg-teal-50 p-4">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Nová kontaktní osoba</h3>
          <div className="flex gap-3 flex-wrap">
            <input className={inputCls + ' flex-1 min-w-32'} value={newPerson.name} placeholder="Jméno"
              onChange={e => setNewPerson(p => ({ ...p, name: e.target.value }))} />
            <select className={inputCls} value={newPerson.sex}
              onChange={e => setNewPerson(p => ({ ...p, sex: e.target.value }))}>
              <option value="M">Muž</option>
              <option value="F">Žena</option>
            </select>
            <label className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={newPerson.send_offers}
                onChange={e => setNewPerson(p => ({ ...p, send_offers: e.target.checked }))} />
              Posílat nabídky
            </label>
            <button onClick={handleAddPerson} disabled={saving || !newPerson.name}
              className="bg-[#0a6b6b] text-white px-4 py-1.5 rounded-lg text-sm hover:bg-[#085858] disabled:opacity-60">
              {saving ? <Spinner size={4} /> : 'Přidat osobu'}
            </button>
            <button onClick={() => setShowAddPerson(false)}
              className="px-4 py-1.5 border rounded-lg text-sm hover:bg-gray-50">Zrušit</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowAddPerson(true)}
          className="flex items-center gap-2 border-2 border-dashed border-gray-300 hover:border-teal-400 hover:text-[#0d8080] text-gray-500 rounded-xl px-6 py-3 w-full justify-center text-sm transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
          </svg>
          Přidat kontaktní osobu
        </button>
      )}
    </div>
  )
}
