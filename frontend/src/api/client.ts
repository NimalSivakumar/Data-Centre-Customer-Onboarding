import { API_BASE_URL } from '../constants/app'
import type { AuthState } from '../types/api'

let tokenProvider: (() => Promise<string>) | null = null

export function setApiTokenProvider(provider: () => Promise<string>) {
  tokenProvider = provider
}

export async function api<T>(path: string, auth: AuthState, options: RequestInit = {}): Promise<T> {
  if (!auth.user) throw new Error('Not signed in')
  if (!tokenProvider) throw new Error('Microsoft authentication is not ready')
  const token = await tokenProvider()
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  })
  if (!response.ok) {
    const message = await getErrorMessage(response, 'Request failed')
    if (response.status === 401) {
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
