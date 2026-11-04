import assert from 'node:assert/strict'
import test from 'node:test'
import { mount, deferred, flush } from './workflowHarness.mjs'

const confirm = (ui) => ui.nodes('button').find((b) => !b.props.className && b.props.children !== 'Cancel')
test('dialog catches callback failures visibly and guards repeated clicks before rerender', async () => {
  const pending = deferred(); let calls = 0, closed = 0
  const ui = mount('../src/components/ActionNoteDialog.tsx', {
    dialog: { title: 'Confirm', message: 'Test', confirmLabel: 'Save', onConfirm: () => { calls++; return pending.promise } },
    onClose: () => closed++,
  })
  const first = confirm(ui).props.onClick()
  const second = confirm(ui).props.onClick()
  pending.reject(new Error('Mutation failed'))
  await Promise.allSettled([first, second]); await flush(); ui.render()
  assert.equal(calls, 1)
  assert.equal(closed, 0)
  assert.equal(ui.nodes('div').find((n) => n.props.role === 'alert')?.props.children, 'Mutation failed')
  assert.equal(confirm(ui).props.disabled, false)
})

test('dialog still requires notes and identity verification', async () => {
  let calls = 0
  const ui = mount('../src/components/ActionNoteDialog.tsx', {
    dialog: { title: 'Confirm', message: 'Test', noteLabel: 'Reason', requireIdentityCheck: true, confirmLabel: 'Save', onConfirm: async () => { calls++ } }, onClose() {},
  })
  await confirm(ui).props.onClick(); assert.equal(calls, 0)
  ui.nodes('textarea')[0].props.onChange({ target: { value: '  Reason  ' } }); ui.render()
  await confirm(ui).props.onClick(); assert.equal(calls, 0)
  ui.nodes('input')[0].props.onChange({ target: { checked: true } }); ui.render()
  await confirm(ui).props.onClick(); assert.equal(calls, 1)
})
