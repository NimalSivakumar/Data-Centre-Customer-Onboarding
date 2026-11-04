import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../../api/client'
import { loadAllCompanies } from '../../api/companyLookup'
import { DataTable } from '../../components/DataTable'
import { Page } from '../../components/Page'
import { SearchFilterBar } from '../../components/SearchFilterBar'
import { TableActionButton } from '../../components/TableActionButton'
import type { AuthState, Company, Contact } from '../../types/api'
import { cleanFormPayload } from '../../utils/forms'
import { ContactForm } from './ContactForm'
import { ContactEditForm } from './ContactEditForm'

export function ContactsPage({ auth }: { auth: AuthState }) {
  const [searchParams] = useSearchParams()
  const [companies, setCompanies] = useState<Company[]>([])
  const [selected, setSelected] = useState<Company | null>(null)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [editingContact, setEditingContact] = useState<Contact | null>(null)
  const generation = useRef(0)
  const editContactRef = useRef<HTMLElement | null>(null)
  const isListAction = searchParams.get('action') === 'list'

  useEffect(() => {
    let active = true
    setCompanies([])
    setSelected(null)
    setContacts([])
    setEditingContact(null)
    setError('')
    loadAllCompanies(auth).then((items) => {
      if (!active) return
      setCompanies(items)
      setSelected(items[0] ?? null)
    }).catch((err: unknown) => {
      if (active) setError(err instanceof Error ? err.message : 'Could not load company directory')
    })
    return () => { active = false; generation.current += 1 }
  }, [auth])

  const loadContacts = useCallback(async (companyId: string) => {
    const current = ++generation.current
    setLoading(true)
    setError('')
    try {
      const items = await api<Contact[]>(`/companies/${companyId}/contacts`, auth)
      if (current === generation.current) setContacts(items)
    } catch (err) {
      if (current === generation.current) {
        setContacts([])
        setError(err instanceof Error ? err.message : 'Could not load contacts')
      }
      throw err
    } finally {
      if (current === generation.current) setLoading(false)
    }
  }, [auth])

  useEffect(() => {
    if (selected) void loadContacts(selected.id).catch(() => {})
    return () => { generation.current += 1 }
  }, [selected, loadContacts])
  useEffect(() => {
    if (editingContact) editContactRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [editingContact])

  function chooseCompany(id: string) {
    if (savingRef.current) return
    generation.current += 1
    setSelected(companies.find((company) => company.id === id) ?? null)
    setContacts([])
    setEditingContact(null)
    setLoading(Boolean(id))
    setError('')
    setMessage('')
  }

  async function createContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (savingRef.current) return
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const companyId = String(form.get('company_id') || selected?.id || '')
    if (!companyId) return
    form.delete('company_id')
    savingRef.current = true
    setSaving(true)
    setMessage('')
    setError('')
    try {
      await api<Contact>(`/companies/${companyId}/contacts`, auth, {
        method: 'POST',
        body: JSON.stringify({ ...cleanFormPayload(form), is_primary: form.has('is_primary') }),
      })
      formElement.reset()
      setMessage('Contact created')
      // Do not replace another company's directory with this creation target.
      if (selected?.id === companyId) {
        await loadContacts(companyId).catch(() => {
          setError('Contact saved, but the directory refresh failed. Refresh the list; do not repeat the save.')
        })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create contact')
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  async function updateContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editingContact || savingRef.current) return
    savingRef.current = true
    setSaving(true)
    setMessage('')
    const form = new FormData(event.currentTarget)
    setError('')
    try {
      await api<Contact>(`/contacts/${editingContact.id}`, auth, {
        method: 'PATCH',
        body: JSON.stringify({ ...cleanFormPayload(form), is_primary: form.has('is_primary') }),
      })
      setEditingContact(null)
      setMessage('Contact updated')
      if (selected) await loadContacts(selected.id).catch(() => {
        setError('Contact saved, but the directory refresh failed. Refresh the list; do not repeat the save.')
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update contact')
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  const normalizedSearch = search.trim().toLowerCase()
  const filteredContacts = contacts.filter((contact) => (
    (!normalizedSearch || [contact.full_name, contact.email, contact.phone, contact.job_title, contact.contact_type]
      .some((value) => String(value ?? '').toLowerCase().includes(normalizedSearch))) &&
    (!statusFilter || contact.status === statusFilter)
  ))
  const contactRows = filteredContacts.map((contact) => ({
    ...contact,
    contact_type_label: contact.contact_type.replaceAll('_', ' '),
    contact_status: (
      <span className={`badge ${contact.status === 'INACTIVE' ? 'text-bg-warning' : 'text-bg-success'}`}>
        {contact.status === 'INACTIVE' ? 'Inactive' : 'Active'}
      </span>
    ),
    primary: contact.is_primary ? 'Primary' : '',
  }))

  return (
    <Page title="Contacts" error={error} message={message}>
      {isListAction && (
        <section className="panel list-panel">
          <div className="section-heading list-heading">
            <div>
              <h2>Contact directory</h2>
              <p className="help-text mb-0">Choose a company to view contacts.</p>
            </div>
            <span className="badge text-bg-secondary">{filteredContacts.length} records</span>
          </div>
          <div className="filter-bar">
            <label>Company
              <select value={selected?.id ?? ''} disabled={saving} onChange={(event) => chooseCompany(event.target.value)}>
                <option value="">Choose company</option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name} {company.customer_code ? `- ${company.customer_code}` : ''}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <SearchFilterBar
            search={search}
            onSearchChange={setSearch}
            placeholder="Search name, email, phone, or job title..."
            resultCount={filteredContacts.length}
            filters={[{
              label: 'Status', value: statusFilter, onChange: setStatusFilter,
              options: [{ label: 'All statuses', value: '' }, { label: 'Active', value: 'ACTIVE' }, { label: 'Inactive', value: 'INACTIVE' }],
            }]}
            onClear={() => { setSearch(''); setStatusFilter('') }}
          />
          {loading && <p role="status">Loading contacts...</p>}
          {selected && !loading && (
            <DataTable
              rows={contactRows}
              columns={['full_name', 'email', 'phone', 'job_title', 'contact_type_label', 'contact_status', 'primary']}
              labels={{ contact_type_label: 'Contact Type' }}
              emptyMessage="No contacts match your filters."
              actions={(contact) => (
                <TableActionButton
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    if (savingRef.current) return
                    setError('')
                    setMessage('')
                    setEditingContact(contact as Contact)
                  }}
                >
                  Edit
                </TableActionButton>
              )}
            />
          )}
        </section>
      )}
      {!isListAction && (
        <section className="panel">
          <h2>Create contact</h2>
          <p className="help-text">Contacts are business records only. They do not receive login credentials.</p>
          <ContactForm key={selected?.id ?? ''} companies={companies} selected={selected} saving={saving} onSubmit={createContact} />
        </section>
      )}
      {isListAction && editingContact && (
        <section className="panel" ref={editContactRef}>
          <h2>Edit contact</h2>
          <ContactEditForm
            contact={editingContact}
            saving={saving}
            onSubmit={updateContact}
            onCancel={() => { if (!savingRef.current) { setEditingContact(null); setError('') } }}
          />
        </section>
      )}
    </Page>
  )
}
