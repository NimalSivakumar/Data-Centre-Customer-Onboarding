import type { SecurityVisitor } from '../../types/api'
import { formatDateTime } from '../../utils/dates'
import { statusBadge } from '../../utils/formatters'
import type { SecurityRow } from './securityTypes'

export function mapSecurityVisitorToRow(visitor: SecurityVisitor): SecurityRow {
  return {
    ...visitor,
    raw_status: visitor.visit_status,
    visit_status: statusBadge(visitor.visit_status),
    checked_in_label: visitor.checked_in_at ? formatDateTime(visitor.checked_in_at) : '',
    checked_out_label: visitor.checked_out_at ? formatDateTime(visitor.checked_out_at) : '',
  }
}

export function getCheckInBlockReason(row: SecurityRow) {
  const now = new Date()
  const visitStart = new Date(`${row.visit_date}T${row.expected_arrival_time}`)
  const visitEnd = new Date(`${row.visit_date}T${row.expected_departure_time}`)
  if (now.toDateString() !== visitStart.toDateString()) return 'Check-in is only allowed on the scheduled visit date'
  if (now < visitStart) return 'Check-in is not available before the expected arrival time'
  if (now > visitEnd) return 'Check-in is not available after the expected departure time'
  return ''
}

export function isScheduledToday(row: SecurityRow) {
  return new Date().toDateString() === new Date(`${row.visit_date}T00:00:00`).toDateString()
}
