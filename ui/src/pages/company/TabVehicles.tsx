import { useState, useEffect } from 'react'
import { getVehicles, getDrivers, getSimcards, addVehicle, updateVehicle, deleteVehicle, addDriver, updateDriver, deleteDriver, getSimcardTariffs, addSimcard, updateSimcard, deleteSimcard, getSimcardUploadLog, getSimcardServiceData, getContacts } from '../../api'
import { Spinner } from '../../components/Spinner'
import { formatNumber } from '../../utils'
import type { Vehicle, Driver, SimCard } from '../../types'

interface Props { companyKey: string }

const VEHICLE_TYPES: { value: string; label: string }[] = [
  { value: 'N', label: 'Normal' },
  { value: 'O', label: 'Plato' },
  { value: 'J', label: 'Jumbo' },
  { value: 'B', label: 'Skříň' },
  { value: 'I', label: 'Izotermický' },
  { value: 'M', label: 'Stěhovák' },
  { value: 'F', label: 'Chladák' },
  { value: 'T', label: 'Cisterna' },
  { value: 'S', label: 'Silo' },
  { value: 'D', label: 'Sklopka' },
  { value: 'K', label: 'Kontejner' },
  { value: 'X', label: 'Speciál' },
  { value: 'C', label: 'Cívkač' },
  { value: 'L', label: 'Tautliner' },
  { value: 'P', label: 'Osobní' },
  { value: 'V', label: 'Dodávka' },
  { value: 'W', label: 'Lowdeck' },
]

