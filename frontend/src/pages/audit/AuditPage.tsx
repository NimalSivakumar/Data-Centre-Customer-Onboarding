import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import { Page } from '../../components/Page'
import { Panel } from '../../components/Panel'
import { SectionHeading } from '../../components/SectionHeading'
import type { AuditLog, AuthState, ListResponse } from '../../types/api'
import { formatDateTime } from '../../utils/dates'
import { collapseAuditLogs, formatAuditLines, formatAuditSentence } from './auditFormatters'

export function AuditPage({ auth }: { auth: AuthState }) {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [error, setError] = useState('')
  useEffect(() => { api<ListResponse<AuditLog>>('/audit-logs', auth).then((data) => setLogs(data.items)).catch((err: Error) => setError(err.message)) }, [auth])
  const visibleLogs = collapseAuditLogs(logs)
  return <Page title="Audit logs" error={error}><Panel className="audit-panel"><SectionHeading title="Activity timeline" count={visibleLogs.length} /><div className="audit-timeline">{visibleLogs.map((log) => <article className="audit-item" key={log.id}><div className="audit-time"><strong>{formatDateTime(log.created_at)}</strong><span>{log.actor_full_name ?? log.actor_email ?? 'System'}</span></div><div className="audit-card"><h3>{formatAuditSentence(log)}</h3>{log.actor_email && <p className="audit-actor">By {log.actor_full_name ?? log.actor_email} ({log.actor_email})</p>}<ul>{formatAuditLines(log).map((line) => <li key={line}>{line}</li>)}</ul></div></article>)}</div>{visibleLogs.length === 0 && <p className="empty">No audit activity yet.</p>}</Panel></Page>
}
