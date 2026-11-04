import { useState } from 'react'
import type { FormEvent } from 'react'
import type { Company } from '../../types/api'

type CompanyEditFormProps = {
  company: Company
  saving: boolean
  onCancel: () => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}

export function CompanyEditForm({ company, saving, onCancel, onSubmit }: CompanyEditFormProps) {
  const [draft, setDraft] = useState(company)
  // Derive the new record immediately; no effect-sized window with the old draft.
  if (draft.id !== company.id) setDraft(company)
  const current = draft.id === company.id ? draft : company
  const field = (name: 'name' | 'customer_code' | 'main_email' | 'main_phone' | 'status' | 'notes') => ({
    name,
    value: current[name] ?? '',
    disabled: saving,
    onChange: (event: { target: { value: string } }) => setDraft({ ...current, [name]: event.target.value }),
  })

  return (
    <form onSubmit={onSubmit} className="form-grid compact">
      <input {...field('name')} aria-label="Company name" placeholder="Company name" />
      <input {...field('customer_code')} aria-label="Customer code" placeholder="Customer code" />
      <input {...field('main_email')} aria-label="Main email" placeholder="Main email" type="email" />
      <input {...field('main_phone')} aria-label="Main phone" placeholder="Main phone" />
      <select {...field('status')} aria-label="Company status">
        <option value="ACTIVE">Active</option>
        <option value="PENDING">Pending</option>
        <option value="SUSPENDED">Suspended</option>
        <option value="CLOSED">Closed</option>
      </select>
      <textarea {...field('notes')} aria-label="Notes" placeholder="Notes" />
      <button disabled={saving}>{saving ? 'Saving...' : 'Save changes'}</button>
      <button type="button" className="secondary" disabled={saving} onClick={onCancel}>Cancel</button>
    </form>
  )
}
