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

test('contact creation disables every draft control while saving', () => {
  const view = mount('../src/pages/contacts/ContactForm.tsx', { companies: [company('A')], selected: company('A'), saving: true, onSubmit() {} })
  for (const node of [...view.nodes('input'), ...view.nodes('select'), ...view.nodes('button')]) assert.equal(node.props.disabled, true)
})

const contact = (id, type = 'OTHER', primary = false, status = 'ACTIVE') => ({ id, company_id: 'company', full_name: id, email: `${id}@test.invalid`, phone: id, job_title: id, contact_type: type, is_primary: primary, status })
test('contact edit switches all A draft fields to B including checkbox and both selects', () => {
  const path = new URL('../src/pages/contacts/ContactEditForm.tsx', import.meta.url)
  assert.ok(existsSync(path), 'isolated controlled contact edit form must exist')
  const props = { contact: contact('A'), saving: false, onSubmit() {}, onCancel() {} }
  const view = mount('../src/pages/contacts/ContactEditForm.tsx', props)
  view.nodes('input')[0].props.onChange({ target: { value: 'unsaved A' } })
  props.contact = contact('B', 'TECHNICAL', true, 'INACTIVE')
  view.render()
  for (const n of [...view.nodes('input'), ...view.nodes('select')]) {
    assert.equal(n.props.type === 'checkbox' ? n.props.checked : n.props.value, props.contact[n.props.name] ?? '')
  }
})

test('contact directory loads all companies, clears dependent edits immediately, and ignores old success/error responses', async () => {
  const pending = []
  const all = Array.from({ length: 105 }, (_, i) => company(String(i)))
  const view = mount('../src/pages/contacts/ContactsPage.tsx', { auth: {} }, (path) => {
    if (!path.includes('/contacts')) {
      const page = Number(new URL(path, 'https://test.invalid').searchParams.get('page') || 1)
      return Promise.resolve({ items: all.slice((page - 1) * 100, page * 100), total: 105, page, page_size: 100 })
    }
    const read = deferred(); pending.push({ path, ...read }); return read.promise
  })
  await flush(); view.render(); await flush(); view.render()
  const select = view.nodes('select')[0]
  assert.equal(select.props.children.flat().filter((n) => n?.type === 'option').length, 106)
  pending[0].resolve([contact('A')]); await flush(); view.render()
  view.nodes('DataTable')[0].props.actions(contact('A')).props.onClick(); view.render()
  assert.equal(view.nodes('ContactEditForm').length, 1)
  select.props.onChange({ target: { value: '1' } }); view.render()
  assert.equal(view.nodes('ContactEditForm').length, 0)
  assert.equal(view.nodes('DataTable').length, 0)
  view.nodes('select')[0].props.onChange({ target: { value: '2' } }); view.render()
  pending.at(-1).resolve([contact('C')]); await flush(); view.render()
  pending[1].reject(new Error('old request failed')); await flush(); view.render()
  assert.equal(view.nodes('DataTable')[0].props.rows[0].id, 'C')
  assert.equal(view.root().props.error, '')
})

test('contact create and update block double writes and target switches until saving finishes', async () => {
  for (const action of ['list', 'create']) {
    const write = deferred(); const writes = []
    const view = mount('../src/pages/contacts/ContactsPage.tsx', { auth: {} }, async (path, auth, options) => {
      if (options) { writes.push({ path, options }); return write.promise }
      if (path.includes('/contacts')) return [contact('A'), contact('B')]
      return { items: [company('A'), company('B')], total: 2, page: 1, page_size: 100 }
    }, action)
    await flush(); view.render(); await flush(); view.render()
    if (action === 'list') { view.nodes('DataTable')[0].props.actions(contact('A')).props.onClick(); view.render() }
    const form = view.nodes(action === 'list' ? 'ContactEditForm' : 'ContactForm')[0]
    const submitted = event({ ...(action === 'create' ? { company_id: 'A' } : {}), full_name: 'edited', contact_type: 'OTHER', is_primary: 'on' })
    const pending = form.props.onSubmit(submitted)
    form.props.onSubmit(submitted)
    if (action === 'list') {
      view.nodes('select')[0].props.onChange({ target: { value: 'B' } })
      view.nodes('DataTable')[0].props.actions(contact('B')).props.onClick()
      form.props.onCancel()
      view.render()
      assert.equal(view.nodes('select')[0].props.value, 'A')
      assert.equal(view.nodes('ContactEditForm')[0].props.contact.id, 'A')
    }
    assert.equal(writes.length, 1)
    assert.equal(JSON.parse(writes[0].options.body).is_primary, true)
    assert.equal('company_id' in JSON.parse(writes[0].options.body), false)
    write.resolve(contact('A')); await pending
  }
})

