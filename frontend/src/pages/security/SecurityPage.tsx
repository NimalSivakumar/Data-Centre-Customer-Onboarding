import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import { ActionNoteDialog, type ActionNoteDialogState } from '../../components/ActionNoteDialog'
import { DataTable } from '../../components/DataTable'
import { DetailsDialog, type DetailsDialogState } from '../../components/DetailsDialog'
import { LoadingState } from '../../components/LoadingState'
import { Page } from '../../components/Page'
import { Panel } from '../../components/Panel'
import { SearchFilterBar } from '../../components/SearchFilterBar'
import { TableActionButton } from '../../components/TableActionButton'
import { visitorStatusOptions } from '../../constants/options'
import type { AuthState, SecurityVisitor } from '../../types/api'
import { statusBadge } from '../../utils/formatters'

type SecurityRow = Omit<SecurityVisitor, 'visit_status'> & { raw_status: string; visit_status: ReturnType<typeof statusBadge> }

export function SecurityPage({ auth }: { auth: AuthState }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [visitors, setVisitors] = useState<SecurityVisitor[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [dialog, setDialog] = useState<ActionNoteDialogState | null>(null)
  const [details, setDetails] = useState<DetailsDialogState | null>(null)
  async function load() {
    setLoading(true)
    try {
      const params = new URLSearchParams({ date })
      if (search.trim()) params.set('q', search.trim())
      if (statusFilter) params.set('status', statusFilter)
      setVisitors(await api<SecurityVisitor[]>(`/security/visitors?${params}`, auth))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load().catch((err: Error) => setError(err.message)) }, [date, search, statusFilter])
  function openCheckIn(id: string) {
    setDialog({
      title: 'Check in visitor',
      message: 'Confirm identity before checking this visitor into site.',
      confirmLabel: 'Check in visitor',
      requireIdentityCheck: true,
      onConfirm: async () => {
        await api(`/security/visitors/${id}/check-in`, auth, { method: 'POST', body: JSON.stringify({ identity_verified: true, security_notes: null }) })
        await load()
      },
    })
  }
  function openCheckOut(id: string) {
    setDialog({
      title: 'Check out visitor',
      message: 'Confirm this visitor has left site before closing the access record.',
      confirmLabel: 'Check out visitor',
      onConfirm: async () => {
        await api(`/security/visitors/${id}/check-out`, auth, { method: 'POST', body: JSON.stringify({ security_notes: null }) })
        await load()
      },
    })
  }
  function openDeny(id: string) {
    setDialog({
      title: 'Deny visitor entry',
      message: 'Record the reason before denying this visitor access to site.',
      noteLabel: 'Denial reason',
      confirmLabel: 'Deny entry',
      danger: true,
      onConfirm: async (securityNotes) => {
        await api(`/security/visitors/${id}/deny-entry`, auth, { method: 'POST', body: JSON.stringify({ security_notes: securityNotes }) })
        await load()
      },
    })
  }
  function openDetails(row: SecurityRow) {
    setDetails({
      title: row.request_number,
      subtitle: row.visitor_full_name,
      items: [
        { label: 'Visitor', value: row.visitor_full_name },
        { label: 'ID Number', value: row.visitor_id_number },
        { label: 'Phone', value: row.visitor_phone },
        { label: 'Address', value: row.visitor_address },
        { label: 'Status', value: row.visit_status },
        { label: 'Arrival', value: row.expected_arrival_time },
        { label: 'Departure', value: row.expected_departure_time },
      ],
    })
  }
  const rows: SecurityRow[] = visitors.map((visitor) => ({ ...visitor, raw_status: visitor.visit_status, visit_status: statusBadge(visitor.visit_status) }))
  return <Page title="Security portal" error={error}><Panel><div className="table-toolbar"><label>Visit date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label></div><SearchFilterBar search={search} onSearchChange={setSearch} placeholder="Search visitor, ID number, or company..." resultCount={rows.length} filters={[{ label: 'Visit status', value: statusFilter, onChange: setStatusFilter, options: visitorStatusOptions }]} onClear={() => { setSearch(''); setStatusFilter('') }} />{loading ? <LoadingState label="Loading approved visitors..." /> : <DataTable compact rows={rows} columns={['request_number', 'visitor_full_name', 'visitor_id_number', 'visit_status', 'expected_arrival_time', 'expected_departure_time']} labels={{ request_number: 'Request', visitor_full_name: 'Visitor', visitor_id_number: 'ID Number', visit_status: 'Status', expected_arrival_time: 'Arrival', expected_departure_time: 'Departure' }} emptyMessage="No visitors match this date and filter." actions={(row) => <><TableActionButton tone="secondary" onClick={() => openDetails(row)}>Details</TableActionButton><TableActionButton disabled={row.raw_status !== 'PENDING_ARRIVAL'} onClick={() => openCheckIn(row.visitor_access_id)}>Check in</TableActionButton><TableActionButton disabled={row.raw_status !== 'CHECKED_IN'} onClick={() => openCheckOut(row.visitor_access_id)}>Check out</TableActionButton><TableActionButton tone="danger" disabled={row.raw_status !== 'PENDING_ARRIVAL'} onClick={() => openDeny(row.visitor_access_id)}>Deny</TableActionButton></>} />}</Panel><ActionNoteDialog dialog={dialog} onClose={() => setDialog(null)} /><DetailsDialog details={details} onClose={() => setDetails(null)} /></Page>
}
