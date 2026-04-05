export interface User {
  initials: string
  name: string
  employeeSchema: string
  accessRights: string
  provider: string
  region: string
}

export interface Company {
  company_key: number
  id: string
  company: string
  street: string
  city: string
  zip: string
  country: string
  region: string
  tariff: string
  tariff_name?: string
  cin: string
  last_modif: string
}

export interface CompanyDetail extends Company {
  tin: string
  bank: string
  account: string
  branch: string
  branch_name?: string
  url?: string
  provider: string
  parent_key?: number
  credit_tip_sms?: number
  contract?: string
  contract_date?: string
  prog_sent?: string
  prog_sent_date?: string
  prog_lent?: string
  prog_lent_date?: string
  admittance?: string
  admittance_date?: string
  forwarding?: string
  forwarding_date?: string
  car_pool?: string
  car_pool_date?: string
  claim_exchange?: string
  advert_discount?: number
  show_date?: string
  send_emails_from_their_domain?: boolean
  invoice_company?: string
  invoice_street?: string
  invoice_city?: string
  invoice_zip?: string
  invoice_country?: string
}

export interface ContactPerson {
  person_key: number
  importance: number
  name: string
  sex: string
  languages: string[]
  send_offers: boolean
}

export interface Contact {
  contact_key: number
  importance: number
  type: string
  value: string
  send_tips: boolean
  by_name: boolean
  local_tips: boolean
  forward_tm: boolean
}

export interface UserAccount {
  username: string
  password: string
}

export interface Invoice {
  invoice_key: number
  year: number
  number: number
  series: string
  issued: string
  fulfilment: string
  maturity: string
  settlement?: string
  cancellation?: string
  price: number
  total: number
  curr_price?: number
  curr_total?: number
  currency: string
  demand_notes?: number
  rate?: number
  proforma_number?: number
  id: string
}

export interface Vehicle {
  car_key: number
  spz: string
  make: string
  active: boolean
  type?: string | null
  color?: string | null
  production_year?: number | null
  vin?: string | null
  tonnage?: number | null
  capacity?: number | null
  axles?: number | null
  euro_emission?: string | null
  length?: number | null
  width?: number | null
  height?: number | null
  engine_power?: number | null
  tank_volume?: number | null
  consumption_avg?: number | null
  adr?: number | null
  description?: string | null
  sim_imsi?: string | null
  export_allowed?: boolean
  export_requested?: boolean
  driver_key?: number | null
  driver2_key?: number | null
  stazka_certified?: boolean
  home_stand_key?: number | null
  home_stand_name?: string | null
  home_stand_zip?: string | null
  home_stand_country?: string | null
}

export interface Driver {
  driver_key: number
  name: string
  phone: string
  adr?: boolean
  active: boolean
  wage_hourly?: number
  wage_km?: number
  currency?: string
  expenses?: string
}

export interface SimCard {
  imsi: string
  number: string
  tariff: string | null
  tariff_name?: string | null
  price?: number | null
  our_sim?: boolean
  ie_disabled?: boolean
  serial_number?: string | null
  upload_home?: number | null
  upload_abroad1?: number | null
  upload_abroad2?: number | null
  spz?: string | null
  car_key?: number | null
}

export interface Note {
  note_key: number
  creator: string
  creation_date: string
  type: string
  text: string
}

export interface DiaryEntry {
  diary_key: number
  company_key?: number
  company_name?: string
  owner: string
  originator?: string
  time: string
  text: string
  completed?: string
  alarm?: boolean
}

export interface OnlineLog {
  action: string
  time: string
  detail?: string
}

export interface SearchResult {
  total: number
  limit: number
  offset: number
  data: Company[]
}

export interface SearchMeta {
  tariffs: { tariff: string; name: string }[]
  branches: { branch: string; name: string }[]
}

export const CONTACT_TYPE_LABELS: Record<string, string> = {
  T: 'Telefon',
  G: 'Mobil',
  F: 'Fax',
  E: 'E-mail',
  I: 'Internet',
  U: 'Uživatel',
  S: 'Servisní',
  C: 'Reklamace',
}

export const INVOICE_SERIES_LABELS: Record<string, string> = {
  '1': 'Spedice',
  '2': 'Modem Euro',
  '3': 'Modem CZ',
  '4': 'TM+SIM',
  '6': 'Hardware',
  '7': 'SMS',
  '8': 'Doprava',
  '9': 'Reklama',
}
