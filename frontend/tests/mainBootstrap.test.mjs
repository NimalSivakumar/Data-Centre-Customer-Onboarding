import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {runInNewContext} from 'node:vm'
import ts from 'typescript'
import * as jsx from 'react/jsx-runtime'
import {createDomHarness,React} from './helpers/reactDomHarness.mjs'

const source=readFileSync(new URL('../src/main.tsx',import.meta.url),'utf8').replaceAll('import.meta.env.BASE_URL',"'/'").replace('void bootstrap()','exports.done = bootstrap()')
const compile=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText
for(const mode of ['reject','stall'])test(`main renders reload recovery when initialization ${mode}s`,async()=>{
 const h=await createDomHarness();let resolve;const pending=new Promise(r=>resolve=r);const renders=[]
 const deadline={};runInNewContext(compile(readFileSync(new URL('../src/api/requestDeadline.ts',import.meta.url),'utf8')),{exports:deadline,AbortController,setTimeout,clearTimeout})
 const exports={};const imports={
  'react/jsx-runtime':jsx,'react-dom/client':{createRoot:()=>({render:element=>renders.push(element)})},
  '@azure/msal-react':{MsalProvider:({children})=>children},'react-router-dom':{BrowserRouter:({children})=>children},
  './auth/entra.ts':{msalInstance:{initialize:()=>mode==='reject'?Promise.reject(Error('PRIVATE initialization details')):pending}},
  './App.tsx':{default:()=>React.createElement('p',null,'APP')},
  './api/requestDeadline':{withDeadline:fn=>deadline.withDeadline(fn,{timeoutMs:15})}
 }
 try{
  runInNewContext(compile(source),{exports,document:h.window.document,window:h.window,require:name=>{if(name.endsWith('.css')||name.includes('bootstrap.bundle'))return {};if(name in imports)return imports[name];throw Error('unexpected '+name)}})
  await Promise.race([exports.done.catch(()=>{}),new Promise(r=>setTimeout(r,40))])
  assert.ok(renders.length,'must render recovery rather than leave blank')
  await h.render(()=>renders.at(-1))
  assert.match(h.container.textContent,/unable|could not/i)
  assert.match(h.container.textContent,/reload/i)
  assert.doesNotMatch(h.container.textContent,/PRIVATE/)
  const before=renders.length;resolve();await Promise.resolve();await Promise.resolve()
  assert.equal(renders.length,before,'late initialization must not replace recovery')
 }finally{await h.close()}
})
test('browser title names operational application',()=>{
 assert.match(readFileSync(new URL('../index.html',import.meta.url),'utf8'),/<title>Data Centre Customer Onboarding<\/title>/)
})
