export type AuditDateRange = {
  from: string
  to: string
}

export function hasAuditDateFilter(range: AuditDateRange) {
  return Boolean(range.from || range.to)
}
