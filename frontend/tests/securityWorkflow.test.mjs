import assert from 'node:assert/strict'
import test from 'node:test'
import { mount, deferred, flush } from './workflowHarness.mjs'

const visitor = { visitor_access_id: 'v1', visit_status: 'PENDING_ARRIVAL', visit_date: '2026-11-03', expected_arrival_time: '09:00', expected_departure_time: '17:00' }
function securityMount(api, timing = {}) {
  return mount('../src/pages/security/SecurityPage.tsx', { auth: { user: { roles: ['SECURITY'] } } }, {
    '../../api/client': { api },
    './SecurityVisitorDetails': { buildSecurityVisitorDetails: () => ({}) },
    './securityMappers': { mapSecurityVisitorToRow: (v) => ({ ...v, raw_status: v.visit_status }) },
    './securityTiming': { getSiteDate: () => '2026-11-03', getCheckInBlockReason: () => '', isScheduledToday: () => true, ...timing },
  })
}

test('security guards repeated mutations and reports completed writes separately from refresh failures', async () => {
  let reads = 0, posts = 0
  const mutation = deferred()
  const ui = securityMount((_url, _auth, options) => {
    if (options?.method === 'POST') { posts++; return mutation.promise }
    return ++reads === 1 ? Promise.resolve([visitor]) : Promise.reject(new Error('Refresh failed'))
  })
  await flush(); ui.render()
  ui.nodes('SecurityVisitorsTable')[0].props.onCheckIn('v1'); ui.render()
  const dialog = ui.nodes('ActionNoteDialog')[0].props.dialog
  assert.equal(dialog.requireIdentityCheck, true)
  const first = dialog.onConfirm(''), second = dialog.onConfirm('')
  mutation.resolve({}); await Promise.all([first, second]); ui.render()
  assert.equal(posts, 1)
  assert.match(ui.nodes('Page')[0].props.error, /completed.*refresh/i)
  await dialog.onConfirm(''); assert.equal(posts, 1)
})

test('security revalidates the check-in time window at confirmation', async () => {
  let blocked = '', posts = 0
  const ui = securityMount((_url, _auth, options) => {
    if (options?.method === 'POST') posts++
    return Promise.resolve([visitor])
  }, { getCheckInBlockReason: () => blocked })
  await flush(); ui.render()
  ui.nodes('SecurityVisitorsTable')[0].props.onCheckIn('v1'); ui.render()
  const dialog = ui.nodes('ActionNoteDialog')[0].props.dialog
  blocked = 'Check-in is not available after the expected departure time'
  await assert.rejects(dialog.onConfirm(''), /departure/)
  assert.equal(posts, 0)
})

test('security refreshes visible pages and time boundaries without session-activity calls', async () => {
  const calls = []
  const ui = securityMount((url) => { calls.push(url); return Promise.resolve([visitor]) })
  await flush(); ui.render()
  assert.ok(ui.nodes('button').some((b) => b.props.children === 'Refresh'))
  assert.ok(ui.timers.size > 0)
  const initialNow = ui.nodes('SecurityVisitorsTable')[0].props.now
  for (const tick of [...ui.timers.values()]) tick()
  await flush(); ui.render()
  assert.notEqual(ui.nodes('SecurityVisitorsTable')[0].props.now, initialNow)
  assert.ok(calls.length > 1)
  ui.document.visibilityState = 'hidden'
  const count = calls.length
  for (const tick of [...ui.timers.values()]) tick()
  await flush(); ui.render()
  assert.equal(calls.length, count)
  ui.document.visibilityState = 'visible'
  ui.listeners.get('visibilitychange')(); await flush(); ui.render()
  assert.ok(calls.length > count)
  assert.ok(calls.every((url) => url.startsWith('/security/visitors?')))
  ui.unmount(); assert.equal(ui.timers.size, 0)
})

test('security offers backend-supported no-show filters without a cancellation entry', () => {
  const ui = securityMount(() => new Promise(() => {}))
  const values = ui.nodes('SearchFilterBar')[0].props.filters[0].options.map((option) => option.value)
  assert.ok(values.includes('NO_SHOW'))
  assert.equal(values.includes('CANCELLED'), false)
})

test('security ignores stale reads and clears failed results while controls stay mounted', async () => {
  const reads = []
  const ui = securityMount(() => { const read = deferred(); reads.push(read); return read.promise })
  ui.nodes('SearchFilterBar')[0].props.onSearchChange('new'); ui.render()
  reads[1].resolve([{ ...visitor, visitor_access_id: 'new' }]); await flush(); ui.render()
  reads[0].resolve([visitor]); await flush(); ui.render()
  assert.equal(ui.nodes('SecurityVisitorsTable')[0].props.rows[0].visitor_access_id, 'new')
  ui.nodes('SearchFilterBar')[0].props.onSearchChange('fail'); ui.render()
  reads[2].reject(new Error('Read failed')); await flush(); ui.render()
  assert.equal(ui.nodes('Page')[0].props.error, 'Read failed')
  assert.equal(ui.nodes('SecurityVisitorsTable')[0]?.props.rows.length ?? 0, 0)
  assert.equal(ui.nodes('SearchFilterBar').length, 1)
})
