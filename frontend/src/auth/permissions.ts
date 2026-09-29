import type { User } from '../types/api'

export function hasAnyRole(user: User, roles: string[]) {
  return user.roles.some((role) => roles.includes(role))
}

export function defaultPathForUser(user: User) {
  if (hasAnyRole(user, ['SECURITY'])) return '/security'
  return '/dashboard'
}
