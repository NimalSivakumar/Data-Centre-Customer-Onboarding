import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { defaultPathForUser, hasAnyRole } from './permissions'
import type { User } from '../types/api'

export function RoleGate({ user, roles, children }: { user: User; roles: string[]; children: ReactNode }) {
  if (!hasAnyRole(user, roles)) return <Navigate to={defaultPathForUser(user)} replace />
  return children
}
