import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import { Page } from '../../components/Page'
import { Panel } from '../../components/Panel'
import { SectionHeading } from '../../components/SectionHeading'
import type { AuditLog, AuthState, ListResponse } from '../../types/api'
import { AuditDateFilter } from './AuditDateFilter'
import { AuditExportButton } from './AuditExportButton'
import { AuditTimeline } from './AuditTimeline'
import { filterAuditLogsByDate, hasAuditDateFilter, type AuditDateRange } from './auditFilters'
import { collapseAuditLogs } from './auditFormatters'

export function AuditPage({ auth }: { auth: AuthState }) {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [dateRange, setDateRange] = useState<AuditDateRange>({ from: '', to: '' })
  const [error, setError] = useState('')
  useEffect(() => { api<ListResponse<AuditLog>>('/audit-logs', auth).then((data) => setLogs(data.items)).catch((err: Error) => setError(err.message)) }, [auth])
  const visibleLogs = filterAuditLogsByDate(collapseAuditLogs(logs), dateRange)
  const emptyMessage = hasAuditDateFilter(dateRange) ? 'No audit activity matches the selected date range.' : 'No audit activity yet.'

  return <Page title="Audit logs" error={error}><Panel className="audit-panel"><SectionHeading title="Activity timeline" count={visibleLogs.length} /><div className="audit-toolbar"><AuditDateFilter value={dateRange} onChange={setDateRange} onClear={() => setDateRange({ from: '', to: '' })} /><AuditExportButton logs={visibleLogs} dateRange={dateRange} /></div><AuditTimeline logs={visibleLogs} emptyMessage={emptyMessage} /></Panel></Page>
}
