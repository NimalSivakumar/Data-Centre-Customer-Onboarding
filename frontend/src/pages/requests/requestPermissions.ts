import type { User } from '../../types/api'

export function getRequestPermissions(user: User) {
  return {
    canApprove: user.roles.includes('ADMIN'),
    canReject: user.roles.some((role) => role === 'ADMIN' || role === 'OPS'),
  }
}
