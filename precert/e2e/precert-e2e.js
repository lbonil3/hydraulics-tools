// Headless-Chrome e2e for /precert/. Run: node precert/e2e/precert-e2e.js [1440x900|1920x1080|iphone]
// Files are served from this checkout by request interception (no server). PRECERT_BASE=https://.../precert/ tests the live site.
let p; try { p = require('puppeteer-core'); } catch (e) { p = require('/workspace/e2e/node_modules/puppeteer-core'); }
const fs = require('fs'), path = require('path');
const BASE = process.env.PRECERT_BASE || 'https://precert.local/precert/';
const ROOT = path.resolve(__dirname, '../..');
const TYPES = { html: 'text/html', js: 'text/javascript', css: 'text/css', png: 'image/png', json: 'application/json' };
const SHOTS = '/workspace/precert-shots/', MODE = process.argv[2] || '1440x900', MOBILE = MODE === 'iphone';
const tag = MOBILE ? 'iphone' : MODE.split('x')[0];
const DL = '/tmp/precert-dl-' + tag;
let n = 0; const ok = (c, m) => { if (!c) throw new Error('FAIL [' + MODE + ']: ' + m); n++; console.log('ok', m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  fs.mkdirSync(SHOTS, { recursive: true }); fs.rmSync(DL, { recursive: true, force: true }); fs.mkdirSync(DL, { recursive: true });
  const b = await p.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const pg = await b.newPage();
  if (MOBILE) await pg.emulate({ viewport: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
  else { const [w, hh] = MODE.split('x').map(Number); await pg.setViewport({ width: w, height: hh }); }
  const cdp = await pg.target().createCDPSession(); await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DL });
  const ext = [], errs = [], host = new URL(BASE).host;
  await pg.setRequestInterception(true);
  pg.on('request', (r) => { const u = new URL(r.url()); if (u.protocol === 'data:') return r.continue(); if (u.host !== host) { ext.push(r.url()); return r.abort(); } if (process.env.PRECERT_BASE) return r.continue(); let f = path.join(ROOT, decodeURIComponent(u.pathname)); if (f.endsWith('/')) f += 'index.html'; if (!fs.existsSync(f)) return r.respond({ status: 404, body: '' }); r.respond({ status: 200, contentType: TYPES[f.split('.').pop()] || 'application/octet-stream', body: fs.readFileSync(f) }); });
  pg.on('pageerror', (e) => errs.push(e.message)); pg.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  pg.on('dialog', (d) => d.accept());
  const shot = (name, full) => pg.screenshot({ path: SHOTS + name + '-' + tag + '.png', fullPage: !!full });
  const tab = async (t) => { await pg.$eval('.tabs [data-tab="' + t + '"]', (e) => { e.scrollIntoView({ inline: 'center' }); e.click(); }); await sleep(150); };
  const type = async (sel, v) => { await pg.$eval(sel, (e) => { e.scrollIntoView({ block: 'center' }); e.focus(); e.select && e.select(); }); await pg.keyboard.type(v); };
  const txt = (s) => pg.$eval(s, (e) => e.textContent);
  const data = () => pg.evaluate(() => JSON.parse(localStorage.getItem('precert.data.v1') || 'null'));

  await pg.goto(BASE, { waitUntil: 'networkidle0' });
  await pg.evaluate(() => localStorage.clear()); await pg.reload({ waitUntil: 'networkidle0' }); await pg.waitForSelector('#main > *'); await sleep(100);
  ok(/'self'/.test(await pg.$eval('meta[http-equiv="Content-Security-Policy"]', (e) => e.content)), 'CSP self');
  ok(await pg.evaluate(() => document.documentElement.dataset.theme === 'light'), 'light theme by default');
  ok(/not an official TxDOT system/.test(await txt('.disc')), 'disclaimer visible');
  /* 1. profile + SSN warning */
  await pg.waitForSelector('#f-first-p');
  await type('#f-first-p', 'Luis'); await type('#f-last-p', 'Bonilla'); await type('#f-firm-p', 'Example Engineers'); await type('#f-peNumber-p', '123456');
  ok(/never an SSN|NOT enter a Social Security/i.test(await pg.evaluate(() => document.body.innerText)), 'visible do-not-enter-SSN warning');
  await type('#f-pno-p', '123-45-6789'); await sleep(50);
  ok(await pg.$eval('#ssnWarn', (e) => !e.hidden), 'SSN-looking personnel number is flagged');
  await type('#f-pno-p', 'E-1042'); await sleep(50); ok(await pg.$eval('#ssnWarn', (e) => e.hidden), 'warning clears for a firm number');
  await pg.$eval('#addCert', (e) => e.click()); await sleep(100);
  await shot('01-profile', true);
  /* 2. projects */
  await tab('projects'); await pg.$eval('#addProject', (e) => e.click()); await sleep(150);
  await sleep(300); const pid = (await data()).projects[0].id;
  await type('#f-pname-' + pid, 'SH 249 Drainage'); await type('#f-ploc-' + pid, 'Houston, Harris County'); await type('#f-pfee-' + pid, '1250000'); await type('#f-pcost-' + pid, '45000000');
  await pg.$eval('#f-pbeg-' + pid, (e) => { e.value = '2016-01-01'; e.dispatchEvent(new Event('input')); }); await pg.$eval('#f-pend-' + pid, (e) => { e.value = '2022-06-30'; e.dispatchEvent(new Event('input')); });
  await pg.select('#addCat-' + pid, '10.2.1'); await sleep(200);
  ok((await data()).projects[0].cats[0].code === '10.2.1' && (await data()).targets.includes('10.2.1'), 'work category added to the project and to my categories');
  await pg.$eval('.entry .tpl', (e) => e.click()); await sleep(100);
  ok(/I ____/.test(await pg.$eval('.entry .wtext', (e) => e.value)), 'template inserts blanks only');
  await pg.$eval('.entry .wtext', (e) => { e.value = 'I designed the storm drain system for 3.2 miles of SH 249 and I computed the runoff using the Rational Method considering TxDOT Hydraulic Design Manual IDF data.'; e.dispatchEvent(new Event('input')); }); await sleep(50);
  ok(/first person/.test(await txt('.entry .wstat')) && /words/.test(await txt('.entry .wstat')), 'word count and first-person check');
  await pg.$eval('.entry [data-item="r0"]', (e) => e.click()); await sleep(200);
  ok((await data()).projects[0].cats[0].covers.includes('r0'), 'requirement ticked');
  /* v1.3: write-up quality, category suggestions */
  const V13 = SHOTS + 'v13/', v13 = (n) => pg.screenshot({ path: V13 + n + '-' + tag + '.png', fullPage: true }); fs.mkdirSync(V13, { recursive: true });
  ok(await pg.$eval('.entry .qual summary', (e) => /Write-up check/.test(e.textContent)) && await pg.$eval('.entry .qual', (e) => /quantities|No quantities|methods|Short/i.test(e.textContent)), 'quality panel with flags');
  await pg.$eval('.entry .qual', (e) => { e.open = true; }); ok(await pg.$eval('.entry .qreqs li', (e) => /ticked/.test(e.textContent)), 'tick overrides requirement term match');
  await type('#f-pdesc-' + pid, 'Storm drain and FEMA CLOMR floodway no-rise analysis for the creek crossing.'); await tab('cats'); await tab('projects');
  await pg.$eval('#sugg-' + pid, (e) => { e.open = true; e.scrollIntoView(); }); await sleep(100);
  const sg = await txt('#sugg-' + pid); ok(/10\.8\.1/.test(sg) && /Why:/.test(sg) && /not a determination/.test(sg) && !/10\.2\.1 Roadway/.test(sg), 'suggestions with why, excluding categories already on the project');
  await v13('01-suggestions-quality');
  await pg.$eval('#sugg-' + pid + ' [data-sugg="10.8.1"]', (e) => e.click()); await sleep(250);
  ok((await data()).projects[0].cats.some((c) => c.code === '10.8.1'), 'one-tap add category from suggestion');
  await shot('02-projects', true);
  /* 3. categories + helper */
  await tab('cats');
  ok((await pg.$$('#catTree .cbtn')).length >= 8 && (await pg.$$('#catTree .cbtn')).length < 60, 'drainage/hydraulics filter on by default');
  await type('#catQ', '10.2.1'); await sleep(100); await pg.$eval('#catTree [data-code="10.2.1"]', (e) => e.click()); await sleep(200);
  ok(/Roadway Hydraulic Design/.test(await txt('#helper')) && /five years/.test(await txt('#helper')), 'helper shows TxDOT requirement text');
  ok(/1 \/ 1 requirements addressed/.test(await txt('#covPct')), 'coverage meter 1/1');
  ok(/I designed/.test(await txt('#helper')), 'helper shows phrasing tips');
  await shot('03-categories', true);
  /* 4. readiness */
  await tab('ready'); ok(await pg.$('#readyTree .tcat'), 'readiness tree'); ok(/SH 249 Drainage/.test(await txt('#readyTree')), 'project under the requirement');
  ok(/6\.5 of 5 years|of 5 years/.test(await txt('#readyTree')), 'experience years shown');
  ok(await pg.$('#readyTree [data-years="pass"]') && /SH 249 Drainage — 01\/01\/2016/.test(await txt('#readyTree .yrs')), 'years check: pass, contributing projects listed');
  await v13('02-readiness-years');
  await shot('04-readiness', true);
  /* 5. CCIS */
  await tab('ccis'); await pg.$eval('[data-step="access"]', (e) => e.click()); await sleep(100); await pg.$eval('[data-step="employee"]', (e) => e.click()); await sleep(100);
  ok(/2 \/ 10 steps done/.test(await txt('#ccisPct')), 'CCIS progress');
  ok(/January 1 – Mar 31|March 31/.test(await txt('#main')) && /60 days/.test(await txt('#main')), 'renewal window and 60-day review');
  await shot('05-ccis', true);
  /* 6. export: print container populated without popups; downloads */
  await tab('export');
  await pg.evaluate(() => { window.__p = 0; window.__open = 0; window.open = () => { window.__open++; return null; }; window.print = () => { window.__p++; window.__pc = document.querySelector('#printOut').textContent; }; });
  await pg.$eval('#printBtn', (e) => e.click()); await sleep(100);
  const pr = await pg.evaluate(() => ({ p: window.__p, o: window.__open, c: window.__pc || '' }));
  ok(pr.p === 1 && pr.o === 0 && /10\.2\.1 Roadway Hydraulic Design/.test(pr.c) && /SH 249 Drainage/.test(pr.c), 'print uses an in-page container (no popup), populated before print');
  await pg.emulateMediaType('print'); await sleep(100);
  ok(await pg.evaluate(() => getComputedStyle(document.querySelector('#printOut')).display === 'block' && getComputedStyle(document.querySelector('#main')).display === 'none'), 'print CSS shows only the summary');
  if (!MOBILE) await pg.pdf({ path: SHOTS + 'summary-' + tag + '.pdf', preferCSSPageSize: true, printBackground: true });
  await pg.emulateMediaType('screen');
  ok(/Work category description: I designed/.test(await txt('#summaryPre')), 'copy-ready text for CCIS fields');
  await pg.$eval('#dlHtml', (e) => e.click()); await pg.$eval('#exportJson', (e) => e.click()); await sleep(800);
  const files = fs.readdirSync(DL);
  ok(files.some((f) => /\.html$/.test(f)) && files.some((f) => /\.json$/.test(f)), 'printable page and JSON backup downloaded: ' + files.join(', '));
  const bj = JSON.parse(fs.readFileSync(path.join(DL, files.find((f) => /\.json$/.test(f))), 'utf8'));
  ok(bj.data.projects[0].name === 'SH 249 Drainage', 'backup has the data');
  await shot('06-export', true);
  /* restore */
  await pg.evaluate(() => localStorage.removeItem('precert.data.v1')); await pg.reload({ waitUntil: 'networkidle0' }); await pg.waitForSelector('#main > *'); await sleep(100);
  ok(!(await data()) || !(await data()).projects.length, 'cleared');
  await tab('export'); const inp = await pg.$('#importFile'); await inp.uploadFile(path.join(DL, files.find((f) => /\.json$/.test(f)))); await sleep(500);
  ok((await data()).projects[0].cats[0].covers.includes('r0'), 'backup restored');
  /* 7. sources, theme, persistence */
  await tab('sources'); ok(/precert-work-categories\.docx/.test(await pg.$eval('#main', (e) => e.innerHTML)) && /verified on 2026-10-29/.test(await txt('#main')), 'sources with verified date');
  await pg.$eval('#themeBtn', (e) => e.click()); await sleep(100); ok(await pg.evaluate(() => document.documentElement.dataset.theme === 'dark'), 'dark theme option');
  await tab('ready'); await shot('07-readiness-dark', true); await pg.$eval('#themeBtn', (e) => e.click());
  await pg.reload({ waitUntil: 'networkidle0' }); await pg.waitForSelector('#main > *'); await sleep(100); ok((await data()).profile.last === 'Bonilla', 'data persists after reload');
  if (MOBILE) ok(await pg.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'no horizontal overflow on phone');
  /* 8. v1.1 example mode: real data backed up, banner, watermark, clear restores */
  fs.mkdirSync(SHOTS + 'example', { recursive: true });
  const exShot = (name) => pg.screenshot({ path: SHOTS + 'example/' + name + '-' + tag + '.png', fullPage: true });
  const before = await pg.evaluate(() => localStorage.getItem('precert.data.v1'));
  ok(await pg.$eval('#exBanner', (e) => e.hidden) && /Load example/.test(await txt('#exBtn')), 'no banner with real data; header offers Load example');
  await tab('profile'); ok(!(await pg.$('#exStart')), 'first-run example card hidden when real data exists');
  await pg.$eval('#exBtn', (e) => e.click()); await sleep(300);
  ok(await pg.evaluate((b) => localStorage.getItem('precert.data.v1.pre-example') === b, before), 'real data saved to precert.data.v1.pre-example before loading');
  const X = await data();
  ok(X.example && X.profile.isExample && X.profile.last === 'Example' && X.projects.length === 3 && X.projects.every((q) => q.isExample), 'example loaded with isExample flags');
  ok(!(await pg.$eval('#exBanner', (e) => e.hidden)) && /Example data — not real, replace with your own/.test(await txt('#exBanner')), 'persistent example banner');
  ok(!(await pg.$eval('#exRestore', (e) => e.hidden)), 'Restore my data offered');
  await exShot('01-profile');
  await tab('projects'); ok((await pg.$$('.extag')).length >= 3 && /SAMPLE TEXT/.test(await pg.$eval('.entry .wtext', (e) => e.value)), 'projects and write-ups marked example / sample text');
  await exShot('02-projects');
  await tab('cats'); await type('#catQ', '10.2.1'); await sleep(100); await pg.$eval('#catTree [data-code="10.2.1"]', (e) => e.click()); await sleep(200);
  ok(/1 \/ 1 requirements addressed/.test(await txt('#covPct')), 'example coverage in the helper'); await exShot('03-writeup-helper');
  await tab('ready'); const RT = await txt('#readyTree');
  ok(/Ready/.test(RT) && /gap/.test(RT) && (await pg.$$('#readyTree .tcat.gap')).length >= 1 && (await pg.$$('#readyTree .tcat.ok')).length >= 1, 'readiness shows satisfied and gap');
  await exShot('04-readiness-gap');
  await tab('export'); ok((await txt('#summaryPre')).startsWith('*** EXAMPLE DATA'), 'export text carries the EXAMPLE header');
  await pg.$eval('#printBtn', (e) => e.click()); await sleep(100);
  ok(/EXAMPLE DATA/.test(await pg.evaluate(() => window.__pc || document.querySelector('#printOut').textContent)), 'print summary watermarked');
  await exShot('05-export');
  if (!MOBILE) { await pg.emulateMediaType('print'); await pg.pdf({ path: SHOTS + 'example/summary-example-' + tag + '.pdf', preferCSSPageSize: true, printBackground: true }); await pg.emulateMediaType('screen'); }
  /* 9. v1.2 TxDOT form: view, checklist, filled .docx download, print, copy */
  const FD = SHOTS + 'form/'; fs.mkdirSync(FD, { recursive: true });
  await tab('form'); await pg.waitForSelector('#formView');
  const FV = await txt('#formView');
  ok(FV.startsWith('*** EXAMPLE DATA') && /Firm sequence number\*/.test(FV) && /Employee sequence number \(if unknown, leave blank\)/.test(FV) && /Issuing agency name \(ex\. TBPELS, TBAE, Florida PE board, National Highway Institute\)/.test(FV), 'form view: watermark + verbatim labels');
  ok(/Certification 5/.test(FV) && /Project 3/.test(FV) && /not entered/.test(FV) && /02\/01\/2015/.test(FV), 'form view: certs, projects, CCIS dates, blanks as not entered');
  ok(/All mandatory/.test(await txt('#formCheck')), 'example passes the mandatory checklist');
  await pg.screenshot({ path: FD + '01-form-example-' + tag + '.png', fullPage: true });
  await pg.$eval('#dlDocx', (e) => e.click()); let dx = null; for (let i = 0; i < 40 && !dx; i++) { await sleep(150); dx = fs.readdirSync(DL).find((f) => /EXAMPLE.*\.docx$/.test(f)); }
  ok(dx && fs.statSync(path.join(DL, dx)).size > 50000, 'filled .docx downloaded: ' + dx);
  const D = require('../docx.js'), docXml = new TextDecoder().decode(D.unzip(fs.readFileSync(path.join(DL, dx))).find((f) => f.name === 'word/document.xml').data);
  ok(/EXAMPLE DATA/.test(docXml) && docXml.includes('Example Engineering Co. (fictional)') && docXml.includes('EXAMPLE-000000') && /Project 3/.test(docXml) && !/Project 4/.test(docXml), 'downloaded docx is filled from the official template');
  fs.copyFileSync(path.join(DL, dx), FD + 'filled-form-EXAMPLE-' + tag + '.docx');
  await pg.$eval('#printForm', (e) => e.click()); await sleep(150);
  ok(await pg.$eval('#printOut', (e) => e.classList.contains('form') && /^\*\*\* EXAMPLE DATA/.test(e.textContent) && /Employment status\*/.test(e.textContent)), 'print container holds the watermarked form');
  if (!MOBILE) { await pg.emulateMediaType('print'); await pg.pdf({ path: FD + 'form-print-EXAMPLE-' + tag + '.pdf', format: 'Letter', printBackground: true, margin: { top: '0.5in', bottom: '0.5in', left: '0.5in', right: '0.5in' } }); await pg.emulateMediaType('screen'); }
  await pg.$eval('#dlFormHtml', (e) => e.click()); await sleep(500);
  const fh = fs.readdirSync(DL).find((f) => /Application-Form-EXAMPLE.*\.html$/.test(f)); ok(fh && /EXAMPLE DATA/.test(fs.readFileSync(path.join(DL, fh), 'utf8')), 'printable form HTML watermarked');
  await pg.evaluate(() => { window.__copied = null; if (navigator.clipboard) navigator.clipboard.writeText = (t) => { window.__copied = t; return Promise.resolve(); }; });
  await pg.$eval('#copyForm', (e) => e.click()); await sleep(150); const cp = await pg.evaluate(() => window.__copied);
  ok(cp === null || (cp.startsWith('*** EXAMPLE DATA') && /Precertification Application Form/.test(cp)), 'copy-as-text watermarked');
  if (MOBILE) ok(await pg.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'form: no horizontal overflow on phone');
  await tab('export');
  await pg.$eval('#exportJson', (e) => e.click()); await sleep(600);
  const exj = fs.readdirSync(DL).find((f) => /EXAMPLE.*\.json$/.test(f)); ok(exj && JSON.parse(fs.readFileSync(path.join(DL, exj), 'utf8')).example, 'JSON export flagged example');
  await pg.reload({ waitUntil: 'networkidle0' }); await pg.waitForSelector('#main > *'); await sleep(100);
  ok(!(await pg.$eval('#exBanner', (e) => e.hidden)), 'banner persists after reload');
  await pg.$eval('#exClear', (e) => e.click()); await sleep(300);
  const back2 = await data();
  ok(back2.profile.last === 'Bonilla' && back2.projects.length === 1 && back2.projects[0].name === 'SH 249 Drainage' && !back2.example, 'Clear example restores my data');
  ok(await pg.evaluate(() => localStorage.getItem('precert.data.v1.pre-example') === null) && await pg.$eval('#exBanner', (e) => e.hidden), 'backup consumed, banner gone');
  await tab('form'); ok(/Reference data: TxDOT categories dated 08\/25\/2026, form dated 09\/18\/2026, verified 2026-10-29/.test(await txt('#refLine')) && /become-precertified/.test(await pg.$eval('#checkUpdates', (e) => e.href + e.target)) && await pg.$eval('#checkUpdates', (e) => e.target === '_blank'), 'reference line + Check for updates link');
  await pg.screenshot({ path: SHOTS + 'v13/03-form-reference-' + tag + '.png', fullPage: false });
  const FC = await txt('#formCheck');
  ok(/Missing mandatory/.test(FC) && /Firm sequence number\*/.test(FC) && (await pg.$$('#formView .fr.miss')).length >= 1 && !/EXAMPLE DATA/.test(await txt('#formView')), 'real data: checklist highlights missing mandatory fields, no watermark');
  await pg.screenshot({ path: FD + '02-form-checklist-' + tag + '.png', fullPage: false });
  await tab('profile'); await type('#f-empSeq-p', '4321'); await sleep(250); ok((await data()).profile.employeeSeq === '4321', 'new employee sequence input saves');
  await tab('form'); ok(/4321/.test(await txt('#formView')), 'new input reaches the form');
  /* first run: example card, restore path not needed */
  await pg.evaluate(() => { localStorage.removeItem('precert.data.v1'); }); await pg.evaluate(() => { const u = JSON.parse(localStorage.getItem('precert.ui.v1')); u.tab = 'profile'; localStorage.setItem('precert.ui.v1', JSON.stringify(u)); });
  await pg.reload({ waitUntil: 'networkidle0' }); await pg.waitForSelector('#main > *'); await sleep(100);
  ok(await pg.$('#exStart'), 'empty state offers Load example');
  await pg.$eval('#exLoad2', (e) => e.click()); await sleep(300);
  ok((await data()).example && await pg.$eval('#exRestore', (e) => e.hidden) && await pg.evaluate(() => localStorage.getItem('precert.data.v1.pre-example') === null), 'first-run example: no backup needed');
  await pg.$eval('#exBtn', (e) => e.click()); await sleep(300);
  ok(!(await data()).projects.length && !(await data()).example, 'header Clear example empties the example');
  /* 10. v1.4 interface */
  const V14 = SHOTS + 'v14/', v14 = (n, full) => pg.screenshot({ path: V14 + n + '-' + tag + '.png', fullPage: !!full }); fs.mkdirSync(V14, { recursive: true });
  const vis = (sel) => pg.evaluate((q) => { const e = document.querySelector(q); if (!e) return false; const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden'; }, sel);
  await pg.evaluate(() => { const u = JSON.parse(localStorage.getItem('precert.ui.v1')); u.tour = 0; u.tab = 'profile'; localStorage.setItem('precert.ui.v1', JSON.stringify(u)); }); await pg.reload({ waitUntil: 'networkidle0' }); await pg.waitForSelector('#main > *');
  ok(await vis('#tour') && /1 of 4/.test(await txt('#tour')), 'first-run tour shown'); await v14('01-tour');
  for (let i = 0; i < 3; i++) { await pg.click('#tourNext'); await sleep(80); } ok(/4 of 4/.test(await txt('#tour')), 'tour steps'); await pg.click('#tourSkip'); await sleep(80);
  ok(!(await pg.$('#tour')) && (await pg.evaluate(() => JSON.parse(localStorage.getItem('precert.ui.v1')).tour)) === 'done', 'tour dismissed and remembered');
  ok(!(await vis('#menu')), 'menu closed'); await pg.click('#menuBtn'); await sleep(80); ok(await vis('#menu') && await vis('#exBtn') && await vis('#themeBtn') && await vis('#tourBtn'), 'one menu holds example, theme, tour'); await v14('02-menu');
  await pg.keyboard.press('Escape'); await sleep(50); ok(!(await vis('#menu')), 'Escape closes the menu');
  ok(await pg.evaluate(() => document.querySelector('.notice').getBoundingClientRect().height < 90), 'notices merged into one slim bar');
  if (MOBILE) {
    ok(await pg.evaluate(() => { const r = document.querySelector('.tabs').getBoundingClientRect(); return getComputedStyle(document.querySelector('.tabs')).position === 'fixed' && Math.abs(r.bottom - innerHeight) < 2; }), 'phone: bottom tab bar');
    ok(await vis('.tabs [data-tab="form"]') && await vis('#moreBtn') && !(await vis('.tabs [data-tab="sources"]')), 'phone: four main tabs + More');
    await pg.click('#moreBtn'); await sleep(80); ok(await vis('.tabs [data-tab="sources"]') && await vis('.tabs [data-tab="export"]'), 'More reveals the other sections'); await v14('03-phone-more');
    await pg.click('.tabs [data-tab="cats"]'); await sleep(150); ok(!(await vis('.tabs [data-tab="sources"]')) && await pg.$eval('#moreBtn', (e) => e.classList.contains('on')), 'More closes; marked active for a secondary tab');
    ok(await pg.evaluate(() => [...document.querySelectorAll('.tabs button, .btn, .mi')].filter((e) => e.offsetParent).every((e) => e.getBoundingClientRect().height >= 43.5)), 'tap targets >= 44px');
  } else ok(!(await vis('#moreBtn')) && await vis('.tabs [data-tab="sources"]') && await pg.evaluate(() => getComputedStyle(document.querySelector('.tabs')).position === 'sticky'), 'desktop keeps top tabs');
  await pg.$eval('#exBtn', (e) => e.click()); await sleep(300); ok((await data()).example, 'example loaded from the menu');
  await tab('projects'); ok((await pg.$$('details.proj')).length === 3 && (await pg.$$('details.proj[open]')).length <= 1, 'projects collapsed, at most one open');
  ok(await pg.$eval('details.proj summary', (e) => /02\/01\/2015/.test(e.textContent) && /10\.2\.1/.test(e.textContent) && !!e.querySelector('.light')), 'collapsed card: name, dates, categories, readiness dot');
  await v14('04-projects-collapsed', true);
  await pg.$$eval('details.proj > summary', (a) => a[0].click()); await sleep(80); await pg.$$eval('details.proj > summary', (a) => a[1].click()); await sleep(150);
  ok(await pg.evaluate(() => { const o = [...document.querySelectorAll('details.proj')].map((d) => d.open); return o[1] && !o[0] && !o[2]; }), 'opening a project closes the others');
  ok(await vis('#nextStep') && /Next step|All checks/.test(await txt('#nextStep')), 'Next step line');
  const eSel = 'details.proj[open] .entry';
  ok(await pg.$eval(eSel + ' .covers', (e) => !!e.querySelector('.auto.ok, .auto.no')), 'checklist shows live term-match marks');
  if (!MOBILE) { ok(await pg.$eval(eSel + ' .ebody', (e) => getComputedStyle(e).gridTemplateColumns.split(' ').length === 2), 'desktop: checklist beside the text'); await pg.$eval(eSel, (e) => e.scrollIntoView()); await v14('05-editor-desktop'); }
  else { await pg.$eval(eSel + ' .fsbtn', (e) => e.click()); await sleep(100); ok(await pg.$eval('.entry.fs', (e) => getComputedStyle(e).position === 'fixed' && Math.abs(e.getBoundingClientRect().width - innerWidth) < 2), 'phone: full-screen editor'); await v14('05-editor-fullscreen'); await pg.$eval('.entry.fs .fsbar .btn', (e) => e.click()); await sleep(80); ok(!(await pg.$('.entry.fs')), 'Done leaves full screen'); }
  await pg.$eval(eSel + ' .wtext', (e) => { e.value += ' x'; e.dispatchEvent(new Event('input')); }); await sleep(300); ok(/✓ Saved on this device/.test(await txt('#saved')), 'autosave indicator');
  await pg.$eval('#exBtn', (e) => e.click()); await sleep(300); await tab('form');
  await pg.$eval('#formView [data-jump="f-firm-p"]', (e) => e.click()); await sleep(200);
  ok(await pg.evaluate(() => document.activeElement && document.activeElement.id === 'f-firm-p') && /profile/.test(await pg.evaluate(() => document.querySelector('#main').dataset.tab)), 'tap a missing red field jumps to its input');
  await tab('form'); await v14('06-form-jump');
  /* dark-mode contrast (WCAG AA 4.5:1 for text) */
  await pg.evaluate(() => { if (document.documentElement.dataset.theme !== 'dark') document.querySelector('#themeBtn').click(); }); await sleep(100);
  const bad = await pg.evaluate(() => {
    const rgb = (c) => (c.match(/[\d.]+/g) || []).map(Number), lum = (c) => { const v = rgb(c).slice(0, 3).map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
    const bg = (e) => { while (e) { const c = getComputedStyle(e).backgroundColor, a = rgb(c)[3]; if (c && c !== 'transparent' && (a === undefined || a > 0.5)) return c; e = e.parentElement; } return 'rgb(11,18,32)'; };
    const out = []; document.querySelectorAll('#main *, .top *, .notice *, .tabs button').forEach((e) => { if (!e.offsetParent || ![...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) return; const a = lum(getComputedStyle(e).color), b = lum(bg(e)), r = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); if (r < 4.5) out.push(e.tagName + '.' + e.className + ' ' + r.toFixed(2) + ' "' + e.textContent.trim().slice(0, 30) + '"'); });
    return out; });
  ok(!bad.length, 'dark mode text contrast >= 4.5: ' + bad.slice(0, 8).join(' | ')); await v14('07-dark-form', true);
  await pg.evaluate(() => document.querySelector('#themeBtn').click());
  ok(!ext.length, 'no external requests ' + ext.join(' '));
  ok(!errs.length, 'no console errors: ' + errs.join(' | '));
  console.log('PASS', n, 'checks', MODE); await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
