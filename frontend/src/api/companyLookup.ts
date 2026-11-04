import { api } from './client'
import type { AuthState, Company, ListResponse } from '../types/api'

/** Retrieve the complete company directory, never a silently truncated picker. */
export async function loadAllCompanies(auth: AuthState): Promise<Company[]> {
  const companies = new Map<string, Company>()
  const pageSize = 100
  let total: number | undefined
  for (let page = 1; ; page += 1) {
    const data = await api<ListResponse<Company>>(`/companies?page=${page}&page_size=${pageSize}`, auth)
    if (!Number.isSafeInteger(data.total) || data.total < 0 || data.page !== page ||
        data.page_size !== pageSize || !Array.isArray(data.items) ||
        data.items.length > pageSize || (total !== undefined && data.total !== total)) {
      throw new Error('Company pagination changed or is inconsistent. Please reload the directory.')
    }
    total = data.total
    const previousSize = companies.size
    for (const company of data.items) {
      if (!company || typeof company.id !== 'string' || !company.id) {
        throw new Error('Invalid company pagination response.')
      }
      companies.set(company.id, company)
    }
    if (companies.size > total) throw new Error('Inconsistent company pagination total.')
    if (companies.size === total) return [...companies.values()]
    if (companies.size === previousSize || page * pageSize >= total) {
      throw new Error('Company pagination stalled or omitted records. Please reload the directory.')
    }
  }
}
