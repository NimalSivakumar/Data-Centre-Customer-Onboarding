import { API_BASE_URL } from '../constants/app'
import type { AuthState } from '../types/api'
import { getApplicationSessionId, lockApplicationSession } from '../auth/applicationSession'

let tokenProvider: (() => Promise<string>) | null = null
let sessionExpiredHandler: (() => void) | null = null

export function setSessionExpiredHandler(handler: (() => void) | null) {
  sessionExpiredHandler = handler
}

export function setApiTokenProvider(provider: () => Promise<string>) {
  tokenProvider = provider
}

export async function api<T>(path: string, auth: AuthState, options: RequestInit = {}): Promise<T> {
  if (!auth.user) throw new Error('Not signed in')
  if (!tokenProvider) throw new Error('Microsoft authentication is not ready')
  const token = await tokenProvider()
  const sessionId = getApplicationSessionId()
  if (!sessionId) {
    lockApplicationSession()
    sessionExpiredHandler?.()
    throw new Error('Application session required; sign in again')
  }
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
      'X-App-Session-ID': sessionId,
    },
  })
  if (!response.ok) {
    const message = await getErrorMessage(response, 'Request failed')
    if (response.status === 401) {
      lockApplicationSession()
      if (sessionExpiredHandler) sessionExpiredHandler()
      else window.location.assign(`${import.meta.env.BASE_URL}login`)
    }
    throw new Error(message)
  }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>
}

export async function getErrorMessage(response: Response, fallback: string) {
  try {
    const data = await response.json() as { detail?: unknown }
    return typeof data.detail === 'string' ? data.detail : fallback
  } catch {
    return fallback
  }
}
