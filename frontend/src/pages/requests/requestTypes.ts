import type { AccessRequest } from '../../types/api'
import type { statusBadge } from '../../utils/formatters'

export type RequestRow = Omit<AccessRequest, 'status'> & {
  raw_status: string
  visitor_name: string
  visitor_count: number
  national_id: string
  visitor_phone: string
  visit_date: string
  arrival_time: string
  departure_time: string
  status: ReturnType<typeof statusBadge>
}
