import type { AuditLog } from '../../types/api'
import type { AuditDateRange } from './auditFilters'
import { exportAuditLogs } from './auditExport'

type AuditExportButtonProps = {
  logs: AuditLog[]
  dateRange: AuditDateRange
}

export function AuditExportButton({ logs, dateRange }: AuditExportButtonProps) {
  return <button type="button" onClick={() => exportAuditLogs(logs, dateRange)} disabled={logs.length === 0}>Export log</button>
}
