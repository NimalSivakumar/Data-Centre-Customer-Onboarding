import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../../api/client'
import { DataTable } from '../../components/DataTable'
import { Page } from '../../components/Page'
import { SearchFilterBar } from '../../components/SearchFilterBar'
import { TableActionButton } from '../../components/TableActionButton'
import type { AuthState, Company, Contact, ListResponse } from '../../types/api'
import { cleanFormPayload } from '../../utils/forms'
import { ContactForm } from './ContactsUsersForms'

type ContactsUsersPageMode = 'contacts'

export function ContactsUsersPage({ auth }: { auth: AuthState; page: ContactsUsersPageMode }) {
  const [searchParams] = useSearchParams()
  const [companies, setCompanies] = useState<Company[]>([])
  const [selected, setSelected] = useState<Company | null>(null)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [editingContact, setEditingContact] = useState<Contact | null>(null)
  const editContactRef = useRef<HTMLElement | null>(null)
  const isListAction = searchParams.get('action') === 'list'

  useEffect(() => {
    api<ListResponse<Company>>('/companies', auth)
      .then((data) => { setCompanies(data.items); setSelected(data.items[0] ?? null) })
      .catch((err: Error) => setError(err.message))
  }, [auth])

  useEffect(() => { if (selected) loadContacts(selected.id).catch((err: Error) => setError(err.message)) }, [selected, auth])
  useEffect(() => { if (editingContact) editContactRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }, [editingContact])

  async function loadContacts(companyId = selected?.id) {
    if (!companyId) return
    setContacts(await api<Contact[]>(`/companies/${companyId}/contacts`, auth))
  }

  async function createContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const companyId = String(form.get('company_id') || selected?.id || '')
    if (!companyId) return
    form.delete('company_id')
    setError('')
    try {
      await api<Contact>(`/companies/${companyId}/contacts`, auth, { method: 'POST', body: JSON.stringify({ ...cleanFormPayload(form), is_primary: form.has('is_primary') }) })
      formElement.reset()
      setMessage('Contact created')
      setSelected(companies.find((company) => company.id === companyId) ?? selected)
      await loadContacts(companyId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create contact')
    }
  }

  async function updateContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editingContact) return
    const form = new FormData(event.currentTarget)
    setError('')
    try {
      await api<Contact>(`/contacts/${editingContact.id}`, auth, { method: 'PATCH', body: JSON.stringify({ ...cleanFormPayload(form), is_primary: form.has('is_primary') }) })
      setEditingContact(null)
      setMessage('Contact updated')
      await loadContacts()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update contact')
    }
  }

  const normalizedSearch = search.trim().toLowerCase()
  const filteredContacts = contacts.filter((contact) => (!normalizedSearch || [contact.full_name, contact.email, contact.phone, contact.job_title, contact.contact_type].some((value) => String(value ?? '').toLowerCase().includes(normalizedSearch))) && (!statusFilter || contact.status === statusFilter))
  const contactRows = filteredContacts.map((contact) => ({ ...contact, contact_type_label: contact.contact_type.replaceAll('_', ' '), contact_status: <span className={`badge ${contact.status === 'INACTIVE' ? 'text-bg-warning' : 'text-bg-success'}`}>{contact.status === 'INACTIVE' ? 'Inactive' : 'Active'}</span>, primary: contact.is_primary ? 'Primary' : '' }))

  return <Page title="Contacts" error={error} message={message}>{isListAction && <section className="panel list-panel"><div className="section-heading list-heading"><div><h2>Contact directory</h2><p className="help-text mb-0">Choose a company to view contacts.</p></div><span className="badge text-bg-secondary">{filteredContacts.length} records</span></div><div className="filter-bar"><label>Company<select value={selected?.id ?? ''} onChange={(event) => setSelected(companies.find((company) => company.id === event.target.value) ?? null)}><option value="">Choose company</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.name} {company.customer_code ? `- ${company.customer_code}` : ''}</option>)}</select></label></div><SearchFilterBar search={search} onSearchChange={setSearch} placeholder="Search name, email, phone, or job title..." resultCount={filteredContacts.length} filters={[{ label: 'Status', value: statusFilter, onChange: setStatusFilter, options: [{ label: 'All statuses', value: '' }, { label: 'Active', value: 'ACTIVE' }, { label: 'Inactive', value: 'INACTIVE' }] }]} onClear={() => { setSearch(''); setStatusFilter('') }} />{selected && <DataTable rows={contactRows} columns={['full_name', 'email', 'phone', 'job_title', 'contact_type_label', 'contact_status', 'primary']} labels={{ contact_type_label: 'Contact Type' }} emptyMessage="No contacts match your filters." actions={(contact) => <TableActionButton type="button" onClick={() => setEditingContact(contact as Contact)}>Edit</TableActionButton>} />}</section>}{!isListAction && <section className="panel"><h2>Create contact</h2><p className="help-text">Contacts are business records only. They do not receive login credentials.</p><ContactForm companies={companies} selected={selected} onSubmit={createContact} /></section>}{editingContact && <section className="panel" ref={editContactRef}><h2>Edit contact</h2><form onSubmit={updateContact} className="form-grid compact action-form"><input name="full_name" defaultValue={editingContact.full_name} placeholder="Full name" required /><input name="email" defaultValue={editingContact.email ?? ''} placeholder="Email" type="email" /><input name="phone" defaultValue={editingContact.phone ?? ''} placeholder="Phone" /><input name="job_title" defaultValue={editingContact.job_title ?? ''} placeholder="Job title" /><select name="contact_type" defaultValue={editingContact.contact_type}>{['TECHNICAL', 'FINANCE', 'EMERGENCY', 'MANAGEMENT', 'OTHER'].map((value) => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</select><select name="status" defaultValue={editingContact.status}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select><label className="checkbox"><input name="is_primary" type="checkbox" defaultChecked={editingContact.is_primary} /> Primary contact</label><button>Save contact</button><button type="button" className="secondary" onClick={() => setEditingContact(null)}>Cancel</button></form></section>}</Page>
}
