import { DataTable } from '../../components/DataTable'
import { TableActionButton } from '../../components/TableActionButton'
import { getCheckInBlockReason, isScheduledToday } from './securityMappers'
import type { SecurityRow, SecurityVisitorActionHandlers } from './securityTypes'

type SecurityVisitorsTableProps = SecurityVisitorActionHandlers & {
  rows: SecurityRow[]
}

export function SecurityVisitorsTable({ rows, onDetails, onCheckIn, onCheckOut, onDeny }: SecurityVisitorsTableProps) {
  return <DataTable compact rows={rows} columns={['request_number', 'visitor_full_name', 'visitor_id_number', 'visit_status', 'expected_arrival_time', 'expected_departure_time']} labels={{ request_number: 'Request', visitor_full_name: 'Visitor', visitor_id_number: 'ID Number', visit_status: 'Status', expected_arrival_time: 'Arrival', expected_departure_time: 'Departure' }} emptyMessage="No visitors match this date and filter." actions={(row) => { const checkInBlockReason = getCheckInBlockReason(row); const scheduledToday = isScheduledToday(row); return <><TableActionButton tone="secondary" onClick={() => onDetails(row)}>Details</TableActionButton><TableActionButton disabled={row.raw_status !== 'PENDING_ARRIVAL' || Boolean(checkInBlockReason)} title={checkInBlockReason || undefined} onClick={() => onCheckIn(row.visitor_access_id)}>Check in</TableActionButton><TableActionButton disabled={row.raw_status !== 'CHECKED_IN'} onClick={() => onCheckOut(row.visitor_access_id)}>Check out</TableActionButton><TableActionButton tone="danger" disabled={row.raw_status !== 'PENDING_ARRIVAL' || !scheduledToday} title={!scheduledToday ? 'Deny entry is only allowed on the scheduled visit date' : undefined} onClick={() => onDeny(row.visitor_access_id)}>Deny</TableActionButton></> }} />
}
