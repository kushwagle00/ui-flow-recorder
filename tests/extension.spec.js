import { test, expect, chromium } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import http from 'node:http';
let context, worker, viewer, site, server, profile, extensionId;
const fixture = `<!doctype html><title>Recorder demo</title><style>body{font:18px system-ui;padding:40px;background:#f0f4fa}button,input{padding:12px;margin:12px}</style><h1>Demo checkout</h1><label>Name<input id="name" data-testid="name"></label><button id="buy" data-testid="buy">Add to cart</button><button id="route" onclick="history.pushState({},'', '/checkout')">Checkout</button><a href="/done">Finish</a>`;
async function message(msg) { return viewer.evaluate(msg => chrome.runtime.sendMessage(msg), msg); }
async function state() { return viewer.evaluate(() => chrome.storage.local.get(null)); }
async function tabId() { return viewer.evaluate(async url => (await chrome.tabs.query({})).find(t => t.url?.startsWith(url)).id, site); }
async function stop() { expect((await message({kind:'STOP_RECORDING'})).kind).toBe('STATUS'); }
async function loadViewer() { await viewer.reload(); await expect(viewer.locator('#importBtn')).toBeEnabled(); }
function run(id, count=3) { return { runId:id, startedAt:1000, stoppedAt:2000, steps:Array.from({length:count},(_,i)=>({stepId:i+1,timestamp:1000+i,type:'click',url:site,selectors:{primary:'#buy',alternatives:['[data-testid="buy"]']}})) }; }
test.beforeAll(async () => {
  server = http.createServer((req,res) => { res.setHeader('Content-Type','text/html'); res.end(fixture); });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  site = `http://127.0.0.1:${server.address().port}`;
  profile = await fs.mkdtemp(path.join(os.tmpdir(),'flow-recorder-test-'));
  const extension = path.resolve('dist');
  context = await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
  worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  extensionId = new URL(worker.url()).host;
  viewer = await context.newPage();
  await viewer.goto(`chrome-extension://${extensionId}/viewer.html`);
});
test.afterAll(async () => { await context?.close(); server?.close(); if(profile) await fs.rm(profile,{recursive:true,force:true}); });
test.beforeEach(async () => { await viewer.evaluate(() => chrome.storage.local.clear()); await loadViewer(); });

test('records only selected tab, keeps rapid events, survives worker termination, and finalizes', async () => {
  const page = await context.newPage(); await page.goto(site);
  const id = await tabId();
  expect(await message({kind:'START_RECORDING',tabId:id})).toMatchObject({kind:'STATUS'});
  // Popup reinjection must not register another set of listeners.
  await viewer.evaluate(id => chrome.scripting.executeScript({target:{tabId:id},files:['content.js']}),id);
  await page.locator('#buy').click();
  await expect.poll(async()=> (await state()).currentRun.steps.filter(s=>s.type==='click').length).toBe(1);
  expect((await state()).currentRun.steps.find(s=>s.type==='click').visualContext.screenshotDataUrl).toMatch(/^data:image/);
  await page.locator('#name').fill('Demo user'); await page.locator('#name').blur();
  await expect.poll(async()=> (await state()).currentRun.steps.some(s=>s.value==='Demo user')).toBe(true);
  const before = (await state()).currentRun.steps.length;
  await page.evaluate(()=>{for(let i=0;i<12;i++)document.querySelector('#buy').click();});
  await expect.poll(async()=> (await state()).currentRun.steps.length).toBe(before+12);
  const other = await context.newPage(); await other.goto(site+'/other'); await other.locator('#buy').click();
  await page.waitForTimeout(300);
  expect((await state()).currentRun.steps.length).toBe(before+12);
  // Stop and wake the real MV3 service worker using CDP.
  const cdp = await context.newCDPSession(viewer);
  await cdp.send('ServiceWorker.enable');
  await cdp.send('ServiceWorker.stopAllWorkers');
  await expect.poll(async()=> (await message({kind:'GET_STATUS'})).isRecording).toBe(true);
  await page.bringToFront(); await page.locator('#route').click();
  await expect.poll(async()=> (await state()).currentRun.steps.some(s=>s.type==='navigation' && s.url.endsWith('/checkout'))).toBe(true);
  await stop();
  const saved = await state(); expect(saved.currentRun).toBeUndefined(); expect(saved.runs).toHaveLength(1); expect(saved.isRecording).toBe(false);
  await loadViewer(); await viewer.locator('.step-item').nth(1).click();
  await expect(viewer.locator('#screenshot')).toBeVisible();
  await viewer.screenshot({path:'test-results/recorded-flow.png',fullPage:true});
  await page.close(); await other.close();
});

