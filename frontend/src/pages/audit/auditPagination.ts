import type { AuditLog, ListResponse } from '../../types/api'
import type { AuditDateRange } from './auditFilters'

export const AUDIT_PAGE_SIZE = 50
const EXPORT_PAGE_SIZE = 100

export function buildAuditParams(range: AuditDateRange, page = 1, pageSize = AUDIT_PAGE_SIZE) {
  if (range.from && range.to && range.from > range.to) {
    throw new Error('From date must be on or before the to date')
  }
  const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) })
  params.set('exclude_session_events', 'true')
  if (range.from) params.set('from_day', range.from)
  if (range.to) params.set('to_day', range.to)
  return params
}

export async function loadAuditExport(
  loadPage: (params: URLSearchParams) => Promise<ListResponse<AuditLog>>,
  range: AuditDateRange,
): Promise<AuditLog[]> {
  const logs: AuditLog[] = []
  const seen = new Set<string>()
  let cursor: AuditLog | undefined
  while (true) {
    const params = buildAuditParams(range, 1, EXPORT_PAGE_SIZE)
    if (cursor) {
      params.set('before_created_at', cursor.created_at)
      params.set('before_id', cursor.id)
    }
    const response = await loadPage(params)
    if (response.items.length === 0) break
    for (const log of response.items) {
      if (seen.has(log.id)) throw new Error('Audit records changed unexpectedly. Please retry the export.')
      seen.add(log.id)
      logs.push(log)
    }
    cursor = response.items[response.items.length - 1]
    if (response.items.length < EXPORT_PAGE_SIZE) break
  }
  return logs
}
