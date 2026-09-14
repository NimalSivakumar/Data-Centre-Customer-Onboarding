import type { ReactNode } from 'react'
import type { DetailsDialogState } from '../../components/DetailsDialog'
import type { SecurityVisitor } from '../../types/api'
import { formatDateTime } from '../../utils/dates'

export type SecurityVisitorDetailsRow = Omit<SecurityVisitor, 'visit_status'> & {
  visit_status: ReactNode
}

export function buildSecurityVisitorDetails(row: SecurityVisitorDetailsRow): DetailsDialogState {
  return {
    title: row.visitor_full_name,
    subtitle: row.customer_company_name ? `Customer Company: ${row.customer_company_name}` : 'Visitor details',
    items: [
      { label: 'Visitor Name', value: row.visitor_full_name, prominent: true },
      { label: 'NIN', value: row.visitor_id_number, prominent: true },
      { label: 'Phone', value: row.visitor_phone },
      { label: 'Customer Company', value: row.customer_company_name },
      { label: 'Visitor Employer', value: row.visitor_company },
      { label: 'Vehicle Number', value: row.vehicle_registration },
      { label: 'Equipment', value: row.equipment_carried, wide: true },
      { label: 'Arrival', value: row.expected_arrival_time },
      { label: 'Departure', value: row.expected_departure_time },
      { label: 'Site', value: row.site_location },
      { label: 'Visitor Status', value: row.visit_status },
      { label: 'Checked In', value: row.checked_in_at ? formatDateTime(row.checked_in_at) : null },
      { label: 'Checked Out', value: row.checked_out_at ? formatDateTime(row.checked_out_at) : null },
    ],
  }
}
