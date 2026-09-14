export type VisitorDraft = {
  visitor_full_name: string
  visitor_company: string
  visitor_id_number: string
  visitor_phone: string
  visitor_email: string
  visitor_address: string
  vehicle_registration: string
  equipment_carried: string
  special_instructions: string
}

export type PendingRequest = Record<string, unknown> & {
  visitors: Record<string, unknown>[]
}

export const emptyVisitor: VisitorDraft = {
  visitor_full_name: '',
  visitor_company: '',
  visitor_id_number: '',
  visitor_phone: '',
  visitor_email: '',
  visitor_address: '',
  vehicle_registration: '',
  equipment_carried: '',
  special_instructions: '',
}
