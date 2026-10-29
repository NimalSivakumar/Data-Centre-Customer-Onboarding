import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

const source = readFileSync(new URL('../src/api/client.ts', import.meta.url), 'utf8')
  .replaceAll('import.meta.env.BASE_URL', "'/test-app/'")
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } })
function fixture(fetch, sessionId = 'test-session') {
  const exports = {}
  let locked = false
  let expired = false
  runInNewContext(outputText, { exports, fetch, window: { location: { assign: () => {} } }, require: (name) => {
    if (name === '../constants/app') return { API_BASE_URL: '/test-api' }
    if (name === '../auth/applicationSession') return {
      getApplicationSessionId: () => sessionId,
      lockApplicationSession: () => { locked = true; sessionId = null },
    }
    throw new Error(`Unexpected dependency: ${name}`)
  } })
  exports.setApiTokenProvider(async () => 'test-token')
  exports.setSessionExpiredHandler(() => { expired = true })
  return { api: exports.api, get locked() { return locked }, get expired() { return expired } }
}
const auth = { user: { roles: ['OPS'] } }

test('protected requests send token and application session ID', async () => {
  const f = fixture(async (url, options) => {
    assert.equal(url, '/test-api/requests')
    assert.equal(options.headers.Authorization, 'Bearer test-token')
    assert.equal(options.headers['X-App-Session-ID'], 'test-session')
    return { ok: true, status: 200, json: async () => ({ items: [] }) }
  })
  await f.api('/requests', auth)
})

test('expired API response locks the application rather than silently renewing it', async () => {
  const f = fixture(async () => ({ ok: false, status: 401, json: async () => ({ detail: 'Session expired' }) }))
  await assert.rejects(f.api('/requests', auth), /Session expired/)
  assert.equal(f.locked, true)
  assert.equal(f.expired, true)
})

test('missing session blocks the request before fetch', async () => {
  let called = false
  const f = fixture(async () => { called = true }, null)
  await assert.rejects(f.api('/requests', auth), /Application session required/)
  assert.equal(called, false)
  assert.equal(f.expired, true)
})

test('callers cannot override the active application session header', async () => {
  const f = fixture(async (_, options) => {
    assert.equal(options.headers['X-App-Session-ID'], 'test-session')
    return { ok: true, status: 200, json: async () => ({}) }
  })
  await f.api('/requests', auth, { headers: { 'X-App-Session-ID': 'other-session' } })
})

test('204 responses do not attempt JSON parsing', async () => {
  const f = fixture(async () => ({ ok: true, status: 204, json: async () => { throw new Error('No JSON') } }))
  assert.equal(await f.api('/requests', auth), undefined)
})
