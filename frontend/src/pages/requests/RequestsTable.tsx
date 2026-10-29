import { DataTable } from '../../components/DataTable'
import { SearchFilterBar } from '../../components/SearchFilterBar'
import { TableActionButton } from '../../components/TableActionButton'
import { requestStatusOptions } from '../../constants/options'
import type { RequestRow } from './requestTypes'

type RequestsTableProps = {
  rows: RequestRow[]
  canApprove: boolean
  canReject: boolean
  search: string
  statusFilter: string
  onSearchChange: (value: string) => void
  onStatusFilterChange: (value: string) => void
  onClearFilters: () => void
  onDetails: (row: RequestRow) => void
  onReview: (id: string, action: 'approve' | 'reject') => void
}

export function RequestsTable({ rows, canApprove, canReject, search, statusFilter, onSearchChange, onStatusFilterChange, onClearFilters, onDetails, onReview }: RequestsTableProps) {
  return <><SearchFilterBar search={search} onSearchChange={onSearchChange} placeholder="Search request, visitor, ID, or phone..." resultCount={rows.length} filters={[{ label: 'Status', value: statusFilter, onChange: onStatusFilterChange, options: requestStatusOptions }]} onClear={onClearFilters} /><DataTable compact rows={rows} columns={['request_number', 'visitor_name', 'visitor_count', 'visit_date', 'arrival_time', 'departure_time', 'status']} labels={{ request_number: 'Request', visitor_name: 'Visitor', visitor_count: 'Count', visit_date: 'Date', arrival_time: 'Arrival', departure_time: 'Departure' }} emptyMessage="No visitor requests match your filters." actions={(row) => <><TableActionButton tone="secondary" onClick={() => onDetails(row)}>Details</TableActionButton>{canApprove && row.raw_status === 'SUBMITTED' && <TableActionButton onClick={() => onReview(row.id, 'approve')}>Approve</TableActionButton>}{canReject && row.raw_status === 'SUBMITTED' && <TableActionButton tone="danger" onClick={() => onReview(row.id, 'reject')}>Reject</TableActionButton>}</>} /></>
}
