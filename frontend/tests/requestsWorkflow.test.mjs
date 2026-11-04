import assert from 'node:assert/strict'
import test from 'node:test'
import { createDomHarness, loadTs, act } from './helpers/reactDomHarness.mjs'
import { mount, deferred, flush } from './workflowHarness.mjs'

const auth = { user: { roles: ['ADMIN'] } }
const props = { auth, user: auth.user }
export function requestsMount(api, user = auth.user) {
  return mount('../src/pages/requests/RequestsPage.tsx', { ...props, user }, {
    '../../api/client': { api },
    './RequestDetails': { buildRequestDetails: () => ({}) },
    './requestMappers': { mapRequestToRow: (v) => ({ ...v, raw_status: v.status }) },
  })
}
const response = (items = [], total = 0) => ({ items, total, page: 1, page_size: 20 })

test('only the newest request read may publish rows, errors, or loading completion', async () => {
  const reads = []
  const ui = requestsMount(() => { const read = deferred(); reads.push(read); return read.promise })
  ui.nodes('RequestsTable')[0].props.onSearchChange('new'); ui.render()
  reads[1].resolve(response([{ id: 'new' }], 1)); await flush(); ui.render()
  reads[0].resolve(response([{ id: 'old' }], 1)); await flush(); ui.render()
  assert.equal(ui.nodes('RequestsTable')[0].props.rows[0].id, 'new')
  ui.nodes('RequestsTable')[0].props.onSearchChange('failed'); ui.render()
  reads[2].reject(new Error('Read failed')); await flush(); ui.render()
  assert.equal(ui.nodes('Page')[0].props.error, 'Read failed')
  assert.equal(ui.nodes('RequestsTable')[0].props.rows.length, 0)
  ui.nodes('RequestsTable')[0].props.onSearchChange('recovered'); ui.render()
  assert.equal(ui.nodes('RequestsTable').length, 1)
  reads[3].resolve(response()); await flush(); ui.render()
  assert.equal(ui.nodes('Page')[0].props.error, '')
})

test('approval requires confirmation; completed mutations survive failed refresh without duplicate retry', async () => {
  const posts = []; let reads = 0
  const mutation = deferred()
  const ui = requestsMount((url, _auth, options) => {
    if (options?.method === 'POST') { posts.push(url); return mutation.promise }
    if (++reads === 1) return Promise.resolve(response([{ id: 'r1', status: 'SUBMITTED' }], 1))
    return Promise.reject(new Error('Refresh failed'))
  })
  await flush(); ui.render()
  ui.nodes('RequestsTable')[0].props.onReview('r1', 'approve'); ui.render()
  assert.equal(posts.length, 0)
  const dialog = ui.nodes('ActionNoteDialog')[0].props.dialog
  assert.equal(dialog.confirmLabel, 'Approve request')
  const first = dialog.onConfirm('')
  const second = dialog.onConfirm('')
  mutation.resolve({}); await Promise.all([first, second]); ui.render()
  assert.equal(posts.length, 1)
  assert.match(ui.nodes('Page')[0].props.error, /completed.*refresh/i)
  await dialog.onConfirm(''); assert.equal(posts.length, 1)
  assert.ok(ui.nodes('button').some((b) => b.props.children === 'Refresh'))
})

test('request filters preserve decisions without an expired option', () => {
  const ui = mount('../src/pages/requests/RequestsTable.tsx', {
    rows: [], canApprove: false, canReject: false, search: '', statusFilter: '',
  })
  const values = ui.nodes('SearchFilterBar')[0].props.filters[0].options.map((option) => option.value)
  assert.ok(values.includes('APPROVED') && values.includes('REJECTED'))
  assert.equal(values.includes('EXPIRED'), false)
})

test('eight requests hide page-size and previous/next controls; larger lists retain them', async () => {
  const small = requestsMount(() => Promise.resolve(response([], 8)))
  await flush(); small.render()
  assert.equal(small.nodes('nav').some((node) => node.props['aria-label'] === 'Request pages'), false)
  const larger = requestsMount(() => Promise.resolve(response([], 21)))
  await flush(); larger.render()
  assert.equal(larger.nodes('nav').some((node) => node.props['aria-label'] === 'Request pages'), true)
})

