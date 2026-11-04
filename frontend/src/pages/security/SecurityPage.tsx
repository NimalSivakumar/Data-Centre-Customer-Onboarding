import { useCallback, useEffect, useRef, useState } from 'react'
import { operationError } from '../../utils/asyncOperation'
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
import { getCheckInBlockReason, getSiteDate, isScheduledToday } from './securityTiming'

export function SecurityPage({ auth }: { auth: AuthState }) {
  const [date, setDate] = useState(getSiteDate())
  const [visitors, setVisitors] = useState<SecurityVisitor[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [dialog, setDialog] = useState<ActionNoteDialogState | null>(null)
  const [details, setDetails] = useState<DetailsDialogState | null>(null)
  const readVersion = useRef(0)
  const reading = useRef(false)
  const load = useCallback(async () => {
    const version = ++readVersion.current
    reading.current = true
    setLoading(true)
    setError('')
    setVisitors([])
    try {
      const params = new URLSearchParams({ date })
      if (search.trim()) params.set('q', search.trim())
      if (statusFilter) params.set('status', statusFilter)
      const result = await api<SecurityVisitor[]>(`/security/visitors?${params}`, auth)
      if (version !== readVersion.current) return false
      setVisitors(result)
      return true
    } catch (err) {
      if (version === readVersion.current) setError(operationError(err))
      return false
    } finally {
      if (version === readVersion.current) {
        reading.current = false
        setLoading(false)
      }
    }
  }, [auth, date, search, statusFilter])
  useEffect(() => {
    const versionRef = readVersion
    void load()
    return () => { versionRef.current++ }
  }, [load])
  const mutationBusy = useRef(false)
  const [saving, setSaving] = useState(false)
  const latestLoad = useRef(load)
  latestLoad.current = load
  const [now, setNow] = useState(() => new Date())
  const activeDialog = useRef(dialog)
  activeDialog.current = dialog

  useEffect(() => {
    const visible = () => document.visibilityState === 'visible'
    const updateClock = () => { if (visible()) setNow(new Date()) }
    const refresh = () => {
      if (visible() && !reading.current && !mutationBusy.current && !activeDialog.current) {
        void latestLoad.current()
      }
    }
    const onVisible = () => { updateClock(); refresh() }
    // Clock ticks only rerender time-sensitive controls. List refreshes never
    // report user activity or call the session activity/heartbeat endpoints.
    const clockTimer = setInterval(updateClock, 1000)
    const refreshTimer = setInterval(refresh, 30000)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(clockTimer)
      clearInterval(refreshTimer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  function openAction(id: string, action: 'check-in' | 'check-out' | 'deny-entry') {
    if (mutationBusy.current || loading) return
    const checkIn = action === 'check-in'
    const deny = action === 'deny-entry'
    const visitor = visitors.find((item) => item.visitor_access_id === id)
    function blockReason() {
      if (!visitor) return 'Refresh the visitor list before continuing.'
      if (visitor.visit_status !== (action === 'check-out' ? 'CHECKED_IN' : 'PENDING_ARRIVAL')) {
        return 'This action is not available for the current visitor status.'
      }
      if (checkIn) return getCheckInBlockReason(visitor)
      if (deny && !isScheduledToday(visitor)) return 'Deny entry is only allowed on the scheduled visit date'
      return ''
    }
    const blocked = blockReason()
    if (blocked) { setError(blocked); return }
    let completed = false
    setDialog({
      title: checkIn ? 'Check in visitor' : deny ? 'Deny visitor entry' : 'Check out visitor',
      message: checkIn
        ? 'Confirm identity before checking this visitor into site.'
        : deny ? 'Record the reason before denying this visitor access to site.'
          : 'Confirm this visitor has left site before closing the access record.',
      noteLabel: deny ? 'Denial reason' : undefined,
      confirmLabel: checkIn ? 'Check in visitor' : deny ? 'Deny entry' : 'Check out visitor',
      requireIdentityCheck: checkIn,
      danger: deny,
      onConfirm: async (securityNotes) => {
        if (completed || mutationBusy.current) return
        const blocked = blockReason()
        if (blocked) throw new Error(blocked)
        mutationBusy.current = true
        setSaving(true)
        try {
          await api(`/security/visitors/${id}/${action}`, auth, {
            method: 'POST',
            body: JSON.stringify(checkIn
              ? { identity_verified: true, security_notes: null }
              : { security_notes: deny ? securityNotes : null }),
          })
          completed = true
          if (!await latestLoad.current()) setError('Action completed, but refresh failed. Refresh the list before continuing.')
        } finally {
          mutationBusy.current = false
          setSaving(false)
        }
      },
    })
  }
  function openDetails(row: SecurityRow) {
    setDetails(buildSecurityVisitorDetails(row))
  }
  const rows = visitors.map(mapSecurityVisitorToRow)
  return (
    <Page title="Security portal" error={error}>
      <Panel>
        <div className="table-toolbar">
          <label>
            Visit date
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </label>
          <button type="button" className="secondary" disabled={loading || saving} onClick={() => { setNow(new Date()); void load() }}>Refresh</button>
        </div>
        <SearchFilterBar
          search={search}
          onSearchChange={setSearch}
          placeholder="Search visitor, NIN, request number, or customer..."
          resultCount={rows.length}
          filters={[{ label: 'Visit status', value: statusFilter, onChange: setStatusFilter, options: visitorStatusOptions }]}
          onClear={() => { setSearch(''); setStatusFilter('') }}
        />
        {loading ? <LoadingState label="Loading approved visitors..." /> : (
          <SecurityVisitorsTable
            rows={rows}
            busy={saving}
            now={now}
            onDetails={openDetails}
            onCheckIn={(id) => openAction(id, 'check-in')}
            onCheckOut={(id) => openAction(id, 'check-out')}
            onDeny={(id) => openAction(id, 'deny-entry')}
          />
        )}
      </Panel>
      <ActionNoteDialog dialog={dialog} onClose={() => setDialog(null)} />
      <DetailsDialog details={details} onClose={() => setDetails(null)} />
    </Page>
  )
}
