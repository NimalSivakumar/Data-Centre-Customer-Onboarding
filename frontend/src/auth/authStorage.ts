import type { AuthState } from '../types/api'

const AUTH_STORAGE_KEY = 'dc_auth'

export function getStoredAuth(): AuthState | null {
  const value = sessionStorage.getItem(AUTH_STORAGE_KEY)
  return value ? JSON.parse(value) as AuthState : null
}

export function storeAuth(auth: AuthState) {
  sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(auth))
}

export function clearStoredAuth() {
  sessionStorage.removeItem(AUTH_STORAGE_KEY)
}
