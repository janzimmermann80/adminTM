const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? '/api'

// Pokud API_BASE je proxy (proxy.php), sestavíme URL jako ?path=/auth/login
// Jinak normálně: /api/auth/login
const buildUrl = (path: string) =>
  API_BASE.includes('proxy.php')
    ? `${API_BASE}?path=${encodeURIComponent(path)}`
    : API_BASE + path

const getToken = () => localStorage.getItem('token') ?? ''

const h = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${getToken()}`,
})

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const r = await fetch(buildUrl(url), { headers: h(), ...options })
  if (r.status === 401) {
    localStorage.removeItem('token')
    window.location.hash = '#/login'
    throw new Error('Unauthorized')
  }
  if (!r.ok) {
    const text = await r.text()
    let msg = text
    try { msg = JSON.parse(text).error ?? text } catch {}
    throw new Error(msg)
  }
  return r.json()
}

const get = <T>(url: string) => request<T>(url)
const post = <T>(url: string, body: unknown) =>
  request<T>(url, { method: 'POST', body: JSON.stringify(body) })
const put = <T>(url: string, body: unknown) =>
  request<T>(url, { method: 'PUT', body: JSON.stringify(body) })
const del = <T>(url: string) => request<T>(url, { method: 'DELETE' })

// ── Auth ─────────────────────────────────────────────────────────────────────

export const login = (username: string, password: string) =>
  post<{ token: string; user: any }>('/auth/login', { username, password })

export const getMe = () => get<any>('/auth/me')

// ── Search ───────────────────────────────────────────────────────────────────

export const getSearchMeta = () => get<{ tariffs: any[]; branches: any[] }>('/search/meta')

export const search = (params: Record<string, string | number | undefined>) => {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') qs.set(k, String(v))
  }
  return get<{ total: number; limit: number; offset: number; data: any[] }>(`/search?${qs}`)
}

export const exportCsv = (keys: number[]) =>
  fetch(buildUrl('/search/export'), {
    method: 'POST',
    headers: h(),
    body: JSON.stringify({ keys }),
  })

// ── Statistics ────────────────────────────────────────────────────────────────

export const getStatsOverview = () => get<any>('/statistics/overview')
export const getStatsInvoicesMonthly = (year?: number) =>
  get<any[]>(`/statistics/invoices-monthly${year ? `?year=${year}` : ''}`)
export const getStatsContractsMonthly = (year?: number) =>
  get<any[]>(`/statistics/contracts-monthly${year ? `?year=${year}` : ''}`)
export const getStatsClaims = () => get<any[]>('/statistics/claims')
export const getStatsExpiredAccess = () => get<any[]>('/statistics/expired-access')
export const getStatsOverdueCompanies = (region?: string) =>
  get<any[]>(`/statistics/overdue-companies${region ? `?region=${encodeURIComponent(region)}` : ''}`)
export const getStatsDiaryByOwner = () => get<any[]>('/statistics/diary-by-owner')
export const getStatsLentMonthly = () => get<any[]>('/statistics/lent-monthly')
export const getStatsOrdersMonthly = () => get<any[]>('/statistics/orders-monthly')
export const getStatsLentAccessStats = () => get<any>('/statistics/lent-access-stats')
export const getStatsOrderBaseMonthly   = () => get<any[]>('/statistics/order-base-monthly')
export const getStatsInvoiceBaseMonthly = () => get<any[]>('/statistics/invoice-base-monthly')
export const getDiaryUpcoming = (initials: string) =>
  get<any>(`/diary?owner=${encodeURIComponent(initials)}&days=14`)

// ── Companies ─────────────────────────────────────────────────────────────────

export const getCompany = (id: string) => get<any>(`/companies/${id}`)
export const getCompanySummary = (id: string) => get<any>(`/companies/${id}/summary`)
export const updateCompany = (id: string, body: Record<string, any>) => put<any>(`/companies/${id}`, body)
export const updateServices = (id: string, body: Record<string, any>) => put<any>(`/companies/${id}/services`, body)
export const updateInvoiceAddress = (id: string, body: Record<string, any>) =>
  put<any>(`/companies/${id}/invoice-address`, body)

// contacts
export const getContacts = (id: string) => get<{ persons: any[]; contacts: any[]; userAccounts: any[] }>(`/companies/${id}/contacts`)
export const addPerson = (id: string, body: Record<string, any>) => post<any>(`/companies/${id}/contacts/persons`, body)
export const updatePerson = (id: string, pid: string, body: Record<string, any>) =>
  put<any>(`/companies/${id}/contacts/persons/${pid}`, body)
export const deletePerson = (id: string, pid: string) => del<any>(`/companies/${id}/contacts/persons/${pid}`)
export const addContact = (id: string, body: Record<string, any>) => post<any>(`/companies/${id}/contacts`, body)
export const updateContact = (id: string, cid: string, body: Record<string, any>) =>
  put<any>(`/companies/${id}/contacts/${cid}`, body)
export const deleteContact = (id: string, cid: string) => del<any>(`/companies/${id}/contacts/${cid}`)
export const upsertUserAccount = (id: string, body: Record<string, any>) => put<any>(`/companies/${id}/user-account`, body)

// invoices
export const getInvoices = (id: string, offset = 0, limit = 10) =>
  get<{ total: number; data: any[] }>(`/companies/${id}/invoices?limit=${limit}&offset=${offset}`)
export const getInvoiceDetail = (id: string) => get<any>(`/invoicing/${id}`)
export const getInvoiceEmailContacts = (id: string) => get<string[]>(`/invoicing/${id}/email-contacts`)
export const sendInvoiceEmail = (id: string, body: { to: string; cc?: string; subject: string; body: string }) =>
  post<{ ok: boolean }>(`/invoicing/${id}/send-email`, body)
export const settleInvoice = (id: string, date?: string) =>
  put<{ success: boolean }>(`/invoicing/${id}/settle`, { date })
export const cancelInvoice = (id: string) =>
  put<{ success: boolean }>(`/invoicing/${id}/cancel`, {})
export const deleteInvoice = (id: string) =>
  del<{ success: boolean }>(`/invoicing/${id}`)
export const getInvoicingMeta = () =>
  get<{ series: Record<string, string>; payment_methods: Record<string, string> }>('/invoicing/meta')
export const getInvoicingServices = () => get<any[]>('/invoicing/services')
export const updateInvoice = (id: string, body: any) => put<any>(`/invoicing/${id}`, body)
export const createInvoiceSingle = (body: any) => post<any>('/invoicing/create', body)

export const downloadInvoicePdf = async (id: string): Promise<Blob> => {
  const r = await fetch(buildUrl(`/invoicing/${id}/pdf`), { headers: h() })
  if (!r.ok) throw new Error('PDF se nepodařilo vygenerovat')
  return r.blob()
}

// vehicles
export const getVehicles = (id: string) => get<any[]>(`/companies/${id}/vehicles`)
export const addVehicle = (id: string, body: Record<string, any>) => post<any>(`/companies/${id}/vehicles`, body)
export const updateVehicle = (id: string, vid: string, body: Record<string, any>) =>
  put<any>(`/companies/${id}/vehicles/${vid}`, body)

// drivers
export const getDrivers = (id: string) => get<any[]>(`/companies/${id}/drivers`)
export const addDriver = (id: string, body: Record<string, any>) => post<any>(`/companies/${id}/drivers`, body)
export const updateDriver = (id: string, did: string, body: Record<string, any>) =>
  put<any>(`/companies/${id}/drivers/${did}`, body)
export const deleteDriver = (id: string, did: string) => del<any>(`/companies/${id}/drivers/${did}`)

// simcards
export const getSimcards = (id: string) => get<any[]>(`/companies/${id}/simcards`)
export const getSimcardTariffs = (id: string) => get<any[]>(`/companies/${id}/simcard-tariffs`)

// notes
export const getNotes = (id: string) => get<any[]>(`/companies/${id}/notes`)
export const addNote = (id: string, body: Record<string, any>) => post<any>(`/companies/${id}/notes`, body)
export const updateNote = (id: string, nid: string, body: Record<string, any>) =>
  put<any>(`/companies/${id}/notes/${nid}`, body)
export const deleteNote = (id: string, nid: string) => del<any>(`/companies/${id}/notes/${nid}`)

// online log
export const getOnlineLog = (id: string) => get<any[]>(`/companies/${id}/online-log`)

// diary
export const getDiary = (companyKey: string) =>
  get<{ data: any[] }>(`/diary?company_key=${companyKey}&limit=100`)

// ── SMS ───────────────────────────────────────────────────────────────────────

export const getSmsContext = (companyKey: string) => get<any>(`/send-sms/context/${companyKey}`)
export const sendSms = (body: {
  company_key: number; to: string; text: string
  send_immediately: boolean; note_type: string; note_text: string
}) => post<{ success: boolean; sms_id: number }>('/send-sms/send', body)

export const getMailContext = (companyKey: string) => get<any>(`/send-mail/context/${companyKey}`)
export const sendMail = (body: {
  company_key: number; to: string; sender: string
  subject: string; message: string
  bcc?: boolean; bcc_email?: string
  note_type: string; note_text: string
}) => post<{ success: boolean }>('/send-mail/send', body)
export const getEmailTemplates = () => get<any[]>('/send-mail/templates')
export const saveEmailTemplates = (templates: any[]) => put<{ success: boolean }>('/send-mail/templates', templates)

// ── Workers ───────────────────────────────────────────────────────────────────

export const listWorkers = () => get<any[]>('/workers')
export const getWorker = (initials: string) => get<any>(`/workers/${encodeURIComponent(initials)}`)

// ── Bank ──────────────────────────────────────────────────────────────────────

export const getBankStatements = () => get<any[]>('/bank/statements')
export const deleteBankStatement = (id: number) => del<any>(`/bank/statements/${id}`)

export const getBankTransactions = (params: {
  unmatched?: boolean
  credit_debit?: string
  date_from?: string
  date_to?: string
  vs?: string
  statement_id?: number
  limit?: number
  offset?: number
}) => {
  const q = new URLSearchParams()
  if (params.unmatched)    q.set('unmatched', 'true')
  if (params.credit_debit) q.set('credit_debit', params.credit_debit)
  if (params.date_from)    q.set('date_from', params.date_from)
  if (params.date_to)      q.set('date_to', params.date_to)
  if (params.vs)           q.set('vs', params.vs)
  if (params.statement_id) q.set('statement_id', String(params.statement_id))
  q.set('limit',  String(params.limit  ?? 50))
  q.set('offset', String(params.offset ?? 0))
  return get<any[]>(`/bank/transactions?${q}`)
}

export const matchBankTransaction = (txId: number, invoiceKey: number, isProforma = false) =>
  post<any>(`/bank/transactions/${txId}/match`, isProforma ? { company_key: invoiceKey } : { invoice_key: invoiceKey })

export const unmatchBankTransaction = (txId: number) =>
  del<any>(`/bank/transactions/${txId}/match`)

export const searchBankInvoices = (q: string, amount?: number, proforma?: boolean) => {
  const params = new URLSearchParams({ q })
  if (amount != null) params.set('amount', String(amount))
  if (proforma) params.set('proforma', 'true')
  return get<any[]>(`/bank/invoices-search?${params}`)
}

export const uploadBankXml = (files: FileList | File[]) => {
  const form = new FormData()
  Array.from(files).forEach(f => form.append('files', f))
  return fetch(buildUrl('/bank/upload-xml'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${getToken()}` },
    body: form,
  }).then(async r => {
    if (!r.ok) { const t = await r.text(); throw new Error(JSON.parse(t).error ?? t) }
    return r.json() as Promise<{ imported: number; skipped: number; errors: string[] }>
  })
}
