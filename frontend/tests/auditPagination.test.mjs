import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

// Compile the pure TypeScript helper in memory; no app startup, bundler, or test dependency needed.
const source = readFileSync(new URL('../src/pages/audit/auditPagination.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } })
const exports = {}
runInNewContext(outputText, { exports, URLSearchParams })
const { buildAuditParams, loadAuditExport } = exports
const range = { from: '2026-10-01', to: '2026-10-29' }
const rows = Array.from({ length: 235 }, (_, i) => ({
  id: `test-${i}`, created_at: '2026-10-29T09:00:00.123456+00:00',
}))

test('page and dates are sent to the server, not filtered locally', () => {
  const params = buildAuditParams(range, 3)
  assert.equal(params.get('page'), '3')
  assert.equal(params.get('page_size'), '50')
  assert.equal(params.get('from_day'), range.from)
  assert.equal(params.get('to_day'), range.to)
  assert.equal(params.get('exclude_session_events'), 'true')
})

test('empty date filters are omitted and reversed ranges are rejected', () => {
  assert.equal(buildAuditParams({ from: '', to: '' }).has('from_day'), false)
  assert.equal(buildAuditParams({ from: '', to: '' }).has('to_day'), false)
  assert.throws(() => buildAuditParams({ from: range.to, to: range.from }), /From date/)
})

test('export retrieves all 235 records with a timestamp/id cursor', async () => {
  let count = 0
  const result = await loadAuditExport(async (params) => {
    assert.equal(params.get('page'), '1')
    assert.equal(params.get('page_size'), '100')
    assert.equal(params.get('from_day'), range.from)
    assert.equal(params.get('to_day'), range.to)
    assert.equal(params.has('exclude_session_events'), false)
    if (count > 0) {
      assert.equal(params.get('before_id'), rows[count * 100 - 1].id)
      assert.equal(params.get('before_created_at'), rows[count * 100 - 1].created_at)
    }
    const items = rows.slice(count * 100, ++count * 100)
    return { items, total: 235, page: 1, page_size: 100 }
  }, range)
  assert.equal(count, 3)
  assert.equal(result.length, 235)
  assert.equal(new Set(result.map((row) => row.id)).size, 235)
})

test('an exact batch size stops at the next empty batch', async () => {
  let count = 0
  const result = await loadAuditExport(async () => ({
    items: count++ === 0 ? rows.slice(0, 100) : [], total: 100,
  }), range)
  assert.equal(result.length, 100)
  assert.equal(count, 2)
})

test('empty exports stop immediately', async () => {
  const result = await loadAuditExport(async () => ({ items: [], total: 0 }), range)
  assert.equal(result.length, 0)
})

test('full export retains session-only history even when the visible timeline is empty', async () => {
  const session = { ...rows[0], entity_type: 'user_session', action: 'SESSION_HEARTBEAT' }
  const result = await loadAuditExport(async (params) => {
    assert.equal(params.has('exclude_session_events'), false)
    return { items: [session], total: 1 }
  }, range)
  assert.equal(result.length, 1)
  assert.equal(result[0].action, 'SESSION_HEARTBEAT')
})

test('failed export batches reject instead of downloading partial history', async () => {
  let count = 0
  await assert.rejects(loadAuditExport(async () => {
    if (count++ === 0) return { items: rows.slice(0, 100), total: 235 }
    throw new Error('Connection lost')
  }, range), /Connection lost/)
})

test('repeated records reject rather than loop forever or silently duplicate rows', async () => {
  await assert.rejects(loadAuditExport(async () => ({ items: rows.slice(0, 100), total: 235 }), range), /retry the export/)
})
