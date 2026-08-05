import { useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { api } from './api/client'
import { clearStoredAuth, getStoredAuth, storeAuth } from './auth/authStorage'
import { defaultPathForUser } from './auth/permissions'
import { Shell } from './layout/Shell'
import { ChangePasswordPage } from './pages/auth/ChangePasswordPage'
import { LoginPage } from './pages/auth/LoginPage'
import type { AuthState, User } from './types/api'
import './App.css'

function App() {
  const [auth, setAuth] = useState<AuthState | null>(getStoredAuth)
  const [checkingAuth, setCheckingAuth] = useState(true)

  useEffect(() => {
    const storedAuth = getStoredAuth()
    if (!storedAuth) {
      setCheckingAuth(false)
      return
    }

    api<User>('/auth/me', storedAuth)
      .then((user) => setAuth({ ...storedAuth, user }))
      .catch(() => {
        clearStoredAuth()
        setAuth(null)
      })
      .finally(() => setCheckingAuth(false))
  }, [])

  function saveAuth(nextAuth: AuthState) {
    storeAuth(nextAuth)
    setAuth(nextAuth)
  }

  function logout() {
    clearStoredAuth()
    setAuth(null)
  }

  if (checkingAuth) return <div className="loading-screen">Checking session...</div>

  return (
    <Routes>
      <Route
        path="/login"
        element={
          auth
            ? <Navigate to={auth.user.must_change_password ? '/change-password' : defaultPathForUser(auth.user)} replace />
            : <LoginPage onLogin={saveAuth} />
        }
      />
      <Route
        path="/change-password"
        element={
          auth
            ? <ChangePasswordPage auth={auth} onChange={(user) => saveAuth({ ...auth, user })} onLogout={logout} />
            : <Navigate to="/login" replace />
        }
      />
      <Route
        path="/*"
        element={
          auth
            ? auth.user.must_change_password
              ? <Navigate to="/change-password" replace />
              : <Shell auth={auth} onLogout={logout} />
            : <Navigate to="/login" replace />
        }
      />
    </Routes>
  )
}

export default App
