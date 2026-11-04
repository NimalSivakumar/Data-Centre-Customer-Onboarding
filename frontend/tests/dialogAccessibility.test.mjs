import assert from 'node:assert/strict'
import test from 'node:test'
import { deferred } from './workflowHarness.mjs'
import { createDomHarness, loadTs, React, act } from './helpers/reactDomHarness.mjs'

for (const noteLabel of [undefined, 'Reason']) {
  test(`action dialog manages focus and Escape (${noteLabel ? 'with note' : 'without note'})`, async () => {
    const ui = await createDomHarness()
    try {
      const trigger = opener()
      const { ActionNoteDialog } = loadTs('components/ActionNoteDialog.tsx')
      function Example() {
        const [dialog, setDialog] = React.useState({ title: 'Approve', message: 'Confirm', noteLabel, confirmLabel: 'Save', onConfirm: async () => {} })
        return React.createElement(ActionNoteDialog, { dialog, onClose: () => setDialog(null) })
      }
      await ui.render(Example)
      const modal = ui.container.querySelector('[role="dialog"]')
      const close = modal.querySelector('[aria-label="Close"]')
      assert.ok(document.activeElement === (modal.querySelector('textarea') ?? close), 'dialog receives appropriate initial focus')
      close.focus()
      await key(ui, 'Tab', true)
      const enabled = [...modal.querySelectorAll('button,textarea')].filter((node) => !node.disabled)
      assert.ok(document.activeElement === enabled.at(-1), 'reverse Tab skips disabled controls')
      await key(ui, 'Tab')
      assert.ok(document.activeElement === close, 'forward Tab wraps')
      trigger.focus()
      assert.ok(modal.contains(document.activeElement), 'focus cannot escape to background')
      await key(ui, 'Escape')
      assert.equal(ui.container.querySelector('[role="dialog"]'), null)
      assert.ok(document.activeElement === trigger, 'opener focus restored')
    } finally { await ui.close() }
  })
}

