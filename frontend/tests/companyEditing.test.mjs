import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

// Synthetic hook/event runner: real components, no browser/DOM claims.
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve() }
function mount(path, props, api = async () => ({}), action = 'list') {
  const slots = [], deps = [], cleanups = [], cache = new Map()
  let cursor = 0, pending = [], tree
  const react = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], (v) => { slots[i] = typeof v === 'function' ? v(slots[i]) : v }] },
    useRef(value) { const i = cursor++; return slots[i] ??= { current: value } },
    useCallback(fn, values) { const i = cursor++; if (!slots[i] || values.some((v,j) => v !== slots[i].values[j])) slots[i] = { fn, values }; return slots[i].fn },
    useEffect(fn, values) { const i = cursor++; if (!deps[i] || values.some((v,j) => v !== deps[i][j])) { deps[i] = values; pending.push(() => { cleanups[i]?.(); cleanups[i] = fn() }) } },
  }
  class TestFormData extends Map { constructor(form) { super(Object.entries(form.values ?? {})) } }
  function load(url) {
    if (cache.has(url.href)) return cache.get(url.href)
    const exports = {}; cache.set(url.href, exports)
    const output = ts.transpileModule(readFileSync(url, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText
    runInNewContext(output, { exports, URLSearchParams, FormData: TestFormData, require(name) {
      if (name === 'react') return react
      if (name === 'react/jsx-runtime') return { jsx: (type, props, key) => ({ type, props, key }), jsxs: (type, props, key) => ({ type, props, key }), Fragment: 'Fragment' }
      if (name === 'react-router-dom') return { useSearchParams: () => [new URLSearchParams(`action=${action}`)] }
      if (name.endsWith('/client')) return { api }
      if (name.includes('components/')) return new Proxy({}, { get: (_, k) => k })
      if (name.startsWith('.')) {
        const root = new URL(name, url)
        for (const ext of ['.ts', '.tsx']) { const file = new URL(root.href + ext); if (existsSync(file)) return load(file) }
      }
      throw new Error(`Unexpected import ${name}`)
    } })
    return exports
  }
  const module = load(new URL(path, import.meta.url))
  const Component = Object.values(module).find((v) => typeof v === 'function')
  function render() { cursor = 0; tree = Component(props); const work = pending; pending = []; work.forEach((fn) => fn()); return tree }
  function nodes(type) { const found = []; function walk(n) { if (!n || typeof n !== 'object') return; if (n.type === type || n.type?.name === type) found.push(n); [n.props?.children].flat(Infinity).forEach(walk) } walk(tree); return found }
  render()
  return { render, nodes, root: () => tree, unmount: () => cleanups.forEach((fn) => fn?.()) }
}
const company = (id, status = 'ACTIVE') => ({ id, name: `Company ${id}`, customer_code: id, main_email: `${id}@test.invalid`, main_phone: id, notes: id, status })
const event = (values = {}) => ({ preventDefault() {}, currentTarget: { values, reset() { this.didReset = true } } })

test('company edit switches every controlled field from A draft to B including status', () => {
  const props = { company: company('A'), saving: false, onSubmit() {}, onCancel() {} }
  const view = mount('../src/pages/companies/CompanyEditForm.tsx', props)
  const name = view.nodes('input').find((n) => n.props.name === 'name')
  name.props.onChange?.({ target: { value: 'unsaved A' } })
  props.company = company('B', 'CLOSED')
  view.render()
  for (const node of [...view.nodes('input'), ...view.nodes('textarea'), ...view.nodes('select')]) {
    assert.equal(node.props.value, props.company[node.props.name] ?? '')
  }
})

test('company list uses server totals and explicit pages; filters reset page and late responses are ignored', async () => {
  const calls = []
  const view = mount('../src/pages/companies/CompaniesPage.tsx', { auth: {} }, (path) => { const pending = deferred(); calls.push({ path, ...pending }); return pending.promise })
  assert.match(calls[0].path, /page=1/)
  assert.match(calls[0].path, /page_size=20/)
  calls[0].resolve({ items: [company('A')], total: 45, page: 1, page_size: 20 })
  await flush(); view.render()
  let table = view.nodes('CompaniesTable')[0]
  assert.equal(table.props.total, 45)
  table.props.onPageChange(2); view.render()
  const old = calls.at(-1)
  assert.match(old.path, /page=2/)
  view.nodes('CompaniesTable')[0].props.onSearchChange('B'); view.render()
  const latest = calls.at(-1)
  assert.match(latest.path, /page=1/)
  assert.match(latest.path, /q=B/)
  latest.resolve({ items: [company('B')], total: 1, page: 1, page_size: 20 })
  await flush(); view.render()
  old.resolve({ items: [company('old')], total: 45, page: 2, page_size: 20 })
  await flush(); view.render()
  table = view.nodes('CompaniesTable')[0]
  assert.equal(table.props.companies[0].id, 'B')
  assert.equal(table.props.total, 1)
})

test('company table renders actual total and working previous/next navigation', () => {
  const changes = []
  const view = mount('../src/pages/companies/CompaniesTable.tsx', {
    companies: [company('A')], total: 45, page: 2, pageSize: 20, loading: false, saving: false,
    search: '', status: '', onPageChange: (page) => changes.push(page),
  })
  assert.equal(view.nodes('SectionHeading')[0].props.count, 45)
  const buttons = view.nodes('button')
  buttons.find((n) => n.props.children === 'Previous').props.onClick()
  buttons.find((n) => n.props.children === 'Next').props.onClick()
  assert.deepEqual(changes, [1, 3])
})

test('company writes synchronously block repeat submission and changing the edit target', async () => {
  const write = deferred(); const writes = []
  const view = mount('../src/pages/companies/CompaniesPage.tsx', { auth: {} }, async (path, auth, options) => {
    if (options) { writes.push(path); return write.promise }
    return { items: [company('A'), company('B')], total: 2, page: 1, page_size: 20 }
  })
  await flush(); view.render()
  view.nodes('CompaniesTable')[0].props.onEdit(company('A')); view.render()
  const submit = view.nodes('CompanyEditForm')[0].props.onSubmit
  const pending = submit(event({ name: 'Changed A' }))
  submit(event({ name: 'duplicate' }))
  view.nodes('CompaniesTable')[0].props.onEdit(company('B')); view.render()
  assert.equal(view.nodes('CompanyEditForm')[0].props.company.id, 'A')
  assert.equal(writes.length, 1)
  write.resolve(company('A')); await pending
})

test('successful company create/update followed by failed refresh reports saved, not a failed write', async () => {
  for (const action of ['list', 'create']) {
    let saved = false, writes = 0
    const view = mount('../src/pages/companies/CompaniesPage.tsx', { auth: {} }, async (path, auth, options) => {
      if (options) { saved = true; writes++; return company('A') }
      if (saved) throw new Error('offline refresh')
      return { items: [company('A')], total: 1, page: 1, page_size: 20 }
    }, action)
    await flush(); view.render()
    if (action === 'list') { view.nodes('CompaniesTable')[0].props.onEdit(company('A')); view.render() }
    const form = view.nodes(action === 'list' ? 'CompanyEditForm' : 'CompanyCreateForm')[0]
    const submitted = event({ name: 'A' })
    await form.props.onSubmit(submitted); view.render()
    assert.match(view.root().props.message, /Company (created|updated)/)
    assert.match(view.root().props.error, /saved.*refresh/i)
    assert.equal(writes, 1)
    if (action === 'list') assert.equal(view.nodes('CompanyEditForm').length, 0)
    else assert.equal(submitted.currentTarget.didReset, true)
  }
})



test('mounted company screen replaces A draft with B values and PATCHes B only', async () => {
  const { createDomHarness, loadTs } = await import('./helpers/reactDomHarness.mjs')
  const dom = await createDomHarness()
  try {
    const writes = []
    const records = [company('A'), company('B', 'CLOSED')]
    const { CompaniesPage } = loadTs('pages/companies/CompaniesPage.tsx', {
      'react-router-dom': { useSearchParams: () => [new URLSearchParams('action=list')] },
      '../../api/client': { api: async (path, auth, options) => {
        if (options) { writes.push({ path, payload: JSON.parse(options.body) }); return records[1] }
        return { items: records, total: 2, page: 1, page_size: 20 }
      } },
    })
    await dom.render(CompaniesPage, { auth: {} })
    await dom.click([...dom.container.querySelectorAll('button')].find((b) => b.textContent === 'Edit'))
    const name = dom.container.querySelector('input[name=name]')
    await dom.input(name, 'Unsaved A')
    assert.equal(name.value, 'Unsaved A')
    await dom.input(dom.container.querySelector('select[name=status]'), 'SUSPENDED')
    await dom.click([...dom.container.querySelectorAll('button')].filter((b) => b.textContent === 'Edit')[1])
    for (const field of ['name', 'customer_code', 'main_email', 'main_phone', 'status', 'notes']) {
      assert.equal(dom.container.querySelector(`[name=${field}]`).value, records[1][field])
    }
    await dom.click([...dom.container.querySelectorAll('button')].find((b) => b.textContent === 'Save changes'))
    assert.equal(writes.length, 1)
    assert.equal(writes[0].path, '/companies/B')
    assert.equal(writes[0].payload.name, 'Company B')
    assert.equal(writes[0].payload.status, 'CLOSED')
  } finally { await dom.close() }
})


test('clearing unchanged company filters does not discard already loaded rows', async () => {
  const view = mount('../src/pages/companies/CompaniesPage.tsx', { auth: {} }, async () => ({ items: [company('A')], total: 1, page: 1, page_size: 20 }))
  await flush(); view.render()
  view.nodes('CompaniesTable')[0].props.onClearFilters(); view.render()
  assert.equal(view.nodes('CompaniesTable')[0].props.companies.length, 1)
})

test('a new failed company write clears the previous success notice and retains its draft', async () => {
  let writes = 0
  const view = mount('../src/pages/companies/CompaniesPage.tsx', { auth: {} }, async (path, auth, options) => {
    if (options) { if (++writes === 2) throw new Error('write rejected'); return company('A') }
    return { items: [company('A')], total: 1, page: 1, page_size: 20 }
  }, 'create')
  await flush(); view.render()
  await view.nodes('CompanyCreateForm')[0].props.onSubmit(event({ name: 'A' })); view.render()
  assert.equal(view.root().props.message, 'Company created')
  const failed = event({ name: 'new draft' })
  await view.nodes('CompanyCreateForm')[0].props.onSubmit(failed); view.render()
  assert.equal(view.root().props.message, '')
  assert.notEqual(view.root().props.error, '')
  assert.equal(failed.currentTarget.didReset, undefined)
})
