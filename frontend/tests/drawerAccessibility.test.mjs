import assert from 'node:assert/strict'
import test from 'node:test'
import { createDomHarness, loadTs, React, act } from './helpers/reactDomHarness.mjs'

function media(ui, initial) {
  let matches = initial
  const listeners = new Set()
  ui.window.matchMedia = () => ({ get matches() { return matches }, addEventListener: (_, fn) => listeners.add(fn), removeEventListener: (_, fn) => listeners.delete(fn) })
  return async (value) => act(async () => { matches = value; listeners.forEach((fn) => fn({ matches })) })
}

function shell() {
  const stubs = {}
  for (const [path, name] of [['audit', 'AuditPage'], ['companies', 'CompaniesPage'], ['contacts', 'ContactsPage'], ['dashboard', 'Dashboard'], ['requests', 'RequestsPage'], ['security', 'SecurityPage'], ['visitor-request', 'VisitorRequestPage']]) {
    stubs[`../pages/${path}/${name}`] = { [name]: () => React.createElement('button', null, 'Page control') }
  }
  const { Shell } = loadTs('layout/Shell.tsx', stubs)
  return Shell
}

async function key(ui, value, shiftKey = false) {
  await act(async () => document.activeElement.dispatchEvent(new ui.window.KeyboardEvent('keydown', { key: value, shiftKey, bubbles: true, cancelable: true })))
}

async function renderShell(ui) {
  const { MemoryRouter } = await import('react-router-dom')
  const Shell = shell()
  await ui.render(() => React.createElement(MemoryRouter, { initialEntries: ['/dashboard'] }, React.createElement(Shell, {
    auth: { user: { full_name: 'Test Operator', roles: ['OPS'] } }, onLogout() {},
  })))
}

test('open narrow drawer traps focus, isolates workspace, restores focus, and keeps backdrop dismissal', async () => {
  const ui = await createDomHarness()
  try {
    media(ui, true)
    await renderShell(ui)
    const menu = ui.container.querySelector('[aria-label="Open navigation"]')
    const sidebar = ui.container.querySelector('aside')
    const workspace = ui.container.querySelector('.workspace')
    menu.focus()
    await ui.click(menu)
    const close = sidebar.querySelector('[aria-label="Close navigation"]')
    assert.ok(document.activeElement === close)
    assert.equal(sidebar.getAttribute('role'), 'dialog')
    assert.equal(sidebar.getAttribute('aria-modal'), 'true')
    const last = sidebar.querySelector('.logout-button')
    last.focus()
    await key(ui, 'Tab')
    assert.ok(document.activeElement === close, 'forward Tab remains in drawer')
    await key(ui, 'Tab', true)
    assert.ok(document.activeElement === last, 'reverse Tab skips hidden submenu links')
    assert.equal(workspace.hasAttribute('inert'), true)
    assert.equal(workspace.getAttribute('aria-hidden'), 'true')
    menu.focus()
    assert.ok(sidebar.contains(document.activeElement), 'workspace focus cannot steal drawer focus')
    assert.equal(document.body.style.overflow, 'hidden')
    await key(ui, 'Escape')
    assert.equal(sidebar.hidden, true)
    assert.equal(workspace.hasAttribute('inert'), false)
    assert.ok(document.activeElement === menu)
    assert.equal(document.body.style.overflow, '')
    await ui.click(menu)
    await ui.click(ui.container.querySelector('.nav-backdrop'))
    assert.equal(sidebar.hidden, true, 'backdrop still dismisses')
  } finally { await ui.close() }
})

test('resizing an open drawer to desktop removes modality and unlocks workspace', async () => {
  const ui = await createDomHarness()
  try {
    const resize = media(ui, true)
    await renderShell(ui)
    const menu = ui.container.querySelector('[aria-label="Open navigation"]')
    menu.focus()
    await ui.click(menu)
    await resize(false)
    const sidebar = ui.container.querySelector('aside')
    assert.equal(sidebar.hidden, false)
    assert.equal(sidebar.getAttribute('aria-modal'), null)
    assert.equal(ui.container.querySelector('.workspace').hasAttribute('inert'), false)
    assert.equal(document.body.style.overflow, '')
    await resize(true)
    assert.equal(sidebar.hidden, true, 'returning to narrow viewport starts closed')
  } finally { await ui.close() }
})

test('closed narrow drawer is hidden and inert while desktop navigation stays available', async () => {
  const ui = await createDomHarness()
  try {
    const resize = media(ui, true)
    await renderShell(ui)
    const sidebar = ui.container.querySelector('aside')
    assert.equal(sidebar.hidden, true)
    assert.equal(sidebar.hasAttribute('inert'), true)
    assert.equal(sidebar.getAttribute('aria-hidden'), 'true')
    assert.ok([...sidebar.querySelectorAll('a,button')].every((node) => node.closest('[hidden], [inert]')), 'closed drawer has no reachable controls')
    await resize(false)
    assert.equal(sidebar.hidden, false)
    assert.equal(sidebar.hasAttribute('inert'), false)
    assert.equal(sidebar.getAttribute('aria-hidden'), null)
    assert.equal(sidebar.getAttribute('aria-modal'), null)
    assert.ok(sidebar.querySelector('a[href="/dashboard"]'))
    assert.equal(sidebar.querySelector('a[href="/security"]'), null, 'role navigation unchanged')
  } finally { await ui.close() }
})
