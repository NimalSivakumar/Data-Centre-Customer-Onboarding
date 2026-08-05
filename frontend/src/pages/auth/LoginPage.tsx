import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { getErrorMessage } from '../../api/client'
import { defaultPathForUser } from '../../auth/permissions'
import { API_BASE_URL } from '../../constants/app'
import type { AuthState } from '../../types/api'

export function LoginPage({ onLogin }: { onLogin: (auth: AuthState) => void }) {
  const [email, setEmail] = useState('admin@example.com')
  const [password, setPassword] = useState('password')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function submit(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (!response.ok) throw new Error(await getErrorMessage(response, 'Invalid email or password'))
      const data = await response.json() as AuthState
      onLogin(data)
      navigate(data.user.must_change_password ? '/change-password' : defaultPathForUser(data.user), { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return <div className="login-page"><form className="login-card" onSubmit={submit}><p className="eyebrow">Internal MVP</p><h1>Data Centre Visitor Access</h1><label>Email<input value={email} onChange={(event) => setEmail(event.target.value)} /></label><label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>{error && <p className="error">{error}</p>}<button disabled={loading}>{loading ? 'Signing in...' : 'Sign in'}</button><small>Try admin@example.com, ops@example.com, or security@example.com. Password: password.</small></form></div>
}
