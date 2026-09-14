import type { FormEvent } from 'react'
import type { Company } from '../../types/api'

type CompanyEditFormProps = {
  company: Company
  saving: boolean
  onCancel: () => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}

export function CompanyEditForm({ company, saving, onCancel, onSubmit }: CompanyEditFormProps) {
  return <form onSubmit={onSubmit} className="form-grid compact"><input name="name" placeholder="Company name" defaultValue={company.name} /><input name="customer_code" placeholder="Customer code" defaultValue={company.customer_code ?? ''} /><input name="main_email" placeholder="Main email" type="email" defaultValue={company.main_email ?? ''} /><input name="main_phone" placeholder="Main phone" defaultValue={company.main_phone ?? ''} /><select name="status" defaultValue={company.status}><option value="ACTIVE">Active</option><option value="PENDING">Pending</option><option value="SUSPENDED">Suspended</option><option value="CLOSED">Closed</option></select><textarea name="notes" placeholder="Notes" defaultValue={company.notes ?? ''} /><button disabled={saving}>{saving ? <><span className="spinner" />Saving...</> : 'Save changes'}</button><button type="button" className="secondary" onClick={onCancel}>Cancel</button></form>
}
