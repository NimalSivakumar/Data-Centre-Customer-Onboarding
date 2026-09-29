import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { api } from '../../api/client'
import { Page } from '../../components/Page'
import { FIXED_SITE_LOCATION } from '../../constants/app'
import type { AccessRequest, AuthState, Company, Contact, ListResponse } from '../../types/api'
import { cleanPayload } from './visitorRequestHelpers'
import { emptyVisitor, type PendingRequest, type VisitorDraft } from './visitorRequestTypes'

export function VisitorRequestPage({ auth }: { auth: AuthState }) {
  const [companies, setCompanies] = useState<Company[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [selectedCompanyId, setSelectedCompanyId] = useState('')
  const [visitors, setVisitors] = useState<VisitorDraft[]>([{ ...emptyVisitor }])
  const [pendingRequest, setPendingRequest] = useState<PendingRequest | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    api<ListResponse<Company>>('/companies', auth)
      .then((data) => {
        setCompanies(data.items)
        if (data.items.length === 1) setSelectedCompanyId(data.items[0].id)
      })
      .catch((err: Error) => setError(err.message))
  }, [auth])

  useEffect(() => {
    if (!selectedCompanyId) {
      setContacts([])
      return
    }
    api<Contact[]>(`/companies/${selectedCompanyId}/contacts`, auth)
      .then((items) => setContacts(items.filter((contact) => contact.status === 'ACTIVE')))
      .catch((err: Error) => setError(err.message))
  }, [auth, selectedCompanyId])

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

  return <Page title="Submit visitor request" error={error} message={message}><section className="panel request-panel"><form onSubmit={submit} className="request-form"><div className="form-section"><h2>Visit details</h2><div className="form-grid"><label>Customer company<select name="company_id" required value={selectedCompanyId} onChange={(event) => setSelectedCompanyId(event.target.value)}><option value="">Choose company</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label><label>Visit date<input name="visit_date" type="date" required /></label><label>Expected arrival time<input name="expected_arrival_time" type="time" required /></label><label>Expected departure time<input name="expected_departure_time" type="time" required /></label><label>Site/location<input name="site_location" value={FIXED_SITE_LOCATION} readOnly /></label><label>Host/contact name<select name="host_contact_name" required disabled={!selectedCompanyId}><option value="">{selectedCompanyId ? 'Choose company contact' : 'Choose company first'}</option>{contacts.map((contact) => <option key={contact.id} value={contact.full_name}>{contact.full_name} {contact.email ? `- ${contact.email}` : ''}</option>)}</select></label><label className="full-span">Purpose of visit<textarea name="visit_reason" placeholder="Brief description of the purpose of the visit" required /></label></div></div><div className="form-section"><div className="section-heading"><div><h2>Visitors</h2><p className="help-text mb-0">Add every visitor included in this request.</p></div><button type="button" className="secondary" onClick={addVisitor}>Add visitor</button></div>{visitors.map((visitor, index) => <div className="visitor-card" key={index}><div className="visitor-card-header"><strong>Visitor {index + 1}</strong>{visitors.length > 1 && <button type="button" className="secondary" onClick={() => removeVisitor(index)}>Remove</button>}</div><div className="form-grid"><input placeholder="Full name *" value={visitor.visitor_full_name} onChange={(event) => updateVisitor(index, 'visitor_full_name', event.target.value)} /><input placeholder="ID / passport number *" value={visitor.visitor_id_number} onChange={(event) => updateVisitor(index, 'visitor_id_number', event.target.value)} /><input placeholder="Phone" value={visitor.visitor_phone} onChange={(event) => updateVisitor(index, 'visitor_phone', event.target.value)} /><input placeholder="Email" type="email" value={visitor.visitor_email} onChange={(event) => updateVisitor(index, 'visitor_email', event.target.value)} /><input placeholder="Visitor company" value={visitor.visitor_company} onChange={(event) => updateVisitor(index, 'visitor_company', event.target.value)} /><input placeholder="Vehicle registration" value={visitor.vehicle_registration} onChange={(event) => updateVisitor(index, 'vehicle_registration', event.target.value)} /><textarea placeholder="Visitor address" value={visitor.visitor_address} onChange={(event) => updateVisitor(index, 'visitor_address', event.target.value)} /><textarea placeholder="Equipment carried" value={visitor.equipment_carried} onChange={(event) => updateVisitor(index, 'equipment_carried', event.target.value)} /><textarea placeholder="Special instructions" value={visitor.special_instructions} onChange={(event) => updateVisitor(index, 'special_instructions', event.target.value)} /></div></div>)}</div><button type="submit" disabled={submitting}>{submitting ? 'Submitting...' : 'Review request'}</button></form>{pendingRequest && <div className="confirm-panel"><h3>Confirm submission</h3><p>Submit visitor access request for {pendingRequest.visitors.length} visitor{pendingRequest.visitors.length === 1 ? '' : 's'} to {selectedCompanyName}?</p><button type="button" onClick={confirmSubmit} disabled={submitting}>{submitting ? 'Submitting...' : 'Confirm and submit'}</button><button type="button" className="secondary" onClick={() => setPendingRequest(null)}>Edit request</button></div>}</section></Page>
}
