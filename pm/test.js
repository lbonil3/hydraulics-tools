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
  assert.match(M.ppCSV(st), /Project total,All,,,,,2030,,,,,12/);
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
  assert.deepStrictEqual(M.linksOf(st, { t: 'sheet', id: b.id }).in.map((l) => l.src.id), [a.id]);
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
  assert.strictEqual(st.links.length, 0, 'links to a deleted sheet are pruned');
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

function linkSetup() {
  const st = M.newState();
  const [A, B, Cc] = st.subs;
  const a = M.addSegment(st, A.id, { name: 'A1', start: '10+00', end: '20+00' }).seg;
  const b = M.addSegment(st, B.id, { name: 'B1', start: '50+00', end: '60+00' }).seg;
  const c = M.addSegment(st, Cc.id, { name: 'C1', start: '80+00', end: '90+00' }).seg;
  const sa = M.addSheet(st, a.id, { title: 'A culvert' });
  const sb = M.addSheet(st, b.id, { title: 'B culvert' });
  const sc = M.addSheet(st, c.id, { title: 'C culvert' });
  const R = (x) => ({ t: 'sheet', id: x.id });
  return { st, A, B, Cc, a, b, c, sa, sb, sc, R };
}
t('connectors: cross-project links, wrong-direction warning, duplicates, self', () => {
  const { st, A, B, a, sa, sb, sc, R } = linkSetup();
  const r = M.addLink(st, R(sa), R(sb), 'dep');
  assert.strictEqual(r.warns.length, 0);
  assert(M.isCross(st, r.link));
  assert.throws(() => M.addLink(st, R(sa), R(sb), 'dep'), /already exists/);
  assert.throws(() => M.addLink(st, R(sa), R(sa), 'dep'), /itself/);
  const w = M.addLink(st, R(sc), R(sa), 'update');
  assert.strictEqual(w.warns.length, 1);
  assert.match(w.warns[0], /Points upstream/);
  assert(M.wrongWay(st, w.link));
  // reorder build sequence: C first → the same link is no longer wrong-way
  M.setOrder(st, [st.subs[2].id, A.id, B.id, st.subs[3].id]);
  assert.deepStrictEqual(M.orderedSubs(st).map((s) => s.code), ['C', 'A', 'B', 'D']);
  assert(!M.wrongWay(st, w.link));
  assert(M.wrongWay(st, M.addLink(st, { t: 'seg', id: a.id }, R(sc), 'dep').link));
  assert.match(M.depsCSV(st), /^Type,From sub/);
  assert.strictEqual(M.depsCSV(st).trim().split('\r\n').length, 4);
});
t('connectors: cycle detection blocks circular dependencies', () => {
  const { st, sa, sb, sc, R } = linkSetup();
  M.addLink(st, R(sa), R(sb), 'dep');
  M.addLink(st, R(sb), R(sc), 'dep');
  assert.throws(() => M.addLink(st, R(sc), R(sa), 'dep'), /circular dependency/);
  assert.throws(() => M.addLink(st, R(sb), R(sa), 'dep'), /circular/);
  // update links do not create dependency cycles
  M.addLink(st, R(sc), R(sa), 'update');
  assert.strictEqual(st.links.length, 3);
});
t('connectors: blocked / ready, segment prerequisites', () => {
  const { st, b, sa, sb, sc, R } = linkSetup();
  M.addLink(st, R(sa), R(sb), 'dep');
  M.addLink(st, { t: 'seg', id: b.id }, R(sc), 'dep');
  let F = M.flags(st);
  assert.deepStrictEqual(F.blocked.map((x) => x.ref.id).sort(), [sb.id, sc.id].sort());
  assert.deepStrictEqual(F.ready, []);
  assert.deepStrictEqual(M.blockedBy(st, sb).map((s) => s.id), [sa.id]);
  M.updateSheet(st, sa.id, { status: 'Done' });
  F = M.flags(st);
  assert.deepStrictEqual(F.blocked.map((x) => x.ref.id), [sc.id]);
  assert.deepStrictEqual(F.ready.map((x) => x.ref.id), [sb.id]);
  M.updateSheet(st, sb.id, { status: 'Done' }); // segment B1 all done → C unblocked
  F = M.flags(st);
  assert.deepStrictEqual(F.blocked, []);
  assert.deepStrictEqual(F.ready.map((x) => x.ref.id), [sc.id]);
  const rows = M.allSheets(st);
  assert.strictEqual(M.filterRows(rows, { flag: 'ready', st }).length, 1);
  assert.strictEqual(M.filterRows(rows, { flag: 'linked', st }).length, 3);
});
t('connectors: change propagation and acknowledgement', () => {
  const { st, a, sa, sb, sc, R } = linkSetup();
  M.addLink(st, R(sa), R(sb), 'update');
  M.addLink(st, R(sa), R(sc), 'dep');
  assert.deepStrictEqual(M.flags(st).update, []);
  M.markRevised(st, R(sa), 'Pipe size changed');
  assert.deepStrictEqual(M.flags(st).update.map((x) => x.ref.id).sort(), [sb.id, sc.id].sort());
  assert.strictEqual(M.filterRows(M.allSheets(st), { flag: 'update', st }).length, 2);
  assert.strictEqual(M.markUpdated(st, R(sb)), 1);
  assert.deepStrictEqual(M.flags(st).update.map((x) => x.ref.id), [sc.id]);
  // re-opening a Done sheet counts as a revision automatically
  M.markUpdated(st, R(sc));
  M.updateSheet(st, sa.id, { status: 'Done' });
  assert.strictEqual(M.flags(st).update.length, 0);
  M.updateSheet(st, sa.id, { status: 'In progress' });
  assert.strictEqual(sa.revs.length, 2);
  assert.match(sa.revs[1].note, /Re-opened/);
  assert.strictEqual(M.flags(st).update.length, 2);
  // a link created after a revision starts acknowledged
  const s2 = M.addSheet(st, a.id, { title: 'late link' });
  M.addLink(st, R(sa), R(s2), 'update');
  assert(!M.needsUpdate(st, R(s2)).length);
  // segments can be revised too
  M.addLink(st, { t: 'seg', id: a.id }, R(sb), 'update');
  M.markRevised(st, { t: 'seg', id: a.id }, 'Alignment shift');
  assert(M.needsUpdate(st, R(sb)).some((l) => l.src.t === 'seg'));
});
t('connectors: impact upstream/downstream', () => {
  const { st, b, sa, sb, sc, R } = linkSetup();
  M.addLink(st, R(sa), R(sb), 'dep');
  M.addLink(st, R(sb), { t: 'seg', id: b.id }, 'update');
  M.addLink(st, { t: 'seg', id: b.id }, R(sc), 'dep');
  const I = M.impact(st, R(sb));
  assert.deepStrictEqual([...I.up], ['sheet:' + sa.id]);
  assert.deepStrictEqual([...I.down].sort(), ['seg:' + b.id, 'sheet:' + sc.id].sort());
  assert.strictEqual(M.impact(st, R(sa)).down.size, 3);
});
t('connectors: migration of v2.0 sheet.deps, pruning, backup round trip', () => {
  const { st, a, sa, R } = linkSetup();
  const s2 = M.addSheet(st, a.id, { title: 'needs culvert' });
  const old = JSON.parse(JSON.stringify(st));
  delete old.links;
  for (const sub of old.subs) { delete sub.order; for (const g of sub.segments) { delete g.revs; for (const h of g.sheets) { delete h.revs; h.deps = []; } } }
  old.subs[0].segments[0].sheets[1].deps = [sa.id, 'gone'];
  const m = M.migrate(old);
  assert.strictEqual(m.links.length, 1);
  assert.deepStrictEqual([m.links[0].src.id, m.links[0].dst.id, m.links[0].kind], [sa.id, s2.id, 'dep']);
  assert(m.subs.every((s, i) => s.order === i + 1));
  assert(!('deps' in m.subs[0].segments[0].sheets[1]));
  assert.deepStrictEqual(M.blockedBy(m, m.subs[0].segments[0].sheets[1]).map((x) => x.id), [sa.id]);
  M.addLink(m, R(sa), { t: 'sheet', id: m.subs[1].segments[0].sheets[0].id }, 'update');
  M.markRevised(m, R(sa), 'x');
  const back = M.readBackup(JSON.parse(JSON.stringify(M.backupFile(m))));
  assert.deepStrictEqual(back, JSON.parse(JSON.stringify(m)));
  assert.strictEqual(M.flags(back).update.length, 2);
  M.deleteSheet(back, sa.id);
  assert.strictEqual(back.links.length, 0);
});

