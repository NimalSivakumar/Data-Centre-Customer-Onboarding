import { readFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import React, { act } from 'react'
import { JSDOM } from 'jsdom'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const sourceRoot = fileURLToPath(new URL('../../src/', import.meta.url))

/** Compile real TS/TSX modules; stub only boundaries explicitly supplied by a test. */
export function loadTs(relativePath, stubs = {}) {
  const modules = new Map()
  function load(absolute) {
    if (modules.has(absolute)) return modules.get(absolute)
    const source = readFileSync(absolute, 'utf8').replaceAll('import.meta.env.BASE_URL', "'/test-app/'")
    const exports = {}
    modules.set(absolute, exports)
    const { outputText } = ts.transpileModule(source, { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
    } })
    runInNewContext(outputText, {
      exports, console, URL, URLSearchParams, FormData: window.FormData, Headers, AbortController, AbortSignal,
      window, document, navigator, HTMLElement: window.HTMLElement, Node: window.Node,
      setTimeout, clearTimeout, setInterval, clearInterval,
      require(specifier) {
        if (Object.hasOwn(stubs, specifier)) return stubs[specifier]
        if (specifier.endsWith('.css')) return {}
        if (!specifier.startsWith('.')) return require(specifier)
        const base = resolve(dirname(absolute), specifier)
        if (Object.hasOwn(stubs, base)) return stubs[base]
        const file = [base, `${base}.ts`, `${base}.tsx`, resolve(base, 'index.ts'), resolve(base, 'index.tsx')]
          .find((p) => existsSync(p) && ['.ts', '.tsx'].includes(extname(p)))
        if (!file) throw new Error(`Cannot resolve ${specifier} from ${absolute}`)
        return load(file)
      },
    }, { filename: absolute })
    return exports
  }
  return load(resolve(sourceRoot, relativePath))
}

/** A simulated DOM only: no application server, Entra or business DB is started. */
export async function createDomHarness() {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/test-app/' })
  const saved = new Map()
  const values = { window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement, HTMLInputElement: dom.window.HTMLInputElement,
    Event: dom.window.Event, MouseEvent: dom.window.MouseEvent, KeyboardEvent: dom.window.KeyboardEvent,
    MutationObserver: dom.window.MutationObserver, IS_REACT_ACT_ENVIRONMENT: true }
  for (const [key, value] of Object.entries(values)) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value })
  }
  dom.window.HTMLElement.prototype.scrollIntoView = () => {}
  const { createRoot } = await import('react-dom/client')
  const container = dom.window.document.getElementById('root')
  const root = createRoot(container)
  return {
    window: dom.window, container,
    async render(Component, props = {}) { await act(async () => { root.render(React.createElement(Component, props)) }) },
    async click(element) { if (!element) throw new Error('Missing click target'); await act(async () => element.click()) },
    async input(element, value) {
      if (!element) throw new Error('Missing input target')
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value').set
        setter.call(element, value)
        element.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
        element.dispatchEvent(new dom.window.Event('change', { bubbles: true }))
      })
    },
    async flush() { await act(async () => { await new Promise((done) => setImmediate(done)) }) },
    async close() {
      await act(async () => root.unmount())
      dom.window.close()
      for (const [key, descriptor] of saved) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor)
        else delete globalThis[key]
      }
    },
  }
}
export { React, act }
