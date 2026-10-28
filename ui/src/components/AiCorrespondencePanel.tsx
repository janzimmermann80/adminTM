import { useEffect, useState } from 'react'
import {
  AI_CORRESPONDENCE_DATA_SOURCES,
  AI_CORRESPONDENCE_MODELS,
  generateCorrespondenceDraft,
  getAiCorrespondenceModel,
  getAiCorrespondenceTypes,
  saveAiCorrespondenceModel,
  saveAiCorrespondenceTypes,
  type AiCorrespondenceDataSource,
  type AiCorrespondenceModel,
  type AiCorrespondenceType,
} from '../api'
import { Spinner } from './Spinner'

interface Props {
  companyKey: string
  channel: 'email' | 'sms'
  recipient: string
  onDraft: (draft: { subject?: string; message: string }, noteType: string) => void
  onGeneratingChange: (generating: boolean) => void
}

const createId = () => globalThis.crypto?.randomUUID?.()
  ?? `ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

export const AiCorrespondencePanel = ({ companyKey, channel, recipient, onDraft, onGeneratingChange }: Props) => {
  const [types, setTypes] = useState<AiCorrespondenceType[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [editId, setEditId] = useState('')
  const [manage, setManage] = useState(false)
  const [model, setModel] = useState<AiCorrespondenceModel>(getAiCorrespondenceModel)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true)
    getAiCorrespondenceTypes(channel)
      .then(data => {
        if (!active) return
        setTypes(data)
        setSelectedId(data[0]?.id ?? '')
      })
      .catch(e => {
        if (active) setError(e instanceof Error ? e.message : 'AI typy se nepodařilo načíst.')
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [channel])

  const selectedType = types.find(type => type.id === selectedId)
  const editingType = types.find(type => type.id === editId)

  const updateType = (updated: AiCorrespondenceType) => {
    setTypes(current => current.map(type => type.id === updated.id ? updated : type))
  }

  const handleCreate = () => {
    const type: AiCorrespondenceType = {
      id: createId(),
      name: 'Nový AI typ',
      subject: '',
      prompt: '',
      dataSources: ['notes'],
      note_type: 'S',
    }
    setTypes(current => [...current, type])
    setEditId(type.id)
    setManage(true)
    setError('')
  }

  const handleDelete = () => {
    if (!editingType || !window.confirm(`Smazat AI typ „${editingType.name}“?`)) return
    const remaining = types.filter(type => type.id !== editingType.id)
    setTypes(remaining)
    setEditId('')
    if (selectedId === editingType.id) setSelectedId(remaining[0]?.id ?? '')
  }

  const handleSave = async () => {
    if (types.some(type => !type.name.trim() || !type.prompt.trim())) {
      setError('Každý AI typ musí mít název a pokyn.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await saveAiCorrespondenceTypes(channel, types)
      setManage(false)
      setEditId('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'AI typy se nepodařilo uložit.')
    } finally {
      setSaving(false)
    }
  }

  const handleGenerate = async () => {
    if (!selectedType || !recipient) {
      setError(!recipient ? 'Vyberte příjemce.' : 'Nejprve vytvořte a uložte AI typ zprávy.')
      return
    }
    setGenerating(true)
    onGeneratingChange(true)
    setError('')
    try {
      const draft = await generateCorrespondenceDraft({
        company_key: Number(companyKey),
        channel,
        recipient,
        type_id: selectedType.id,
        model,
      })
      onDraft(draft, selectedType.note_type)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Návrh zprávy se nepodařilo vytvořit.')
    } finally {
      setGenerating(false)
      onGeneratingChange(false)
    }
  }

  const toggleDataSource = (source: AiCorrespondenceDataSource, checked: boolean) => {
    if (!editingType) return
    updateType({
      ...editingType,
      dataSources: checked
        ? [...new Set([...editingType.dataSources, source])]
        : editingType.dataSources.filter(value => value !== source),
    })
  }

  if (loading) return <div className="flex justify-center py-8"><Spinner size={6} /></div>

  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50 p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-violet-900">AI typy zpráv</h3>
        <button
          type="button"
          onClick={() => { setManage(value => !value); setEditId(''); setError('') }}
          className="text-xs text-violet-700 hover:text-violet-900 underline"
        >
          {manage ? 'Použít AI typ' : 'Spravovat AI typy'}
        </button>
      </div>

      {manage ? (
        <div className="space-y-3">
          <div className="flex gap-2">
            <select
              aria-label="Upravit AI typ"
              value={editId}
              onChange={event => setEditId(event.target.value)}
              className="min-w-0 flex-1 border border-violet-200 rounded-lg px-2 py-2 text-sm bg-white"
            >
              <option value="">Vyberte typ k úpravě</option>
              {types.map(type => <option key={type.id} value={type.id}>{type.name}</option>)}
            </select>
            <button type="button" onClick={handleCreate}
              className="shrink-0 px-3 py-2 text-xs font-medium bg-violet-600 text-white rounded-lg hover:bg-violet-700">
              + Nový typ
            </button>
          </div>

          {editingType && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-violet-800 mb-1">Název typu</label>
                <input
                  maxLength={100}
                  value={editingType.name}
                  onChange={event => updateType({ ...editingType, name: event.target.value })}
                  className="w-full border border-violet-200 rounded-lg px-3 py-2 text-sm bg-white"
                />
              </div>
              {channel === 'email' && (
                <div>
                  <label className="block text-xs font-medium text-violet-800 mb-1">Předmět e-mailu (volitelné)</label>
                  <input
                    maxLength={200}
                    value={editingType.subject ?? ''}
                    onChange={event => updateType({ ...editingType, subject: event.target.value })}
                    placeholder="Prázdné pole = předmět navrhne AI"
                    className="w-full border border-violet-200 rounded-lg px-3 py-2 text-sm bg-white"
                  />
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-violet-800 mb-1">Pokyn pro AI</label>
                <textarea
                  rows={4}
                  maxLength={4000}
                  value={editingType.prompt}
                  onChange={event => updateType({ ...editingType, prompt: event.target.value })}
                  placeholder="Popište, jak má AI zprávu sestavit, jaký má mít tón a co má sdělit."
                  className="w-full border border-violet-200 rounded-lg px-3 py-2 text-sm bg-white resize-y"
                />
              </div>
              <fieldset>
                <legend className="block text-xs font-medium text-violet-800 mb-1">Data dostupná tomuto typu</legend>
                <div className="grid gap-1">
                  {AI_CORRESPONDENCE_DATA_SOURCES.map(source => (
                    <label key={source.id} className="flex items-start gap-2 text-xs text-violet-900">
                      <input
                        type="checkbox"
                        checked={editingType.dataSources.includes(source.id)}
                        onChange={event => toggleDataSource(source.id, event.target.checked)}
                        className="mt-0.5 accent-violet-600"
                      />
                      {source.label}
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="flex items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-xs text-violet-800">
                  Typ poznámky
                  <input
                    maxLength={10}
                    value={editingType.note_type}
                    onChange={event => updateType({ ...editingType, note_type: event.target.value })}
                    className="w-16 border border-violet-200 rounded px-2 py-1 bg-white"
                  />
                </label>
                <button type="button" onClick={handleDelete}
                  className="px-3 py-1.5 text-xs text-red-700 border border-red-200 rounded-lg bg-white hover:bg-red-50">
                  Smazat typ
                </button>
              </div>
            </div>
          )}

          <button type="button" onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 px-3 py-2 text-xs font-medium bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50">
            {saving ? <Spinner size={4} /> : 'Uložit AI typy'}
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Typ AI zprávy"
            value={selectedId}
            onChange={event => setSelectedId(event.target.value)}
            disabled={types.length === 0}
            className="min-w-0 flex-1 border border-violet-200 rounded-lg px-2 py-2 text-sm bg-white"
          >
            {types.length === 0
              ? <option value="">Nejprve vytvořte AI typ</option>
              : types.map(type => <option key={type.id} value={type.id}>{type.name}</option>)}
          </select>
          <select
            aria-label="Model OpenAI"
            value={model}
            onChange={event => {
              const nextModel = event.target.value as AiCorrespondenceModel
              setModel(nextModel)
              saveAiCorrespondenceModel(nextModel)
            }}
            className="min-w-0 flex-1 border border-violet-200 rounded-lg px-2 py-2 text-xs bg-white"
          >
            {AI_CORRESPONDENCE_MODELS.map(option => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
          <button type="button" onClick={handleGenerate}
            disabled={generating || !selectedType || !recipient}
            className="flex items-center gap-2 px-3 py-2 text-xs font-medium bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50">
            {generating ? <Spinner size={4} /> : 'Vytvořit návrh'}
          </button>
        </div>
      )}

      {error && <p role="alert" className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
      {!manage && <p className="text-xs text-violet-700">Použije se uložený pokyn a vybraná data. Návrh před odesláním zkontrolujte.</p>}
    </div>
  )
}
