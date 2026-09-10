import type { AuditLog } from '../../types/api'
import { formatDateTime } from '../../utils/dates'
import type { AuditDateRange } from './auditFilters'
import { formatAuditLines, formatAuditSentence } from './auditFormatters'

export function exportAuditLogs(logs: AuditLog[], dateRange: AuditDateRange) {
  const csv = buildAuditCsv(logs)
  downloadTextFile(csv, buildAuditExportFileName(dateRange), 'text/csv;charset=utf-8')
}

function buildAuditExportFileName(dateRange: AuditDateRange) {
  const firstSelectedDate = dateRange.from || dateRange.to
  if (!firstSelectedDate) return `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`

  const monthName = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(new Date(`${firstSelectedDate}T00:00:00`))
  const safeMonthName = monthName.toLowerCase().replaceAll(' ', '-')
  return `audit-logs-${safeMonthName}.csv`
}

function buildAuditCsv(logs: AuditLog[]) {
  const rows = logs.map((log) => [
    formatDateTime(log.created_at),
    log.actor_full_name ?? '',
    log.actor_email ?? '',
    log.action,
    log.entity_type,
    log.entity_id ?? '',
    formatAuditSentence(log),
    formatAuditLines(log).join(' | '),
  ])

  return [
    ['Date/time', 'Actor name', 'Actor email', 'Action', 'Entity type', 'Entity ID', 'Summary', 'Details'],
    ...rows,
  ].map((row) => row.map(escapeCsvValue).join(',')).join('\n')
}

function escapeCsvValue(value: string) {
  return `"${value.replaceAll('"', '""')}"`
}

function downloadTextFile(content: string, fileName: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
