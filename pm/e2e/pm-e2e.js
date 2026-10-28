// Headless-Chrome end-to-end test. Run: serve the repo root on :8793 (python3 -m http.server 8793), then
// node pm/e2e/pm-e2e.js with puppeteer-core installed and Chrome at /usr/bin/google-chrome. Takes ~80 s (waits for auto-lock).
const p = require('puppeteer-core');
const fs = require('fs');
const BASE = 'http://localhost:8793/pm/';
const SHOTS = '/workspace/pm-shots/';
const DL = '/tmp/pmdl';
const PASS = 'culvert headwall tailwater 42';
let n = 0;
const ok = (c, m) => { if (!c) throw new Error('FAIL: ' + m); n++; console.log('ok -', m); };
let pg; const nav = async (x) => { await pg.evaluate((x) => { location.hash = x; }, x); await sleep(150); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await p.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  pg = await b.newPage();
  const errs = [], ext = [];
  pg.on('pageerror', (e) => errs.push(e.message));
  pg.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  pg.on('request', (r) => { if (!r.url().startsWith('http://localhost:8793/') && !r.url().startsWith('blob:') && !r.url().startsWith('data:')) ext.push(r.url()); });
  pg.on('dialog', async (d) => { const m = d.message(); if (/Staff name/.test(m)) await d.accept('Maria Lopez'); else await d.accept(); });
  const cdp = await pg.target().createCDPSession();
  fs.rmSync(DL, { recursive: true, force: true }); fs.mkdirSync(DL);
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DL });
  await pg.setViewport({ width: 1280, height: 900 });
  await pg.goto(BASE, { waitUntil: 'networkidle0' });
  await pg.evaluate(() => localStorage.clear());
  await pg.reload({ waitUntil: 'networkidle0' });
  const csp = await pg.$eval('meta[http-equiv="Content-Security-Policy"]', (e) => e.content);
  ok(/default-src 'self'/.test(csp) && /connect-src 'none'/.test(csp), 'CSP meta present');
  ok(await pg.$('meta[name=robots][content*=noindex]'), 'noindex meta');
  ok((await pg.$eval('#lockTitle', (e) => e.textContent)) === 'Set a passphrase', 'first run asks to set a passphrase');
  await pg.screenshot({ path: SHOTS + 'desktop-1-setup.png' });
  // mismatch + too short
  const pw = await pg.$$('#lockBody input[type=password]');
  await pw[0].type('short'); await pw[1].type('short');
  await pg.click('#lockBody button[type=submit]');
  ok(/at least 10/.test(await pg.$eval('#lockBody .err', (e) => e.textContent)), 'short passphrase rejected with guidance');
  await pw[0].click({ clickCount: 3 }); await pw[0].type(PASS);
  await pw[1].click({ clickCount: 3 }); await pw[1].type(PASS + 'x');
  await pg.click('#lockBody button[type=submit]');
  ok(/do not match/.test(await pg.$eval('#lockBody .err', (e) => e.textContent)), 'confirm mismatch rejected');
  await pw[1].click({ clickCount: 3 }); await pw[1].type(PASS);
  await pg.click('#lockBody button[type=submit]');
  await pg.waitForSelector('#view:not([hidden]) .counts', { timeout: 20000 });
  ok(true, 'vault created, dashboard shown');
  // sub A -> add segments
  await nav('#/subs'); await pg.waitForSelector('.linkcard');
  await pg.click('.linkcard');
  await pg.waitForSelector('details.add form');
  const addSeg = async (name, road, a, z) => {
    const ins = await pg.$$('details.add form input');
    for (const [i, v] of [[0, name], [1, road], [2, a], [3, z]].map(([i, v]) => [ins[i], v])) { await i.click({ clickCount: 3 }); await i.type(v); }
    await pg.click('details.add form button[type=submit]');
  };
  // bad station first
  await addSeg('Bad', 'FM 1960', '10+00', '5+00');
  ok(/after start/.test(await pg.$eval('details.add .err', (e) => e.textContent)), 'invalid station range rejected in UI');
  await addSeg('Mainlane North', 'FM 1960', '10+00', '25+50');
  await pg.waitForFunction(() => location.hash.startsWith('#/seg/'));
  await pg.waitForSelector('form.bulk');
  ok((await pg.$eval('.sta.big', (e) => e.textContent)).includes('10+00 to 25+50'), 'segment shows formatted stations');
  await pg.click('form.bulk button[type=submit]');
  await pg.waitForSelector('li.sheet');
  const cnt = (await pg.$$('li.sheet')).length;
  ok(cnt === 13, 'bulk-added standard sheet set (' + cnt + ')');
  // inline edits on first 3 sheets
  const sheets = await pg.$$('li.sheet');
  await (await sheets[0].$('.c-st select')).select('Done');
  await (await sheets[1].$('.c-st select')).select('In review');
  await (await sheets[1].$('.c-own select')).select('__new');
  await sleep(300);
  await pg.evaluate(() => { const d = document.querySelectorAll('li.sheet')[2].querySelector('input[type=date]'); d.value = '2026-01-15'; d.dispatchEvent(new Event('change', { bubbles: true })); });
  await pg.evaluate(() => { const t = document.querySelectorAll('li.sheet')[2].querySelector('textarea'); t.value = 'Need survey for outfall'; t.dispatchEvent(new Event('change', { bubbles: true })); });
  await pg.type('form.tpl input', 'Custom Outfall Detail'); await pg.click('form.tpl button[type=submit]');
  await pg.waitForFunction(() => document.querySelectorAll('li.sheet').length === 14);
  ok(true, 'single sheet added');
  // second segment in sub B
  await nav('#/subs'); await pg.waitForSelector('.linkcard');
  await (await pg.$$('.linkcard'))[1].click();
  await pg.waitForSelector('details.add form');
  await addSeg('Cross Street Outfall', 'Kuykendahl Rd', '100+00', '112+75.5');
  await pg.waitForSelector('form.bulk');
  await pg.select('form.bulk select', 'SWP3');
  await pg.click('form.bulk button[type=submit]');
  await pg.waitForFunction(() => document.querySelectorAll('li.sheet').length === 4);
  ok(true, 'SWP3-only standard set added to segment in B');
  await sleep(500);
  await nav('#/'); await pg.waitForSelector('.counts');
  const dash = await pg.$eval('#view', (e) => e.innerText);
  ok(/18 sheets/.test(dash) && /Maria Lopez/.test(dash) && /Overdue sheets \(1\)/.test(dash), 'dashboard: totals, workload owner, overdue');
  await pg.screenshot({ path: SHOTS + 'desktop-2-dashboard.png', fullPage: true });
  await nav('#/table'); await pg.waitForSelector('.filters');
  await pg.select('.filters select:nth-of-type(1)', '');
  const discSel = (await pg.$$('.filters select'))[2];
  await discSel.select('SWP3');
  ok((await pg.$eval('#view .row .muted', (e) => e.textContent)).startsWith('8 of 18'), 'discipline filter (SWP3) works');
  await discSel.select('');
  await pg.type('.filters input[type=search]', 'outfall');
  { const t = await pg.$eval('#view .row .muted', (e) => e.textContent); ok(/^[1-9]\d* of 18/.test(t) && !t.startsWith('18'), 'search works (' + t + ')'); }
  await pg.screenshot({ path: SHOTS + 'desktop-3-table.png', fullPage: true });
  await pg.click('#view .row button'); await sleep(800);
  const csv = fs.readdirSync(DL).find((f) => f.endsWith('.csv'));
  ok(csv && /Kuykendahl/.test(fs.readFileSync(DL + '/' + csv, 'utf8')), 'CSV export (after unencrypted warning)');
  // storage inspection
  await sleep(500);
  const store = await pg.evaluate(async () => {
    const ls = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); ls[k] = localStorage.getItem(k); }
    const ss = {}; for (let i = 0; i < sessionStorage.length; i++) ss[sessionStorage.key(i)] = sessionStorage.getItem(sessionStorage.key(i));
    const dbs = indexedDB.databases ? await indexedDB.databases() : [];
    return { ls, ss, dbs, cookie: document.cookie };
  });
  // reload -> lock screen
  await nav('#/seg/x'); await pg.reload({ waitUntil: 'networkidle0' });
  ok((await pg.$eval('#lockTitle', (e) => e.textContent)) === 'Unlock' && await pg.$eval('#view', (e) => e.hidden), 'reload shows lock screen');
  const all = JSON.stringify(store);
  ok(Object.keys(store.ls).length === 1 && store.ls['pm.vault.v1'], 'only one localStorage key (vault)');
  ok(!store.dbs.length && !Object.keys(store.ss).length && !store.cookie, 'no IndexedDB/sessionStorage/cookies used');
  for (const w of ['Mainlane', 'FM 1960', 'Kuykendahl', 'Maria', 'Culvert', 'survey', 'SWP3', 'Drainage', PASS]) ok(!all.includes(w), 'no plaintext "' + w + '" in storage');
  const env = JSON.parse(store.ls['pm.vault.v1']);
  ok(env.iter >= 600000 && env.kdf === 'PBKDF2-SHA-256', 'vault envelope uses PBKDF2 600k');
  const page = await pg.content();
  ok(!/Mainlane/.test(page), 'no plaintext in locked DOM');
  await pg.screenshot({ path: SHOTS + 'desktop-4-lock.png' });
  // wrong passphrase
  await pg.type('#lockBody input', 'not the passphrase!!');
  await pg.click('#lockBody button[type=submit]');
  await pg.waitForFunction(() => /Wrong passphrase/.test(document.querySelector('#lockBody .err').textContent), { timeout: 20000 });
  ok(await pg.$eval('#view', (e) => e.hidden), 'wrong passphrase rejected gracefully');
  await pg.type('#lockBody input', PASS);
  await pg.click('#lockBody button[type=submit]');
  await pg.waitForSelector('#view:not([hidden])', { timeout: 20000 });
  ok(!(await pg.$eval('#view', (e) => e.hidden)), 'unlocked with correct passphrase');
  await nav('#/'); await sleep(200);
  ok(/18 sheets/.test(await pg.$eval('#view', (e) => e.innerText)), 'data restored after unlock');
  // export backup
  await nav('#/settings'); await pg.waitForSelector('#exportBtn');
  await pg.click('#exportBtn'); await sleep(1200);
  const bk = fs.readdirSync(DL).find((f) => f.startsWith('pm-backup'));
  const bktext = fs.readFileSync(DL + '/' + bk, 'utf8');
  ok(bk && JSON.parse(bktext).fmt === 'pm-backup' && !/Mainlane|Maria/.test(bktext), 'encrypted backup downloaded, no plaintext');
  ok(!/never/.test(await pg.$eval('#lastBackup', (e) => e.textContent)), 'last backup date shown');
  await pg.screenshot({ path: SHOTS + 'desktop-5-settings.png', fullPage: true });
  // clear everything and import
  await pg.evaluate(() => localStorage.clear());
  await pg.reload({ waitUntil: 'networkidle0' });
  ok((await pg.$eval('#lockTitle', (e) => e.textContent)) === 'Set a passphrase', 'cleared storage -> first-run screen');
  // create new empty vault, then import via settings (wrong pass first)
  const pw2 = await pg.$$('#lockBody input[type=password]');
  await pw2[0].type('a brand new passphrase'); await pw2[1].type('a brand new passphrase');
  await pg.click('#lockBody form button[type=submit]');
  await pg.waitForSelector('#view:not([hidden])', { timeout: 20000 });
  await nav('#/settings'); await pg.waitForSelector('form.imp');
  const fi = await pg.$('form.imp input[type=file]');
  await fi.uploadFile(DL + '/' + bk);
  await pg.type('form.imp input[type=password]', 'wrong wrong wrong');
  await pg.click('form.imp button[type=submit]');
  await pg.waitForFunction(() => /Wrong passphrase/.test(document.querySelector('form.imp .err').textContent), { timeout: 20000 });
  ok(true, 'import with wrong passphrase rejected');
  await pg.$eval('form.imp input[type=password]', (e) => { e.value = ''; });
  await pg.type('form.imp input[type=password]', PASS);
  await pg.click('form.imp button[type=submit]');
  await pg.waitForFunction(() => location.hash === '#/' && /18 sheets/.test(document.querySelector('#view').innerText), { timeout: 20000 });
  ok(true, 'import (after confirm) restored all 18 sheets');
  await sleep(500);
  // restore persisted & re-encrypted under current passphrase
  await pg.reload({ waitUntil: 'networkidle0' });
  await pg.type('#lockBody input', 'a brand new passphrase');
  await pg.click('#lockBody button[type=submit]');
  await pg.waitForSelector('#view:not([hidden]) .counts', { timeout: 20000 });
  ok(/18 sheets/.test(await pg.$eval('#view', (e) => e.innerText)), 'imported data persisted under current passphrase');
  // lock button
  await pg.click('#lockBtn');
  ok((await pg.$eval('#lockTitle', (e) => e.textContent)) === 'Unlock', 'Lock button locks');
  await pg.type('#lockBody input', 'a brand new passphrase');
  await pg.click('#lockBody button[type=submit]');
  await pg.waitForSelector('#view:not([hidden])', { timeout: 20000 });
  // iPhone screenshots
  await pg.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await sleep(500);
  if (await pg.$eval('#view', (e) => e.hidden)) { await pg.type('#lockBody input', 'a brand new passphrase'); await pg.click('#lockBody button[type=submit]'); await pg.waitForSelector('#view:not([hidden])', { timeout: 20000 }); }
  await nav('#/'); await sleep(400);
  await pg.screenshot({ path: SHOTS + 'iphone-1-dashboard.png', fullPage: true });
  await nav('#/subs'); await sleep(200);
  await (await pg.$$('.linkcard'))[0].click(); await sleep(300);
  await pg.screenshot({ path: SHOTS + 'iphone-2-subproject.png', fullPage: true });
  await pg.click('.segrow'); await sleep(300);
  await pg.screenshot({ path: SHOTS + 'iphone-3-segment.png', fullPage: false });
  await pg.screenshot({ path: SHOTS + 'iphone-3-segment-full.png', fullPage: true });
  const ow = await pg.evaluate(() => document.documentElement.scrollWidth);
  ok(ow <= 390, 'no horizontal overflow at 390px (' + ow + ')');
  const small = await pg.evaluate(() => [...document.querySelectorAll('#view button, #view select, #view input:not([type=checkbox])')].filter((e) => e.offsetParent && e.getBoundingClientRect().height < 44).length);
  ok(small === 0, 'tap targets >= 44px');
  const unl = await pg.evaluate(() => [...document.querySelectorAll('#view input, #view select, #view textarea')].filter((e) => !e.labels?.length && !e.getAttribute('aria-label')).length);
  ok(unl === 0, 'all form controls labelled');
  await nav('#/table'); await sleep(300);
  await pg.screenshot({ path: SHOTS + 'iphone-4-table.png', fullPage: false });
  await nav('#/settings'); await sleep(300);
  await pg.screenshot({ path: SHOTS + 'iphone-5-settings.png', fullPage: true });
  // auto-lock: set 1 minute, wait
  await pg.$eval('#view input[type=number]', (e) => { e.value = '1'; e.dispatchEvent(new Event('change', { bubbles: true })); });
  await nav('#/');
  console.log('waiting 65 s for auto-lock…');
  await sleep(65000);
  ok((await pg.$eval('#lockTitle', (e) => e.textContent)) === 'Unlock' && /inactivity/.test(await pg.$eval('#lockBody .err', (e) => e.textContent)), 'auto-lock after inactivity');
  await pg.screenshot({ path: SHOTS + 'iphone-6-autolocked.png' });
  ok(ext.length === 0, 'no external network requests (' + ext.join(',') + ')');
  ok(errs.length === 0, 'no console/CSP errors (' + errs.join(' | ') + ')');
  console.log('E2E PASS', n, 'checks');
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
