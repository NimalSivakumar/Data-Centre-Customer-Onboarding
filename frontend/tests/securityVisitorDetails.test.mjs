import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

const source = readFileSync(new URL('../src/pages/security/SecurityVisitorDetails.tsx', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } })
const exports = {}
runInNewContext(outputText, {
  exports,
  require: (name) => {
    if (name === '../../utils/dates') return { formatDateTime: (value) => `Formatted ${value}` }
    throw new Error(`Unexpected dependency: ${name}`)
  },
})
const { buildSecurityVisitorDetails } = exports
const row = {
  visitor_full_name: 'Test visitor', visitor_id_number: 'TEST-NIN', request_number: 'REQ-TEST',
  customer_company_name: 'Test customer', equipment_carried: 'Laptop',
  expected_arrival_time: '09:00', expected_departure_time: '17:00', visit_status: 'Checked out',
  checked_in_at: '2026-10-29T05:00:00Z', checked_out_at: '2026-10-29T13:00:00Z',
  visitor_phone: 'PRIVATE-PHONE', visitor_email: 'PRIVATE-EMAIL', visitor_address: 'PRIVATE-ADDRESS',
  visitor_company: 'PRIVATE-EMPLOYER', vehicle_registration: 'PRIVATE-VEHICLE', site_location: 'PRIVATE-SITE',
}

test('security details contain exactly the owner-approved display fields', () => {
  const result = buildSecurityVisitorDetails(row)
  assert.deepEqual(Array.from(result.items, (item) => item.label), [
    'Visitor Name', 'NIN', 'Request Number', 'Customer Company', 'Equipment',
    'Arrival', 'Departure', 'Visitor Status', 'Checked In', 'Checked Out',
  ])
  assert.equal(result.title, row.visitor_full_name)
  assert.equal(result.items.find((item) => item.label === 'NIN').value, 'TEST-NIN')
})

test('extra private fields are not displayed even if present on an old cached record', () => {
  assert.equal(JSON.stringify(buildSecurityVisitorDetails(row)).includes('PRIVATE-'), false)
})

test('missing check-in and check-out timestamps remain empty', () => {
  const result = buildSecurityVisitorDetails({ ...row, checked_in_at: null, checked_out_at: null })
  assert.equal(result.items.find((item) => item.label === 'Checked In').value, null)
  assert.equal(result.items.find((item) => item.label === 'Checked Out').value, null)
})
