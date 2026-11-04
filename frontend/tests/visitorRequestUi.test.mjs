import assert from 'node:assert/strict'
import test from 'node:test'
import { createDomHarness, loadTs } from './helpers/reactDomHarness.mjs'

const auth = { user: { roles: ['OPS'] } }
const companies = [{ id: 'company-a', name: 'Company A', status: 'ACTIVE' }, { id: 'company-b', name: 'Company B', status: 'ACTIVE' }]

async function fixture(apiOverride) {
  const h = await createDomHarness()
  const { VisitorRequestPage } = loadTs('pages/visitor-request/VisitorRequestPage.tsx', {
    '../../api/client': { api: apiOverride ?? (async (path) => path.startsWith('/companies/')
      ? [{ id: 'host-a', full_name: 'Synthetic host', status: 'ACTIVE' }]
      : { items: companies, total: companies.length, page: 1, page_size: 20 }) },
    '../../api/siteSettings': { getSiteSettings: () => ({ site_location: 'Synthetic site', site_timezone: 'Indian/Mahe' }) },
    '../../api/companyLookup': { loadAllCompanies: async () => companies },
  })
  await h.render(VisitorRequestPage, { auth })
  return h
}

async function reviewRequest(h) {
  await h.input(h.container.querySelector('[name="company_id"]'), 'company-a')
  await h.flush()
  for (const [name, value] of [['visit_date', '2026-11-04'], ['expected_arrival_time', '09:00'],
    ['expected_departure_time', '17:00'], ['host_contact_name', 'Synthetic host'], ['visit_reason', 'Synthetic visit']]) {
    await h.input(h.container.querySelector(`[name="${name}"]`), value)
  }
  await h.input(h.container.querySelector('[placeholder="Full name *"]'), 'Synthetic visitor')
  await h.input(h.container.querySelector('[placeholder="ID / passport number *"]'), 'SYNTHETIC-ID')
  await h.click([...h.container.querySelectorAll('button')].find((b) => b.textContent === 'Review request'))
}

test('visitor company picker uses the complete directory, not the first backend page', async () => {
  const h = await createDomHarness()
  const directory = Array.from({ length: 125 }, (_, i) => ({ id: `company-${i}`, name: `Company ${i}`, status: 'ACTIVE' }))
  let lookups = 0
  const { VisitorRequestPage } = loadTs('pages/visitor-request/VisitorRequestPage.tsx', {
    '../../api/client': { api: async () => { throw new Error('Unexpected first-page company request') } },
    '../../api/siteSettings': { getSiteSettings: () => ({ site_location: 'Synthetic site', site_timezone: 'Indian/Mahe' }) },
    '../../api/companyLookup': { loadAllCompanies: async () => { lookups++; return directory } },
  })
  try {
    await h.render(VisitorRequestPage, { auth })
    assert.equal(lookups, 1)
    assert.equal(h.container.querySelector('[name="company_id"]').options.length, 126)
  } finally { await h.close() }
})

test('company changes disable host choices and a late previous response cannot replace current contacts', async () => {
  let resolveA, resolveB
  const pendingA = new Promise((done) => { resolveA = done })
  const pendingB = new Promise((done) => { resolveB = done })
  const h = await fixture((path) => path.includes('company-a') ? pendingA : pendingB)
  try {
    await h.input(h.container.querySelector('[name="company_id"]'), 'company-a')
    await h.input(h.container.querySelector('[name="company_id"]'), 'company-b')
    assert.equal(h.container.querySelector('[name="host_contact_name"]').disabled, true)
    resolveB([{ id: 'host-b', full_name: 'Current host B', status: 'ACTIVE' }])
    await h.flush()
    assert.equal(h.container.querySelector('[name="host_contact_name"]').disabled, false)
    assert.match(h.container.querySelector('[name="host_contact_name"]').textContent, /Current host B/)
    resolveA([{ id: 'host-a', full_name: 'Stale host A', status: 'ACTIVE' }])
    await h.flush()
    assert.doesNotMatch(h.container.querySelector('[name="host_contact_name"]').textContent, /Stale host A/)
  } finally { await h.close() }
})

