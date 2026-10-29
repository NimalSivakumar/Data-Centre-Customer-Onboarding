import type { SecurityVisitor } from '../../types/api'
import { formatDateTime } from '../../utils/dates'
import { statusBadge } from '../../utils/formatters'
import type { SecurityRow } from './securityTypes'

export { getCheckInBlockReason, isScheduledToday } from './securityTiming'

export function mapSecurityVisitorToRow(visitor: SecurityVisitor): SecurityRow {
  return {
    ...visitor,
    raw_status: visitor.visit_status,
    visit_status: statusBadge(visitor.visit_status),
    checked_in_label: visitor.checked_in_at ? formatDateTime(visitor.checked_in_at) : '',
    checked_out_label: visitor.checked_out_at ? formatDateTime(visitor.checked_out_at) : '',
  }
}
