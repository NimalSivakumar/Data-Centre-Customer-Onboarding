import type { DetailsDialogState } from '../../components/DetailsDialog'
import { getRequestVisitors } from './requestMappers'
import type { RequestRow } from './requestTypes'

export function buildRequestDetails(row: RequestRow): DetailsDialogState {
  const visitors = getRequestVisitors(row)
  return {
    title: row.request_number,
    subtitle: row.visitor_count === 1 ? row.visitor_name : `${row.visitor_count} visitors`,
    items: [
      { label: 'Purpose of Visit', value: row.description || 'No purpose recorded for this request.', wide: true, prominent: true },
      { label: 'Visitor Details', value: <ol className="visitor-details">{visitors.map((visitor) => <li key={`${visitor.visitor_full_name}-${visitor.visitor_id_number}`}><div className="visitor-card-title"><strong>{visitor.visitor_full_name}</strong><span>NIN / ID: {visitor.visitor_id_number}</span></div><div className="visitor-field-grid"><span className="visitor-field"><small>Phone</small><strong>{visitor.visitor_phone || 'Not provided'}</strong></span><span className="visitor-field"><small>Email</small><strong>{visitor.visitor_email || 'Not provided'}</strong></span><span className="visitor-field"><small>Company</small><strong>{visitor.visitor_company || 'Not provided'}</strong></span><span className="visitor-field"><small>Vehicle</small><strong>{visitor.vehicle_registration || 'Not provided'}</strong></span><span className="visitor-field visitor-field-wide"><small>Tools / Equipment</small><strong>{visitor.equipment_carried || 'None recorded'}</strong></span><span className="visitor-field visitor-field-wide"><small>Special Instructions</small><strong>{visitor.special_instructions || 'None recorded'}</strong></span><span className="visitor-field visitor-field-wide"><small>Address</small><strong>{visitor.visitor_address || 'Not provided'}</strong></span></div></li>)}</ol>, wide: true },
      { label: 'Visit Date', value: row.visit_date },
      { label: 'Arrival', value: row.arrival_time },
      { label: 'Departure', value: row.departure_time },
      { label: 'Site / Location', value: visitors[0]?.site_location },
      { label: 'Host / Contact Name', value: visitors[0]?.host_contact_name },
      { label: 'Status', value: row.status },
    ],
  }
}
