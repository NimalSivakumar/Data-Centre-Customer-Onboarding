import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { api } from '../../api/client'
import { hasAnyRole } from '../../auth/permissions'
import { Page } from '../../components/Page'
import { FIXED_SITE_LOCATION } from '../../constants/app'
import type { AccessRequest, AuthState, Company, Contact, ListResponse } from '../../types/api'

type VisitorDraft = {
  visitor_full_name: string
  visitor_company: string
  visitor_id_number: string
  visitor_phone: string
  visitor_email: string
  visitor_address: string
  vehicle_registration: string
  equipment_carried: string
  special_instructions: string
}

type PendingRequest = Record<string, unknown> & { visitors: Record<string, unknown>[] }

const emptyVisitor: VisitorDraft = { visitor_full_name: '', visitor_company: '', visitor_id_number: '', visitor_phone: '', visitor_email: '', visitor_address: '', vehicle_registration: '', equipment_carried: '', special_instructions: '' }

export function VisitorRequestPage({ auth }: { auth: AuthState }) {
  const [companies, setCompanies] = useState<Company[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [selectedCompanyId, setSelectedCompanyId] = useState('')
  const [visitors, setVisitors] = useState<VisitorDraft[]>([{ ...emptyVisitor }])
  const [pendingRequest, setPendingRequest] = useState<PendingRequest | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const isCustomer = hasAnyRole(auth.user, ['CUSTOMER_ADMIN', 'CUSTOMER_USER'])
  const isInternalUser = hasAnyRole(auth.user, ['ADMIN', 'OPS'])

  useEffect(() => {
    api<ListResponse<Company>>('/companies', auth)
      .then((data) => {
        setCompanies(data.items)
        if (data.items.length === 1) setSelectedCompanyId(data.items[0].id)
      })
      .catch((err: Error) => setError(err.message))
  }, [auth])

  useEffect(() => {
    if (!isInternalUser || !selectedCompanyId) {
      setContacts([])
      return
    }
    api<Contact[]>(`/companies/${selectedCompanyId}/contacts`, auth)
      .then((items) => setContacts(items.filter((contact) => contact.status === 'ACTIVE')))
      .catch((err: Error) => setError(err.message))
  }, [auth, isInternalUser, selectedCompanyId])

  function updateVisitor(index: number, field: keyof VisitorDraft, value: string) {
    setVisitors((current) => current.map((visitor, itemIndex) => itemIndex === index ? { ...visitor, [field]: value } : visitor))
  }

  function addVisitor() {
    setVisitors((current) => [...current, { ...emptyVisitor }])
  }

  function removeVisitor(index: number) {
    setVisitors((current) => current.length === 1 ? current : current.filter((_, itemIndex) => itemIndex !== index))
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const payload = cleanPayload(Object.fromEntries(form.entries()))
    const cleanedVisitors = visitors.map((visitor) => cleanPayload(visitor)).filter((visitor) => visitor.visitor_full_name || visitor.visitor_id_number)
    setError('')
    setMessage('')
    if (String(payload.expected_departure_time) <= String(payload.expected_arrival_time)) {
      setError('Expected departure time must be after expected arrival time')
      return
    }
    if (cleanedVisitors.length === 0 || cleanedVisitors.some((visitor) => !visitor.visitor_full_name || !visitor.visitor_id_number)) {
      setError('Each visitor must have a name and ID number')
      return
    }
    setPendingRequest({ ...payload, visitors: cleanedVisitors })
  }

  async function confirmSubmit() {
    if (!pendingRequest) return
    setSubmitting(true)
    setError('')
    setMessage('')
    try {
      const request = await api<AccessRequest>('/visitor-access-requests', auth, { method: 'POST', body: JSON.stringify(pendingRequest) })
      setVisitors([{ ...emptyVisitor }])
      setPendingRequest(null)
      setMessage(`Visitor request submitted${request.request_number ? `: ${request.request_number}` : ''}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit visitor request')
    } finally {
      setSubmitting(false)
    }
  }

  const selectedCompanyName = companies.find((company) => company.id === selectedCompanyId)?.name ?? 'Selected company'

  return <Page title="Submit visitor request" error={error} message={message}><section className="panel request-panel">{isCustomer && companies.length === 0 && <div className="alert alert-warning">Your account is not assigned to a company yet. Contact an administrator before submitting visitor requests.</div>}<form onSubmit={submit} className="request-form"><div className="form-section"><h2>Visit details</h2><div className="form-grid"><label>Customer company{isCustomer && companies.length === 1 && <input type="hidden" name="company_id" value={selectedCompanyId} />}<select name={isCustomer && companies.length === 1 ? undefined : 'company_id'} required value={selectedCompanyId} onChange={(event) => setSelectedCompanyId(event.target.value)} disabled={isCustomer && companies.length === 1}><option value="">Choose company</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label><label>Visit date<input name="visit_date" type="date" required /></label><label>Expected arrival time<input name="expected_arrival_time" type="time" required /></label><label>Expected departure time<input name="expected_departure_time" type="time" required /></label><label>Site/location<input name="site_location" value={FIXED_SITE_LOCATION} readOnly /></label>{isInternalUser ? <label>Host/contact name<select name="host_contact_name" required disabled={!selectedCompanyId}><option value="">{selectedCompanyId ? 'Choose company contact' : 'Choose company first'}</option>{contacts.map((contact) => <option key={contact.id} value={contact.full_name}>{contact.full_name} {contact.email ? `- ${contact.email}` : ''}</option>)}</select></label> : <label>Host/contact name<input name="host_contact_name" value={auth.user.full_name} readOnly /></label>}<label className="full-span">Purpose of visit<textarea name="visit_reason" placeholder="Brief description of the purpose of the visit" required /></label></div></div><div className="form-section"><div className="section-heading"><div><h2>Visitor details</h2><p className="help-text mb-0">Add all individuals attending this visit. Security will check each visitor in/out separately.</p></div><button type="button" className="table-action" onClick={addVisitor}>Add visitor</button></div><div className="visitor-list">{visitors.map((visitor, index) => <article className="visitor-entry" key={index}><div className="section-heading"><h3>Visitor {index + 1}</h3>{visitors.length > 1 && <button type="button" className="table-action danger" onClick={() => removeVisitor(index)}>Remove</button>}</div><div className="form-grid compact"><label>Name<input value={visitor.visitor_full_name} onChange={(event) => updateVisitor(index, 'visitor_full_name', event.target.value)} required /></label><label>Company<input value={visitor.visitor_company} onChange={(event) => updateVisitor(index, 'visitor_company', event.target.value)} /></label><label>ID number<input value={visitor.visitor_id_number} onChange={(event) => updateVisitor(index, 'visitor_id_number', event.target.value)} required /></label><label>Phone<input value={visitor.visitor_phone} onChange={(event) => updateVisitor(index, 'visitor_phone', event.target.value)} /></label><label>Email<input type="email" value={visitor.visitor_email} onChange={(event) => updateVisitor(index, 'visitor_email', event.target.value)} /></label><label>Vehicle registration<input value={visitor.vehicle_registration} onChange={(event) => updateVisitor(index, 'vehicle_registration', event.target.value)} /></label><label className="full-span">Address<textarea value={visitor.visitor_address} onChange={(event) => updateVisitor(index, 'visitor_address', event.target.value)} /></label><label>Equipment carried<textarea value={visitor.equipment_carried} onChange={(event) => updateVisitor(index, 'equipment_carried', event.target.value)} /></label><label>Special instructions<textarea value={visitor.special_instructions} onChange={(event) => updateVisitor(index, 'special_instructions', event.target.value)} /></label></div></article>)}</div></div><div className="form-actions"><button className="btn btn-primary" disabled={submitting}>{submitting ? <><span className="spinner" />Submitting...</> : 'Review and submit'}</button></div></form></section>{pendingRequest && <div className="dialog-backdrop" role="presentation"><div className="details-dialog" role="dialog" aria-modal="true" aria-labelledby="request-confirm-title"><div><p className="eyebrow">Confirm request</p><h2 id="request-confirm-title">Submit visitor access request?</h2><p>Please review the details below before submitting.</p></div><dl className="details-list"><div><dt>Company</dt><dd>{selectedCompanyName}</dd></div><div><dt>Visit date</dt><dd>{String(pendingRequest.visit_date)}</dd></div><div><dt>Arrival</dt><dd>{String(pendingRequest.expected_arrival_time)}</dd></div><div><dt>Departure</dt><dd>{String(pendingRequest.expected_departure_time)}</dd></div><div><dt>Host/contact</dt><dd>{String(pendingRequest.host_contact_name)}</dd></div><div><dt>Visitors</dt><dd>{pendingRequest.visitors.map((visitor, index) => `${index + 1}. ${visitor.visitor_full_name} - ${visitor.visitor_id_number}${visitor.visitor_company ? ` - ${visitor.visitor_company}` : ''}`).join('\n')}</dd></div><div className="full-span"><dt>Purpose</dt><dd>{String(pendingRequest.visit_reason)}</dd></div></dl><div className="dialog-actions"><button type="button" className="secondary" onClick={() => setPendingRequest(null)} disabled={submitting}>No, edit request</button><button type="button" onClick={confirmSubmit} disabled={submitting}>{submitting ? <><span className="spinner" />Submitting...</> : 'Yes, submit request'}</button></div></div></div>}</Page>
}

function cleanPayload<T extends Record<string, unknown>>(payload: T) {
  return Object.fromEntries(Object.entries(payload).map(([key, value]) => [key, value === '' ? null : value]))
}