test('confirmation sends its reviewed payload once and cannot reopen editing during a pending write', async () => {
  let completeWrite
  const writing = new Promise((done) => { completeWrite = done })
  const writes = []
  const h = await fixture(async (path, _auth, init) => {
    if (init?.method === 'POST') { writes.push(JSON.parse(init.body)); return writing }
    return [{ id: 'host-a', full_name: 'Synthetic host', status: 'ACTIVE' }]
  })
  try {
    await reviewRequest(h)
    const confirm = [...h.container.querySelectorAll('button')].find((b) => b.textContent === 'Confirm and submit')
    await h.click(confirm)
    assert.equal(writes.length, 1)
    assert.equal(writes[0].company_id, 'company-a')
    const edit = [...h.container.querySelectorAll('button')].find((b) => b.textContent === 'Edit request')
    assert.equal(edit.disabled, true)
    await h.click(confirm)
    assert.equal(writes.length, 1)
    completeWrite({ request_number: 'SYNTHETIC-REQUEST' })
    await h.flush()
    assert.equal(h.container.querySelector('.confirm-panel'), null)
    assert.match(h.container.textContent, /Visitor request submitted: SYNTHETIC-REQUEST/)
  } finally { await h.close() }
})

test('review cannot queue a request when current company contacts failed to load', async () => {
  const h = await fixture(async () => { throw new Error('Contacts unavailable') })
  try {
    await reviewRequest(h)
    assert.equal(Boolean(h.container.querySelector('.confirm-panel')), false)
    assert.match(h.container.textContent, /contact|host/i)
  } finally { await h.close() }
})

test('each visitor draft field has a persistent label', async () => {
  const h = await fixture()
  try {
    for (const field of h.container.querySelectorAll('.visitor-card input, .visitor-card textarea')) {
      assert.ok(field.labels.length > 0, `Missing label for ${field.placeholder}`)
    }
  } finally { await h.close() }
})

test('late company-directory results from an earlier auth render are ignored', async () => {
  const h = await createDomHarness()
  let resolveOld, resolveCurrent
  let call = 0
  const old = new Promise((done) => { resolveOld = done })
  const current = new Promise((done) => { resolveCurrent = done })
  const { VisitorRequestPage } = loadTs('pages/visitor-request/VisitorRequestPage.tsx', {
    '../../api/client': { api: async () => [] },
    '../../api/siteSettings': { getSiteSettings: () => ({ site_location: 'Synthetic site' }) },
    '../../api/companyLookup': { loadAllCompanies: () => ++call === 1 ? old : current },
  })
  try {
    await h.render(VisitorRequestPage, { auth })
    await h.render(VisitorRequestPage, { auth: { user: { roles: ['ADMIN'] } } })
    resolveCurrent([{ id: 'current', name: 'Current directory', status: 'ACTIVE' }])
    await h.flush()
    resolveOld([{ id: 'old', name: 'Stale directory', status: 'ACTIVE' }])
    await h.flush()
    assert.match(h.container.querySelector('[name="company_id"]').textContent, /Current directory/)
    assert.doesNotMatch(h.container.querySelector('[name="company_id"]').textContent, /Stale directory/)
  } finally { await h.close() }
})

test('review locks the actual draft until Edit request, preserving its company/payload snapshot', async () => {
  const h = await fixture()
  try {
    await reviewRequest(h)
    assert.match(h.container.textContent, /Confirm submission/)
    assert.match(h.container.querySelector('.confirm-panel').textContent, /Company A/)
    assert.equal(h.container.querySelector('[name="company_id"]').matches(':disabled'), true,
      'the reviewed draft must not remain editable while its old payload is queued')
    await h.click([...h.container.querySelectorAll('button')].find((b) => b.textContent === 'Edit request'))
    assert.equal(h.container.querySelector('[name="company_id"]').matches(':disabled'), false)
    assert.equal(h.container.querySelector('.confirm-panel'), null)
  } finally { await h.close() }
})