t('v2.2 disciplines: migration default by title/series keywords', () => {
  assert.strictEqual(M.guessDiscipline('Erosion Control Plan'), 'SWP3');
  assert.strictEqual(M.guessDiscipline('Stormwater Pollution Prevention'), 'SWP3');
  assert.strictEqual(M.guessDiscipline('Sheet 3', 'SWP3 Layout'), 'SWP3');
  assert.strictEqual(M.guessDiscipline('Storm Sewer Plan & Profile'), 'Drainage');
  assert.strictEqual(M.guessDiscipline('Culvert Layout'), 'Drainage');
  const st = M.newState();
  const g = M.addSegment(st, st.subs[0].id, { name: 'ML', start: '10+00', end: '20+00' }).seg;
  const a = M.addSheet(st, g.id, { title: 'Erosion control details' });
  assert.strictEqual(a.discipline, 'SWP3', 'new sheet without discipline guesses SWP3');
  const old = JSON.parse(JSON.stringify(st));
  const sh = old.subs[0].segments[0].sheets;
  sh.push(Object.assign({}, sh[0], { id: 'x1', title: 'Silt fence layout', discipline: undefined }));
  sh.push(Object.assign({}, sh[0], { id: 'x2', title: 'Drainage area map', discipline: '' }));
  sh.push(Object.assign({}, sh[0], { id: 'x3', title: 'Keep me', discipline: 'Drainage' }));
  const m = M.migrate(old);
  const by = Object.fromEntries(m.subs[0].segments[0].sheets.map((x) => [x.id, x.discipline]));
  assert.deepStrictEqual([by.x1, by.x2, by.x3, by[a.id]], ['SWP3', 'Drainage', 'Drainage', 'SWP3']);
  assert.strictEqual(m.subs[0].segments[0].sheets.length, 4, 'no sheets lost');
});
t('v2.2 disciplines: per-branch aggregation and PP counts', () => {
  const st = M.newState();
  const A = st.subs[0];
  const g = M.addSegment(st, A.id, { name: 'ML', start: '10+00', end: '25+50' }).seg; // 1550 ft @100: 2 per series
  const d1 = M.addSheet(st, g.id, { title: 'Culvert', discipline: 'Drainage' });
  M.addSheet(st, g.id, { title: 'Inlet', discipline: 'Drainage' });
  const s1 = M.addSheet(st, g.id, { title: 'SW1', discipline: 'SWP3' });
  M.updateSheet(st, d1.id, { status: 'Done' });
  M.updateSheet(st, s1.id, { due: '2020-01-01' });
  const D = M.branchStats(st, A, 'Drainage'), S = M.branchStats(st, A, 'SWP3');
  assert.deepStrictEqual([D.total, D.done, D.pct, D.pp, D.overdue], [2, 1, 50, 2, 0]);
  assert.deepStrictEqual([S.total, S.done, S.pct, S.pp, S.overdue], [1, 0, 0, 2, 1]);
  M.addLink(st, { t: 'sheet', id: s1.id }, { t: 'sheet', id: d1.id }, 'dep');
  M.updateSheet(st, d1.id, { status: 'In progress' });
  assert.strictEqual(M.branchStats(st, A, 'Drainage').blocked, 1, 'cross-discipline connector blocks drainage sheet');
  st.settings.series.find((x) => x.id === 'pp-storm').enabled = true;
  const P = M.ppSummary(st);
  assert.deepStrictEqual([P.byDisc.Drainage, P.byDisc.SWP3, P.bySub[0].disc.Drainage, P.total], [4, 2, 4, 6]);
  assert.strictEqual(M.segPP(st, A, g, { discipline: 'SWP3' }).total, 2);
  assert.match(M.ppCSV(st), /Project total,Drainage,,,,,,,,,,4/);
  assert.match(M.ppCSV(st), /A total,SWP3,,,,,,,,,,2/);
});
t('v2.2 disciplines: generate PP sheets per discipline only', () => {
  const st = M.newState();
  const g = M.addSegment(st, st.subs[0].id, { name: 'ML', start: '10+00', end: '25+50' }).seg;
  const p1 = M.planGenerate(st, g.id, { discipline: 'SWP3' });
  assert.ok(p1.create.length === 2 && p1.create.every((c) => c.series.id === 'pp-swp3'));
  M.applyGenerate(st, g.id, p1);
  assert.deepStrictEqual(g.sheets.map((x) => x.discipline), ['SWP3', 'SWP3']);
  assert.strictEqual(M.planGenerate(st, g.id, { discipline: 'SWP3' }).create.length, 0, 'SWP3 up to date');
  const p2 = M.planGenerate(st, g.id, { discipline: 'Drainage' });
  assert.ok(p2.create.length === 2 && p2.create.every((c) => c.series.id === 'pp-drain') && !p2.remove.length);
  M.applyGenerate(st, g.id, p2);
  assert.strictEqual(g.sheets.length, 4);
  // station edit shared by both branches: shrinking regenerates per discipline, the other stays pending
  M.updateSegment(st, g.id, { name: 'ML', start: '10+00', end: '20+00' });
  const p3 = M.planGenerate(st, g.id, { discipline: 'Drainage' });
  assert.ok(p3.remove.length === 1 && p3.remove[0].discipline === 'Drainage');
  M.applyGenerate(st, g.id, p3);
  assert.strictEqual(M.planGenerate(st, g.id, { discipline: 'SWP3' }).remove.length, 1);
  assert.strictEqual(g.sheets.filter((x) => x.discipline === 'SWP3').length, 2);
});

