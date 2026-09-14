import type { InternalUser } from '../../types/api'
import { statusBadge } from '../../utils/formatters'
import type { InternalUserRow } from './internalUserTypes'

export function mapInternalUserToRow(user: InternalUser): InternalUserRow {
  return { ...user, raw_status: user.status, status: statusBadge(user.status) }
}

export function filterInternalUsers(users: InternalUser[], search: string, roleFilter: string, statusFilter: string) {
  const normalizedSearch = search.trim().toLowerCase()
  return users.filter((user) => {
    const matchesSearch = !normalizedSearch || [user.full_name, user.email, user.role, user.status].some((value) => String(value ?? '').toLowerCase().includes(normalizedSearch))
    const matchesRole = !roleFilter || user.role === roleFilter
    const matchesStatus = !statusFilter || user.status === statusFilter
    return matchesSearch && matchesRole && matchesStatus
  })
}
