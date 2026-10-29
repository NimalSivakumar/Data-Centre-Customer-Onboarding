import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import { Page } from '../../components/Page'
import { Panel } from '../../components/Panel'
import { SectionHeading } from '../../components/SectionHeading'
import { LoadingState } from '../../components/LoadingState'
import type { AuditLog, AuthState, ListResponse } from '../../types/api'
import { AuditDateFilter } from './AuditDateFilter'
import { AuditExportButton } from './AuditExportButton'
import { AuditTimeline } from './AuditTimeline'
import { hasAuditDateFilter, type AuditDateRange } from './auditFilters'
import { collapseAuditLogs } from './auditFormatters'
import { exportAuditLogs } from './auditExport'
import { AUDIT_PAGE_SIZE, buildAuditParams, loadAuditExport } from './auditPagination'

export function AuditPage({ auth }: { auth: AuthState }) {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [{ dateRange, page }, setFilters] = useState({ dateRange: { from: '', to: '' } as AuditDateRange, page: 1 })
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    setLogs([])
    setTotal(0)
    async function load() {
      try {
        const params = buildAuditParams(dateRange, page)
        const data = await api<ListResponse<AuditLog>>(`/audit-logs?${params}`, auth)
        if (active) {
          const lastPage = Math.max(1, Math.ceil(data.total / AUDIT_PAGE_SIZE))
          if (page > lastPage) {
            setFilters((current) => ({ ...current, page: lastPage }))
            return
          }
          setLogs(data.items)
          setTotal(data.total)
        }
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Could not load audit logs')
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => { active = false }
  }, [auth, dateRange, page])
  const visibleLogs = collapseAuditLogs(logs)
  const emptyMessage = hasAuditDateFilter(dateRange) ? 'No audit activity matches the selected date range.' : 'No audit activity yet.'
  const pageCount = Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE))

  function changeDates(next: AuditDateRange) {
    setFilters({ dateRange: next, page: 1 })
  }

  async function exportAll() {
    if (exporting) return
    setExporting(true)
    setError('')
    try {
      const allLogs = await loadAuditExport(
        (params) => api<ListResponse<AuditLog>>(`/audit-logs?${params}`, auth),
        dateRange,
      )
      exportAuditLogs(allLogs, dateRange)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not export audit logs')
    } finally {
      setExporting(false)
    }
  }

  return (
    <Page title="Audit logs" error={error}>
      <Panel className="audit-panel">
        <SectionHeading title="Activity timeline" count={total} />
        <div className="audit-toolbar">
          <AuditDateFilter value={dateRange} onChange={changeDates} onClear={() => changeDates({ from: '', to: '' })} disabled={exporting} />
          <AuditExportButton onExport={exportAll} exporting={exporting} disabled={loading} />
        </div>
        {loading ? <LoadingState label="Loading audit logs..." /> : <AuditTimeline logs={visibleLogs} emptyMessage={emptyMessage} />}
        <nav className="d-flex align-items-center gap-3 flex-wrap" aria-label="Audit pagination">
          <button type="button" className="secondary" disabled={loading || page <= 1} onClick={() => setFilters((current) => ({ ...current, page: current.page - 1 }))}>Previous</button>
          <span aria-live="polite">Page {page} of {pageCount} · {total} matching records</span>
          <button type="button" className="secondary" disabled={loading || page >= pageCount} onClick={() => setFilters((current) => ({ ...current, page: current.page + 1 }))}>Next</button>
        </nav>
      </Panel>
    </Page>
  )
}
