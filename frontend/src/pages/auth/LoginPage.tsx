import { useState } from 'react'
import { useMsal } from '@azure/msal-react'
import { entraLoginRequest } from '../../auth/entra'

export function LoginPage() {
  const [error, setError] = useState('')
  const [microsoftLoading, setMicrosoftLoading] = useState(false)
  const { instance } = useMsal()

  async function signInWithMicrosoft() {
    setMicrosoftLoading(true)
    setError('')
    try {
      await instance.loginRedirect(entraLoginRequest)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Microsoft sign-in failed')
      setMicrosoftLoading(false)
    }
  }

  return <div className="login-page"><div className="login-card"><p className="eyebrow">Internal staff portal</p><h1>Data Centre Visitor Access</h1><p>Sign in with your Microsoft work account. Access is controlled by Entra app roles.</p><button type="button" onClick={signInWithMicrosoft} disabled={microsoftLoading}>{microsoftLoading ? 'Signing in with Microsoft...' : 'Sign in with Microsoft'}</button>{error && <p className="error">{error}</p>}</div></div>
}
