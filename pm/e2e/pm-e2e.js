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
const TYPES = { html: 'text/html', js: 'text/javascript', css: 'text/css', png: 'image/png', json: 'application/json' };
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
  ok(secTitles[0] === 'Overall Drainage Area Map' && secTitles[15] === 'Standards' && secTitles.includes('Bridge Deck Drawing Details (Welded)') && secTitles.includes('Other Drainage'), 'A Drainage shows the 16 sections in order (+ Other for unmatched)');
  ok(/2 PP/.test(await txt('.node[data-key="seg:' + secA('dr-pp').id + '"]')) && /FM 1960/.test(await txt('.node[data-key="seg:' + secA('dr-pp').id + '"]')), 'P&P section node shows PP count and road');
  ok(!(await pg.$$eval('.node', (e) => e.map((x) => x.dataset.key))).some((k) => /^road:/.test(k)), 'roads are not tree nodes');
  await click('.node[data-key="seg:' + secA('dr-hds-x').id + '"] .nbtn.tog');
  ok(await has('.node[data-key^="sheet:"]'), 'section expands to its sheets');
  await click('#zFit'); await shot('03-tree-sections');

  /* 3. section drawer: road name only, inline stations → PP, generate */
  await click('.node[data-key="seg:' + secA('dr-lat').id + '"]');
  ok(/Drainage Laterals/.test(await txt('#drawer')) && await has('#addRoadName'), 'Drainage Laterals drawer has the add-road form');
  await typeIn('#addRoadName', 'Lateral A-3'); await pg.keyboard.press('Enter'); await sleep(250);
  let D = await data();
  const lat = D.subs[0].roads.find((r) => r.road === 'Lateral A-3');
  ok(lat && lat.start === null, 'road added with the name only (no stations)');
  ok(/—/.test(await txt('#roadTable tbody tr')) , 'no PP until stations are entered');
  await setVal('#roadTable tr[data-road="' + lat.id + '"] input[data-k="start"]', '0+00'); await sleep(150);
  await setVal('#roadTable tr[data-road="' + lat.id + '"] input[data-k="end"]', '13+00'); await sleep(200);
  ok((await txt('#secPP')).trim() === '2', 'inline stations: 1,300 ft at 100 scale → 2 PP');
  await setVal('#roadTable tr[data-road="' + lat.id + '"] input[data-k="scale"]', '50'); await sleep(200);
  ok((await txt('#secPP')).trim() === '3', '50 scale (600 ft/sheet) → 3 PP');
  D = await data();
  ok(D.subs[0].segments.find((g) => g.key === 'dr-lat').sheets.filter((s) => s.gen).length === 3, 'PP sheets follow the stations live: 3 Drainage Laterals PP sheets');
  ok(/up to date/.test(await txt('#genBtn')), 'nothing left to generate');
  ok(JSON.stringify(D.subs[0].segments.find((g) => g.key === 'dr-lat').sheets.filter((s) => s.gen).map((s) => [s.gen.start, s.gen.end])) === '[[0,600],[600,1200],[1200,1300]]', 'ranges 0+00–6+00, 6+00–12+00, 12+00–13+00 (last partial)');
  ok(/Lateral A-3 Sta 0\+00 to 6\+00 \(PP 1 of 3\)/.test(D.subs[0].segments.find((g) => g.key === 'dr-lat').sheets[0].title), 'PP sheet title includes road + stations');
  await shot('04-section-roads');
  /* road drawer + undo */
  await clickText('#roadTable .link', /Open/);
  ok(/Road entry/i.test(await txt('#drawer .dkind')) && await has('#stStart'), 'road drawer with stations editor');
  await pg.keyboard.press('Escape');
  await pg.evaluate(() => document.activeElement.blur());
  await pg.keyboard.down('Control'); await pg.keyboard.press('z'); await pg.keyboard.up('Control'); await sleep(250);
  ok((await data()).subs[0].segments.find((g) => g.key === 'dr-lat').sheets.filter((s) => s.gen).length === 2, 'undo restores the 100-scale count (2 PP)');
  await pg.keyboard.down('Control'); await pg.keyboard.down('Shift'); await pg.keyboard.press('z'); await pg.keyboard.up('Shift'); await pg.keyboard.up('Control'); await sleep(250);
  ok((await data()).subs[0].segments.find((g) => g.key === 'dr-lat').sheets.filter((s) => s.gen).length === 3, 'redo brings them back');

  /* 3b. v3.2: road branch under the section, sheets with station ranges under the road */
  const latSec = (await data()).subs[0].segments.find((g) => g.key === 'dr-lat');
  const rdKey = 'rd:' + latSec.id + ':lateral-a-3';
  await pg.keyboard.press('Escape'); await pg.evaluate(() => document.activeElement && document.activeElement.blur());
  if (!(await has('.node[data-key="' + rdKey + '"]'))) await click('.node[data-key="seg:' + latSec.id + '"] .nbtn.tog');
  ok(await has('.node[data-key="' + rdKey + '"]'), 'road is a branch under Drainage Laterals');
  ok(/Lateral A-3/.test(await txt('.node[data-key="' + rdKey + '"]')) && /3 PP/.test(await txt('.node[data-key="' + rdKey + '"]')) && /0\+00–13\+00/.test(await txt('.node[data-key="' + rdKey + '"]')), 'road node shows name, PP count and its station range');
  const latSheets = latSec.sheets.filter((x) => x.gen);
  const pp1 = '.node[data-key="sheet:' + latSheets[0].id + '"]';
  ok(await has(pp1) && /PP 1: STA 0\+00 – 6\+00/.test(await txt(pp1)) && /50 scale/.test(await txt(pp1)), 'sheet node under the road: “PP 1: STA 0+00 – 6+00” with scale');
  ok(await pg.$eval(pp1, (e) => parseFloat(e.style.left)) > await pg.$eval('.node[data-key="' + rdKey + '"]', (e) => parseFloat(e.style.left)), 'sheets sit to the right of their road');
  await click('.node[data-key="' + rdKey + '"]');
  ok(await has('#rgTable') && (await pg.$$('#rgTable tbody tr')).length === 3 && await has('#roadTable'), 'road drawer: station ranges per sheet + the road table');
  const p2row = '#rgTable tr[data-sheet="' + latSheets[1].id + '"]';
  await setVal(p2row + ' input[data-k="a"]', '6+50'); await sleep(250);
  let L2 = (await data()).subs[0].segments.find((g) => g.key === 'dr-lat').sheets.find((x) => x.id === latSheets[1].id);
  ok(L2.sta && L2.sta.start === 650 && L2.sta.end === 1200 && /Sta 6\+50 to 12\+00/.test(L2.title), 'manual range on PP 2 (title follows)');
  ok(/✎/.test(await txt('.node[data-key="sheet:' + latSheets[1].id + '"]')), 'tree marks the manual range');
  await setVal('#roadTable input[data-k="scale"]', '100'); await sleep(300);
  let LS = (await data()).subs[0].segments.find((g) => g.key === 'dr-lat').sheets.filter((x) => x.gen);
  ok(LS.length === 2 && LS[1].sta && LS[1].sta.start === 650, 'scale 100 → 2 PP; the manual range is kept, not overwritten');
  ok(/manual range/.test(await txt('#rgWarn')), 'and a warning explains the conflict');
  await shot('04b-road-drawer');
  await setVal('#roadTable input[data-k="scale"]', '50'); await sleep(300);
  ok((await data()).subs[0].segments.find((g) => g.key === 'dr-lat').sheets.filter((x) => x.gen).length === 3, 'back to 50 scale → 3 PP');
  await click(p2row + ' button.btn'); await sleep(250);
  L2 = (await data()).subs[0].segments.find((g) => g.key === 'dr-lat').sheets.find((x) => x.id === latSheets[1].id);
  ok(!L2.sta && L2.gen.start === 600 && /Sta 6\+00 to 12\+00/.test(L2.title), 'reset to computed');
  await click(pp1); ok((await pg.$eval('#shStaA', (e) => e.value)) === '0+00' && (await pg.$eval('#shStaB', (e) => e.value)) === '6+00' && /Computed/.test(await txt('#shStaHint')), 'sheet drawer shows the computed range');
  await click('.node[data-key="' + rdKey + '"] .nbtn.tog'); ok(!(await has(pp1)), 'road branch collapses');
  await click('.node[data-key="' + rdKey + '"] .nbtn.tog'); ok(await has(pp1), 'and expands');
  await click('#zFit'); await shot('04c-road-branch');
  await pg.keyboard.press('Escape'); await pg.evaluate(() => document.activeElement && document.activeElement.blur());
  await pg.keyboard.down('Control'); await pg.keyboard.press('k'); await pg.keyboard.up('Control'); await sleep(150);
  await pg.keyboard.type('lateral a-3'); await sleep(150);
  ok(/road/i.test(await txt('#cmdk')), 'Ctrl+K lists the road'); await pg.keyboard.press('Enter'); await sleep(400);
  ok(await has('.node.n-road.sel[data-key="' + rdKey + '"]'), 'and jumps to the road node');
  await pg.keyboard.down('Control'); await pg.keyboard.press('k'); await pg.keyboard.up('Control'); await sleep(150);
  await pg.keyboard.type('12+00 13+00'); await sleep(150); await pg.keyboard.press('Enter'); await sleep(400);
  const pp3 = (await data()).subs[0].segments.find((g) => g.key === 'dr-lat').sheets.find((x) => x.gen && x.gen.idx === 3);
  ok(sel3 = await has('.node.sel[data-key="sheet:' + pp3.id + '"]'), 'Ctrl+K finds a sheet by its stations');


  /* 4. quick add: sheet picks a section */
  await click('.node[data-key="disc:' + A.id + ':Drainage"]');
  ok(await has('#qaTitle') && await has('#qaSec'), 'sub-project branch drawer has quick add with section picker');
  await typeIn('#qaTitle', 'Special Junction Box Details 2'); await sleep(100);
  ok(/Special Junction Box Details/.test(await txt('#qaHint')), 'quick add suggests the section from the title');
  await pg.keyboard.press('Enter'); await sleep(200);
  D = await data();
  ok(D.subs[0].segments.find((g) => g.key === 'dr-jb').sheets.some((s) => s.title === 'Special Junction Box Details 2'), 'sheet lands in Special Junction Box Details');
  await setVal('#qaSec', D.subs[0].segments.find((g) => g.key === 'dr-det-xs').id);
  await typeIn('#qaTitle', 'Pond XS-1'); await pg.keyboard.press('Enter'); await sleep(200);
  ok((await data()).subs[0].segments.find((g) => g.key === 'dr-det-xs').sheets.some((s) => s.title === 'Pond XS-1'), 'picked section wins');
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
  ok(await has('#secSec') && (await pg.$$('#secSec .secedit[data-disc="Drainage"] .secrow')).length === 17, 'Settings lists the 17 Drainage sections (16 + Other)');
  await typeIn('#secNewDR', 'Utility Conflict Sheets'); await pg.keyboard.press('Enter'); await sleep(250);
  ok((await data()).settings.sections.some((x) => x.title === 'Utility Conflict Sheets'), 'add section');
  const rn = await pg.$$('#secSec .secedit[data-disc="Drainage"] .secrow input:not([type=checkbox])');
  await rn[12].evaluate((e) => { e.value = 'Bridge Deck Drainage Details (Welded)'; e.dispatchEvent(new Event('change', { bubbles: true })); }); await sleep(250);
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
  ok(stRows.length === 7 && stRows.some((r) => /Drainage Laterals/.test(r)) && stRows.some((r) => /SWP3 Layout/.test(r)), 'stations table lists every road entry with its section');
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

  /* 10. CSV import: old v2 CSV (no Section column) */
  const oldCsv = 'Sub-project,Road,Start station,End station,Scale,Discipline,Sheet title,Series,PP index,Sheet number,Status,Owner,Due date,Notes,Depends on\r\nD,Telge Rd,0+00,12+00,,Both,,,,,,,,,\r\nD,Telge Rd,0+00,12+00,,Drainage,Culvert Layout,,,,In progress,Ana Ruiz,11/30/2026,,\r\n';
  await click('#csvBtn'); await setVal('#csvText', oldCsv); await sleep(400);
  ok(/Section/i.test(await txt('#csvPreview thead')) && /Drainage Plan & Profile \+ SWP3 Layout/.test(await txt('#csvPreview')), 'old CSV preview: road row → both P&P sections');
  await click('#csvImport'); await sleep(250);
  D = await data();
  const Dd = D.subs[3];
  ok(Dd.roads.length === 2 && Dd.segments.find((g) => g.key === 'dr-hds-x').sheets.some((s) => s.title === 'Culvert Layout' && s.owner === 'Ana Ruiz'), 'old v2 CSV imported into sections');
  await shot('12-after-csv');

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
