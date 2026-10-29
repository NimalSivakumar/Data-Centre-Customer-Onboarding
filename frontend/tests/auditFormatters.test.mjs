import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

const source = readFileSync(new URL('../src/pages/audit/auditFormatters.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } })
const exports = {}
runInNewContext(outputText, { exports, require: (name) => {
  if (name === '../../utils/records') return { isRecord: (value) => typeof value === 'object' && value !== null && !Array.isArray(value) }
  throw new Error(`Unexpected dependency: ${name}`)
} })
const { formatAuditLines } = exports
const lines = (metadata) => Array.from(formatAuditLines({ action: 'REQUEST_SUBMITTED', summary: 'Submitted', metadata_json: metadata }))

test('single visitor uses Visitor, not First visitor', () => {
  assert.deepEqual(lines({ visitor_count: 1, visitor_full_names: ['Test name'] }), ['Visitors included: 1', 'Visitor: Test name'])
})

test('all visitors are listed in order, including duplicate names', () => {
  assert.deepEqual(lines({ visitor_count: 3, visitor_full_names: ['Alpha', 'Beta', 'Alpha'] }), [
    'Visitors included: 3', 'Visitor 1: Alpha', 'Visitor 2: Beta', 'Visitor 3: Alpha',
  ])
})

test('existing single-visitor entries get the corrected label without changing stored history', () => {
  assert.deepEqual(lines({ visitor_count: 1, first_visitor_full_name: 'Legacy name' }), ['Visitors included: 1', 'Visitor: Legacy name'])
})

test('old multi-visitor entries explicitly disclose missing names', () => {
  assert.deepEqual(lines({ visitor_count: 3, first_visitor_full_name: 'Legacy name' }), [
    'Visitors included: 3', 'Recorded visitor: Legacy name', 'Other visitor names were not captured in this legacy audit entry.',
  ])
})

test('invalid name values do not crash formatting or imply a complete list', () => {
  assert.deepEqual(lines({ visitor_count: 3, visitor_full_names: ['Alpha', null, {}, ''] }), [
    'Visitors included: 3', 'Visitor 1: Alpha', 'Other visitor names were not captured in this audit entry.',
  ])
})

test('audit entries without visitor snapshots remain readable', () => {
  assert.deepEqual(lines({ visitor_count: 2 }), ['Visitors included: 2'])
})
