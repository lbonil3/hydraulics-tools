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
  await tab('form'); const FC = await txt('#formCheck');
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
  ok(!ext.length, 'no external requests ' + ext.join(' '));
  ok(!errs.length, 'no console errors: ' + errs.join(' | '));
  console.log('PASS', n, 'checks', MODE); await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
