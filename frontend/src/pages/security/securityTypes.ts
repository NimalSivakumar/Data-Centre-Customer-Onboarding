import type { SecurityVisitor } from '../../types/api'
import type { statusBadge } from '../../utils/formatters'

export type SecurityRow = Omit<SecurityVisitor, 'visit_status'> & {
  raw_status: string
  visit_status: ReturnType<typeof statusBadge>
  checked_in_label: string
  checked_out_label: string
}

export type SecurityVisitorActionHandlers = {
  onDetails: (row: SecurityRow) => void
  onCheckIn: (id: string) => void
  onCheckOut: (id: string) => void
  onDeny: (id: string) => void
}
