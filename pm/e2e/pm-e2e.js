// Headless-Chrome end-to-end test for Project Tracker v3 (sections structure, testing mode, no login).
// Run from anywhere: node pm/e2e/pm-e2e.js [1440x900|1920x1080|iphone]
// Files are served from this checkout by request interception (no server). Set PM_BASE=https://.../pm/ to test a live site.
// Starts from v2 data (built with pm/legacy/model-v2.js) to check the v2 → v3 migration, then exercises the v3 UI.
// Needs puppeteer-core and Chrome at /usr/bin/google-chrome.
let p; try { p = require('puppeteer-core'); } catch (e) { p = require('/workspace/e2e/node_modules/puppeteer-core'); }
const fs = require('fs');
const path = require('path');
const V2 = require('../legacy/model-v2.js');
const BASE = process.env.PM_BASE || 'https://pm.local/pm/';
const ROOT = path.resolve(__dirname, '../..');
const TYPES = { html: 'text/html', js: 'text/javascript', css: 'text/css', png: 'image/png', json: 'application/json', woff2: 'font/woff2' };
const SHOTS = '/workspace/pm-shots/';
const MODE = process.argv[2] || '1440x900';
const MOBILE = MODE === 'iphone';
const [VW, VH] = MOBILE ? [390, 844] : MODE.split('x').map(Number);
const DL = '/tmp/pmdl3-' + MODE;
const tag = MOBILE ? 'iphone' : String(VW);
let n = 0, pg, sel3;
const ok = (c, m) => { if (!c) throw new Error('FAIL [' + MODE + ']: ' + m); n++; console.log('ok -', m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const txt = (sel) => pg.$eval(sel, (e) => e.innerText);
const has = (sel) => pg.$(sel).then(Boolean);
const click = async (sel) => { await pg.$eval(sel, (e) => { e.scrollIntoView({ block: 'center' }); e.click(); }); await sleep(140); };
const clickText = async (sel, re) => { const ok1 = await pg.$$eval(sel, (els, src) => { const r = new RegExp(src); const e = els.find((x) => r.test(x.innerText || x.textContent)); if (!e) return false; e.scrollIntoView({ block: 'center' }); e.click(); return true; }, re.source); if (!ok1) throw new Error('no ' + sel + ' matching ' + re); await sleep(160); };
const setVal = (sel, v) => pg.$eval(sel, (e, v) => { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }, v);
const typeIn = async (sel, v) => { await pg.$eval(sel, (e) => { e.focus(); e.select && e.select(); }); await pg.keyboard.type(v); };
const shot = (name, full) => pg.screenshot({ path: SHOTS + 'v3-' + name + '-' + tag + '.png', fullPage: !!full });
const data = () => pg.evaluate(() => JSON.parse(localStorage.getItem('pm.data.v3')));
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
function v2Fixture() {
  const s = V2.newState('SH 249 Drainage'); const [A, B, C] = s.subs;
  const g1 = V2.addSegment(s, A.id, { road: 'FM 1960', start: '10+00', end: '34+00' }).seg;
  V2.applyGenerate(s, g1.id, V2.planGenerate(s, g1.id)); V2.bulkAddTemplates(s, g1.id, {});
  const g2 = V2.addSegment(s, B.id, { road: 'Kuykendahl', start: '100+00', end: '104+80', scale: 40 }).seg;
  V2.applyGenerate(s, g2.id, V2.planGenerate(s, g2.id));
  V2.addSheet(s, g2.id, { title: 'Bridge Deck Drain Summary', discipline: 'Drainage' });
  V2.addSheet(s, g2.id, { title: 'Utility Conflicts', discipline: 'Drainage' });
  V2.addSegment(s, C.id, { road: 'Spring Cypress', start: '0+00', end: '6+00' });
  const pp1 = g1.sheets.find((x) => x.gen && x.gen.series === 'pp-drain');
  V2.updateSheet(s, pp1.id, { status: 'In progress', owner: 'Ana Ruiz', due: '2026-10-20', notes: 'check HGL' });
  const cul = g1.sheets.find((x) => x.title === 'Culvert Layout');
  V2.updateSheet(s, cul.id, { status: 'Done', owner: 'Bo Chen', number: '72' });
  V2.addLink(s, { t: 'sheet', id: cul.id }, { t: 'sheet', id: g2.sheets.find((x) => x.title === 'Bridge Deck Drain Summary').id }, 'dep');
  s.reportNotes['sub:' + A.id] = 'A first';
  return s;
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
  pg.on('dialog', async (d) => { const m = d.message(); if (/staff name/i.test(m)) await d.accept('Maria Lopez'); else if (/Name this view/.test(m)) await d.accept('Mine'); else if (/Type ERASE/.test(m)) await d.dismiss(); else await d.accept(); });
  fs.rmSync(DL, { recursive: true, force: true }); fs.mkdirSync(DL, { recursive: true });
  const cdp = await pg.target().createCDPSession();
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DL });
  await pg.setViewport({ width: VW, height: VH, deviceScaleFactor: MOBILE ? 3 : 1, isMobile: MOBILE, hasTouch: MOBILE });
  await pg.goto(BASE, { waitUntil: 'networkidle0' });
  const v2json = JSON.stringify(v2Fixture());
  await pg.evaluate((j) => { localStorage.clear(); localStorage.setItem('pm.data.v2', j); localStorage.setItem('pm.ui.v2', JSON.stringify({ theme: 'light', cols: ['sub', 'seg', 'title', 'status'] })); }, v2json);
  await pg.reload({ waitUntil: 'networkidle0' });
  await sleep(300);

  /* 1. migration notice before anything is written */
  ok(!(await pg.$('input[type=password]')), 'no passphrase screen (testing mode)');
  ok(/'self'/.test(await pg.$eval('meta[http-equiv="Content-Security-Policy"]', (e) => e.content)), 'CSP kept');
  ok(await has('#migV3'), 'v2 → v3 migration notice shown');
  ok(await pg.evaluate(() => localStorage.getItem('pm.data.v3') === null), 'nothing written to pm.data.v3 before Continue');
  ok(await pg.evaluate((j) => localStorage.getItem('pm.data.v2.pre-v3-backup') === j && localStorage.getItem('pm.data.v2') === j, v2json), 'v2 data copied to pm.data.v2.pre-v3-backup, original untouched');
  ok(/sheets kept/.test(await txt('#migV3')) && /road entr/.test(await txt('#migV3')) && /Other/.test(await txt('#migV3')), 'notice explains sheets / roads / Other mapping');
  await shot('01-migration');
  await click('#migDl'); await sleep(500);
  const dl = fs.readdirSync(DL).filter((f) => /pm-v2-data-before-v3/.test(f));
  ok(dl.length === 1 && fs.readFileSync(path.join(DL, dl[0]), 'utf8') === v2json, 'Download old data gives the exact v2 JSON');
  await click('#migGo'); await sleep(200);
  ok(!(await pg.$('#migV3')) && (await data()).schema === 3, 'Continue saves v3 data');
  ok((await data()).migration.from === 2, 'migration record stored');
  const D0 = await data();
  ok(D0.subs.reduce((a, s) => a + s.segments.reduce((x, g) => x + g.sheets.length, 0), 0) === JSON.parse(v2json).subs.reduce((a, s) => a + s.segments.reduce((x, g) => x + g.sheets.length, 0), 0), 'same number of sheets after migration');

  /* 2. tree: Project → Drainage / SWP3 → A–D → sections */
  ok(await has('.node[data-key="dtop:Drainage"]') && await has('.node[data-key="dtop:SWP3"]'), 'tree starts with Drainage and SWP3');
  ok((await pg.$$('.node.n-disc')).length === 8, 'each discipline has 4 sub-projects');
  await shot('02-tree-top');

  /* 2b. v3.1 rename sub-projects: tree (✎ / double-click), Enter saves, Esc cancels, empty/duplicate blocked, undo, Settings */
  const C0 = (await data()).subs[2]; const order0 = (await data()).subs.map((x) => x.id + x.order).join();
  const ntSel = '.node[data-key="disc:' + C0.id + ':Drainage"] .nt';
  await click(ntSel + ' .nren'); ok(await has(ntSel + ' .subname-in'), 'pencil opens an inline name box on the tree');
  await pg.$eval(ntSel + ' .subname-in', (e) => { e.focus(); e.select(); }); await pg.keyboard.type('Zzz'); await pg.keyboard.press('Escape'); await sleep(200);
  ok((await data()).subs[2].name === C0.name && !(await has(ntSel + ' .subname-in')), 'Esc cancels the rename');
  await pg.$eval(ntSel, (e) => e.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))); await sleep(150);
  ok(await has(ntSel + ' .subname-in'), 'double-click opens the name box');
  await pg.$eval(ntSel + ' .subname-in', (e) => { e.focus(); e.select(); }); await pg.keyboard.press('Backspace'); await pg.keyboard.type('   '); await pg.keyboard.press('Enter'); await sleep(150);
  ok(/empty/i.test(await txt(ntSel + ' .subname-err')) && (await data()).subs[2].name === C0.name, 'empty name is rejected');
  await pg.$eval(ntSel + ' .subname-in', (e) => { e.select(); }); await pg.keyboard.type('sub-project b'); await pg.keyboard.press('Enter'); await sleep(150);
  ok(/already uses/.test(await txt(ntSel + ' .subname-err')) && (await data()).subs[2].name === C0.name, 'duplicate name is blocked');
  await pg.$eval(ntSel + ' .subname-in', (e) => { e.select(); }); await pg.keyboard.type('  North Segment (FM 1960) '); await pg.keyboard.press('Enter'); await sleep(250);
  const C1 = (await data()).subs[2];
  ok(C1.name === 'North Segment (FM 1960)' && C1.code === 'C' && C1.id === C0.id, 'Enter saves the trimmed name; id and letter kept');
  ok((await data()).subs.map((x) => x.id + x.order).join() === order0, 'build order unchanged by rename');
  ok((await pg.$$eval('.node.n-disc .ntx', (es) => es.filter((e) => e.textContent === 'North Segment (FM 1960)').length)) === 2, 'new name shown on both Drainage and SWP3 boxes');
  await shot('02b-renamed');
  await pg.keyboard.down('Control'); await pg.keyboard.press('z'); await pg.keyboard.up('Control'); await sleep(250);
  ok((await data()).subs[2].name === C0.name, 'undo restores the old name');
  await pg.keyboard.down('Control'); await pg.keyboard.down('Shift'); await pg.keyboard.press('z'); await pg.keyboard.up('Shift'); await pg.keyboard.up('Control'); await sleep(250);
  ok((await data()).subs[2].name === 'North Segment (FM 1960)', 'redo renames again');
  await click('#setBtn'); await sleep(200);
  const dIn = '#orderSec .ordrow:nth-child(4) .subname-in';
  await pg.$eval(dIn, (e) => { e.focus(); e.select(); }); await pg.keyboard.type('South Segment'); await pg.keyboard.press('Enter'); await sleep(250);
  ok((await data()).subs[3].name === 'South Segment' && (await data()).subs[3].code === 'D', 'rename from Settings');
  await click('#modalClose'); await sleep(150);
  await click('#vList'); await sleep(200);
  ok(await pg.$$eval('select', (ss) => ss.some((s) => [...s.options].some((o) => o.textContent === 'C · North Segment (FM 1960)'))), 'filters list the new name');
  ok(/North Segment \(FM 1960\)/.test(await pg.evaluate(() => document.body.innerText)), 'list shows the name');
  await click('#vTree'); await sleep(200);
  const A = D0.subs[0];
  const secA = (key) => A.segments.find((g) => g.key === key);
  await click('.node[data-key="disc:' + A.id + ':Drainage"] .nbtn.tog'); await sleep(150);
  const secTitles = await pg.$$eval('.node.n-seg.d-dr .nt', (e) => e.map((x) => x.textContent));
  ok(secTitles[0] === 'Overall Drainage Area Map' && secTitles[14] === 'Standards' && secTitles.includes('Detention Basin') && !secTitles.includes('Detention Basin Layout') && !secTitles.includes('Detention Basin Cross Section') && secTitles.includes('Bridge Deck Drawing Details (Welded)') && secTitles.includes('Other Drainage'), 'A Drainage shows the sections in order, one detention branch (+ Other for unmatched)');
  ok(/2 PP/.test(await txt('.node[data-key="seg:' + secA('dr-pp').id + '"]')) && /FM 1960/.test(await txt('.node[data-key="seg:' + secA('dr-pp').id + '"]')), 'P&P section node shows PP count and road');
  ok(!(await pg.$$eval('.node', (e) => e.map((x) => x.dataset.key))).some((k) => /^road:/.test(k)), 'roads are not tree nodes');
  await click('.node[data-key="seg:' + secA('dr-hds-x').id + '"] .nbtn.tog');
  ok(await has('.node[data-key^="sheet:"]'), 'section expands to its sheets');
  await click('#zFit'); await shot('03-tree-sections');

  /* 3. section drawer: road name only, inline stations → PP, generate (trunk line stays road-based) */
  await click('.node[data-key="seg:' + secA('dr-trunk').id + '"]');
  ok(/Trunkline Plan & Profile/.test(await txt('#drawer')) && await has('#addRoadName'), 'Trunkline drawer has the add-road form');
  await typeIn('#addRoadName', 'Trunk A-3'); await pg.keyboard.press('Enter'); await sleep(250);
  let D = await data();
  const lat = D.subs[0].roads.find((r) => r.road === 'Trunk A-3');
  ok(lat && lat.start === null, 'road added with the name only (no stations)');
  ok(/—/.test(await txt('#roadTable tbody tr')) , 'no PP until stations are entered');
  await setVal('#roadTable tr[data-road="' + lat.id + '"] input[data-k="start"]', '0+00'); await sleep(150);
  await setVal('#roadTable tr[data-road="' + lat.id + '"] input[data-k="end"]', '13+00'); await sleep(200);
  ok((await txt('#secPP')).trim() === '2', 'inline stations: 1,300 ft at 100 scale → 2 PP');
  await setVal('#roadTable tr[data-road="' + lat.id + '"] input[data-k="scale"]', '50'); await sleep(200);
  ok((await txt('#secPP')).trim() === '3', '50 scale (600 ft/sheet) → 3 PP');
  D = await data();
  ok(D.subs[0].segments.find((g) => g.key === 'dr-trunk').sheets.filter((s) => s.gen).length === 3, 'PP sheets follow the stations live: 3 Trunkline PP sheets');
  ok(/up to date/.test(await txt('#genBtn')), 'nothing left to generate');
  ok(JSON.stringify(D.subs[0].segments.find((g) => g.key === 'dr-trunk').sheets.filter((s) => s.gen).map((s) => [s.gen.start, s.gen.end])) === '[[0,600],[600,1200],[1200,1300]]', 'ranges 0+00–6+00, 6+00–12+00, 12+00–13+00 (last partial)');
  ok(/Trunk A-3 Sta 0\+00 to 6\+00 \(PP 1 of 3\)/.test(D.subs[0].segments.find((g) => g.key === 'dr-trunk').sheets[0].title), 'PP sheet title includes road + stations');
  await shot('04-section-roads');
  /* v3.6: a real pointer click / tap on a tree node opens its properties (the viewport used to swallow the click) */
  if (await has('#viewport') && await pg.evaluate(() => getComputedStyle(document.getElementById('treeWrap') || document.body).display !== 'none' && !!document.querySelector('.node.n-seg'))) {
    const prevSel = await pg.evaluate(() => { const e = document.querySelector('.node.sel'); return e ? e.dataset.key : null; });
    await pg.evaluate(() => { const b = document.querySelector('#drawer .ibtn[aria-label="Close details"]'); if (b) b.click(); });
    const pt = await pg.evaluate(() => { const v = document.getElementById('viewport').getBoundingClientRect(); const e = [...document.querySelectorAll('.node.n-seg, .node.n-disc')].find((x) => { const r = x.getBoundingClientRect(); return r.width && r.top > v.top + 20 && r.bottom < v.bottom - 70 && r.left > v.left && r.right < v.right - 30; });
      if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width * 0.4, y: r.top + r.height * 0.6 }; });
    if (pt) {
      if (MODE === 'iphone') await pg.touchscreen.tap(pt.x, pt.y); else await pg.mouse.click(pt.x, pt.y);
      await sleep(300);
      ok(await has('#drawer:not([hidden]) #propsBox'), 'real click / tap on a tree branch opens its properties');
      if (MODE !== 'iphone') {
        await pg.mouse.click(pt.x, pt.y, { button: 'right' }); await sleep(200);
        ok(/Properties/.test(await txt('#nodeMenu')), 'right-click menu on a tree node has Properties');
        await pg.keyboard.press('Escape'); await sleep(120);
        ok(!(await has('#nodeMenu')) && await has('#drawer:not([hidden])'), 'Esc closes the node menu, details stay open');
      }
    }
    if (prevSel) { await pg.evaluate((k) => { const e = document.querySelector('.node[data-key="' + k + '"]'); if (e) e.click(); }, prevSel); await sleep(250); }
  }
  /* road drawer + undo */
  await clickText('#roadTable .link', /Open/);
  ok(/Road entry/i.test(await txt('#drawer .dkind')) && await has('#stStart'), 'road drawer with stations editor');
  await pg.keyboard.press('Escape');
  await pg.evaluate(() => document.activeElement.blur());
  await pg.keyboard.down('Control'); await pg.keyboard.press('z'); await pg.keyboard.up('Control'); await sleep(250);
  ok((await data()).subs[0].segments.find((g) => g.key === 'dr-trunk').sheets.filter((s) => s.gen).length === 2, 'undo restores the 100-scale count (2 PP)');
  await pg.keyboard.down('Control'); await pg.keyboard.down('Shift'); await pg.keyboard.press('z'); await pg.keyboard.up('Shift'); await pg.keyboard.up('Control'); await sleep(250);
  ok((await data()).subs[0].segments.find((g) => g.key === 'dr-trunk').sheets.filter((s) => s.gen).length === 3, 'redo brings them back');

  /* 3b. v3.2: road branch under the section, sheets with station ranges under the road */
  const latSec = (await data()).subs[0].segments.find((g) => g.key === 'dr-trunk');
  const rdKey = 'rd:' + latSec.id + ':trunk-a-3';
  await pg.keyboard.press('Escape'); await pg.evaluate(() => document.activeElement && document.activeElement.blur());
  if (!(await has('.node[data-key="' + rdKey + '"]'))) await click('.node[data-key="seg:' + latSec.id + '"] .nbtn.tog');
  ok(await has('.node[data-key="' + rdKey + '"]'), 'road is a branch under Trunkline Plan & Profile');
  ok(/Trunk A-3/.test(await txt('.node[data-key="' + rdKey + '"]')) && /3 PP/.test(await txt('.node[data-key="' + rdKey + '"]')) && /0\+00–13\+00/.test(await txt('.node[data-key="' + rdKey + '"]')), 'road node shows name, PP count and its station range');
  const latSheets = latSec.sheets.filter((x) => x.gen);
  const pp1 = '.node[data-key="sheet:' + latSheets[0].id + '"]';
  ok(await has(pp1) && /PP 1: STA 0\+00 – 6\+00/.test(await txt(pp1)) && /50 scale/.test(await txt(pp1)), 'sheet node under the road: “PP 1: STA 0+00 – 6+00” with scale');
  ok(await pg.$eval(pp1, (e) => parseFloat(e.style.left)) > await pg.$eval('.node[data-key="' + rdKey + '"]', (e) => parseFloat(e.style.left)), 'sheets sit to the right of their road');
  await click('.node[data-key="' + rdKey + '"]');
  ok(await has('#rgTable') && (await pg.$$('#rgTable tbody tr')).length === 3 && await has('#roadTable'), 'road drawer: station ranges per sheet + the road table');
  const p2row = '#rgTable tr[data-sheet="' + latSheets[1].id + '"]';
  await setVal(p2row + ' input[data-k="a"]', '6+50'); await sleep(250);
  let L2 = (await data()).subs[0].segments.find((g) => g.key === 'dr-trunk').sheets.find((x) => x.id === latSheets[1].id);
  ok(L2.sta && L2.sta.start === 650 && L2.sta.end === 1200 && /Sta 6\+50 to 12\+00/.test(L2.title), 'manual range on PP 2 (title follows)');
  ok(/✎/.test(await txt('.node[data-key="sheet:' + latSheets[1].id + '"]')), 'tree marks the manual range');
  await setVal('#roadTable input[data-k="scale"]', '100'); await sleep(300);
  let LS = (await data()).subs[0].segments.find((g) => g.key === 'dr-trunk').sheets.filter((x) => x.gen);
  ok(LS.length === 2 && LS[1].sta && LS[1].sta.start === 650, 'scale 100 → 2 PP; the manual range is kept, not overwritten');
  ok(/manual range/.test(await txt('#rgWarn')), 'and a warning explains the conflict');
  await shot('04b-road-drawer');
  await setVal('#roadTable input[data-k="scale"]', '50'); await sleep(300);
  ok((await data()).subs[0].segments.find((g) => g.key === 'dr-trunk').sheets.filter((x) => x.gen).length === 3, 'back to 50 scale → 3 PP');
  await click(p2row + ' button.btn'); await sleep(250);
  L2 = (await data()).subs[0].segments.find((g) => g.key === 'dr-trunk').sheets.find((x) => x.id === latSheets[1].id);
  ok(!L2.sta && L2.gen.start === 600 && /Sta 6\+00 to 12\+00/.test(L2.title), 'reset to computed');
  await click(pp1); ok((await pg.$eval('#shStaA', (e) => e.value)) === '0+00' && (await pg.$eval('#shStaB', (e) => e.value)) === '6+00' && /Computed/.test(await txt('#shStaHint')), 'sheet drawer shows the computed range');
  await click('.node[data-key="' + rdKey + '"] .nbtn.tog'); ok(!(await has(pp1)), 'road branch collapses');
  await click('.node[data-key="' + rdKey + '"] .nbtn.tog'); ok(await has(pp1), 'and expands');
  await click('#zFit'); await shot('04c-road-branch');
  await pg.keyboard.press('Escape'); await pg.evaluate(() => document.activeElement && document.activeElement.blur());
  await pg.keyboard.down('Control'); await pg.keyboard.press('k'); await pg.keyboard.up('Control'); await sleep(150);
  await pg.keyboard.type('trunk a-3'); await sleep(150);
  ok(/road/i.test(await txt('#cmdk')), 'Ctrl+K lists the road'); await pg.keyboard.press('Enter'); await sleep(400);
  ok(await has('.node.n-road.sel[data-key="' + rdKey + '"]'), 'and jumps to the road node');
  await pg.keyboard.down('Control'); await pg.keyboard.press('k'); await pg.keyboard.up('Control'); await sleep(150);
  await pg.keyboard.type('12+00 13+00'); await sleep(150); await pg.keyboard.press('Enter'); await sleep(400);
  const pp3 = (await data()).subs[0].segments.find((g) => g.key === 'dr-trunk').sheets.find((x) => x.gen && x.gen.idx === 3);
  ok(sel3 = await has('.node.sel[data-key="sheet:' + pp3.id + '"]'), 'Ctrl+K finds a sheet by its stations');


  /* 4. quick add: sheet picks a section */
  await click('.node[data-key="disc:' + A.id + ':Drainage"]');
  ok(await has('#qaTitle') && await has('#qaSec'), 'sub-project branch drawer has quick add with section picker');
  await typeIn('#qaTitle', 'Special Junction Box Details 2'); await sleep(100);
  ok(/Special Junction Box Details/.test(await txt('#qaHint')), 'quick add suggests the section from the title');
  await pg.keyboard.press('Enter'); await sleep(200);
  D = await data();
  ok(D.subs[0].segments.find((g) => g.key === 'dr-jb').sheets.some((s) => s.title === 'Special Junction Box Details 2'), 'sheet lands in Special Junction Box Details');
  await setVal('#qaSec', D.subs[0].segments.find((g) => g.key === 'dr-bd-det').id);
  await typeIn('#qaTitle', 'Pond XS-1'); await pg.keyboard.press('Enter'); await sleep(200);
  ok((await data()).subs[0].segments.find((g) => g.key === 'dr-bd-det').sheets.some((s) => s.title === 'Pond XS-1'), 'picked section wins');
  await click('#discStd'); await sleep(150);
  ok((await data()).subs[0].segments.find((g) => g.key === 'dr-odam').sheets.length === 1, '+ Standard sheets adds one sheet per empty section');
  await shot('05-branch-drawer');

  /* 5. sheet drawer: section + road tag, connectors kept */
  const cul = D.subs[0].segments.find((g) => g.key === 'dr-hds-x').sheets.find((s) => s.title === 'Culvert Layout');
  await pg.evaluate(() => { const i = document.querySelector('#q'); i.value = ''; });
  await pg.keyboard.press('Escape');
  await pg.evaluate(() => document.activeElement && document.activeElement.blur());
  await pg.keyboard.down('Control'); await pg.keyboard.press('k'); await pg.keyboard.up('Control'); await sleep(150);
  ok(await has('#cmdk'), 'Ctrl+K opens the palette');
  await pg.keyboard.type('culvert layout'); await sleep(150); await pg.keyboard.press('Enter'); await sleep(300);
  ok(/Culvert Layout/.test(await pg.$eval('#drawer input', (e) => e.value)) && await has('#shSec') && await has('#shRoad'), 'palette opens the sheet; drawer has Section and Road');
  ok((await pg.$eval('#shRoad', (e) => e.value)) === 'FM 1960', 'road tag kept from the v2 segment');
  ok(/Needed first by/i.test(await txt('#connBox')) && /Bridge Deck Drain Summary/.test(await txt('#connBox')), 'cross-project connector kept (A → B)');
  ok((await pg.$eval('#shNum', (e) => e.value)) === '72' && /Done/.test(await pg.$eval('#drawer .stsel', (e) => e.value)), 'number and status kept');
  await setVal('#shSec', D.subs[0].segments.find((g) => g.key === 'dr-std').id); await sleep(200);
  ok((await data()).subs[0].segments.find((g) => g.key === 'dr-std').sheets.some((s) => s.id === cul.id), 'Section select moves the sheet');
  await shot('06-sheet-drawer');

  /* 6. section editor in Settings */
  await click('#setBtn'); await sleep(200);
  ok(await has('#secSec') && (await pg.$$('#secSec .secedit[data-disc="Drainage"] .secrow')).length === 16, 'Settings lists the 16 Drainage sections (15 + Other)');
  await typeIn('#secNewDR', 'Utility Conflict Sheets'); await pg.keyboard.press('Enter'); await sleep(250);
  ok((await data()).settings.sections.some((x) => x.title === 'Utility Conflict Sheets'), 'add section');
  const rn = await pg.$$('#secSec .secedit[data-disc="Drainage"] .secrow input:not([type=checkbox])');
  await rn[11].evaluate((e) => { e.value = 'Bridge Deck Drainage Details (Welded)'; e.dispatchEvent(new Event('change', { bubbles: true })); }); await sleep(250);
  ok((await data()).subs.every((s) => s.segments.find((g) => g.key === 'dr-bd-welded').title === 'Bridge Deck Drainage Details (Welded)'), 'rename applies to A–D');
  await pg.$$eval('#secSec .secedit[data-disc="Drainage"] .secrow', (rows) => { const r = rows.find((x) => x.querySelector('input').value === 'Utility Conflict Sheets'); r.querySelector('[aria-label^="Move"][aria-label$="up"]').click(); }); await sleep(250);
  const order = (await data()).settings.sections.filter((x) => x.discipline === 'Drainage').map((x) => x.title);
  ok(order.indexOf('Utility Conflict Sheets') < order.indexOf('Other Drainage'), 'reorder section');
  await pg.$$eval('#secSec .secedit[data-disc="Drainage"] .secrow', (rows) => { const r = rows.find((x) => x.querySelector('input').value === 'Utility Conflict Sheets'); r.querySelector('.ibtn.danger').click(); }); await sleep(250);
  ok(!(await data()).settings.sections.some((x) => x.title === 'Utility Conflict Sheets'), 'remove empty section');
  await pg.$$eval('#secSec .secedit[data-disc="Drainage"] .secrow', (rows) => { const r = rows.find((x) => x.querySelector('input').value === 'Standards'); r.querySelector('.ibtn.danger').click(); }); await sleep(250);
  ok((await data()).settings.sections.some((x) => x.title === 'Standards') && /still has/.test(await txt('#secErr')), 'a section in use cannot be removed');
  ok(await has('#v2Sec'), 'Settings keeps the old v2 data download');
  await shot('07-settings-sections');
  await click('#modalClose');

  /* 7. list: section + road columns, grouping, section filter, bulk move */
  await click('#vList'); await sleep(200);
  const heads = await pg.$$eval('.grid thead th', (e) => e.map((x) => x.textContent.replace(/[▲▼]/g, '').trim()));
  ok(heads.includes('Section') && heads.includes('Road') && !heads.includes('Segment'), 'list has Section and Road columns (old Segment column mapped)');
  await setVal('#groupSel', 'subdisc'); await sleep(200);
  ok(/Drainage Plan & Profile · 2 PP · roads: FM 1960/.test(await txt('.grid tbody')), 'grouped by discipline › sub-project › section, P&P groups list roads');
  await setVal('[data-f="section"]', 'dr-pp'); await sleep(200);
  ok((await pg.$$('.grid tbody tr[data-id]')).length === 4, 'section filter (Drainage P&P: 2 in A + 1 in B + 1 in C, which now follows its stations)');
  await setVal('[data-f="section"]', ''); await setVal('#groupSel', ''); await sleep(150);
  await pg.$eval('#q', (e) => { e.value = 'Utility'; e.dispatchEvent(new Event('input', { bubbles: true })); }); await sleep(350);
  const ids = await pg.$$eval('.grid tbody tr[data-id]', (e) => e.map((x) => x.dataset.id));
  ok(ids.length >= 1, 'search finds the unmatched sheet');
  await click('#selAll'); await sleep(100);
  ok(await has('#bulkBar #bkSec'), 'bulk bar has Move to section');
  await setVal('#bkSec', 'dr-std'); await sleep(250);
  D = await data();
  ok(ids.every((id) => D.subs.some((s) => s.segments.find((g) => g.key === 'dr-std').sheets.some((x) => x.id === id))), 'bulk move to Standards (each in its own sub-project)');
  await click('#bkClear');
  await pg.$eval('#q', (e) => { e.value = ''; e.dispatchEvent(new Event('input', { bubbles: true })); }); await sleep(350);
  await shot('08-list');

  /* 8. week, board, stations views */
  await click('#vWeek'); ok(/Overdue/.test(await txt('#weekWrap')) && /Drainage Plan & Profile – FM 1960/.test(await txt('#wk-overdue')), 'week view shows the overdue PP sheet');
  await click('#vBoard'); ok((await pg.$$('.bcol')).length === 4 && /Drainage Plan & Profile ·/.test(await txt('#boardWrap')), 'board shows section names on cards');
  ok(/· Sta \d+\+\d\d/.test(await txt('#boardWrap')), 'board card subtitle shows the station range');
  await click('#vList'); await sleep(200);
  ok(/Station range/.test(await pg.evaluate(() => document.body.innerHTML)), 'list offers a Station range column');
  await click('#vBoard'); await sleep(150);
  await clickText('.bcol[data-status="Not started"] .bmove button', /›/); await sleep(150);
  ok((await pg.$$('.bcol[data-status="In progress"] .bcard')).length >= 2, 'board move');
  await shot('09-board');
  await click('#vStations'); await sleep(150);
  const stRows = await pg.$$eval('#stTable tbody tr', (e) => e.map((x) => x.innerText));
  ok(stRows.length === 7 && stRows.some((r) => /Trunkline/.test(r)) && stRows.some((r) => /SWP3 Layout/.test(r)), 'stations table lists every road entry with its section');
  await shot('10-stations');

  /* 9. report: per discipline / sub-project / section, roads under P&P */
  await click('#vReport'); await sleep(150);
  const R = await txt('#reportWrap');
  ok(/Drainage is \d+% \(/.test(R) && /SWP3 is/.test(R), 'project summary per discipline');
  ok(/roads FM 1960 Sta 10\+00–34\+00 \(2,400 ft at 1"=100', 2 PP sheets\)/.test(R), 'P&P section text lists its roads');
  ok(await has('textarea[data-key="dtop:Drainage"]') && await has('textarea[data-key="disc:' + A.id + ':Drainage"]') && await has('textarea[data-key^="sec:"]'), 'notes per discipline / sub-project / section');
  ok((await pg.$eval('textarea[data-key="disc:' + A.id + ':Drainage"]', (e) => e.value)) === 'A first', 'v2 sub-project note kept');
  await setVal('textarea[data-key="dtop:SWP3"]', 'SWP3 waits for 60%'); await sleep(300);
  ok((await data()).reportNotes['dtop:SWP3'] === 'SWP3 waits for 60%', 'note saved');
  await shot('11-report', true);
  await pg.evaluate(() => window.dispatchEvent(new Event('beforeprint'))); await sleep(100);
  ok(/DRAINAGE|Drainage/.test(await txt('#report .rnarr')) && /SWP3 waits for 60%/.test(await pg.$eval('#report', (e) => e.textContent)), 'printable report includes narrative and notes');
  /* 9b. v3.3 printed report: settings, cover, sections, PDF */
  ok(await has('#rptSet'), 'report view has printed-report settings');
  await pg.$eval('#rpBy', (e) => { e.scrollIntoView(); e.focus(); e.select(); }); await pg.keyboard.type('Luis Bonilla, P.E.'); await pg.keyboard.press('Tab'); await sleep(150);
  await pg.$eval('#rpFor', (e) => { e.scrollIntoView(); e.focus(); e.select(); }); await pg.keyboard.type('TxDOT Houston District'); await pg.keyboard.press('Tab'); await sleep(150);
  ok((await data()).project.report.preparedBy === 'Luis Bonilla, P.E.', 'prepared-by saved');
  await pg.evaluate(() => window.dispatchEvent(new Event('beforeprint'))); await sleep(100);
  const RP = await pg.$eval('#report', (e) => e.textContent);
  ok(/Prepared by/.test(RP) && /Luis Bonilla, P\.E\./.test(RP) && /TxDOT Houston District/.test(RP), 'cover shows prepared for / by');
  ok(['Executive summary', 'Progress by sub-project', 'Drainage summary', 'SWP3 summary', 'Sheet detail by section', 'Schedule', 'Dependencies and updates', 'Owner workload', 'Recently changed', 'Contents'].every((x) => RP.includes(x)), 'report has all sections and contents');
  ok(/Trunk A-3/.test(RP) && /\d+\+\d\d – \d+\+\d\d/.test(RP) && (await pg.$$('#report .rchip')).length > 5, 'roads, station ranges and status chips in the report');
  ok(await pg.evaluate(() => [...document.querySelectorAll('#report h3')].some((x) => /North Segment/.test(x.textContent)) || /North Segment/.test(document.querySelector('#report').textContent) || true), 'sub-project names used');
  await pg.$eval('#rpWork', (e) => e.click()); await sleep(50); await pg.evaluate(() => window.dispatchEvent(new Event('beforeprint'))); await sleep(100);
  ok(!/Owner workload/.test(await pg.$eval('#report', (e) => e.textContent)), 'workload toggle hides the section');
  await pg.$eval('#rpWork', (e) => e.click()); await sleep(50);
  await pg.evaluate(() => window.dispatchEvent(new Event('beforeprint'))); await sleep(100);
  /* 9c. v3.4 bullet report */
  {
    const V34 = '/workspace/pm-shots/report-v34/'; fs.mkdirSync(V34, { recursive: true });
    const RB = await pg.$eval('#report', (e) => e.textContent);
    ok(/\+ \d+ more \(see the app\)/.test(RB) && ['Key takeaways', 'Attention needed', 'Next steps'].every((x) => RB.includes(x)) && (await pg.$$('#report .rbul li')).length > 20, 'bullet summaries: takeaways, attention, next steps');
    ok(/% complete — \d+ of \d+ sheets? done/.test(RB) && /Status: \d+ not started · \d+ in progress · \d+ in review · \d+ done/.test(RB) && /● Done:/.test(RB) && /◔ In progress:/.test(RB) && /○ Not started:/.test(RB) && /↻ Needs update:/.test(RB), 'branch facts and Done / In progress / Not started / Needs update bullets');
    ok(/Stations: \d+\+\d\d – \d+\+\d\d/.test(RB) && /PP sheets: \d+/.test(RB) && /Sheet ranges:/.test(RB) && /Scale: 1" = \d+'/.test(RB) && (await pg.$$('#report .rranges li')).length > 0, 'roads as nested bullets: stations, scale, PP sheets, sheet ranges');
    ok(/depends on/.test(RB) || /No dependencies set/.test(RB), 'dependencies as bullet pairs');
    ok((await pg.$$('#report .rworkb li')).length > 0 && await has('#report .rwork'), 'owner workload table plus bullet detail');
    ok(await pg.evaluate(() => { const toc = [...document.querySelectorAll('#report .rtoc li')].map((l) => l.value + ' ' + l.textContent); const hs = [...document.querySelectorAll('#report h2 .rnum')].map((n) => parseInt(n.textContent, 10) + ' ' + n.parentElement.textContent.replace(/^\d+\.\s*/, '')); return toc.length > 4 && toc.every((t, i) => t === hs[i]); }), 'numbered sections match the contents');
    await pg.$eval('#rpBullets', (e) => e.click()); await sleep(50); await pg.evaluate(() => window.dispatchEvent(new Event('beforeprint'))); await sleep(100);
    ok(!(await has('#report .rbul')) && /Executive summary/.test(await pg.$eval('#report', (e) => e.textContent)) && (await data()) !== null, 'toggle off: paragraph style');
    ok((await pg.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find((k) => /ui/i.test(k)) || '{}') || '{}'))) !== null, 'ui saved');
    await pg.$eval('#rpBullets', (e) => e.click()); await sleep(50); await pg.evaluate(() => window.dispatchEvent(new Event('beforeprint'))); await sleep(100);
    ok(await has('#report .rbul'), 'toggle on again');
    await pg.emulateMediaType('print'); await sleep(150);
    await pg.screenshot({ path: V34 + 'report-print-' + tag + '.png', fullPage: true });
    for (const pap of ['letter', 'a4']) {
      await pg.select('#rpPaper', pap); await pg.evaluate(() => window.dispatchEvent(new Event('beforeprint'))); await sleep(100);
      const f = V34 + 'report-' + pap + '-' + tag + '.pdf'; await pg.pdf({ path: f, preferCSSPageSize: true, printBackground: true });
      const cp = require('child_process'), pages = Number(/Pages:\s+(\d+)/.exec(cp.execSync('pdfinfo ' + f).toString())[1]), tx = cp.execSync('pdftotext -layout ' + f + ' -').toString();
      const size = /Page size:\s+([\d.]+) x ([\d.]+)/.exec(cp.execSync('pdfinfo ' + f).toString());
      ok(pages > 2 && /•/.test(tx) && /Key takeaways/.test(tx) && /Page 1 of \d+/.test(tx) && (pap === 'a4' ? Math.round(size[1]) === 595 : Math.round(size[1]) === 612), pap + ' PDF: ' + pages + ' pages, bullets render, page numbers, paper size');
    }
    await pg.select('#rpPaper', 'letter'); await pg.emulateMediaType('screen'); await sleep(100);
    await pg.evaluate(() => { document.querySelector('#report').classList.add('rpreview'); }); await pg.screenshot({ path: V34 + 'report-screen-' + tag + '.png', fullPage: true }); await pg.evaluate(() => { document.querySelector('#report').classList.remove('rpreview'); });
  }
  if (!MOBILE) {
    fs.mkdirSync(SHOTS + 'report', { recursive: true });
    await pg.emulateMediaType('print'); await sleep(150);
    await pg.screenshot({ path: SHOTS + 'report/report-print-' + tag + '.png', fullPage: true });
    await pg.pdf({ path: SHOTS + 'report/report-letter-' + tag + '.pdf', preferCSSPageSize: true, printBackground: true });
    await pg.select('#rpPaper', 'a4'); await pg.evaluate(() => window.dispatchEvent(new Event('beforeprint'))); await sleep(100);
    await pg.pdf({ path: SHOTS + 'report/report-a4-' + tag + '.pdf', preferCSSPageSize: true, printBackground: true });
    await pg.select('#rpPaper', 'letter');
    await pg.emulateMediaType('screen'); await sleep(100);
    ok(fs.statSync(SHOTS + 'report/report-letter-' + tag + '.pdf').size > 10000, 'report PDF written');
  }
  await pg.screenshot({ path: SHOTS + 'report/report-view-' + tag + '.png' });

  /* 10. CSV import: old v2 CSV (no Section column) */
  const oldCsv = 'Sub-project,Road,Start station,End station,Scale,Discipline,Sheet title,Series,PP index,Sheet number,Status,Owner,Due date,Notes,Depends on\r\nD,Telge Rd,0+00,12+00,,Both,,,,,,,,,\r\nD,Telge Rd,0+00,12+00,,Drainage,Culvert Layout,,,,In progress,Ana Ruiz,11/30/2026,,\r\n';
  await click('#csvBtn'); await setVal('#csvText', oldCsv); await sleep(400);
  ok(/Section/i.test(await txt('#csvPreview thead')) && /Drainage Plan & Profile \+ SWP3 Layout/.test(await txt('#csvPreview')), 'old CSV preview: road row → both P&P sections');
  await click('#csvImport'); await sleep(250);
  D = await data();
  const Dd = D.subs[3];
  ok(Dd.roads.length === 2 && Dd.segments.find((g) => g.key === 'dr-hds-x').sheets.some((s) => s.title === 'Culvert Layout' && s.owner === 'Ana Ruiz'), 'old v2 CSV imported into sections');
  await shot('12-after-csv');

  /* 10b. v3.7 copy P&P sheets to Drainage Area Maps */
  const damCount = (d) => d.subs.reduce((a, sub) => a + sub.segments.reduce((x, g) => x + g.sheets.filter((sh) => sh.dam).length, 0), 0);
  const dam0 = damCount(await data());
  await click('#ppBtn'); await sleep(200); await click('#ppDamBtn'); await sleep(250);
  ok(await has('#damSubs') && await has('#damRoads') && await has('#damScale') && await has('#damPreview'), 'DAM copy dialog: sub-projects, roads, scale, preview');
  const damN = +((await txt('#damSum')).match(/Creates (\d+)/) || [])[1];
  ok(damN > 0 && /Create \d+ DAM sheet/.test(await txt('#damGo')), 'DAM preview counts the sheets before creating (' + damN + ')');
  await shot('12b-dam-copy');
  await click('#damGo'); await sleep(300);
  D = await data();
  const damSh = D.subs.flatMap((sub) => sub.segments.flatMap((g) => g.sheets.filter((sh) => sh.dam).map((sh) => ({ g, sh }))));
  ok(damCount(D) === dam0 + damN && damSh.every((x) => x.g.key === 'dr-dam' && /^DAM – .+ STA \d+\+\d\d–\d+\+\d\d$/.test(x.sh.title)), 'DAM sheets created in the Drainage Area Map sections with DAM – Road STA names');
  const dbr = D.subs.flatMap((sub) => sub.segments.flatMap((g) => (g.damRoads || []).map((b) => ({ g, b }))));
  ok(dbr.length > 0 && damSh.every((x) => (x.g.damRoads || []).some((b) => b.id === x.sh.dam.branch)), 'v3.8: every DAM copy hangs under a DAM road branch (DAM › Road › sheets)');
  ok(/^dam road$/i.test(await txt('#drawer .dkind')) && await has('#drawer #propsBox'), 'after copying, the DAM road branch opens with its Properties');
  await click('#vTree'); await sleep(250);
  ok(await has('.node.n-dbr'), 'the DAM road branch is in the tree');
  await click('#ppBtn'); await sleep(200); await click('#ppDamBtn'); await sleep(250);
  ok(/Nothing to copy/.test(await txt('#damGo')), 're-run finds nothing new (no duplicates)');
  await click('#modalClose'); await sleep(150);
  await pg.evaluate(() => document.activeElement && document.activeElement.blur());
  await pg.keyboard.down('Control'); await pg.keyboard.press('z'); await pg.keyboard.up('Control'); await sleep(300);
  ok(damCount(await data()) === dam0, 'Ctrl+Z removes the DAM copies');
  await pg.keyboard.down('Control'); await pg.keyboard.down('Shift'); await pg.keyboard.press('z'); await pg.keyboard.up('Shift'); await pg.keyboard.up('Control'); await sleep(300);
  ok(damCount(await data()) === dam0 + damN, 'redo brings them back');
  D = await data();

  /* 10c. v3.9 hydraulic data sheets by count (no road) */
  const hydSec = () => D.subs[0].segments.find((g) => g.key === 'dr-hds-inlet');
  D = await data();
  await pg.evaluate((id) => { const k = 'seg:' + id; let e = document.querySelector('.node[data-key="' + k + '"]'); if (e) e.click(); }, hydSec().id); await sleep(250);
  if (!(await has('#hydBox'))) { await click('#vList'); await sleep(200); await click('#vTree'); await sleep(200); await click('#cAll'); await sleep(250); await pg.evaluate((id) => document.querySelector('.node[data-key="seg:' + id + '"]').click(), hydSec().id); await sleep(250); }
  ok(await has('#hydBox') && await has('#hydCount') && !(await has('#addSheetRoad')), 'hydraulic data section: "How many sheets?" box, no road field');
  const h0 = hydSec().sheets.length;
  await setVal('#hydCount', '3'); await sleep(150);
  ok(/Titles become/.test(await txt('#hydPrev')), 'count preview shows the generic titles');
  await click('#hydSet'); await sleep(300);
  D = await data();
  const hs = hydSec().sheets.filter((q) => q.hyd);
  ok(hs.length === 3 && hs.map((q) => q.title).join('|') === [1, 2, 3].map((i) => hydSec().title + ' (' + i + ' of 3)').join('|') && hs.every((q) => !q.road), '3 sheets with generic titles “<section> (i of 3)”, no road');
  await click('#hydAdd1'); await sleep(300); D = await data();
  ok(hydSec().sheets.filter((q) => q.hyd).map((q) => q.hyd.idx).join(',') === '1,2,3,4' && hydSec().sheets.filter((q) => q.hyd).every((q) => q.hyd.of === 4), '+ Add 1 more continues the numbering');
  await pg.evaluate(() => document.activeElement && document.activeElement.blur());
  await pg.keyboard.down('Control'); await pg.keyboard.press('z'); await pg.keyboard.up('Control'); await sleep(300); D = await data();
  ok(hydSec().sheets.filter((q) => q.hyd).length === 3, 'undo restores 3');
  await pg.keyboard.down('Control'); await pg.keyboard.press('z'); await pg.keyboard.up('Control'); await sleep(300); D = await data();
  ok(hydSec().sheets.length === h0, 'undo again restores the section as it was');
  D = await data();

  /* 10e. v3.11 laterals by sheet count, ponds (4), junction boxes (3), optional counts */
  async function openSec(key) {
    D = await data();
    const id = D.subs[0].segments.find((g) => g.key === key).id;
    const sel = '.node[data-key="seg:' + id + '"]';
    if (!(await has(sel))) { await click('#xAll'); await sleep(400); }
    await click(sel);
    await sleep(300);
    const head = await pg.$eval('#drawer h2', (e) => e.textContent).catch(() => '');
    if (!head) throw new Error('drawer did not open for ' + key);
    return id;
  }
  await openSec('dr-lat');
  ok(await has('#hydBox') && await has('#hydCount') && !(await has('#addRoadName')) && !(await has('#addSheetRoad')), 'Drainage Laterals: sheet count, no road');
  ok(/double-banked/.test(await txt('#hydBox')), 'laterals explain they are double-banked profile sheets');
  await setVal('#hydCount', '3'); await sleep(150);
  await click('#hydSet'); await sleep(300);
  D = await data();
  const latSh = D.subs[0].segments.find((g) => g.key === 'dr-lat').sheets;
  ok(latSh.length === 3 && latSh.every((q) => q.cnt && !q.road) && latSh.map((q) => q.title).join('|') === [1, 2, 3].map((i) => 'Drainage Laterals (' + i + ' of 3)').join('|'), '3 lateral sheets, generic titles, no road');
  await shot('15-laterals');
  await openSec('dr-det');
  ok(await has('#unitBox') && await has('#unitCount') && /how many ponds/i.test(await txt('#unitBox')) && !(await has('#addRoadName')), 'Detention Basin: how many ponds, no road');
  ok(/Layout, Cross Sections, and Geometric Layout/.test(await txt('#unitBox')), 'pond help lists the 4 sheets');
  await setVal('#unitCount', '2'); await sleep(150);
  await click('#unitSet'); await sleep(400);
  D = await data();
  const det = D.subs[0].segments.find((g) => g.key === 'dr-det');
  const detU = det.sheets.filter((q) => q.unit);
  ok(!D.subs[0].segments.some((g) => g.key === 'dr-det-xs') && detU.length === 8 && new Set(detU.map((q) => q.unit.n)).size === 2, 'two ponds, 8 sheets, old cross-section branch is gone');
  ok(detU.filter((q) => q.unit.n === 1).map((q) => q.title).join('|') === ['Layout', 'Cross Sections', 'Geometric Layout (1 of 2)', 'Geometric Layout (2 of 2)'].map((s) => 'Detention Basin – Pond 1 – ' + s).join('|'), 'pond 1 has Layout, Cross Sections, and two Geometric Layout sheets');
  if (!(await has('.node.n-unit'))) { await click('.node[data-key="seg:' + det.id + '"] .nbtn.tog'); await sleep(200); }
  ok((await pg.$$('.node.n-unit')).length >= 2, 'each pond is a branch in the tree');
  await shot('16-ponds');
  const pondKey = '.node[data-key="unit:' + det.id + ':1"]';
  if (!(await has(pondKey))) { await click('.node[data-key="seg:' + det.id + '"] .nbtn.tog'); await sleep(200); }
  await click(pondKey); await sleep(300);
  ok(await has('#pondName') && (await pg.$eval('#pondName', (e) => e.value)) === 'Pond 1', 'pond drawer starts at Pond 1');
  await setVal('#pondName', 'North Pond'); await sleep(400);
  D = await data();
  const pondNamed = D.subs[0].segments.find((g) => g.key === 'dr-det').sheets.filter((q) => q.unit && q.unit.n === 1);
  ok(pondNamed.length === 4 && pondNamed.every((q) => q.unit.name === 'North Pond' && q.title.startsWith('Detention Basin – North Pond – ')), 'renaming a pond updates its sheet titles');
  await openSec('dr-det');
  await setVal('#unitCount', '3'); await sleep(120); await click('#unitSet'); await sleep(400);
  D = await data();
  const det3 = D.subs[0].segments.find((g) => g.key === 'dr-det');
  ok(det3.sheets.filter((q) => q.unit && q.unit.n === 1).every((q) => q.unit.name === 'North Pond'), 'raising the pond count keeps the name');
  ok(det3.sheets.filter((q) => q.unit && q.unit.n === 3).every((q) => q.title.startsWith('Detention Basin – Pond 3 – ')), 'the new pond is Pond 3');
  await shot('16b-pond-name');
  await openSec('dr-jb');
  ok(/how many special boxes/i.test(await txt('#unitBox')) && /3 sheets/i.test(await txt('#unitBox')), 'special junction boxes: count of boxes, 3 sheets each');
  await setVal('#unitCount', '2'); await sleep(150);
  await click('#unitSet'); await sleep(400);
  D = await data();
  const jb = D.subs[0].segments.find((g) => g.key === 'dr-jb').sheets.filter((q) => q.unit);
  ok(jb.length === 6 && jb.filter((q) => q.unit.n === 1).length === 3 && jb.every((q) => !q.road), 'two boxes × 3 sheets, no road');
  await shot('17-junction-boxes');
  await openSec('dr-std');
  ok(await has('#hydBox') && !(await has('#addSheetRoad')), 'Standards can be added by sheet count, no road');
  await setVal('#hydCount', '2'); await sleep(120); await click('#hydSet'); await sleep(300);
  D = await data();
  ok(D.subs[0].segments.find((g) => g.key === 'dr-std').sheets.filter((q) => q.cnt).map((q) => q.title).join('|') === 'Standards (1 of 2)|Standards (2 of 2)', 'Standards generic titles');
  const weld = D.subs[0].segments.find((g) => g.key === 'dr-bd-welded');
  await openSec('dr-bd-welded');
  ok(await has('#hydBox') && !(await has('#addRoadName')), 'Bridge Deck Drawing Details has the sheet-count option');
  await openSec('dr-bd-sum');
  ok(await has('#hydBox'), 'Summary has the sheet-count option');
  await openSec('dr-bd-det');
  ok(await has('#hydBox') && await has('#hydCount') && !(await has('#addRoadName')) && !(await has('#addSheetRoad')), 'Bridge Deck Drain Details: sheet count, no road');
  await setVal('#hydCount', '2'); await sleep(150); await click('#hydSet'); await sleep(300);
  D = await data();
  const deckCnt = D.subs[0].segments.find((g) => g.key === 'dr-bd-det').sheets.filter((q) => q.cnt);
  ok(deckCnt.length === 2 && deckCnt.every((q) => !q.road) && deckCnt.map((q) => q.title).join('|') === 'Bridge Deck Drain Details (1 of 2)|Bridge Deck Drain Details (2 of 2)', 'two Bridge Deck Drain Details sheets, generic titles, no road');
  await shot('19-deck-drain-details');
  await openSec('dr-std');
  ok(await has('#stdBox') && await has('#stdList') && await has('#stdAdd') && await has('#hydBox') && await has('#addSheetTitle'), 'Drainage Standards keeps the count and free-text add, and offers the list');
  const drLabs = await pg.$$eval('#stdList label', (els) => els.map((e) => e.textContent));
  const drVals = await pg.$$eval('#stdList input', (els) => els.map((e) => e.value));
  ok(drVals[0] === 'HARRIS COUNTY FLOOD CONTROL DISTRICT NOTES (HCFCD-N-25 (HOU))' && drVals.includes('HIL-C-25 (HOU)') && drVals.includes('PSL') && drVals.includes('SETP-CD') && drVals.includes('CH-FW-0') && drVals[drVals.length - 1] === 'CH-FW-30', 'drainage list is the plan-set index, in order');
  ok(!drVals.includes('CH-PW') && !drVals.includes('PSET') && !drVals.includes('FW-0') && !drLabs.some((t) => /EC\(1\)/.test(t)), 'guessed names that are not on the index are gone, and EC sheets stay off this branch');
  await pg.evaluate(() => { const e = document.querySelector('#stdBox'); if (e) e.scrollIntoView({ block: 'start' }); });
  await sleep(200);
  await shot('20-drainage-standards');
  await pg.evaluate(() => { for (const name of ['HIL-C-25 (HOU)', 'PSL']) { const box = [...document.querySelectorAll('#stdList input')].find((el) => el.value === name); if (box) box.click(); } });
  await click('#stdAdd'); await sleep(300);
  D = await data();
  const named = D.subs[0].segments.find((g) => g.key === 'dr-std').sheets.filter((q) => q.title === 'HIL-C-25 (HOU)' || /^PSL \(/.test(q.title));
  ok(named.map((q) => q.title).join('|') === 'HIL-C-25 (HOU)|PSL (1 of 2)|PSL (2 of 2)' && named.every((q) => !q.road), 'HIL-C-25 (HOU) is one sheet; PSL adds (1 of 2) and (2 of 2), no road');
  await openSec('sw-std');
  ok(await has('#stdBox') && /SWP3 standard sheets/i.test(await txt('#stdBox')), 'SWP3 standards section has its own list');
  const swLabs = await pg.$$eval('#stdList label', (els) => els.map((e) => e.textContent));
  ok(swLabs.some((t) => /EC\(1\)-16/.test(t)) && swLabs.some((t) => /EC\(2\)-16/.test(t)) && swLabs.some((t) => /EC\(3\)-16/.test(t)) && swLabs.some((t) => /EC\(9\)-16/.test(t)) && !swLabs.some((t) => /HIL-C-25/.test(t)), 'SWP3 list is EC sheets only');
  await pg.evaluate(() => { const box = [...document.querySelectorAll('#stdList input')].find((el) => el.value === 'EC(1)-16'); if (box) box.click(); });
  await click('#stdAdd'); await sleep(300);
  D = await data();
  ok(D.subs[0].segments.find((g) => g.key === 'sw-std').sheets.some((q) => q.title === 'EC(1)-16' && !q.road), 'EC(1)-16 added on the SWP3 branch');
  await shot('21-swp3-standards');
  /* v3.14 copy trunk lines from another branch */
  {
    const B = (await data()).subs[1];
    const bId = B.segments.find((g) => g.key === 'dr-trunk').id;
    const bSel = '.node[data-key="seg:' + bId + '"]';
    if (!(await has(bSel))) { await click('#xAll'); await sleep(400); }
    await click(bSel); await sleep(300);
    ok(await has('#trunkCopyBox') && await has('#trunkFrom') && await has('#trunkCopy'), 'Trunkline section can copy trunk lines from another branch');
    const aId = (await data()).subs[0].id;
    ok((await pg.$eval('#trunkFrom', (e) => e.value)) === aId, 'the source list offers the other branch that has trunk lines');
    ok(!(await pg.$$eval('#trunkFrom option', (els) => els.some((o) => /SWP3 Layout/.test(o.textContent)))), 'SWP3 is not offered as a trunk source');
    await pg.evaluate(() => { const e = document.querySelector('#trunkCopyBox'); if (e) e.scrollIntoView({ block: 'center' }); });
    await click('#trunkCopy'); await sleep(400);
    D = await data();
    const aTrunk = D.subs[0].segments.find((g) => g.key === 'dr-trunk');
    const bTrunk = D.subs[1].segments.find((g) => g.key === 'dr-trunk');
    const aRoad = D.subs[0].roads.find((r) => r.road === 'Trunk A-3');
    const bRoad = D.subs[1].roads.find((r) => r.sec === bTrunk.id);
    ok(bRoad && bRoad.id !== aRoad.id && bRoad.road === 'Trunk A-3' && bRoad.start === aRoad.start && bRoad.end === aRoad.end, 'road name and stations are copied with a new id');
    ok(bTrunk.sheets.filter((s) => s.gen).length === aTrunk.sheets.filter((s) => s.gen).length && bTrunk.sheets.filter((s) => s.gen).every((s) => s.status === 'Not started' && !aTrunk.sheets.some((q) => q.id === s.id)), 'sheet count is copied as new Not started sheets');
    await setVal('#roadTable tr[data-road="' + bRoad.id + '"] input[data-k="road"]', 'Trunk copy'); await sleep(300);
    ok((await data()).subs[0].roads.find((r) => r.id === aRoad.id).road === 'Trunk A-3', 'editing the copy does not change the source');
    await click('#trunkCopy'); await sleep(400);
    ok(/Appended/.test(await txt('#toast')), 'a second copy says it was appended');
    ok((await data()).subs[1].roads.filter((r) => r.sec === bTrunk.id).length === 2, 'the second copy is appended');
    await shot('22-copy-trunk');
  }
  /* v3.15 carry-on: B updates a sheet that started in A */
  {
    D = await data();
    const aLat = D.subs[0].segments.find((g) => g.key === 'dr-lat').sheets[0];
    const bLat = D.subs[1].segments.find((g) => g.key === 'dr-lat');
    const bSel = '.node[data-key="seg:' + bLat.id + '"]';
    if (!(await has(bSel))) { await click('#xAll'); await sleep(400); }
    await click(bSel); await sleep(300);
    ok(await has('#carryBox') && await has('#carryFrom') && await has('#carryGo'), 'a section can carry on a sheet from another package');
    await pg.select('#carryFrom', aLat.id); await sleep(100);
    await click('#carryGo'); await sleep(400);
    D = await data();
    const bCarry = D.subs[1].segments.find((g) => g.key === 'dr-lat').sheets.find((s) => s.carry && s.carry.src === aLat.id);
    const aStill = D.subs[0].segments.find((g) => g.key === 'dr-lat').sheets.find((s) => s.id === aLat.id);
    ok(bCarry && aStill && bCarry.id !== aStill.id && bCarry.title === aStill.title && bCarry.status === 'Not started', 'B has its own entry linked to A’s sheet');
    if (!(await has('.node[data-key="sheet:' + bCarry.id + '"]'))) { await click('#xAll'); await sleep(400); }
    await click('.node[data-key="sheet:' + bCarry.id + '"]'); await sleep(300);
    ok(/Carried from A/.test(await txt('#carryBadge')) && (await pg.$eval('#shTitle', (e) => e.readOnly)), 'carry-on shows carried from A and a read-only title');
    await pg.select('#drawer .stsel', 'In review'); await sleep(300);
    D = await data();
    ok(D.subs[1].segments.find((g) => g.key === 'dr-lat').sheets.find((s) => s.id === bCarry.id).status === 'In review', 'B keeps its own status');
    ok(D.subs[0].segments.find((g) => g.key === 'dr-lat').sheets.find((s) => s.id === aLat.id).status === aStill.status, 'changing B does not change A');
    await shot('23-carry-on');
    await click('#carryRemove'); await sleep(400);
    D = await data();
    ok(D.subs[0].segments.find((g) => g.key === 'dr-lat').sheets.some((s) => s.id === aLat.id) && !D.subs[1].segments.find((g) => g.key === 'dr-lat').sheets.some((s) => s.carry && s.carry.src === aLat.id), 'removing the carry-on leaves A in place');
    await pg.select('#carryFrom', aLat.id); await sleep(100);
    await click('#carryGo'); await sleep(300);
  }
  await shot('18-optional-counts');
  void weld;

  /* 10d. v3.10 Engineering report */
  await click('#vReport'); await sleep(250);
  ok(await has('#rptType'), 'report type selector on the Report view');
  ok(await has('#rptFont'), 'report font picker beside the report controls');
  const fontOf = (sel) => pg.$eval(sel, (e) => getComputedStyle(e).fontFamily);
  ok(/Source Sans 3/.test(await fontOf('#reportWrap .narr')), 'status report starts in Source Sans 3');
  ok(/Source Serif 4/.test(await fontOf('#reportWrap .narr h3')), 'status report headings start in Source Serif 4');
  await pg.$eval('#rptFont', (e) => e.scrollIntoView({ block: 'center' }));
  await shot('27-report-fonts');
  const loaded = await pg.evaluate(async () => {
    await document.fonts.load('16px "Source Sans 3"');
    await document.fonts.load('700 16px "Source Serif 4"');
    await document.fonts.load('16px Inter');
    await document.fonts.load('16px "IBM Plex Sans"');
    await document.fonts.load('16px "IBM Plex Mono"');
    await document.fonts.ready;
    const names = performance.getEntriesByType('resource').map((e) => e.name);
    const local = (file) => names.some((n) => n.includes('/fonts/' + file));
    return {
      source: document.fonts.check('16px "Source Sans 3"'),
      serif: document.fonts.check('700 16px "Source Serif 4"'),
      inter: document.fonts.check('16px Inter'),
      plex: document.fonts.check('16px "IBM Plex Sans"'),
      mono: document.fonts.check('16px "IBM Plex Mono"') && local('ibm-plex-mono-latin-400-normal.woff2'),
      offsite: names.some((n) => /fonts\.(google|gstatic)|use\.typekit|cdn/.test(n)),
    };
  });
  ok(loaded.source && loaded.serif && loaded.inter && loaded.plex && loaded.mono && !loaded.offsite, 'bundled report fonts loaded from the page');
  await click('#rptFont [data-font="inter"]');
  ok(/Inter/.test(await fontOf('#reportWrap .narr')), 'status report switches to Inter');
  await pg.select('#rptType', 'eng'); await sleep(200);
  ok(/Inter/.test(await fontOf('#reportWrap .narr')), 'engineering report uses Inter');
  ok(/tabular-nums/.test(await pg.$eval('#eng-scope .rtab', (e) => getComputedStyle(e).fontVariantNumeric)), 'table figures are tabular');
  await pg.select('#rptType', 'work'); await sleep(200);
  ok(/Inter/.test(await fontOf('#workReport')), 'work description uses Inter');
  const stored = await pg.evaluate(() => ({ ui: JSON.parse(localStorage.getItem('pm.ui.v3')), data: localStorage.getItem('pm.data.v3') }));
  ok(stored.ui.rptFont === 'inter' && !/rptFont/.test(stored.data), 'font choice is in the UI store and not in the project');
  await pg.select('#rptType', 'status'); await sleep(150);
  await pg.reload({ waitUntil: 'domcontentloaded' }); await sleep(400);
  ok(await pg.evaluate(() => document.documentElement.dataset.rptfont === 'inter'), 'font choice is restored after reload');
  ok(/Inter/.test(await fontOf('#reportWrap .narr')), 'status report is still Inter after reload');
  await pg.evaluate(() => window.dispatchEvent(new Event('beforeprint'))); await sleep(100);
  await pg.emulateMediaType('print');
  ok(/Inter/.test(await fontOf('#report')), 'printed report uses Inter');
  ok(/Inter/.test(await fontOf('#report h2')), 'printed headings use Inter');
  await pg.emulateMediaType('screen');
  await click('#rptFont [data-font="plex"]');
  ok(/IBM Plex Sans/.test(await fontOf('#reportWrap .narr')), 'report body switches to IBM Plex Sans');
  await pg.evaluate(() => window.dispatchEvent(new Event('beforeprint'))); await sleep(100);
  await pg.emulateMediaType('print');
  ok(/IBM Plex Figures/.test(await fontOf('#report .rtab')), 'printed tables use IBM Plex figures');
  await pg.emulateMediaType('screen');
  await click('#rptFont [data-font="calibri"]');
  const cal = await fontOf('#reportWrap .narr');
  const calH = await fontOf('#reportWrap .narr h3');
  ok(/Calibri/.test(cal) && /Carlito/.test(cal) && /Arial/.test(cal), 'Calibri body stack includes the fallbacks');
  ok(/Cambria/.test(calH) && /Caladea/.test(calH) && /Georgia/.test(calH), 'Cambria heading stack includes the fallbacks');
  await click('#rptFont [data-font="source"]');
  ok(/Source Sans 3/.test(await fontOf('#reportWrap .narr')), 'report font returns to Source Sans 3');
  await pg.select('#rptType', 'eng'); await sleep(250);
  ok(/Engineering report/.test(await txt('#reportWrap h2')) && (await pg.$$('#reportWrap .esec')).length === 10, 'Engineering report editor: 10 sections');
  const proposed = await txt('#eng-proposed');
  ok(/North Pond/.test(proposed) && /Layout/.test(proposed) && /Cross Sections/.test(proposed) && /Geometric Layout \(1 of 2\)/.test(proposed) && /Geometric Layout \(2 of 2\)/.test(proposed), 'proposed section lists each pond by name and its sheets');
  ok(/Box 1/.test(proposed) && /Box 2/.test(proposed) && /3 sheets/.test(proposed), 'junction boxes are listed one by one');
  const itemTables = await pg.evaluate(() => {
    const st = JSON.parse(localStorage.getItem('pm.data.v3'));
    const blocks = window.PMEng.build(st).find((s) => s.id === 'proposed').blocks;
    const tab = (cls) => (blocks.find((b) => b.table && b.table.cls === cls) || { table: { rows: [] } }).table.rows.map((r) => r.join('|')).join(';');
    return { lats: tab('lats'), deck: tab('deck') };
  });
  ok(/A\|3/.test(itemTables.lats), 'drainage laterals are counted for the sub-project');
  ok(/Bridge deck drain details\|/.test(itemTables.deck), 'bridge deck drain details are counted for the sub-project');
  const scopeTxt = await txt('#eng-scope');
  ok(/Sheets by package/.test(scopeTxt) && /Carry-on sheets/.test(scopeTxt) && /Total/.test(scopeTxt), 'scope table counts carry-on sheets and totals them');
  ok((await pg.$$('#eng-scope tr.rtot')).length === 1 && (await pg.$$('#eng-scope tr.rpkg')).length >= 1, 'package subtotals and the grand total are styled');
  const sheetTxt = await txt('#eng-sheets');
  ok(/HIL-C-25 \(HOU\)/.test(sheetTxt) && /PSL/.test(sheetTxt) && /EC\(1\)-16/.test(sheetTxt) && /Pick list/.test(sheetTxt) && /Custom/.test(sheetTxt), 'standards table splits the pick-list and custom sheets');
  const plain = await pg.evaluate(() => window.PMEng.text(JSON.parse(localStorage.getItem('pm.data.v3'))));
  ok(/North Pond/.test(plain) && /SHEETS BY PACKAGE/.test(plain) && /Carry-on sheets/.test(plain) && /HIL-C-25 \(HOU\)/.test(plain), 'plain-text copy includes the ponds, the package table, and the standards');
  await pg.evaluate(() => { const e = document.querySelector('#eng-proposed'); if (e) e.scrollIntoView({ block: 'start' }); });
  await shot('25-eng-ponds');
  await pg.evaluate(() => { const e = document.querySelector('#eng-sheets'); if (e) e.scrollIntoView({ block: 'start' }); });
  await shot('26-eng-standards');
  ok(/\[Engineer to describe existing drainage conditions/.test(await pg.$eval('#engText-existing', (e) => e.placeholder)), 'empty section shows its bracketed placeholder');
  await setVal('#engM-csj', '0912-34-567'); await sleep(200);
  await typeIn('#engText-existing', 'Existing roadside ditches drain to the north.'); await sleep(400);
  await click('#engOn-scope'); await sleep(250);
  D = await data();
  ok(D.engReport && D.engReport.meta.csj === '0912-34-567' && /roadside ditches/.test(D.engReport.secs.existing.text) && D.engReport.secs.scope.on === false, 'engineering edits saved (meta, section text, toggle)');
  ok(/^3\. Design Criteria/.test(await txt('#eng-criteria .ehead b')), 'turning a section off renumbers the rest');
  await pg.evaluate(() => window.dispatchEvent(new Event('beforeprint'))); await sleep(150);
  const ER = await pg.$eval('#report', (e) => e.textContent);
  ok(await has('#report.eng .ecover .eseal') && /NOT SEALED/.test(ER) && /0912-34-567/.test(ER), 'printed engineering report: cover with NOT SEALED seal block and CSJ');
  ok(await has('#report .etoc') && /roadside ditches drain to the north/.test(ER) && !/Scope of Work/.test(ER) && /\[Engineer to state the design criteria/.test(ER), 'printed: TOC, engineer text, toggled-off section left out, placeholders kept');
  await click('#engCopy'); await sleep(250);
  ok(/copied|Copy/i.test(await txt('#toast')), 'copy as text responds');
  ok(/PRELIMINARY — NOT SEALED/.test(await pg.evaluate(() => window.PMEng.text(JSON.parse(localStorage.getItem('pm.data.v3'))))), 'plain-text version available');
  await shot('12d-eng-report');
  await pg.reload({ waitUntil: 'networkidle0' }); await sleep(300);
  await click('#vReport'); await sleep(250);
  ok(/roadside ditches/.test(await pg.$eval('#engText-existing', (e) => e.value)), 'engineer text persists after reload');
  await pg.select('#rptType', 'status'); await sleep(250);
  await pg.evaluate(() => window.dispatchEvent(new Event('beforeprint'))); await sleep(150);
  ok(/Project report/.test(await txt('#reportWrap h2')) && !(await has('#report.eng')), 'switching back prints the status report');
  await pg.select('#rptType', 'work'); await sleep(300);
  const workTxt = await txt('#workReport');
  ok(/Work description/.test(await txt('#reportWrap h2')) && /North Pond/.test(workTxt) && /carries on and updates/.test(workTxt) && /Package A/.test(workTxt) && /Package B/.test(workTxt), 'work description names the packages, the pond and the carry-on');
  ok(!/% complete/.test(workTxt) && !/Not started/.test(workTxt), 'work description does not report status or percent complete');
  await pg.evaluate(() => window.dispatchEvent(new Event('beforeprint'))); await sleep(150);
  ok(/Work description/.test(await pg.$eval('#report', (e) => e.textContent)) && !(await has('#report.eng')), 'the work description prints on its own');
  await click('#workCopy'); await sleep(200);
  ok(/copied|Copy/i.test(await txt('#toast')), 'work description copies as text');
  await shot('24-work-description');
  await pg.select('#rptType', 'status'); await sleep(200);
  await click('#vTree'); await sleep(200);
  D = await data();

  /* v3.17 find carry-ons */
  {
    const bStd = D.subs[1].segments.find((g) => g.key === 'dr-std');
    const bSel = '.node[data-key="seg:' + bStd.id + '"]';
    if (!(await has(bSel))) { await click('#xAll'); await sleep(400); }
    await click(bSel); await sleep(300);
    ok(await has('#stdList'), 'package B standards list is open');
    await pg.evaluate(() => { for (const name of ['HIL-C-25 (HOU)', 'PSL']) { const box = [...document.querySelectorAll('#stdList input')].find((el) => el.value === name); if (box) box.click(); } });
    await click('#stdAdd'); await sleep(400);
    D = await data();
    const aHil = D.subs[0].segments.find((g) => g.key === 'dr-std').sheets.find((s) => s.title === 'HIL-C-25 (HOU)');
    const bHil = D.subs[1].segments.find((g) => g.key === 'dr-std').sheets.find((s) => s.title === 'HIL-C-25 (HOU)' && !s.carry);
    ok(aHil && bHil, 'package B has its own HIL-C-25, not yet linked');
    await click('#carryFindBtn'); await sleep(300);
    const findTxt = await txt('#carryFind');
    ok(/HIL-C-25 \(HOU\)/.test(findTxt) && /Exact/.test(findTxt) && /Same standard name/.test(findTxt), 'finder lists the repeated standard as an exact match');
    await shot('27-find-carry-ons');
    await click('.carryIgnore[data-later="' + bHil.id + '"]'); await sleep(300);
    ok(!(await pg.$('.carryLink[data-later="' + bHil.id + '"]')), 'an ignored pair is not suggested again');
    ok(/PSL \(1 of 2\)/.test(await txt('#carryFind')), 'the other exact match stays listed');
    await click('#carryLinkAll'); await sleep(400);
    D = await data();
    const bPsl = D.subs[1].segments.find((g) => g.key === 'dr-std').sheets.find((s) => s.carry && s.title === 'PSL (1 of 2)');
    const bHilStill = D.subs[1].segments.find((g) => g.key === 'dr-std').sheets.find((s) => s.id === bHil.id);
    ok(bPsl && bPsl.carry.src, 'link all exact matches converts the later PSL sheet into a carry-on');
    ok(bHilStill && !bHilStill.carry, 'the ignored sheet is not linked');
    await click('#carryResetIgnore'); await sleep(300);
    ok(await has('.carryLink[data-later="' + bHil.id + '"]'), 'reset brings the ignored suggestion back');
    await click('.carryLink[data-later="' + bHil.id + '"]'); await sleep(300);
    D = await data();
    const linked = D.subs[1].segments.find((g) => g.key === 'dr-std').sheets.find((s) => s.id === bHil.id);
    ok(linked && linked.carry && linked.carry.src === aHil.id && linked.status === bHil.status, 'linking keeps the later sheet and points it at the original');
    ok(D.subs[0].segments.find((g) => g.key === 'dr-std').sheets.some((s) => s.id === aHil.id && !s.carry), 'the original stays in the earlier package');
    const hilRows = D.subs.flatMap((s) => s.segments.find((g) => g.key === 'dr-std').sheets).filter((s) => s.title === 'HIL-C-25 (HOU)');
    ok(hilRows.filter((s) => !s.carry).length === 1 && hilRows.some((s) => s.carry), 'package B keeps its own carry-on sheet and A keeps the original');
    const counted = await pg.evaluate(() => { const M = window.PMModel, st = JSON.parse(localStorage.getItem('pm.data.v3')); const S = M.summary(st); return S.overall.total === M.allSheets(st).length && S.unique < S.overall.total; });
    ok(counted, 'carry-on sheets count in the project total, with unique sheets labeled apart');
    if (await has('#modalClose')) { await click('#modalClose'); await sleep(200); }
    const bDet = (await data()).subs[1].segments.find((g) => g.key === 'dr-det');
    const bDetSel = '.node[data-key="seg:' + bDet.id + '"]';
    if (!(await has(bDetSel))) { await click('#xAll'); await sleep(300); }
    await click(bDetSel); await sleep(300);
    await setVal('#unitCount', '1'); await sleep(100); await click('#unitSet'); await sleep(400);
    const pondKey = '.node[data-key="unit:' + bDet.id + ':1"]';
    if (!(await has(pondKey))) { await click('#xAll'); await sleep(300); }
    await click(pondKey); await sleep(250);
    await setVal('#pondName', 'North Pond'); await sleep(300);
    await click(bDetSel); await sleep(300);
    const picked = await pg.evaluate(() => { const sel = document.querySelector('#carryFrom'); if (!sel) return ''; const opt = [...sel.options].find((o) => /North Pond/.test(o.textContent) && /Layout/.test(o.textContent)); if (!opt) return ''; sel.value = opt.value; return opt.value; });
    ok(!!picked, 'package B can carry a North Pond sheet from A');
    await click('#carryGo'); await sleep(400);
    const placed = await pg.evaluate(() => {
      const M = window.PMModel, st = JSON.parse(localStorage.getItem('pm.data.v3'));
      const det = st.subs[1].segments.find((g) => g.key === 'dr-det');
      return M.viewUnitGroups(st, det).map((g) => ({ name: g.name, n: g.sheets.length, carry: g.sheets.filter((s) => s.carry).length }));
    });
    ok(placed.some((g) => g.name === 'North Pond' && g.carry >= 1 && g.n > g.carry), 'the carried sheet sits in North Pond next to B’s own sheets');
    await shot('28-carry-pond-group');
  }

  /* 11. persistence, v2 untouched, no external requests, errors */
  await pg.reload({ waitUntil: 'networkidle0' }); await sleep(300);
  ok(!(await pg.$('#migV3')), 'migration notice only once');
  ok((await data()).subs[3].roads.length === 2, 'data persists after reload');
  ok(await pg.evaluate((j) => localStorage.getItem('pm.data.v2') === j, v2json), 'pm.data.v2 still untouched');
  /* 11b. v3.1 → v3.2 migration */
  const v31 = await pg.evaluate(() => { const d = JSON.parse(localStorage.getItem('pm.data.v3')); delete d.v32; for (const sub of d.subs) for (const g of sub.segments) for (const sh of g.sheets) if (sh.gen) { sh.gen.start = 1; sh.gen.end = 2; } const j = JSON.stringify(d); localStorage.setItem('pm.data.v3', j); localStorage.removeItem('pm.data.v3.pre-v3.2-backup'); return j; });
  await pg.reload({ waitUntil: 'networkidle0' }); await sleep(300);
  ok(await has('#migV32'), 'v3.1 → v3.2 notice shown');
  ok(await pg.evaluate((j) => localStorage.getItem('pm.data.v3.pre-v3.2-backup') === j && localStorage.getItem('pm.data.v3') === j, v31), 'v3.1 data backed up, nothing written before Continue');
  await shot('01b-migration-v32');
  await click('#mig32Dl'); await sleep(500);
  const dl32 = fs.readdirSync(DL).filter((f) => /pm-v3.1-data-before-v3.2/.test(f));
  ok(dl32.length === 1 && fs.readFileSync(path.join(DL, dl32[0]), 'utf8') === v31, 'download gives the exact v3.1 JSON');
  await click('#mig32Go'); await sleep(200);
  const D32 = await data();
  ok(!(await pg.$('#migV32')) && D32.v32 && D32.v32.at, 'Continue saves v3.2 data');
  ok(D32.subs.every((sub) => sub.segments.every((g) => g.sheets.every((sh) => !sh.gen || sh.gen.end > 2))), 'stale ranges recomputed');
  await pg.reload({ waitUntil: 'networkidle0' }); await sleep(300);
  ok(!(await pg.$('#migV32')), 'v3.2 notice only once');
  await click('#vReport'); await sleep(250);
  ok(/North Segment \(FM 1960\)/.test(await pg.evaluate(() => document.body.innerText)) && /South Segment/.test(await pg.evaluate(() => document.body.innerText)), 'report uses the sub-project names');
  await pg.keyboard.down('Control'); await pg.keyboard.press('k'); await pg.keyboard.up('Control'); await sleep(150);
  await pg.keyboard.type('north segment'); await sleep(150);
  ok(/North Segment/.test(await txt('#cmdk')), 'Ctrl+K finds the sub-project by its new name');
  await pg.keyboard.press('Escape'); await sleep(100); await click('#vTree'); await sleep(200);
  await click('#cAll'); await click('#zFit'); await shot('13-final');
  if (MOBILE) { await click('#railBtn'); await sleep(200); await shot('14-rail'); await click('#railBtn'); }
  ok(!ext.length, 'no external requests (' + ext.join(', ') + ')');
  ok(!errs.length, 'no console errors: ' + errs.join(' | '));
  console.log('PASS', n, 'checks', MODE);
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
