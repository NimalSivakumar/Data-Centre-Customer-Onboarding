import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

const require = createRequire(import.meta.url)
export const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
export const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve() }

// Execute the real component and its event/effect callbacks without a DOM dependency.
export function mount(path, props = {}, mocks = {}) {
  const slots = [], effects = [], cleanups = [], timers = new Map(), listeners = new Map()
  let cursor = 0, pending = [], tree, nextTimer = 0
  const react = {
    useState(initial) {
      const id = cursor++
      if (!(id in slots)) slots[id] = typeof initial === 'function' ? initial() : initial
      return [slots[id], (value) => { slots[id] = typeof value === 'function' ? value(slots[id]) : value }]
    },
    useRef(initial) { const id = cursor++; return slots[id] ??= { current: initial } },
    useEffect(fn, deps) {
      const id = cursor++
      if (!effects[id] || !deps || deps.some((v, i) => v !== effects[id][i])) {
        effects[id] = deps
        pending.push(() => { cleanups[id]?.(); cleanups[id] = fn() })
      }
    },
    useCallback(fn, deps) {
      const id = cursor++
      if (!slots[id] || deps.some((v, i) => v !== slots[id].deps[i])) slots[id] = { fn, deps }
      return slots[id].fn
    },
  }
  const target = {
    visibilityState: 'visible',
    addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: (name) => listeners.delete(name),
  }
  const cache = new Map()
  function load(url) {
    if (cache.has(url.href)) return cache.get(url.href)
    const output = ts.transpileModule(readFileSync(url, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText
    const exports = {}
    cache.set(url.href, exports)
    runInNewContext(output, {
      exports, URLSearchParams, Date, Intl, console,
      document: target, window: target,
      setInterval: (fn) => { timers.set(++nextTimer, fn); return nextTimer },
      clearInterval: (id) => timers.delete(id),
      setTimeout: (fn) => { timers.set(++nextTimer, fn); return nextTimer },
      clearTimeout: (id) => timers.delete(id),
      require(name) {
        if (name in mocks) return mocks[name]
        if (name === 'react') return react
        if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: 'Fragment' }
        if (/components\//.test(name) || name.endsWith('RequestsTable') || name.endsWith('SecurityVisitorsTable')) {
          return new Proxy({}, { get: (_, key) => key })
        }
        if (name.startsWith('.')) {
          const next = new URL(name, url)
          for (const ext of ['.ts', '.tsx']) {
            try { return load(new URL(next.href + ext)) } catch (err) { if (err.code !== 'ENOENT') throw err }
          }
        }
        return require(name)
      },
    })
    return exports
  }
  const module = load(new URL(path, import.meta.url))
  const Component = Object.values(module).find((v) => typeof v === 'function')
  function render() {
    cursor = 0
    tree = Component(props)
    const work = pending; pending = []; work.forEach((fn) => fn())
    return tree
  }
  function nodes(type) {
    const found = []
    function visit(node) {
      if (!node || typeof node !== 'object') return
      if (node.type === type) found.push(node)
      const children = node.props?.children
      ;(Array.isArray(children) ? children.flat(Infinity) : [children]).forEach(visit)
    }
    visit(tree)
    return found
  }
  render()
  return { render, nodes, timers, listeners, document: target, unmount: () => cleanups.forEach((fn) => fn?.()) }
}
