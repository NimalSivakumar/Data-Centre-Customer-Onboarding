import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

const source = readFileSync(new URL('../src/pages/security/securityTiming.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } })
const exports = {}
let siteTimezone = 'Indian/Mahe'
runInNewContext(outputText, { exports, require: (name) => {
  if (name === '../../api/siteSettings') return { getSiteSettings: () => ({ site_timezone: siteTimezone }) }
  throw new Error(`Unexpected dependency: ${name}`)
} })
const { getSiteDate, getCheckInBlockReason, isScheduledToday } = exports
const row = { visit_date: '2026-10-29', expected_arrival_time: '09:00:00', expected_departure_time: '17:00:00' }

test('site date rolls over at Seychelles midnight, including year boundary', () => {
  assert.equal(getSiteDate(new Date('2026-10-28T19:59:59Z')), '2026-10-28')
  assert.equal(getSiteDate(new Date('2026-10-28T20:00:00Z')), '2026-10-29')
  assert.equal(getSiteDate(new Date('2026-12-31T20:00:00Z')), '2027-01-01')
})

for (const zone of ['UTC', 'America/Los_Angeles', 'Asia/Tokyo', 'Indian/Mahe']) {
  test(`visit window and scheduled date ignore browser timezone ${zone}`, () => {
    const previous = process.env.TZ
    process.env.TZ = zone
    try {
      assert.match(getCheckInBlockReason(row, new Date('2026-10-29T04:59:59Z')), /before/)
      assert.equal(getCheckInBlockReason(row, new Date('2026-10-29T05:00:00Z')), '')
      assert.equal(getCheckInBlockReason(row, new Date('2026-10-29T13:00:00Z')), '')
      assert.match(getCheckInBlockReason(row, new Date('2026-10-29T13:00:00.001Z')), /after/)
      assert.equal(isScheduledToday(row, new Date('2026-10-28T20:00:00Z')), true)
      assert.equal(isScheduledToday(row, new Date('2026-10-29T20:00:00Z')), false)
      assert.match(getCheckInBlockReason(row, new Date('2026-10-28T19:59:59Z')), /scheduled visit date/)
    } finally {
      if (previous === undefined) delete process.env.TZ
      else process.env.TZ = previous
    }
  })
}

test('midnight and fractional arrival times have correct inclusive boundaries', () => {
  const midnight = { ...row, expected_arrival_time: '00:00', expected_departure_time: '00:00:01.500000' }
  assert.equal(getCheckInBlockReason(midnight, new Date('2026-10-28T20:00:00Z')), '')
  assert.equal(getCheckInBlockReason(midnight, new Date('2026-10-28T20:00:01.500Z')), '')
  assert.match(getCheckInBlockReason(midnight, new Date('2026-10-28T20:00:01.501Z')), /after/)
})

test('site timezone follows backend settings rather than a fixed frontend constant', () => {
  siteTimezone = 'UTC'
  try {
    assert.equal(getSiteDate(new Date('2026-10-28T20:00:00Z')), '2026-10-28')
    assert.equal(getCheckInBlockReason(row, new Date('2026-10-29T09:00:00Z')), '')
  } finally {
    siteTimezone = 'Indian/Mahe'
  }
})
