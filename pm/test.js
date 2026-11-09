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
  assert.deepStrictEqual(dr, ['Overall Drainage Area Map', 'Drainage Area Map', 'Hydraulic Data Sheet - Runoff Computations', 'Hydraulic Data Sheet - Inlet Computations', 'Hydraulic Data Sheet - Storm Sewer Computations', 'Hydraulic Data Sheet - Crossing', 'Drainage Plan & Profile', 'Trunkline Plan & Profile', 'Drainage Laterals', 'Detention Basin', 'Special Junction Box Details', 'Bridge Deck Drawing Details (Welded)', 'Bridge Deck Drain Details', 'Bridge Deck Drain Summary', 'Standards']);
  assert.deepStrictEqual(M.sectionsOf(st.subs[0], 'SWP3').map((s) => s.title), ['SWP3 Layout', 'SWP3 Summary & Notes', 'SWP3 Standard Details', 'Other SWP3']);
  assert.deepStrictEqual(st.subs[0].segments.filter(M.isPPSec).map((s) => s.key), ['dr-pp', 'dr-trunk', 'sw-layout']);
  assert.ok(st.subs.every((s) => s.segments.length === 19 && s.roads.length === 0));
  assert.strictEqual(st.subs[0].templates.length, 13, 'standard set = one sheet per non-PP section that is not a pond or box (no Other)');
});
t('road entries: name only, stations later, PP per section, totals roll up', () => {
  const { st, A, B, pA, r1, r2 } = setup();
  const trunk = K(st, A, 'dr-trunk');
  const r3 = M.addRoad(st, trunk.id, { road: 'Trunk A-3' }).road;
  assert.strictEqual(r3.start, null); assert.strictEqual(M.segLabel(r3), 'Trunk A-3');
  assert.strictEqual(M.segPP(st, A, trunk).total, 0, 'no stations → no PP yet');
  assert.throws(() => M.addRoad(st, K(st, A, 'dr-dam').id, { road: 'X' }), /no road entries/);
  assert.throws(() => M.addRoad(st, K(st, A, 'dr-lat').id, { road: 'Lateral A' }), /count/);
  assert.throws(() => M.addRoad(st, trunk.id, { road: '' }), /Road name/);
  assert.throws(() => M.addRoad(st, trunk.id, { road: 'Y', start: '10+00' }), /End station/);
  M.updateRoad(st, r3.id, { start: '0+00', end: '7+00' });
  assert.strictEqual(M.segPP(st, A, trunk).total, 1);
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
  assert.strictEqual(M.addStandardSet(st, A.id, { discipline: 'Drainage' }).length, 11, 'standard set skips titles a section already has');
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
  M.setSectionPP(st, 'dr-odam', true); const det = M.secOf(st.subs[0], 'dr-odam');
  M.addRoad(st, det.id, { road: 'Pond 1', start: '0+00', end: '13+00' });
  assert.strictEqual(M.segPP(st, st.subs[0], det).total, 2);
  assert.throws(() => M.setSectionPP(st, 'dr-odam', false), /road entries/);
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
  assert.strictEqual(m('Detention Basin Cross Section'), 'dr-det'); assert.strictEqual(m('Special Junction Box Details'), 'dr-jb');
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
  assert.strictEqual(A.templates.length, 13, 'untouched v2 default templates → v3 section list');
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
  assert.ok(head.startsWith('Sub-project,Discipline,Section,Road,Alignment,Sheet No,Sheet'));
  assert.ok(row.includes('"\'=HYPERLINK(""x"")"') && row.endsWith('"a\nb"'));
  const pp = M.ppCSV(st);
  assert.ok(pp.includes('A,Drainage,Drainage Plan & Profile,FM 1960,,10+00,25+50,1550,100,1200,0,2'));
  assert.ok(pp.includes('A total,Drainage,Drainage Plan & Profile,,,,,,,,,2') && pp.includes('Project total,All,,,,,,2030,,,,3'));
});
t('sheet index + numbering ranges + auto-number in project order', () => {
  const { st, A, B, r1 } = setup();
  M.applyGenerate(st, r1.id, M.planGenerate(st, r1.id));
  const it = M.addIndexItem(st, { title: 'Utility Conflict Sheet' }); assert.strictEqual(it.sec, 'dr-other'); assert.ok(M.secDef(st, 'dr-other'));
  let P = M.planIndex(st); assert.strictEqual(P.count, 4 * st.index.length, 'every index row is added once in A–D');
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
  assert.deepStrictEqual([m4.roads, m4.pp, m4.sheets], [1, 2, 11]);
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

t('v3.1 sub-project rename: trim, empty/duplicate blocked, ids/order/links unchanged, CSV by name or letter', () => {
  const { st, A, B, pA, pB } = setup();
  const ids = st.subs.map((s) => s.id), order = M.orderedSubs(st).map((s) => s.id);
  assert.strictEqual(M.subName(A), 'Sub-project A'); assert.strictEqual(M.subTag(A), 'A');
  assert.strictEqual(M.renameSub(st, A.id, '   ').ok, false);
  assert.match(M.renameSub(st, A.id, 'sub-project b').error, /already uses/);
  assert.match(M.renameSub(st, A.id, 'b').error, /already uses/, 'another letter is blocked');
  const r = M.renameSub(st, A.id, '  North   Segment ');
  assert.ok(r.ok); assert.strictEqual(A.name, 'North Segment'); assert.strictEqual(A.code, 'A');
  assert.strictEqual(M.subTag(A), 'North Segment'); assert.strictEqual(M.subLabel(A), 'A · North Segment');
  assert.ok(M.renameSub(st, A.id, 'north segment').ok, 'case change of own name is fine');
  M.renameSub(st, A.id, 'North Segment');
  assert.deepStrictEqual(st.subs.map((s) => s.id), ids); assert.deepStrictEqual(M.orderedSubs(st).map((s) => s.id), order);
  assert.match(st.log[0].msg, /Renamed sub-project A: north segment → North Segment/);
  /* old data without a name falls back to the letter */
  const raw = JSON.parse(JSON.stringify(st)); delete raw.subs[1].name; const st2 = M.migrate(raw);
  if (st2) assert.strictEqual(M.subName(st2.subs[1]), 'Sub-project B');
  assert.strictEqual(M.subName({ code: 'C', name: '' }), 'Sub-project C');
  /* CSV export uses the name; import matches by name or by old letter */
  assert.match(M.exportImportCSV(st), /\nNorth Segment,/);
  const rows = M.parseCSV(M.csvTemplate()).rows; const map = M.detectMapping(rows[0]);
  const mk = (sub) => [sub, 'Drainage', 'Drainage Plan and Profile', 'Rd ' + sub, '', '', '', '', '', '', '', '', '', '', '', ''];
  const plan = M.planCSV(st, [mk('North Segment'), mk('a'), mk('Sub-project A'), mk('B')], map, { mode: 'merge', defaults: false });
  assert.strictEqual(plan.summary.errors, 0);
  assert.deepStrictEqual(plan.items.map((x) => x.f.sub.code), ['A', 'A', 'A', 'B']);
  void pA; void pB; void B;
});

t('v3.2 road branches + per-sheet station ranges: computed, live, override, warn, CSV, upgrade', () => {
  const { st, A, pA, r1 } = setup();
  M.syncPP(st);
  let shs = () => M.sheetsOfGroup(A, pA, M.roadGroups(A, pA)[0]);
  assert.deepStrictEqual(shs().map((x) => M.rangeText(M.sheetRange(x))), ['Sta 10+00 – 22+00', 'Sta 22+00 – 25+50'], '100 scale = 1200 ft, last partial');
  M.updateRoad(st, r1.id, { scale: 50 }); M.syncPP(st);
  assert.deepStrictEqual(shs().map((x) => [M.sheetRange(x).start, M.sheetRange(x).end]), [[1000, 1600], [1600, 2200], [2200, 2550]], '50 scale = 600 ft');
  for (const [sc, ft] of [[20, 240], [40, 480], [100, 1200]]) { M.updateRoad(st, r1.id, { scale: sc }); M.syncPP(st); const r = shs().map((x) => M.sheetRange(x)); assert.strictEqual(r[0].end - r[0].start, Math.min(ft, 1550)); assert.strictEqual(r[r.length - 1].end, 2550); for (let i = 1; i < r.length; i++) assert.strictEqual(r[i].start, r[i - 1].end, 'no gaps/overlap'); }
  M.updateRoad(st, r1.id, { scale: 50 }); M.syncPP(st);
  const p2 = shs()[1];
  M.setSheetRange(st, p2.id, '16+50', '22+00');
  assert.ok(p2.sta && M.sheetRange(p2).manual && /16\+50 to 22\+00/.test(p2.title), 'manual override + title');
  M.syncPP(st); assert.strictEqual(M.sheetRange(p2).start, 1650, 'sync keeps the override');
  assert.ok(M.rangeWarnings(st, A, pA).some((w) => /manual range/.test(w.msg)));
  M.updateRoad(st, r1.id, { end: '15+00' }); const t2 = M.syncPP(st);
  assert.ok(shs().includes(p2) && t2.keptTouched >= 1, 'overridden extra sheet is kept, not overwritten');
  assert.ok(M.rangeWarnings(st, A, pA).some((w) => /past the computed count/.test(w.msg)), 'and warned about');
  M.resetSheetRange(st, p2.id); assert.ok(!p2.sta);
  M.updateRoad(st, r1.id, { end: '25+50' }); M.syncPP(st);
  /* same road name twice → one group; manual sheet tagged with the road joins it; others → Other */
  M.addRoad(st, pA.id, { road: 'fm 1960', start: '40+00', end: '45+00' }); M.syncPP(st);
  M.addSheet(st, pA.id, { title: 'FM 1960 typical section', road: 'FM 1960' }); M.addSheet(st, pA.id, { title: 'Loose sheet' });
  assert.strictEqual(M.roadGroups(A, pA).length, 1); assert.strictEqual(M.roadGroups(A, pA)[0].entries.length, 2);
  assert.strictEqual(shs().length, 5); assert.strictEqual(M.otherSheets(A, pA).map((x) => x.title).join(), 'Loose sheet');
  assert.ok(!M.sheetRange(shs()[4]), 'manual sheet has no range');
  const lv = M.collapseLevel(st, 4); assert.strictEqual(lv[M.roadGroups(A, pA)[0].key], true); assert.strictEqual(lv['seg:' + pA.id], false);
  /* CSV: sheet stations exported, override survives a round trip */
  M.setSheetRange(st, shs()[0].id, '10+00', '15+50');
  const csv = M.exportImportCSV(st); assert.match(csv, /Sheet start station,Sheet end station,Alignment/); assert.match(csv, /,10\+00,15\+50,\r\n/);
  const rows = M.parseCSV(csv).rows; const st2 = M.newState('R'); const plan = M.planCSV(st2, rows.slice(1), M.detectMapping(rows[0]), { mode: 'merge' });
  assert.strictEqual(plan.summary.errors, 0); M.applyCSV(st2, plan); M.syncPP(st2);
  const A2 = st2.subs[0], s2 = M.secOf(A2, 'dr-pp'); const g2 = M.sheetsOfGroup(A2, s2, M.roadGroups(A2, s2)[0]);
  assert.strictEqual(g2[0].sta.end, 1550); assert.ok(!g2[1].sta, 'unchanged ranges stay computed');
  /* upgrade from v3.1 data: ranges computed, flag set once */
  const old = JSON.parse(JSON.stringify(st)); delete old.v32; old.subs[0].segments.find((g) => g.key === 'dr-pp').sheets.find((x) => x.gen && x.gen.idx === 2).gen.start = 1;
  const st3 = M.migrate(old); const info = M.upgrade32(st3);
  assert.ok(info && info.pp >= 4 && st3.v32.at); assert.strictEqual(M.upgrade32(st3), null);
  const f = st3.subs[0].segments.find((g) => g.key === 'dr-pp').sheets.find((x) => x.gen && x.gen.idx === 2 && x.gen.road === r1.id); assert.strictEqual(f.gen.start, 1600);
  assert.strictEqual(M.upgrade32(M.newState()), null, 'new projects need no upgrade');
  assert.ok(M.narrativeText ? /FM 1960 sheets: PP 1 10\+00–15\+50/.test(JSON.stringify(M.narrative(st))) : true, 'report lists sheet ranges');
});

t('v3.3 printable report data', () => {
  const st = M.newState('Rpt'); const A = st.subs[0], pp = M.secOf(A, 'dr-pp');
  M.addRoad(st, pp.id, { road: 'FM 1960', start: '10+00', end: '22+00', scale: 50 }); M.syncPP(st);
  const s1 = pp.sheets[0]; s1.owner = 'Ana'; s1.status = 'Done';
  M.setReportMeta(st, 'preparedBy', '  Luis  '); M.setReportMeta(st, 'scope', 'Drainage + SWP3');
  assert.throws(() => M.setReportMeta(st, 'evil', 'x'));
  const P = M.printReport(st, '2026-10-29');
  assert.strictEqual(P.meta.preparedBy, 'Luis'); assert.strictEqual(P.meta.preparedFor, '');
  M.setReportMeta(st, 'preparedBy', ''); assert.strictEqual(M.reportMeta(st).preparedBy, '');
  const dr = P.tree.find((d) => d.disc === 'Drainage'); assert.strictEqual(dr.subs.length, st.subs.length);
  const sec = dr.subs[0].secs.find((x) => x.sec === pp); assert.ok(sec.pp); assert.strictEqual(sec.roads[0].name, 'FM 1960');
  assert.strictEqual(sec.roads[0].sheets.length, 2); assert.strictEqual(sec.roads[0].sheets[0].range.start, 1000); assert.strictEqual(sec.roads[0].spans[0], '10+00 – 22+00');
  const ana = P.workload.find((w) => w.owner === 'Ana'); assert.strictEqual(ana.by.Done, 1); assert.strictEqual(ana.open, 0);
  assert.strictEqual(P.workload[P.workload.length - 1].owner, 'Unassigned');
  assert.ok(Array.isArray(P.deps.blocked) && Array.isArray(P.recent) && P.N.discs.length === 2);
});

t('v3.4 report outline: takeaways, attention, next steps, branch bullets, roads, dependency pairs, workload', () => {
  const st = M.newState('Rpt'); const A = st.subs[0], pp = M.secOf(A, 'dr-pp');
  M.addRoad(st, pp.id, { road: 'FM 1960', start: '10+00', end: '22+00', scale: 50 }); M.syncPP(st);
  const [s1, s2] = pp.sheets; s1.status = 'Done'; s1.owner = 'Ana'; s2.due = '2026-10-01';
  const before = JSON.stringify(st);
  let O = M.reportOutline(st, '2026-10-29');
  assert.strictEqual(JSON.stringify(st), before, 'outline does not change the data');
  assert.ok(/^50% complete overall \(1 of 2 sheets done\)$/.test(O.takeaways[0]));
  assert.deepStrictEqual(O.attention.map((a) => a.kind), ['overdue', 'unassigned']); assert.ok(/due 2026-10-01/.test(O.attention[0].items[0]));
  assert.ok(/^Finish A \/ /.test(O.next[0]) && O.next.some((n) => /Assign owners to 1 open sheet/.test(n)));
  const dr = O.branches.find((b) => b.disc === 'Drainage'); assert.ok(dr.lead.endsWith('.') && dr.facts.some((f) => /^Status: 1 not started/.test(f)) && dr.facts.includes('PP sheets: 2'));
  assert.strictEqual(typeof dr.groups['Not started'], 'number'); assert.ok(dr.subs[0].groups['In progress'][0].startsWith(pp.title + ' (1/2)'));
  const road = dr.subs[0].roads[0]; assert.strictEqual(road.name, 'FM 1960'); assert.deepStrictEqual(road.spans, ['10+00 – 22+00']); assert.strictEqual(road.pp, 2); assert.strictEqual(road.scale, '1" = 50\'');
  assert.deepStrictEqual(road.sheets.map((x) => x.range), ['10+00 – 16+00', '16+00 – 22+00']);
  /* due within 7, dependency pair, needs update */
  s2.due = '2026-11-02';
  M.addLink(st, { t: 'sheet', id: s2.id }, { t: 'sheet', id: s1.id }, 'dep');
  O = M.reportOutline(st, '2026-10-29');
  assert.ok(O.attention.some((a) => a.kind === 'due7'));
  assert.strictEqual(O.deps.length, 1); assert.ok(/^A \/ .* depends on A \/ /.test(O.deps[0].text));
  assert.ok(O.work.find((w) => w.owner === 'Unassigned').bullets.some((b) => /^Next: 2026-11-02/.test(b)));
  assert.ok(M.reportOutline(M.newState('E'), '2026-10-29').next.length === 1);
});
t('v3.5 connector geometry: ports on the left edge, rounded orthogonal routes, lanes that never overlap', () => {
  const Gm = require('./linkgeom.js');
  const nd = (key, y, h) => ({ key, x: 860, y, w: 310, h: h || 70 });
  const a = nd('a', 0), b = nd('b', 80), c = nd('c', 160), d = nd('d', 240);
  /* ports: on the left edge, out above in, both clear of the centred handle */
  const po = Gm.port(a, 'out', 0, 1), pi = Gm.port(a, 'in', 0, 1);
  assert.strictEqual(po.x, 860); assert.strictEqual(pi.x, 860);
  assert.ok(po.y < a.y + a.h / 2 - 7 && pi.y > a.y + a.h / 2 + 7, 'ports avoid the 14px handle at the middle');
  /* route: starts at the source port, ends at the target port, stays left of the nodes */
  const r = Gm.layout([{ id: 1, a, b: d }])[0];
  assert.ok(r.d.startsWith('M860 '), r.d); assert.ok(/ H860$/.test(r.d), 'ends going right into the target edge: ' + r.d);
  assert.ok(r.X < 860 && r.X >= 860 - Gm.OPT.gutter - Gm.OPT.laneGap * Gm.OPT.maxLanes);
  assert.ok(/Q/.test(r.d), 'rounded corners');
  /* nested spans: the shorter one hugs the nodes, the longer one goes further out; overlapping spans never share a lane */
  const L = Gm.layout([{ id: 'long', a, b: d }, { id: 'short', a: b, b: c }, { id: 'mid', a, b: c }]);
  const by = Object.fromEntries(L.map((x) => [x.id, x]));
  assert.ok(by.short.lane < by.mid.lane && by.mid.lane < by.long.lane, JSON.stringify(L.map((x) => [x.id, x.lane])));
  const lanes = Gm.assignLanes([{ id: 1, x: 0, y1: 0, y2: 100 }, { id: 2, x: 0, y1: 50, y2: 150 }, { id: 3, x: 0, y1: 200, y2: 300 }]);
  assert.notStrictEqual(lanes[1], lanes[2], 'overlapping spans get different lanes'); assert.strictEqual(lanes[3], 0, 'a free span reuses the first lane');
  assert.deepStrictEqual(Gm.assignLanes([{ id: 1, x: 0, y1: 0, y2: 100 }, { id: 2, x: 500, y1: 0, y2: 100 }]), { 1: 0, 2: 0 }, 'lanes are per column');
  /* two links leaving the same node: the outer (longer, downward) one leaves from the higher port so its stub does not cross the inner run */
  assert.ok(by.long.p1.y < by.mid.p1.y, 'outer stub above inner stub');
  /* upward link: vertical goes up */
  const u = Gm.layout([{ id: 'u', a: d, b: a }])[0]; assert.ok(u.p2.y < u.p1.y && /V/.test(u.d));
  /* same height: straight */
  assert.ok(!/Q/.test(Gm.route({ x: 860, y: 10 }, { x: 860, y: 10 }, 830)));
  /* preview starts at the handle and ends at the pointer */
  const pv = Gm.preview(860, 35, 1000, 300); assert.ok(pv.startsWith('M860 35') && pv.endsWith('1000 300'));
});
t('v3.5 linkCheck: same answers as addLink (self, duplicate, loop) without changing the data', () => {
  const st = M.newState('Lk'); const A = st.subs[0]; const pp = M.secOf(A, 'dr-pp');
  M.addRoad(st, pp.id, { road: 'FM 1', start: '10+00', end: '28+00', scale: 50 }); M.syncPP(st);
  const [s1, s2, s3] = pp.sheets.map((x) => ({ t: 'sheet', id: x.id }));
  const before = JSON.stringify(st);
  assert.deepStrictEqual(M.linkCheck(st, s1, s1), { ok: false, reason: 'self' });
  assert.deepStrictEqual(M.linkCheck(st, s1, s2), { ok: true, reason: '' });
  assert.strictEqual(JSON.stringify(st), before, 'linkCheck does not change the data');
  M.addLink(st, s1, s2, 'dep'); M.addLink(st, s2, s3, 'dep');
  assert.strictEqual(M.linkCheck(st, s1, s2).reason, 'exists');
  assert.strictEqual(M.linkCheck(st, s3, s1).reason, 'cycle');
  assert.throws(() => M.addLink(st, s3, s1, 'dep'), /circular/);
  assert.strictEqual(M.linkCheck(st, s3, s1, 'update').ok, true, 'update links may point back');
  assert.strictEqual(M.linkCheck(st, s1, { t: 'sheet', id: 'nope' }).reason, 'missing');
});
t('v3.6 branch properties: optional owner/due/milestone/notes per branch, roll-up, old data still loads', () => {
  const st = M.newState('P'); const A = st.subs[0], pp = M.secOf(A, 'dr-pp'), dam = M.secOf(A, 'dr-dam');
  const r = M.addRoad(st, pp.id, { road: 'FM 1', start: '10+00', end: '34+00' }).road; M.applyGenerate(st, r.id, M.planGenerate(st, r.id));
  M.addSheet(st, dam.id, { title: 'DAM 1' });
  pp.sheets.forEach((sh, i) => M.updateSheet(st, sh.id, { hoursBudget: 10, hoursActual: 4 + i, owner: i ? 'Ana' : '', due: '2026-11-0' + (i + 1), status: i ? 'Done' : 'In progress' }));
  /* old data (no st.props) reads as empty everywhere */
  assert.strictEqual(st.props, undefined);
  for (const k of ['root', 'dtop:Drainage', 'disc:' + A.id + ':Drainage', 'seg:' + pp.id, 'road:' + r.id]) assert.deepStrictEqual(M.getProps(st, k), { owner: '', due: '', milestone: '', notes: '' }, k);
  assert.strictEqual(M.propTarget(st, 'disc:nope:Drainage'), null); assert.strictEqual(M.propTarget(st, 'dtop:Roads'), null);
  /* set: stored only in st.props (sections / roads keep notes in their own .notes) */
  const ms = st.milestones[1].id;
  M.setProps(st, 'disc:' + A.id + ':Drainage', { owner: ' Luis ', due: '2026-11-03', milestone: ms, notes: 'Branch note' });
  assert.deepStrictEqual(st.props['disc:' + A.id + ':Drainage'], { owner: 'Luis', due: '2026-11-03', milestone: ms, notes: 'Branch note' });
  M.setProps(st, 'seg:' + pp.id, { owner: 'Mei', notes: 'Survey pending' });
  assert.strictEqual(pp.notes, 'Survey pending'); assert.deepStrictEqual(st.props['seg:' + pp.id], { owner: 'Mei' });
  assert.throws(() => M.setProps(st, 'seg:' + pp.id, { due: '11/3/2026' }), /Due date/);
  assert.throws(() => M.setProps(st, 'seg:' + pp.id, { milestone: 'nope' }), /milestone/);
  assert.throws(() => M.setProps(st, 'sheet:x', { owner: 'a' }), /Nothing to edit/);
  M.setProps(st, 'seg:' + pp.id, { owner: '' }); assert.ok(!('seg:' + pp.id in st.props), 'empty entries are removed');
  /* roll-up */
  const R = M.rollup(st, 'disc:' + A.id + ':Drainage', '2026-11-02');
  assert.strictEqual(R.total, pp.sheets.length + 1); assert.strictEqual(R.done, pp.sheets.length - 1);
  assert.strictEqual(R.hoursBudget, 10 * pp.sheets.length); assert.strictEqual(R.unassigned, 2);
  assert.strictEqual(R.overdue, 1, 'the in-progress sheet due 11-01 is overdue');
  assert.strictEqual(R.firstDue, '2026-11-01');
  M.addLink(st, { t: 'seg', id: M.secOf(st.subs[1], 'dr-dam').id }, { t: 'seg', id: pp.id }, 'dep');
  M.addLink(st, { t: 'seg', id: dam.id }, { t: 'road', id: r.id }, 'dep');
  const R2 = M.rollup(st, 'disc:' + A.id + ':Drainage', '2026-11-02');
  assert.strictEqual(R2.linksIn.length, 1); assert.strictEqual(R2.linksInternal.length, 1); assert.strictEqual(R2.blockingIn, 1);
  assert.strictEqual(M.rollup(st, 'road:' + r.id).total, pp.sheets.length);
  /* removed milestone / road → stale properties pruned; JSON round trip keeps them */
  M.setProps(st, 'road:' + r.id, { owner: 'Ana', milestone: ms });
  const back = M.migrate(JSON.parse(JSON.stringify(st))); assert.deepStrictEqual(back.props, st.props);
  M.removeMilestone(st, ms); assert.ok(!st.props['disc:' + A.id + ':Drainage'].milestone && !st.props['road:' + r.id].milestone);
  M.deleteRoad(st, r.id); assert.ok(!('road:' + r.id in st.props));
});
t('v3.6 road alignment name: optional, editable, copied on split/copy, in CSV exports, report and import; old data loads', () => {
  const st = M.newState('P'); const A = st.subs[0], pp = M.secOf(A, 'dr-pp');
  const r = M.addRoad(st, pp.id, { road: 'FM 1960', start: '10+00', end: '34+00', alignment: '  BL   FM 1960 ' }).road;
  assert.strictEqual(r.alignment, 'BL FM 1960');
  const r2 = M.addRoad(st, pp.id, { road: 'Kuykendahl', start: '5+00', end: '9+00' }).road;
  assert.ok(!('alignment' in r2), 'no alignment → no field (data stays as before)');
  assert.strictEqual(M.roadAlign(r2), ''); assert.strictEqual(M.roadWithAlign(r), 'FM 1960 (Alignment: BL FM 1960)');
  M.updateRoad(st, r2.id, { alignment: 'CL Kuyk' }); assert.strictEqual(r2.alignment, 'CL Kuyk');
  M.applyStationRows(st, [{ roadId: r2.id, alignment: '' }]); assert.ok(!('alignment' in r2), 'cleared');
  assert.throws(() => M.updateRoad(st, r2.id, { alignment: 'x'.repeat(61) }), /60 characters/);
  M.applyGenerate(st, r.id, M.planGenerate(st, r.id));
  const sh = pp.sheets.find((x) => x.gen && x.gen.road === r.id);
  assert.strictEqual(M.sheetAlign(st, A, pp, sh), 'BL FM 1960');
  /* exports */
  const csv = M.toCSV(st, M.allSheets(st)).split('\r\n');
  assert.ok(csv[0].startsWith('Sub-project,Discipline,Section,Road,Alignment,Sheet No'));
  assert.ok(csv.some((l) => l.startsWith('A,Drainage,Drainage Plan & Profile,FM 1960,BL FM 1960,')));
  assert.ok(M.ppCSV(st).includes('A,Drainage,Drainage Plan & Profile,FM 1960,BL FM 1960,10+00,34+00,'));
  const ex = M.exportImportCSV(st); assert.match(ex, /Sheet end station,Alignment\r\n/); assert.match(ex, /,FM 1960,10\+00,34\+00,[^\r]*,BL FM 1960\r\n/);
  /* report outline + narrative */
  const O = M.reportOutline(st, '2026-11-02'); assert.match(JSON.stringify(O), /"aligns":\["BL FM 1960"\]/);
  assert.match(M.narrativeText(st, '2026-11-02'), /FM 1960 \[alignment BL FM 1960\]/);
  /* split / copy keep it */
  const sp = M.splitSegment(st, r.id, '20+00'); assert.strictEqual(sp.b.alignment, 'BL FM 1960');
  const cp = M.copySegment(st, r.id, st.subs[1].id, {}); assert.strictEqual(cp.road.alignment, 'BL FM 1960');
  /* CSV import round trip keeps it */
  const rows = M.parseCSV(ex).rows; const st2 = M.newState('R');
  const plan = M.planCSV(st2, rows.slice(1), M.detectMapping(rows[0]), { mode: 'merge' }); assert.strictEqual(plan.summary.errors, 0); M.applyCSV(st2, plan);
  assert.strictEqual(st2.subs[0].roads.find((x) => x.road === 'FM 1960').alignment, 'BL FM 1960');
  /* old data: no field, junk values dropped on load */
  const old = JSON.parse(JSON.stringify(st)); delete old.subs[0].roads[0].alignment; old.subs[0].roads[1].alignment = 42;
  const L = M.migrate(old); assert.ok(!('alignment' in L.subs[0].roads[0]) && !('alignment' in L.subs[0].roads[1]));
});
t('v3.7 copy P&P sheet breaks to Drainage Area Map sheets: plan, create, re-run, re-sync, scale, unlink, compat', () => {
  const st = M.newState('P'); const [A, B] = st.subs; const ppA = M.secOf(A, 'dr-pp'), damA = M.secOf(A, 'dr-dam');
  const r = M.addRoad(st, ppA.id, { road: 'FM 1960', start: '10+00', end: '34+00', alignment: 'BL FM 1960' }).road;
  const rb = M.addRoad(st, M.secOf(B, 'dr-pp').id, { road: 'Kuykendahl', start: '0+00', end: '7+00' }).road;
  M.syncPP(st);
  const before = JSON.stringify(st);
  const P = M.planDam(st, { subs: [A.id] });
  assert.strictEqual(JSON.stringify(st), before, 'planDam does not change data');
  assert.strictEqual(P.create, M.roadPP(st, A, r).count, 'one DAM sheet per PP sheet break');
  assert.deepStrictEqual(P.items[0].create.map((c) => c.title), ['DAM – FM 1960 (BL FM 1960) STA 10+00–22+00', 'DAM – FM 1960 (BL FM 1960) STA 22+00–34+00']);
  const out = M.applyDam(st, P, { link: true });
  assert.strictEqual(out.created, 2);
  const dams = damA.sheets.filter((x) => x.dam);
  const pps = ppA.sheets.filter((x) => x.gen && x.gen.road === r.id);
  assert.deepStrictEqual(dams.map((x) => M.sheetRange(x)), pps.map((x) => M.sheetRange(x)), 'same station ranges as the PP sheets');
  assert.ok(dams.every((x) => x.road === 'FM 1960' && x.discipline === 'Drainage' && x.dam.linked && x.status === 'Not started'));
  assert.deepStrictEqual(dams.map((x) => x.number), ['1', '2'], 'numbered in the Drainage Area Map range');
  assert.strictEqual(M.sheetAlign(st, A, damA, dams[0]), 'BL FM 1960'); assert.strictEqual(M.sheetScale(st, A, dams[0]), 100);
  /* re-run: no duplicates */
  const P2 = M.planDam(st, { subs: [A.id] }); assert.strictEqual(P2.create + P2.update + P2.remove, 0); assert.strictEqual(P2.unchanged, 2);
  const P3 = M.planDam(st, { subs: [A.id], mode: 'skip' }); assert.strictEqual(P3.skipped, 1); assert.strictEqual(P3.create, 0);
  /* a hand-made sheet with the same title is not duplicated */
  M.addSheet(st, M.secOf(B, 'dr-dam').id, { title: 'DAM – Kuykendahl STA 0+00–7+00' });
  assert.strictEqual(M.planDam(st, { subs: [B.id] }).create, 0);
  /* road gets longer → linked copies out of sync → re-sync; edited title kept, range updated */
  dams[0].title = 'DAM 1 custom'; M.updateSheet(st, dams[1].id, { owner: 'Ana' });
  M.updateRoad(st, r.id, { end: '40+00' }); M.syncPP(st);
  assert.ok(M.damOutOfSync(st).count > 0);
  const rs = M.resyncDam(st); assert.strictEqual(rs.created, 1);
  const d2 = damA.sheets.filter((x) => x.dam);
  assert.deepStrictEqual(d2.map((x) => x.title), ['DAM 1 custom', 'DAM – FM 1960 (BL FM 1960) STA 22+00–34+00', 'DAM – FM 1960 (BL FM 1960) STA 34+00–40+00']);
  assert.strictEqual(d2[1].owner, 'Ana', 'user fields survive a re-sync'); assert.strictEqual(M.damOutOfSync(st).count, 0);
  /* road shorter → untouched extra removed, edited extra kept */
  M.updateRoad(st, r.id, { end: '20+00' }); M.syncPP(st);
  const sh = M.resyncDam(st); assert.strictEqual(sh.removed, 1); assert.strictEqual(sh.kept, 1);
  /* another scale → different breaks; the scale is remembered for re-sync */
  M.updateRoad(st, r.id, { end: '34+00' }); M.syncPP(st);
  const S = M.planDam(st, { roads: [r.id], scale: 50 }); M.applyDam(st, S);
  const d3 = damA.sheets.filter((x) => x.dam && x.dam.road === r.id);
  assert.strictEqual(d3.length, Math.ceil(2400 / 600)); assert.ok(d3.every((x) => x.dam.scale === 50)); assert.strictEqual(M.damOutOfSync(st).count, 0);
  assert.throws(() => M.planDam(st, { scale: 'abc' }), /Unknown scale/);
  /* unlink → re-sync leaves it alone; delete road → copies stay, unlinked */
  M.unlinkDam(st, d3[0].id); M.updateRoad(st, r.id, { end: '30+00' }); M.syncPP(st);
  assert.ok(!M.damOutOfSync(st).plan.items.some((it) => it.update.some((u) => u.sheet.id === d3[0].id)));
  const n0 = damA.sheets.length; M.deleteRoad(st, r.id); assert.strictEqual(damA.sheets.length, n0); assert.ok(damA.sheets.filter((x) => x.dam).every((x) => !x.dam.linked));
  /* duplicate is a plain sheet; data round trip + old data without .dam */
  const dup = M.duplicateSheet(st, d3[1].id); assert.ok(!('dam' in dup));
  const back = M.migrate(JSON.parse(JSON.stringify(st))); assert.strictEqual(back.subs[0].segments.find((g) => g.key === 'dr-dam').sheets.filter((x) => x.dam).length, damA.sheets.filter((x) => x.dam).length);
  const junk = JSON.parse(JSON.stringify(st)); junk.subs[0].segments.find((g) => g.key === 'dr-dam').sheets[0].dam = 'x'; assert.ok(!('dam' in M.migrate(junk).subs[0].segments.find((g) => g.key === 'dr-dam').sheets[0]));
  assert.ok(!JSON.stringify(M.newState('Q')).includes('"dam"'), 'new projects carry no DAM fields');
});
t('v3.7 DAM copies follow split / merge of the road entry', () => {
  const st = M.newState('P'); const A = st.subs[0], pp = M.secOf(A, 'dr-pp'), dam = M.secOf(A, 'dr-dam');
  const r = M.addRoad(st, pp.id, { road: 'FM 1', start: '10+00', end: '34+00' }).road; M.syncPP(st);
  M.applyDam(st, M.planDam(st, {}));
  const sp = M.splitSegment(st, r.id, '22+00'); M.syncPP(st);
  assert.deepStrictEqual(dam.sheets.filter((x) => x.dam).map((x) => x.dam.road), [r.id, sp.b.id]);
  assert.strictEqual(M.damOutOfSync(st).count > 0, true, 'idx / of changed for the new part');
  M.resyncDam(st); assert.strictEqual(M.damOutOfSync(st).count, 0);
  M.mergeSegments(st, r.id, sp.b.id); M.syncPP(st); M.resyncDam(st);
  assert.deepStrictEqual(dam.sheets.filter((x) => x.dam).map((x) => [x.dam.road, x.dam.idx]), [[r.id, 1], [r.id, 2]]);
});
t('v3.8 DAM road branches: Drainage Area Map > Road > sheets; re-run reuses, unlink / delete road keep the branch, props, migrate', () => {
  const st = M.newState('P'); const A = st.subs[0], pp = M.secOf(A, 'dr-pp'), tl = M.secOf(A, 'dr-tl') || pp, dam = M.secOf(A, 'dr-dam');
  const r1 = M.addRoad(st, pp.id, { road: 'FM 1960', start: '10+00', end: '34+00', alignment: 'BL FM 1960' }).road;
  const r2 = M.addRoad(st, pp.id, { road: 'FM 1960', start: '50+00', end: '60+00', alignment: 'BL FM 1960' }).road;
  const r3 = M.addRoad(st, pp.id, { road: 'Kuykendahl', start: '0+00', end: '7+00' }).road;
  M.addSheet(st, dam.id, { title: 'Drainage Area Map' }); M.syncPP(st);
  M.applyDam(st, M.planDam(st, { subs: [A.id] }), { link: true }); M.syncPP(st);
  const bs = ['FM 1960', 'Kuykendahl'].map((n) => M.damBranches(dam).find((b) => b.road === n));
  assert.deepStrictEqual(M.damBranches(dam).map((b) => b.road), ['Kuykendahl', 'FM 1960'], 'branches follow the road order');
  assert.deepStrictEqual(bs.map((b) => [b.road, b.alignment || '', b.src.length]), [['FM 1960', 'BL FM 1960', 2], ['Kuykendahl', '', 1]], 'one branch per road name, mirrors name + alignment, linked to the source entries');
  assert.strictEqual(M.damBranchSheets(dam, bs[0]).length, 3); assert.strictEqual(M.damBranchSheets(dam, bs[1]).length, 1);
  assert.deepStrictEqual(M.damLoose(dam).map((x) => x.title), ['Drainage Area Map'], 'own sheets stay directly under the section');
  assert.strictEqual(dam.sheets.length, 5, 'sheets stay in the section, so section / sub-project counts do not change');
  // re-run: no duplicate branches or sheets
  const P2 = M.planDam(st, { subs: [A.id] }); assert.strictEqual(P2.create + P2.update + P2.remove, 0);
  M.applyDam(st, M.planDam(st, { subs: [A.id], scale: 50 }), { link: true }); assert.strictEqual(M.damBranches(dam).length, 2, 'scale change reuses the branch');
  M.applyDam(st, M.planDam(st, { subs: [A.id] }), { link: true });
  // properties + roll-up
  const key = 'dbr:' + bs[0].id;
  M.setProps(st, key, { owner: 'Ana R.', due: '2026-12-01', notes: 'DAM FM' });
  assert.deepStrictEqual([M.getProps(st, key).owner, bs[0].notes, M.rollup(st, key).total, M.rollup(st, key).t], ['Ana R.', 'DAM FM', 3, 'dbr']);
  assert.strictEqual(M.rollup(st, 'seg:' + dam.id).total, 5);
  // rename mirrors; re-sync refreshes titles
  M.updateRoad(st, r3.id, { road: 'Kuykendahl Rd' }); M.syncPP(st);
  assert.strictEqual(bs[1].road, 'Kuykendahl Rd'); assert.strictEqual(M.damBranchSheets(dam, bs[1])[0].road, 'Kuykendahl Rd');
  M.resyncDam(st); assert.strictEqual(M.damBranchSheets(dam, bs[1])[0].title, 'DAM – Kuykendahl Rd STA 0+00–7+00');
  // mixed linked + unlinked: no duplicates
  const fm = M.damBranchSheets(dam, bs[0]); M.unlinkDam(st, fm[0].id);
  const Pm = M.planDam(st, { subs: [A.id] }); assert.strictEqual(Pm.create, 0, 'an unlinked copy covering the range is not duplicated');
  // unlink whole branch
  M.unlinkDamBranch(st, bs[1].id); M.syncPP(st);
  assert.deepStrictEqual([bs[1].src.length, M.damBranchSheets(dam, bs[1]).every((x) => x.dam.linked === false)], [0, true]);
  // delete the source road: branch stays, unlinked, sheets kept
  M.deleteRoad(st, r1.id); M.deleteRoad(st, r2.id); M.syncPP(st);
  assert.deepStrictEqual([M.damBranches(dam).length, bs[0].road, bs[0].src.length, M.damBranchSheets(dam, bs[0]).length], [2, 'FM 1960', 0, 3]);
  assert.strictEqual(M.getProps(st, key).owner, 'Ana R.', 'branch properties survive');
  // round-trip + junk
  const j = M.migrate(JSON.parse(JSON.stringify(st)));
  assert.strictEqual(JSON.stringify(j.subs[0].segments.find((g) => g.key === 'dr-dam').damRoads), JSON.stringify(dam.damRoads));
  const junk = JSON.parse(JSON.stringify(st)); const jd = junk.subs[0].segments.find((g) => g.key === 'dr-dam');
  jd.damRoads.push(null, { id: 5 }, { id: jd.damRoads[0].id }); jd.sheets.find((x) => x.dam).dam.branch = 'nope';
  const jm = M.migrate(junk), jdd = jm.subs[0].segments.find((g) => g.key === 'dr-dam');
  assert.strictEqual(jdd.damRoads.length, 2); assert.strictEqual(jdd.sheets.filter((x) => x.dam && x.dam.branch === null).length, 1);
  // remove a branch: sheets stay flat
  M.deleteDamBranch(st, bs[1].id); assert.strictEqual(M.damBranches(dam).length, 1); assert.strictEqual(dam.sheets.length, 5); assert.strictEqual(M.getProps(st, 'dbr:' + bs[1].id).owner, '');
  // collapse / focus keys
  assert.strictEqual(M.collapseLevel(st, 4)['dbr:' + bs[0].id], true);
  // CSV export unchanged in shape
  assert.ok(M.exportImportCSV(st).split('\n').some((l) => /DAM – FM 1960/.test(l)));
});
t('v3.8 flat DAM copies from v3.7 move into a road branch on load, nothing lost', () => {
  const st = M.newState('P'); const A = st.subs[0], pp = M.secOf(A, 'dr-pp'), dam = M.secOf(A, 'dr-dam');
  M.addRoad(st, pp.id, { road: 'FM 1960', start: '10+00', end: '34+00', alignment: 'BL FM 1960' }); const rk = M.addRoad(st, pp.id, { road: 'Kuyk', start: '0+00', end: '7+00' }).road; M.syncPP(st);
  M.applyDam(st, M.planDam(st, {})); M.deleteRoad(st, rk.id); M.syncPP(st);
  const old = JSON.parse(JSON.stringify(st)); const od = old.subs[0].segments.find((g) => g.key === 'dr-dam');
  delete od.damRoads; for (const sh of od.sheets) if (sh.dam) delete sh.dam.branch; /* exactly what v3.7 saved */
  const ids = od.sheets.map((x) => x.id).sort();
  const m = M.migrate(old), md = m.subs[0].segments.find((g) => g.key === 'dr-dam');
  assert.deepStrictEqual(md.sheets.map((x) => x.id).sort(), ids, 'no sheet lost');
  assert.deepStrictEqual(M.damBranches(md).map((b) => [b.road, b.alignment || '', b.src.length, M.damBranchSheets(md, b).length]).sort(), [['FM 1960', 'BL FM 1960', 1, 2], ['Kuyk', '', 0, 1]], 'deleted-road copies get an unlinked branch from their title');
  const again = M.migrate(JSON.parse(JSON.stringify(m)));
  assert.strictEqual(JSON.stringify(again.subs[0].segments.find((g) => g.key === 'dr-dam').damRoads), JSON.stringify(md.damRoads), 'migration runs once');
  assert.strictEqual(M.planDam(m, {}).create, 0, 're-run after migration makes no duplicates');
});
t('v3.9 Hydraulic Data Sheets by count: generic titles, add more, reduce, edited titles kept, no road, compat', () => {
  const st = M.newState('P'); const A = st.subs[0]; M.addStandardSet(st, A.id);
  const g = M.secOf(A, 'dr-hds-inlet'), x = M.secOf(A, 'dr-hds-x');
  assert.ok(M.isHydSec(g) && M.isHydSec(x) && !M.isHydSec(M.secOf(A, 'dr-pp')) && !M.isPPSec(g), 'hydraulic sections need no roads');
  const road = M.addSheet(st, x.id, { title: 'Culvert Hydraulics Sta 22+40', road: 'FM 1960' }); /* existing road-tagged sheet */
  const before = JSON.stringify(st), P = M.planHydCount(st, g.id, 3);
  assert.strictEqual(JSON.stringify(st), before, 'plan does not change data');
  assert.deepStrictEqual([P.cur, P.create, !!P.adopt], [1, 2, true], 'the standard sheet becomes sheet 1, no duplicate');
  const r = M.setHydCount(st, g.id, 3);
  assert.deepStrictEqual([r.created, r.adopted, g.sheets.length], [2, 1, 3]);
  assert.deepStrictEqual(g.sheets.map((q) => q.title), ['Hydraulic Data Sheet - Inlet Computations (1 of 3)', 'Hydraulic Data Sheet - Inlet Computations (2 of 3)', 'Hydraulic Data Sheet - Inlet Computations (3 of 3)']);
  assert.ok(g.sheets.every((q) => !q.road && !q.gen && q.discipline === 'Drainage' && q.number), 'no road, numbered');
  g.sheets[1].title = 'Inlet Computations – FM 1960'; /* user edits a title */
  M.setHydCount(st, g.id, 5);
  assert.deepStrictEqual(g.sheets.map((q) => q.title), ['Hydraulic Data Sheet - Inlet Computations (1 of 5)', 'Inlet Computations – FM 1960', 'Hydraulic Data Sheet - Inlet Computations (3 of 5)', 'Hydraulic Data Sheet - Inlet Computations (4 of 5)', 'Hydraulic Data Sheet - Inlet Computations (5 of 5)'], 'adding continues numbering; edited title kept');
  assert.strictEqual(new Set(g.sheets.map((q) => q.number)).size, 5, 'no duplicate sheet numbers');
  assert.strictEqual(M.bulkAddTemplates(st, g.id).length + M.addStandardSet(st, A.id).filter((q) => q.title === g.title).length, 0, '+ Standard does not add a duplicate once counted');
  assert.strictEqual(M.planHydCount(st, g.id, 5).create + M.planHydCount(st, g.id, 5).remove.length, 0, 'same count = no change');
  g.sheets[4].status = 'In progress';
  const Pd = M.planHydCount(st, g.id, 3);
  assert.deepStrictEqual([Pd.remove.length, Pd.progress.length], [2, 1], 'reducing lists the sheets with work');
  assert.throws(() => M.setHydCount(st, g.id, 3), /have work/);
  g.sheets[4].status = 'Not started'; M.setHydCount(st, g.id, 4); assert.strictEqual(g.sheets.length, 4, 'untouched sheets are removed without a guard');
  M.setHydCount(st, g.id, 3, { force: true }); assert.strictEqual(g.sheets.length, 3);
  assert.deepStrictEqual(g.sheets.map((q) => q.hyd.of), [3, 3, 3]);
  // deleting one renumbers the rest
  M.deleteSheet(st, g.sheets[0].id); M.syncPP(st);
  assert.deepStrictEqual(g.sheets.map((q) => q.title), ['Inlet Computations – FM 1960', 'Hydraulic Data Sheet - Inlet Computations (2 of 2)']);
  // other hydraulic sections untouched; road-tagged sheet stays
  assert.ok(x.sheets.includes(road) && road.road === 'FM 1960' && !road.hyd);
  M.setHydCount(st, x.id, 2);
  assert.ok(x.sheets.includes(road) && x.sheets.filter((q) => q.hyd).length === 2, 'road-tagged sheets are not counted or removed');
  // errors, duplicate, move, compat
  assert.throws(() => M.planHydCount(st, g.id, -1)); assert.throws(() => M.planHydCount(st, g.id, 2.5)); assert.throws(() => M.planHydCount(st, g.id, 'x'));
  assert.ok(!M.duplicateSheet(st, g.sheets[1].id).hyd, 'a duplicate is a plain sheet');
  const j = M.migrate(JSON.parse(JSON.stringify(st)));
  assert.deepStrictEqual(M.secOf(j.subs[0], 'dr-hds-inlet').sheets.map((q) => q.title), g.sheets.map((q) => q.title), 'round-trip');
  const junk = JSON.parse(JSON.stringify(st)); M.secOf(junk.subs[0], 'dr-hds-inlet').sheets[0].hyd = 'bad';
  assert.ok(!M.secOf(M.migrate(junk).subs[0], 'dr-hds-inlet').sheets[0].hyd, 'bad hyd data dropped');
  const old = JSON.parse(JSON.stringify(st)); for (const sub of old.subs) for (const sg of sub.segments) for (const q of sg.sheets) delete q.hyd;
  assert.strictEqual(M.migrate(old).subs[0].segments.reduce((a, sg) => a + sg.sheets.length, 0), st.subs[0].segments.reduce((a, sg) => a + sg.sheets.length, 0), 'old data loads unchanged');
  assert.ok(M.exportImportCSV(st).includes('Hydraulic Data Sheet - Crossing (1 of 2)'), 'CSV export');
});
const E = require('./engreport.js');
function engState() {
  const st = M.newState('Eng Test');
  for (const s of st.subs) M.addStandardSet(st, s.id);
  const [A, B] = st.subs;
  M.addRoad(st, M.secOf(A, 'dr-pp').id, { road: 'FM 1960', start: '10+00', end: '58+00', alignment: 'BL FM 1960' });
  M.addRoad(st, M.secOf(B, 'dr-pp').id, { road: 'Spring Cypress Rd', start: '100+00', end: '136+00', alignment: 'BL SC' });
  M.syncPP(st);
  return st;
}
t('engineering report: sections, placeholders, no invented values', () => {
  const st = engState();
  const O = E.outline(st, today);
  assert.deepStrictEqual(O.map((s) => s.id), ['intro', 'desc', 'scope', 'criteria', 'existing', 'proposed', 'swp3', 'sheets', 'schedule', 'concl']);
  assert.deepStrictEqual(O.map((s) => s.no), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  const ex = O.find((s) => s.id === 'existing');
  assert(ex.showPh && /^\[Engineer to describe existing drainage conditions/.test(ex.ph));
  const desc = O.find((s) => s.id === 'desc'), tab = desc.auto.find((b) => b.table).table;
  const fm = tab.rows.find((r) => r[0] === 'FM 1960');
  assert(fm && fm[1] === 'BL FM 1960' && /10\+00 to 58\+00/.test(fm[2]) && fm[3] === '4,800 ft', JSON.stringify(fm));
  const txt = E.text(st, today);
  assert(/PRELIMINARY — NOT SEALED/.test(txt) && /1\. INTRODUCTION AND PURPOSE/.test(txt) && /10\. CONCLUSIONS AND RECOMMENDATIONS/.test(txt));
  assert(!/\b(cfs|in\/hr|\d+-year|year storm|acres?)\b/i.test(txt), 'no design values invented');
  const urls = txt.match(/https?:\/\/\S+/g) || [];
  assert.deepStrictEqual([...new Set(urls)], ['https://www.txdot.gov/manuals/des/pse/chapter-6--ps-e-submission--review-and-processing/section-2--engineering-reviews.html']);
  assert(!/CSJ/.test(txt.split('\n').slice(0, 4).join('\n')), 'no CSJ line until one is entered');
});
t('engineering report: edits, toggles, replace mode, refs, storage', () => {
  const st = engState();
  E.setMeta(st, 'csj', '1234-56-789'); E.setMeta(st, 'county', 'Harris'); assert.throws(() => E.setMeta(st, 'bogus', 'x'));
  assert.deepStrictEqual(st.engReport.meta, { csj: '1234-56-789', county: 'Harris' });
  E.setSec(st, 'existing', { text: 'Existing ditches drain north.' });
  let ex = E.outline(st, today).find((s) => s.id === 'existing');
  assert(!ex.showPh && ex.auto.length && ex.text === 'Existing ditches drain north.');
  E.setSec(st, 'existing', { mode: 'replace' });
  ex = E.outline(st, today).find((s) => s.id === 'existing');
  assert.strictEqual(ex.auto.length, 0);
  E.setSec(st, 'scope', { on: false });
  const O = E.outline(st, today);
  assert(!O.some((s) => s.id === 'scope') && O.find((s) => s.id === 'criteria').no === 3);
  const txt = E.text(st, today);
  assert(/CSJ: 1234-56-789/.test(txt) && /Harris County/.test(txt) && /Existing ditches drain north\./.test(txt) && !/SCOPE OF WORK/.test(txt));
  E.setRefs(st, 'Ref one\n\n Ref two ');
  assert.deepStrictEqual(E.refs(st), ['Ref one', 'Ref two']);
  E.resetRefs(st); assert(E.refs(st).length >= 5 && st.engReport.refs === undefined);
  // round trip through save/migrate, then clearing everything leaves no trace
  const back = M.migrate(JSON.parse(JSON.stringify(st)));
  assert.strictEqual(E.text(back, today), E.text(st, today));
  E.setSec(back, 'existing', { text: '', mode: 'add' }); E.setSec(back, 'scope', { on: true }); E.setMeta(back, 'csj', ''); E.setMeta(back, 'county', '');
  assert.strictEqual(back.engReport, undefined);
});
t('engineering report: SWP3 hidden without SWP3 sheets; junk tolerated', () => {
  const st = engState();
  for (const s of st.subs) s.segments = s.segments.filter((g) => g.discipline !== 'SWP3');
  assert(!E.outline(st, today).some((s) => s.id === 'swp3'));
  assert(!/STORM WATER POLLUTION/.test(E.text(st, today)));
  for (const junk of [null, 5, 'x', [], { meta: 7, secs: 'no', refs: 9 }, { secs: { intro: null, existing: { text: 5, on: 'x' } } }]) {
    const s2 = engState(); s2.engReport = junk;
    assert.doesNotThrow(() => E.text(s2, today), JSON.stringify(junk));
    assert.strictEqual(E.outline(s2, today).length, 10);
  }
  const empty = M.newState('Empty');
  assert.doesNotThrow(() => E.text(empty, today));
});
t('v3.11 laterals, ponds (4 sheets), junction boxes (3 sheets), optional counts, old projects', () => {
  const st = M.newState('P'); const A = st.subs[0];
  const lat = M.secOf(A, 'dr-lat'), det = M.secOf(A, 'dr-det'), jb = M.secOf(A, 'dr-jb');
  const weld = M.secOf(A, 'dr-bd-welded'), sum = M.secOf(A, 'dr-bd-sum'), std = M.secOf(A, 'dr-std'), deck = M.secOf(A, 'dr-bd-det');
  assert.ok(M.isLatSec(lat) && M.isPlainCountSec(lat) && !M.isPPSec(lat), 'laterals are counted sheets, not a road section');
  assert.ok(M.isPondSec(det) && M.unitSlots(det).map((s) => s.label).join('|') === 'Layout|Cross Sections|Geometric Layout (1 of 2)|Geometric Layout (2 of 2)');
  assert.ok(M.isBoxSec(jb) && M.unitSlots(jb).length === 3, 'each special junction box is 3 sheets');
  assert.ok(M.isOptCountSec(weld) && M.isOptCountSec(sum) && M.isOptCountSec(std) && M.isOptCountSec(deck) && !M.isOptCountSec(lat));
  assert.ok(!st.subs.some((s) => s.segments.some((g) => g.key === 'dr-det-xs')) && !M.secDef(st, 'dr-det-xs'), 'the old cross-section branch is gone');
  assert.ok(!st.index.some((t) => /detention basin layout|detention basin cross section|special junction box details/i.test(t.title)));
  assert.throws(() => M.addRoad(st, lat.id, { road: 'Lateral A' }), /count|no road entries/);
  assert.throws(() => M.setSectionPP(st, 'dr-lat', true), /count/);
  assert.throws(() => M.setSectionPP(st, 'dr-det', true), /count/);
  assert.throws(() => M.setSectionPP(st, 'dr-jb', true), /count/);
  const before = JSON.stringify(st);
  const Lp = M.planSheetCount(st, lat.id, 3);
  assert.strictEqual(JSON.stringify(st), before, 'planning a lateral count does not change data');
  assert.deepStrictEqual([Lp.cur, Lp.create, Lp.titles.join('|')], [0, 3, [1, 2, 3].map((i) => 'Drainage Laterals (' + i + ' of 3)').join('|')]);
  M.addSheet(st, lat.id, { title: 'Drainage Laterals', owner: 'Ana' });
  const lr = M.setSheetCount(st, lat.id, 3);
  assert.deepStrictEqual([lr.adopted, lr.created, lat.sheets.length], [1, 2, 3]);
  assert.strictEqual(lat.sheets[0].owner, 'Ana');
  assert.ok(lat.sheets.every((q) => q.cnt && !q.road && !q.gen && q.discipline === 'Drainage'));
  assert.deepStrictEqual(lat.sheets.map((q) => q.title), [1, 2, 3].map((i) => 'Drainage Laterals (' + i + ' of 3)'));
  lat.sheets[1].title = 'Lateral run at bent 3';
  M.setSheetCount(st, lat.id, 4);
  assert.strictEqual(lat.sheets[1].title, 'Lateral run at bent 3', 'edited lateral titles are kept');
  assert.strictEqual(lat.sheets[3].title, 'Drainage Laterals (4 of 4)');
  lat.sheets[3].status = 'In progress';
  assert.throws(() => M.setSheetCount(st, lat.id, 2), /have work/);
  M.setSheetCount(st, lat.id, 2, { force: true });
  assert.deepStrictEqual(lat.sheets.map((q) => q.cnt.of), [2, 2]);
  M.setSheetCount(st, std.id, 2);
  assert.deepStrictEqual(std.sheets.map((q) => q.title), ['Standards (1 of 2)', 'Standards (2 of 2)']);
  assert.ok(std.sheets.every((q) => !q.road));
  M.setSheetCount(st, weld.id, 1); M.setSheetCount(st, sum.id, 1);
  assert.strictEqual(weld.sheets[0].title, 'Bridge Deck Drawing Details (Welded) (1 of 1)');
  assert.strictEqual(sum.sheets[0].title, 'Bridge Deck Drain Summary (1 of 1)');
  M.addSheet(st, det.id, { title: 'Detention Basin Layout', owner: 'Bo', notes: 'old layout' });
  M.addSheet(st, det.id, { title: 'Detention Basin Cross Section', status: 'In review' });
  const pr = M.setPondCount(st, det.id, 2);
  assert.strictEqual(pr.n, 2);
  assert.strictEqual(M.unitGroups(det).length, 2);
  assert.strictEqual(M.unitSheets(det).length, 8, 'two ponds × 4 sheets');
  assert.strictEqual(M.unitSheets(det)[0].owner, 'Bo');
  assert.strictEqual(M.unitSheets(det)[0].notes, 'old layout');
  assert.strictEqual(M.unitSheets(det)[1].status, 'In review');
  assert.deepStrictEqual(M.unitGroups(det)[0].sheets.map((q) => q.title), [
    'Detention Basin – Pond 1 – Layout', 'Detention Basin – Pond 1 – Cross Sections',
    'Detention Basin – Pond 1 – Geometric Layout (1 of 2)', 'Detention Basin – Pond 1 – Geometric Layout (2 of 2)']);
  assert.deepStrictEqual(M.unitGroups(det)[1].sheets.map((q) => q.title), [
    'Detention Basin – Pond 2 – Layout', 'Detention Basin – Pond 2 – Cross Sections',
    'Detention Basin – Pond 2 – Geometric Layout (1 of 2)', 'Detention Basin – Pond 2 – Geometric Layout (2 of 2)']);
  assert.ok(M.unitSheets(det).every((q) => !q.road && q.unit.kind === 'pond' && q.unit.of === 2));
  M.unitGroups(det)[0].sheets[0].title = 'Pond A layout';
  M.setPondCount(st, det.id, 2);
  assert.strictEqual(M.unitGroups(det)[0].sheets[0].title, 'Pond A layout', 'edited pond sheet titles are kept');
  M.unitGroups(det)[1].sheets[2].status = 'Done';
  assert.throws(() => M.setPondCount(st, det.id, 1), /have work/);
  M.setPondCount(st, det.id, 1, { force: true });
  assert.deepStrictEqual([M.unitGroups(det).length, M.unitSheets(det).length], [1, 4]);
  M.addSheet(st, jb.id, { title: 'Special Junction Box Details', owner: 'Cia' });
  M.setBoxCount(st, jb.id, 2);
  assert.strictEqual(M.unitGroups(jb).length, 2);
  assert.strictEqual(M.unitSheets(jb).length, 6, 'two boxes × 3 sheets');
  assert.strictEqual(M.unitSheets(jb)[0].owner, 'Cia');
  assert.deepStrictEqual(M.unitGroups(jb)[0].sheets.map((q) => q.title), [1, 2, 3].map((i) => 'Special Junction Box Details – Box 1 (' + i + ' of 3)'));
  assert.deepStrictEqual(M.unitGroups(jb)[1].sheets.map((q) => q.title), [1, 2, 3].map((i) => 'Special Junction Box Details – Box 2 (' + i + ' of 3)'));
  assert.ok(M.unitSheets(jb).every((q) => q.unit.kind === 'box' && !q.road));
  const csv = M.exportImportCSV(st);
  assert.ok(csv.includes('Detention Basin – Pond 1 – Cross Sections') && csv.includes('Special Junction Box Details – Box 2 (3 of 3)') && csv.includes('Drainage Laterals (1 of 2)') && csv.includes('Lateral run at bent 3'));
  const back = M.migrate(JSON.parse(JSON.stringify(st)));
  assert.deepStrictEqual(M.secOf(back.subs[0], 'dr-det').sheets.map((q) => q.title), det.sheets.map((q) => q.title), 'round-trip');
  const junk = JSON.parse(JSON.stringify(st));
  M.secOf(junk.subs[0], 'dr-lat').sheets[0].cnt = { idx: 0 };
  M.secOf(junk.subs[0], 'dr-det').sheets[0].unit = { kind: 'pond' };
  const jm = M.migrate(junk);
  assert.ok(!M.secOf(jm.subs[0], 'dr-lat').sheets[0].cnt, 'bad count data dropped');
  assert.ok(!M.secOf(jm.subs[0], 'dr-det').sheets[0].unit || M.secOf(jm.subs[0], 'dr-det').sheets[0].unit.slot, 'bad unit data dropped');
  /* a v3.10 project: laterals were a road section, detention was two branches */
  const old = JSON.parse(JSON.stringify(M.newState('Legacy')));
  const odet = old.settings.sections.find((d) => d.key === 'dr-det'); odet.title = 'Detention Basin Layout';
  const olat = old.settings.sections.find((d) => d.key === 'dr-lat'); olat.series = 'pp-lat';
  const oi = old.settings.sections.findIndex((d) => d.key === 'dr-det');
  old.settings.sections.splice(oi + 1, 0, { key: 'dr-det-xs', title: 'Detention Basin Cross Section', discipline: 'Drainage', series: null });
  const sub = old.subs[0];
  const dseg = sub.segments.find((g) => g.key === 'dr-det'); dseg.title = 'Detention Basin Layout'; dseg.name = dseg.title;
  const lseg = sub.segments.find((g) => g.key === 'dr-lat'); lseg.series = 'pp-lat';
  sub.roads.push({ id: 'rdlat', kind: 'road', name: 'Lateral A-3', road: 'Lateral A-3', start: 0, end: 1300, scale: null, sec: lseg.id, notes: 'from the old road', revs: [] });
  const baseSh = (id, title, extra) => Object.assign({ id, title, discipline: 'Drainage', number: '', series: '', road: '', status: 'Not started', owner: '', due: '', pct: 0, hoursBudget: 0, hoursActual: 0, milestone: '', notes: '', qc: {}, revs: [], gen: null }, extra);
  lseg.sheets.push(baseSh('shlat', 'Drainage Laterals – Lateral A-3 Sta 0+00 to 6+00 (PP 1 of 2)', { status: 'In progress', owner: 'Ana', notes: 'double bank', road: 'Lateral A-3', gen: { series: 'pp-lat', road: 'rdlat', idx: 1, of: 2, start: 0, end: 600, titleEdited: false } }));
  lseg.sheets.push(baseSh('shlat2', 'My lateral sheet', { gen: { series: 'pp-lat', road: 'rdlat', idx: 2, of: 2, start: 600, end: 1300, titleEdited: true } }));
  const xs = { id: 'xssec', kind: 'section', key: 'dr-det-xs', title: 'Detention Basin Cross Section', name: 'Detention Basin Cross Section', discipline: 'Drainage', series: null, notes: 'xs notes', revs: [], sheets: [baseSh('xs1', 'Detention Basin Cross Section', { owner: 'Bo', notes: 'old xs' })] };
  sub.segments.splice(sub.segments.findIndex((g) => g.key === 'dr-det') + 1, 0, xs);
  dseg.sheets.push(baseSh('lay1', 'Detention Basin Layout', { owner: 'Cia', notes: 'old layout' }));
  sub.templates.push({ id: 'told', title: 'Detention Basin Cross Section', discipline: 'Drainage', sec: 'dr-det-xs' });
  old.index.push({ id: 'iold', title: 'Detention Basin Layout', discipline: 'Drainage', sec: 'dr-det' });
  old.links.push({ id: 'lx', src: { t: 'seg', id: 'xssec' }, dst: { t: 'sheet', id: 'xs1' }, kind: 'dep', ack: 0, created: '2026-01-01T00:00:00.000Z' });
  const leg = M.migrate(old);
  const L = M.secOf(leg.subs[0], 'dr-lat'), D = M.secOf(leg.subs[0], 'dr-det');
  assert.ok(!leg.subs[0].segments.some((g) => g.key === 'dr-det-xs') && !M.secDef(leg, 'dr-det-xs'), 'cross-section branch removed on load');
  assert.strictEqual(D.title, 'Detention Basin');
  assert.ok(!M.isPPSec(L) && !leg.subs[0].roads.some((r) => r.id === 'rdlat'), 'lateral roads are not kept');
  assert.deepStrictEqual(L.sheets.map((q) => [q.id, q.title, q.status, q.owner]), [['shlat', 'Drainage Laterals (1 of 2)', 'In progress', 'Ana'], ['shlat2', 'My lateral sheet', 'Not started', '']]);
  assert.ok(/from the old road/.test(L.sheets[0].notes) && /double bank/.test(L.sheets[0].notes), 'road notes survive on the sheet');
  assert.ok(D.sheets.some((q) => q.id === 'xs1' && q.owner === 'Bo') && D.sheets.some((q) => q.id === 'lay1'), 'both old detention sheets land in the one pond section');
  assert.ok(/xs notes/.test(D.notes || ''), 'cross-section section notes are kept');
  assert.ok(!leg.subs[0].templates.some((t) => /detention basin (layout|cross section)/i.test(t.title)));
  assert.ok(!leg.index.some((t) => t.id === 'iold' || /detention basin layout/i.test(t.title)));
  assert.strictEqual(leg.links.find((l) => l.id === 'lx').src.id, D.id, 'a connector aimed at the old branch follows the sheets');
  M.setPondCount(leg, D.id, 1);
  assert.strictEqual(M.unitSheets(D).find((q) => q.id === 'lay1').title, 'Detention Basin – Pond 1 – Layout');
  assert.strictEqual(M.unitSheets(D).find((q) => q.id === 'xs1').title, 'Detention Basin – Pond 1 – Cross Sections');
  assert.strictEqual(M.unitSheets(D).find((q) => q.id === 'xs1').owner, 'Bo');
  assert.strictEqual(M.unitSheets(D).length, 4);
  const prop = E.outline(st, today).find((s) => s.id === 'proposed'), ptxt = prop.auto.map((b) => b.p || b.h || '').join(' ');
  assert(/detention pond/.test(ptxt) && /Layout, Cross Sections, and two Geometric Layout/.test(ptxt), ptxt);
  assert(/special junction box/.test(ptxt) && /3 sheets/.test(ptxt), ptxt);
  assert(/double-banked/.test(ptxt) && /lateral/.test(ptxt), ptxt);
});
t('v3.12 Bridge Deck Drain Details by count, no road', () => {
  const st = M.newState('P'); const deck = M.secOf(st.subs[0], 'dr-bd-det');
  assert.ok(M.isOptCountSec(deck) && M.isSheetCountSec(deck) && !M.isPPSec(deck), 'Bridge Deck Drain Details is a counted section');
  assert.throws(() => M.addRoad(st, deck.id, { road: 'Bent 4' }), /count/);
  M.addSheet(st, deck.id, { title: deck.title, owner: 'Ana', notes: 'bent 2' });
  const before = JSON.stringify(st);
  const P = M.planSheetCount(st, deck.id, 3);
  assert.strictEqual(JSON.stringify(st), before, 'planning does not change data');
  assert.deepStrictEqual([P.cur, P.create, !!P.adopt], [1, 2, true]);
  const r = M.setSheetCount(st, deck.id, 3);
  assert.deepStrictEqual([r.adopted, r.created], [1, 2]);
  const counted = deck.sheets.filter((q) => q.cnt);
  assert.deepStrictEqual(counted.map((q) => q.title), [1, 2, 3].map((i) => 'Bridge Deck Drain Details (' + i + ' of 3)'));
  assert.ok(counted.every((q) => !q.road && !q.gen));
  assert.strictEqual(counted[0].owner, 'Ana');
  assert.strictEqual(counted[0].notes, 'bent 2');
  counted[1].title = 'Deck drains at bent 4';
  M.setSheetCount(st, deck.id, 3);
  assert.strictEqual(counted[1].title, 'Deck drains at bent 4', 'edited titles are kept');
  const back = M.migrate(JSON.parse(JSON.stringify(st)));
  assert.deepStrictEqual(M.secOf(back.subs[0], 'dr-bd-det').sheets.map((q) => q.title), deck.sheets.map((q) => q.title), 'saved projects round-trip');
});
t('v3.13 drainage standards match the plan-set index; a 2-sheet standard adds both', () => {
  const st = M.newState('P'); const A = st.subs[0];
  const dr = M.secOf(A, 'dr-std'), sw = M.secOf(A, 'sw-std'), pp = M.secOf(A, 'dr-pp');
  const dNames = M.standardsForSection(dr).map((s) => s.name);
  assert.deepStrictEqual(dNames, [
    'HARRIS COUNTY FLOOD CONTROL DISTRICT NOTES (HCFCD-N-25 (HOU))',
    'HARRIS COUNTY FLOOD CONTROL DISTRICT CONCRETE CHANNEL LINING DETAILS',
    'HARRIS COUNTY FLOOD CONTROL DISTRICT STORM SEWER AND RIPRAP DETAILS',
    'HARRIS COUNTY FLOOD CONTROL DISTRICT STORM SEWER OUTFALL DETAILS (HCFCD-SSOD-25 (HOU))',
    'HCFCD-ISD-25 (HOU)',
    'HARRIS COUNTY ENGINEERING DEPARTMENT TYPE "A" INLET DETAILS',
    'HIL-C-25 (HOU)', 'HIL-C1-25 (HOU)', 'HIL-AZ-25 (HOU)', 'HIL-AZ2G-25 (HOU)', 'HIL-AZR-25 (HOU)', 'HIL-AZR2G-25 (HOU)',
    'MH-A/B-25 (HOU)', 'MSD-25 (HOU)', 'GD-25 (HOU)', 'C&DD-24 (HOU)',
    'PB', 'PBGC', 'PJB', 'PDD', 'PRM', 'PSL',
    'SCP-3', 'SCP-4', 'SCP-5', 'SCP-6', 'SCP-MD', 'BCS', 'SW-0',
    'SETP-CD', 'PSET-SC', 'PSET-RC', 'CH-FW-0', 'CH-FW-30',
  ]);
  for (const gone of ['PSET', 'SETP', 'CH-PW', 'PSET-SP', 'PSET-RR', 'SETP-PD', 'PW', 'FW-0', 'JB', 'MH', 'HIL-C-25']) assert.ok(!dNames.includes(gone), gone);
  const sNames = M.standardsForSection(sw).map((s) => s.name);
  assert.deepStrictEqual(sNames, ['EC(1)-16', 'EC(2)-16', 'EC(3)-16', 'EC(4)-16', 'EC(5)-16', 'EC(6)-16', 'EC(7)-16', 'EC(8)-16', 'EC(9)-16']);
  assert.ok(!sNames.some((n) => /HIL|HCFCD|SETP|PSET/.test(n)));
  const r = M.addStandardSheets(st, dr.id, ['HIL-C-25 (HOU)', 'PSL', 'EC(1)-16', 'HIL-C-25 (HOU)']);
  assert.deepStrictEqual([r.added, r.skipped], [3, 2], 'PSL is 2 sheets; the EC name and the repeat are skipped');
  assert.deepStrictEqual(dr.sheets.map((q) => q.title), ['HIL-C-25 (HOU)', 'PSL (1 of 2)', 'PSL (2 of 2)']);
  assert.ok(dr.sheets.every((q) => !q.road && q.discipline === 'Drainage'));
  dr.sheets[1].status = 'In progress';
  assert.strictEqual(M.addStandardSheets(st, dr.id, ['PSL']).added, 0, 'both PSL sheets already exist');
  assert.strictEqual(dr.sheets[1].status, 'In progress', 'an existing PSL sheet is not replaced');
  M.addSheet(st, dr.id, { title: 'My extra standard' });
  M.setSheetCount(st, dr.id, 1);
  assert.ok(dr.sheets.some((q) => q.title === 'My extra standard') && dr.sheets.some((q) => q.cnt), 'free-text add and the sheet count stay');
  const swAdd = M.addStandardSheets(st, sw.id, ['EC(1)-16', 'HIL-C-25 (HOU)']);
  assert.strictEqual(swAdd.added, 1);
  assert.deepStrictEqual(sw.sheets.map((q) => q.title), ['EC(1)-16']);
  const old = M.newState('Legacy');
  const oldStd = M.secOf(old.subs[0], 'dr-std');
  M.addSheet(old, oldStd.id, { title: 'PSL', owner: 'Ana', notes: 'from v3.12' });
  const kept = M.migrate(JSON.parse(JSON.stringify(old)));
  const keptStd = M.secOf(kept.subs[0], 'dr-std');
  assert.deepStrictEqual([keptStd.sheets[0].title, keptStd.sheets[0].owner, keptStd.sheets[0].notes], ['PSL', 'Ana', 'from v3.12'], 'an older single PSL sheet is left as it was');
  M.addStandardSheets(kept, keptStd.id, ['PSL', 'SW-0', 'C&DD-24 (HOU)', 'HCFCD-ISD-25 (HOU)']);
  assert.deepStrictEqual(keptStd.sheets.map((q) => q.title), ['PSL', 'PSL (1 of 2)', 'PSL (2 of 2)', 'SW-0 (1 of 2)', 'SW-0 (2 of 2)', 'C&DD-24 (HOU) (1 of 2)', 'C&DD-24 (HOU) (2 of 2)', 'HCFCD-ISD-25 (HOU) (1 of 2)', 'HCFCD-ISD-25 (HOU) (2 of 2)']);
  assert.throws(() => M.addStandardSheets(st, pp.id, ['PSL']), /Standards section/);
});
t('engineering report: counts v3.9 hydraulic data sheets (by count)', () => {
  const st = engState(); const A = st.subs[0];
  const inl = M.secOf(A, 'dr-hds-inlet'), x = M.secOf(A, 'dr-hds-x');
  M.setHydCount(st, inl.id, 3); M.setHydCount(st, x.id, 2);
  const hydN = (title) => st.subs.reduce((a, sub) => a + sub.segments.filter((g) => g.title === title).reduce((b, g) => b + g.sheets.length, 0), 0);
  const prop = E.outline(st, today).find((s) => s.id === 'proposed'), ptxt = prop.auto.map((b) => b.p || '').join(' ');
  assert(new RegExp(hydN(inl.title) + ' sheets of Inlet Computations').test(ptxt) && new RegExp(hydN(x.title) + ' sheets of Crossing').test(ptxt), ptxt);
  assert(!prop.auto.some((b) => b.ul && b.ul.some((li) => /\(1 of 2\)/.test(li))), 'generic counted titles are not listed as crossings');
  const idx = E.outline(st, today).find((s) => s.id === 'sheets').auto.find((b) => b.table).table.rows;
  assert(idx.some((r) => /Inlet Computations \(3 of 3\)/.test(r[1])) && idx.some((r) => /Crossing \(2 of 2\)/.test(r[1])));
});
(async () => {
  let passed = 0;
  for (const [name, fn] of tests) {
    try { await fn(); passed++; } catch (e) { console.error('FAIL', name, e); process.exit(1); }
  }
  console.log('ok', passed, 'tests');
})();