const EURO_OPTIONS = ['', '0', '1', '2', '3', '4', '5', '6']
const ADR_OPTIONS = [null, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

const Badge = ({ children, color = 'gray' }: { children: React.ReactNode; color?: string }) => {
  const colors: Record<string, string> = {
    gray: 'bg-gray-100 text-gray-600',
    green: 'bg-green-100 text-green-700',
    red: 'bg-red-100 text-red-600',
    blue: 'bg-teal-100 text-[#0a6b6b]',
    yellow: 'bg-yellow-100 text-yellow-700',
  }
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${colors[color]}`}>
      {children}
    </span>
  )
}

type FormData = Omit<Vehicle, 'car_key' | 'home_stand_name' | 'home_stand_zip' | 'home_stand_country'>

const emptyForm = (): FormData => ({
  spz: '',
  make: '',
  active: true,
  type: null,
  color: null,
  production_year: null,
  vin: null,
  tonnage: null,
  capacity: null,
  axles: null,
  euro_emission: null,
  length: null,
  width: null,
  height: null,
  engine_power: null,
  tank_volume: null,
  consumption_avg: null,
  adr: null,
  description: null,
  sim_imsi: null,
  export_allowed: false,
  export_requested: false,
  driver_key: null,
  driver2_key: null,
  person_key: null,
  stazka_certified: false,
  home_stand_key: null,
})

const vehicleToForm = (v: Vehicle): FormData => ({
  spz: v.spz,
  make: v.make,
  active: v.active,
  type: v.type ?? null,
  color: v.color ?? null,
  production_year: v.production_year ?? null,
  vin: v.vin ?? null,
  tonnage: v.tonnage ?? null,
  capacity: v.capacity ?? null,
  axles: v.axles ?? null,
  euro_emission: v.euro_emission ?? null,
  length: v.length ?? null,
  width: v.width ?? null,
  height: v.height ?? null,
  engine_power: v.engine_power ?? null,
  tank_volume: v.tank_volume ?? null,
  consumption_avg: v.consumption_avg ?? null,
  adr: v.adr ?? null,
  description: v.description ?? null,
  sim_imsi: v.sim_imsi ?? null,
  export_allowed: v.export_allowed ?? false,
  export_requested: v.export_requested ?? false,
  driver_key: v.driver_key ?? null,
  driver2_key: v.driver2_key ?? null,
  person_key: v.person_key ?? null,
  stazka_certified: v.stazka_certified ?? false,
  home_stand_key: v.home_stand_key ?? null,
})

interface EditFormProps {
  form: FormData
  drivers: Driver[]
  simcards: SimCard[]
  saving: boolean
  isNew: boolean
  onChange: (patch: Partial<FormData>) => void
  onSave: () => void
  onCancel: () => void
  onDelete?: () => void
}

const EditForm = ({ form, drivers, simcards, saving, isNew, onChange, onSave, onCancel, onDelete }: EditFormProps) => {
  const [confirmDelete, setConfirmDelete] = useState(false)

  const num = (v: number | null | undefined) => v == null ? '' : String(v)
  const setNum = (key: keyof FormData, v: string) => {
    const n = v === '' ? null : parseFloat(v)
    onChange({ [key]: isNaN(n as number) ? null : n })
  }
  const setInt = (key: keyof FormData, v: string) => {
    const n = v === '' ? null : parseInt(v)
    onChange({ [key]: isNaN(n as number) ? null : n })
  }

  const inputCls = 'w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#0a6b6b] focus:border-[#0a6b6b]'
  const labelCls = 'block text-xs text-gray-500 mb-0.5'

  const activeDrivers = drivers.filter(d => d.active)

  return (
    <div className="mt-3 pt-3 border-t border-gray-200 space-y-3">
      {/* Row 1: SPZ, Make, Typ, Barva */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <label className={labelCls}>SPZ *</label>
          <input className={inputCls} value={form.spz} onChange={e => onChange({ spz: e.target.value })} placeholder="1AB2345" />
        </div>
        <div>
          <label className={labelCls}>Výrobce</label>
          <input className={inputCls} value={form.make ?? ''} onChange={e => onChange({ make: e.target.value })} placeholder="Volvo" />
        </div>
        <div>
          <label className={labelCls}>Typ</label>
          <select className={inputCls} value={form.type ?? ''} onChange={e => onChange({ type: e.target.value || null })}>
            <option value="">—</option>
            {VEHICLE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Barva</label>
          <input className={inputCls} value={form.color ?? ''} onChange={e => onChange({ color: e.target.value || null })} placeholder="bílá" />
        </div>
      </div>

      {/* Row 2: Rok, VIN */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <label className={labelCls}>Rok výroby</label>
          <input className={inputCls} type="number" value={num(form.production_year)} onChange={e => setInt('production_year', e.target.value)} placeholder="2020" min="1980" max="2030" />
        </div>
        <div className="col-span-1 md:col-span-3">
          <label className={labelCls}>VIN</label>
          <input className={inputCls} value={form.vin ?? ''} onChange={e => onChange({ vin: e.target.value || null })} placeholder="WDB9634031L..." />
        </div>
      </div>

      {/* Row 3: Rozměry */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        <div>
          <label className={labelCls}>Nosnost (t)</label>
          <input className={inputCls} type="number" step="0.1" value={num(form.tonnage)} onChange={e => setNum('tonnage', e.target.value)} placeholder="24" />
        </div>
        <div>
          <label className={labelCls}>Objem (m³)</label>
          <input className={inputCls} type="number" step="0.1" value={num(form.capacity)} onChange={e => setNum('capacity', e.target.value)} placeholder="92" />
        </div>
        <div>
          <label className={labelCls}>Délka (m)</label>
          <input className={inputCls} type="number" step="0.01" value={num(form.length)} onChange={e => setNum('length', e.target.value)} placeholder="13.6" />
        </div>
        <div>
          <label className={labelCls}>Šířka (m)</label>
          <input className={inputCls} type="number" step="0.01" value={num(form.width)} onChange={e => setNum('width', e.target.value)} placeholder="2.4" />
        </div>
        <div>
          <label className={labelCls}>Výška (m)</label>
          <input className={inputCls} type="number" step="0.01" value={num(form.height)} onChange={e => setNum('height', e.target.value)} placeholder="2.7" />
        </div>
        <div>
          <label className={labelCls}>Nápravy</label>
          <input className={inputCls} type="number" value={num(form.axles)} onChange={e => setInt('axles', e.target.value)} placeholder="3" min="1" max="10" />
        </div>
      </div>

      {/* Row 4: Technical */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <label className={labelCls}>Euro</label>
          <select className={inputCls} value={form.euro_emission ?? ''} onChange={e => onChange({ euro_emission: e.target.value || null })}>
            {EURO_OPTIONS.map(e => <option key={e} value={e}>{e === '' ? '—' : `Euro ${e}`}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Výkon (kW)</label>
          <input className={inputCls} type="number" value={num(form.engine_power)} onChange={e => setInt('engine_power', e.target.value)} placeholder="350" />
        </div>
        <div>
          <label className={labelCls}>Nádrž (l)</label>
          <input className={inputCls} type="number" value={num(form.tank_volume)} onChange={e => setInt('tank_volume', e.target.value)} placeholder="800" />
        </div>
        <div>
          <label className={labelCls}>Spotřeba (l/100)</label>
          <input className={inputCls} type="number" step="0.1" value={num(form.consumption_avg)} onChange={e => setNum('consumption_avg', e.target.value)} placeholder="32" />
        </div>
      </div>

      {/* Row 5: Driver, SIM, ADR */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className={labelCls}>Řidič 1</label>
          <select className={inputCls} value={form.driver_key ?? ''} onChange={e => onChange({ driver_key: e.target.value ? parseInt(e.target.value) : null })}>
            <option value="">—</option>
            {activeDrivers.map(d => <option key={d.driver_key} value={d.driver_key}>{d.name}</option>)}
            {/* show current if inactive */}
            {form.driver_key && !activeDrivers.find(d => d.driver_key === form.driver_key) && (
              <option value={form.driver_key}>{drivers.find(d => d.driver_key === form.driver_key)?.name ?? `#${form.driver_key}`}</option>
            )}
          </select>
        </div>
        <div>
          <label className={labelCls}>Řidič 2</label>
          <select className={inputCls} value={form.driver2_key ?? ''} onChange={e => onChange({ driver2_key: e.target.value ? parseInt(e.target.value) : null })}>
            <option value="">—</option>
            {activeDrivers.map(d => <option key={d.driver_key} value={d.driver_key}>{d.name}</option>)}
            {form.driver2_key && !activeDrivers.find(d => d.driver_key === form.driver2_key) && (
              <option value={form.driver2_key}>{drivers.find(d => d.driver_key === form.driver2_key)?.name ?? `#${form.driver2_key}`}</option>
            )}
          </select>
        </div>
        <div>
          <label className={labelCls}>SIM IMSI</label>
          <select className={inputCls} value={form.sim_imsi ?? ''} onChange={e => onChange({ sim_imsi: e.target.value || null })}>
            <option value="">—</option>
            {simcards.map(s => <option key={s.imsi} value={s.imsi}>{s.imsi}{s.number ? ` (${s.number})` : ''}</option>)}
          </select>
        </div>
      </div>

      {/* Row 6: ADR, Stanoviště */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <label className={labelCls}>ADR třída</label>
          <select className={inputCls} value={form.adr ?? ''} onChange={e => onChange({ adr: e.target.value ? parseInt(e.target.value) : null })}>
            {ADR_OPTIONS.map(v => <option key={v ?? 'none'} value={v ?? ''}>{v == null ? '—' : v}</option>)}
          </select>
        </div>
        <div className="col-span-1 md:col-span-3">
          <label className={labelCls}>Popis</label>
          <input className={inputCls} value={form.description ?? ''} onChange={e => onChange({ description: e.target.value || null })} placeholder="Poznámka k vozidlu..." />
        </div>
      </div>

      {/* Checkboxes */}
      <div className="flex flex-wrap gap-5">
        {[
          { key: 'stazka_certified' as keyof FormData, label: 'Stažka certifikována' },
          { key: 'export_allowed' as keyof FormData, label: 'Export povolen' },
          { key: 'export_requested' as keyof FormData, label: 'Export požadován' },
          { key: 'active' as keyof FormData, label: 'Aktivní' },
        ].map(({ key, label }) => (
          <label key={key} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
            <input
              type="checkbox"
              className="w-4 h-4 rounded border-gray-300 text-[#0a6b6b] focus:ring-[#0a6b6b]"
              checked={!!form[key]}
              onChange={e => onChange({ [key]: e.target.checked })}
            />
            {label}
          </label>
        ))}
      </div>

      {/* Buttons */}
      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={onSave}
          disabled={saving || !form.spz.trim()}
          className="px-4 py-1.5 rounded-lg bg-[#0a6b6b] text-white text-sm font-medium hover:bg-[#0d8080] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Ukládám…' : isNew ? 'Přidat vozidlo' : 'Uložit'}
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-1.5 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
        >
          Zrušit
        </button>
        {!isNew && onDelete && (
          confirmDelete ? (
            <>
              <span className="text-sm text-red-600 ml-2">Opravdu smazat?</span>
              <button onClick={onDelete} className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-sm hover:bg-red-700">Smazat</button>
              <button onClick={() => setConfirmDelete(false)} className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm">Ne</button>
            </>
          ) : (
            <button onClick={() => setConfirmDelete(true)} className="ml-auto px-3 py-1.5 rounded-lg border border-red-200 text-red-600 text-sm hover:bg-red-50">
              Smazat
            </button>
          )
        )}
      </div>
    </div>
  )
}

interface VehicleRowProps {
  vehicle: Vehicle
  drivers: Driver[]
  simcards: SimCard[]
  persons: { person_key: number; name: string }[]
  companyKey: string
  onUpdated: (v: Vehicle) => void
  onDeleted: (carKey: number) => void
  highlighted?: boolean
  onGoToSim?: (imsi: string) => void
}

