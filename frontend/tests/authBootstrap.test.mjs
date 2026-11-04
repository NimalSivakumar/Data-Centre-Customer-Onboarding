import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { createDomHarness, loadTs, React, act } from './helpers/reactDomHarness.mjs'
import * as jsx from 'react/jsx-runtime'
import * as hooks from 'react'

function compile(path, globals, imports) {
 const exports={}
 runInNewContext(ts.transpileModule(readFileSync(new URL('../src/'+path,import.meta.url),'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText,{exports,AbortController,AbortSignal,setTimeout,clearTimeout,console,...globals,require(name){if(name in imports)return imports[name];throw Error('Unexpected import '+name)}})
 return exports
}
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}}
async function fixture({redirect=async()=>({account:{}}),token=async()=>({accessToken:'test'}),fetch:fetchMock=async()=>({ok:true,json:async()=>({roles:['ADMIN']})}),settings=async()=>{},stored='existing',locked=false,sessionFetch=null}={}) {
 const h=await createDomHarness();let session=stored,lockedNow=locked,starts=0,provider,monitorOptions,stays=0
 const deadline=compile('api/requestDeadline.ts',{},{}).withDeadline
 const imports={
 'react':hooks,'react/jsx-runtime':jsx,'@azure/msal-react':{useMsal:()=>({instance})},'@azure/msal-browser':{InteractionRequiredAuthError:class extends Error{}},
 'react-router-dom':{Routes:({children})=>children,Route:({element})=>element,Navigate:()=>null},
 './components/useModalFocus':loadTs('components/useModalFocus.ts'),
 './api/client':{setApiTokenProvider:fn=>provider=fn,setSessionExpiredHandler:()=>{}},
 './api/requestDeadline':{withDeadline:(fn,opts)=>deadline(fn,{...opts,timeoutMs:20})},
 './auth/applicationSession':{getApplicationSessionId:()=>session,isApplicationLocked:()=>lockedNow,lockApplicationSession:()=>{lockedNow=true;session=null},setApplicationSessionId:id=>session=id,unlockApplicationSession:()=>lockedNow=false,sessionBootstrapAction:(fresh,locked,id)=>fresh?'start':locked||!id?'sign-in':'resume'},
 './auth/inactivity':{startInactivityMonitor:(options)=>{monitorOptions=options;return {stop(){},stayActive(){stays++;options.onWarning(null)}}}},'./api/siteSettings':{loadSiteSettings:settings},'./auth/permissions':{defaultPathForUser:()=>'/dashboard'},'./constants/app':{API_BASE_URL:'/api',ENTRA_API_SCOPE:'scope'},'./layout/Shell':{Shell:()=>React.createElement('div',null,'PROTECTED')},'./pages/auth/LoginPage':{LoginPage:()=>React.createElement('button',null,'Sign in with Microsoft')},'./App.css':{}
 }
 const instance={handleRedirectPromise:redirect,getActiveAccount:()=>({}),getAllAccounts:()=>[],setActiveAccount(){},acquireTokenSilent:token,logoutRedirect:async()=>{}}
 const App=compile('App.tsx',{window:h.window,document:h.window.document,fetch:async(url,options)=>{if(url.includes('/sessions')){starts++;if(sessionFetch)return sessionFetch(url,options);return {ok:true,json:async()=>({session_id:'new',idle_remaining_seconds:900,idle_timeout_seconds:900,idle_warning_seconds:120})}}return fetchMock(url,options)}},imports).default
 await h.render(App)
 return {h,provider,async warn(){await act(async()=>monitorOptions.onWarning(90))},get stays(){return stays},get locked(){return lockedNow},get starts(){return starts}}
}
for (const stage of ['redirect','token','identity body','settings']) test(`startup bounds stalled ${stage} and ignores late completion`,async()=>{
 const late=deferred();const args=stage==='redirect'?{redirect:()=>late.promise}:stage==='token'?{token:()=>late.promise}:stage==='identity body'?{fetch:async()=>({ok:true,json:()=>late.promise})}:{settings:()=>late.promise}
 const f=await fixture(args)
 try {
  await act(async()=>{await new Promise(r=>setTimeout(r,50))})
  assert.doesNotMatch(f.h.container.textContent,/Checking session/)
  assert.match(f.h.container.textContent,/could not|unable|timed out/i)
  assert.equal(f.locked,true)
  await act(async()=>late.resolve(stage==='redirect'?{account:{}}:stage==='token'?{accessToken:'late'}:{roles:['ADMIN']}))
  assert.equal(f.starts,0)
  assert.doesNotMatch(f.h.container.textContent,/PROTECTED/)
 } finally {await f.h.close()}
})
test('protected token lookup has its own bounded lifetime',async()=>{
 let calls=0;const late=deferred()
 const f=await fixture({token:()=>++calls===1?Promise.resolve({accessToken:'first'}):late.promise})
 try {
  const result=await Promise.race([f.provider().then(()=> 'success',()=> 'rejected'),new Promise(r=>setTimeout(()=>r('still pending'),50))])
  assert.equal(result,'rejected')
 }finally{await f.h.close()}
})
test('session body timeout fails closed without a replacement session',async()=>{
 const late=deferred();const f=await fixture({sessionFetch:async()=>({ok:true,json:()=>late.promise})})
 try {
  await act(async()=>{await new Promise(r=>setTimeout(r,50))})
  assert.match(f.h.container.textContent,/application session/)
  assert.equal(f.locked,true)
  await act(async()=>late.resolve({session_id:'late',idle_remaining_seconds:900,idle_timeout_seconds:900,idle_warning_seconds:120}))
  assert.doesNotMatch(f.h.container.textContent,/PROTECTED/)
  assert.equal(f.starts,1)
 }finally{await f.h.close()}
})
test('denied identity shows safe HTTP diagnostic without rendering protected content',async()=>{
 const f=await fixture({fetch:async()=>({ok:false,status:403,json:async()=>({detail:'PRIVATE'})})})
 try {
  assert.match(f.h.container.textContent,/HTTP 403/)
  assert.doesNotMatch(f.h.container.textContent,/PRIVATE|PROTECTED/)
 }finally{await f.h.close()}
})
test('a cached account without app session cannot start a new session',async()=>{
 const f=await fixture({redirect:async()=>null,stored:null})
 try {
  assert.equal(f.starts,0)
  assert.match(f.h.container.textContent,/Sign in with Microsoft/)
  assert.doesNotMatch(f.h.container.textContent,/PROTECTED/)
 }finally{await f.h.close()}
})
test('rejected resumed session is never replaced',async()=>{
 const urls=[]
 const f=await fixture({redirect:async()=>null,sessionFetch:async(url)=>{urls.push(url);return {ok:false,status:401}}})
 try {
  assert.deepEqual(urls,['/api/auth/sessions/existing/heartbeat'])
  assert.equal(f.locked,true)
  assert.doesNotMatch(f.h.container.textContent,/PROTECTED/)
 }finally{await f.h.close()}
})
test('startup failure presents safe diagnostic and explicit sign-in',async()=>{
 const f=await fixture({fetch:async()=>{throw Error('SECRET tenant token detail')}})
 try {
  assert.match(f.h.container.textContent,/identity|account/i)
  assert.match(f.h.container.textContent,/Sign in with Microsoft/)
  assert.doesNotMatch(f.h.container.textContent,/SECRET|PROTECTED/)
 }finally{await f.h.close()}
})

test('idle warning owns modal focus, cannot Escape-renew, and explicit Sign out locks immediately',async()=>{
 const f=await fixture()
 try {
  await f.warn()
  const warning=f.h.container.querySelector('[role="alertdialog"]')
  const stay=warning.querySelector('button'),signOut=warning.querySelectorAll('button')[1]
  assert.equal(warning.hasAttribute('data-idle-controls'),true)
  assert.ok(document.activeElement===stay,'warning must receive focus rather than an underlying dialog')
  signOut.focus()
  await act(async()=>signOut.dispatchEvent(new f.h.window.KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true})))
  assert.ok(document.activeElement===stay,'Tab stays within the warning')
  await act(async()=>stay.dispatchEvent(new f.h.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true})))
  assert.equal(Boolean(f.h.container.querySelector('[role="alertdialog"]')),true)
  assert.equal(f.stays,0)
  await f.h.click(signOut)
  assert.equal(f.locked,true)
  assert.equal(f.stays,0)
  assert.doesNotMatch(f.h.container.textContent,/PROTECTED/)
 }finally{await f.h.close()}
})
