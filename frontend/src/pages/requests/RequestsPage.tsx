import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import { hasAnyRole } from '../../auth/permissions'
import { ActionNoteDialog, type ActionNoteDialogState } from '../../components/ActionNoteDialog'
import { DataTable } from '../../components/DataTable'
import { DetailsDialog, type DetailsDialogState } from '../../components/DetailsDialog'
import { LoadingState } from '../../components/LoadingState'
import { Page } from '../../components/Page'
import { Panel } from '../../components/Panel'
import { SearchFilterBar } from '../../components/SearchFilterBar'
import { TableActionButton } from '../../components/TableActionButton'
import { requestStatusOptions } from '../../constants/options'
import type { AccessRequest, AuthState, ListResponse, User } from '../../types/api'
import { formatDateOnly } from '../../utils/dates'
import { statusBadge } from '../../utils/formatters'

type RequestRow = Omit<AccessRequest, 'status'> & { raw_status: string; visitor_name: string; visitor_count: number; national_id: string; visitor_phone: string; visit_date: string; arrival_time: string; departure_time: string; status: ReturnType<typeof statusBadge> }

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
    const visitors = row.visitor_accesses?.length ? row.visitor_accesses : row.visitor_access ? [row.visitor_access] : []
    setDetails({
      title: row.request_number,
      subtitle: row.visitor_count === 1 ? row.visitor_name : `${row.visitor_count} visitors`,
      items: [
        { label: 'Visitors', value: visitors.map((visitor, index) => `${index + 1}. ${visitor.visitor_full_name} - ${visitor.visitor_id_number}${visitor.visitor_company ? ` - ${visitor.visitor_company}` : ''}`).join('\n') },
        { label: 'Visit Date', value: row.visit_date },
        { label: 'Arrival', value: row.arrival_time },
        { label: 'Departure', value: row.departure_time },
        { label: 'Status', value: row.status },
      ],
    })
  }
  const canReview = hasAnyRole(user, ['ADMIN', 'OPS'])
  const rows: RequestRow[] = requests.map((request) => { const visitors = request.visitor_accesses?.length ? request.visitor_accesses : request.visitor_access ? [request.visitor_access] : []; const first = visitors[0]; return { ...request, raw_status: request.status, visitor_count: visitors.length, visitor_name: visitors.length > 1 ? `${visitors.length} visitors` : first?.visitor_full_name ?? '', national_id: first?.visitor_id_number ?? '', visitor_phone: first?.visitor_phone ?? '', visit_date: first?.visit_date ? formatDateOnly(first.visit_date) : '', arrival_time: first?.expected_arrival_time ?? '', departure_time: first?.expected_departure_time ?? '', status: statusBadge(request.status) } })

  return (
    <Page title={canReview ? 'Requests' : 'My Requests'} error={error}>
      <Panel>
        <SearchFilterBar
          search={search}
          onSearchChange={setSearch}
          placeholder="Search request, visitor, ID, or phone..."
          resultCount={rows.length}
          filters={[{
            label: 'Status',
            value: statusFilter,
            onChange: setStatusFilter,
            options: requestStatusOptions,
          }]}
          onClear={() => { setSearch(''); setStatusFilter('') }}
        />
        {loading ? (
          <LoadingState label="Loading visitor requests..." />
        ) : (
          <DataTable
            compact
            rows={rows}
            columns={['request_number', 'visitor_name', 'visitor_count', 'visit_date', 'arrival_time', 'departure_time', 'status']}
            labels={{ request_number: 'Request', visitor_name: 'Visitor', visitor_count: 'Count', visit_date: 'Date', arrival_time: 'Arrival', departure_time: 'Departure' }}
            emptyMessage={canReview ? 'No visitor requests match your filters.' : 'You have not submitted matching visitor requests.'}
            actions={(row) => (
              <>
                <TableActionButton tone="secondary" onClick={() => openDetails(row)}>Details</TableActionButton>
                {canReview && row.raw_status === 'SUBMITTED' && (
                  <>
                    <TableActionButton onClick={() => openReview(row.id, 'approve')}>Approve</TableActionButton>
                    <TableActionButton tone="danger" onClick={() => openReview(row.id, 'reject')}>Reject</TableActionButton>
                  </>
                )}
              </>
            )}
          />
        )}
      </Panel>
      <ActionNoteDialog dialog={dialog} onClose={() => setDialog(null)} />
      <DetailsDialog details={details} onClose={() => setDetails(null)} />
    </Page>
  )
}
