import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../../api/client'
import { Page } from '../../components/Page'
import { Panel } from '../../components/Panel'
import type { AuthState, Company, ListResponse } from '../../types/api'
import { cleanFormPayload } from '../../utils/forms'
import { CompaniesTable } from './CompaniesTable'
import { CompanyCreateForm } from './CompanyCreateForm'
import { CompanyEditForm } from './CompanyEditForm'

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
          <CompanyCreateForm saving={saving} onSubmit={createCompany} />
        </Panel>
      )}

      {actionMode === 'list' && (
        <Panel>
          <CompaniesTable companies={companies} search={search} status={status} onSearchChange={setSearch} onStatusChange={setStatus} onClearFilters={() => { setSearch(''); setStatus('') }} onEdit={setEditingCompany} />
        </Panel>
      )}

      {actionMode === 'list' && editingCompany && (
        <Panel panelRef={editCompanyRef}>
          <h2>Edit company</h2>
          <CompanyEditForm company={editingCompany} saving={saving} onSubmit={updateCompany} onCancel={() => setEditingCompany(null)} />
        </Panel>
      )}
    </Page>
  )
}
