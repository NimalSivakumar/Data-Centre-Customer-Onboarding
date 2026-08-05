import { hasAnyRole } from '../auth/permissions'
import type { User } from '../types/api'

export function getNavItems(user: User) {
  if (hasAnyRole(user, ['SECURITY'])) return [{ path: '/security', label: 'Visitor List' }]
  if (hasAnyRole(user, ['CUSTOMER_ADMIN', 'CUSTOMER_USER'])) {
    return [
      { path: '/visitor-request', label: 'Submit Visitor Request' },
      { path: '/requests', label: 'My Requests' },
    ]
  }
  const items = [
    { path: '/dashboard', label: 'Dashboard' },
    { path: '/companies', label: 'Companies' },
    { path: '/contacts', label: 'Contacts' },
    { path: '/customer-users', label: 'Users' },
    { path: '/visitor-request', label: 'Submit Request' },
    { path: '/requests', label: 'Requests' },
  ]
  if (hasAnyRole(user, ['ADMIN'])) items.push({ path: '/internal-users', label: 'Internal Users' })
  if (hasAnyRole(user, ['ADMIN', 'OPS'])) items.push({ path: '/audit', label: 'Audit Logs' })
  return items
}
