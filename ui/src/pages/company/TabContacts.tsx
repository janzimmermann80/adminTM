import { useState, useEffect } from 'react'
import { getContacts, addPerson, updatePerson, deletePerson, addContact, updateContact, deleteContact, upsertUserAccount } from '../../api'
import { Spinner } from '../../components/Spinner'
import { SendSmsModal } from '../../components/SendSmsModal'
import type { ContactPerson, Contact } from '../../types'
import { CONTACT_TYPE_LABELS } from '../../types'

interface Props { companyKey: string }

interface RowEdit {
  name: string
  sex: string
  mobiles: { contact_key: number; value: string }[]
  emails: { contact_key: number; value: string }[]
  newMobile: string
  newEmail: string
  username: string
  usernameOld: string
  password: string
}

export const TabContacts = ({ companyKey }: Props) => {
  const [persons, setPersons] = useState<ContactPerson[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [userAccounts, setUserAccounts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const [showAddPerson, setShowAddPerson] = useState(false)
  const [newPerson, setNewPerson] = useState({ name: '', sex: 'M', send_offers: false })

  const [editKey, setEditKey] = useState<number | null>(null)
  const [editData, setEditData] = useState<RowEdit | null>(null)

  const [smsTarget, setSmsTarget] = useState<{ gsm: string; name: string } | null>(null)

  const [addContactFor, setAddContactFor] = useState<number | null>(null)
  const [newContact, setNewContact] = useState({ type: 'U', value: '' })

  const load = async () => {
    try {
      const data = await getContacts(companyKey)
      setPersons(data.persons)
      setContacts(data.contacts)
      setUserAccounts(data.userAccounts ?? [])
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [companyKey])

  const startEdit = (person: ContactPerson, pContacts: Contact[], account: any) => {
    setEditKey(person.person_key)
    setEditData({
      name: person.name,
      sex: person.sex,
      mobiles: pContacts.filter(c => c.type === 'G').map(c => ({ contact_key: c.contact_key, value: c.value })),
      emails: pContacts.filter(c => c.type === 'E').map(c => ({ contact_key: c.contact_key, value: c.value })),
      newMobile: '',
      newEmail: '',
      username: account?.username ?? '',
      usernameOld: account?.username ?? '',
      password: account?.password ?? '',
    })
  }

  const handleSave = async (person: ContactPerson) => {
    if (!editData) return
    setSaving(true)
    try {
      // Osoba
      await updatePerson(companyKey, String(person.person_key), { name: editData.name, sex: editData.sex })
      // Kontakty — update existujících
      for (const m of editData.mobiles) {
        if (m.value.trim()) await updateContact(companyKey, String(m.contact_key), { value: m.value })
        else await deleteContact(companyKey, String(m.contact_key))
      }
      for (const e of editData.emails) {
        if (e.value.trim()) await updateContact(companyKey, String(e.contact_key), { value: e.value })
        else await deleteContact(companyKey, String(e.contact_key))
      }
      // Nové kontakty
      if (editData.newMobile.trim())
        await addContact(companyKey, { type: 'G', value: editData.newMobile, importance: person.importance, send_tips: false, forward_tm: false })
      if (editData.newEmail.trim())
        await addContact(companyKey, { type: 'E', value: editData.newEmail, importance: person.importance, send_tips: false, forward_tm: false })
      // Účet
      if (editData.username.trim())
        await upsertUserAccount(companyKey, { username: editData.username, password: editData.password, username_old: editData.usernameOld || undefined, person_key: person.person_key })
      setEditKey(null)
      setEditData(null)
      await load()
    } catch (e: any) { setError(e.message) }
    finally { setSaving(false) }
  }

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

  const handleAddContact = async (importance: number) => {
    if (!newContact.value.trim()) return
    setSaving(true)
    try {
      await addContact(companyKey, { ...newContact, importance, send_tips: false, forward_tm: false })
      setAddContactFor(null)
      setNewContact({ type: 'U', value: '' })
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

  const inputCls = 'border border-gray-300 rounded-lg px-2 py-1 text-sm focus:ring-2 focus:ring-teal-500 outline-none w-full'
  const inputRoCls = 'border border-transparent rounded-lg px-2 py-1 text-sm bg-transparent outline-none w-full cursor-pointer'
  const thCls = 'text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-3 py-2'

  if (loading) return <div className="flex justify-center py-12"><Spinner size={8} /></div>

  const contactsByImportance = contacts.reduce((acc, c) => {
    const k = c.importance ?? 0
    if (!acc[k]) acc[k] = []
    acc[k].push(c)
    return acc
  }, {} as Record<number, Contact[]>)

  const personImportances = new Set(persons.map(p => p.importance))
  const accountByPersonKey: Record<number, any> = {}
  userAccounts.forEach((a: any) => { if (a.person_key != null) accountByPersonKey[a.person_key] = a })
  const orphanAccounts = userAccounts.filter((a: any) => a.person_key == null)

  const shownInPersonRows = new Set(
    contacts.filter(c => personImportances.has(c.importance) && (c.type === 'G' || c.type === 'E'))
      .map(c => c.contact_key)
  )
  const companyContacts = contacts.filter(c => !shownInPersonRows.has(c.contact_key))

  return (
    <div>
      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm mb-4">{error}</div>}

      {/* Osobní kontakty */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className={thCls}>Jméno</th>
              <th className={thCls}>Mobil</th>
              <th className={thCls}>E-mail</th>
              <th className={thCls}>Uživatel</th>
              <th className={thCls}>Heslo</th>
              <th className="w-14"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {persons.map((person) => {
              const pContacts = contactsByImportance[person.importance] ?? []
              const mobiles = pContacts.filter(c => c.type === 'G')
              const emails = pContacts.filter(c => c.type === 'E')
              const account = accountByPersonKey[person.person_key]
              const isEditing = editKey === person.person_key
              const nameCls = person.sex === 'F' ? 'font-medium text-pink-600' : 'font-medium text-blue-700'

              if (isEditing && editData) {
                return (
                  <tr key={person.person_key} className="bg-teal-50/40">
                    {/* Jméno edit */}
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        <input className={inputCls} value={editData.name}
                          onChange={e => setEditData(p => p && ({ ...p, name: e.target.value }))} />
                        <select className="border border-gray-300 rounded-lg px-1 py-1 text-sm outline-none focus:ring-2 focus:ring-teal-500"
                          value={editData.sex} onChange={e => setEditData(p => p && ({ ...p, sex: e.target.value }))}>
                          <option value="M">M</option>
                          <option value="F">F</option>
                        </select>
                      </div>
                    </td>
                    {/* Mobil edit */}
                    <td className="px-3 py-2">
                      <div className="flex flex-col gap-1">
                        {editData.mobiles.map((m, i) => (
                          <input key={m.contact_key} className={inputCls} value={m.value}
                            onChange={e => setEditData(p => p && ({ ...p, mobiles: p.mobiles.map((x, j) => j === i ? { ...x, value: e.target.value } : x) }))} />
                        ))}
                        {editData.mobiles.length === 0 && (
                          <input className={inputCls} value={editData.newMobile} placeholder="+ přidat"
                            onChange={e => setEditData(p => p && ({ ...p, newMobile: e.target.value }))} />
                        )}
                      </div>
                    </td>
                    {/* Email edit */}
                    <td className="px-3 py-2">
                      <div className="flex flex-col gap-1">
                        {editData.emails.map((m, i) => (
                          <input key={m.contact_key} className={inputCls} value={m.value}
                            onChange={e => setEditData(p => p && ({ ...p, emails: p.emails.map((x, j) => j === i ? { ...x, value: e.target.value } : x) }))} />
                        ))}
                        {editData.emails.length === 0 && (
                          <input className={inputCls} value={editData.newEmail} placeholder="+ přidat"
                            onChange={e => setEditData(p => p && ({ ...p, newEmail: e.target.value }))} />
                        )}
                      </div>
                    </td>
                    {/* Username edit */}
                    <td className="px-3 py-2">
                      <input className={inputCls + ' font-mono'} value={editData.username}
                        onChange={e => setEditData(p => p && ({ ...p, username: e.target.value }))} />
                    </td>
                    {/* Password edit */}
                    <td className="px-3 py-2">
                      <input className={inputCls + ' font-mono'} value={editData.password}
                        onChange={e => setEditData(p => p && ({ ...p, password: e.target.value }))} />
                    </td>
                    {/* Akce */}
                    <td className="px-3 py-2">
                      <div className="flex flex-col gap-1">
                        <button onClick={() => handleSave(person)} disabled={saving}
                          className="flex items-center justify-center bg-teal-600 text-white rounded-lg px-2 py-1 hover:bg-teal-700 disabled:opacity-50">
                          {saving ? <Spinner size={3} /> : (
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </button>
                        <button onClick={() => { setEditKey(null); setEditData(null) }}
                          className="flex items-center justify-center border border-gray-300 rounded-lg px-2 py-1 hover:bg-gray-100">
                          <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              }

              return (
                <>
                  <tr key={person.person_key}
                    className="hover:bg-gray-50 cursor-pointer group"
                    onClick={() => startEdit(person, pContacts, account)}>
                    <td className="px-3 py-2.5"><span className={nameCls}>{person.name}</span></td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-col gap-0.5">
                        {mobiles.map(c => (
                          <div key={c.contact_key} className="flex items-center gap-1.5">
                            <span className="text-gray-800">{c.value}</span>
                            <button title="Odeslat SMS"
                              onClick={e => { e.stopPropagation(); setSmsTarget({ gsm: c.value, name: person.name }) }}
                              className="text-gray-300 hover:text-teal-600 transition-colors">
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                              </svg>
                            </button>
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-col gap-0.5">
                        {emails.map(c => <span key={c.contact_key} className="text-gray-800">{c.value}</span>)}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="font-mono text-gray-800 text-xs">{account?.username ?? ''}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="font-mono text-gray-500 text-xs">{account?.password ?? ''}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <button title="Smazat" onClick={e => { e.stopPropagation(); handleDeletePerson(person.person_key) }}
                        className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-opacity">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                </>
              )
            })}

            {/* Účty bez osoby */}
            {orphanAccounts.map((acc: any, i: number) => (
              <tr key={`orphan-${acc.username}`} className="hover:bg-gray-50 group">
                <td className="px-3 py-2.5 text-gray-300 italic text-sm">—</td>
                <td className="px-3 py-2.5"></td>
                <td className="px-3 py-2.5"></td>
                <td className="px-3 py-2.5"><span className="font-mono text-gray-800 text-xs">{acc.username}</span></td>
                <td className="px-3 py-2.5"><span className="font-mono text-gray-500 text-xs">{acc.password}</span></td>
                <td className="px-3 py-2.5"></td>
              </tr>
            ))}
          </tbody>
        </table>

        {showAddPerson ? (
          <div className="border-t border-gray-200 bg-teal-50 px-4 py-3">
            <div className="flex items-center gap-3 flex-wrap">
              <input className="border border-gray-300 rounded-lg px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-teal-500 flex-1 min-w-32"
                value={newPerson.name} placeholder="Jméno" autoFocus
                onKeyDown={e => e.key === 'Enter' && handleAddPerson()}
                onChange={e => setNewPerson(p => ({ ...p, name: e.target.value }))} />
              <select className="border border-gray-300 rounded-lg px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-teal-500"
                value={newPerson.sex} onChange={e => setNewPerson(p => ({ ...p, sex: e.target.value }))}>
                <option value="M">Muž</option>
                <option value="F">Žena</option>
              </select>
              <label className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" checked={newPerson.send_offers}
                  onChange={e => setNewPerson(p => ({ ...p, send_offers: e.target.checked }))} />
                Nabídky
              </label>
              <button onClick={handleAddPerson} disabled={saving || !newPerson.name}
                className="bg-teal-600 text-white px-4 py-1.5 rounded-lg text-sm hover:bg-teal-700 disabled:opacity-60">
                {saving ? <Spinner size={4} /> : 'Přidat'}
              </button>
              <button onClick={() => setShowAddPerson(false)}
                className="px-4 py-1.5 border rounded-lg text-sm hover:bg-gray-50">Zrušit</button>
            </div>
          </div>
        ) : (
          <div className="border-t border-gray-100">
            <button onClick={() => setShowAddPerson(true)}
              className="w-full px-4 py-2.5 text-sm text-teal-600 hover:bg-teal-50 flex items-center justify-center gap-1.5 transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
              </svg>
              Přidat kontaktní osobu
            </button>
          </div>
        )}
      </div>

      {smsTarget && (
        <SendSmsModal
          companyKey={companyKey}
          initialGsm={smsTarget.gsm}
          initialName={smsTarget.name}
          onClose={() => setSmsTarget(null)}
        />
      )}

      {/* Firemní kontakty */}
      <div className="mt-6 bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className={thCls}>Typ</th>
              <th className={thCls}>Hodnota</th>
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {companyContacts.map(c => (
              <tr key={c.contact_key} className="hover:bg-gray-50 group">
                <td className="px-3 py-2 text-xs font-semibold text-gray-700 w-28">
                  {{ U: 'Účetní', S: 'Servis', C: 'Záloha karty' }[c.type] ?? CONTACT_TYPE_LABELS[c.type] ?? c.type}
                </td>
                <td className="px-3 py-2 font-mono text-xs text-gray-800">{c.value}</td>
                <td className="px-3 py-2">
                  <button onClick={() => handleDeleteContact(c.contact_key)}
                    className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-opacity">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {addContactFor === 0 ? (
          <div className="border-t border-gray-200 bg-teal-50 px-4 py-3">
            <div className="flex items-center gap-2">
              <select className="border border-gray-300 rounded-lg px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-teal-500"
                value={newContact.type} onChange={e => setNewContact(p => ({ ...p, type: e.target.value }))}>
                <option value="U">Účetní</option>
                <option value="S">Servis</option>
                <option value="C">Záloha karty</option>
              </select>
              <input className="border border-gray-300 rounded-lg px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-teal-500 flex-1"
                value={newContact.value} placeholder="Hodnota" autoFocus
                onKeyDown={e => e.key === 'Enter' && handleAddContact(0)}
                onChange={e => setNewContact(p => ({ ...p, value: e.target.value }))} />
              <button onClick={() => handleAddContact(0)} disabled={saving || !newContact.value}
                className="bg-teal-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-teal-700 disabled:opacity-60">
                {saving ? <Spinner size={3} /> : 'Přidat'}
              </button>
              <button onClick={() => setAddContactFor(null)} className="text-sm text-gray-500 hover:text-gray-700">Zrušit</button>
            </div>
          </div>
        ) : (
          <div className="border-t border-gray-100">
            <button onClick={() => { setAddContactFor(0); setNewContact({ type: 'U', value: '' }) }}
              className="w-full px-4 py-2.5 text-sm text-teal-600 hover:bg-teal-50 flex items-center justify-center gap-1.5 transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Přidat firemní kontakt
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
