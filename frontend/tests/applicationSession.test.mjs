import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

const source = readFileSync(new URL('../src/auth/applicationSession.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } })
const exports = {}
const storage = new Map()
runInNewContext(outputText, { exports, sessionStorage: {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
  removeItem: (key) => storage.delete(key),
} })

test('expired-session lock survives reload and removes the old session ID', () => {
  exports.setApplicationSessionId('test-session')
  exports.lockApplicationSession()
  assert.equal(exports.getApplicationSessionId(), null)
  assert.equal(exports.isApplicationLocked(), true)
  exports.unlockApplicationSession()
  assert.equal(exports.isApplicationLocked(), false)
})

test('cached Microsoft authentication cannot silently create a replacement session', () => {
  assert.equal(exports.sessionBootstrapAction(false, false, null), 'sign-in')
  assert.equal(exports.sessionBootstrapAction(false, true, 'old-id'), 'sign-in')
  assert.equal(exports.sessionBootstrapAction(false, false, 'active-id'), 'resume')
  assert.equal(exports.sessionBootstrapAction(true, true, null), 'start')
})
