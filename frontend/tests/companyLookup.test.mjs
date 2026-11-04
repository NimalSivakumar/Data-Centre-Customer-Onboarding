import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

function lookup(api) {
  const path = new URL('../src/api/companyLookup.ts', import.meta.url)
  assert.ok(existsSync(path), 'complete company lookup must exist')
  const exports = {}
  const output = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  runInNewContext(output, { exports, URLSearchParams, require: () => ({ api }) })
  return exports.loadAllCompanies
}

test('company lookup retrieves every page beyond both 20 and 100 using authenticated API', async () => {
  const auth = { user: {} }
  const calls = []
  const companies = Array.from({ length: 205 }, (_, id) => ({ id: String(id), name: `Company ${id}` }))
  const load = lookup(async (path, receivedAuth) => {
    assert.equal(receivedAuth, auth)
    const params = new URL(path, 'https://test.invalid').searchParams
    const page = Number(params.get('page'))
    const size = Number(params.get('page_size'))
    assert.equal(size, 100)
    calls.push(page)
    return { items: companies.slice((page - 1) * size, page * size), total: 205, page, page_size: size }
  })
  assert.deepEqual(Array.from(await load(auth), (company) => company.id), companies.map((company) => company.id))
  assert.deepEqual(calls, [1, 2, 3])
})

test('lookup rejects stalled, changing or inconsistent pagination instead of returning partial options', async () => {
  const pageOne = { items: Array.from({ length: 100 }, (_, id) => ({ id: String(id) })), total: 101, page: 1, page_size: 100 }
  for (const second of [
    { ...pageOne, page: 2 },
    { ...pageOne, page: 2, items: [] },
    { ...pageOne, page: 2, items: [{ id: 'b' }], total: 102 },
    { ...pageOne, page: 2, items: [{ id: 'b' }], page_size: 20 },
    { ...pageOne, items: [{ id: 'b' }] },
  ]) {
    let calls = 0
    const load = lookup(async () => { calls++; if (calls > 3) throw new Error('test loop guard'); return calls === 1 ? pageOne : second })
    await assert.rejects(load({}), /pagination/i)
    assert.ok(calls <= 2)
  }
})

test('lookup deduplicates overlapping pages only when every declared company is accounted for', async () => {
  const pages = [
    Array.from({ length: 100 }, (_, id) => ({ id: String(id) })),
    Array.from({ length: 100 }, (_, id) => ({ id: String(id + 99) })),
    Array.from({ length: 6 }, (_, id) => ({ id: String(id + 199) })),
  ]
  let index = 0
  const load = lookup(async () => ({ items: pages[index++], total: 205, page: index, page_size: 100 }))
  const items = await load({})
  assert.equal(items.length, 205)
  assert.equal(new Set(items.map((item) => item.id)).size, 205)
})

test('lookup returns no partial companies when a later page fails', async () => {
  let calls = 0
  const load = lookup(async () => {
    if (++calls === 2) throw new Error('network failed')
    return { items: Array.from({ length: 100 }, (_, id) => ({ id: String(id) })), total: 101, page: 1, page_size: 100 }
  })
  await assert.rejects(load({}), /network failed/)
})
