import type { FormEvent } from 'react'

type CompanyCreateFormProps = {
  saving: boolean
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}

export function CompanyCreateForm({ saving, onSubmit }: CompanyCreateFormProps) {
  return <form onSubmit={onSubmit} className="form-grid action-form"><input name="name" placeholder="Company name *" required /><input name="customer_code" placeholder="Customer code *" required /><input name="registration_number" placeholder="Registration number" /><input name="main_email" placeholder="Main email *" type="email" required /><input name="main_phone" placeholder="Main phone *" required /><textarea name="address" placeholder="Address" /><button disabled={saving}>{saving ? <><span className="spinner" />Creating...</> : 'Create company'}</button></form>
}
