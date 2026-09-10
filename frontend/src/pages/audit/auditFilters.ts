import type { AuditLog } from '../../types/api'

export type AuditDateRange = {
  from: string
  to: string
}

export function filterAuditLogsByDate(logs: AuditLog[], range: AuditDateRange) {
  const fromTime = range.from ? new Date(`${range.from}T00:00:00`).getTime() : null
  const toTime = range.to ? new Date(`${range.to}T23:59:59.999`).getTime() : null

  return logs.filter((log) => {
    const createdTime = new Date(log.created_at).getTime()
    if (Number.isNaN(createdTime)) return false
    if (fromTime !== null && createdTime < fromTime) return false
    if (toTime !== null && createdTime > toTime) return false
    return true
  })
}

export function hasAuditDateFilter(range: AuditDateRange) {
  return Boolean(range.from || range.to)
}
