import type { FormEvent } from 'react'

type InternalUserCreateFormProps = {
  saving: boolean
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}

export function InternalUserCreateForm({ saving, onSubmit }: InternalUserCreateFormProps) {
  return <form onSubmit={onSubmit} className="form-grid compact action-form"><input name="full_name" placeholder="Full name *" required /><input name="email" type="email" placeholder="Email *" required /><select name="role" defaultValue="OPS"><option value="OPS">OPS</option><option value="SECURITY">SECURITY</option></select><select name="status" defaultValue="ACTIVE"><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select><button className="btn btn-primary" disabled={saving}>{saving ? <><span className="spinner" />Creating...</> : 'Create account'}</button></form>
}
