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

(async () => {
  let passed = 0;
  for (const [name, fn] of tests) {
    try { await fn(); passed++; } catch (e) { console.error('FAIL', name, e); process.exit(1); }
  }
  console.log('ok', passed, 'tests');
})();
