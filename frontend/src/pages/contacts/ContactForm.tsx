import type { FormEvent } from 'react'
import type { Company } from '../../types/api'

const contactTypeOptions = ['TECHNICAL', 'FINANCE', 'EMERGENCY', 'MANAGEMENT', 'OTHER']

type ContactFormProps = {
  companies: Company[]
  selected: Company | null
  saving: boolean
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}

export function ContactForm({ companies, selected, saving, onSubmit }: ContactFormProps) {
  return (
    <form onSubmit={onSubmit} className="form-grid compact action-form">
      <select name="company_id" aria-label="Company" defaultValue={selected?.id ?? ''} disabled={saving} required>
        <option value="">Choose company</option>
        {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
      </select>
      <input name="full_name" aria-label="Full name" placeholder="Full name *" disabled={saving} required />
      <input name="email" aria-label="Email" placeholder="Email *" type="email" disabled={saving} required />
      <input name="phone" aria-label="Phone" placeholder="Phone *" disabled={saving} required />
      <input name="job_title" aria-label="Job title" placeholder="Job title" disabled={saving} />
      <select name="contact_type" aria-label="Contact type" defaultValue="OTHER" disabled={saving}>
        {contactTypeOptions.map((value) => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}
      </select>
      <label className="checkbox"><input name="is_primary" type="checkbox" disabled={saving} /> Primary contact</label>
      <button disabled={saving || companies.length === 0}>{saving ? 'Creating...' : 'Create contact'}</button>
    </form>
  )
}
