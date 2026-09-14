import type { FormEvent } from 'react'
import type { InternalUser } from '../../types/api'

type InternalUserEditFormProps = {
  user: InternalUser
  saving: boolean
  onCancel: () => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}

export function InternalUserEditForm({ user, saving, onCancel, onSubmit }: InternalUserEditFormProps) {
  return <form onSubmit={onSubmit} className="form-grid compact"><input name="full_name" placeholder="Full name" defaultValue={user.full_name} /><input name="email" type="email" placeholder="Email" defaultValue={user.email} /><select name="role" defaultValue={user.role}><option value="OPS">OPS</option><option value="SECURITY">SECURITY</option></select><select name="status" defaultValue={user.status}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select><button disabled={saving}>{saving ? <><span className="spinner" />Saving...</> : 'Save changes'}</button><button type="button" className="secondary" onClick={onCancel}>Cancel</button></form>
}
