import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

const source = readFileSync(new URL('../src/api/siteSettings.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } })
function moduleFor(fetch) {
  const exports = {}
  runInNewContext(outputText, { exports, fetch, require: (name) => {
    if (name === '../constants/app') return { API_BASE_URL: '/test-api' }
    throw new Error(`Unexpected dependency: ${name}`)
  } })
  return exports
}

test('site settings are loaded using authentication and do not expose unrelated configuration', async () => {
  const module = moduleFor(async (url, options) => {
    assert.equal(url, '/test-api/auth/site-settings')
    assert.equal(options.headers.Authorization, 'Bearer test-token')
    return { ok: true, json: async () => ({ site_timezone: 'UTC', site_location: 'Configured site', unrelated: 'PRIVATE' }) }
  })
  assert.throws(() => module.getSiteSettings(), /not loaded/)
  await module.loadSiteSettings('test-token')
  assert.equal(module.getSiteSettings().site_location, 'Configured site')
  assert.equal(module.getSiteSettings().site_timezone, 'UTC')
  assert.equal('unrelated' in module.getSiteSettings(), false)
})

test('missing or invalid site settings fail instead of using hard-coded fallbacks', async () => {
  for (const data of [null, {}, { site_timezone: 'UTC', site_location: '' }, { site_timezone: 'Invalid/Zone', site_location: 'Test site' }]) {
    const module = moduleFor(async () => ({ ok: true, json: async () => data }))
    await assert.rejects(module.loadSiteSettings('test-token'))
    assert.throws(() => module.getSiteSettings(), /not loaded/)
  }
})

test('failed fetch does not retain stale site settings', async () => {
  let ok = true
  const module = moduleFor(async () => ({ ok, json: async () => ({ site_timezone: 'UTC', site_location: 'Test site' }) }))
  await module.loadSiteSettings('test-token')
  ok = false
  await assert.rejects(module.loadSiteSettings('test-token'), /Could not load/)
  assert.throws(() => module.getSiteSettings(), /not loaded/)
})
