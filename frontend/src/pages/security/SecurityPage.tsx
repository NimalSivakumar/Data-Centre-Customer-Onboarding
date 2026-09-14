import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import { ActionNoteDialog, type ActionNoteDialogState } from '../../components/ActionNoteDialog'
import { DetailsDialog, type DetailsDialogState } from '../../components/DetailsDialog'
import { LoadingState } from '../../components/LoadingState'
import { Page } from '../../components/Page'
import { Panel } from '../../components/Panel'
import { SearchFilterBar } from '../../components/SearchFilterBar'
import { visitorStatusOptions } from '../../constants/options'
import type { AuthState, SecurityVisitor } from '../../types/api'
import { buildSecurityVisitorDetails } from './SecurityVisitorDetails'
import { SecurityVisitorsTable } from './SecurityVisitorsTable'
import { mapSecurityVisitorToRow } from './securityMappers'
import type { SecurityRow } from './securityTypes'

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
    setDetails(buildSecurityVisitorDetails(row))
  }
  const rows = visitors.map(mapSecurityVisitorToRow)
  return <Page title="Security portal" error={error}><Panel><div className="table-toolbar"><label>Visit date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label></div><SearchFilterBar search={search} onSearchChange={setSearch} placeholder="Search visitor, ID number, customer, or visitor employer..." resultCount={rows.length} filters={[{ label: 'Visit status', value: statusFilter, onChange: setStatusFilter, options: visitorStatusOptions }]} onClear={() => { setSearch(''); setStatusFilter('') }} />{loading ? <LoadingState label="Loading approved visitors..." /> : <SecurityVisitorsTable rows={rows} onDetails={openDetails} onCheckIn={openCheckIn} onCheckOut={openCheckOut} onDeny={openDeny} />}</Panel><ActionNoteDialog dialog={dialog} onClose={() => setDialog(null)} /><DetailsDialog details={details} onClose={() => setDetails(null)} /></Page>
}