test('busy action dialog ignores Escape, contains focus with all controls disabled, and retains callback errors', async () => {
  const ui = await createDomHarness()
  const pending = deferred()
  try {
    const trigger = opener()
    const { ActionNoteDialog } = loadTs('components/ActionNoteDialog.tsx')
    let calls = 0
    function Example() {
      const [dialog, setDialog] = React.useState({ title: 'Approve', message: 'Confirm', confirmLabel: 'Save', onConfirm: () => { calls++; return pending.promise } })
      return React.createElement(ActionNoteDialog, { dialog, onClose: () => setDialog(null) })
    }
    await ui.render(Example)
    const save = [...ui.container.querySelectorAll('button')].find((node) => node.textContent === 'Save')
    await act(async () => {
      save.click()
      // Escape arrives in the same turn, before the disabled state rerenders.
      document.activeElement.dispatchEvent(new ui.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    })
    await key(ui, 'Escape')
    const modal = ui.container.querySelector('[role="dialog"]')
    assert.ok(modal, 'busy dialog is not dismissed')
    await key(ui, 'Tab')
    assert.ok(document.activeElement === modal, 'no enabled controls falls back to modal itself')
    await key(ui, 'Tab', true)
    assert.ok(document.activeElement === modal)
    assert.equal(calls, 1)
    await act(async () => pending.reject(new Error('Save unavailable')))
    assert.equal(ui.container.querySelector('[role="alert"]').textContent, 'Save unavailable')
    await key(ui, 'Escape')
    assert.equal(ui.container.querySelector('[role="dialog"]'), null)
    assert.ok(document.activeElement === trigger)
  } finally { await ui.close() }
})

async function key(ui, name, shiftKey = false) {
  const event = new ui.window.KeyboardEvent('keydown', { key: name, shiftKey, bubbles: true, cancelable: true })
  await act(async () => document.activeElement.dispatchEvent(event))
  return event
}

async function showDetails(ui) {
  const { DetailsDialog } = loadTs('components/DetailsDialog.tsx')
  function Example() {
    const [open, setOpen] = React.useState(true)
    return React.createElement(DetailsDialog, {
      details: open ? { title: 'Record', items: [{ label: 'Help', value: React.createElement('a', { href: '#help' }, 'Help') }] } : null,
      onClose: () => setOpen(false),
    })
  }
  await ui.render(Example)
}

test('details dialog contains forward and reverse Tab focus and restores the opener on Escape', async () => {
  const ui = await createDomHarness()
  try {
    const trigger = opener()
    await showDetails(ui)
    const first = ui.container.querySelector('button')
    const last = ui.container.querySelector('a')
    last.focus()
    assert.equal((await key(ui, 'Tab')).defaultPrevented, true)
    assert.ok(document.activeElement === first, 'Tab wraps to first control')
    assert.equal((await key(ui, 'Tab', true)).defaultPrevented, true)
    assert.ok(document.activeElement === last, 'Shift+Tab wraps to last control')
    await key(ui, 'Escape')
    assert.equal(ui.container.querySelector('[role="dialog"]'), null)
    assert.ok(document.activeElement === trigger, 'Escape restores original focus')
  } finally { await ui.close() }
})

test('details dialog isolates background focus and clicks and restores prior accessibility attributes', async () => {
  const ui = await createDomHarness()
  try {
    const trigger = opener()
    trigger.setAttribute('aria-hidden', 'false')
    let clicks = 0
    trigger.addEventListener('click', () => clicks++)
    await showDetails(ui)
    assert.equal(trigger.hasAttribute('inert'), true)
    assert.equal(trigger.getAttribute('aria-hidden'), 'true')
    trigger.focus()
    assert.ok(ui.container.querySelector('[role="dialog"]').contains(document.activeElement), 'programmatic background focus is contained')
    const pointer = new ui.window.Event('pointerdown', { bubbles: true, cancelable: true })
    trigger.dispatchEvent(pointer)
    assert.equal(pointer.defaultPrevented, true, 'background pointer interaction is blocked')
    await ui.click(trigger)
    assert.equal(clicks, 0, 'background activation is blocked even without jsdom inert support')
    await key(ui, 'Escape')
    assert.equal(trigger.hasAttribute('inert'), false)
    assert.equal(trigger.getAttribute('aria-hidden'), 'false')
    await ui.click(trigger)
    assert.equal(clicks, 1, 'background interaction works again after cleanup')
  } finally { await ui.close() }
})

test('a higher-priority modal suspends the underlying trap and restores it on dismissal', async () => {
  const ui = await createDomHarness()
  try {
    const trigger = opener()
    const hook = loadTs('components/useModalFocus.ts')
    const { DetailsDialog } = loadTs('components/DetailsDialog.tsx', { './useModalFocus': hook })
    const { ActionNoteDialog } = loadTs('components/ActionNoteDialog.tsx', { './useModalFocus': hook })
    function Example() {
      const [detailsOpen, setDetailsOpen] = React.useState(true)
      const [action, setAction] = React.useState(null)
      return React.createElement(React.Fragment, null,
        React.createElement(DetailsDialog, {
          details: detailsOpen ? { title: 'Record', items: [{ label: 'Action', value: React.createElement('button', { onClick: () => setAction({ title: 'Priority', message: 'Confirm', confirmLabel: 'Save', onConfirm: async () => {} }) }, 'Open action') }] } : null,
          onClose: () => setDetailsOpen(false),
        }),
        React.createElement(ActionNoteDialog, { dialog: action, onClose: () => setAction(null) }))
    }
    await ui.render(Example)
    const actionTrigger = [...ui.container.querySelectorAll('button')].find((node) => node.textContent === 'Open action')
    actionTrigger.focus()
    await ui.click(actionTrigger)
    const top = ui.container.querySelector('.action-dialog')
    assert.ok(top.contains(document.activeElement), 'only top modal owns focus')
    assert.equal(top.closest('[inert]'), null, 'top modal must not inherit underlying isolation')
    await key(ui, 'Escape')
    assert.equal(ui.container.querySelector('.action-dialog'), null)
    assert.ok(ui.container.querySelector('.details-dialog'), 'Escape dismisses only top modal')
    assert.ok(document.activeElement === actionTrigger, 'focus returns to underlying modal')
    trigger.focus()
    assert.ok(ui.container.querySelector('.details-dialog').contains(document.activeElement))
    await key(ui, 'Escape')
    assert.ok(document.activeElement === trigger)
  } finally { await ui.close() }
})

function opener() {
  const button = document.createElement('button')
  button.textContent = 'Open record'
  document.body.prepend(button)
  button.focus()
  return button
}

test('details dialog focuses its close button on opening', async () => {
  const ui = await createDomHarness()
  try {
    opener()
    const { DetailsDialog } = loadTs('components/DetailsDialog.tsx')
    await ui.render(DetailsDialog, { details: { title: 'Record', items: [] }, onClose() {} })
    assert.ok(document.activeElement === ui.container.querySelector('[aria-label="Close"]'), 'close button should receive initial focus')
  } finally { await ui.close() }
})