test('completed contact writes close/reset drafts and report refresh failure without suggesting another save', async () => {
  for (const action of ['list', 'create']) {
    let saved = false
    const view = mount('../src/pages/contacts/ContactsPage.tsx', { auth: {} }, async (path, auth, options) => {
      if (options) { saved = true; return contact('A') }
      if (!path.includes('/contacts')) return { items: [company('A')], total: 1, page: 1, page_size: 100 }
      if (saved) throw new Error('refresh offline')
      return [contact('A')]
    }, action)
    await flush(); view.render(); await flush(); view.render()
    if (action === 'list') { view.nodes('DataTable')[0].props.actions(contact('A')).props.onClick(); view.render() }
    const form = view.nodes(action === 'list' ? 'ContactEditForm' : 'ContactForm')[0]
    const submitted = event({ full_name: 'A', ...(action === 'create' ? { company_id: 'A' } : {}) })
    await form.props.onSubmit(submitted); view.render()
    assert.match(view.root().props.message, /Contact (created|updated)/)
    assert.match(view.root().props.error, /saved.*refresh/i)
    if (action === 'list') assert.equal(view.nodes('ContactEditForm').length, 0)
    else assert.equal(submitted.currentTarget.didReset, true)
  }
})


test('mounted contact screen resets A text, selects and checkbox before PATCHing B', async () => {
  const { createDomHarness, loadTs } = await import('./helpers/reactDomHarness.mjs')
  const dom = await createDomHarness()
  try {
    const writes = []
    const records = [contact('A'), contact('B', 'TECHNICAL', false, 'ACTIVE')]
    const api = async (path, auth, options) => {
      if (options) { writes.push({ path, payload: JSON.parse(options.body) }); return records[1] }
      if (path.includes('/contacts')) return records
      return { items: [company('directory')], total: 1, page: 1, page_size: 100 }
    }
    const { ContactsPage } = loadTs('pages/contacts/ContactsPage.tsx', {
      'react-router-dom': { useSearchParams: () => [new URLSearchParams('action=list')] },
      '../../api/client': { api }, './client': { api },
    })
    await dom.render(ContactsPage, { auth: {} })
    await dom.click([...dom.container.querySelectorAll('button')].find((b) => b.textContent === 'Edit'))
    await dom.input(dom.container.querySelector('[name=full_name]'), 'Unsaved A')
    await dom.input(dom.container.querySelector('[name=contact_type]'), 'FINANCE')
    await dom.input(dom.container.querySelector('[name=status]'), 'INACTIVE')
    await dom.click(dom.container.querySelector('[name=is_primary]'))
    assert.equal(dom.container.querySelector('[name=is_primary]').checked, true)
    await dom.click([...dom.container.querySelectorAll('button')].filter((b) => b.textContent === 'Edit')[1])
    for (const field of ['full_name', 'email', 'phone', 'job_title', 'contact_type', 'status']) {
      assert.equal(dom.container.querySelector(`[name=${field}]`).value, records[1][field])
    }
    assert.equal(dom.container.querySelector('[name=is_primary]').checked, false)
    await dom.click([...dom.container.querySelectorAll('button')].find((b) => b.textContent === 'Save changes'))
    assert.equal(writes.length, 1)
    assert.equal(writes[0].path, '/contacts/B')
    assert.equal(writes[0].payload.full_name, 'B')
    assert.equal(writes[0].payload.contact_type, 'TECHNICAL')
    assert.equal(writes[0].payload.status, 'ACTIVE')
    assert.equal(writes[0].payload.is_primary, false)
  } finally { await dom.close() }
})
