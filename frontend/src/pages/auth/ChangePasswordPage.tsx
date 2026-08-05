import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../api/client'
import { defaultPathForUser } from '../../auth/permissions'
import type { AuthState, User } from '../../types/api'

export function ChangePasswordPage({ auth, onChange, onLogout }: { auth: AuthState; onChange: (user: User) => void; onLogout: () => void }) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match')
      return
    }
    setLoading(true)
    try {
      const user = await api<User>('/auth/change-password', auth, { method: 'POST', body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }) })
      onChange(user)
      navigate(defaultPathForUser(user), { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change password')
    } finally {
      setLoading(false)
    }
  }

  return <div className="login-page"><form className="login-card" onSubmit={submit}><p className="eyebrow">First login</p><h1>Change your password</h1><small>You are signed in as {auth.user.email}. Set a new password before continuing.</small><label>Temporary password<input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required /></label><label>New password<input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={8} required /></label><label>Confirm new password<input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={8} required /></label>{error && <p className="error">{error}</p>}<button disabled={loading}>{loading ? 'Saving...' : 'Change password'}</button><button type="button" className="secondary" onClick={onLogout}>Sign out</button></form></div>
}
