type CredentialCardProps = {
  email: string
  password: string
}

export function CredentialCard({ email, password }: CredentialCardProps) {
  return (
    <div className="credential-card">
      <strong>Temporary login credentials</strong>
      <span>Email: <code>{email}</code></span>
      <span>Password: <code>{password}</code></span>
      <small>Shown once after creation. Ask the user to change it after first login.</small>
    </div>
  )
}
