import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../../api/client'
import { DataTable } from '../../components/DataTable'
import { Page } from '../../components/Page'
import { SearchFilterBar } from '../../components/SearchFilterBar'
import type { AuthState, Company, CompanyUser, Contact, ListResponse } from '../../types/api'
import { cleanFormPayload } from '../../utils/forms'
import { ContactForm, ExistingUserForm, NewUserForm } from './ContactsUsersForms'

type ContactsUsersPageMode = 'contacts' | 'users'
type ContactsUsersAction = 'contact' | 'contact-list' | 'new-user' | 'existing-user' | 'user-list'

const contactTypeOptions = ['TECHNICAL', 'FINANCE', 'EMERGENCY', 'MANAGEMENT', 'OTHER']

export function ContactsUsersPage({ auth, page }: { auth: AuthState; page: ContactsUsersPageMode }) {
  const [searchParams] = useSearchParams()
  const [companies, setCompanies] = useState<Company[]>([])
  const [selected, setSelected] = useState<Company | null>(null)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [companyUsers, setCompanyUsers] = useState<CompanyUser[]>([])
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [editingContact, setEditingContact] = useState<Contact | null>(null)
  const [temporaryCredential, setTemporaryCredential] = useState<{ email: string; password: string } | null>(null)
  const editContactRef = useRef<HTMLElement | null>(null)
  const actionMode = getContactsUsersAction(page, searchParams.get('action'))

  useEffect(() => {
    api<ListResponse<Company>>('/companies', auth)
      .then((data) => { setCompanies(data.items); setSelected(data.items[0] ?? null) })
      .catch((err: Error) => setError(err.message))
  }, [auth])

  useEffect(() => { if (selected) loadContactsUsers().catch((err: Error) => setError(err.message)) }, [selected, auth])
  useEffect(() => { if (editingContact) editContactRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }, [editingContact])

  async function loadContactsUsers(companyId = selected?.id) {
    if (!companyId) return
    const [companyContacts, users] = await Promise.all([
      api<Contact[]>(`/companies/${companyId}/contacts`, auth),
      api<CompanyUser[]>(`/companies/${companyId}/users`, auth),
    ])
    setContacts(companyContacts)
    setCompanyUsers(users)
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
      await loadContactsUsers(companyId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create contact')
    }
  }

  async function createCustomerUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const companyId = String(form.get('company_id') || selected?.id || '')
    if (!companyId) return
    form.delete('company_id')
    setError('')
    setTemporaryCredential(null)
    try {
      const user = await api<CompanyUser>(`/companies/${companyId}/users`, auth, { method: 'POST', body: JSON.stringify({ ...cleanFormPayload(form), is_primary: form.has('is_primary') }) })
      formElement.reset()
      setSelected(companies.find((company) => company.id === companyId) ?? selected)
      setMessage(user.temporary_password ? 'Customer user created. Temporary credentials are shown below.' : 'Customer user linked to contact.')
      if (user.temporary_password) setTemporaryCredential({ email: user.email, password: user.temporary_password })
      await loadContactsUsers(companyId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create customer user')
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
      await loadContactsUsers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update contact')
    }
  }

  function editCompanyUser(user: CompanyUser) {
    const contact = contacts.find((item) => item.id === user.contact_id)
    if (!contact) { setError('This user is not linked to an editable contact.'); return }
    setError('')
    setEditingContact(contact)
  }

  const contactsWithoutUsers = contacts.filter((contact) => contact.user_account_status === 'NO_USER')
  const isContactsPage = page === 'contacts'
  const isUsersPage = page === 'users'
  const isListAction = actionMode === 'contact-list' || actionMode === 'user-list'
  const normalizedSearch = search.trim().toLowerCase()
  const filteredContacts = contacts.filter((contact) => (!normalizedSearch || [contact.full_name, contact.email, contact.phone, contact.job_title, contact.contact_type].some((value) => String(value ?? '').toLowerCase().includes(normalizedSearch))) && (!statusFilter || contact.status === statusFilter))
  const filteredCompanyUsers = companyUsers.filter((user) => (!normalizedSearch || [user.full_name, user.email, user.role, user.status].some((value) => String(value ?? '').toLowerCase().includes(normalizedSearch))) && (!statusFilter || user.status === statusFilter) && (!roleFilter || user.role === roleFilter))
  const contactRows = filteredContacts.map((contact) => ({ ...contact, contact_type_label: contact.contact_type.replaceAll('_', ' '), contact_status: <span className={`badge ${contact.status === 'INACTIVE' ? 'text-bg-warning' : 'text-bg-success'}`}>{contact.status === 'INACTIVE' ? 'Inactive' : 'Active'}</span>, primary: contact.is_primary ? 'Primary' : '', login_access: contact.user_account_status === 'NO_USER' ? 'No login' : `${contact.user_account_status.replace('_USER', '').toLowerCase()}${contact.user_role ? ` - ${contact.user_role.replace('CUSTOMER_', '')}` : ''}` }))

  return <Page title={isContactsPage ? 'Contacts' : 'Users'} error={error} message={message}>{isListAction && <section className="panel list-panel"><div className="section-heading list-heading"><div><h2>{isContactsPage ? 'Contact directory' : 'User directory'}</h2><p className="help-text mb-0">Choose a company to view {isContactsPage ? 'contacts' : 'users'}.</p></div><span className="badge text-bg-secondary">{isContactsPage ? filteredContacts.length : filteredCompanyUsers.length} records</span></div><div className="filter-bar"><label>Company<select value={selected?.id ?? ''} onChange={(event) => setSelected(companies.find((company) => company.id === event.target.value) ?? null)}><option value="">Choose company</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.name} {company.customer_code ? `- ${company.customer_code}` : ''}</option>)}</select></label></div><SearchFilterBar search={search} onSearchChange={setSearch} placeholder={isContactsPage ? 'Search name, email, phone, or job title...' : 'Search name, email, role, or status...'} resultCount={isContactsPage ? filteredContacts.length : filteredCompanyUsers.length} filters={[{ label: 'Status', value: statusFilter, onChange: setStatusFilter, options: [{ label: 'All statuses', value: '' }, { label: 'Active', value: 'ACTIVE' }, { label: 'Inactive', value: 'INACTIVE' }] }, ...(isUsersPage ? [{ label: 'Role', value: roleFilter, onChange: setRoleFilter, options: [{ label: 'All roles', value: '' }, { label: 'Customer Admin', value: 'CUSTOMER_ADMIN' }, { label: 'Customer User', value: 'CUSTOMER_USER' }] }] : [])]} onClear={() => { setSearch(''); setStatusFilter(''); setRoleFilter('') }} />{selected && isContactsPage && <DataTable rows={contactRows} columns={['full_name', 'email', 'phone', 'job_title', 'contact_type_label', 'contact_status', 'primary', 'login_access']} labels={{ contact_type_label: 'Contact Type' }} emptyMessage="No contacts match your filters." actions={(contact) => <button type="button" className="table-action" onClick={() => setEditingContact(contact as Contact)}>Edit</button>} />}{selected && isUsersPage && <DataTable rows={filteredCompanyUsers} columns={['email', 'full_name', 'role', 'status']} emptyMessage="No users match your filters." actions={(user) => <button type="button" className="table-action" onClick={() => editCompanyUser(user as CompanyUser)}>Edit</button>} />}</section>}{!isListAction && <div className="grid two"><section className="panel action-panel"><div className="section-heading"><h2>{contactsUsersActionTitle(actionMode)}</h2></div>{actionMode === 'contact' && <ContactForm companies={companies} selected={selected} onSubmit={createContact} />}{actionMode === 'new-user' && <NewUserForm companies={companies} selected={selected} onSubmit={createCustomerUser} />}{actionMode === 'existing-user' && <ExistingUserForm companies={companies} selected={selected} contacts={contactsWithoutUsers} onSubmit={createCustomerUser} />}{temporaryCredential && <div className="credential-card"><strong>Temporary credentials</strong><span>Email: <code>{temporaryCredential.email}</code></span><span>Password: <code>{temporaryCredential.password}</code></span><small>Shown once. Ask the user to change it at first login.</small></div>}</section></div>}{editingContact && <section className="panel" ref={editContactRef}><h2>Edit contact / login</h2><form onSubmit={updateContact} className="form-grid"><input name="full_name" defaultValue={editingContact.full_name} required /><input name="email" type="email" defaultValue={editingContact.email ?? ''} /><input name="phone" defaultValue={editingContact.phone ?? ''} /><input name="job_title" defaultValue={editingContact.job_title ?? ''} /><select name="contact_type" defaultValue={editingContact.contact_type}>{contactTypeOptions.map((value) => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</select><select name="status" defaultValue={editingContact.status}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select>{editingContact.user_id && <select name="user_role" defaultValue={editingContact.user_role ?? 'CUSTOMER_USER'}><option value="CUSTOMER_ADMIN">Customer Admin</option><option value="CUSTOMER_USER">Customer User</option></select>}{editingContact.user_id && <select name="user_status" defaultValue={editingContact.user_account_status === 'INACTIVE_USER' ? 'INACTIVE' : 'ACTIVE'}><option value="ACTIVE">Active login</option><option value="INACTIVE">Inactive login</option></select>}<label className="checkbox"><input name="is_primary" type="checkbox" defaultChecked={editingContact.is_primary} /> Primary contact</label><button>Save changes</button><button type="button" className="secondary" onClick={() => setEditingContact(null)}>Cancel</button></form></section>}</Page>
}

function getContactsUsersAction(page: ContactsUsersPageMode, value: string | null): ContactsUsersAction {
  if (page === 'users') {
    if (value === 'existing') return 'existing-user'
    if (value === 'list') return 'user-list'
    return 'new-user'
  }
  if (value === 'list') return 'contact-list'
  return 'contact'
}

function contactsUsersActionTitle(value: ContactsUsersAction) {
  if (value === 'new-user') return 'Create new contact and user'
  if (value === 'existing-user') return 'Create user for existing contact'
  if (value === 'user-list') return 'List users'
  if (value === 'contact-list') return 'List contacts'
  return 'Create contact only'
}
