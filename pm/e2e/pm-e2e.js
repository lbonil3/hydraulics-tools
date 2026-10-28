// Headless-Chrome end-to-end test for Project Tracker v2 (testing mode, no login).
// Run from anywhere: node pm/e2e/pm-e2e.js [1440x900|1920x1080|iphone]
// Files are served from this checkout by request interception (no server). Set PM_BASE=https://.../pm/ to test a live site.
// Needs puppeteer-core and Chrome at /usr/bin/google-chrome.
let p; try { p = require('puppeteer-core'); } catch (e) { p = require('/workspace/e2e/node_modules/puppeteer-core'); }
const fs = require('fs');
const path = require('path');
const BASE = process.env.PM_BASE || 'https://pm.local/pm/' /* secure context so WebCrypto exists */;
const ROOT = path.resolve(__dirname, '../..');
const TYPES = { html: 'text/html', js: 'text/javascript', css: 'text/css', png: 'image/png', json: 'application/json' };
const SHOTS = '/workspace/pm-shots/';
const MODE = process.argv[2] || '1440x900';
const MOBILE = MODE === 'iphone';
const [VW, VH] = MOBILE ? [390, 844] : MODE.split('x').map(Number);
const DL = '/tmp/pmdl-' + MODE;
const tag = MOBILE ? 'iphone' : String(VW);
let n = 0, pg;
const ok = (c, m) => { if (!c) throw new Error('FAIL [' + MODE + ']: ' + m); n++; console.log('ok -', m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const txt = (sel) => pg.$eval(sel, (e) => e.innerText);
/* tree nodes can sit outside the visible pan area, so they are activated via DOM click (same handler as a mouse click) */
const click = async (sel) => { if (MOBILE || sel.startsWith('.node')) await pg.$eval(sel, (e) => e.click()); else { const el = await pg.$(sel); if (!el) throw new Error('no ' + sel); await el.click(); } await sleep(120); };
const typeInto = async (el, v) => { await el.evaluate((e) => { e.focus(); e.select(); }); await pg.keyboard.type(v); };
const setVal = (sel, v) => pg.$eval(sel, (e, v) => { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }, v);
const shot = (name, full) => pg.screenshot({ path: SHOTS + 'v2-' + name + '-' + tag + '.png', fullPage: !!full });
async function serve(r) {
  const u = r.url();
  if (/^(blob|data):/.test(u)) return r.continue();
  if (!u.startsWith(new URL(BASE).origin)) return r.abort();
  let f = decodeURIComponent(new URL(u).pathname);
  if (f.endsWith('/')) f += 'index.html';
  const fp = path.join(ROOT, f);
  if (!fp.startsWith(ROOT) || !fs.existsSync(fp)) return r.respond({ status: 404, body: 'not found' });
  r.respond({ status: 200, contentType: TYPES[fp.split('.').pop()] || 'application/octet-stream', body: fs.readFileSync(fp) });
}
(async () => {
  const b = await p.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  pg = await b.newPage();
  const errs = [], ext = [];
  pg.on('pageerror', (e) => errs.push(e.message));
  pg.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  if (!process.env.PM_BASE) await pg.setRequestInterception(true);
  pg.on('request', (r) => {
    const u = r.url();
    if (!u.startsWith(new URL(BASE).origin) && !/^(blob|data):/.test(u)) ext.push(u);
    if (!process.env.PM_BASE) serve(r);
  });
  pg.on('dialog', async (d) => { const m = d.message(); if (/staff name/i.test(m)) await d.accept('Maria Lopez'); else if (/Name this view/.test(m)) await d.accept('Maria open'); else await d.accept(); });
  fs.rmSync(DL, { recursive: true, force: true }); fs.mkdirSync(DL, { recursive: true });
  const cdp = await pg.target().createCDPSession();
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DL });
  await pg.setViewport({ width: VW, height: VH, deviceScaleFactor: MOBILE ? 3 : 1, isMobile: MOBILE, hasTouch: MOBILE });
  await pg.goto(BASE, { waitUntil: 'networkidle0' });
  await pg.evaluate(() => { localStorage.clear(); localStorage.setItem('pm.ui.v2', JSON.stringify({ theme: 'light' })); });
  await pg.reload({ waitUntil: 'networkidle0' });

  // 1. no login
  ok(!(await pg.$('input[type=password]')), 'no passphrase screen (testing mode)');
  ok(/Testing mode: data is NOT encrypted/.test(await txt('.testbar')), 'testing-mode banner shown');
  ok(/'self'/.test(await pg.$eval('meta[http-equiv="Content-Security-Policy"]', (e) => e.content)) && !!(await pg.$('meta[name=robots][content*=noindex]')), 'CSP + noindex retained');
  ok((await pg.$$('.node.n-sub')).length === 4 && !!(await pg.$('.node.n-root')), 'tree: project root + sub-projects A–D');
  ok(!(await pg.$('[role=tablist]')) && !(await pg.$('#nav')), 'no tab navigation');

  // 2. add segment via + on sub A, live PP count
  const subA = await pg.$$eval('.node.n-sub', (els) => els[0].dataset.key);
  await click('.node[data-key="' + subA + '"] .nbtn.add');
  await pg.waitForSelector('#addSegName');
  const form = '#drawer form.stack';
  const ins = async (vals) => { const f = await pg.$$(form + ' input'); for (let i = 0; i < vals.length; i++) await typeInto(f[i], vals[i]); };
  await ins(['Mainlane North', 'FM 1960', '10+00', '25+50']);
  const live = (await txt('#drawer .live')).replace(/\s+/g, ' ');
  ok(/1,550 ft/.test(live) && /= 4 PP/.test(live) && /2 Drainage Plan & Profile @100 \(1200 ft\/sh\)/.test(live), 'live PP count while editing: ' + live);
  const endIn = (await pg.$$(form + ' input'))[3];
  await typeInto(endIn, '22+00');
  ok(/1,200 ft/.test(await txt('#drawer .live')) && /= 2 PP/.test(await txt('#drawer .live')), '1,200 ft @100 = 1 sheet per series (live)');
  await typeInto(endIn, '25+50');
  await click(form + ' button[type=submit]');
  await pg.waitForSelector('#genBtn');
  ok(/Segment/i.test(await txt('#drawer .dkind')), 'drawer switched to new segment');
  await click('#genBtn');
  await sleep(300);
  const segKey = await pg.$$eval('.node.n-seg', (els) => els[0].dataset.key);
  const ppTitles = await pg.$$eval('.node.n-sheet .nt', (els) => els.map((e) => e.textContent));
  ok(ppTitles.includes('Drainage Plan & Profile – Sta 10+00 to 22+00 (PP 1 of 2)') && ppTitles.includes('Drainage Plan & Profile – Sta 22+00 to 25+50 (PP 2 of 2)') && ppTitles.filter((t) => /SWP3 Layout/.test(t)).length === 2, 'Generate PP sheets: numbered entries with correct station ranges');
  ok(await pg.$eval('#genBtn', (e) => e.disabled), 'regenerate is a no-op when up to date (idempotent)');
  await click('#drawer .box form.g2 button[type=submit]');
  await sleep(200);
  ok((await pg.$$('.node.n-sheet')).length === 14, 'standard (non-PP) set added: 4 PP + 10 = 14 sheets');
  const subB = await pg.$$eval('.node.n-sub', (els) => els[1].dataset.key);
  await click('.node[data-key="' + subB + '"] .nbtn.add');
  await pg.waitForSelector('#addSegName');
  await ins(['Cross Street Outfall', 'Kuykendahl Rd', '100+00', '104+81']);
  await pg.select(form + ' .scalepick select', '40');
  await sleep(100);
  ok(/481 ft/.test(await txt('#drawer .live')) && /= 4 PP/.test(await txt('#drawer .live')), '481 ft @40 (480 ft/sheet) = 2 per series');
  await click(form + ' button[type=submit]');
  await pg.waitForSelector('#genBtn');
  await click('#genBtn');
  await sleep(200);

  // 3. edit a sheet in the drawer
  const sheetKey = await pg.$$eval('.node.n-sheet', (els) => els[0].dataset.key);
  await click('.node[data-key="' + sheetKey + '"]');
  await pg.waitForSelector('#drawer .qc');
  await pg.select('#drawer .stsel', 'In progress');
  await sleep(150);
  const ownerSel = (await pg.$$('#drawer select'))[1];
  await ownerSel.select('__new');
  await sleep(250);
  await setVal('#drawer input[type=date]', '2026-01-15');
  await sleep(150);
  await pg.$$eval('#drawer .qc input', (els) => els[0].click());
  await sleep(150);
  ok(/In progress/.test(await txt('.node[data-key="' + sheetKey + '"]')) && /ML/.test(await txt('.node[data-key="' + sheetKey + '"] .av')), 'sheet node shows status + owner initials');
  ok(!!(await pg.$('.node[data-key="' + sheetKey + '"] .flag')), 'overdue flag on node');
  ok(/Overdue \(1\)/.test(await pg.$eval('#rail', (e) => e.textContent)), 'overview lists 1 overdue');

  // 4. search highlight + filter dims
  await pg.type('#q', 'kuykendahl'); await sleep(400);
  ok((await pg.$$('.node.hit')).length >= 1 && (await pg.$$('.node.dim')).length >= 4, 'search highlights matches and dims others');
  await pg.$eval('#q', (e) => { e.value = ''; e.dispatchEvent(new Event('input')); }); await sleep(300);
  await pg.select('#fDisc', 'SWP3'); await sleep(150);
  ok(await pg.$$eval('.node.n-sheet', (els) => els.filter((e) => e.classList.contains('d-dr')).every((e) => e.classList.contains('dim')) && els.filter((e) => e.classList.contains('d-sw')).every((e) => !e.classList.contains('dim'))), 'discipline filter dims Drainage sheets, keeps SWP3');
  await click('#zFit'); await sleep(450); await shot('tree-filter');
  await pg.select('#fDisc', ''); await sleep(100);
  await click('#drawer .dhead .ibtn'); await click('#zFit'); await sleep(450);
  await shot('tree');
  await click('.node[data-key="' + sheetKey + '"]');

  // 5. pan / zoom / fit / collapse
  const tf0 = await pg.$eval('#stage', (e) => e.style.transform);
  if (!MOBILE) { await pg.mouse.move(VW / 2, VH / 2); await pg.mouse.wheel({ deltaY: -400 }); await sleep(100); } else await click('#zIn');
  const tf1 = await pg.$eval('#stage', (e) => e.style.transform);
  ok(tf0 !== tf1, 'zoom changes transform');
  if (!MOBILE) {
    const vp = await pg.$eval('#viewport', (e) => { const r = e.getBoundingClientRect(); return { x: r.x + 40, y: r.y + r.height / 2 }; });
    await pg.mouse.move(vp.x, vp.y); await pg.mouse.down(); await pg.mouse.move(vp.x - 120, vp.y + 40, { steps: 5 }); await pg.mouse.up();
    ok((await pg.$eval('#stage', (e) => e.style.transform)) !== tf1, 'drag pans the tree');
  }
  await click('#zFit');
  const before = (await pg.$$('.node.n-sheet')).length;
  await click('.node[data-key="' + segKey + '"] .nbtn.tog');
  ok((await pg.$$('.node.n-sheet')).length < before, 'collapse a branch hides its sheets');
  await click('.node[data-key="' + segKey + '"] .nbtn.tog');
  ok((await pg.$$('.node.n-sheet')).length === before, 'expand restores it');
  await click('#zFit'); await sleep(450);
  await shot('tree-fit');

  // 6. list view
  await click('#vList');
  await pg.waitForSelector('table.grid tbody tr');
  ok((await pg.$$('table.grid tbody tr')).length === 18, 'list toggle shows all 18 sheets');
  ok(await pg.$eval('table.grid thead th', (e) => getComputedStyle(e).position === 'sticky'), 'sticky table header');
  const dueIdx = await pg.$$eval('table.grid thead th', (ths) => ths.findIndex((t) => /Due/.test(t.textContent)));
  await pg.$$eval('table.grid thead th .sort', (bs, i) => bs[i].click(), dueIdx); await sleep(100);
  ok((await pg.$eval('table.grid tbody tr input[type=date]', (e) => e.value)) === '2026-01-15', 'sort by due puts dated sheet first');
  ok(!!(await pg.$('table.grid thead th[aria-sort=ascending]')), 'aria-sort set');
  await click('.colmenu summary');
  await pg.$$eval('.colpop label', (ls) => ls.find((l) => /Hrs bud/.test(l.textContent)).querySelector('input').click());
  ok(!/Hrs bud/i.test(await txt('table.grid thead')), 'column hidden via Columns menu');
  await pg.$eval('.colmenu', (e) => { e.open = false; });
  await pg.select('table.grid tbody tr:nth-child(2) select.stsel', 'In review'); await sleep(150);
  ok((await pg.$eval('table.grid tbody tr:nth-child(2) select.stsel', (e) => e.value)) === 'In review', 'inline status edit in list');
  const pctInputs = await pg.$$('table.grid tbody td input.num');
  await pctInputs[0].focus(); await pg.keyboard.press('ArrowDown');
  ok(await pg.evaluate(() => document.activeElement.closest('tr') === document.querySelectorAll('table.grid tbody tr')[1] && document.activeElement.classList.contains('num')), 'ArrowDown moves to next row, same column');
  await pg.evaluate(() => document.querySelectorAll('table.grid tbody tr')[2].focus()); await pg.keyboard.press('Enter'); await sleep(150);
  ok(/Sheet/i.test(await txt('#drawer .dkind')), 'Enter on a row opens the sheet drawer');
  await pg.select('#fOwner', 'Maria Lopez'); await sleep(150);
  ok((await pg.$$('table.grid tbody tr')).length === 1, 'owner filter in list');
  await pg.$$eval('.listbar button', (bs) => bs.find((b) => b.textContent === 'Save view').click()); await sleep(150);
  await pg.select('#fOwner', ''); await sleep(150);
  await pg.$$eval('.listbar select', (ss) => { const s = ss.find((x) => x.getAttribute('aria-label') === 'Saved views'); s.value = [...s.options].find((o) => o.text === 'Maria open').value; s.dispatchEvent(new Event('change')); });
  await sleep(150);
  ok((await pg.$$('table.grid tbody tr')).length === 1, 'saved view restores filter');
  await pg.select('#fOwner', ''); await sleep(100);
  await shot('list');
  await pg.$$eval('.listbar button', (bs) => bs.find((b) => b.textContent === 'CSV (filtered)').click());
  await pg.$$eval('.listbar button', (bs) => bs.find((b) => b.textContent === 'PP summary CSV').click());
  await sleep(800);
  const files = fs.readdirSync(DL);
  const ppf = files.find((f) => f.startsWith('pm-pp-summary'));
  ok(files.some((f) => f.startsWith('pm-sheets')) && ppf && /Project total,,,,,2031,,,,,8/.test(fs.readFileSync(DL + '/' + ppf, 'utf8')), 'CSV exports: sheets + PP summary (8 PP total)');
  await click('#vTree');

  // 7. PP calculator what-if (not saved)
  await click('#ppBtn');
  await pg.waitForSelector('#ppWhatIf');
  ok((await txt('#ppWhatIf')) === '8', 'calculator total 8');
  await pg.$$eval('#modalBody select', (ss) => { ss[0].value = '50'; ss[0].dispatchEvent(new Event('change')); });
  await sleep(100);
  ok((await txt('#ppWhatIf')) === '10', 'what-if A at 50 scale → 10 (1,550/600 = 3 per series)');
  await shot('ppcalc');
  await click('#modalClose');
  await sleep(300);
  ok((await pg.evaluate(() => JSON.parse(localStorage.getItem('pm.data.v2')).subs[0].scale)) === 100, 'what-if not saved');

  // 8. editable scale table → counts + regenerate ranges
  await click('#setBtn');
  await shot('settings');
  await setVal('#modalBody input[aria-label="Feet per sheet at 100 scale"]', '800');
  await sleep(200);
  await click('#modalClose');
  ok(/4 PP @ 100/.test(await txt('.node[data-key="' + subA + '"]')), 'A still 4 PP at 800 ft/sheet (1,550 → 2 per series)');
  await click('.node[data-key="' + segKey + '"]'); await pg.waitForSelector('#genBtn');
  ok(!(await pg.$eval('#genBtn', (e) => e.disabled)), 'generate becomes available after scale-table change');
  await click('#genBtn'); await sleep(250);
  const t3 = await pg.$$eval('.node.n-sheet .nt', (els) => els.map((e) => e.textContent).filter((t) => /^Drainage Plan/.test(t)));
  ok(t3.includes('Drainage Plan & Profile – Sta 10+00 to 18+00 (PP 1 of 2)') && t3.includes('Drainage Plan & Profile – Sta 18+00 to 25+50 (PP 2 of 2)'), 'regenerate updates ranges: 10+00–18+00, 18+00–25+50 (last shorter)');
  ok(/In progress/.test(await txt('.node[data-key="' + sheetKey + '"]')), 'regenerate kept the edited PP sheet status/owner');

  // 9. dark mode
  await click('#themeBtn');
  ok((await pg.evaluate(() => document.documentElement.dataset.theme)) === 'dark', 'dark mode toggle');
  await click('#zFit'); await sleep(450);
  await shot('tree-dark');
  await click('#themeBtn');

  // 10. reload persists, plain store
  await sleep(300);
  await pg.reload({ waitUntil: 'networkidle0' });
  ok(!(await pg.$('input[type=password]')) && (await pg.$$('.node.n-seg')).length === 2, 'reload opens straight to data (no lock)');
  const keys = await pg.evaluate(() => Object.keys(localStorage).sort());
  ok(JSON.stringify(keys) === '["pm.data.v2","pm.ui.v2"]', 'storage keys: pm.data.v2 + pm.ui.v2 (' + keys + ')');

  // 11. backup export → clear → import
  await click('#setBtn'); await pg.waitForSelector('#exportBtn');
  await click('#exportBtn'); await sleep(800);
  const bk = fs.readdirSync(DL).find((f) => f.startsWith('pm-backup'));
  ok(bk && JSON.parse(fs.readFileSync(DL + '/' + bk, 'utf8')).fmt === 'pm-plain-backup', 'backup downloaded (plain JSON)');
  await click('#modalClose');
  await pg.evaluate(() => localStorage.removeItem('pm.data.v2'));
  await pg.reload({ waitUntil: 'networkidle0' });
  ok((await pg.$$('.node.n-seg')).length === 0, 'cleared → empty project');
  await click('#setBtn');
  await (await pg.$('#modalBody form.imp input[type=file]')).uploadFile(DL + '/' + bk);
  await click('#modalBody form.imp button[type=submit]');
  await pg.waitForFunction(() => document.querySelectorAll('.node.n-seg').length === 2, { timeout: 5000 });
  ok(true, 'import restored both segments');

  // 12. migration from encrypted v1 vault
  await pg.evaluate(async () => {
    const v1 = { schema: 1, project: { name: 'Old Encrypted Project' }, staff: ['Ana Ruiz'], settings: {}, lastBackup: null,
      subs: ['A', 'B', 'C', 'D'].map((code, i) => ({ id: 'o' + i, code, name: 'Sub-project ' + code, templates: [], segments: i ? [] : [{ id: 'og', name: 'Old Seg', road: 'SH 6', start: 1000, end: 3400, notes: '',
        sheets: [{ id: 'oh', title: 'Culvert Layout', discipline: 'Drainage', status: 'In review', owner: 'Ana Ruiz', due: '', notes: '' }] }] })) };
    const r = await PMCrypto.seal('old v1 passphrase', v1, 'vault');
    localStorage.setItem('pm.vault.v1', JSON.stringify(r.env));
    localStorage.removeItem('pm.data.v2');
  });
  ok(!/Old Seg|Culvert/.test(await pg.evaluate(() => localStorage.getItem('pm.vault.v1'))), 'v1 vault is ciphertext');
  await pg.reload({ waitUntil: 'networkidle0' });
  await pg.waitForSelector('#migPass');
  ok(/encrypted v1 data/.test(await txt('#modalTitle')), 'landing offers one-time v1 import');
  await shot('migrate');
  await pg.type('#migPass', 'wrong passphrase!');
  await click('#modalBody button[type=submit]');
  await pg.waitForFunction(() => /Wrong passphrase/.test(document.querySelector('#modalBody .err').textContent), { timeout: 15000 });
  ok(true, 'wrong v1 passphrase rejected gracefully');
  await pg.type('#migPass', 'old v1 passphrase');
  await click('#modalBody button[type=submit]');
  await pg.waitForFunction(() => document.querySelector('#modal').hidden, { timeout: 15000 });
  ok(/Old Encrypted Project/.test(await txt('#appTitle')) && (await pg.$$('.node.n-seg')).length === 1, 'v1 data migrated into plain store');
  const migrated = await pg.evaluate(() => JSON.parse(localStorage.getItem('pm.data.v2')));
  ok(migrated.schema === 2 && migrated.subs[0].segments[0].sheets[0].status === 'In review', 'migrated data saved as schema 2');
  ok(!(await pg.evaluate(() => JSON.stringify(localStorage))).includes('old v1 passphrase'), 'passphrase not stored');
  // restore the richer project for layout screenshots
  await click('#setBtn');
  await (await pg.$('#modalBody form.imp input[type=file]')).uploadFile(DL + '/' + bk);
  await click('#modalBody form.imp button[type=submit]');
  await pg.waitForFunction(() => document.querySelectorAll('.node.n-seg').length === 2, { timeout: 5000 });

  // 13. layout checks
  const node = await pg.$$eval('.node.n-seg', (e) => e[0].dataset.key);
  if (MOBILE) {
    ok((await pg.evaluate(() => document.documentElement.scrollWidth)) <= 390, 'no horizontal page overflow on iPhone');
    await click('#railBtn'); await sleep(400);
    await shot('overview');
    await click('#railBtn'); await sleep(350);
    await click('.node[data-key="' + node + '"]'); await sleep(300);
    await shot('drawer');
    const small = await pg.evaluate(() => [...document.querySelectorAll('.top button, .top select, .top input, #drawer button, #drawer select, #drawer input:not([type=checkbox])')].filter((e) => e.offsetParent && e.getBoundingClientRect().height < 40).length);
    ok(small === 0, 'tap targets ≥ 40px in toolbar and drawer (' + small + ')');
  } else {
    ok((await pg.$eval('#layout', (e) => getComputedStyle(e).gridTemplateColumns)).split(' ').length === 2, 'desktop: overview rail + main');
    await click('.node[data-key="' + node + '"]'); await sleep(300);
    ok((await pg.$eval('#layout', (e) => getComputedStyle(e).gridTemplateColumns)).split(' ').length === 3, 'desktop: right-side drawer column');
    await shot('drawer');
  }
  const unl = await pg.evaluate(() => [...document.querySelectorAll('input, select, textarea')].filter((e) => e.offsetParent && !e.labels?.length && !e.getAttribute('aria-label')).length);
  ok(unl === 0, 'all visible form controls labelled');
  ok(ext.length === 0, 'no external requests ' + ext.join(','));
  ok(errs.length === 0, 'no console/CSP errors ' + errs.join(' | '));
  console.log('E2E PASS [' + MODE + ']', n, 'checks');
  await b.close();
})().catch(async (e) => { console.error(e); try { await pg.screenshot({ path: '/tmp/pm-fail-' + MODE + '.png' }); } catch (x) { /* ignore */ } process.exit(1); });
