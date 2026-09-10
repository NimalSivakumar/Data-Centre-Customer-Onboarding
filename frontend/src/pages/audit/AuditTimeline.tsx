import type { AuditLog } from '../../types/api'
import { formatDateTime } from '../../utils/dates'
import { formatAuditLines, formatAuditSentence } from './auditFormatters'

type AuditTimelineProps = {
  logs: AuditLog[]
  emptyMessage: string
}

export function AuditTimeline({ logs, emptyMessage }: AuditTimelineProps) {
  if (logs.length === 0) return <p className="empty">{emptyMessage}</p>

  return <div className="audit-timeline">{logs.map((log) => <article className="audit-item" key={log.id}><div className="audit-time"><strong>{formatDateTime(log.created_at)}</strong><span>{log.actor_full_name ?? log.actor_email ?? 'System'}</span></div><div className="audit-card"><h3>{formatAuditSentence(log)}</h3>{log.actor_email && <p className="audit-actor">By {log.actor_full_name ?? log.actor_email} ({log.actor_email})</p>}<ul>{formatAuditLines(log).map((line) => <li key={line}>{line}</li>)}</ul></div></article>)}</div>
}