t('v2.3 segments: road only, auto label, migration of names', () => {
  const st = M.newState();
  const r = M.addSegment(st, st.subs[0].id, { road: 'FM 1960', start: '10+00', end: '25+50' });
  assert.strictEqual(r.seg.name, 'FM 1960 Sta 10+00–25+50');
  assert.throws(() => M.addSegment(st, st.subs[0].id, { road: ' ', start: '30+00', end: '31+00' }), /Road name is required/);
  M.updateSegment(st, r.seg.id, { road: 'FM 1960 WB', end: '26+00' });
  assert.strictEqual(r.seg.name, 'FM 1960 WB Sta 10+00–26+00');
  M.addSegment(st, st.subs[1].id, { road: 'Kuykendahl Rd', start: '1+00', end: '2+00' });
  assert.deepStrictEqual(M.roads(st), ['FM 1960 WB', 'Kuykendahl Rd']);
  const old = JSON.parse(JSON.stringify(st));
  old.subs[0].segments[0].name = 'Mainlane North'; // name + road → keep road
  old.subs[1].segments[0].road = ''; old.subs[1].segments[0].name = 'Cross Street'; // name only → road
  const m = M.migrate(old);
  assert.deepStrictEqual([m.subs[0].segments[0].road, m.subs[0].segments[0].name], ['FM 1960 WB', 'FM 1960 WB Sta 10+00–26+00']);
  assert.deepStrictEqual([m.subs[1].segments[0].road, m.subs[1].segments[0].name], ['Cross Street', 'Cross Street Sta 1+00–2+00']);
  assert.strictEqual(m.subs[0].segments[0].sheets.length, 0);
  assert.deepStrictEqual(M.readBackup(JSON.parse(JSON.stringify(M.backupFile(m)))), JSON.parse(JSON.stringify(m)));
});

t('v2.4 default sheet templates; reset only on request; user data untouched', () => {
  const st = M.newState();
  const titles = st.subs[0].templates.map((x) => x.title);
  assert.ok(['Drainage Area Map', 'Hydrologic / Hydraulic Data Sheet', 'Inlet / Manhole Schedule', 'Culvert Layout', 'Cross Culvert Profile', 'Ditch / Channel Details', 'Outfall / Detention / Pond Layout', 'Standard & Miscellaneous Drainage Details', 'Culvert & Storm Sewer Quantity Summary', 'SWP3 Summary & Notes', 'SWP3 Standard Details'].every((x) => titles.includes(x)));
  assert.deepStrictEqual(st.settings.series.map((x) => [x.id, x.discipline, x.enabled]), [['pp-drain', 'Drainage', true], ['pp-storm', 'Drainage', false], ['pp-swp3', 'SWP3', true]]);
  const old = JSON.parse(JSON.stringify(st));
  old.subs[0].templates = [{ id: 't1', title: 'My custom sheet', discipline: 'Drainage' }];
  const m = M.migrate(old);
  assert.deepStrictEqual(m.subs[0].templates.map((x) => x.title), ['My custom sheet'], 'existing templates untouched');
  M.resetTemplates(m, m.subs[0].id);
  assert.strictEqual(m.subs[0].templates.length, M.DEFAULT_TEMPLATES.length);
  m.subs[1].templates = [];
  M.resetAllTemplates(m);
  assert.ok(m.subs.every((s) => s.templates.length === M.DEFAULT_TEMPLATES.length));
  const g = M.addSegment(m, m.subs[0].id, { road: 'SH 249', start: '0+00', end: '5+00' }).seg;
  assert.strictEqual(M.bulkAddTemplates(m, g.id, { discipline: 'SWP3' }).length, 2);
});

