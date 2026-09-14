import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../../api/client'
import { CredentialCard } from '../../components/CredentialCard'
import { Page } from '../../components/Page'
import { Panel } from '../../components/Panel'
import type { AuthState, InternalUser } from '../../types/api'
import { cleanFormPayload } from '../../utils/forms'
import { InternalUserCreateForm } from './InternalUserCreateForm'
import { InternalUserEditForm } from './InternalUserEditForm'
import { InternalUsersTable } from './InternalUsersTable'
import { filterInternalUsers, mapInternalUserToRow } from './internalUserMappers'

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

  const filteredUsers = filterInternalUsers(users, search, roleFilter, statusFilter)
  const rows = filteredUsers.map(mapInternalUserToRow)

  return (
    <Page title="Internal Users" error={error} message={message}>
      {actionMode === 'create' && (
        <Panel className="action-panel">
          <h2>Create internal account</h2>
          <p className="help-text">Admin users can create OPS and SECURITY login accounts. A temporary password is generated and shown once.</p>
          <InternalUserCreateForm saving={saving} onSubmit={createInternalUser} />
          {temporaryCredential && <CredentialCard email={temporaryCredential.email} password={temporaryCredential.password} />}
        </Panel>
      )}

      {actionMode === 'list' && (
        <Panel className="list-panel">
          <InternalUsersTable rows={rows} search={search} roleFilter={roleFilter} statusFilter={statusFilter} onSearchChange={setSearch} onRoleFilterChange={setRoleFilter} onStatusFilterChange={setStatusFilter} onClearFilters={() => { setSearch(''); setRoleFilter(''); setStatusFilter('') }} onEdit={setEditingUser} />
        </Panel>
      )}

      {actionMode === 'list' && editingUser && (
        <Panel panelRef={editUserRef}>
          <h2>Edit internal account</h2>
          <InternalUserEditForm user={editingUser} saving={saving} onSubmit={updateInternalUser} onCancel={() => setEditingUser(null)} />
        </Panel>
      )}
    </Page>
  )
}
