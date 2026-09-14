import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import { hasAnyRole } from '../../auth/permissions'
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

export function RequestsPage({ auth, user }: { auth: AuthState; user: User }) {
  const [requests, setRequests] = useState<AccessRequest[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [dialog, setDialog] = useState<ActionNoteDialogState | null>(null)
  const [details, setDetails] = useState<DetailsDialogState | null>(null)
  async function load() {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search.trim()) params.set('q', search.trim())
      if (statusFilter) params.set('status', statusFilter)
      setRequests((await api<ListResponse<AccessRequest>>(`/requests${params.size ? `?${params}` : ''}`, auth)).items)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load().catch((err: Error) => setError(err.message)) }, [search, statusFilter])
  async function openReview(id: string, action: 'approve' | 'reject') {
    const isApproval = action === 'approve'
    if (isApproval) {
      await api<AccessRequest>(`/requests/${id}/approve`, auth, { method: 'POST', body: JSON.stringify({ review_notes: null }) })
      await load()
      return
    }
    setDialog({
      title: 'Reject visitor request',
      message: 'Add the reason for rejecting this visitor request.',
      noteLabel: 'Rejection notes',
      confirmLabel: 'Reject request',
      danger: true,
      onConfirm: async (reviewNotes) => {
        await api<AccessRequest>(`/requests/${id}/reject`, auth, { method: 'POST', body: JSON.stringify({ review_notes: reviewNotes }) })
        await load()
      },
    })
  }
  function openDetails(row: RequestRow) {
    setDetails(buildRequestDetails(row))
  }
  const canReview = hasAnyRole(user, ['ADMIN', 'OPS'])
  const rows = requests.map(mapRequestToRow)

  return (
    <Page title={canReview ? 'Requests' : 'My Requests'} error={error}>
      <Panel>
        {loading ? (
          <LoadingState label="Loading visitor requests..." />
        ) : (
          <RequestsTable rows={rows} canReview={canReview} search={search} statusFilter={statusFilter} onSearchChange={setSearch} onStatusFilterChange={setStatusFilter} onClearFilters={() => { setSearch(''); setStatusFilter('') }} onDetails={openDetails} onReview={openReview} />
        )}
      </Panel>
      <ActionNoteDialog dialog={dialog} onClose={() => setDialog(null)} />
      <DetailsDialog details={details} onClose={() => setDetails(null)} />
    </Page>
  )
}
