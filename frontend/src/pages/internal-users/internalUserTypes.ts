import type { InternalUser } from '../../types/api'
import type { statusBadge } from '../../utils/formatters'

export type InternalUserRow = Omit<InternalUser, 'status'> & {
  raw_status: string
  status: ReturnType<typeof statusBadge>
}