test('import, selector save, export and delete persist without losing the first history entry', async () => {
  await viewer.evaluate(r => chrome.storage.local.set({runs:[r]}),run('first'));
  await loadViewer();
  await viewer.locator('#importFileInput').setInputFiles({name:'recording.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(run('second')))});
  await expect(viewer.locator('.run-item')).toHaveCount(2);
  await viewer.locator('.run-item').first().click();
  await viewer.locator('input[type=radio]').nth(1).check(); await viewer.locator('#saveBtn').click();
  await expect.poll(async()=> (await state()).runs[0].steps[0].selectors.primary).toBe('[data-testid="buy"]');
  expect((await state()).currentRun).toBeUndefined();
  await loadViewer(); await expect(viewer.locator('.run-item')).toHaveCount(2);
  const downloadEvent=viewer.waitForEvent('download'); await viewer.locator('#exportBtn').click(); const download=await downloadEvent;
  const exported=JSON.parse(await fs.readFile(await download.path(),'utf8')); expect(exported.runId).toBe('first');
  viewer.once('dialog',d=>d.accept()); await viewer.locator('#deleteBtn').click(); await expect(viewer.locator('.run-item')).toHaveCount(1);
  await loadViewer(); await expect(viewer.locator('.run-item')).toHaveCount(1);
});

test('empty-library import persists; malformed imports are rejected', async () => {
  await viewer.locator('#importFileInput').setInputFiles({name:'good.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(run('only')))});
  await expect(viewer.locator('.run-item')).toHaveCount(1); await loadViewer(); await expect(viewer.locator('.run-item')).toHaveCount(1);
  viewer.once('dialog',d=>d.accept());
  await viewer.locator('#importFileInput').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{"steps":[null]}')});
  expect((await state()).runs).toHaveLength(1);
  expect((await message({kind:'IMPORT_RUN',run:{...run('remote'),steps:[{...run('x').steps[0],visualContext:{screenshotDataUrl:'https://example.com/tracker'}}]}})).kind).toBe('ERROR');
});

test('slideshow pauses, resumes at selected step, and hides its controls', async () => {
  await viewer.evaluate(r => chrome.storage.local.set({runs:[r]}),run('play',5)); await loadViewer();
  await viewer.locator('.step-item').nth(2).click(); await viewer.locator('#playBtn').click();
  await expect(viewer.locator('#playbackStatus')).toHaveText('Playing: 3/5');
  await viewer.locator('#pausePlayBtn').click(); await expect(viewer.locator('#playbackInfo')).toBeHidden();
  await viewer.locator('#playBtn').click(); await expect(viewer.locator('#playbackStatus')).toHaveText('Playing: 3/5');
  await viewer.locator('.step-item').nth(1).click(); await expect(viewer.locator('#playbackInfo')).toBeHidden();
  await viewer.setViewportSize({width:1100,height:800}); await viewer.screenshot({path:'test-results/viewer-desktop.png',fullPage:true});
  await viewer.setViewportSize({width:600,height:800}); expect(await viewer.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('password fields are redacted, active run edits blocked, restricted tabs rejected', async () => {
  const page=await context.newPage(); await page.goto(site);
  const id=await tabId(); await message({kind:'START_RECORDING',tabId:id});
  await page.evaluate(()=>{const input=document.createElement('input');input.type='password';input.id='password';document.body.append(input);});
  await page.locator('#password').fill('DO-NOT-STORE'); await page.locator('#password').blur();
  await expect.poll(async()=> (await state()).currentRun.steps.some(s=>s.value==='[REDACTED]')).toBe(true);
  expect(JSON.stringify(await state())).not.toContain('DO-NOT-STORE');
  const current=(await state()).currentRun;
  expect((await message({kind:'DELETE_RUN',runId:current.runId})).kind).toBe('ERROR'); await stop();
  const restrictedId=await viewer.evaluate(async()=> (await chrome.tabs.getCurrent()).id);
  expect((await message({kind:'START_RECORDING',tabId:restrictedId})).kind).toBe('ERROR');
  await page.close();
});

test('popup shows restricted-page feedback and starts/stops the selected demo tab', async () => {
  const popup = await context.newPage(); await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(popup.locator('#startBtn')).toBeEnabled();
  await popup.locator('#startBtn').click(); await expect(popup.locator('#statusText')).toContainText('regular HTTP');
  const page = await context.newPage(); await page.goto(site);
  await popup.evaluate(() => document.getElementById('startBtn').click());
  await expect.poll(async()=> (await message({kind:'GET_STATUS'})).isRecording).toBe(true);
  await page.locator('#buy').click();
  await expect.poll(async()=> (await state()).currentRun.steps.length).toBeGreaterThan(1);
  await expect(popup.locator('#stopBtn')).toBeEnabled();
  await popup.evaluate(() => document.getElementById('stopBtn').click());
  await expect.poll(async()=> (await state()).runs?.length).toBe(1);
  await popup.close(); await page.close();
});