t('v2.5 project sheet index: edit once, bulk-apply to every segment, skip existing', () => {
  const st = M.newState();
  assert.strictEqual(st.index.length, M.DEFAULT_TEMPLATES.length);
  const g1 = M.addSegment(st, st.subs[0].id, { road: 'FM 1960', start: '10+00', end: '20+00' }).seg;
  const g2 = M.addSegment(st, st.subs[2].id, { road: 'SH 249', start: '0+00', end: '5+00' }).seg;
  M.addSheet(st, g1.id, { title: 'drainage area map', discipline: 'Drainage' });
  const it = M.addIndexItem(st, { title: 'Utility Conflict Sheet' });
  assert.strictEqual(it.discipline, 'Drainage');
  assert.throws(() => M.addIndexItem(st, { title: 'Utility conflict sheet' }), /already/);
  M.updateIndexItem(st, it.id, { discipline: 'SWP3' });
  M.moveIndexItem(st, it.id, -1);
  assert.strictEqual(st.index[st.index.length - 2].id, it.id);
  const n = st.index.length;
  const P = M.planIndex(st);
  assert.deepStrictEqual([P.count, P.segments], [2 * n - 1, 2]);
  assert.strictEqual(M.applyIndex(st), 2 * n - 1);
  assert.strictEqual(g1.sheets.length, n, 'existing “Drainage Area Map” skipped (case-insensitive)');
  assert.strictEqual(M.applyIndex(st), 0, 'second apply adds nothing');
  assert.strictEqual(g2.sheets.filter((x) => x.discipline === 'SWP3').length, 3);
  M.removeIndexItem(st, it.id);
  assert.strictEqual(g1.sheets.length, n, 'removing from index never deletes sheets');
  M.indexToTemplates(st);
  assert.deepStrictEqual(st.subs[3].templates.map((x) => x.title), st.index.map((x) => x.title));
  const m = M.migrate(Object.assign(JSON.parse(JSON.stringify(st)), { index: undefined }));
  assert.strictEqual(m.index.length, M.DEFAULT_TEMPLATES.length, 'older data gets the default index');
});

t('v2.6 sheet-number ranges: suggestion, duplicates, out-of-range, auto-number', () => {
  const st = M.newState();
  const g = M.addSegment(st, st.subs[0].id, { road: 'FM 1960', start: '10+00', end: '35+00' }).seg;
  M.applyGenerate(st, g.id, M.planGenerate(st, g.id));
  M.bulkAddTemplates(st, g.id, {});
  const dam = g.sheets.find((x) => x.title === 'Drainage Area Map');
  const pp1 = g.sheets.find((x) => x.gen && x.gen.series === 'pp-drain' && x.gen.idx === 1);
  const sw = g.sheets.find((x) => x.title === 'SWP3 Standard Details');
  assert.strictEqual(M.rangeFor(st, dam).from, 1);
  assert.strictEqual(M.rangeFor(st, pp1).key, 'series:pp-drain');
  assert.strictEqual(M.rangeFor(st, sw).key, 'disc:SWP3');
  assert.strictEqual(M.suggestNumber(st, dam), '1');
  M.updateSheet(st, dam.id, { number: '1' });
  const dam2 = M.addSheet(st, g.id, { title: 'Drainage Area Map', discipline: 'Drainage' });
  assert.strictEqual(M.suggestNumber(st, dam2), '2', 'next free number in range');
  M.updateSheet(st, dam2.id, { number: '1' });
  assert.match(M.numberIssues(st, dam2)[0], /Duplicate sheet number/);
  M.updateSheet(st, dam2.id, { number: '55' });
  assert.match(M.numberIssues(st, dam2)[0], /Out of range: Drainage Area Map uses 1–9/);
  assert.deepStrictEqual([pp1.number, M.numberIssues(st, pp1).length], ['10', 0], 'generated PP sheets get range numbers');
  M.updateSheet(st, pp1.id, { number: 'DRAIN-1' });
  assert.strictEqual(M.numberIssues(st, pp1).length, 0, 'non-numeric numbers are not range-checked');
  assert.strictEqual(M.allNumberIssues(st).length, 1);
  M.setRange(st, 'tpl:drainage area map', { to: 9 }); M.updateSheet(st, dam2.id, { number: '2' });
  assert.strictEqual(M.allNumberIssues(st).length, 0);
  assert.throws(() => M.setRange(st, 'disc:SWP3', { from: 9, to: 3 }), /to/);
  const n = M.autoNumber(st, { all: true });
  assert.strictEqual(n, g.sheets.length);
  assert.strictEqual(pp1.number, '10');
  assert.strictEqual(new Set(g.sheets.map((x) => x.number)).size, g.sheets.length, 'unique');
  assert.strictEqual(M.allNumberIssues(st).length, 0);
  const x = M.addSheet(st, g.id, { title: 'Extra drainage sheet', discipline: 'Drainage' });
  assert.strictEqual(M.autoNumber(st), 1);
  assert.ok(Number(x.number) >= 70 && Number(x.number) <= 99);
  M.addRange(st, 'Culvert Layout', 60, 64);
  assert.ok(M.rangeOverlaps(st).some((s) => /Culvert Layout/.test(s)));
  const m = M.migrate(Object.assign(JSON.parse(JSON.stringify(st)), { settings: Object.assign({}, st.settings, { numbering: undefined }) }));
  assert.strictEqual(m.settings.numbering.length, M.DEFAULT_NUMBERING.length, 'older data gets default ranges');
});

