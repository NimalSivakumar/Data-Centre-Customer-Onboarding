import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

function load() {
  const source = readFileSync(new URL('../src/api/requestDeadline.ts', import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } })
  const exports = {}
  runInNewContext(outputText, { exports, AbortController, setTimeout, clearTimeout })
  return exports
}

test('deadline bounds an operation that never settles and aborts its work', async () => {
  const { withDeadline } = load()
  let requestSignal
  await assert.rejects(withDeadline((signal) => {
    requestSignal = signal
    return new Promise(() => {})
  }, { timeoutMs: 5 }), /timed out/i)
  assert.equal(requestSignal.aborted, true)
})

test('caller cancellation rejects promptly without starting already-cancelled work', async () => {
  const { withDeadline } = load()
  const controller = new AbortController()
  controller.abort()
  let called = false
  await assert.rejects(withDeadline(async () => {
    called = true
    return 'not allowed'
  }, { signal: controller.signal, timeoutMs: 100 }), /cancel/i)
  assert.equal(called, false)
})
