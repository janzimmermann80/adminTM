import { useState, useEffect } from 'react'
import { getVehicles, getDrivers, getSimcards } from '../../api'
import { Spinner } from '../../components/Spinner'
import { formatNumber } from '../../utils'
import type { Vehicle, Driver, SimCard } from '../../types'

interface Props { companyKey: string }

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

export const TabVehicles = ({ companyKey }: Props) => {
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [simcards, setSimcards] = useState<SimCard[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeSection, setActiveSection] = useState<'vehicles' | 'drivers' | 'sims'>('vehicles')

  useEffect(() => {
    Promise.all([
      getVehicles(companyKey),
      getDrivers(companyKey),
      getSimcards(companyKey),
    ]).then(([v, d, s]) => {
      setVehicles(v)
      setDrivers(d)
      setSimcards(s)
    }).catch(e => setError(e.message))
    .finally(() => setLoading(false))
  }, [companyKey])

  if (loading) return <div className="flex justify-center py-12"><Spinner size={8} /></div>

  const activeVehicles = vehicles.filter(v => v.active)
  const inactiveVehicles = vehicles.filter(v => !v.active)
  const activeDrivers = drivers.filter(d => d.active)
  const inactiveDrivers = drivers.filter(d => !d.active)

  const driverMap = Object.fromEntries(drivers.map(d => [d.driver_key, d.name]))

  const Section = ({ title, count, k }: { title: string; count: number; k: typeof activeSection }) => (
    <button
      onClick={() => setActiveSection(k)}
      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
        activeSection === k ? 'bg-[#0a6b6b] text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
      }`}
    >
      {title} <span className={`ml-1 text-xs rounded-full px-1.5 py-0.5 ${activeSection === k ? 'bg-[#0d8080]' : 'bg-white text-gray-500'}`}>{count}</span>
    </button>
  )

  return (
    <div>
      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm mb-4">{error}</div>}

      {/* Section switcher */}
      <div className="flex gap-2 mb-5 flex-wrap">
        <Section title="Vozidla" count={vehicles.length} k="vehicles" />
        <Section title="Řidiči" count={drivers.length} k="drivers" />
        <Section title="SIM karty" count={simcards.length} k="sims" />
      </div>

      {/* ── Vehicles ────────────────────────────────────────────────── */}
      {activeSection === 'vehicles' && (
        <div className="space-y-3">
          {vehicles.length === 0 && <p className="text-sm text-gray-400 py-6 text-center">Žádná vozidla</p>}
          {[...activeVehicles, ...inactiveVehicles].map(v => (
            <div key={v.car_key}
              className={`border rounded-xl p-4 ${v.active ? 'border-gray-200' : 'border-gray-100 bg-gray-50 opacity-70'}`}>
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${v.active ? 'bg-teal-100' : 'bg-gray-200'}`}>
                    <svg className={`w-5 h-5 ${v.active ? 'text-[#0a6b6b]' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                        d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                        d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" />
                    </svg>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-gray-900 font-mono">{v.spz}</span>
                      {!v.active && <Badge color="red">Neaktivní</Badge>}
                      {v.stazka_certified && <Badge color="green">Stažka</Badge>}
                      {v.export_allowed && <Badge color="blue">Export</Badge>}
                    </div>
                    <span className="text-sm text-gray-500">{v.make}</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-3 text-sm text-gray-600">
                  {v.tonnage && <div><span className="text-xs text-gray-400">Nosnost</span><br />{formatNumber(v.tonnage, 1)} t</div>}
                  {v.capacity && <div><span className="text-xs text-gray-400">Objem</span><br />{formatNumber(v.capacity, 1)} m³</div>}
                  {v.axles && <div><span className="text-xs text-gray-400">Nápravy</span><br />{v.axles}</div>}
                  {v.euro_emission && <div><span className="text-xs text-gray-400">Euro</span><br />{v.euro_emission}</div>}
                  {v.production_year && <div><span className="text-xs text-gray-400">Rok</span><br />{v.production_year}</div>}
                </div>
              </div>
              {/* Driver & SIM info */}
              <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap gap-4 text-sm">
                {v.driver_key && <span className="text-gray-500">
                  <svg className="w-3.5 h-3.5 inline mr-1 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  {driverMap[v.driver_key] ?? `Řidič #${v.driver_key}`}
                </span>}
                {v.sim_imsi && <span className="text-gray-500 font-mono text-xs">
                  <svg className="w-3.5 h-3.5 inline mr-1 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                  {v.sim_imsi}
                </span>}
                {v.home_stand_name && <span className="text-gray-500">
                  <svg className="w-3.5 h-3.5 inline mr-1 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  {v.home_stand_name} {v.home_stand_zip}
                </span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Drivers ─────────────────────────────────────────────────── */}
      {activeSection === 'drivers' && (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wide">
                <th className="px-4 py-3 font-medium">Jméno</th>
                <th className="px-4 py-3 font-medium">Telefon</th>
                <th className="px-4 py-3 font-medium hidden md:table-cell">ADR</th>
                <th className="px-4 py-3 font-medium hidden md:table-cell">Mzda/km</th>
                <th className="px-4 py-3 font-medium hidden md:table-cell">Mzda/hod</th>
                <th className="px-4 py-3 font-medium">Stav</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {drivers.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400">Žádní řidiči</td></tr>
              )}
              {[...activeDrivers, ...inactiveDrivers].map(d => (
                <tr key={d.driver_key} className={`hover:bg-gray-50 ${!d.active ? 'opacity-60' : ''}`}>
                  <td className="px-4 py-3 font-medium text-gray-900">{d.name}</td>
                  <td className="px-4 py-3 text-gray-600 font-mono text-xs">{d.phone}</td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    {d.adr && <Badge color="yellow">ADR</Badge>}
                  </td>
                  <td className="px-4 py-3 text-gray-600 hidden md:table-cell">
                    {d.wage_km != null ? `${formatNumber(d.wage_km)} ${d.currency ?? 'Kč'}/km` : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-600 hidden md:table-cell">
                    {d.wage_hourly != null ? `${formatNumber(d.wage_hourly)} ${d.currency ?? 'Kč'}/h` : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <Badge color={d.active ? 'green' : 'red'}>{d.active ? 'Aktivní' : 'Neaktivní'}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── SIM cards ───────────────────────────────────────────────── */}
      {activeSection === 'sims' && (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wide">
                <th className="px-4 py-3 font-medium">IMSI</th>
                <th className="px-4 py-3 font-medium">Číslo</th>
                <th className="px-4 py-3 font-medium hidden md:table-cell">Tarif</th>
                <th className="px-4 py-3 font-medium hidden md:table-cell">Cena</th>
                <th className="px-4 py-3 font-medium hidden lg:table-cell">SPZ</th>
                <th className="px-4 py-3 font-medium">Stav</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {simcards.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400">Žádné SIM karty</td></tr>
              )}
              {simcards.map(s => (
                <tr key={s.imsi} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">{s.imsi}</td>
                  <td className="px-4 py-3 font-mono text-xs">{s.number}</td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className="text-xs text-gray-500">{s.tariff_name ?? s.tariff}</span>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell text-gray-600">
                    {s.price != null ? `${formatNumber(s.price)} Kč` : '—'}
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell font-mono text-xs text-gray-500">{s.spz ?? '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 flex-wrap">
                      {s.our_sim && <Badge color="blue">Naše SIM</Badge>}
                      {s.ie_disabled && <Badge color="red">IE off</Badge>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
