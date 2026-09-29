import { useEffect, useRef, useState } from 'react'
import { useMsal } from '@azure/msal-react'
import { InteractionRequiredAuthError } from '@azure/msal-browser'
import { Navigate, Route, Routes } from 'react-router-dom'
import { setApiTokenProvider } from './api/client'
import { defaultPathForUser } from './auth/permissions'
import { API_BASE_URL, ENTRA_API_SCOPE } from './constants/app'
import { Shell } from './layout/Shell'
import { LoginPage } from './pages/auth/LoginPage'
import type { AuthState, User } from './types/api'
import './App.css'

const HEARTBEAT_INTERVAL_MS = 60 * 1000
const SESSION_STORAGE_KEY = 'dc_onboarding_session_id'

async function startSession(accessToken: string) {
  const response = await fetch(`${API_BASE_URL}/auth/sessions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  })
  if (!response.ok) throw new Error('Could not start application session')
  const data = await response.json() as { session_id: string }
  return data.session_id
}

async function heartbeatSession(accessToken: string, sessionId: string) {
  const response = await fetch(`${API_BASE_URL}/auth/sessions/${sessionId}/heartbeat`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!response.ok) throw new Error('Could not update application session')
}

async function endSession(accessToken: string, sessionId: string) {
  const response = await fetch(`${API_BASE_URL}/auth/sessions/${sessionId}/end`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!response.ok) throw new Error('Could not end application session')
}

function App() {
  const [auth, setAuth] = useState<AuthState | null>(null)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const sessionIdRef = useRef<string | null>(null)
  const { instance } = useMsal()

  function setCurrentSessionId(nextSessionId: string | null) {
    sessionIdRef.current = nextSessionId
    setSessionId(nextSessionId)
    if (nextSessionId) sessionStorage.setItem(SESSION_STORAGE_KEY, nextSessionId)
    else sessionStorage.removeItem(SESSION_STORAGE_KEY)
  }

  useEffect(() => {
    let ignore = false

    async function checkAuth() {
      try {
        const redirectResult = await instance.handleRedirectPromise()
        const account = redirectResult?.account ?? instance.getActiveAccount() ?? instance.getAllAccounts()[0]
        if (!account) return

        instance.setActiveAccount(account)
        setApiTokenProvider(async () => {
          try {
            const tokenResponse = await instance.acquireTokenSilent({ account, scopes: [ENTRA_API_SCOPE] })
            return tokenResponse.accessToken
          } catch (err) {
            if (err instanceof InteractionRequiredAuthError) await instance.loginRedirect({ scopes: [ENTRA_API_SCOPE] })
            throw err
          }
        })
        const tokenResponse = await instance.acquireTokenSilent({ account, scopes: [ENTRA_API_SCOPE] })
        const response = await fetch(`${API_BASE_URL}/auth/me`, { headers: { Authorization: `Bearer ${tokenResponse.accessToken}` } })
        if (!response.ok) throw new Error('Microsoft account is not authorised for this app')
        const user = await response.json() as User
        try {
          const storedSessionId = sessionStorage.getItem(SESSION_STORAGE_KEY)
          if (storedSessionId) {
            await heartbeatSession(tokenResponse.accessToken, storedSessionId)
            setCurrentSessionId(storedSessionId)
          } else {
            setCurrentSessionId(await startSession(tokenResponse.accessToken))
          }
        } catch {
          try {
            setCurrentSessionId(await startSession(tokenResponse.accessToken))
          } catch {
            setCurrentSessionId(null)
          }
        }
        const nextAuth = { user }
        if (!ignore) setAuth(nextAuth)
      } catch {
        if (!ignore) setAuth(null)
      } finally {
        if (!ignore) setCheckingAuth(false)
      }
    }

    void checkAuth()

    return () => {
      ignore = true
    }
  }, [instance])

  useEffect(() => {
    if (!auth || !sessionId) return
    const activeSessionId = sessionId

    async function sendHeartbeat() {
      if (document.visibilityState !== 'visible') return

      const account = instance.getActiveAccount() ?? instance.getAllAccounts()[0]
      if (!account) return

      try {
        const tokenResponse = await instance.acquireTokenSilent({ account, scopes: [ENTRA_API_SCOPE] })
        await heartbeatSession(tokenResponse.accessToken, activeSessionId)
      } catch {
        // Session tracking should not interrupt normal app usage.
      }
    }

    const heartbeatTimer = window.setInterval(() => void sendHeartbeat(), HEARTBEAT_INTERVAL_MS)

    return () => {
      window.clearInterval(heartbeatTimer)
    }
  }, [auth, instance, sessionId])

  async function logout() {
    const account = instance.getActiveAccount() ?? instance.getAllAccounts()[0]
    const currentSessionId = sessionIdRef.current
    if (account && currentSessionId) {
      try {
        const tokenResponse = await instance.acquireTokenSilent({ account, scopes: [ENTRA_API_SCOPE] })
        await endSession(tokenResponse.accessToken, currentSessionId)
      } catch {
        // MSAL logout should continue even if session finalization fails.
      }
    }
    setCurrentSessionId(null)
    setAuth(null)
    void instance.logoutRedirect()
  }

  if (checkingAuth) return <div className="loading-screen">Checking session...</div>

  return (
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
  )
}

export default App
