import { hasAnyRole } from '../auth/permissions'
import type { User } from '../types/api'

export function getNavItems(user: User) {
  if (hasAnyRole(user, ['SECURITY'])) return [{ path: '/security', label: 'Visitor List' }]
  const items = [
    { path: '/dashboard', label: 'Dashboard' },
    { path: '/companies', label: 'Companies' },
    { path: '/contacts', label: 'Contacts' },
    { path: '/requests', label: 'Requests' },
  ]
  if (hasAnyRole(user, ['ADMIN', 'OPS'])) items.push({ path: '/audit', label: 'Audit Logs' })
  return items
}
