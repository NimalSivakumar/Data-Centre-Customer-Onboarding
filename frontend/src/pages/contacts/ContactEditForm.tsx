import { useState } from 'react'
import type { FormEvent } from 'react'
import type { Contact } from '../../types/api'

const contactTypes = ['TECHNICAL', 'FINANCE', 'EMERGENCY', 'MANAGEMENT', 'OTHER']

type ContactEditFormProps = {
  contact: Contact
  saving: boolean
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onCancel: () => void
}

export function ContactEditForm({ contact, saving, onSubmit, onCancel }: ContactEditFormProps) {
  const [draft, setDraft] = useState(contact)
  if (draft.id !== contact.id) setDraft(contact)
  const current = draft.id === contact.id ? draft : contact
  const field = (name: 'full_name' | 'email' | 'phone' | 'job_title' | 'contact_type' | 'status') => ({
    name,
    value: current[name] ?? '',
    disabled: saving,
    onChange: (event: { target: { value: string } }) => setDraft({ ...current, [name]: event.target.value }),
  })

  return (
    <form onSubmit={onSubmit} className="form-grid compact action-form">
      <input {...field('full_name')} aria-label="Full name" placeholder="Full name" required />
      <input {...field('email')} aria-label="Email" placeholder="Email" type="email" required />
      <input {...field('phone')} aria-label="Phone" placeholder="Phone" required />
      <input {...field('job_title')} aria-label="Job title" placeholder="Job title" />
      <select {...field('contact_type')} aria-label="Contact type">
        {contactTypes.map((value) => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}
      </select>
      <select {...field('status')} aria-label="Contact status">
        <option value="ACTIVE">Active</option>
        <option value="INACTIVE">Inactive</option>
      </select>
      <label className="checkbox">
        <input
          name="is_primary"
          type="checkbox"
          checked={current.is_primary ?? false}
          disabled={saving}
          onChange={(event) => setDraft({ ...current, is_primary: event.target.checked })}
        /> Primary contact
      </label>
      <button disabled={saving}>{saving ? 'Saving...' : 'Save changes'}</button>
      <button type="button" className="secondary" disabled={saving} onClick={onCancel}>Cancel</button>
    </form>
  )
}
