import type { FormEvent } from 'react'
import type { Company } from '../../types/api'

const contactTypeOptions = ['TECHNICAL', 'FINANCE', 'EMERGENCY', 'MANAGEMENT', 'OTHER']

export function ContactForm({ companies, selected, onSubmit }: { companies: Company[]; selected: Company | null; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <form onSubmit={onSubmit} className="form-grid compact action-form"><select name="company_id" defaultValue={selected?.id ?? ''} required>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select><input name="full_name" placeholder="Full name *" required /><input name="email" placeholder="Email *" type="email" required /><input name="phone" placeholder="Phone *" required /><input name="job_title" placeholder="Job title" /><select name="contact_type" defaultValue="OTHER">{contactTypeOptions.map((value) => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</select><label className="checkbox"><input name="is_primary" type="checkbox" /> Primary contact</label><button>Create contact</button></form>
}
