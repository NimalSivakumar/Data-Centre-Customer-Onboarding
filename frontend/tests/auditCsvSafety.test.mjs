import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

async function exportedCsv(actorName) {
  const source = readFileSync(new URL('../src/pages/audit/auditExport.ts', import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } })
  const exports = {}
  let downloaded
  runInNewContext(outputText, { exports, Blob,
    URL: { createObjectURL(blob) { downloaded = blob; return 'blob:test' }, revokeObjectURL() {} },
    document: { createElement: () => ({ click() {}, remove() {} }), body: { append() {} } },
    require: (name) => {
      if (name === '../../utils/dates') return { formatDateTime: () => 'Test date' }
      if (name === './auditFormatters') return { formatAuditSentence: () => 'Test summary', formatAuditLines: () => ['Test detail'] }
      throw new Error(`Unexpected import: ${name}`)
    },
  })
  exports.exportAuditLogs([{ created_at: '2026-11-03T08:00:00Z', actor_full_name: actorName,
    actor_email: 'synthetic@example.com', action: 'CONTACT_UPDATED', entity_type: 'contact', entity_id: 'synthetic' }], { from: '', to: '' })
  return downloaded.text()
}

test('downloaded audit CSV neutralizes a formula-leading actor text cell', async () => {
  const csv = await exportedCsv('=1+1')
  assert.ok(csv.includes('"\'=1+1"'), 'CSV actor text must be apostrophe-prefixed before quoting')
})
