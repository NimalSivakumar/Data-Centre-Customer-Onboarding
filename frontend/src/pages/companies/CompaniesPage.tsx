import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../../api/client'
import { DataTable } from '../../components/DataTable'
import { Page } from '../../components/Page'
import { Panel } from '../../components/Panel'
import { SearchFilterBar } from '../../components/SearchFilterBar'
import { SectionHeading } from '../../components/SectionHeading'
import { TableActionButton } from '../../components/TableActionButton'
import { companyStatusOptions } from '../../constants/options'
import type { AuthState, Company, ListResponse } from '../../types/api'
import { cleanFormPayload } from '../../utils/forms'

export function CompaniesPage({ auth }: { auth: AuthState }) {
  const [searchParams] = useSearchParams()
  const [companies, setCompanies] = useState<Company[]>([])
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [editingCompany, setEditingCompany] = useState<Company | null>(null)
  const editCompanyRef = useRef<HTMLElement | null>(null)
  const actionMode = searchParams.get('action') === 'list' ? 'list' : 'create'

  async function loadCompanies() {
    const params = new URLSearchParams()
    if (search.trim()) params.set('q', search.trim())
    if (status) params.set('status', status)
    const data = await api<ListResponse<Company>>(`/companies${params.size ? `?${params}` : ''}`, auth)
    setCompanies(data.items)
  }

  useEffect(() => { loadCompanies().catch((err: Error) => setError(err.message)) }, [search, status])
  useEffect(() => { if (editingCompany) editCompanyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }, [editingCompany])

  async function createCompany(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formElement = event.currentTarget
    setSaving(true)
    setError('')
    try {
      await api<Company>('/companies', auth, { method: 'POST', body: JSON.stringify(cleanFormPayload(new FormData(formElement))) })
      formElement.reset()
      setMessage('Company created')
      await loadCompanies()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create company')
    } finally {
      setSaving(false)
    }
  }

  async function updateCompany(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editingCompany) return
    setSaving(true)
    setError('')
    try {
      await api<Company>(`/companies/${editingCompany.id}`, auth, { method: 'PATCH', body: JSON.stringify(cleanFormPayload(new FormData(event.currentTarget))) })
      setEditingCompany(null)
      setMessage('Company updated')
      await loadCompanies()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update company')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Page title="Companies" error={error} message={message}>
      {actionMode === 'create' && (
        <Panel className="action-panel">
          <h2>Create company</h2>
          <p className="help-text">Required: company name, customer code, main email, and main phone. Creating a company also creates a primary contact named Main company contact.</p>
          <form onSubmit={createCompany} className="form-grid action-form">
            <input name="name" placeholder="Company name *" required />
            <input name="customer_code" placeholder="Customer code *" required />
            <input name="registration_number" placeholder="Registration number" />
            <input name="main_email" placeholder="Main email *" type="email" required />
            <input name="main_phone" placeholder="Main phone *" required />
            <textarea name="address" placeholder="Address" />
            <button disabled={saving}>{saving ? <><span className="spinner" />Creating...</> : 'Create company'}</button>
          </form>
        </Panel>
      )}

      {actionMode === 'list' && (
        <Panel>
          <SectionHeading title="Companies" count={companies.length} />
          <SearchFilterBar
            search={search}
            onSearchChange={setSearch}
            placeholder="Search company, code, or email..."
            resultCount={companies.length}
            filters={[{ label: 'Status', value: status, onChange: setStatus, options: companyStatusOptions }]}
            onClear={() => { setSearch(''); setStatus('') }}
          />
          <DataTable
            rows={companies}
            columns={['name', 'customer_code', 'main_email', 'main_phone', 'status']}
            emptyMessage="No companies match your filters."
            actions={(company) => <TableActionButton type="button" onClick={() => setEditingCompany(company as Company)}>Edit</TableActionButton>}
          />
        </Panel>
      )}

      {actionMode === 'list' && editingCompany && (
        <Panel panelRef={editCompanyRef}>
          <h2>Edit company</h2>
          <form onSubmit={updateCompany} className="form-grid compact">
            <input name="name" placeholder="Company name" defaultValue={editingCompany.name} />
            <input name="customer_code" placeholder="Customer code" defaultValue={editingCompany.customer_code ?? ''} />
            <input name="main_email" placeholder="Main email" type="email" defaultValue={editingCompany.main_email ?? ''} />
            <input name="main_phone" placeholder="Main phone" defaultValue={editingCompany.main_phone ?? ''} />
            <select name="status" defaultValue={editingCompany.status}>
              <option value="ACTIVE">Active</option>
              <option value="PENDING">Pending</option>
              <option value="SUSPENDED">Suspended</option>
              <option value="CLOSED">Closed</option>
            </select>
            <textarea name="notes" placeholder="Notes" defaultValue={editingCompany.notes ?? ''} />
            <button disabled={saving}>{saving ? <><span className="spinner" />Saving...</> : 'Save changes'}</button>
            <button type="button" className="secondary" onClick={() => setEditingCompany(null)}>Cancel</button>
          </form>
        </Panel>
      )}
    </Page>
  )
}