t('v2.7 this-week buckets: overdue, due 7, blocked, update, ready + filters', () => {
  const st = M.newState('W'); const A = st.subs[0], B = st.subs[1];
  const g = M.addSegment(st, A.id, { road: 'FM 1', start: '0+00', end: '5+00' }).seg;
  const g2 = M.addSegment(st, B.id, { road: 'FM 2', start: '0+00', end: '5+00' }).seg;
  const T = '2026-10-28';
  const a = M.addSheet(st, g.id, { title: 'Late', due: '2026-10-20', owner: 'Ana' });
  const b = M.addSheet(st, g.id, { title: 'Soon', due: '2026-11-02' });
  const c = M.addSheet(st, g.id, { title: 'Later', due: '2026-11-30' });
  const d = M.addSheet(st, g2.id, { title: 'SWP3 Summary & Notes', discipline: 'SWP3', due: '2026-11-04' });
  const e = M.addSheet(st, g.id, { title: 'Done late', due: '2026-10-01', status: 'Done' });
  M.addLink(st, { t: 'sheet', id: c.id }, { t: 'sheet', id: b.id }, 'dep');
  let w = M.weekView(st, {}, T);
  assert.deepStrictEqual(w.overdue.map((r) => r.sh.title), ['Late']);
  assert.deepStrictEqual(w.due7.map((r) => r.sh.title), ['Soon', 'SWP3 Summary & Notes']);
  assert.deepStrictEqual(w.blocked.map((r) => r.sh.title), ['Soon']);
  assert.ok(w.ready.some((r) => r.sh.title === 'SWP3 Summary & Notes') && !w.ready.some((r) => r.sh.title === 'Soon'));
  assert.ok(!Object.values(w).flat().some((r) => r.sh === e));
  assert.deepStrictEqual(M.weekView(st, { discipline: 'SWP3' }, T).due7.map((r) => r.sh.title), ['SWP3 Summary & Notes']);
  assert.strictEqual(M.weekView(st, { sub: B.id }, T).overdue.length, 0);
  assert.strictEqual(M.weekView(st, { owner: 'Ana' }, T).overdue.length, 1);
  M.markRevised(st, { t: 'sheet', id: c.id }, 'x');
  M.addLink(st, { t: 'sheet', id: c.id }, { t: 'sheet', id: a.id }, 'upd');
  M.markRevised(st, { t: 'sheet', id: c.id }, 'y');
  assert.ok(M.weekView(st, {}, T).update.some((r) => r.sh === a));
});

