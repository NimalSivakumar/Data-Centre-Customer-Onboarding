import type { AuditLog } from '../../types/api'
import { isRecord } from '../../utils/records'

export function collapseAuditLogs(logs: AuditLog[]) {
  const visible = logs.filter(shouldShowAuditLog)
  return visible.filter((log) => {
    if (log.action !== 'CONTACT_USER_UPDATED') return true
    return !visible.some((other) => (
      other.action === 'CONTACT_UPDATED'
      && other.entity_id === log.entity_id
      && other.actor_email === log.actor_email
      && Math.abs(new Date(other.created_at).getTime() - new Date(log.created_at).getTime()) < 3000
    ))
  })
}

function shouldShowAuditLog(log: AuditLog) {
  if (log.action === 'CUSTOMER_USER_LINKED' || log.action === 'CONTACT_USER_LINKED') return false
  if (log.action === 'CONTACT_CREATED' && log.summary.startsWith('Contact created with customer login:')) return false
  if (log.action === 'CONTACT_CREATED' && log.metadata_json?.source === 'company_create') return false
  return true
}

export function formatAuditSentence(log: AuditLog) {
  const metadata = log.metadata_json
  if (log.action === 'REQUEST_SUBMITTED' && typeof metadata?.visitor_count === 'number') {
    return `${log.summary}${log.summary.includes('visitor') && log.summary.includes(' for ') ? '' : ` for ${metadata.visitor_count} visitor${metadata.visitor_count === 1 ? '' : 's'}`}`
  }
  const target = getAuditTarget(log)
  const entityLabel = getAuditEntityLabel(log)
  if (isRecord(metadata?.before) && isRecord(metadata?.after)) {
    const changes = getChangedEntries(metadata.before, metadata.after)
    return changes.length ? `Updated ${entityLabel}${target ? `: ${target}` : ''}` : log.summary
  }
  if (isRecord(metadata?.changes)) return `Updated ${entityLabel}${target ? `: ${target}` : ''}`
  return log.summary
}

export function formatAuditLines(log: AuditLog) {
  const metadata = log.metadata_json
  if (!metadata) return [log.summary]
  const before = isRecord(metadata.before) ? metadata.before : null
  const after = isRecord(metadata.after) ? metadata.after : null
  if (log.action === 'REQUEST_SUBMITTED' && typeof metadata.visitor_count === 'number') {
    const lines = [`Visitors included: ${metadata.visitor_count}`]
    if (metadata.first_visitor_full_name) lines.push(`First visitor: ${formatValue(metadata.first_visitor_full_name)}`)
    return lines
  }
  if (before && after) {
    const changes = getChangedEntries(before, after)
    return changes.length ? changes.map(([key, value]) => `${formatLabel(key)} changed from ${formatValue(before[key])} to ${formatValue(value)}`) : ['No visible field changes']
  }
  if (isRecord(metadata.changes)) {
    return Object.entries(metadata.changes).map(([key, value]) => {
      if (isRecord(value) && 'from' in value && 'to' in value) return `${formatLabel(key)} changed from ${formatValue(value.from)} to ${formatValue(value.to)}`
      return `${formatLabel(key)} set to ${formatValue(value)}`
    })
  }
  if (isRecord(metadata.company)) return Object.entries(metadata.company).filter(([key, value]) => value !== null && value !== '' && !key.endsWith('_id')).map(([key, value]) => `${formatLabel(key)}: ${formatValue(value)}`)
  if (isRecord(metadata.contact)) return Object.entries(metadata.contact).filter(([key, value]) => value !== null && value !== '' && !key.endsWith('_id')).map(([key, value]) => `${formatLabel(key)}: ${formatValue(value)}`)
  const details = Object.entries(metadata).filter(([key, value]) => value !== null && value !== '' && !key.endsWith('_id') && key !== 'source').map(([key, value]) => `${formatLabel(key)}: ${formatValue(value)}`)
  return details.length ? details : [log.summary]
}

function getAuditTarget(log: AuditLog) {
  const metadata = log.metadata_json
  if (isRecord(metadata?.target)) {
    const name = metadata.target.contact_name ?? metadata.target.full_name
    const email = metadata.target.account_email ?? metadata.target.contact_email ?? metadata.target.email
    if (name && email) return `${formatValue(name)} (${formatValue(email)})`
    if (name) return formatValue(name)
    if (email) return formatValue(email)
  }
  const summaryTarget = log.summary.includes(':') ? log.summary.split(':').slice(1).join(':').trim() : ''
  return summaryTarget || null
}

function getChangedEntries(before: Record<string, unknown>, after: Record<string, unknown>) {
  return Object.entries(after).filter(([key, value]) => formatValue(before[key]) !== formatValue(value))
}

function getAuditEntityLabel(log: AuditLog) {
  const metadata = log.metadata_json
  if (log.entity_type === 'contact' && isRecord(metadata?.changes)) {
    const keys = Object.keys(metadata.changes)
    const hasUserChange = keys.some((key) => key === 'user_role' || key === 'user_status')
    const hasContactChange = keys.some((key) => key !== 'user_role' && key !== 'user_status')
    if (hasUserChange && hasContactChange) return 'contact/user'
    if (hasUserChange) return 'user'
  }
  return formatLabel(log.entity_type)
}

function formatLabel(value: string) {
  return value.replaceAll('_', ' ')
}

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === '') return 'empty'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}
