import { useCallback, useEffect, useRef, useState } from 'react'
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
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const loadGeneration = useRef(0)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const [editingCompany, setEditingCompany] = useState<Company | null>(null)
  const editCompanyRef = useRef<HTMLElement | null>(null)
  const actionMode = searchParams.get('action') === 'list' ? 'list' : 'create'

  const loadCompanies = useCallback(async () => {
    const generation = ++loadGeneration.current
    setLoading(true)
    setError('')
    const params = new URLSearchParams({ page: String(page), page_size: '20' })
    if (search.trim()) params.set('q', search.trim())
    if (status) params.set('status', status)
    try {
      const data = await api<ListResponse<Company>>(`/companies?${params}`, auth)
      if (generation !== loadGeneration.current) return
      const lastPage = Math.max(1, Math.ceil(data.total / data.page_size))
      if (page > lastPage) { setPage(lastPage); return }
      setCompanies(data.items)
      setTotal(data.total)
    } catch (err) {
      if (generation === loadGeneration.current) {
        setCompanies([])
        setError(err instanceof Error ? err.message : 'Could not load companies')
      }
      throw err
    } finally {
      if (generation === loadGeneration.current) setLoading(false)
    }
  }, [auth, search, status, page])

  useEffect(() => {
    void loadCompanies().catch(() => {})
    return () => { loadGeneration.current += 1 }
  }, [loadCompanies])

  function changeFilters(nextSearch: string, nextStatus: string) {
    if (nextSearch === search && nextStatus === status && page === 1) return
    loadGeneration.current += 1
    setSearch(nextSearch)
    setStatus(nextStatus)
    setPage(1)
    setCompanies([])
    setError('')
    setMessage('')
  }
  useEffect(() => { if (editingCompany) editCompanyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }, [editingCompany])

  async function createCompany(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (savingRef.current) return
    savingRef.current = true
    const formElement = event.currentTarget
    setSaving(true)
    setError('')
    setMessage('')
    try {
      await api<Company>('/companies', auth, { method: 'POST', body: JSON.stringify(cleanFormPayload(new FormData(formElement))) })
      formElement.reset()
      setMessage('Company created')
      await loadCompanies().catch(() => {
        setError('Company saved, but the list refresh failed. Refresh the list; do not repeat the save.')
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create company')
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  async function updateCompany(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editingCompany || savingRef.current) return
    savingRef.current = true
    setSaving(true)
    setError('')
    setMessage('')
    try {
      await api<Company>(`/companies/${editingCompany.id}`, auth, { method: 'PATCH', body: JSON.stringify(cleanFormPayload(new FormData(event.currentTarget))) })
      setEditingCompany(null)
      setMessage('Company updated')
      await loadCompanies().catch(() => {
        setError('Company saved, but the list refresh failed. Refresh the list; do not repeat the save.')
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update company')
    } finally {
      savingRef.current = false
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
          <CompaniesTable
            companies={companies}
            search={search}
            status={status}
            page={page}
            pageSize={20}
            total={total}
            loading={loading}
            saving={saving}
            onPageChange={setPage}
            onSearchChange={(value) => changeFilters(value, status)}
            onStatusChange={(value) => changeFilters(search, value)}
            onClearFilters={() => changeFilters('', '')}
            onEdit={(company) => {
              if (savingRef.current) return
              setError('')
              setMessage('')
              setEditingCompany(company)
            }}
          />
        </Panel>
      )}

      {actionMode === 'list' && editingCompany && (
        <Panel panelRef={editCompanyRef}>
          <h2>Edit company</h2>
          <CompanyEditForm company={editingCompany} saving={saving} onSubmit={updateCompany} onCancel={() => { if (!savingRef.current) { setEditingCompany(null); setError('') } }} />
        </Panel>
      )}
    </Page>
  )
}
