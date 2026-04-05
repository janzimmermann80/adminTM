import { useState, useEffect } from 'react'
import { getVehicles, getDrivers, getSimcards, addVehicle, updateVehicle, deleteVehicle, addDriver, updateDriver, deleteDriver, getSimcardTariffs, addSimcard, updateSimcard, deleteSimcard, getSimcardUploadLog, getSimcardServiceData } from '../../api'
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
  companyKey: string
  onUpdated: (v: Vehicle) => void
  onDeleted: (carKey: number) => void
}

const VehicleRow = ({ vehicle: v, drivers, simcards, companyKey, onUpdated, onDeleted }: VehicleRowProps) => {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<FormData>(vehicleToForm(v))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const driverMap = Object.fromEntries(drivers.map(d => [d.driver_key, d.name]))
  const simMap = Object.fromEntries(simcards.map(s => [s.imsi, s.number ?? s.imsi]))

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

  return (
    <div className={`border rounded-xl px-4 py-3 ${v.active ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50'}`}>
      {/* Summary row */}
      <div className="flex items-center gap-3 cursor-pointer" onClick={() => { setOpen(o => !o); setForm(vehicleToForm(v)); setError('') }}>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${v.active ? 'bg-teal-100' : 'bg-gray-200'}`}>
          <svg className={`w-4 h-4 ${v.active ? 'text-[#0a6b6b]' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" />
          </svg>
        </div>
        <div className="flex-1 min-w-0 flex items-center gap-3 flex-wrap">
          <span className="font-bold text-gray-900 font-mono text-sm w-24 flex-shrink-0">{v.spz}</span>
          <span className="text-sm text-gray-600 w-36 truncate" title={v.driver_key ? (driverMap[v.driver_key] ?? `#${v.driver_key}`) : ''}>
            {v.driver_key ? (driverMap[v.driver_key] ?? `#${v.driver_key}`) : <span className="text-gray-300">—</span>}
          </span>
          <span className="text-sm text-gray-600 w-36 truncate hidden sm:block" title={v.driver2_key ? (driverMap[v.driver2_key] ?? `#${v.driver2_key}`) : ''}>
            {v.driver2_key ? (driverMap[v.driver2_key] ?? `#${v.driver2_key}`) : <span className="text-gray-300">—</span>}
          </span>
          <span className="text-sm text-gray-600 font-mono w-28 truncate hidden md:block">
            {v.sim_imsi ? (simMap[v.sim_imsi] ?? v.sim_imsi) : <span className="text-gray-300">—</span>}
          </span>
          <div className="flex gap-1 flex-wrap">
            {!v.active && <Badge color="red">Neaktivní</Badge>}
            {v.stazka_certified && <Badge color="green">Stažka</Badge>}
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
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<DriverFormData>(driverToForm(d))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async () => {
    setSaving(true); setError('')
    try {
      await updateDriver(companyKey, String(d.driver_key), form)
      onUpdated({ ...d, ...form })
      setOpen(false)
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

  return (
    <div className={`border rounded-xl px-4 py-3 ${d.active ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50'}`}>
      <div className="flex items-center gap-3 cursor-pointer" onClick={() => { setOpen(o => !o); setForm(driverToForm(d)); setError('') }}>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${d.active ? 'bg-teal-100' : 'bg-gray-200'}`}>
          <svg className={`w-4 h-4 ${d.active ? 'text-[#0a6b6b]' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0 flex items-center gap-3 flex-wrap">
          <span className="font-bold text-gray-900 text-sm w-40 truncate">{d.name}</span>
          <span className="text-sm text-gray-600 font-mono w-36 truncate hidden sm:block">{d.phone || <span className="text-gray-300">—</span>}</span>
          <span className="text-sm text-gray-500 hidden md:block">
            {d.wage_km != null ? `${formatNumber(d.wage_km, 2)} ${d.currency ?? 'CZK'}/km` : ''}
            {d.wage_km != null && d.wage_hourly != null ? ' · ' : ''}
            {d.wage_hourly != null ? `${formatNumber(d.wage_hourly, 2)} ${d.currency ?? 'CZK'}/h` : ''}
          </span>
          <div className="flex gap-1">
            {!d.active && <Badge color="red">Neaktivní</Badge>}
            {d.adr && <Badge color="yellow">ADR</Badge>}
          </div>
        </div>
        <svg className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>
      {error && <div className="mt-2 text-sm text-red-600">{error}</div>}
      {open && (
        <DriverEditForm form={form} saving={saving} isNew={false}
          onChange={p => setForm(f => ({ ...f, ...p }))}
          onSave={handleSave} onCancel={() => setOpen(false)} onDelete={handleDelete} />
      )}
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
          <label className={lbl}>Tarif</label>
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
        <button onClick={onSave} disabled={saving || !form.imsi.trim()}
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

interface SimLogProps { companyKey: string; imsi: string }

const SimLog = ({ companyKey, imsi }: SimLogProps) => {
  const [tab, setTab] = useState<'uploads' | 'service'>('uploads')
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

  useEffect(() => { loadUploads() }, [])

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
}

const SimRow = ({ sim: s, companyKey, tariffs, onUpdated, onDeleted }: SimRowProps) => {
  const [open, setOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [form, setForm] = useState<SimFormData>(simToForm(s))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const openEdit = (e: React.MouseEvent) => {
    e.stopPropagation()
    setForm(simToForm(s))
    setError('')
    setEditOpen(true)
  }

  const handleSave = async () => {
    setSaving(true); setError('')
    try {
      await updateSimcard(companyKey, s.imsi, form)
      onUpdated({ ...s, ...form })
      setEditOpen(false)
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

  return (
    <>
      <div className="border rounded-xl px-4 py-3 border-gray-200 bg-white">
        <div className="flex items-center gap-3">
          {/* accordion toggle — click on the info area */}
          <div className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer" onClick={() => setOpen(o => !o)}>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-teal-100">
              <svg className="w-4 h-4 text-[#0a6b6b]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0 flex items-center gap-3 flex-wrap">
              <span className="font-mono text-sm text-gray-900 w-40 truncate">{s.number || s.imsi}</span>
              <span className="font-mono text-xs text-gray-400 w-40 truncate hidden sm:block">{s.imsi}</span>
              <span className="text-sm text-gray-500 hidden md:block">{s.tariff_name ?? s.tariff ?? '—'}</span>
              {s.spz && <Badge color="blue">{s.spz}</Badge>}
              {s.our_sim && <Badge color="green">Naše SIM</Badge>}
              {s.ie_disabled && <Badge color="red">IE off</Badge>}
            </div>
            <svg className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
          {/* edit button */}
          <button onClick={openEdit} className="p-1.5 rounded-lg text-gray-400 hover:text-[#0a6b6b] hover:bg-teal-50 transition-colors flex-shrink-0" title="Upravit">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M9 11l6.586-6.586a2 2 0 112.828 2.828L11.828 13.828A2 2 0 0110 14H8v-2a2 2 0 01.586-1.414z" />
            </svg>
          </button>
        </div>
        {open && <SimLog companyKey={companyKey} imsi={s.imsi} />}
      </div>

      {/* Edit modal */}
      {editOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setEditOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">Upravit SIM — <span className="font-mono text-[#0a6b6b]">{s.number || s.imsi}</span></h2>
              <button onClick={() => setEditOpen(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="px-6 py-4">
              {error && <div className="mb-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}
              <SimEditForm form={form} saving={saving} isNew={false} tariffs={tariffs}
                onChange={p => setForm(f => ({ ...f, ...p }))}
                onSave={handleSave} onCancel={() => setEditOpen(false)} onDelete={handleDelete} />
            </div>
          </div>
        </div>
      )}
    </>
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
  const [tariffs, setTariffs] = useState<{ tariff: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeSection, setActiveSection] = useState<'vehicles' | 'drivers' | 'sims'>('vehicles')
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
    ]).then(([v, d, s, t]) => {
      setVehicles(v)
      setDrivers(d)
      setSimcards(s)
      setTariffs(t)
    }).catch(e => setError(e.message))
    .finally(() => setLoading(false))
  }, [companyKey])

  if (loading) return <div className="flex justify-center py-12"><Spinner size={8} /></div>

  const activeVehicles = vehicles.filter(v => v.active)
  const inactiveVehicles = vehicles.filter(v => !v.active)
  const activeDrivers = drivers.filter(d => d.active)
  const inactiveDrivers = drivers.filter(d => !d.active)

  return (
    <div>
      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm mb-4">{error}</div>}

      {/* Section switcher */}
      <div className="flex gap-2 mb-5 flex-wrap">
        <Section title="Vozidla" k="vehicles" current={activeSection} count={vehicles.length} onClick={() => setActiveSection('vehicles')} />
        <Section title="Řidiči" k="drivers" current={activeSection} count={drivers.length} onClick={() => setActiveSection('drivers')} />
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
              companyKey={companyKey}
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
                      companyKey={companyKey}
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
            <div className="mt-2">
              <button onClick={() => setShowInactiveDrivers(s => !s)}
                className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 py-1">
                <svg className={`w-4 h-4 transition-transform ${showInactiveDrivers ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                Neaktivní řidiči ({inactiveDrivers.length})
              </button>
              {showInactiveDrivers && (
                <div className="mt-2 space-y-2">
                  {inactiveDrivers.map(d => (
                    <DriverRow key={d.driver_key} driver={d} companyKey={companyKey}
                      onUpdated={upd => setDrivers(ds => ds.map(x => x.driver_key === upd.driver_key ? upd : x))}
                      onDeleted={key => setDrivers(ds => ds.filter(x => x.driver_key !== key))} />
                  ))}
                </div>
              )}
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
              onUpdated={upd => setSimcards(ss => ss.map(x => x.imsi === upd.imsi ? upd : x))}
              onDeleted={imsi => setSimcards(ss => ss.filter(x => x.imsi !== imsi))} />
          ))}
        </div>
      )}
    </div>
  )
}
