import type { AccessRequest, VisitorAccess } from '../../types/api'
import { formatDateOnly } from '../../utils/dates'
import { statusBadge } from '../../utils/formatters'
import type { RequestRow } from './requestTypes'

type RequestWithVisitors = {
  visitor_access?: VisitorAccess | null
  visitor_accesses?: VisitorAccess[]
}

export function getRequestVisitors(request: RequestWithVisitors): VisitorAccess[] {
  return request.visitor_accesses?.length ? request.visitor_accesses : request.visitor_access ? [request.visitor_access] : []
}

export function mapRequestToRow(request: AccessRequest): RequestRow {
  const visitors = getRequestVisitors(request)
  const first = visitors[0]
  return {
    ...request,
    raw_status: request.status,
    visitor_count: visitors.length,
    visitor_name: visitors.length > 1 ? `${visitors.length} visitors` : first?.visitor_full_name ?? '',
    national_id: first?.visitor_id_number ?? '',
    visitor_phone: first?.visitor_phone ?? '',
    visit_date: first?.visit_date ? formatDateOnly(first.visit_date) : '',
    arrival_time: first?.expected_arrival_time ?? '',
    departure_time: first?.expected_departure_time ?? '',
    status: statusBadge(request.status),
  }
}
