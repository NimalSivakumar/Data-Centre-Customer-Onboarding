import { DataTable } from '../../components/DataTable'
import { SearchFilterBar } from '../../components/SearchFilterBar'
import { TableActionButton } from '../../components/TableActionButton'
import { requestStatusOptions } from '../../constants/options'
import type { RequestRow } from './requestTypes'

type RequestsTableProps = {
  rows: RequestRow[]
  canReview: boolean
  search: string
  statusFilter: string
  onSearchChange: (value: string) => void
  onStatusFilterChange: (value: string) => void
  onClearFilters: () => void
  onDetails: (row: RequestRow) => void
  onReview: (id: string, action: 'approve' | 'reject') => void
}

export function RequestsTable({ rows, canReview, search, statusFilter, onSearchChange, onStatusFilterChange, onClearFilters, onDetails, onReview }: RequestsTableProps) {
  return <><SearchFilterBar search={search} onSearchChange={onSearchChange} placeholder="Search request, visitor, ID, or phone..." resultCount={rows.length} filters={[{ label: 'Status', value: statusFilter, onChange: onStatusFilterChange, options: requestStatusOptions }]} onClear={onClearFilters} /><DataTable compact rows={rows} columns={['request_number', 'visitor_name', 'visitor_count', 'visit_date', 'arrival_time', 'departure_time', 'status']} labels={{ request_number: 'Request', visitor_name: 'Visitor', visitor_count: 'Count', visit_date: 'Date', arrival_time: 'Arrival', departure_time: 'Departure' }} emptyMessage={canReview ? 'No visitor requests match your filters.' : 'You have not submitted matching visitor requests.'} actions={(row) => <><TableActionButton tone="secondary" onClick={() => onDetails(row)}>Details</TableActionButton>{canReview && row.raw_status === 'SUBMITTED' && <><TableActionButton onClick={() => onReview(row.id, 'approve')}>Approve</TableActionButton><TableActionButton tone="danger" onClick={() => onReview(row.id, 'reject')}>Reject</TableActionButton></>}</>} /></>
}
