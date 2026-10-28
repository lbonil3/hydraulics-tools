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
  for (const bad of ['', '10', '10+5', '10+100', 'a+00', '-1+00']) assert(Number.isNaN(M.parseStation(bad)), bad);
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
function setup() {
  const st = M.newState();
  const [A, B] = st.subs;
  const s1 = M.addSegment(st, A.id, { name: 'Mainlane', road: 'FM 1960', start: '10+00', end: '25+50' }).seg;
  const s2 = M.addSegment(st, B.id, { name: 'Cross St', road: 'Kuykendahl', start: '100+00', end: '104+80', scale: 40 }).seg;
  return { st, A, B, s1, s2 };
}
t('segment scale inherit/override, series scale, totals, what-if', () => {
  const { st, A, B, s1, s2 } = setup();
  assert.strictEqual(M.segScale(A, s1), 100);
  assert.strictEqual(M.segScale(B, s2), 40);
  let p = M.segPP(st, A, s1);
  assert.deepStrictEqual(p.series.map((x) => x.count), [2, 2]); // drainage PP + SWP3 layout (storm disabled)
  assert.strictEqual(M.segPP(st, B, s2).total, 2); // 480 ft at 40 scale = 1 each series
  let S = M.ppSummary(st);
  assert.deepStrictEqual(S.bySub.map((b) => b.total), [4, 2, 0, 0]);
  assert.strictEqual(S.total, 6);
  // what-if A at 50 scale: 1550/600 -> 3 each; not saved
  const W = M.ppSummary(st, { subScale: { [A.id]: 50 } });
  assert.strictEqual(W.bySub[0].total, 6);
  assert.strictEqual(A.scale, 100);
  // what-if does not override a segment's own scale
  assert.strictEqual(M.ppSummary(st, { subScale: { [B.id]: 20 } }).bySub[1].total, 2);
  // per-series fixed scale
  st.settings.series[2].scale = 20; // SWP3 at 20 scale: 1550/240 -> 7
  assert.deepStrictEqual(M.segPP(st, A, s1).series.map((x) => x.count), [2, 7]);
  st.settings.overlapFt = 0;
  assert.match(M.ppCSV(st), /Project total,,,,,2030,,,,,12/);
});
t('generate PP sheets: ranges, idempotent regenerate, safe shrink', () => {
  const { st, s1 } = setup();
  M.bulkAddTemplates(st, s1.id);
  const userCount = s1.sheets.length;
  let plan = M.planGenerate(st, s1.id);
  assert.strictEqual(plan.create.length, 4);
  M.applyGenerate(st, s1.id, plan);
  const gen = s1.sheets.filter((s) => s.gen);
  assert.strictEqual(gen.length, 4);
  assert.strictEqual(gen[0].title, 'Drainage Plan & Profile – Sta 10+00 to 22+00 (PP 1 of 2)');
  assert.strictEqual(gen[1].title, 'Drainage Plan & Profile – Sta 22+00 to 25+50 (PP 2 of 2)');
  assert.strictEqual(gen[2].discipline, 'SWP3');
  // idempotent
  plan = M.planGenerate(st, s1.id);
  assert.deepStrictEqual([plan.create.length, plan.update.length, plan.remove.length, plan.removeTouched.length, plan.unchanged], [0, 0, 0, 0, 4]);
  // edit one generated sheet, extend segment -> update keeps status, adds third
  M.updateSheet(st, gen[0].id, { status: 'In progress', owner: 'Ana' });
  M.updateSegment(st, s1.id, { end: '35+00' });
  plan = M.planGenerate(st, s1.id);
  assert.deepStrictEqual([plan.create.length, plan.update.length], [2, 4]);
  M.applyGenerate(st, s1.id, plan);
  const g0 = s1.sheets.find((s) => s.id === gen[0].id);
  assert.strictEqual(g0.status, 'In progress');
  assert.strictEqual(g0.title, 'Drainage Plan & Profile – Sta 10+00 to 22+00 (PP 1 of 3)');
  // shrink: untouched extras removed, touched extra needs confirm
  const third = s1.sheets.find((s) => s.gen && s.gen.series === 'pp-drain' && s.gen.idx === 3);
  M.updateSheet(st, third.id, { notes: 'started' });
  M.updateSegment(st, s1.id, { end: '20+00' });
  plan = M.planGenerate(st, s1.id);
  assert.strictEqual(plan.removeTouched.length, 1);
  assert.strictEqual(plan.remove.length, 3); // drain#2, swp3#2, swp3#3
  let r = M.applyGenerate(st, s1.id, plan, { removeTouched: false });
  assert.strictEqual(r.keptTouched, 1);
  assert(s1.sheets.includes(third));
  r = M.applyGenerate(st, s1.id, M.planGenerate(st, s1.id), { removeTouched: true });
  assert(!s1.sheets.includes(third));
  assert.strictEqual(s1.sheets.filter((s) => s.gen).length, 2);
  assert.strictEqual(s1.sheets.filter((s) => !s.gen).length, userCount, 'user sheets untouched');
  // user-edited generated title is kept
  M.updateSheet(st, g0.id, { title: 'PP-1 custom' });
  M.updateSegment(st, s1.id, { end: '21+00' });
  M.applyGenerate(st, s1.id, M.planGenerate(st, s1.id));
  assert.strictEqual(g0.title, 'PP-1 custom');
  assert.strictEqual(g0.gen.end, 2100);
  // disabling a series removes its untouched generated sheets
  st.settings.series[2].enabled = false;
  M.applyGenerate(st, s1.id, M.planGenerate(st, s1.id));
  assert(!s1.sheets.some((s) => s.gen && s.gen.series === 'pp-swp3'));
});
t('sheet fields, %/status sync, deps, QC, staff roles, log', () => {
  const { st, s1 } = setup();
  const a = M.addSheet(st, s1.id, { title: 'Drainage Area Map' });
  const b = M.addSheet(st, s1.id, { title: 'Hydraulic Data', hoursBudget: 12 });
  M.updateSheet(st, b.id, { deps: [a.id, b.id, 'nope'], pct: 55.4, hoursActual: 3.25, owner: 'Bo', number: 'DR-02', qc: { 'Design check': true } });
  assert.deepStrictEqual(b.deps, [a.id]);
  assert.strictEqual(b.pct, 55);
  assert.strictEqual(b.hoursActual, 3.3);
  assert.deepStrictEqual(M.blockedBy(st, b).map((s) => s.id), [a.id]);
  M.updateSheet(st, a.id, { status: 'Done' });
  assert.strictEqual(a.pct, 100);
  assert.strictEqual(M.blockedBy(st, b).length, 0);
  M.updateSheet(st, b.id, { pct: 100 });
  assert.strictEqual(b.status, 'Done');
  assert.throws(() => M.updateSheet(st, b.id, { pct: -1 }));
  M.addStaff(st, 'Bo', 'EIT');
  assert.deepStrictEqual(st.staff, [{ name: 'Bo', role: 'EIT' }]);
  M.deleteSheet(st, a.id);
  assert.deepStrictEqual(b.deps, []);
  assert(st.log.length >= 5 && /Deleted sheet/.test(st.log[0].msg));
  const d = M.duplicateSheet(st, b.id);
  assert.strictEqual(d.status, 'Not started');
});
t('progress, summary, workload hours, milestones, overdue/upcoming, filters, sort, views', () => {
  const { st, A, B, s1, s2 } = setup();
  const [m30, m60] = st.milestones;
  m30.date = '2026-11-15';
  const mk = (seg, f) => { const s = M.addSheet(st, seg.id, { title: f.title || 'x' }); M.updateSheet(st, s.id, f); return s; };
  mk(s1, { title: 'Done one', status: 'Done', owner: 'Ana', due: '2026-01-01', milestone: m30.id, hoursBudget: 10, hoursActual: 12 });
  mk(s1, { title: 'Late', status: 'In progress', owner: 'Ana', due: '2026-10-01', milestone: m30.id, hoursBudget: 8 });
  mk(s1, { title: 'Soon', status: 'In review', owner: 'Bo', due: '2026-11-05', discipline: 'SWP3' });
  mk(s2, { title: 'Pct', pct: 60 });
  const p = M.progress(s1.sheets);
  assert.strictEqual(p.pct, 73.3);
  assert.strictEqual(M.progress(s2.sheets).pct, 60); // % complete refines Not started weight
  const S = M.summary(st, today);
  assert.deepStrictEqual(S.overdue.map((r) => r.sh.title), ['Late']);
  assert.deepStrictEqual(S.upcoming.map((r) => r.sh.title), ['Soon']);
  const ana = S.workload.find((w) => w.owner === 'Ana');
  assert.deepStrictEqual([ana.open, ana.done, ana.overdue, ana.hoursBudget, ana.hoursActual], [1, 1, 1, 18, 12]);
  assert.deepStrictEqual(S.milestones.map((x) => x.total), [2, 0, 0, 0]);
  const rows = M.allSheets(st);
  assert.strictEqual(M.filterRows(rows, { milestone: m30.id }).length, 2);
  assert.strictEqual(M.filterRows(rows, { milestone: '(none)' }).length, 2);
  assert.strictEqual(M.filterRows(rows, { when: 'overdue' }, today).length, 1);
  assert.strictEqual(M.filterRows(rows, { when: 'upcoming' }, today).length, 1);
  assert.strictEqual(M.filterRows(rows, { when: 'open' }, today).length, 3);
  assert.strictEqual(M.filterRows(rows, { discipline: 'SWP3', sub: A.id }).length, 1);
  assert.strictEqual(M.filterRows(rows, { q: 'kuykendahl' }).length, 1);
  const sorted = M.sortRows(rows, 'due', 'asc', (r, k) => r.sh[k]);
  assert.deepStrictEqual(sorted.map((r) => r.sh.due), ['2026-01-01', '2026-10-01', '2026-11-05', '']);
  assert.strictEqual(M.sortRows(rows, 'pct', 'desc', (r, k) => r.sh[k])[0].sh.pct, 100);
  M.saveView(st, 'Ana open', { owner: 'Ana', when: 'open' });
  M.saveView(st, 'Ana open', { owner: 'Ana' });
  assert.strictEqual(st.views.length, 1);
  M.removeMilestone(st, m30.id);
  assert.strictEqual(M.filterRows(M.allSheets(st), { milestone: '(none)' }).length, 4);
  void m60; void B;
});
t('CSV export: all columns, quoting, formula guard', () => {
  const { st, s1 } = setup();
  const s = M.addSheet(st, s1.id, { title: '=HYPERLINK("x")', notes: 'a\nb' });
  const csv = M.toCSV(st, M.allSheets(st));
  const [head, row] = csv.split('\r\n');
  assert(head.startsWith('Sub-project,Segment,Road,Seg Start,Seg End,Sheet No,Sheet,Series'));
  assert(row.includes('"\'=HYPERLINK(""x"")"') && row.endsWith('"a\nb"'));
  void s;
});
t('migration from v1 encrypted vault', async () => {
  const v1 = { schema: 1, project: { name: 'Old' }, staff: ['Ana'], settings: { autoLockMin: 5 }, lastBackup: '2026-10-01T00:00:00Z', created: '2026-09-01',
    subs: ['A', 'B', 'C', 'D'].map((code, i) => ({ id: 's' + i, code, name: 'Sub ' + code, templates: [{ id: 't', title: 'Culvert Layout', discipline: 'Drainage' }],
      segments: i ? [] : [{ id: 'g1', name: 'Seg', road: 'FM 1', start: 1000, end: 2550, notes: '', sheets: [{ id: 'h1', title: 'Culvert Layout', discipline: 'Drainage', status: 'Done', owner: 'Ana', due: '', notes: 'n' }] }] })) };
  const { env } = await C.seal('old vault pass', v1, 'vault', ITER);
  await assert.rejects(C.open('wrong one here', env, 'vault'), /Wrong passphrase/);
  const st = M.migrate((await C.open('old vault pass', env, 'vault')).data);
  assert.strictEqual(st.schema, 2);
  assert.deepStrictEqual(st.staff, [{ name: 'Ana', role: '' }]);
  const sh = st.subs[0].segments[0].sheets[0];
  assert.deepStrictEqual([sh.id, sh.status, sh.pct, sh.owner, sh.notes], ['h1', 'Done', 100, 'Ana', 'n']);
  assert.strictEqual(st.subs[0].scale, 100);
  assert.strictEqual(M.segPP(st, st.subs[0], st.subs[0].segments[0]).total, 4);
  assert.strictEqual(st.lastBackup, v1.lastBackup);
  assert.throws(() => M.migrate({ schema: 9, subs: [] }), /Unknown/);
});
t('backup round trip (plain v2) and old encrypted backups', async () => {
  const { st, s1 } = setup();
  M.applyGenerate(st, s1.id, M.planGenerate(st, s1.id));
  const file = JSON.stringify(M.backupFile(st));
  assert.deepStrictEqual(M.readBackup(JSON.parse(file)), JSON.parse(JSON.stringify(st)));
  assert.throws(() => M.readBackup({ foo: 1 }), /Not a PM backup/);
  const v1 = { schema: 1, project: { name: 'B' }, staff: [], subs: [{ id: 'a', code: 'A', name: 'A', segments: [] }] };
  const enc = (await C.seal('backup pass 1', v1, 'backup', ITER)).env;
  const back = M.migrate((await C.open('backup pass 1', JSON.parse(JSON.stringify(enc)), 'backup')).data);
  assert.strictEqual(back.project.name, 'B');
});
t('crypto still works (kept for v1 migration)', async () => {
  assert(C.ITER >= 600000);
  const { env } = await C.seal('pass phrase 123', { a: 1 }, 'vault', ITER);
  const ct = C.unb64(env.ct); ct[3] ^= 1;
  await assert.rejects(C.open('pass phrase 123', { ...env, ct: C.b64(ct) }, 'vault'), /modified/);
});

(async () => {
  let passed = 0;
  for (const [name, fn] of tests) {
    try { await fn(); passed++; } catch (e) { console.error('FAIL', name, e); process.exit(1); }
  }
  console.log('ok', passed, 'tests');
})();
