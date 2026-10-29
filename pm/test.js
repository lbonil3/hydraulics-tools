const assert = require('assert');
const C = require('./crypto.js');
const M = require('./model.js');
const tests = [];
function t(name, fn) { tests.push([name, fn]); }
const ITER = 1000;
const today = '2026-10-28';

t('parse/format stations', () => {
  assert.strictEqual(M.parseStation('10+00'), 1000);
  assert.strictEqual(M.parseStation('0+05.5'), 5.5);
  assert.strictEqual(M.parseStation('1000'), 1000); assert.strictEqual(M.parseStation('10+00.50'), 1000.5); assert.strictEqual(M.parseStation('Sta 12+34'), 1234);
  for (const bad of ['', '10+5', '10+100', 'a+00', '-1+00']) assert(Number.isNaN(M.parseStation(bad)), bad);
  for (const s of ['10+00', '0+05.5', '125+99.25', '3+07']) assert.strictEqual(M.formatStation(M.parseStation(s)), s);
  assert.strictEqual(M.formatStation(1099.999), '11+00');
});
t('segment length', () => {
  assert.strictEqual(M.segLength({ start: 1000, end: 2550 }), 1550);
  assert.strictEqual(M.segLength({ start: '10+00', end: '25+50' }), 1550);
  assert.strictEqual(M.segLength({ start: '25+50', end: '10+00' }), 0);
});
t('ft per sheet: table, edits, custom scale', () => {
  const st = M.newState();
  assert.deepStrictEqual([20, 40, 50, 100].map((s) => M.ftPerSheet(st.settings, s)), [240, 480, 600, 1200]);
  assert.strictEqual(M.ftPerSheet(st.settings, 30), 360); // custom: 12 in x scale
  M.setScale(st, 100, 1100);
  assert.strictEqual(M.ftPerSheet(st.settings, 100), 1100);
  M.setScale(st, 200, 2400);
  assert.deepStrictEqual(st.settings.scales.map((r) => r.scale), [20, 40, 50, 100, 200]);
  M.removeScale(st, 200);
  assert.throws(() => M.setScale(st, 0, 10));
});
t('PP count = ceil(length / ft), boundaries', () => {
  assert.strictEqual(M.ppCount(1550, 1200), 2);
  assert.strictEqual(M.ppCount(1200, 1200), 1);
  assert.strictEqual(M.ppCount(1201, 1200), 2);
  assert.strictEqual(M.ppCount(2400, 1200), 2);
  assert.strictEqual(M.ppCount(2400.01, 1200), 3);
  for (const ft of [240, 480, 600]) {
    assert.strictEqual(M.ppCount(ft, ft), 1);
    assert.strictEqual(M.ppCount(ft + 1, ft), 2);
    assert.strictEqual(M.ppCount(ft * 3, ft), 3);
    assert.strictEqual(M.ppCount(ft * 3 + 0.5, ft), 4);
  }
  assert.strictEqual(M.ppCount(1, 1200), 1);
  assert.strictEqual(M.ppCount(0, 1200), 0);
  // optional overlap: 2,300 ft at 1,200 with 100 ft overlap -> advance 1,100: sheets 0-1200, 1100-2300 => 2
  assert.strictEqual(M.ppCount(2300, 1200, 100), 2);
  assert.strictEqual(M.ppCount(2301, 1200, 100), 3);
  assert(Number.isNaN(M.ppCount(5000, 100, 100)));
});
t('per-sheet station ranges; last sheet shorter', () => {
  assert.deepStrictEqual(M.ppRanges(1000, 2550, 1200), [{ idx: 1, of: 2, start: 1000, end: 2200 }, { idx: 2, of: 2, start: 2200, end: 2550 }]);
  assert.deepStrictEqual(M.ppRanges(0, 1200, 1200), [{ idx: 1, of: 1, start: 0, end: 1200 }]);
  const r = M.ppRanges(500, 1700.5, 240);
  assert.strictEqual(r.length, 6);
  assert.deepStrictEqual(r[5], { idx: 6, of: 6, start: 1700, end: 1700.5 });
  for (let i = 1; i < r.length; i++) assert.strictEqual(r[i].start, r[i - 1].end);
  const o = M.ppRanges(0, 2300, 1200, 100);
  assert.deepStrictEqual(o.map((x) => [x.start, x.end]), [[0, 1200], [1100, 2300]]);
  assert.strictEqual(M.genTitle({ name: 'Drainage Plan & Profile' }, { idx: 1, of: 2, start: 1000, end: 2200 }), 'Drainage Plan & Profile – Sta 10+00 to 22+00 (PP 1 of 2)');
});
const V2 = require('./legacy/model-v2.js');
const K = (st, sub, key) => M.secOf(sub, key);
function setup() {
  const st = M.newState();
  const [A, B] = st.subs;
  const pA = K(st, A, 'dr-pp'), pB = K(st, B, 'dr-pp');
  const r1 = M.addRoad(st, pA.id, { road: 'FM 1960', start: '10+00', end: '25+50' }).road;
  const r2 = M.addRoad(st, pB.id, { road: 'Kuykendahl', start: '100+00', end: '104+80', scale: 40 }).road;
  return { st, A, B, pA, pB, r1, r2 };
}
t('v3 structure: Drainage + SWP3 branches, A–D each, Luis’s 16 Drainage sections in order', () => {
  const st = M.newState();
  assert.strictEqual(st.schema, 3);
  assert.deepStrictEqual(st.subs.map((s) => s.code), ['A', 'B', 'C', 'D']);
  const dr = M.sectionsOf(st.subs[0], 'Drainage').map((s) => s.title);
  assert.deepStrictEqual(dr, ['Overall Drainage Area Map', 'Drainage Area Map', 'Hydraulic Data Sheet - Runoff Computations', 'Hydraulic Data Sheet - Inlet Computations', 'Hydraulic Data Sheet - Storm Sewer Computations', 'Hydraulic Data Sheet - Crossing', 'Drainage Plan & Profile', 'Trunkline Plan & Profile', 'Drainage Laterals', 'Detention Basin Layout', 'Detention Basin Cross Section', 'Special Junction Box Details', 'Bridge Deck Drawing Details (Welded)', 'Bridge Deck Drain Details', 'Bridge Deck Drain Summary', 'Standards']);
  assert.deepStrictEqual(M.sectionsOf(st.subs[0], 'SWP3').map((s) => s.title), ['SWP3 Layout', 'SWP3 Summary & Notes', 'SWP3 Standard Details', 'Other SWP3']);
  assert.deepStrictEqual(st.subs[0].segments.filter(M.isPPSec).map((s) => s.key), ['dr-pp', 'dr-trunk', 'dr-lat', 'sw-layout']);
  assert.ok(st.subs.every((s) => s.segments.length === 20 && s.roads.length === 0));
  assert.strictEqual(st.subs[0].templates.length, 15, 'standard set = one sheet per non-PP section (no Other)');
});
t('road entries: name only, stations later, PP per section, totals roll up', () => {
  const { st, A, B, pA, r1, r2 } = setup();
  const lat = K(st, A, 'dr-lat');
  const r3 = M.addRoad(st, lat.id, { road: 'Lateral A-3' }).road;
  assert.strictEqual(r3.start, null); assert.strictEqual(M.segLabel(r3), 'Lateral A-3');
  assert.strictEqual(M.segPP(st, A, lat).total, 0, 'no stations → no PP yet');
  assert.throws(() => M.addRoad(st, K(st, A, 'dr-dam').id, { road: 'X' }), /no road entries/);
  assert.throws(() => M.addRoad(st, lat.id, { road: '' }), /Road name/);
  assert.throws(() => M.addRoad(st, lat.id, { road: 'Y', start: '10+00' }), /End station/);
  M.updateRoad(st, r3.id, { start: '0+00', end: '7+00' });
  assert.strictEqual(M.segPP(st, A, lat).total, 1);
  assert.strictEqual(M.segScale(A, r1), 100); assert.strictEqual(M.segScale(B, r2), 40);
  assert.strictEqual(M.segPP(st, A, pA).total, 2); assert.strictEqual(M.segPP(st, A, r1).total, 2);
  const S = M.ppSummary(st);
  assert.deepStrictEqual(S.bySub.map((b) => b.total), [3, 1, 0, 0]);
  assert.deepStrictEqual(S.byDisc, { Drainage: 4, SWP3: 0 });
  assert.strictEqual(M.ppSummary(st, { subScale: { [A.id]: 50 } }).bySub[0].total, 5, 'what-if A at 50: 1550/600 → 3, 700/600 → 2');
  const sw = M.addRoad(st, K(st, A, 'sw-layout').id, { road: 'FM 1960', start: '10+00', end: '25+50' });
  assert.strictEqual(sw.warns.length, 0, 'same road in another section is not an overlap');
  assert.match(M.addRoad(st, pA.id, { road: 'FM 1960', start: '20+00', end: '30+00' }).warns[0], /Overlaps/);
  assert.strictEqual(M.ppSummary(st).length, 1550 + 700 + 480 + 1000, 'total length counts a road once even when in two sections');
  const b = M.branchStats(st, A, 'Drainage'); assert.strictEqual(b.pp, 4); assert.strictEqual(b.roads, 3);
  assert.strictEqual(M.discStats(st, 'SWP3').pp, 2);
});
t('generate PP per road: titles carry the road, idempotent, safe shrink, delete road', () => {
  const { st, A, pA, r1 } = setup();
  let pl = M.planGenerate(st, r1.id);
  assert.deepStrictEqual(pl.create.map((c) => c.title), ['Drainage Plan & Profile – FM 1960 Sta 10+00 to 22+00 (PP 1 of 2)', 'Drainage Plan & Profile – FM 1960 Sta 22+00 to 25+50 (PP 2 of 2)']);
  M.applyGenerate(st, r1.id, pl);
  assert.strictEqual(M.pendingCount(M.planGenerate(st, r1.id)), 0);
  const g1 = pA.sheets[0]; assert.strictEqual(g1.gen.road, r1.id); assert.strictEqual(g1.road, 'FM 1960'); assert.strictEqual(g1.discipline, 'Drainage');
  M.addSheet(st, pA.id, { title: 'P&P notes' });
  M.updateSheet(st, pA.sheets[1].id, { status: 'In progress' });
  M.setStations(st, r1.id, { end: '20+00' });
  assert.strictEqual(pA.sheets.filter((s) => s.gen).length, 2, 'edited PP 2 kept when road gets shorter');
  pl = M.planGenerate(st, r1.id); assert.strictEqual(pl.removeTouched.length, 1);
  M.applyGenerate(st, r1.id, pl, { removeTouched: true });
  assert.strictEqual(pA.sheets.filter((s) => s.gen).length, 1);
  const ps = M.planSection(st, pA.id); assert.strictEqual(M.pendingCount(ps), 0);
  M.deleteRoad(st, r1.id);
  assert.deepStrictEqual(pA.sheets.map((s) => s.title), ['P&P notes'], 'deleting a road removes only its generated sheets');
  void A;
});
t('sheets live in sections: add, move, discipline change moves to the matching branch', () => {
  const { st, A } = setup();
  const x = K(st, A, 'dr-hds-x');
  const sh = M.addSheet(st, x.id, { title: 'Culvert Layout', discipline: 'SWP3' });
  assert.strictEqual(sh.discipline, 'Drainage', 'section decides the discipline');
  M.updateSheet(st, sh.id, { sec: K(st, A, 'dr-std').id });
  assert.ok(K(st, A, 'dr-std').sheets.includes(sh) && !x.sheets.includes(sh));
  const e = M.addSheet(st, x.id, { title: 'Erosion control summary' });
  M.updateSheet(st, e.id, { discipline: 'SWP3' });
  assert.strictEqual(M.findSheet(st, e.id).seg.key, 'sw-sum');
  assert.throws(() => M.moveSheet(st, sh.id, K(st, st.subs[1], 'dr-std').id), /within their sub-project/);
  const d = M.duplicateSheet(st, sh.id); assert.strictEqual(M.findSheet(st, d.id).seg.key, 'dr-std');
  assert.strictEqual(M.addStandardSet(st, A.id, { discipline: 'Drainage' }).length, 13, 'standard set skips titles a section already has');
  assert.strictEqual(M.addStandardSet(st, A.id).length, 2, 'then the SWP3 part');
  assert.strictEqual(M.addStandardSet(st, A.id).length, 0, 'idempotent');
});
t('section lists are editable: add / rename / reorder / remove / roads on-off', () => {
  const st = M.newState();
  const d = M.addSectionDef(st, { title: 'Utility Conflict Sheets', discipline: 'Drainage', after: 'dr-std' });
  assert.ok(st.subs.every((s) => s.segments.some((x) => x.key === d.key)));
  assert.strictEqual(M.sectionsOf(st.subs[0], 'Drainage').slice(-1)[0].title, 'Utility Conflict Sheets');
  assert.throws(() => M.addSectionDef(st, { title: 'standards', discipline: 'Drainage' }), /already/);
  M.moveSectionDef(st, d.key, -1);
  assert.deepStrictEqual(M.sectionsOf(st.subs[2], 'Drainage').slice(-2).map((s) => s.title), ['Utility Conflict Sheets', 'Standards']);
  M.renameSectionDef(st, 'dr-bd-welded', 'Bridge Deck Drainage Details (Welded)');
  assert.ok(st.subs.every((s) => M.secOf(s, 'dr-bd-welded').title === 'Bridge Deck Drainage Details (Welded)'));
  const sec = M.secOf(st.subs[0], d.key); M.addSheet(st, sec.id, { title: 'UC-1' });
  assert.throws(() => M.removeSectionDef(st, d.key), /still has 1/);
  M.deleteSheet(st, sec.sheets[0].id); M.removeSectionDef(st, d.key);
  assert.ok(!st.subs[0].segments.some((x) => x.key === d.key));
  M.setSectionPP(st, 'dr-det', true); const det = M.secOf(st.subs[0], 'dr-det');
  M.addRoad(st, det.id, { road: 'Pond 1', start: '0+00', end: '13+00' });
  assert.strictEqual(M.segPP(st, st.subs[0], det).total, 2);
  assert.throws(() => M.setSectionPP(st, 'dr-det', false), /road entries/);
  M.setSectionPP(st, 'dr-std', true); M.setSectionPP(st, 'dr-std', false); assert.ok(!M.isPPSec(M.secOf(st.subs[0], 'dr-std')));
  assert.throws(() => { for (const x of M.secDefs(st, 'SWP3').slice()) M.removeSectionDef(st, x.key); }, /at least one/);
});
t('mapSection: closest section by title keywords; unmatched → Other', () => {
  const st = M.newState();
  const m = (t, d) => M.mapSection(st, t, d);
  assert.strictEqual(m('Overall Drainage Area Map'), 'dr-odam'); assert.strictEqual(m('Drainage Area Map'), 'dr-dam');
  assert.strictEqual(m('Hydrologic / Hydraulic Data Sheet'), 'dr-hds-runoff'); assert.strictEqual(m('Inlet / Manhole Schedule'), 'dr-hds-inlet');
  assert.strictEqual(m('Storm Sewer Computations'), 'dr-hds-ss'); assert.strictEqual(m('Cross Culvert Profile'), 'dr-hds-x'); assert.strictEqual(m('Culvert Layout'), 'dr-hds-x');
  assert.strictEqual(m('Trunkline P&P'), 'dr-trunk'); assert.strictEqual(m('Drainage Laterals 2'), 'dr-lat'); assert.strictEqual(m('Outfall / Detention / Pond Layout'), 'dr-det');
  assert.strictEqual(m('Detention Basin Cross Section'), 'dr-det-xs'); assert.strictEqual(m('Special Junction Box Details'), 'dr-jb');
  assert.strictEqual(m('Bridge Deck Drawing Details Welded'), 'dr-bd-welded'); assert.strictEqual(m('Bridge Deck Drain Details'), 'dr-bd-det'); assert.strictEqual(m('Bridge Deck Drain Summary'), 'dr-bd-sum');
  assert.strictEqual(m('Standard & Miscellaneous Drainage Details'), 'dr-std'); assert.strictEqual(m('Ditch / Channel Details'), 'dr-other'); assert.strictEqual(m('Utility Conflicts'), 'dr-other');
  assert.strictEqual(m('SWP3 Summary & Notes'), 'sw-sum'); assert.strictEqual(m('SWP3 Standard Details'), 'sw-std'); assert.strictEqual(m('Erosion Control Layout'), 'sw-layout'); assert.strictEqual(m('Silt fence misc', 'SWP3'), 'sw-other');
});
function v2Fixture() {
  const s = V2.newState('SH 249 Drainage'); const [A, B, C] = s.subs;
  const g1 = V2.addSegment(s, A.id, { road: 'FM 1960', start: '10+00', end: '25+50' }).seg;
  V2.applyGenerate(s, g1.id, V2.planGenerate(s, g1.id)); V2.bulkAddTemplates(s, g1.id, {});
  s.settings.series[1].enabled = true;
  const g2 = V2.addSegment(s, B.id, { road: 'Kuykendahl', start: '100+00', end: '104+80', scale: 40 }).seg;
  V2.applyGenerate(s, g2.id, V2.planGenerate(s, g2.id));
  V2.addSheet(s, g2.id, { title: 'Bridge Deck Drain Summary', discipline: 'Drainage' });
  V2.addSheet(s, g2.id, { title: 'Utility Conflicts', discipline: 'Drainage' });
  const g3 = V2.addSegment(s, C.id, { road: 'Spring Cypress', start: '0+00', end: '6+00' }).seg;
  const pp1 = g1.sheets.find((x) => x.gen && x.gen.series === 'pp-drain');
  V2.updateSheet(s, pp1.id, { status: 'In progress', owner: 'Ana Ruiz', due: '2026-11-01', notes: 'check HGL', pct: 50, hoursBudget: 8 });
  const cul = g1.sheets.find((x) => x.title === 'Culvert Layout');
  V2.updateSheet(s, cul.id, { status: 'Done', owner: 'Bo', number: '72', qc: { 'Design check': true } });
  V2.addLink(s, { t: 'sheet', id: cul.id }, { t: 'sheet', id: g2.sheets.find((x) => x.title === 'Bridge Deck Drain Summary').id }, 'dep');
  V2.addLink(s, { t: 'seg', id: g1.id }, { t: 'seg', id: g3.id }, 'dep');
  V2.markRevised(s, { t: 'sheet', id: cul.id }, 'rev A');
  s.reportNotes['sub:' + A.id] = 'A note'; s.reportNotes['disc:' + B.id + ':SWP3'] = 'B swp3'; s.reportNotes.project = 'P note';
  V2.saveView(s, 'Mine', { owner: 'Ana Ruiz' });
  return { s, g1, g2, g3, pp1, cul, A, B, C };
}
t('v2 → v3 migration: nothing lost, sheets mapped to sections, roads kept as data, links/notes preserved', () => {
  const F = v2Fixture(); const json = JSON.parse(JSON.stringify(F.s));
  const st = M.migrate(JSON.parse(JSON.stringify(json)));
  assert.strictEqual(st.schema, 3);
  assert.strictEqual(M.allSheets(st).length, V2.allSheets(F.s).length, 'same number of sheets');
  const ids = (x) => x.map((r) => r.sh.id).sort();
  assert.deepStrictEqual(ids(M.allSheets(st)), ids(V2.allSheets(F.s)), 'same sheet ids');
  for (const r of V2.allSheets(F.s)) { const n = M.findSheet(st, r.sh.id).sh; for (const k of ['status', 'owner', 'due', 'notes', 'number', 'pct', 'hoursBudget', 'milestone', 'discipline']) assert.deepStrictEqual(n[k], r.sh[k], k + ' of ' + r.sh.title); assert.deepStrictEqual(n.qc, r.sh.qc); assert.strictEqual(n.road, r.seg.road); }
  assert.strictEqual(M.ppSummary(st).total, V2.ppSummary(F.s).total, 'PP total unchanged');
  assert.deepStrictEqual(M.ppSummary(st).byDisc, V2.ppSummary(F.s).byDisc);
  const A = st.subs[0];
  const where = (title) => M.findSheet(st, M.allSheets(st).find((r) => r.sh.title === title).sh.id).seg.key;
  assert.strictEqual(where('Culvert Layout'), 'dr-hds-x'); assert.strictEqual(where('Drainage Area Map'), 'dr-dam'); assert.strictEqual(where('Utility Conflicts'), 'dr-other');
  assert.strictEqual(where('Bridge Deck Drain Summary'), 'dr-bd-sum'); assert.strictEqual(where('SWP3 Standard Details'), 'sw-std');
  assert.ok(M.secDef(st, 'dr-other') && M.secDef(st, 'dr-other').title === 'Other Drainage', 'Other Drainage created because something was unmatched');
  const pp = M.findSheet(st, F.pp1.id); assert.strictEqual(pp.seg.key, 'dr-pp'); assert.strictEqual(pp.sh.title, 'Drainage Plan & Profile – FM 1960 Sta 10+00 to 22+00 (PP 1 of 2)');
  assert.deepStrictEqual(A.roads.map((r) => [M.secOf(A, 'dr-pp').id === r.sec || M.secOf(A, 'sw-layout').id === r.sec || M.secOf(A, 'dr-trunk').id === r.sec, r.road, r.start, r.end]).length, 3, 'A: FM 1960 in Drainage P&P, Trunkline (storm series on) and SWP3 Layout');
  assert.strictEqual(A.roads.find((r) => r.id === F.g1.id).sec, M.secOf(A, 'dr-pp').id, 'Drainage P&P road keeps the old segment id');
  const B = st.subs[1]; assert.ok(M.secOf(B, 'dr-trunk').sheets.some((s) => s.gen) && M.secOf(B, 'sw-layout').sheets.length === 1);
  assert.strictEqual(st.links.length, 2);
  const lab = st.links.map((l) => M.refLabel(st, l.src) + ' > ' + M.refLabel(st, l.dst));
  assert.ok(lab.includes('A · Hydraulic Data Sheet - Crossing · Culvert Layout > B · Bridge Deck Drain Summary · Bridge Deck Drain Summary'));
  assert.ok(lab.includes('A · Drainage Plan & Profile (section) > C · Drainage Plan & Profile (section)'), 'whole-road connector → P&P section');
  assert.strictEqual(M.needsUpdate(st, st.links.find((l) => l.src.t === 'sheet').dst).length, 1, 'revision flag survives');
  assert.strictEqual(st.reportNotes['disc:' + A.id + ':Drainage'], 'A note'); assert.strictEqual(st.reportNotes['disc:' + B.id + ':SWP3'], 'B swp3'); assert.strictEqual(st.reportNotes.project, 'P note');
  assert.strictEqual(st.views[0].name, 'Mine');
  assert.strictEqual(A.templates.length, 15, 'untouched v2 default templates → v3 section list');
  assert.ok(st.migration && st.migration.from === 2 && st.migration.sheets === M.allSheets(st).length);
  assert.ok(/Migrated to v3/.test(st.log[0].msg));
  assert.deepStrictEqual(M.migrate(JSON.parse(JSON.stringify(st))), JSON.parse(JSON.stringify(st)), 'v3 is stable through normalize');
  assert.deepStrictEqual(json, JSON.parse(JSON.stringify(F.s)), 'source v2 object not modified');
  const back = M.readBackup(JSON.parse(JSON.stringify(V2.backupFile(F.s)))); assert.strictEqual(back.schema, 3, 'v2 backup files import into v3');
  /* edited v2 templates are kept, mapped */
  const s2 = JSON.parse(JSON.stringify(F.s)); s2.subs[0].templates.push({ id: 'x', title: 'Junction Box Details', discipline: 'Drainage' });
  const m2 = M.migrate(s2); assert.strictEqual(m2.subs[0].templates.length, 12); assert.strictEqual(m2.subs[0].templates.find((x) => x.id === 'x').sec, 'dr-jb');
});
t('migration from v1 encrypted vault (via v2)', async () => {
  const v1 = { schema: 1, project: { name: 'Old' }, staff: ['Ana'], settings: { autoLockMin: 5 }, lastBackup: '2026-10-01T00:00:00Z', created: '2026-09-01',
    subs: ['A', 'B', 'C', 'D'].map((code, i) => ({ id: 's' + i, code, name: 'Sub ' + code, templates: [{ id: 't', title: 'Culvert Layout', discipline: 'Drainage' }],
      segments: i ? [] : [{ id: 'g1', name: 'Seg', road: 'FM 1', start: 1000, end: 2550, notes: '', sheets: [{ id: 'h1', title: 'Culvert Layout', discipline: 'Drainage', status: 'Done', owner: 'Ana', due: '', notes: 'n' }] }] })) };
  const { env } = await C.seal('old vault pass', v1, 'vault', ITER);
  await assert.rejects(C.open('wrong one here', env, 'vault'), /Wrong passphrase/);
  const st = M.migrate((await C.open('old vault pass', env, 'vault')).data);
  assert.strictEqual(st.schema, 3);
  assert.deepStrictEqual(st.staff, [{ name: 'Ana', role: '' }]);
  const hit = M.findSheet(st, 'h1');
  assert.deepStrictEqual([hit.sh.status, hit.sh.pct, hit.sh.owner, hit.sh.notes, hit.seg.key], ['Done', 100, 'Ana', 'n', 'dr-hds-x']);
  assert.strictEqual(M.ppSummary(st).total, 4, 'FM 1 in Drainage P&P + SWP3 Layout, 2 each');
  assert.strictEqual(st.lastBackup, v1.lastBackup);
  assert.ok(/v1/.test(st.log[0].msg));
  assert.throws(() => M.migrate({ schema: 9, subs: [] }), /Unknown/);
});
t('backup round trip (plain v3)', () => {
  const { st, r1 } = setup();
  M.applyGenerate(st, r1.id, M.planGenerate(st, r1.id));
  const file = JSON.stringify(M.backupFile(st));
  assert.deepStrictEqual(M.readBackup(JSON.parse(file)), JSON.parse(JSON.stringify(st)));
  assert.throws(() => M.readBackup({ foo: 1 }), /Not a PM backup/);
});
t('connectors across sub-projects A→B→C→D: blocked / ready / update needed / wrong way / cycles', () => {
  const st = M.newState(); const [A, B, Cc, D] = st.subs;
  const s = (sub, key, title) => M.addSheet(st, K(st, sub, key).id, { title });
  const a = s(A, 'dr-hds-x', 'A culvert'), b = s(B, 'dr-hds-x', 'B culvert'), c = s(Cc, 'dr-hds-x', 'C culvert'), d = s(D, 'dr-std', 'D std');
  const R = (x) => ({ t: 'sheet', id: x.id });
  assert.strictEqual(M.addLink(st, R(a), R(b), 'dep').warns.length, 0);
  M.addLink(st, R(b), R(c), 'dep'); M.addLink(st, R(c), R(d), 'update');
  assert.match(M.addLink(st, R(d), R(a), 'update').warns[0], /upstream/);
  assert.throws(() => M.addLink(st, R(c), R(a), 'dep'), /circular/);
  assert.throws(() => M.addLink(st, R(a), R(b), 'dep'), /already exists/);
  assert.throws(() => M.addLink(st, R(a), R(a), 'dep'), /itself/);
  assert.strictEqual(M.blockers(st, R(b)).length, 1);
  M.updateSheet(st, a.id, { status: 'Done' });
  assert.ok(M.flags(st).ready.some((x) => x.ref.id === b.id));
  M.markRevised(st, R(c), 'moved inlet');
  assert.strictEqual(M.needsUpdate(st, R(d)).length, 1); M.markUpdated(st, R(d)); assert.strictEqual(M.needsUpdate(st, R(d)).length, 0);
  const sec = K(st, Cc, 'dr-pp'); M.addLink(st, { t: 'seg', id: sec.id }, R(d), 'dep');
  assert.strictEqual(M.refLabel(st, { t: 'seg', id: sec.id }), 'C · Drainage Plan & Profile (section)');
  assert.ok(!M.isDone(st, { t: 'seg', id: sec.id }));
  { const dn = [...M.impact(st, R(b)).down]; assert.ok(dn.includes('sheet:' + c.id) && dn.includes('sheet:' + d.id)); }
  M.deleteSheet(st, c.id); assert.ok(st.links.every((l) => l.src.id !== c.id && l.dst.id !== c.id), 'pruned');
  assert.ok(/From section/.test(M.depsCSV(st)));
});
t('sheet fields, %/status sync, QC, staff roles, log, filters, sort, views, summary', () => {
  const { st, A, pA, r1 } = setup();
  M.applyGenerate(st, r1.id, M.planGenerate(st, r1.id));
  const x = K(st, A, 'dr-hds-x'); const sh = M.addSheet(st, x.id, { title: 'Culvert Layout', road: 'FM 1960' });
  M.updateSheet(st, sh.id, { pct: 100 }); assert.strictEqual(sh.status, 'Done');
  M.updateSheet(st, sh.id, { status: 'In review' }); assert.strictEqual(sh.revs.length, 1, 're-open marks a revision');
  M.updateSheet(st, pA.sheets[0].id, { owner: 'Ana', due: '2026-10-01' });
  assert.ok(st.staff.some((s) => s.name === 'Ana'));
  assert.throws(() => M.updateSheet(st, sh.id, { pct: -1 }));
  const rows = M.allSheets(st);
  assert.strictEqual(M.filterRows(rows, { q: 'fm 1960' }).length, 3, 'search finds sheets by road (tag or road entry)');
  assert.strictEqual(M.filterRows(rows, { section: 'dr-pp' }).length, 2);
  assert.strictEqual(M.filterRows(rows, { kind: 'pp' }).length, 2);
  assert.strictEqual(M.filterRows(rows, { when: 'overdue' }, today).length, 1);
  assert.strictEqual(M.filterRows(rows, { owner: '(unassigned)' }).length, 2);
  assert.strictEqual(M.sortRows(rows, 'due', 'asc', (r) => r.sh.due)[0].sh.due, '2026-10-01');
  M.saveView(st, 'v', { owner: 'Ana' }); assert.strictEqual(st.views.length, 1);
  const S = M.summary(st, today); assert.strictEqual(S.overall.total, 3); assert.strictEqual(S.discs[0].total, 3); assert.strictEqual(S.overdue.length, 1);
  assert.ok(st.log.some((l) => /Culvert Layout/.test(l.msg)));
});
t('CSV exports: sheets (section + road columns, formula guard), PP summary per section, sub, discipline', () => {
  const { st, A, r1 } = setup();
  M.applyGenerate(st, r1.id, M.planGenerate(st, r1.id));
  M.addSheet(st, K(st, A, 'dr-std').id, { title: '=HYPERLINK("x")', notes: 'a\nb' });
  const [head, , , row] = M.toCSV(st, M.allSheets(st)).split('\r\n');
  assert.ok(head.startsWith('Sub-project,Discipline,Section,Road,Sheet No,Sheet'));
  assert.ok(row.includes('"\'=HYPERLINK(""x"")"') && row.endsWith('"a\nb"'));
  const pp = M.ppCSV(st);
  assert.ok(pp.includes('A,Drainage,Drainage Plan & Profile,FM 1960,10+00,25+50,1550,100,1200,0,2'));
  assert.ok(pp.includes('A total,Drainage,Drainage Plan & Profile,,,,,,,,2') && pp.includes('Project total,All,,,,,2030,,,,3'));
});
t('sheet index + numbering ranges + auto-number in project order', () => {
  const { st, A, B, r1 } = setup();
  M.applyGenerate(st, r1.id, M.planGenerate(st, r1.id));
  const it = M.addIndexItem(st, { title: 'Utility Conflict Sheet' }); assert.strictEqual(it.sec, 'dr-other'); assert.ok(M.secDef(st, 'dr-other'));
  let P = M.planIndex(st); assert.strictEqual(P.count, 4 * 16);
  M.applyIndex(st); assert.strictEqual(M.planIndex(st).count, 0, 'never duplicates');
  assert.strictEqual(M.secOf(B, 'dr-other').sheets[0].title, 'Utility Conflict Sheet');
  M.updateIndexItem(st, it.id, { sec: 'dr-std' }); assert.strictEqual(M.planIndex(st).count, 4);
  M.indexToTemplates(st); assert.ok(A.templates.every((t) => t.sec));
  const dam = M.secOf(A, 'dr-dam').sheets[0];
  assert.strictEqual(M.rangeFor(st, dam).label, 'Drainage Area Map'); assert.strictEqual(M.rangeFor(st, M.secOf(A, 'dr-pp').sheets[0]).label, 'Drainage Plan & Profile');
  const n = M.autoNumber(st, { all: true }); assert.ok(n >= 40);
  assert.strictEqual(dam.number, '1'); assert.strictEqual(M.secOf(A, 'dr-pp').sheets[0].number, '10');
  st.settings.numbering.unshift({ key: 'sec:dr-std', label: 'Standards', from: 200, to: 299 });
  assert.strictEqual(M.suggestNumber(st, M.secOf(A, 'dr-std').sheets[0]), '200', 'a range can be set per section');
  M.updateSheet(st, M.secOf(B, 'dr-dam').sheets[0].id, { number: '10' });
  assert.ok(M.numberIssues(st, M.secOf(B, 'dr-dam').sheets[0]).some((x) => /Duplicate/.test(x)));
});
t('week view, board filters, report data by discipline / sub-project', () => {
  const { st, A, B } = setup();
  const a = M.addSheet(st, K(st, A, 'dr-dam').id, { title: 'DAM', due: '2026-10-20' });
  const b = M.addSheet(st, K(st, B, 'sw-sum').id, { title: 'SW notes', due: '2026-11-02' });
  M.addLink(st, { t: 'sheet', id: a.id }, { t: 'sheet', id: b.id }, 'dep');
  const w = M.weekView(st, {}, today);
  assert.deepStrictEqual([w.overdue.length, w.due7.length, w.blocked.length], [1, 1, 1]);
  assert.strictEqual(M.weekView(st, { discipline: 'SWP3' }, today).overdue.length, 0);
  const R = M.report(st, today);
  assert.strictEqual(R.discs.length, 2); assert.strictEqual(R.discs[1].total, 1); assert.strictEqual(R.subs[0].discs[0].total, 1);
  assert.strictEqual(R.pp.total, 3);
});
t('tree collapse levels and focus (discipline → sub-project → section)', () => {
  const { st, A } = setup();
  const c = M.collapseLevel(st, 2);
  assert.strictEqual(c.root, false); assert.strictEqual(c['dtop:Drainage'], false); assert.strictEqual(c['disc:' + A.id + ':Drainage'], true);
  const sec = K(st, A, 'dr-pp');
  const f = M.focusBranch(st, { disc: 'Drainage', sub: A.id, seg: sec.id });
  assert.strictEqual(f['dtop:SWP3'], true); assert.strictEqual(f['disc:' + A.id + ':Drainage'], false); assert.strictEqual(f['seg:' + sec.id], false); assert.strictEqual(f['disc:' + st.subs[1].id + ':Drainage'], true);
});
t('stations on road entries: preview, regenerate keeping edits, shift, reverse, table rows (all-or-nothing)', () => {
  const { st, A, pA, r1 } = setup();
  M.applyGenerate(st, r1.id, M.planGenerate(st, r1.id));
  M.updateSheet(st, pA.sheets[0].id, { owner: 'Ana' });
  const pv = M.previewStations(st, r1.id, { end: '40+00' });
  assert.strictEqual(pv.count, 3); assert.strictEqual(pv.plan.create.length, 1); assert.strictEqual(pv.pp.Drainage, 3);
  assert.match(M.previewStations(st, r1.id, { end: '5+00' }).errs[0], /after start/);
  M.setStations(st, r1.id, { end: '40+00' }); assert.strictEqual(pA.sheets.length, 3); assert.strictEqual(pA.sheets[0].owner, 'Ana');
  M.shiftStations(st, r1.id, 100); assert.strictEqual(r1.start, 1100); assert.strictEqual(pA.sheets[0].gen.start, 1100);
  M.setStations(st, r1.id, { reverse: true }); assert.strictEqual(pA.sheets[0].gen.start, 3500, 'PP 1 at the high end');
  const n0 = JSON.stringify(st);
  assert.throws(() => M.applyStationRows(st, [{ roadId: r1.id, start: '12+00' }, { roadId: r1.id, end: 'bad' }]), /Row 2/);
  assert.strictEqual(JSON.stringify(st), n0, 'all-or-nothing');
  const out = M.applyStationRows(st, [{ roadId: r1.id, start: '11+00' }, { secId: pA.id, road: 'Cypress', start: '0+00', end: '5+00' }]);
  assert.deepStrictEqual([out.updated, out.added], [1, 1]);
  assert.deepStrictEqual(M.parseTSV('a\tb\r\nc\td\n'), [['a', 'b'], ['c', 'd']]);
  void A;
});
t('split / merge / copy road entries', () => {
  const { st, A, B, pA, r1 } = setup();
  M.applyGenerate(st, r1.id, M.planGenerate(st, r1.id));
  const sp = M.splitSegment(st, r1.id, '22+00');
  assert.deepStrictEqual([sp.a.end, sp.b.start, sp.moved], [2200, 2200, 1]);
  assert.strictEqual(pA.sheets.filter((s) => s.gen && s.gen.road === sp.b.id).length, 1);
  assert.deepStrictEqual(M.touching(st, sp.a.id), [sp.b]);
  const m = M.mergeSegments(st, sp.a.id, sp.b.id); assert.strictEqual(m.end, 2550); assert.strictEqual(A.roads.length, 1);
  assert.strictEqual(pA.sheets.filter((s) => s.gen).length, 2);
  M.updateSheet(st, pA.sheets[0].id, { status: 'Done' });
  const cp = M.copySegment(st, r1.id, B.id, { sheets: true });
  const pB = K(st, B, 'dr-pp'); assert.strictEqual(cp.road.sec, pB.id);
  assert.ok(pB.sheets.filter((s) => s.gen && s.gen.road === cp.road.id).every((s) => s.status === 'Not started'));
});
t('bulk edit incl. section move; bulk delete; recently changed', () => {
  const { st, A } = setup();
  const x = K(st, A, 'dr-hds-x'); const a = M.addSheet(st, x.id, { title: 'a' }), b = M.addSheet(st, x.id, { title: 'b' });
  M.bulkUpdate(st, [a.id, b.id], { status: 'In review', owner: 'Ana' });
  assert.ok([a, b].every((s) => s.status === 'In review' && s.owner === 'Ana'));
  M.bulkUpdate(st, [a.id, b.id], { sec: K(st, A, 'dr-std').id }); assert.strictEqual(K(st, A, 'dr-std').sheets.length, 2);
  M.bulkUpdate(st, [a.id], { discipline: 'SWP3' }); assert.strictEqual(M.findSheet(st, a.id).seg.discipline, 'SWP3');
  assert.throws(() => M.bulkUpdate(st, [a.id], {}), /Nothing/);
  const rc = M.recentChanges(st, 5); assert.ok(rc.some((x) => x.ref.id === a.id));
  assert.strictEqual(M.bulkDelete(st, [a.id, b.id]), 2);
});
t('v3 report narrative: per discipline, per sub-project, per section; roads under P&P; notes separate', () => {
  const { st, A, B, r1 } = setup();
  M.applyGenerate(st, r1.id, M.planGenerate(st, r1.id));
  const sh = M.addSheet(st, K(st, A, 'dr-hds-x').id, { title: 'Culvert Layout', due: '2026-10-01' });
  M.updateSheet(st, sh.id, { status: 'In progress', owner: 'Ana' });
  M.setReportNote(st, 'dtop:Drainage', 'Drainage first'); M.setReportNote(st, 'disc:' + A.id + ':Drainage', 'A dr'); M.setReportNote(st, 'sec:' + K(st, A, 'dr-pp').id, 'pp note');
  assert.throws(() => M.setReportNote(st, 'bad', 'x'), /Bad note key/);
  const N = M.narrative(st, today);
  assert.match(N.project, /Drainage is \d+% \(0 of 3 sheets\); SWP3 is 0%/);
  assert.match(N.project, /2 road entries and need 3 PP sheets \(3 Drainage, 0 SWP3\)/);
  const D = N.discs[0]; assert.strictEqual(D.note, 'Drainage first'); assert.match(D.text, /By sub-project: A \d+%/);
  const a = D.subs[0]; assert.strictEqual(a.note, 'A dr'); assert.match(a.text, /Overdue: Culvert Layout/); assert.match(a.text, /sections not started/);
  const ppS = a.secs.find((x) => x.sec.key === 'dr-pp'); assert.match(ppS.text, /roads FM 1960 Sta 10\+00–25\+50 \(1,550 ft at 1"=100', 2 PP sheets\)/); assert.strictEqual(ppS.note, 'pp note');
  const bpp = D.subs[1].secs.find((x) => x.sec.key === 'dr-pp'); assert.match(bpp.text, /no sheets yet; roads Kuykendahl/);
  assert.match(N.discs[1].subs[0].text, /nothing started yet/);
  const T = M.narrativeText(st, today);
  assert.ok(T.includes('DRAINAGE') && T.includes('Notes: Drainage first') && T.includes('Drainage Plan & Profile notes: pp note'));
  void B;
});
t('v3 CSV: parser, mapping incl. Section, validation, road-name-only rows, old v2 CSV still imports, round trip', () => {
  const P = M.parseCSV('\uFEFFRoad;Start;End\r\n"FM ""1960"" ; main";10+00;"2,400"\r\n');
  assert.strictEqual(P.delim, ';'); assert.deepStrictEqual(P.rows[1], ['FM "1960" ; main', '10+00', '2,400']);
  assert.deepStrictEqual(M.parseCSV('a,b\n"x\ny",2\n').rows[1], ['x\ny', '2']);
  const map = M.detectMapping(['Sub Project', 'Discipline', 'Section', 'ROAD NAME', 'Begin Station', 'End_Station', 'Scale', 'Sheet Title', 'Sheet No', 'Status', 'Assigned To', 'Due Date', 'Comments', 'Depends On']);
  assert.deepStrictEqual(map, { sub: 0, discipline: 1, section: 2, road: 3, start: 4, end: 5, scale: 6, title: 7, number: 8, status: 9, owner: 10, due: 11, notes: 12, depends: 13 });
  for (const [x, y] of [['2026-11-05', '2026-11-05'], ['11/5/2026', '2026-11-05'], ['5-Nov-2026', '2026-11-05'], ['Nov 5, 2026', '2026-11-05'], ['46331', '2026-11-05']]) assert.strictEqual(M.parseDate(x), y, x);
  const st = M.newState('C'); const A = st.subs[0];
  M.addSheet(st, K(st, A, 'dr-hds-x').id, { title: 'Culvert Hydraulics Sta 22+40', number: '72' });
  const rows = M.parseCSV(M.csvTemplate()).rows; const m2 = M.detectMapping(rows[0]);
  rows.push(['E', '', '', 'X', '1+00', '2+00', '', '', '', '', '', '', '', '', '', '']);
  rows.push(['A', 'Both', 'Standards', 'SH 6', '', '', '', '', '', '', '', 'Bogus', '', '13/45/2026', '', '']);
  let plan = M.planCSV(st, rows.slice(1), m2, { mode: 'merge', defaults: false });
  assert.strictEqual(plan.summary.errors, 2);
  assert.match(plan.items[6].errors.join(' '), /Unknown sub-project/); assert.match(plan.items[7].errors.join(' '), /no road entries/); assert.match(plan.items[7].errors.join(' '), /Unknown status/);
  assert.ok(plan.items[2].skip && /not overwritten/.test(plan.items[2].warns.join(' ')));
  assert.strictEqual(plan.items[5].f.sec.key, 'sw-sum', 'no section → picked from the title');
  assert.strictEqual(plan.summary.newRoads, 3);
  const made = M.applyCSV(st, plan, { skipBad: true });
  assert.deepStrictEqual([made.roads, made.links], [3, 1]);
  const tr = M.roadsOf(A, K(st, A, 'dr-trunk')); assert.ok(tr.length === 1 && tr[0].start === null, 'road-name-only row');
  assert.strictEqual(M.segPP(st, A, K(st, A, 'dr-pp')).total, 2);
  const B = st.subs[1]; assert.strictEqual(M.roadsOf(B, K(st, B, 'sw-layout'))[0].scale, 40);
  /* old v2 export (no Section column) */
  const v2 = V2.newState('Old'); const g = V2.addSegment(v2, v2.subs[0].id, { road: 'FM 529', start: '0+00', end: '13+00' }).seg;
  V2.applyGenerate(v2, g.id, V2.planGenerate(v2, g.id)); V2.addSheet(v2, g.id, { title: 'Culvert Layout', owner: 'Bo' }); V2.updateSheet(v2, g.sheets[0].id, { status: 'Done' });
  const oc = M.parseCSV(V2.exportImportCSV(v2)).rows;
  const st3 = M.newState('N'); const p3 = M.planCSV(st3, oc.slice(1), M.detectMapping(oc[0]), { mode: 'merge' });
  assert.strictEqual(p3.summary.errors, 0);
  M.applyCSV(st3, p3);
  const A3 = st3.subs[0];
  assert.strictEqual(M.secOf(A3, 'dr-pp').sheets.filter((s) => s.gen).length, 2); assert.strictEqual(M.secOf(A3, 'sw-layout').sheets.filter((s) => s.gen).length, 2);
  assert.strictEqual(M.secOf(A3, 'dr-pp').sheets[0].status, 'Done'); assert.strictEqual(M.secOf(A3, 'dr-hds-x').sheets[0].owner, 'Bo');
  /* v3 round trip */
  const out = M.exportImportCSV(st);
  const st2 = M.newState('C2'); const R2 = M.parseCSV(out).rows;
  M.applyCSV(st2, M.planCSV(st2, R2.slice(1), M.detectMapping(R2[0]), { mode: 'merge' }));
  const norm = (t) => t.replace(/^\uFEFF/, '');
  assert.strictEqual(norm(M.exportImportCSV(st2)), norm(out), 'export → import → export is identical');
  /* defaults: road rows add the standard set + PP */
  const st4 = M.newState('D'); const r4 = M.parseCSV('Sub,Discipline,Road,Start,End\nA,Drainage,FM 1,0+00,24+00\n').rows;
  const m4 = M.applyCSV(st4, M.planCSV(st4, r4.slice(1), M.detectMapping(r4[0]), { defaults: true }));
  assert.deepStrictEqual([m4.roads, m4.pp, m4.sheets], [1, 2, 13]);
});
t('crypto still works (kept for v1 migration)', async () => {
  assert(C.ITER >= 600000);
  const { env } = await C.seal('pass phrase 123', { a: 1 }, 'vault', ITER);
  const ct = C.unb64(env.ct); ct[3] ^= 1;
  await assert.rejects(C.open('pass phrase 123', { ...env, ct: C.b64(ct) }, 'vault'), /modified/);
});

t('v2.9 undo/redo history: steps, coalescing, cap, redo cleared on new edit', () => {
  const H = M.history(30, 800);
  H.record('s0');
  for (let i = 1; i <= 40; i++) H.record('s' + i, { hard: true, now: i * 1000 });
  assert.strictEqual(H.undo.length, 30, 'keeps the last 30 actions');
  assert.strictEqual(H.step(-1), 's39'); assert.strictEqual(H.step(-1), 's38');
  assert.strictEqual(H.step(1), 's39');
  H.record('typed1', { now: 100000 }); H.record('typed2', { now: 100300 }); H.record('typed3', { now: 100500 });
  assert.strictEqual(H.redo.length, 0);
  assert.strictEqual(H.step(-1), 's39', 'a typing burst undoes as one step');
  H.step(1); H.record('gen', { hard: true, now: 100600 });
  assert.strictEqual(H.step(-1), 'typed3', 'hard edits are never merged');
  assert.strictEqual(M.history().step(-1), null);
});

t('v2.15 command palette search ranking', () => {
  const items = [{ label: 'Open Settings', kind: 'action' }, { label: 'FM 1960 Sta 10+00–25+50', hint: 'A · road' }, { label: 'Culvert Layout', hint: 'A · FM 1960' }, { label: 'Print report', kw: 'pdf' }];
  assert.deepStrictEqual(M.paletteSearch(items, 'fm 1960').map((x) => x.label), ['FM 1960 Sta 10+00–25+50', 'Culvert Layout']);
  assert.strictEqual(M.paletteSearch(items, 'pdf')[0].label, 'Print report');
  assert.strictEqual(M.paletteSearch(items, 'zzz').length, 0);
  assert.strictEqual(M.paletteSearch(items, '').length, 4);
  assert.strictEqual(M.paletteSearch(items, 'sta 10+00')[0].label, 'FM 1960 Sta 10+00–25+50');
});

(async () => {
  let passed = 0;
  for (const [name, fn] of tests) {
    try { await fn(); passed++; } catch (e) { console.error('FAIL', name, e); process.exit(1); }
  }
  console.log('ok', passed, 'tests');
})();
