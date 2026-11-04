import test from 'node:test'
import assert from 'node:assert/strict'
import { createDomHarness, loadTs, React, act } from './helpers/reactDomHarness.mjs'

const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b }); return {promise,resolve,reject} }
const auth = { user: { roles: ['ADMIN'] } }
async function setup(api) {
  const h = await createDomHarness()
  const { Dashboard } = loadTs('pages/dashboard/Dashboard.tsx', {
    '../../api/client': { api },
    'react-router-dom': { Link: ({children}) => React.createElement('span', null, children) },
  })
  await h.render(Dashboard, { auth })
  return {h, Dashboard}
}
test('dashboard failure stops spinner and offers a working retry', async () => {
  let calls=0
  const {h} = await setup(async () => { if (++calls===1) throw Error('offline'); return { Companies: 7 } })
  try {
    assert.doesNotMatch(h.container.textContent, /Loading dashboard summary/)
    assert.match(h.container.textContent, /Could not load dashboard/)
    await h.click([...h.container.querySelectorAll('button')].find(b => /retry/i.test(b.textContent)))
    assert.equal(calls,2)
    assert.match(h.container.textContent, /7/)
  } finally { await h.close() }
})
test('dashboard ignores old success after auth changes', async () => {
  const old=deferred(), next=deferred(); let calls=0
  const {h,Dashboard}=await setup(() => ++calls===1 ? old.promise : next.promise)
  try {
    await h.render(Dashboard, {auth: {user:{roles:['ADMIN']}}})
    await act(async () => { next.resolve({Current:22}) })
    await act(async () => { old.resolve({Stale:99}) })
    assert.match(h.container.textContent,/22/)
    assert.doesNotMatch(h.container.textContent,/99/)
  } finally { await h.close() }
})
