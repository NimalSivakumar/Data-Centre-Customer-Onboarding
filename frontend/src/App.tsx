import { useCallback, useEffect, useRef, useState } from 'react'
import { useMsal } from '@azure/msal-react'
import { InteractionRequiredAuthError } from '@azure/msal-browser'
import { Navigate, Route, Routes } from 'react-router-dom'
import { setApiTokenProvider, setSessionExpiredHandler } from './api/client'
import { getApplicationSessionId, isApplicationLocked, lockApplicationSession, sessionBootstrapAction, setApplicationSessionId, unlockApplicationSession } from './auth/applicationSession'
import { startInactivityMonitor } from './auth/inactivity'
import { withDeadline } from './api/requestDeadline'
import { loadSiteSettings } from './api/siteSettings'
import { defaultPathForUser } from './auth/permissions'
import { API_BASE_URL, ENTRA_API_SCOPE } from './constants/app'
import { Shell } from './layout/Shell'
import { useModalFocus } from './components/useModalFocus'
import { LoginPage } from './pages/auth/LoginPage'
import type { AuthState, User } from './types/api'
import './App.css'

const HEARTBEAT_INTERVAL_MS = 60 * 1000
type SessionInfo = {
  session_id: string
  idle_remaining_seconds: number
  idle_timeout_seconds: number
  idle_warning_seconds: number
  receivedAt: number
}
type EndReason = 'USER_SIGNED_OUT' | 'SESSION_TIMED_OUT'

class SessionRequestError extends Error {
  status: number
  constructor(status: number) {
    super('Application session unavailable; sign in again')
    this.status = status
  }
}

async function requestSession(accessToken: string, suffix = '', parentSignal?: AbortSignal): Promise<SessionInfo> {
  return withDeadline(async (signal) => {
    const started = Date.now()
    const response = await fetch(`${API_BASE_URL}/auth/sessions${suffix}`, {
      method: 'POST', headers: { Authorization: `Bearer ${accessToken}` },
      signal,
    })
    if (!response.ok) throw new SessionRequestError(response.status)
    const data = await response.json() as Omit<SessionInfo, 'receivedAt'>
    if (!data.session_id || !Number.isFinite(data.idle_remaining_seconds) || data.idle_timeout_seconds <= 0
      || !Number.isFinite(data.idle_timeout_seconds) || !Number.isFinite(data.idle_warning_seconds)) {
      throw new Error('Invalid application session response')
    }
    return { ...data, idle_remaining_seconds: Math.max(0, data.idle_remaining_seconds - (Date.now() - started) / 1000), receivedAt: Date.now() }
  }, { timeoutMs: 10_000, signal: parentSignal })
}

async function endSession(accessToken: string, sessionId: string, reason: EndReason) {
  return withDeadline(async (signal) => {
    const response = await fetch(`${API_BASE_URL}/auth/sessions/${sessionId}/end`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }), signal, keepalive: true,
    })
    if (!response.ok) throw new Error('Could not end application session')
  }, { timeoutMs: 3000 })
}

