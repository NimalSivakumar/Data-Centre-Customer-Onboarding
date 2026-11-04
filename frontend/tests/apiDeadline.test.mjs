import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

function fixture(fetch) {
  const modules = new Map()
  function load(name) {
    if (modules.has(name)) return modules.get(name)
    const source = readFileSync(new URL(`../src/api/${name}.ts`, import.meta.url), 'utf8')
      .replaceAll('import.meta.env.BASE_URL', "'/test-app/'")
    const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } })
    const exports = {}
    modules.set(name, exports)
    runInNewContext(outputText, { exports, fetch, Headers, AbortController, clearTimeout,
      setTimeout: (fn, ms) => setTimeout(fn, Math.min(ms, 5)),
      window: { location: { assign() {} } }, require: (path) => {
        if (path === '../constants/app') return { API_BASE_URL: '/test-api' }
        if (path === '../auth/applicationSession') return { getApplicationSessionId: () => 'test-session', lockApplicationSession() {} }
        if (path === './requestDeadline') return load('requestDeadline')
        throw new Error(`Unexpected import: ${path}`)
      } })
    return exports
  }
  const client = load('client')
  client.setApiTokenProvider(async () => 'test-token')
  return client
}
const auth = { user: { roles: ['OPS'] } }

test('a hung business fetch rejects within its deadline instead of hanging the page', async () => {
  const client = fixture(() => new Promise(() => {}))
  let timer
  try {
    await assert.rejects(Promise.race([
      client.api('/requests', auth),
      new Promise((resolve) => { timer = setTimeout(() => resolve('still pending'), 100) }),
    ]), /timed out/i)
  } finally { clearTimeout(timer) }
})

test('Headers and tuple inputs retain custom headers but cannot override active credentials', async () => {
  for (const headers of [
    new Headers({ 'X-Trace': 'trace', Authorization: 'wrong', 'x-app-session-id': 'wrong' }),
    [['X-Trace', 'trace'], ['authorization', 'wrong'], ['X-App-Session-ID', 'wrong']],
    { 'X-Trace': 'trace', Authorization: 'wrong', 'x-app-session-id': 'wrong' },
  ]) {
    const client = fixture(async (_, options) => {
      const actual = new Headers(options.headers)
      assert.equal(actual.get('x-trace'), 'trace')
      assert.equal(actual.get('authorization'), 'Bearer test-token')
      assert.equal(actual.get('x-app-session-id'), 'test-session')
      return { ok: true, status: 200, json: async () => ({}) }
    })
    await client.api('/requests', auth, { headers })
  }
})

test('an unauthorized response locks the app even when its error body never settles', async () => {
  const client = fixture(async () => ({ ok: false, status: 401, json: () => new Promise(() => {}) }))
  let expired = false
  client.setSessionExpiredHandler(() => { expired = true })
  await assert.rejects(client.api('/requests', auth), /timed out/i)
  assert.equal(expired, true)
})
