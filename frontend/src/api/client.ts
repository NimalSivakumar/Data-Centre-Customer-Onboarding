import { API_BASE_URL } from '../constants/app'
import type { AuthState } from '../types/api'
import { getApplicationSessionId, lockApplicationSession } from '../auth/applicationSession'
import { withDeadline } from './requestDeadline'

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
  return withDeadline(async (signal) => {
    const token = await tokenProvider!()
    if (signal.aborted) throw new Error('Request cancelled')
    const sessionId = getApplicationSessionId()
    if (!sessionId) {
      lockApplicationSession()
      sessionExpiredHandler?.()
      throw new Error('Application session required; sign in again')
    }
    const headers: Record<string, string> = Object.fromEntries(new Headers(options.headers).entries())
    // Normalize caller headers first, then own credentials case-insensitively.
    delete headers.authorization
    delete headers['x-app-session-id']
    headers.Authorization = `Bearer ${token}`
    headers['X-App-Session-ID'] = sessionId
    if (options.body && !headers['content-type']) headers['Content-Type'] = 'application/json'
    const response = await fetch(`${API_BASE_URL}${path}`, { ...options, signal, headers })
    if (!response.ok) {
      // Lock on the HTTP status before waiting for an optional diagnostic body.
      if (response.status === 401) {
        lockApplicationSession()
        if (sessionExpiredHandler) sessionExpiredHandler()
        else window.location.assign(`${import.meta.env.BASE_URL}login`)
      }
      throw new Error(await getErrorMessage(response, 'Request failed'))
    }
    return response.status === 204 ? undefined as T : response.json() as Promise<T>
  }, { signal: options.signal })
}

export async function getErrorMessage(response: Response, fallback: string) {
  try {
    const data = await response.json() as { detail?: unknown }
    return typeof data.detail === 'string' ? data.detail : fallback
  } catch {
    return fallback
  }
}
