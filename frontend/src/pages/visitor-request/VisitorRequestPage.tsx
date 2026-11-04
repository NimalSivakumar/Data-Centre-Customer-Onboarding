import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { api } from '../../api/client'
import { loadAllCompanies } from '../../api/companyLookup'
import { Page } from '../../components/Page'
import { getSiteSettings } from '../../api/siteSettings'
import type { AccessRequest, AuthState, Company, Contact } from '../../types/api'
import { cleanPayload } from './visitorRequestHelpers'
import { emptyVisitor, type PendingRequest, type VisitorDraft } from './visitorRequestTypes'

export function VisitorRequestPage({ auth }: { auth: AuthState }) {
  const { site_location: siteLocation } = getSiteSettings()
  const [companies, setCompanies] = useState<Company[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [contactsLoading, setContactsLoading] = useState(false)
  const [selectedCompanyId, setSelectedCompanyId] = useState('')
  const [visitors, setVisitors] = useState<VisitorDraft[]>([{ ...emptyVisitor }])
  const [pendingRequest, setPendingRequest] = useState<PendingRequest | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const submittingRef = useRef(false)

  useEffect(() => {
    let active = true
    loadAllCompanies(auth)
      .then((items) => {
        if (!active) return
        setCompanies(items)
        if (items.length === 1) setSelectedCompanyId(items[0].id)
      })
      .catch((err: Error) => { if (active) setError(err.message) })
    return () => { active = false }
  }, [auth])

  useEffect(() => {
    let active = true
    setContacts([])
    if (!selectedCompanyId) {
      setContactsLoading(false)
      return () => { active = false }
    }
    setContactsLoading(true)
    api<Contact[]>(`/companies/${selectedCompanyId}/contacts`, auth)
      .then((items) => { if (active) setContacts(items.filter((contact) => contact.status === 'ACTIVE')) })
      .catch((err: Error) => { if (active) setError(err.message) })
      .finally(() => { if (active) setContactsLoading(false) })
    return () => { active = false }
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
    if (pendingRequest || submittingRef.current) return
    if (contactsLoading || !selectedCompanyId || !contacts.some((contact) => contact.full_name === payload.host_contact_name)) {
      setError('Choose an active host contact for the current company before reviewing the request')
      return
    }
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
    if (!pendingRequest || submittingRef.current) return
    submittingRef.current = true
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
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  const selectedCompanyName = companies.find((company) => company.id === selectedCompanyId)?.name ?? 'Selected company'

  return (
    <Page title="Submit visitor request" error={error} message={message}>
      <section className="panel request-panel">
        <form onSubmit={submit} className="request-form">
          <fieldset disabled={Boolean(pendingRequest) || submitting} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
            <div className="form-section">
              <h2>Visit details</h2>
              <div className="form-grid">
                <label>Customer company
                  <select name="company_id" required value={selectedCompanyId} onChange={(event) => setSelectedCompanyId(event.target.value)}>
                    <option value="">Choose company</option>
                    {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
                  </select>
                </label>
                <label>Visit date<input name="visit_date" type="date" required /></label>
                <label>Expected arrival time<input name="expected_arrival_time" type="time" required /></label>
                <label>Expected departure time<input name="expected_departure_time" type="time" required /></label>
                <label>Site/location<input name="site_location" value={siteLocation} readOnly /></label>
                <label>Host/contact name
                  <select name="host_contact_name" required disabled={!selectedCompanyId || contactsLoading || contacts.length === 0}>
                    <option value="">{contactsLoading ? 'Loading contacts...' : selectedCompanyId ? 'Choose company contact' : 'Choose company first'}</option>
                    {contacts.map((contact) => <option key={contact.id} value={contact.full_name}>
                      {contact.full_name} {contact.email ? `- ${contact.email}` : ''}
                    </option>)}
                  </select>
                </label>
                <label className="full-span">Purpose of visit
                  <textarea name="visit_reason" placeholder="Brief description of the purpose of the visit" required />
                </label>
              </div>
            </div>
            <div className="form-section">
              <div className="section-heading">
                <div><h2>Visitors</h2><p className="help-text mb-0">Add every visitor included in this request.</p></div>
                <button type="button" className="secondary" onClick={addVisitor}>Add visitor</button>
              </div>
              {visitors.map((visitor, index) => (
                <div className="visitor-card" key={index}>
                  <div className="visitor-card-header">
                    <strong>Visitor {index + 1}</strong>
                    {visitors.length > 1 && <button type="button" className="secondary" onClick={() => removeVisitor(index)}>Remove</button>}
                  </div>
                  <div className="form-grid">
                    <label>Full name (required)
                      <input placeholder="Full name *" value={visitor.visitor_full_name} onChange={(event) => updateVisitor(index, 'visitor_full_name', event.target.value)} />
                    </label>
                    <label>ID / passport number (required)
                      <input placeholder="ID / passport number *" value={visitor.visitor_id_number} onChange={(event) => updateVisitor(index, 'visitor_id_number', event.target.value)} />
                    </label>
                    <label>Phone<input placeholder="Phone" value={visitor.visitor_phone} onChange={(event) => updateVisitor(index, 'visitor_phone', event.target.value)} /></label>
                    <label>Email<input placeholder="Email" type="email" value={visitor.visitor_email} onChange={(event) => updateVisitor(index, 'visitor_email', event.target.value)} /></label>
                    <label>Visitor company<input placeholder="Visitor company" value={visitor.visitor_company} onChange={(event) => updateVisitor(index, 'visitor_company', event.target.value)} /></label>
                    <label>Vehicle registration<input placeholder="Vehicle registration" value={visitor.vehicle_registration} onChange={(event) => updateVisitor(index, 'vehicle_registration', event.target.value)} /></label>
                    <label>Visitor address<textarea placeholder="Visitor address" value={visitor.visitor_address} onChange={(event) => updateVisitor(index, 'visitor_address', event.target.value)} /></label>
                    <label>Equipment carried<textarea placeholder="Equipment carried" value={visitor.equipment_carried} onChange={(event) => updateVisitor(index, 'equipment_carried', event.target.value)} /></label>
                    <label>Special instructions<textarea placeholder="Special instructions" value={visitor.special_instructions} onChange={(event) => updateVisitor(index, 'special_instructions', event.target.value)} /></label>
                  </div>
                </div>
              ))}
            </div>
            <button type="submit" disabled={submitting}>{submitting ? 'Submitting...' : 'Review request'}</button>
          </fieldset>
        </form>
        {pendingRequest && (
          <div className="confirm-panel" role="region" aria-label="Review request">
            <h3>Confirm submission</h3>
            <p>Submit visitor access request for {pendingRequest.visitors.length} visitor{pendingRequest.visitors.length === 1 ? '' : 's'} to {selectedCompanyName}?</p>
            <button type="button" onClick={confirmSubmit} disabled={submitting}>{submitting ? 'Submitting...' : 'Confirm and submit'}</button>
            <button type="button" className="secondary" disabled={submitting} onClick={() => { if (!submittingRef.current) setPendingRequest(null) }}>Edit request</button>
          </div>
        )}
      </section>
    </Page>
  )
}
