import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

const source = readFileSync(new URL('../src/auth/inactivity.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } })
const exports = {}
runInNewContext(outputText, { exports })

function fixture(remaining = 900_000) {
  let now = 0
  let nextId = 1
  const listeners = new Map()
  const intervals = new Map()
  const timeouts = new Map()
  const warnings = []
  let reports = 0
  let expiries = 0
  const target = {
    visibilityState: 'visible',
    addEventListener: (name, handler) => listeners.set(name, handler),
    removeEventListener: (name) => listeners.delete(name),
  }
  const monitor = exports.startInactivityMonitor({
    timeoutMs: 900_000, warningMs: 120_000, initialRemainingMs: remaining,
    onWarning: (value) => warnings.push(value), onActivity: () => reports++, onExpire: () => expiries++,
  }, {
    target, now: () => now,
    interval: (fn) => { const id = nextId++; intervals.set(id, fn); return id },
    clearInterval: (id) => intervals.delete(id),
    timeout: (fn, delay) => { const id = nextId++; timeouts.set(id, { fn, at: now + delay }); return id },
    clearTimeout: (id) => timeouts.delete(id),
  })
  return {
    monitor, target, warnings,
    get reports() { return reports }, get expiries() { return expiries },
    get listenerCount() { return listeners.size }, get timerCount() { return intervals.size + timeouts.size },
    advance(ms) {
      now += ms
      for (const [id, timer] of [...timeouts]) if (timer.at <= now) { timeouts.delete(id); timer.fn() }
      for (const fn of intervals.values()) fn()
    },
    event(name, isTrusted = true) { listeners.get(name)?.({ isTrusted }) },
  }
}

test('warning begins at 13 minutes and expiry is exactly 15 minutes', () => {
  const f = fixture()
  f.advance(779_000)
  assert.equal(f.warnings.at(-1), null)
  f.advance(1000)
  assert.equal(f.warnings.at(-1), 120)
  f.advance(119_000)
  assert.equal(f.expiries, 0)
  f.advance(1000)
  assert.equal(f.expiries, 1)
  f.advance(60_000)
  assert.equal(f.expiries, 1)
})

test('trusted pointer, keyboard, touch, and scroll activity reset the idle clock', () => {
  for (const name of ['pointermove', 'pointerdown', 'keydown', 'touchstart', 'scroll', 'wheel']) {
    const f = fixture()
    f.advance(780_000)
    f.event(name)
    assert.equal(f.warnings.at(-1), null)
    assert.equal(f.reports, 1)
    f.advance(780_000)
    assert.equal(f.expiries, 0)
    assert.equal(f.warnings.at(-1), 120)
  }
})

test('synthetic events and visibility changes do not reset inactivity', () => {
  const f = fixture()
  f.advance(780_000)
  f.event('pointermove', false)
  f.event('visibilitychange')
  f.advance(120_000)
  assert.equal(f.expiries, 1)
  assert.equal(f.reports, 0)
})

test('hidden-tab activity cannot keep the session alive', () => {
  const f = fixture()
  f.target.visibilityState = 'hidden'
  f.advance(780_000)
  f.event('keydown')
  f.advance(120_000)
  assert.equal(f.expiries, 1)
  assert.equal(f.reports, 0)
})

test('resuming after browser sleep expires immediately and cannot be revived', () => {
  const f = fixture()
  f.advance(3_600_000)
  f.event('pointerdown')
  f.monitor.stayActive()
  assert.equal(f.expiries, 1)
  assert.equal(f.reports, 0)
})

test('Stay signed in renews a live session, never an expired one', () => {
  const f = fixture()
  f.advance(780_000)
  f.monitor.stayActive()
  f.advance(120_000)
  assert.equal(f.expiries, 0)
  assert.equal(f.reports, 1)
})

test('resume uses server remaining time instead of granting a fresh 15 minutes', () => {
  const f = fixture(60_000)
  assert.equal(f.warnings.at(-1), 60)
  f.advance(60_000)
  assert.equal(f.expiries, 1)
})

test('rapid input is debounced and trailing activity is reported', () => {
  const f = fixture()
  f.event('keydown')
  f.event('pointermove')
  f.event('scroll')
  assert.equal(f.reports, 1)
  f.advance(500)
  assert.equal(f.reports, 2)
})

test('cleanup removes activity listeners and all timers', () => {
  const f = fixture()
  f.event('keydown')
  f.event('pointermove')
  f.monitor.stop()
  assert.equal(f.listenerCount, 0)
  assert.equal(f.timerCount, 0)
  f.advance(900_000)
  assert.equal(f.expiries, 0)
})

test('a delayed activity report after sleep cannot renew the idle timer', () => {
  const f = fixture()
  f.event('keydown')
  f.event('pointermove')
  f.advance(900_000)
  assert.equal(f.reports, 1)
  assert.equal(f.expiries, 1)
})