test('request page size is bounded at 100 and changing it resets pagination', async () => {
  const calls = []
  const ui = requestsMount((url) => { calls.push(url); return Promise.resolve(response([], 250)) })
  await flush(); ui.render()
  ui.nodes('button').find((b) => b.props.children === 'Next').props.onClick(); ui.render()
  await flush(); ui.render()
  const size = ui.nodes('select')[0]
  assert.ok(size)
  size.props.onChange({ target: { value: '1000' } }); ui.render()
  await flush(); ui.render()
  let params = new URL(calls.at(-1), 'https://test.invalid').searchParams
  assert.equal(params.get('page'), '1')
  assert.equal(params.get('page_size'), '100')
  ui.nodes('select')[0].props.onChange({ target: { value: '50' } }); ui.render()
  await flush(); ui.render()
  params = new URL(calls.at(-1), 'https://test.invalid').searchParams
  assert.equal(params.get('page_size'), '50')
  ui.nodes('RequestsTable')[0].props.onSearchChange('reset'); ui.render()
  await flush(); ui.render()
  assert.equal(new URL(calls.at(-1), 'https://test.invalid').searchParams.get('page'), '1')
})

test('request pagination recovers when a filtered last page disappears', async () => {
  let total = 21
  const calls = []
  const ui = requestsMount((url) => { calls.push(url); return Promise.resolve(response([], total)) })
  await flush(); ui.render()
  ui.nodes('button').find((b) => b.props.children === 'Next').props.onClick(); ui.render()
  await flush(); ui.render()
  total = 20
  ui.nodes('button').find((b) => b.props.children === 'Refresh').props.onClick()
  await flush(); ui.render(); await flush(); ui.render()
  assert.equal(new URL(calls.at(-1), 'https://test.invalid').searchParams.get('page'), '1')
})

test('mounted request toolbar remains focused during reads without a false empty-result message', async () => {
  const dom = await createDomHarness()
  const reads = []
  try {
    const { RequestsPage } = loadTs('pages/requests/RequestsPage.tsx', {
      '../api/siteSettings': { getSiteSettings: () => ({ site_timezone: 'Indian/Mahe', site_location: 'Test site' }) },
      '../../api/client': { api: () => { const read = deferred(); reads.push(read); return read.promise } },
    })
    await dom.render(RequestsPage, props)
    const search = dom.container.querySelector('input[type="search"]') ?? dom.container.querySelector('input')
    assert.ok(search)
    const hasEmptyMessage = () => dom.container.textContent.includes('No visitor requests match')
    const emptyStates = { initialLoading: hasEmptyMessage() }
    await act(async () => reads[0].resolve(response([], 0)))
    emptyStates.completedEmptyRead = hasEmptyMessage()
    search.focus()
    await dom.input(search, 'needle')
    assert.equal(dom.container.querySelector('input'), search)
    assert.equal(dom.window.document.activeElement, search)
    assert.equal(reads.length, 2)
    emptyStates.searchLoading = hasEmptyMessage()
    await act(async () => reads[1].reject(new Error('Network unavailable')))
    assert.match(dom.container.querySelector('.alert-danger').textContent, /Network unavailable/)
    emptyStates.failedRead = hasEmptyMessage()
    await dom.input(search, 'retry')
    assert.equal(dom.container.querySelector('input'), search)
    assert.equal(dom.window.document.activeElement, search)
    emptyStates.retryLoading = hasEmptyMessage()
    await act(async () => reads[2].resolve(response([], 0)))
    assert.equal(dom.container.querySelector('.alert-danger'), null)
    emptyStates.completedRetry = hasEmptyMessage()
    assert.deepEqual(emptyStates, {
      initialLoading: false, completedEmptyRead: true, searchLoading: false,
      failedRead: false, retryLoading: false, completedRetry: true,
    })
  } finally { await dom.close() }
})

test('request reads use API pagination and keep controls mounted while loading', async () => {
  const calls = [], read = deferred()
  const ui = requestsMount((url) => { calls.push(url); return read.promise })
  const params = new URL(calls[0], 'https://test.invalid').searchParams
  assert.equal(params.get('page'), '1')
  assert.equal(params.get('page_size'), '20')
  assert.equal(ui.nodes('RequestsTable').length, 1)
  read.resolve(response([], 41)); await flush(); ui.render()
  assert.ok(ui.nodes('button').some((b) => b.props.children === 'Next' && !b.props.disabled))
  ui.nodes('button').find((b) => b.props.children === 'Next').props.onClick()
  ui.render(); await flush()
  assert.equal(new URL(calls.at(-1), 'https://test.invalid').searchParams.get('page'), '2')
})