const VehicleRow = ({ vehicle: v, drivers, simcards, persons, companyKey, onUpdated, onDeleted, highlighted, onGoToSim }: VehicleRowProps) => {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<FormData>(vehicleToForm(v))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const driverMap = Object.fromEntries(drivers.map(d => [d.driver_key, d.name]))
  const simMap = Object.fromEntries(simcards.map(s => [s.imsi, s.number ?? s.imsi]))
  const personMap = Object.fromEntries(persons.map(p => [p.person_key, p.name]))

  const typeLabel = VEHICLE_TYPES.find(t => t.value === v.type)?.label

  const handleSave = async () => {
    setSaving(true)
    setError('')
    try {
      await updateVehicle(companyKey, String(v.car_key), {
        ...form,
        active: form.active,
        inactive: !form.active,
      })
      onUpdated({ ...v, ...form })
      setOpen(false)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    setSaving(true)
    try {
      await deleteVehicle(companyKey, String(v.car_key))
      onDeleted(v.car_key)
    } catch (e: any) {
      setError(e.message)
      setSaving(false)
    }
  }

  const handleQuickSave = async (patch: Partial<FormData>) => {
    const next = { ...form, ...patch }
    setForm(next)
    setSaving(true)
    setError('')
    try {
      await updateVehicle(companyKey, String(v.car_key), { ...next, active: next.active, inactive: !next.active })
      onUpdated({ ...v, ...next })
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const activeDriverOpts = drivers.filter(d => d.active)
  // placeholder světlejší, když není vybraná hodnota (nesplývá se zadanými hodnotami)
  const selCls = 'border border-gray-300 rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#0a6b6b] bg-white max-w-[10rem] truncate'
  const selColor = (empty: boolean) => empty ? ' text-gray-400' : ' text-gray-900'

  return (
    <div id={`car-${v.car_key}`} className={`border rounded-xl px-4 py-3 transition-shadow ${v.active ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50'} ${highlighted ? 'ring-2 ring-[#0a6b6b] shadow-md' : ''}`}>
      {/* Summary row */}
      <div className="flex items-center gap-3 cursor-pointer" onClick={() => { setOpen(o => !o); setForm(vehicleToForm(v)); setError('') }}>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${v.active ? 'bg-teal-100' : 'bg-gray-200'}`}>
          <svg className={`w-4 h-4 ${v.active ? 'text-[#0a6b6b]' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" />
          </svg>
        </div>
        <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap" onClick={e => e.stopPropagation()}>
          <span className="font-bold text-gray-900 font-mono text-sm w-24 flex-shrink-0 cursor-pointer" onClick={() => { setOpen(o => !o); setForm(vehicleToForm(v)) }}>{v.spz}</span>
          <select className={selCls + selColor(!form.driver_key)} value={form.driver_key ?? ''} disabled={saving}
            onChange={e => handleQuickSave({ driver_key: e.target.value ? parseInt(e.target.value) : null })}>
            <option value="">Řidič 1…</option>
            {activeDriverOpts.map(d => <option key={d.driver_key} value={d.driver_key}>{d.name}</option>)}
            {form.driver_key && !activeDriverOpts.find(d => d.driver_key === form.driver_key) && (
              <option value={form.driver_key}>{driverMap[form.driver_key] ?? `#${form.driver_key}`}</option>
            )}
          </select>
          <select className={selCls + selColor(!form.driver2_key)} value={form.driver2_key ?? ''} disabled={saving}
            onChange={e => handleQuickSave({ driver2_key: e.target.value ? parseInt(e.target.value) : null })}>
            <option value="">Řidič 2…</option>
            {activeDriverOpts.map(d => <option key={d.driver_key} value={d.driver_key}>{d.name}</option>)}
            {form.driver2_key && !activeDriverOpts.find(d => d.driver_key === form.driver2_key) && (
              <option value={form.driver2_key}>{driverMap[form.driver2_key] ?? `#${form.driver2_key}`}</option>
            )}
          </select>
          <select className={selCls + ' font-mono' + selColor(!form.sim_imsi)} value={form.sim_imsi ?? ''} disabled={saving}
            onChange={e => handleQuickSave({ sim_imsi: e.target.value || null })}>
            <option value="">SIM…</option>
            {simcards.map(s => (
              <option key={s.imsi} value={s.imsi} style={s.our_sim ? { color: '#1d4ed8', fontWeight: 600 } : undefined}>
                {s.number ? `${s.number}` : s.imsi}{s.our_sim ? ' ●' : ''}
              </option>
            ))}
          </select>
          <select className={selCls + selColor(!form.person_key)} value={form.person_key ?? ''} disabled={saving}
            onChange={e => handleQuickSave({ person_key: e.target.value ? parseInt(e.target.value) : null })}>
            <option value="">Dispečer…</option>
            {persons.map(p => <option key={p.person_key} value={p.person_key}>{p.name}</option>)}
            {form.person_key && !persons.find(p => p.person_key === form.person_key) && (
              <option value={form.person_key}>{personMap[form.person_key] ?? `#${form.person_key}`}</option>
            )}
          </select>
          <label className="flex items-center gap-1 text-xs text-gray-700 cursor-pointer select-none" onClick={e => e.stopPropagation()}>
            <input type="checkbox" className="w-4 h-4 rounded border-gray-300 text-[#0a6b6b] focus:ring-[#0a6b6b]"
              checked={!!form.stazka_certified} disabled={saving}
              onChange={e => handleQuickSave({ stazka_certified: e.target.checked })} />
            Stažka
          </label>
          <label className="flex items-center gap-1 text-xs text-gray-700 cursor-pointer select-none" onClick={e => e.stopPropagation()}>
            <input type="checkbox" className="w-4 h-4 rounded border-gray-300 text-[#0a6b6b] focus:ring-[#0a6b6b]"
              checked={!!form.active} disabled={saving}
              onChange={e => handleQuickSave({ active: e.target.checked })} />
            Aktivní
          </label>
          <div className="flex gap-1 flex-wrap">
            {v.export_allowed && <Badge color="blue">Export</Badge>}
            {v.adr && <Badge color="yellow">ADR {v.adr}</Badge>}
          </div>
        </div>
        <svg className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {error && <div className="mt-2 text-sm text-red-600">{error}</div>}

      {open && (
        <EditForm
          form={form}
          drivers={drivers}
          simcards={simcards}
          saving={saving}
          isNew={false}
          onChange={patch => setForm(f => ({ ...f, ...patch }))}
          onSave={handleSave}
          onCancel={() => setOpen(false)}
          onDelete={handleDelete}
        />
      )}
    </div>
  )
}

interface NewVehicleFormProps {
  companyKey: string
  drivers: Driver[]
  simcards: SimCard[]
  onAdded: (v: Vehicle) => void
  onCancel: () => void
}

const NewVehicleForm = ({ companyKey, drivers, simcards, onAdded, onCancel }: NewVehicleFormProps) => {
  const [form, setForm] = useState<FormData>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async () => {
    setSaving(true)
    setError('')
    try {
      const result = await addVehicle(companyKey, form)
      onAdded({ ...form, car_key: result.car_key } as Vehicle)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="border-2 border-dashed border-[#0a6b6b] rounded-xl px-4 py-3">
      <div className="flex items-center gap-2 mb-1">
        <span className="font-medium text-sm text-[#0a6b6b]">Nové vozidlo</span>
      </div>
      {error && <div className="text-sm text-red-600 mb-2">{error}</div>}
      <EditForm
        form={form}
        drivers={drivers}
        simcards={simcards}
        saving={saving}
        isNew={true}
        onChange={patch => setForm(f => ({ ...f, ...patch }))}
        onSave={handleSave}
        onCancel={onCancel}
      />
    </div>
  )
}

// ── Driver components ───────────────────────────────────────────────────────

const CURRENCIES = ['CZK', 'EUR', 'USD', 'PLN', 'HUF', 'GBP']

interface DriverFormData {
  name: string; phone: string; adr: boolean; active: boolean
  wage_km: number | null; wage_hourly: number | null; currency: string
}

const emptyDriverForm = (): DriverFormData => ({
  name: '', phone: '', adr: false, active: true, wage_km: null, wage_hourly: null, currency: 'CZK',
})

const driverToForm = (d: Driver): DriverFormData => ({
  name: d.name, phone: d.phone ?? '', adr: !!d.adr, active: d.active,
  wage_km: d.wage_km ?? null, wage_hourly: d.wage_hourly ?? null, currency: d.currency ?? 'CZK',
})

interface DriverEditFormProps {
  form: DriverFormData; saving: boolean; isNew: boolean
  onChange: (p: Partial<DriverFormData>) => void
  onSave: () => void; onCancel: () => void; onDelete?: () => void
}

const DriverEditForm = ({ form, saving, isNew, onChange, onSave, onCancel, onDelete }: DriverEditFormProps) => {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const inputCls = 'w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#0a6b6b] focus:border-[#0a6b6b]'
  const labelCls = 'block text-xs text-gray-500 mb-0.5'
  const num = (v: number | null) => v == null ? '' : String(v)
  const setNum = (key: keyof DriverFormData, v: string) => {
    const n = v === '' ? null : parseFloat(v)
    onChange({ [key]: isNaN(n as number) ? null : n })
  }

  return (
    <div className="mt-3 pt-3 border-t border-gray-200 space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="col-span-2 md:col-span-2">
          <label className={labelCls}>Jméno *</label>
          <input className={inputCls} value={form.name} onChange={e => onChange({ name: e.target.value })} placeholder="Jan Novák" />
        </div>
        <div>
          <label className={labelCls}>Telefon</label>
          <input className={inputCls} value={form.phone} onChange={e => onChange({ phone: e.target.value })} placeholder="+420 600 000 000" />
        </div>
        <div>
          <label className={labelCls}>Měna</label>
          <select className={inputCls} value={form.currency} onChange={e => onChange({ currency: e.target.value })}>
            {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <label className={labelCls}>Mzda/km</label>
          <input className={inputCls} type="number" step="0.01" value={num(form.wage_km)} onChange={e => setNum('wage_km', e.target.value)} placeholder="0.00" />
        </div>
        <div>
          <label className={labelCls}>Mzda/hod</label>
          <input className={inputCls} type="number" step="0.01" value={num(form.wage_hourly)} onChange={e => setNum('wage_hourly', e.target.value)} placeholder="0.00" />
        </div>
      </div>
      <div className="flex flex-wrap gap-5">
        {[
          { key: 'adr' as keyof DriverFormData, label: 'ADR' },
          { key: 'active' as keyof DriverFormData, label: 'Aktivní' },
        ].map(({ key, label }) => (
          <label key={key} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
            <input type="checkbox" className="w-4 h-4 rounded border-gray-300 text-[#0a6b6b] focus:ring-[#0a6b6b]"
              checked={!!form[key]} onChange={e => onChange({ [key]: e.target.checked })} />
            {label}
          </label>
        ))}
      </div>
      <div className="flex items-center gap-2 pt-1">
        <button onClick={onSave} disabled={saving || !form.name.trim()}
          className="px-4 py-1.5 rounded-lg bg-[#0a6b6b] text-white text-sm font-medium hover:bg-[#0d8080] disabled:opacity-50 disabled:cursor-not-allowed">
          {saving ? 'Ukládám…' : isNew ? 'Přidat řidiče' : 'Uložit'}
        </button>
        <button onClick={onCancel} className="px-4 py-1.5 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50">Zrušit</button>
        {!isNew && onDelete && (
          confirmDelete ? (
            <>
              <span className="text-sm text-red-600 ml-2">Opravdu smazat?</span>
              <button onClick={onDelete} className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-sm hover:bg-red-700">Smazat</button>
              <button onClick={() => setConfirmDelete(false)} className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm">Ne</button>
            </>
          ) : (
            <button onClick={() => setConfirmDelete(true)} className="ml-auto px-3 py-1.5 rounded-lg border border-red-200 text-red-600 text-sm hover:bg-red-50">Smazat</button>
          )
        )}
      </div>
    </div>
  )
}

interface DriverRowProps {
  driver: Driver; companyKey: string
  onUpdated: (d: Driver) => void; onDeleted: (key: number) => void
}

const DriverRow = ({ driver: d, companyKey, onUpdated, onDeleted }: DriverRowProps) => {
  const [form, setForm] = useState<DriverFormData>(driverToForm(d))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const dirty = JSON.stringify(form) !== JSON.stringify(driverToForm(d))

  const handleSave = async () => {
    setSaving(true); setError('')
    try {
      await updateDriver(companyKey, String(d.driver_key), form)
      onUpdated({ ...d, ...form })
    } catch (e: any) { setError(e.message) }
    finally { setSaving(false) }
  }

  const handleDelete = async () => {
    setSaving(true)
    try {
      await deleteDriver(companyKey, String(d.driver_key))
      onDeleted(d.driver_key)
    } catch (e: any) { setError(e.message); setSaving(false) }
  }

  const inp = 'border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-[#0a6b6b] focus:border-[#0a6b6b] bg-white'

  return (
    <div className={`border rounded-lg px-3 py-2 ${d.active ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50'}`}>
      {error && <div className="mb-1.5 text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1">{error}</div>}
      <div className="flex flex-wrap items-center gap-2">
        <input className={inp + ' flex-1 min-w-[160px]'} value={form.name} placeholder="Jméno"
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
        <input className={inp + ' w-40 font-mono'} value={form.phone} placeholder="Telefon"
          onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
        <label className="flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer select-none">
          <input type="checkbox" className="w-4 h-4 rounded border-gray-300 text-[#0a6b6b] focus:ring-[#0a6b6b]"
            checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} />
          Aktivní
        </label>
        <div className="flex items-center gap-1 ml-auto">
          {dirty && (
            <button onClick={handleSave} disabled={saving || !form.name.trim()}
              className="px-2.5 py-1 rounded bg-[#0a6b6b] text-white text-xs font-medium hover:bg-[#0d8080] disabled:opacity-50">
              {saving ? '…' : 'Uložit'}
            </button>
          )}
          {confirmDelete ? (
            <>
              <span className="text-xs text-red-600">Opravdu?</span>
              <button onClick={handleDelete} className="px-2 py-1 rounded bg-red-600 text-white text-xs hover:bg-red-700">Smazat</button>
              <button onClick={() => setConfirmDelete(false)} className="px-2 py-1 rounded border border-gray-300 text-xs">Ne</button>
            </>
          ) : (
            <button onClick={() => setConfirmDelete(true)} title="Smazat řidiče"
              className="p-1 rounded text-gray-300 hover:text-red-600 hover:bg-red-50 transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3M4 7h16" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

interface NewDriverFormProps {
  companyKey: string; onAdded: (d: Driver) => void; onCancel: () => void
}

const NewDriverForm = ({ companyKey, onAdded, onCancel }: NewDriverFormProps) => {
  const [form, setForm] = useState<DriverFormData>(emptyDriverForm())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async () => {
    setSaving(true); setError('')
    try {
      const result = await addDriver(companyKey, form)
      onAdded({ ...form, driver_key: result.driver_key } as unknown as Driver)
    } catch (e: any) { setError(e.message) }
    finally { setSaving(false) }
  }

  return (
    <div className="border-2 border-dashed border-[#0a6b6b] rounded-xl px-4 py-3">
      <span className="font-medium text-sm text-[#0a6b6b]">Nový řidič</span>
      {error && <div className="text-sm text-red-600 mt-1">{error}</div>}
      <DriverEditForm form={form} saving={saving} isNew={true}
        onChange={p => setForm(f => ({ ...f, ...p }))}
        onSave={handleSave} onCancel={onCancel} />
    </div>
  )
}

// ── SIM card components ──────────────────────────────────────────────────────

interface SimFormData {
  imsi: string; number: string; tariff: string | null; price: number | null
  our_sim: boolean; ie_disabled: boolean; serial_number: string | null
  upload_home: number | null; upload_abroad1: number | null; upload_abroad2: number | null
}

const emptySimForm = (): SimFormData => ({
  imsi: '', number: '', tariff: null, price: null,
  our_sim: false, ie_disabled: false, serial_number: null,
  upload_home: null, upload_abroad1: null, upload_abroad2: null,
})

const simToForm = (s: SimCard): SimFormData => ({
  imsi: s.imsi, number: s.number ?? '', tariff: s.tariff ?? null,
  price: s.price ?? null, our_sim: !!s.our_sim, ie_disabled: !!s.ie_disabled,
  serial_number: s.serial_number ?? null,
  upload_home: s.upload_home ?? null,
  upload_abroad1: s.upload_abroad1 ?? null,
  upload_abroad2: s.upload_abroad2 ?? null,
})

interface SimEditFormProps {
  form: SimFormData; saving: boolean; isNew: boolean; tariffs: { tariff: string; name: string }[]
  onChange: (p: Partial<SimFormData>) => void
  onSave: () => void; onCancel: () => void; onDelete?: () => void
}

const SimEditForm = ({ form, saving, isNew, tariffs, onChange, onSave, onCancel, onDelete }: SimEditFormProps) => {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const cls = 'w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#0a6b6b] focus:border-[#0a6b6b]'
  const lbl = 'block text-xs text-gray-500 mb-0.5'
  const num = (v: number | null) => v == null ? '' : String(v)
  const setNum = (key: keyof SimFormData, v: string) => {
    const n = v === '' ? null : parseInt(v)
    onChange({ [key]: isNaN(n as number) ? null : n })
  }

  return (
    <div className="mt-3 pt-3 border-t border-gray-200 space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="col-span-2">
          <label className={lbl}>IMSI{isNew && ' *'}</label>
          <input className={cls} value={form.imsi} onChange={e => onChange({ imsi: e.target.value })}
            placeholder="230029xxxxxxxxx" readOnly={!isNew}
            style={!isNew ? { background: '#f9fafb', cursor: 'default' } : {}} />
        </div>
        <div className="col-span-2">
          <label className={lbl}>Tel. číslo</label>
          <input className={cls} value={form.number} onChange={e => onChange({ number: e.target.value })} placeholder="+420 600 000 000" />
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="col-span-2">
          <label className={lbl}>Tarif *</label>
          <select className={cls} value={form.tariff ?? ''} onChange={e => onChange({ tariff: e.target.value || null })}>
            <option value="">—</option>
            {tariffs.map(t => <option key={t.tariff} value={t.tariff}>{t.name}</option>)}
          </select>
        </div>
        <div>
          <label className={lbl}>Cena/měs.</label>
          <input className={cls} type="number" step="0.01" value={num(form.price)} onChange={e => { const n = e.target.value === '' ? null : parseFloat(e.target.value); onChange({ price: isNaN(n as number) ? null : n }) }} placeholder="0" />
        </div>
        <div>
          <label className={lbl}>Sériové číslo</label>
          <input className={cls} value={form.serial_number ?? ''} onChange={e => onChange({ serial_number: e.target.value || null })} placeholder="..." />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className={lbl}>Upload domácí (s)</label>
          <input className={cls} type="number" value={num(form.upload_home)} onChange={e => setNum('upload_home', e.target.value)} placeholder="120" />
        </div>
        <div>
          <label className={lbl}>Upload zahraničí 1 (s)</label>
          <input className={cls} type="number" value={num(form.upload_abroad1)} onChange={e => setNum('upload_abroad1', e.target.value)} placeholder="300" />
        </div>
        <div>
          <label className={lbl}>Upload zahraničí 2 (s)</label>
          <input className={cls} type="number" value={num(form.upload_abroad2)} onChange={e => setNum('upload_abroad2', e.target.value)} placeholder="600" />
        </div>
      </div>
      <div className="flex flex-wrap gap-5">
        {([['our_sim', 'Naše SIM'], ['ie_disabled', 'Internet zakázán']] as [keyof SimFormData, string][]).map(([key, label]) => (
          <label key={key} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
            <input type="checkbox" className="w-4 h-4 rounded border-gray-300 text-[#0a6b6b] focus:ring-[#0a6b6b]"
              checked={!!form[key]} onChange={e => onChange({ [key]: e.target.checked })} />
            {label}
          </label>
        ))}
      </div>
      <div className="flex items-center gap-2 pt-1">
        <button onClick={onSave} disabled={saving || !form.imsi.trim() || !form.tariff}
          className="px-4 py-1.5 rounded-lg bg-[#0a6b6b] text-white text-sm font-medium hover:bg-[#0d8080] disabled:opacity-50 disabled:cursor-not-allowed">
          {saving ? 'Ukládám…' : isNew ? 'Přidat SIM' : 'Uložit'}
        </button>
        <button onClick={onCancel} className="px-4 py-1.5 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50">Zrušit</button>
        {!isNew && onDelete && (
          confirmDelete ? (
            <>
              <span className="text-sm text-red-600 ml-2">Opravdu smazat?</span>
              <button onClick={onDelete} className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-sm hover:bg-red-700">Smazat</button>
              <button onClick={() => setConfirmDelete(false)} className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm">Ne</button>
            </>
          ) : (
            <button onClick={() => setConfirmDelete(true)} className="ml-auto px-3 py-1.5 rounded-lg border border-red-200 text-red-600 text-sm hover:bg-red-50">Smazat</button>
          )
        )}
      </div>
    </div>
  )
}

const FMT_DT = (s: string) => {
  const d = new Date(s)
  if (isNaN(d.getTime())) return s
  return d.toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' +
    d.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })
}

interface SimLogProps { companyKey: string; imsi: string; initialTab?: 'uploads' | 'service' }

const SimLog = ({ companyKey, imsi, initialTab = 'uploads' }: SimLogProps) => {
  const [tab, setTab] = useState<'uploads' | 'service'>(initialTab)
  const [uploads, setUploads] = useState<any[] | null>(null)
  const [service, setService] = useState<any[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const loadUploads = async () => {
    if (uploads !== null) return
    setLoading(true); setError('')
    try { setUploads(await getSimcardUploadLog(companyKey, imsi)) }
    catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }

  const loadService = async () => {
    if (service !== null) return
    setLoading(true); setError('')
    try { setService(await getSimcardServiceData(companyKey, imsi)) }
    catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }

  const switchTab = (t: typeof tab) => {
    setTab(t)
    if (t === 'uploads') loadUploads()
    else loadService()
  }

  useEffect(() => { if (initialTab === 'service') loadService(); else loadUploads() }, [])

  // reaguj na změnu initialTab zvenčí (přepnutí Přenosy/Běh tlačítkem v řádku)
  useEffect(() => { setTab(initialTab); if (initialTab === 'service') loadService(); else loadUploads() }, [initialTab])

  const tabCls = (t: typeof tab) =>
    `px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${tab === t ? 'bg-[#0a6b6b] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`

  return (
    <div className="mt-3 pt-3 border-t border-gray-200">
      <div className="flex gap-2 mb-3">
        <button className={tabCls('uploads')} onClick={() => switchTab('uploads')}>Přenosy</button>
        <button className={tabCls('service')} onClick={() => switchTab('service')}>Běh</button>
      </div>
      {error && <div className="text-sm text-red-600 mb-2">{error}</div>}
      {loading && <div className="flex justify-center py-4"><Spinner size={5} /></div>}

      {/* Přenosy */}
      {tab === 'uploads' && !loading && uploads !== null && (
        uploads.length === 0
          ? <p className="text-sm text-gray-400 py-3 text-center">Žádné přenosy</p>
          : <div className="overflow-x-auto rounded-lg border border-gray-200 max-h-96 overflow-y-auto">
              <table className="text-xs border-collapse" style={{ minWidth: '1100px' }}>
                <thead className="sticky top-0 bg-gray-50 z-10">
                  <tr className="text-left text-gray-500 border-b border-gray-200">
                    {['Čas','Síť','Net ID','Spojení','Metoda','Soubor (B)','Overhead (B)','Pozice','Služby','Zprávy','Verze','IP adresa','IP port','IMEI','Detail']
                      .map(h => <th key={h} className="px-2 py-2 font-medium whitespace-nowrap">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {uploads.map(u => (
                    <tr key={u.log_key} className="hover:bg-gray-50">
                      <td className="px-2 py-1.5 whitespace-nowrap text-gray-700">{FMT_DT(u.time)}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap">{u.gsmnet ?? '—'}</td>
                      <td className="px-2 py-1.5 font-mono">{u.gsmnet_id ?? '—'}</td>
                      <td className="px-2 py-1.5 text-center">{u.connection ?? '—'}</td>
                      <td className="px-2 py-1.5 text-center">{u.method ?? '—'}</td>
                      <td className="px-2 py-1.5 text-right">{u.file_size ?? '—'}</td>
                      <td className="px-2 py-1.5 text-right">{u.overhead_size ?? '—'}</td>
                      <td className="px-2 py-1.5 text-center">{u.position_recs ?? '—'}</td>
                      <td className="px-2 py-1.5 text-center">{u.service_recs ?? '—'}</td>
                      <td className="px-2 py-1.5 text-center">{u.message_recs ?? '—'}</td>
                      <td className="px-2 py-1.5 font-mono">{u.program_ver ?? u.version ?? '—'}</td>
                      <td className="px-2 py-1.5 font-mono whitespace-nowrap">{u.ip_addr ?? '—'}</td>
                      <td className="px-2 py-1.5 text-center">{u.ip_port ?? '—'}</td>
                      <td className="px-2 py-1.5 font-mono whitespace-nowrap">{u.pda_imei ?? '—'}</td>
                      <td className="px-2 py-1.5 text-gray-500">{u.detail ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
      )}

      {/* Běh */}
      {tab === 'service' && !loading && service !== null && (
        service.length === 0
          ? <p className="text-sm text-gray-400 py-3 text-center">Žádné záznamy běhu</p>
          : <div className="overflow-x-auto rounded-lg border border-gray-200 max-h-96 overflow-y-auto">
              <table className="text-xs border-collapse" style={{ minWidth: '1400px' }}>
                <thead className="sticky top-0 bg-gray-50 z-10">
                  <tr className="text-left text-gray-500 border-b border-gray-200">
                    {['Čas','Řidič','GPS','Město','Typ','PDA','TM','Model PDA','Root','Instalace','GPS fix','Sat','Alt(m)','Data','Roaming','Signál','Paměť','Log','APN','RstGSM','Bez nap.','Bat %','Bat °C','Doze','BT MAC']
                      .map(h => <th key={h} className="px-2 py-2 font-medium whitespace-nowrap">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {service.map((row: any) => {
                    const d = (row.descr ?? '').split(':')
                    const c = (v: string | undefined) => v?.trim() || '—'
                    return (
                      <tr key={row.service_key} className="hover:bg-gray-50">
                        <td className="px-2 py-1.5 whitespace-nowrap text-gray-700">{FMT_DT(row.time)}</td>
                        <td className="px-2 py-1.5 whitespace-nowrap">{row.driver_name ?? '—'}</td>
                        <td className="px-2 py-1.5 whitespace-nowrap font-mono text-gray-500">{c(row.pos_gps)}</td>
                        <td className="px-2 py-1.5 whitespace-nowrap">{c(row.city_name)}</td>
                        <td className="px-2 py-1.5 whitespace-nowrap text-center">{c(row.type)}</td>
                        <td className="px-2 py-1.5 text-center">{row.price != null ? Math.round(row.price) : '—'}</td>
                        <td className="px-2 py-1.5 text-center">{row.liter != null ? Math.round(row.liter) : '—'}</td>
                        <td className="px-2 py-1.5 whitespace-nowrap">{c(d[0])}</td>
                        <td className="px-2 py-1.5 text-center">{c(d[1])}</td>
                        <td className="px-2 py-1.5 text-center">{c(d[2])}</td>
                        <td className="px-2 py-1.5 text-center">{c(d[3])}</td>
                        <td className="px-2 py-1.5 text-center">{c(d[4])}</td>
                        <td className="px-2 py-1.5 text-center">{c(d[5])}</td>
                        <td className="px-2 py-1.5 text-center">{c(d[6])}</td>
                        <td className="px-2 py-1.5 text-center">{c(d[7])}</td>
                        <td className="px-2 py-1.5 text-center">{c(d[8])}</td>
                        <td className="px-2 py-1.5 text-center">{c(d[9])}</td>
                        <td className="px-2 py-1.5 text-center">{c(d[10])}</td>
                        <td className="px-2 py-1.5 whitespace-nowrap">{c(d[11])}</td>
                        <td className="px-2 py-1.5 text-center">{c(d[12])}</td>
                        <td className="px-2 py-1.5 text-center">{c(d[13])}</td>
                        <td className="px-2 py-1.5 text-center">{c(d[14])}</td>
                        <td className="px-2 py-1.5 text-center">{c(d[15])}</td>
                        <td className="px-2 py-1.5 text-center">{c(d[16])}</td>
                        <td className="px-2 py-1.5 font-mono whitespace-nowrap">{c(d[17])}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
      )}
    </div>
  )
}

interface SimRowProps {
  sim: SimCard; companyKey: string; tariffs: { tariff: string; name: string }[]
  onUpdated: (s: SimCard) => void; onDeleted: (imsi: string) => void
  highlighted?: boolean
  onGoToVehicle?: (carKey: number) => void
}

const SimRow = ({ sim: s, companyKey, tariffs, onUpdated, onDeleted, highlighted, onGoToVehicle }: SimRowProps) => {
  const [form, setForm] = useState<SimFormData>(simToForm(s))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [logTab, setLogTab] = useState<'uploads' | 'service' | null>(null)

  const dirty = JSON.stringify(form) !== JSON.stringify(simToForm(s))

  const handleSave = async () => {
    setSaving(true); setError('')
    try {
      await updateSimcard(companyKey, s.imsi, form)
      onUpdated({ ...s, ...form })
    } catch (e: any) { setError(e.message) }
    finally { setSaving(false) }
  }

  const handleDelete = async () => {
    setSaving(true)
    try {
      await deleteSimcard(companyKey, s.imsi)
      onDeleted(s.imsi)
    } catch (e: any) { setError(e.message); setSaving(false) }
  }

  const toggleLog = () => setLogTab(cur => (cur === null ? 'uploads' : null))

  const inp = 'border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-[#0a6b6b] focus:border-[#0a6b6b] bg-white'

  return (
    <div id={`sim-${s.imsi}`} className={`border rounded-lg px-3 py-2 border-gray-200 bg-white transition-shadow ${highlighted ? 'ring-2 ring-[#0a6b6b] shadow-md' : ''}`}>
      {error && <div className="mb-1.5 text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1">{error}</div>}
      <div className="flex flex-wrap items-center gap-2">
        <input className={inp + ' w-36 font-mono'} value={form.number} placeholder="Tel. číslo"
          onChange={e => setForm(f => ({ ...f, number: e.target.value }))} />
        <input className={inp + ' w-44 font-mono text-xs'} value={form.imsi} placeholder="IMSI"
          onChange={e => setForm(f => ({ ...f, imsi: e.target.value }))} />
        <input className={inp + ' w-56 font-mono text-xs'} placeholder="Sériové číslo" value={form.serial_number ?? ''}
          onChange={e => setForm(f => ({ ...f, serial_number: e.target.value || null }))} />
        <input className={inp + ' w-20'} type="number" step="0.01" placeholder="Cena" value={form.price ?? ''}
          onChange={e => { const n = e.target.value === '' ? null : parseFloat(e.target.value); setForm(f => ({ ...f, price: isNaN(n as number) ? null : n })) }} />
        <label className="flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer select-none">
          <input type="checkbox" className="w-4 h-4 rounded border-gray-300 text-[#0a6b6b] focus:ring-[#0a6b6b]"
            checked={form.our_sim} onChange={e => setForm(f => ({ ...f, our_sim: e.target.checked }))} />
          Naše
        </label>
        <button
          onClick={toggleLog}
          title="Zobrazit/skrýt logy (přenosy a běh TM)"
          className={`px-2 py-1 rounded text-xs font-medium transition-colors ${logTab !== null ? 'bg-[#0a6b6b] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
        >
          Logy
        </button>
        {s.spz && s.car_key != null ? (
          <button
            onClick={() => onGoToVehicle?.(s.car_key!)}
            title={`Přejít na vozidlo ${s.spz}`}
            className="inline-flex items-center rounded-full bg-blue-100 text-blue-700 px-2 py-0.5 text-xs font-medium hover:bg-blue-200 transition-colors"
          >
            {s.spz}
          </button>
        ) : s.spz ? (
          <Badge color="blue">{s.spz}</Badge>
        ) : null}
        {s.ie_disabled && <Badge color="red">IE off</Badge>}
        <div className="flex items-center gap-1 ml-auto">
          {dirty && (
            <button onClick={handleSave} disabled={saving}
              className="px-2.5 py-1 rounded bg-[#0a6b6b] text-white text-xs font-medium hover:bg-[#0d8080] disabled:opacity-50">
              {saving ? '…' : 'Uložit'}
            </button>
          )}
          {confirmDelete ? (
            <>
              <span className="text-xs text-red-600">Opravdu?</span>
              <button onClick={handleDelete} className="px-2 py-1 rounded bg-red-600 text-white text-xs hover:bg-red-700">Smazat</button>
              <button onClick={() => setConfirmDelete(false)} className="px-2 py-1 rounded border border-gray-300 text-xs">Ne</button>
            </>
          ) : (
            <button onClick={() => setConfirmDelete(true)} title="Smazat SIM"
              className="p-1 rounded text-gray-300 hover:text-red-600 hover:bg-red-50 transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3M4 7h16" />
              </svg>
            </button>
          )}
        </div>
      </div>
      {logTab && <SimLog companyKey={companyKey} imsi={s.imsi} initialTab={logTab} />}
    </div>
  )
}

interface NewSimFormProps {
  companyKey: string; tariffs: { tariff: string; name: string }[]
  onAdded: (s: SimCard) => void; onCancel: () => void
}

const NewSimForm = ({ companyKey, tariffs, onAdded, onCancel }: NewSimFormProps) => {
  const [form, setForm] = useState<SimFormData>(emptySimForm())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async () => {
    setSaving(true); setError('')
    try {
      await addSimcard(companyKey, form)
      onAdded({ ...form, tariff_name: tariffs.find(t => t.tariff === form.tariff)?.name } as SimCard)
    } catch (e: any) { setError(e.message) }
    finally { setSaving(false) }
  }

  return (
    <div className="border-2 border-dashed border-[#0a6b6b] rounded-xl px-4 py-3">
      <span className="font-medium text-sm text-[#0a6b6b]">Nová SIM karta</span>
      {error && <div className="text-sm text-red-600 mt-1">{error}</div>}
      <SimEditForm form={form} saving={saving} isNew={true} tariffs={tariffs}
        onChange={p => setForm(f => ({ ...f, ...p }))}
        onSave={handleSave} onCancel={onCancel} />
    </div>
  )
}

const Section = ({ title, k, current, count, onClick }: {
  title: string; k: string; current: string; count: number; onClick: () => void
}) => (
  <button
    onClick={onClick}
    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
      current === k ? 'bg-[#0a6b6b] text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
    }`}
  >
    {title} <span className={`ml-1 text-xs rounded-full px-1.5 py-0.5 ${current === k ? 'bg-[#0d8080]' : 'bg-white text-gray-500'}`}>{count}</span>
  </button>
)

export const TabVehicles = ({ companyKey }: Props) => {
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [simcards, setSimcards] = useState<SimCard[]>([])
  const [persons, setPersons] = useState<{ person_key: number; name: string }[]>([])
  const [tariffs, setTariffs] = useState<{ tariff: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeSection, setActiveSection] = useState<'vehicles' | 'drivers' | 'sims'>('vehicles')
  const [highlight, setHighlight] = useState<string | null>(null) // imsi nebo car_key pro zvýraznění
  const [showInactive, setShowInactive] = useState(false)
  const [addingNew, setAddingNew] = useState(false)
  const [showInactiveDrivers, setShowInactiveDrivers] = useState(false)
  const [addingNewDriver, setAddingNewDriver] = useState(false)
  const [addingNewSim, setAddingNewSim] = useState(false)

  useEffect(() => {
    Promise.all([
      getVehicles(companyKey),
      getDrivers(companyKey),
      getSimcards(companyKey),
      getSimcardTariffs(companyKey),
      getContacts(companyKey).then(c => c?.persons ?? []).catch(() => []),
    ]).then(([v, d, s, t, p]) => {
      setVehicles(v)
      setDrivers(d)
      setSimcards(s)
      setTariffs(t)
      setPersons(p)
    }).catch(e => setError(e.message))
    .finally(() => setLoading(false))
  }, [companyKey])

  if (loading) return <div className="flex justify-center py-12"><Spinner size={8} /></div>

  const activeVehicles = vehicles.filter(v => v.active)
  const inactiveVehicles = vehicles.filter(v => !v.active)
  const activeDrivers = drivers.filter(d => d.active)
  const inactiveDrivers = drivers.filter(d => !d.active)

  // proklik vozidlo → SIM (přepne na SIM karty a zvýrazní danou SIM)
  const goToSim = (imsi: string) => {
    setActiveSection('sims')
    setHighlight(imsi)
    setTimeout(() => {
      document.getElementById(`sim-${imsi}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 50)
  }
  // proklik SIM → vozidlo (přepne na Vozidla a zvýrazní auto s touto SIM)
  const goToVehicle = (carKey: number | null | undefined) => {
    if (carKey == null) return
    const v = vehicles.find(x => x.car_key === carKey)
    if (v && !v.active) setShowInactive(true)
    setActiveSection('vehicles')
    setHighlight(String(carKey))
    setTimeout(() => {
      document.getElementById(`car-${carKey}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 50)
  }

  return (
    <div>
      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm mb-4">{error}</div>}

      {/* Section switcher */}
      <div className="flex gap-2 mb-5 flex-wrap">
        <Section title="Vozidla" k="vehicles" current={activeSection} count={activeVehicles.length} onClick={() => setActiveSection('vehicles')} />
        <Section title="Řidiči" k="drivers" current={activeSection} count={activeDrivers.length} onClick={() => setActiveSection('drivers')} />
        <Section title="SIM karty" k="sims" current={activeSection} count={simcards.length} onClick={() => setActiveSection('sims')} />
      </div>

      {/* ── Vehicles ────────────────────────────────────────────────── */}
      {activeSection === 'vehicles' && (
        <div className="space-y-3">
          {/* Add button */}
          {!addingNew && (
            <button
              onClick={() => setAddingNew(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-[#0a6b6b] text-[#0a6b6b] text-sm hover:bg-teal-50 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Přidat vozidlo
            </button>
          )}

          {addingNew && (
            <NewVehicleForm
              companyKey={companyKey}
              drivers={drivers}
              simcards={simcards}
              onAdded={v => { setVehicles(vs => [v, ...vs]); setAddingNew(false) }}
              onCancel={() => setAddingNew(false)}
            />
          )}

          {/* Active vehicles */}
          {activeVehicles.length === 0 && !addingNew && (
            <p className="text-sm text-gray-400 py-6 text-center">Žádná aktivní vozidla</p>
          )}
          {activeVehicles.map(v => (
            <VehicleRow
              key={v.car_key}
              vehicle={v}
              drivers={drivers}
              simcards={simcards}
              persons={persons}
              companyKey={companyKey}
              highlighted={highlight === String(v.car_key)}
              onGoToSim={goToSim}
              onUpdated={updated => setVehicles(vs => vs.map(x => x.car_key === updated.car_key ? updated : x))}
              onDeleted={key => setVehicles(vs => vs.filter(x => x.car_key !== key))}
            />
          ))}

          {/* Inactive vehicles */}
          {inactiveVehicles.length > 0 && (
            <div className="mt-2">
              <button
                onClick={() => setShowInactive(s => !s)}
                className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 py-1"
              >
                <svg className={`w-4 h-4 transition-transform ${showInactive ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                Neaktivní vozidla ({inactiveVehicles.length})
              </button>
              {showInactive && (
                <div className="mt-2 space-y-2">
                  {inactiveVehicles.map(v => (
                    <VehicleRow
                      key={v.car_key}
                      vehicle={v}
                      drivers={drivers}
                      simcards={simcards}
                      persons={persons}
                      companyKey={companyKey}
                      highlighted={highlight === String(v.car_key)}
                      onGoToSim={goToSim}
                      onUpdated={updated => setVehicles(vs => vs.map(x => x.car_key === updated.car_key ? updated : x))}
                      onDeleted={key => setVehicles(vs => vs.filter(x => x.car_key !== key))}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Drivers ─────────────────────────────────────────────────── */}
      {activeSection === 'drivers' && (
        <div className="space-y-3">
          {!addingNewDriver && (
            <button onClick={() => setAddingNewDriver(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-[#0a6b6b] text-[#0a6b6b] text-sm hover:bg-teal-50 transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              Přidat řidiče
            </button>
          )}
          {addingNewDriver && (
            <NewDriverForm companyKey={companyKey}
              onAdded={d => { setDrivers(ds => [d, ...ds]); setAddingNewDriver(false) }}
              onCancel={() => setAddingNewDriver(false)} />
          )}
          {activeDrivers.length === 0 && !addingNewDriver && (
            <p className="text-sm text-gray-400 py-6 text-center">Žádní aktivní řidiči</p>
          )}
          {activeDrivers.map(d => (
            <DriverRow key={d.driver_key} driver={d} companyKey={companyKey}
              onUpdated={upd => setDrivers(ds => ds.map(x => x.driver_key === upd.driver_key ? upd : x))}
              onDeleted={key => setDrivers(ds => ds.filter(x => x.driver_key !== key))} />
          ))}
          {inactiveDrivers.length > 0 && (
            <div className="mt-3">
              <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-2">Neaktivní ({inactiveDrivers.length})</p>
              <div className="space-y-2">
                {inactiveDrivers.map(d => (
                  <DriverRow key={d.driver_key} driver={d} companyKey={companyKey}
                    onUpdated={upd => setDrivers(ds => ds.map(x => x.driver_key === upd.driver_key ? upd : x))}
                    onDeleted={key => setDrivers(ds => ds.filter(x => x.driver_key !== key))} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── SIM cards ───────────────────────────────────────────────── */}
      {activeSection === 'sims' && (
        <div className="space-y-3">
          {!addingNewSim && (
            <button onClick={() => setAddingNewSim(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-[#0a6b6b] text-[#0a6b6b] text-sm hover:bg-teal-50 transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              Přidat SIM kartu
            </button>
          )}
          {addingNewSim && (
            <NewSimForm companyKey={companyKey} tariffs={tariffs}
              onAdded={s => { setSimcards(ss => [...ss, s]); setAddingNewSim(false) }}
              onCancel={() => setAddingNewSim(false)} />
          )}
          {simcards.length === 0 && !addingNewSim && (
            <p className="text-sm text-gray-400 py-6 text-center">Žádné SIM karty</p>
          )}
          {simcards.map(s => (
            <SimRow key={s.imsi} sim={s} companyKey={companyKey} tariffs={tariffs}
              highlighted={highlight === s.imsi}
              onGoToVehicle={goToVehicle}
              onUpdated={upd => setSimcards(ss => ss.map(x => x.imsi === upd.imsi ? upd : x))}
              onDeleted={imsi => setSimcards(ss => ss.filter(x => x.imsi !== imsi))} />
          ))}
        </div>
      )}
    </div>
  )
}
