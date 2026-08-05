import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../../api/client'
import { CredentialCard } from '../../components/CredentialCard'
import { DataTable } from '../../components/DataTable'
import { Page } from '../../components/Page'
import { Panel } from '../../components/Panel'
import { SearchFilterBar } from '../../components/SearchFilterBar'
import { SectionHeading } from '../../components/SectionHeading'
import { TableActionButton } from '../../components/TableActionButton'
import { activeStatusOptions, internalRoleOptions } from '../../constants/options'
import type { AuthState, InternalUser } from '../../types/api'
import { cleanFormPayload } from '../../utils/forms'
import { statusBadge } from '../../utils/formatters'

type InternalUserRow = Omit<InternalUser, 'status'> & { raw_status: string; status: ReturnType<typeof statusBadge> }

export function InternalUsersPage({ auth }: { auth: AuthState }) {
  const [searchParams] = useSearchParams()
  const [users, setUsers] = useState<InternalUser[]>([])
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [editingUser, setEditingUser] = useState<InternalUser | null>(null)
  const [temporaryCredential, setTemporaryCredential] = useState<{ email: string; password: string } | null>(null)
  const editUserRef = useRef<HTMLElement | null>(null)
  const actionMode = searchParams.get('action') === 'list' ? 'list' : 'create'

  async function loadInternalUsers() {
    setUsers(await api<InternalUser[]>('/users/internal', auth))
  }

  useEffect(() => { loadInternalUsers().catch((err: Error) => setError(err.message)) }, [auth])
  useEffect(() => { if (editingUser) editUserRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }, [editingUser])

  async function createInternalUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formElement = event.currentTarget
    setError('')
    setMessage('')
    setTemporaryCredential(null)
    setSaving(true)
    try {
      const user = await api<InternalUser>('/users/internal', auth, { method: 'POST', body: JSON.stringify(cleanFormPayload(new FormData(formElement))) })
      formElement.reset()
      setMessage(`${user.role} account created for ${user.full_name}`)
      if (user.temporary_password) setTemporaryCredential({ email: user.email, password: user.temporary_password })
      await loadInternalUsers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create internal user')
    } finally {
      setSaving(false)
    }
  }

  async function updateInternalUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editingUser) return
    setError('')
    setMessage('')
    setSaving(true)
    try {
      const updated = await api<InternalUser>(`/users/internal/${editingUser.id}`, auth, { method: 'PATCH', body: JSON.stringify(cleanFormPayload(new FormData(event.currentTarget))) })
      setEditingUser(null)
      setMessage(`Internal account updated for ${updated.full_name}`)
      await loadInternalUsers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update internal user')
    } finally {
      setSaving(false)
    }
  }

  const normalizedSearch = search.trim().toLowerCase()
  const filteredUsers = users.filter((user) => {
    const matchesSearch = !normalizedSearch || [user.full_name, user.email, user.role, user.status].some((value) => String(value ?? '').toLowerCase().includes(normalizedSearch))
    const matchesRole = !roleFilter || user.role === roleFilter
    const matchesStatus = !statusFilter || user.status === statusFilter
    return matchesSearch && matchesRole && matchesStatus
  })
  const rows: InternalUserRow[] = filteredUsers.map((user) => ({ ...user, raw_status: user.status, status: statusBadge(user.status) }))

  return (
    <Page title="Internal Users" error={error} message={message}>
      {actionMode === 'create' && (
        <Panel className="action-panel">
          <h2>Create internal account</h2>
          <p className="help-text">Admin users can create OPS and SECURITY login accounts. A temporary password is generated and shown once.</p>
          <form onSubmit={createInternalUser} className="form-grid compact action-form">
            <input name="full_name" placeholder="Full name *" required />
            <input name="email" type="email" placeholder="Email *" required />
            <select name="role" defaultValue="OPS">
              <option value="OPS">OPS</option>
              <option value="SECURITY">SECURITY</option>
            </select>
            <select name="status" defaultValue="ACTIVE">
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>
            <button className="btn btn-primary" disabled={saving}>{saving ? <><span className="spinner" />Creating...</> : 'Create account'}</button>
          </form>
          {temporaryCredential && <CredentialCard email={temporaryCredential.email} password={temporaryCredential.password} />}
        </Panel>
      )}

      {actionMode === 'list' && (
        <Panel className="list-panel">
          <SectionHeading title="Internal accounts" helpText="Search, filter, and manage OPS and SECURITY accounts." count={filteredUsers.length} />
          <SearchFilterBar
            search={search}
            onSearchChange={setSearch}
            placeholder="Search name, email, role, or status..."
            resultCount={filteredUsers.length}
            filters={[
              { label: 'Role', value: roleFilter, onChange: setRoleFilter, options: internalRoleOptions },
              { label: 'Status', value: statusFilter, onChange: setStatusFilter, options: activeStatusOptions },
            ]}
            onClear={() => { setSearch(''); setRoleFilter(''); setStatusFilter('') }}
          />
          <DataTable
            rows={rows}
            columns={['full_name', 'email', 'role', 'status']}
            emptyMessage="No internal users match your filters."
            actions={(user) => <TableActionButton type="button" onClick={() => setEditingUser(user as unknown as InternalUser)}>Edit</TableActionButton>}
          />
        </Panel>
      )}

      {actionMode === 'list' && editingUser && (
        <Panel panelRef={editUserRef}>
          <h2>Edit internal account</h2>
          <form onSubmit={updateInternalUser} className="form-grid compact">
            <input name="full_name" placeholder="Full name" defaultValue={editingUser.full_name} />
            <input name="email" type="email" placeholder="Email" defaultValue={editingUser.email} />
            <select name="role" defaultValue={editingUser.role}>
              <option value="OPS">OPS</option>
              <option value="SECURITY">SECURITY</option>
            </select>
            <select name="status" defaultValue={editingUser.status}>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>
            <button disabled={saving}>{saving ? <><span className="spinner" />Saving...</> : 'Save changes'}</button>
            <button type="button" className="secondary" onClick={() => setEditingUser(null)}>Cancel</button>
          </form>
        </Panel>
      )}
    </Page>
  )
}
