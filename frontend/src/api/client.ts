import { API_BASE_URL } from '../constants/app'
import { clearStoredAuth } from '../auth/authStorage'
import type { AuthState } from '../types/api'

export async function api<T>(path: string, auth: AuthState, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${auth.access_token}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  })
  if (!response.ok) {
    const message = await getErrorMessage(response, 'Request failed')
    if (response.status === 401 && message.toLowerCase().includes('inactive')) {
      clearStoredAuth()
      window.location.assign('/login')
    }
    throw new Error(message)
  }
  return response.json() as Promise<T>
}

export async function getErrorMessage(response: Response, fallback: string) {
  try {
    const data = await response.json() as { detail?: unknown }
    return typeof data.detail === 'string' ? data.detail : fallback
  } catch {
    return fallback
  }
}