t('v2.8 board: filters by sub/discipline/owner and status moves', () => {
  const st = M.newState('K'); const g = M.addSegment(st, st.subs[0].id, { road: 'FM 1', start: '0+00', end: '5+00' }).seg;
  const a = M.addSheet(st, g.id, { title: 'Culvert Layout', owner: 'Ana' }); M.addSheet(st, g.id, { title: 'SWP3 Standard Details', discipline: 'SWP3' });
  const col = (f, s) => M.filterRows(M.allSheets(st), f).filter((r) => r.sh.status === s).length;
  assert.strictEqual(col({}, 'Not started'), 2);
  assert.strictEqual(col({ discipline: 'SWP3' }, 'Not started'), 1);
  assert.strictEqual(col({ owner: 'Ana', sub: st.subs[0].id }, 'Not started'), 1);
  M.updateSheet(st, a.id, { status: 'In review' });
  assert.strictEqual(col({}, 'In review'), 1);
  assert.throws(() => M.updateSheet(st, a.id, { status: 'Bogus' }));
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

t('v2.10 status report data: progress, A–D by discipline, PP, overdue/blocked, milestones', () => {
  const st = M.newState('R'); const g = M.addSegment(st, st.subs[0].id, { road: 'FM 1', start: '0+00', end: '20+00' }).seg;
  M.applyGenerate(st, g.id, M.planGenerate(st, g.id));
  const a = M.addSheet(st, g.id, { title: 'Late', due: '2026-10-01' }), b = M.addSheet(st, g.id, { title: 'Wait' });
  M.addLink(st, { t: 'sheet', id: a.id }, { t: 'sheet', id: b.id }, 'dep');
  const m = M.addMilestone(st, '60% PS&E', '2026-10-15'); M.updateSheet(st, a.id, { milestone: m.id });
  const R = M.report(st, '2026-10-28');
  assert.strictEqual(R.subs.length, 4); assert.deepStrictEqual(R.subs[0].discs.map((d) => d.disc), ['Drainage', 'SWP3']);
  assert.ok(R.pp.total > 0 && R.subs[0].pp === R.pp.total);
  assert.deepStrictEqual(R.overdue.map((r) => r.sh.title), ['Late']);
  assert.deepStrictEqual(R.blocked.map((r) => r.sh.title), ['Wait']);
  assert.ok(R.milestones[0].late);
  assert.strictEqual(Object.values(R.counts).reduce((x, y) => x + y, 0), R.overall.total);
});

t('v2.11 collapse maps: show to level and focus branch', () => {
  const st = M.newState('C'); const A = st.subs[0], B = st.subs[1];
  const g = M.addSegment(st, A.id, { road: 'FM 1', start: '0+00', end: '5+00' }).seg; const g2 = M.addSegment(st, B.id, { road: 'FM 2', start: '0+00', end: '5+00' }).seg;
  assert.strictEqual(M.collapseLevel(st, 0).root, true);
  const L1 = M.collapseLevel(st, 1); assert.ok(!L1.root && L1['sub:' + A.id]);
  const L3 = M.collapseLevel(st, 3); assert.ok(!L3['sub:' + A.id] && !L3['disc:' + A.id + ':SWP3'] && L3['seg:' + g.id]);
  assert.ok(Object.values(M.collapseLevel(st, 4)).every((v) => v === false));
  const F = M.focusBranch(st, { sub: A.id, disc: 'Drainage', seg: g.id });
  assert.ok(!F['sub:' + A.id] && !F['disc:' + A.id + ':Drainage'] && !F['seg:' + g.id + '@Drainage']);
  assert.ok(F['sub:' + B.id] && F['disc:' + A.id + ':SWP3'] && F['seg:' + g2.id]);
  assert.strictEqual(M.TREE_LEVELS.length, 5);
});

t('v2.12 stations: preview, regenerate keeping edits, shift, reverse, overlap, table rows + TSV', () => {
  const st = M.newState('S'); const A = st.subs[0], B = st.subs[1];
  const g = M.addSegment(st, A.id, { road: 'FM 1960', start: '10+00', end: '34+00' }).seg;
  M.applyGenerate(st, g.id, M.planGenerate(st, g.id));
  const dr = () => g.sheets.filter((x) => x.gen && x.discipline === 'Drainage');
  assert.strictEqual(dr().length, 2);
  const pv = M.previewStations(st, g.id, { end: '1000+00'.replace('1000', '58') });
  assert.strictEqual(pv.length, 4800); assert.strictEqual(pv.pp.Drainage, 4); assert.strictEqual(pv.plan.create.length, 4);
  assert.strictEqual(dr().length, 2, 'preview does not change data');
  assert.ok(M.previewStations(st, g.id, { end: '5+00' }).errs.length);
  dr()[1].owner = 'Ana'; /* user-edited */
  const r = M.setStations(st, g.id, { end: '20+00' });
  assert.strictEqual(g.end, 2000); assert.ok(r.gen); assert.ok(dr().some((x) => x.owner === 'Ana'), 'edited PP sheet kept');
  M.shiftStations(st, g.id, 500);
  assert.strictEqual(g.start, 1500); assert.strictEqual(g.end, 2500);
  assert.throws(() => M.shiftStations(st, g.id, -5000), /negative/);
  M.setStations(st, g.id, { end: '40+00' }); M.setStations(st, g.id, { reverse: true });
  const pp = dr().filter((x) => x.gen.idx === 1)[0]; assert.ok(pp.gen.start > 1500, 'reverse: PP 1 at the high end');
  const w = M.addSegment(st, B.id, { road: 'fm 1960', start: '30+00', end: '45+00' });
  assert.ok(w.warns.some((x) => /Overlaps/.test(x)), 'overlap warning across sub-projects on the same road');
  const rows = M.parseTSV('SH 6\t0+00\t1200\t40\r\nSH 6\t12+00\t20+00\t\n');
  assert.deepStrictEqual(rows[0], ['SH 6', '0+00', '1200', '40']);
  const o = M.applyStationRows(st, [{ subId: A.id, road: rows[0][0], start: rows[0][1], end: rows[0][2], scale: rows[0][3] }, { segId: g.id, start: '15+00', end: '41+00' }]);
  assert.strictEqual(o.added, 1); assert.strictEqual(o.updated, 1); assert.strictEqual(g.end, 4100);
  assert.throws(() => M.applyStationRows(st, [{ segId: g.id, start: 'x' }]), /Row 1/);
});

t('v2.13 split at a station and merge touching segments', () => {
  const st = M.newState('X'); const A = st.subs[0];
  const g = M.addSegment(st, A.id, { road: 'FM 1960', start: '10+00', end: '34+00' }).seg;
  M.applyGenerate(st, g.id, M.planGenerate(st, g.id));
  const other = M.addSheet(st, g.id, { title: 'Culvert Layout' });
  const drn = (x) => x.sheets.filter((q) => q.gen && q.discipline === 'Drainage');
  assert.throws(() => M.splitSegment(st, g.id, '40+00'), /between/);
  const r = M.splitSegment(st, g.id, '22+00', { copy: true });
  assert.strictEqual(r.a.end, 2200); assert.strictEqual(r.b.start, 2200); assert.strictEqual(r.b.end, 3400);
  assert.strictEqual(drn(r.a).length, 1); assert.strictEqual(drn(r.b).length, 1);
  assert.ok(r.a.sheets.includes(other) && r.b.sheets.some((q) => q.title === 'Culvert Layout' && q.id !== other.id), 'other sheets stay, copy on request');
  assert.deepStrictEqual(M.touching(st, r.a.id).map((x) => x.id), [r.b.id]);
  M.addLink(st, { t: 'seg', id: r.b.id }, { t: 'sheet', id: other.id }, 'upd');
  const m = M.mergeSegments(st, r.b.id, r.a.id);
  assert.strictEqual(m.start, 1000); assert.strictEqual(m.end, 3400); assert.strictEqual(A.segments.length, 1);
  assert.strictEqual(drn(m).length, 2); assert.deepStrictEqual(drn(m).map((q) => q.gen.idx).sort(), [1, 2]);
  assert.strictEqual(st.links[0].src.id, m.id, 'links re-pointed');
  const far = M.addSegment(st, A.id, { road: 'FM 1960', start: '50+00', end: '60+00' }).seg;
  assert.throws(() => M.mergeSegments(st, m.id, far.id), /touch/);
});

t('v2.14 copy segment to another sub-project, with or without sheets', () => {
  const st = M.newState('Y'); const A = st.subs[0], C = st.subs[2];
  const g = M.addSegment(st, A.id, { road: 'SH 6', start: '0+00', end: '12+00', scale: 40 }).seg;
  M.applyGenerate(st, g.id, M.planGenerate(st, g.id)); const s0 = M.addSheet(st, g.id, { title: 'Culvert Layout', status: 'Done', owner: 'Ana' });
  const r1 = M.copySegment(st, g.id, C.id);
  assert.strictEqual(r1.seg.sheets.length, 0); assert.strictEqual(r1.seg.scale, 40); assert.ok(r1.warns.some((w) => /Overlaps/.test(w)));
  const r2 = M.copySegment(st, g.id, st.subs[3].id, { sheets: true });
  assert.strictEqual(r2.seg.sheets.length, g.sheets.length);
  const c = r2.seg.sheets.find((q) => q.title === 'Culvert Layout'); assert.ok(c.id !== s0.id && c.status === 'Not started' && c.owner === 'Ana');
  assert.strictEqual(M.planGenerate(st, r2.seg.id).create.length, 0, 'copied PP sheets stay recognised as generated');
  const d = M.duplicateSheet(st, s0.id); assert.ok(d.id !== s0.id && /copy/.test(d.title));
});

t('v2.15 command palette search ranking', () => {
  const items = [{ label: 'Open Settings', kind: 'action' }, { label: 'FM 1960 Sta 10+00–25+50', hint: 'A · road' }, { label: 'Culvert Layout', hint: 'A · FM 1960' }, { label: 'Print report', kw: 'pdf' }];
  assert.deepStrictEqual(M.paletteSearch(items, 'fm 1960').map((x) => x.label), ['FM 1960 Sta 10+00–25+50', 'Culvert Layout']);
  assert.strictEqual(M.paletteSearch(items, 'pdf')[0].label, 'Print report');
  assert.strictEqual(M.paletteSearch(items, 'zzz').length, 0);
  assert.strictEqual(M.paletteSearch(items, '').length, 4);
  assert.strictEqual(M.paletteSearch(items, 'sta 10+00')[0].label, 'FM 1960 Sta 10+00–25+50');
});

t('v2.16 bulk status/owner/due/discipline and bulk delete', () => {
  const st = M.newState('B'); const g = M.addSegment(st, st.subs[0].id, { road: 'R', start: '0+00', end: '5+00' }).seg;
  const a = M.addSheet(st, g.id, { title: 'A1' }), b = M.addSheet(st, g.id, { title: 'B1' }), c = M.addSheet(st, g.id, { title: 'C1' });
  assert.strictEqual(M.bulkUpdate(st, [a.id, b.id], { status: 'In review', owner: 'Ana', due: '2026-11-01', discipline: 'SWP3' }), 2);
  assert.ok([a, b].every((x) => x.status === 'In review' && x.owner === 'Ana' && x.due === '2026-11-01' && x.discipline === 'SWP3') && c.status === 'Not started');
  assert.match(st.log[0].msg, /Bulk edit 2 sheets/);
  assert.throws(() => M.bulkUpdate(st, [a.id, c.id], { status: 'Nope' })); assert.strictEqual(st.subs[0].segments[0].sheets.find((x) => x.id === c.id).status, 'Not started');
  assert.throws(() => M.bulkUpdate(st, [a.id], {}), /Nothing/);
  assert.strictEqual(M.bulkDelete(st, [a.id, c.id, 'zz']), 2); assert.strictEqual(st.subs[0].segments[0].sheets.length, 1);
});

t('v2.17 recently changed from the activity log', () => {
  const st = M.newState('R'); const g = M.addSegment(st, st.subs[0].id, { road: 'R', start: '0+00', end: '5+00' }).seg;
  const a = M.addSheet(st, g.id, { title: 'A1' }), b = M.addSheet(st, g.id, { title: 'B1' });
  M.updateSheet(st, a.id, { status: 'In progress' });
  const rc = M.recentChanges(st, 5);
  assert.deepStrictEqual(rc.map((x) => x.ref.id), [a.id, b.id, g.id]);
  assert.match(rc[0].msg, /status → In progress/);
  M.deleteSheet(st, b.id);
  assert.ok(!M.recentChanges(st).some((x) => x.ref.id === b.id), 'deleted items drop out');
});

t('v2.19 report narrative: project + sub-project + discipline text, notes kept separately', () => {
  const e = M.newState('Empty Job');
  assert.match(M.narrative(e).project, /no roads or sheets yet/);
  assert.match(M.narrative(e).subs[0].text, /has no roads yet/);
  const st = M.newState('Job'); const A = st.subs[0];
  const g = M.addSegment(st, A.id, { road: 'FM 1960', start: '10+00', end: '34+00' }).seg;
  M.applyGenerate(st, g.id, M.planGenerate(st, g.id));
  const a = M.addSheet(st, g.id, { title: 'Culvert Layout', due: '2026-10-20', owner: 'Ana' }), b = M.addSheet(st, g.id, { title: 'Inlet / Manhole Schedule', due: '2026-11-01' });
  M.addLink(st, { t: 'sheet', id: a.id }, { t: 'sheet', id: b.id }, 'dep');
  M.updateSheet(st, g.sheets[0].id, { status: 'Done' });
  const ms = M.addMilestone(st, '60% PS&E', '2026-11-15');
  const N = M.narrative(st, '2026-10-28');
  assert.match(N.project, /^Job is \d+% complete/); assert.match(N.project, /4 plan & profile sheets \(2 Drainage, 2 SWP3\)/);
  assert.match(N.project, /next milestone is 60% PS&E on 2026-11-15/); assert.match(N.project, /Biggest risks: 1 overdue sheet, 1 blocked sheet/);
  assert.match(N.subs[0].text, /FM 1960 from Sta 10\+00 to 34\+00 \(2,400 ft at 1"=100'\)/);
  const dr = N.subs[0].discs[0].text;
  assert.match(dr, /^Drainage: /); assert.match(dr, /Overdue: Culvert Layout \(due 2026-10-20\)/); assert.match(dr, /Blocked: Inlet \/ Manhole Schedule waiting on/); assert.match(dr, /Next 7 days: Inlet/); assert.match(dr, /Most open sheets: unassigned/);
  assert.strictEqual(N.subs[1].discs[0].text, '');
  M.setReportNote(st, 'sub:' + A.id, 'Waiting on survey for the outfall.'); M.setReportNote(st, 'project', 'Client review Nov 20.');
  const N2 = M.narrative(st, '2026-10-28'); assert.strictEqual(N2.subs[0].note, 'Waiting on survey for the outfall.'); assert.strictEqual(N2.subs[0].text, N.subs[0].text, 'generated text unaffected by notes');
  const T = M.narrativeText(st, '2026-10-28'); assert.match(T, /Notes: Client review Nov 20\./); assert.match(T, /Sub-project A · /);
  assert.deepStrictEqual(M.narrative(st, '2026-10-28'), M.narrative(st, '2026-10-28'), 'deterministic');
  assert.throws(() => M.setReportNote(st, 'bogus', 'x')); M.setReportNote(st, 'project', ''); assert.ok(!('project' in st.reportNotes));
  assert.deepStrictEqual(M.migrate(JSON.parse(JSON.stringify(Object.assign({}, st, { reportNotes: undefined })))).reportNotes, {});
  void ms;
});

t('v2.20 CSV: parser (quotes/BOM/CRLF/semicolon/TSV), mapping, dates, validation, merge vs new, round trip', () => {
  const P = M.parseCSV('\uFEFFRoad;Start;End\r\n"FM ""1960"" ; main";10+00;"2,400"\r\n');
  assert.strictEqual(P.delim, ';'); assert.deepStrictEqual(P.rows[1], ['FM "1960" ; main', '10+00', '2,400']);
  assert.deepStrictEqual(M.parseCSV('a\tb\n1\t2').rows, [['a', 'b'], ['1', '2']]);
  assert.deepStrictEqual(M.parseCSV('a,b\n"x\ny",2\n').rows[1], ['x\ny', '2'], 'newline inside quotes');
  const map = M.detectMapping(['Sub Project', 'ROAD NAME', 'Begin Station', 'End_Station', 'Scale', 'Discipline', 'Sheet Title', 'Sheet No', 'Status', 'Assigned To', 'Due Date', 'Comments', 'Depends On']);
  assert.deepStrictEqual(map, { sub: 0, road: 1, start: 2, end: 3, scale: 4, discipline: 5, title: 6, number: 7, status: 8, owner: 9, due: 10, notes: 11, depends: 12 });
  for (const [x, y] of [['2026-11-05', '2026-11-05'], ['11/5/2026', '2026-11-05'], ['11/5/26', '2026-11-05'], ['5-Nov-2026', '2026-11-05'], ['Nov 5, 2026', '2026-11-05'], ['46331', '2026-11-05'], ['', '']]) assert.strictEqual(M.parseDate(x), y, x);
  assert.strictEqual(M.parseDate('2/30/2026'), null);
  const st = M.newState('C'); const A = st.subs[0];
  const ex = M.addSegment(st, A.id, { road: 'FM 1960', start: '10+00', end: '34+00' }).seg; M.addSheet(st, ex.id, { title: 'Culvert Layout', number: '72' });
  const rows = M.parseCSV(M.csvTemplate()).rows; const m2 = M.detectMapping(rows[0]);
  rows.push(['E', 'X', '1+00', '2+00', '', '', '', '', '', '', '', '', '', '', '']);
  rows.push(['A', 'SH 6', '5+00', '1+00', '', 'Both', '', '', '', '', 'Bogus', '', '13/45/2026', '', '']);
  let plan = M.planCSV(st, rows.slice(1), m2, { mode: 'merge', defaults: true });
  assert.strictEqual(plan.summary.errors, 2);
  assert.match(plan.items[4].errors.join(' '), /Unknown sub-project/); assert.match(plan.items[5].errors.join(' '), /End station must be after start/); assert.match(plan.items[5].errors.join(' '), /Unknown status/);
  assert.ok(plan.items[1].skip && /not overwritten/.test(plan.items[1].warns.join(' ')), 'existing sheet not overwritten');
  assert.ok(plan.items[1].warns.some((w) => /Duplicate sheet number 72/.test(w)));
  assert.strictEqual(plan.summary.mergedRoads, 1); assert.strictEqual(plan.summary.newRoads, 1);
  assert.throws(() => M.applyCSV(st, plan), /have errors/);
  const before = JSON.stringify(st);
  const made = M.applyCSV(st, plan, { skipBad: true });
  assert.strictEqual(A.segments.length, 1, 'merged into existing FM 1960'); assert.ok(made.links === 1 && made.pp > 0);
  assert.ok(ex.sheets.filter((q) => q.title === 'Culvert Layout').length === 1);
  const kk = st.subs[1].segments[0]; assert.strictEqual(kk.start, 1000); assert.strictEqual(kk.scale, 40); assert.strictEqual(kk.sheets[0].due, '2026-12-05');
  assert.strictEqual(M.planCSV(st, rows.slice(1, 2), m2, { mode: 'new' }).summary.newRoads, 1, 'add-as-new creates a new road');
  assert.ok(M.planCSV(st, rows.slice(1, 2), m2, { mode: 'new' }).items[0].warns.some((w) => /Overlaps/.test(w)));
  /* round trip */
  M.updateSheet(st, ex.sheets.find((q) => q.gen).id, { status: 'In review', owner: 'Bo' });
  const out = M.exportImportCSV(st);
  const st2 = M.newState('C2'); const R2 = M.parseCSV(out).rows;
  M.applyCSV(st2, M.planCSV(st2, R2.slice(1), M.detectMapping(R2[0]), { mode: 'merge' }));
  const norm = (t) => t.replace(/^\uFEFF/, '');
  assert.strictEqual(norm(M.exportImportCSV(st2)), norm(out), 'export → import → export is identical');
  assert.ok(before !== JSON.stringify(st));
});

(async () => {
  let passed = 0;
  for (const [name, fn] of tests) {
    try { await fn(); passed++; } catch (e) { console.error('FAIL', name, e); process.exit(1); }
  }
  console.log('ok', passed, 'tests');
})();