function App() {
  const [auth, setAuth] = useState<AuthState | null>(null)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [startupError, setStartupError] = useState('')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [initialSession, setInitialSession] = useState<SessionInfo | null>(null)
  const [idleWarning, setIdleWarning] = useState<number | null>(null)
  const [activityError, setActivityError] = useState('')
  const sessionIdRef = useRef<string | null>(null)
  const endingRef = useRef(false)
  const idleMonitorRef = useRef<ReturnType<typeof startInactivityMonitor> | null>(null)
  const idleWarningDialogRef = useRef<HTMLElement | null>(null)
  const { instance } = useMsal()

  const setCurrentSessionId = useCallback((nextSessionId: string | null) => {
    sessionIdRef.current = nextSessionId
    setSessionId(nextSessionId)
    setApplicationSessionId(nextSessionId)
  }, [])

  const finishSession = useCallback((reason: EndReason) => {
    if (endingRef.current) return
    endingRef.current = true
    const currentSessionId = sessionIdRef.current
    lockApplicationSession()
    setCurrentSessionId(null)
    setAuth(null)
    setIdleWarning(null)
    idleMonitorRef.current?.stop()
    const account = instance.getActiveAccount() ?? instance.getAllAccounts()[0]
    // Lock the local UI immediately, even offline or if Microsoft logout fails.
    void (async () => {
      try {
        if (account && currentSessionId) {
          const tokenResponse = await withDeadline(() => instance.acquireTokenSilent({ account, scopes: [ENTRA_API_SCOPE] }), { timeoutMs: 3000 })
          await endSession(tokenResponse.accessToken, currentSessionId, reason)
        }
      } catch {
        // The backend independently expires idle sessions; never unlock on failure.
      }
      try { await withDeadline(() => instance.logoutRedirect(), { timeoutMs: 3000 }) } catch { /* Explicit sign-in remains required locally. */ }
    })()
  }, [instance, setCurrentSessionId])

  useEffect(() => {
    setSessionExpiredHandler(() => finishSession('SESSION_TIMED_OUT'))
    return () => setSessionExpiredHandler(null)
  }, [finishSession])

  useEffect(() => {
    let ignore = false
    const controller = new AbortController()
    let stage = 'Microsoft sign-in'

    async function checkAuth() {
      try {
        await withDeadline(async (signal) => {
          const assertActive = () => { if (signal.aborted || ignore || endingRef.current) throw new Error('Startup cancelled') }
          const redirectResult = await instance.handleRedirectPromise()
          assertActive()
          const freshSignIn = Boolean(redirectResult?.account)
          const storedSessionId = getApplicationSessionId()
          const action = sessionBootstrapAction(freshSignIn, isApplicationLocked(), storedSessionId)
          if (action === 'sign-in') return
          const account = redirectResult?.account ?? instance.getActiveAccount() ?? instance.getAllAccounts()[0]
          if (!account) return

          instance.setActiveAccount(account)
          stage = 'Microsoft token'
          setApiTokenProvider(async () => {
            if (endingRef.current || isApplicationLocked() || !getApplicationSessionId()) {
              throw new Error('Application session expired; sign in again')
            }
            try {
              const tokenResponse = await withDeadline(() => instance.acquireTokenSilent({ account, scopes: [ENTRA_API_SCOPE] }))
              if (ignore || endingRef.current || isApplicationLocked() || !getApplicationSessionId()) {
                throw new Error('Application session expired; sign in again')
              }
              return tokenResponse.accessToken
            } catch (err) {
              if (!ignore && err instanceof InteractionRequiredAuthError) finishSession('SESSION_TIMED_OUT')
              throw err
            }
          })
          const tokenResponse = await withDeadline(() => instance.acquireTokenSilent({ account, scopes: [ENTRA_API_SCOPE] }))
          assertActive()
          stage = 'account identity'
          const response = await fetch(`${API_BASE_URL}/auth/me`, { headers: { Authorization: `Bearer ${tokenResponse.accessToken}` }, signal })
          assertActive()
          if (!response.ok) {
            stage = `account identity (HTTP ${response.status})`
            throw new Error('Microsoft account is not authorised for this app')
          }
          const user = await response.json() as User
          assertActive()
          stage = 'site settings'
          await loadSiteSettings(tokenResponse.accessToken)
          assertActive()
          stage = 'application session'
          // Never silently replace an expired/missing session using a cached Entra token.
          const session = await requestSession(tokenResponse.accessToken, action === 'start' ? '' : `/${storedSessionId}/heartbeat`, signal)
          assertActive()
          if (session.idle_remaining_seconds <= 0) {
            lockApplicationSession()
            return
          }
          unlockApplicationSession()
          endingRef.current = false
          setCurrentSessionId(session.session_id)
          setInitialSession(session)
          const nextAuth = { user }
          if (!ignore) setAuth(nextAuth)
        }, { timeoutMs: 30_000, signal: controller.signal })
      } catch {
        if (!ignore) {
          lockApplicationSession()
          setCurrentSessionId(null)
          setAuth(null)
          setStartupError(`Unable to verify ${stage}. The service may be unavailable or the request timed out. Sign in again to retry; if this continues, contact support.`)
        }
      } finally {
        if (!ignore) setCheckingAuth(false)
      }
    }

    void checkAuth()

    return () => {
      ignore = true
      controller.abort()
    }
  }, [instance, setCurrentSessionId, finishSession])

  useEffect(() => {
    if (!auth || !sessionId) return
    const activeSessionId = sessionId
    let active = true
    let inFlight = false

    async function sendHeartbeat() {
      if (!active || inFlight || endingRef.current || document.visibilityState !== 'visible') return

      const account = instance.getActiveAccount() ?? instance.getAllAccounts()[0]
      if (!account) return

      inFlight = true
      try {
        const tokenResponse = await withDeadline(() => instance.acquireTokenSilent({ account, scopes: [ENTRA_API_SCOPE] }))
        if (!active || endingRef.current || sessionIdRef.current !== activeSessionId) return
        await requestSession(tokenResponse.accessToken, `/${activeSessionId}/heartbeat`)
      } catch (error) {
        if (!active || endingRef.current || sessionIdRef.current !== activeSessionId) return
        if (error instanceof SessionRequestError && [401, 403, 404].includes(error.status)) finishSession('SESSION_TIMED_OUT')
      } finally { inFlight = false }
    }

    const heartbeatTimer = window.setInterval(() => void sendHeartbeat(), HEARTBEAT_INTERVAL_MS)

    return () => {
      active = false
      window.clearInterval(heartbeatTimer)
    }
  }, [auth, instance, sessionId, finishSession])

  useEffect(() => {
    if (!auth || !initialSession) return
    let active = true
    let inFlight = false
    let queuedActivity = false
    async function reportActivity() {
      const id = sessionIdRef.current
      const account = instance.getActiveAccount() ?? instance.getAllAccounts()[0]
      if (!id || !account || endingRef.current || !active) return
      if (inFlight) { queuedActivity = true; return }
      inFlight = true
      try {
        const token = await withDeadline(() => instance.acquireTokenSilent({ account, scopes: [ENTRA_API_SCOPE] }))
        if (!active || endingRef.current) return
        await requestSession(token.accessToken, `/${id}/activity`)
        if (active) setActivityError('')
      } catch (error) {
        if (!active) return
        if (error instanceof SessionRequestError && [401, 403, 404].includes(error.status)) finishSession('SESSION_TIMED_OUT')
        else setActivityError('Could not confirm activity with the server. Your session may expire; check your connection.')
      } finally {
        inFlight = false
        if (queuedActivity && active && !endingRef.current) {
          queuedActivity = false
          void reportActivity()
        }
      }
    }
    const monitor = startInactivityMonitor({
      timeoutMs: initialSession.idle_timeout_seconds * 1000,
      warningMs: initialSession.idle_warning_seconds * 1000,
      initialRemainingMs: initialSession.idle_remaining_seconds * 1000 - (Date.now() - initialSession.receivedAt),
      onWarning: setIdleWarning,
      onActivity: () => { void reportActivity() },
      onExpire: () => finishSession('SESSION_TIMED_OUT'),
    })
    idleMonitorRef.current = monitor
    return () => { active = false; monitor.stop(); idleMonitorRef.current = null }
  }, [auth, initialSession, instance, finishSession])

  function logout() { finishSession('USER_SIGNED_OUT') }

  // Escape must not renew or silently dismiss an inactivity warning.
  useModalFocus(Boolean(auth && idleWarning !== null), idleWarningDialogRef, () => {})

  if (checkingAuth) return <div className="loading-screen">Checking session...</div>

  return (
    <>
    {startupError && !auth && <p className="error" role="alert">{startupError}</p>}
    {auth && activityError && <p className="error" role="alert">{activityError}</p>}
    {auth && idleWarning !== null && <div className="dialog-backdrop"><section ref={idleWarningDialogRef} tabIndex={-1} data-idle-controls className="action-dialog" role="alertdialog" aria-modal="true" aria-labelledby="idle-title" aria-describedby="idle-description">
      <h2 id="idle-title">Are you still there?</h2>
      <p id="idle-description">You will be signed out in {Math.floor(idleWarning / 60)}:{String(idleWarning % 60).padStart(2, '0')} due to inactivity.</p>
      <button type="button" data-modal-initial-focus onClick={() => idleMonitorRef.current?.stayActive()}>Stay signed in</button>
      <button type="button" className="secondary" onClick={logout}>Sign out</button>
    </section></div>}
    <Routes>
      <Route
        path="/login"
        element={
          auth
            ? <Navigate to={defaultPathForUser(auth.user)} replace />
            : <LoginPage />
        }
      />
      <Route
        path="/*"
        element={
          auth
            ? <Shell auth={auth} onLogout={logout} />
            : <Navigate to="/login" replace />
        }
      />
    </Routes>
    </>
  )
}

export default App
