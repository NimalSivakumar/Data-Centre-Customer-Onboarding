import { useCallback, useEffect, useRef, useState } from 'react'
import { operationError } from '../../utils/asyncOperation'
import { api } from '../../api/client'
import { ActionNoteDialog, type ActionNoteDialogState } from '../../components/ActionNoteDialog'
import { DetailsDialog, type DetailsDialogState } from '../../components/DetailsDialog'
import { LoadingState } from '../../components/LoadingState'
import { Page } from '../../components/Page'
import { Panel } from '../../components/Panel'
import type { AccessRequest, AuthState, ListResponse, User } from '../../types/api'
import { buildRequestDetails } from './RequestDetails'
import { RequestsTable } from './RequestsTable'
import { mapRequestToRow } from './requestMappers'
import type { RequestRow } from './requestTypes'
import { getRequestPermissions } from './requestPermissions'

export function RequestsPage({ auth, user }: { auth: AuthState; user: User }) {
  const [requests, setRequests] = useState<AccessRequest[]>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [pageSize, setPageSize] = useState(20)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [dialog, setDialog] = useState<ActionNoteDialogState | null>(null)
  const [details, setDetails] = useState<DetailsDialogState | null>(null)
  const readVersion = useRef(0)
  const load = useCallback(async () => {
    const version = ++readVersion.current
    setLoading(true)
    setError('')
    setRequests([])
    try {
      const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) })
      if (search.trim()) params.set('q', search.trim())
      if (statusFilter) params.set('status', statusFilter)
      const result = await api<ListResponse<AccessRequest>>(`/requests?${params}`, auth)
      if (version !== readVersion.current) return false
      setRequests(result.items)
      setTotal(result.total)
      const lastPage = Math.max(1, Math.ceil(result.total / pageSize))
      if (page > lastPage) setPage(lastPage)
      return true
    } catch (err) {
      if (version === readVersion.current) setError(operationError(err))
      return false
    } finally {
      if (version === readVersion.current) setLoading(false)
    }
  }, [auth, search, statusFilter, page, pageSize])
  useEffect(() => {
    const versionRef = readVersion
    void load()
    return () => { versionRef.current++ }
  }, [load])
  const mutationBusy = useRef(false)
  const [saving, setSaving] = useState(false)
  const latestLoad = useRef(load)
  latestLoad.current = load

  function openReview(id: string, action: 'approve' | 'reject') {
    if (mutationBusy.current || loading) return
    const isApproval = action === 'approve'
    const permissions = getRequestPermissions(user)
    if (!(isApproval ? permissions.canApprove : permissions.canReject)) {
      setError(isApproval ? 'Only ADMIN users can approve requests' : 'Only ADMIN or OPS users can reject requests')
      return
    }
    if (!requests.some((request) => request.id === id && request.status === 'SUBMITTED')) return
    let completed = false
    setDialog({
      title: isApproval ? 'Approve visitor request' : 'Reject visitor request',
      message: isApproval ? 'Confirm approval of this visitor request.' : 'Add the reason for rejecting this visitor request.',
      noteLabel: isApproval ? undefined : 'Rejection notes',
      confirmLabel: isApproval ? 'Approve request' : 'Reject request',
      danger: !isApproval,
      onConfirm: async (reviewNotes) => {
        if (completed || mutationBusy.current) return
        mutationBusy.current = true
        setSaving(true)
        try {
          await api<AccessRequest>(`/requests/${id}/${action}`, auth, {
            method: 'POST', body: JSON.stringify({ review_notes: isApproval ? null : reviewNotes }),
          })
          completed = true
          // The mutation is complete: refresh failures belong on the page, not
          // in a retryable confirmation dialog.
          if (!await latestLoad.current()) setError('Action completed, but refresh failed. Refresh the list before continuing.')
        } finally {
          mutationBusy.current = false
          setSaving(false)
        }
      },
    })
  }
  function openDetails(row: RequestRow) {
    setDetails(buildRequestDetails(row))
  }
  const { canApprove, canReject } = getRequestPermissions(user)
  const rows = requests.map(mapRequestToRow)

  return (
    <Page title="Requests" error={error}>
      <Panel>
        <button type="button" className="secondary" disabled={loading || saving} onClick={() => { void load() }}>Refresh</button>
        {loading && <LoadingState label="Loading visitor requests..." />}
        <RequestsTable
          rows={loading ? [] : rows}
          showResults={!loading && !error}
          canApprove={!loading && !saving && canApprove}
          canReject={!loading && !saving && canReject}
          search={search}
          statusFilter={statusFilter}
          onSearchChange={(value) => { setSearch(value); setPage(1) }}
          onStatusFilterChange={(value) => { setStatusFilter(value); setPage(1) }}
          onClearFilters={() => { setSearch(''); setStatusFilter(''); setPage(1) }}
          onDetails={openDetails}
          onReview={openReview}
        />
        {(total > 20 || page > 1) && <nav aria-label="Request pages" className="request-pagination">
          <label>
            Rows per page
            <select value={pageSize} disabled={loading || saving} onChange={(event) => {
              const value = Number(event.target.value)
              setPageSize(Number.isFinite(value) ? Math.min(100, Math.max(1, Math.trunc(value))) : 20)
              setPage(1)
            }}>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </label>
          <button type="button" disabled={loading || page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
          <span>Page {page} of {Math.max(1, Math.ceil(total / pageSize))} · {total} requests</span>
          <button type="button" disabled={loading || page * pageSize >= total} onClick={() => setPage(page + 1)}>Next</button>
        </nav>}
      </Panel>
      <ActionNoteDialog dialog={dialog} onClose={() => setDialog(null)} />
      <DetailsDialog details={details} onClose={() => setDetails(null)} />
    </Page>
  )
}
