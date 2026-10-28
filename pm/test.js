const assert = require('assert');
const C = require('./crypto.js');
const M = require('./model.js');
let passed = 0;
const tests = [];
function t(name, fn) { tests.push([name, fn]); }

// ---- stations ----
t('parse/format stations', () => {
  assert.strictEqual(M.parseStation('10+00'), 1000);
  assert.strictEqual(M.parseStation(' 25+50 '), 2550);
  assert.strictEqual(M.parseStation('0+05.5'), 5.5);
  assert.strictEqual(M.parseStation('125+99.25'), 12599.25);
  for (const bad of ['', '10', '10+5', '10+100', 'a+00', '-1+00', '10+00+00']) assert(Number.isNaN(M.parseStation(bad)), bad);
  assert.strictEqual(M.formatStation(1000), '10+00');
  assert.strictEqual(M.formatStation(2550), '25+50');
  assert.strictEqual(M.formatStation(5.5), '0+05.5');
  assert.strictEqual(M.formatStation(12599.25), '125+99.25');
  assert.strictEqual(M.formatStation(1099.999), '11+00');
  for (const s of ['10+00', '0+05.5', '125+99.25', '3+07']) assert.strictEqual(M.formatStation(M.parseStation(s)), s);
});
t('segment validation and overlap', () => {
  const st = M.newState();
  const A = st.subs[0];
  const { seg } = M.addSegment(st, A.id, { name: 'Seg 1', road: 'FM 1960', start: '10+00', end: '25+50' });
  assert.strictEqual(seg.start, 1000);
  assert.throws(() => M.addSegment(st, A.id, { name: 'Bad', start: '30+00', end: '20+00' }), /after start/);
  assert.throws(() => M.addSegment(st, A.id, { name: 'Bad', start: '30', end: '40+00' }), /10\+00/);
  assert.throws(() => M.addSegment(st, A.id, { name: '', start: '1+00', end: '2+00' }), /Name/);
  const r = M.addSegment(st, A.id, { name: 'Seg 2', road: 'fm 1960', start: '20+00', end: '30+00' });
  assert.strictEqual(r.warns.length, 1);
  assert.match(r.warns[0], /Overlaps Seg 1/);
  assert.strictEqual(M.addSegment(st, A.id, { name: 'Touch', road: 'FM 1960', start: '30+00', end: '31+00' }).warns.length, 0);
  assert.strictEqual(M.addSegment(st, A.id, { name: 'Other road', road: 'SH 249', start: '10+00', end: '20+00' }).warns.length, 0);
  assert.deepStrictEqual(A.segments.map((s) => s.start), [1000, 1000, 2000, 3000]);
  const u = M.updateSegment(st, r.seg.id, { start: '25+50' });
  assert.strictEqual(u.warns.length, 0);
  assert.throws(() => M.updateSegment(st, r.seg.id, { end: '1+00' }));
});

// ---- model ops ----
t('sheets: add/update/duplicate/delete, staff list', () => {
  const st = M.newState();
  const { seg } = M.addSegment(st, st.subs[1].id, { name: 'S', start: '0+00', end: '5+00' });
  const sh = M.addSheet(st, seg.id, { title: 'Culvert Layout', discipline: 'Drainage' });
  assert.strictEqual(sh.status, 'Not started');
  M.updateSheet(st, sh.id, { status: 'In review', owner: 'Ana', due: '2026-11-01', notes: 'x' });
  assert.deepStrictEqual(st.staff, ['Ana']);
  assert.throws(() => M.updateSheet(st, sh.id, { status: 'Bogus' }));
  const c = M.duplicateSheet(st, sh.id);
  assert.strictEqual(c.title, 'Culvert Layout (copy)');
  assert.strictEqual(seg.sheets[1], c);
  assert.strictEqual(c.owner, 'Ana');
  M.deleteSheet(st, sh.id);
  assert.deepStrictEqual(seg.sheets, [c]);
  M.addStaff(st, 'ana'); M.addStaff(st, 'Bo');
  assert.deepStrictEqual(st.staff, ['Ana', 'Bo']);
  M.removeStaff(st, 'Bo');
  assert.deepStrictEqual(st.staff, ['Ana']);
  assert(M.deleteSegment(st, seg.id));
  assert.strictEqual(st.subs[1].segments.length, 0);
});
t('templates + bulk add skips existing titles', () => {
  const st = M.newState();
  const sub = st.subs[2];
  assert.strictEqual(sub.templates.length, M.DEFAULT_TEMPLATES.length);
  const { seg } = M.addSegment(st, sub.id, { name: 'S', start: '1+00', end: '9+00' });
  M.addSheet(st, seg.id, { title: 'SWP3 Layout', discipline: 'SWP3' });
  const swp = M.bulkAddTemplates(st, seg.id, { discipline: 'SWP3', owner: 'Kim' });
  assert.strictEqual(swp.length, M.DEFAULT_TEMPLATES.filter((x) => x[1] === 'SWP3').length - 1);
  assert(swp.every((s) => s.owner === 'Kim' && s.discipline === 'SWP3'));
  const rest = M.bulkAddTemplates(st, seg.id);
  assert.strictEqual(seg.sheets.length, M.DEFAULT_TEMPLATES.length);
  assert.strictEqual(M.bulkAddTemplates(st, seg.id).length, 0);
  assert(rest.length > 0);
  const tpl = M.addTemplate(st, sub.id, { title: 'Ditch Cross Sections', discipline: 'Drainage' });
  const dup = M.duplicateTemplate(st, sub.id, tpl.id);
  M.updateTemplate(st, sub.id, dup.id, { title: 'Ditch Profiles', discipline: 'SWP3' });
  assert.strictEqual(sub.templates[sub.templates.length - 1].title, 'Ditch Profiles');
  M.deleteTemplate(st, sub.id, tpl.id);
  assert(!sub.templates.some((x) => x.id === tpl.id));
  assert.strictEqual(st.subs[0].templates.length, M.DEFAULT_TEMPLATES.length, 'templates are per sub-project');
  M.resetTemplates(st, sub.id);
  assert.strictEqual(sub.templates.length, M.DEFAULT_TEMPLATES.length);
});

// ---- progress ----
t('progress, summary, overdue, workload, filters', () => {
  const st = M.newState();
  const [A, B] = st.subs;
  const s1 = M.addSegment(st, A.id, { name: 'A1', road: 'IH 45', start: '10+00', end: '20+00' }).seg;
  const s2 = M.addSegment(st, B.id, { name: 'B1', start: '0+00', end: '10+00' }).seg;
  const mk = (seg, status, owner, due, d) => M.updateSheet(st, M.addSheet(st, seg.id, { title: status + owner, discipline: d || 'Drainage' }).id, { status, owner, due });
  mk(s1, 'Done', 'Ana', '2026-01-01');
  mk(s1, 'In progress', 'Ana', '2026-01-01');
  mk(s1, 'In review', 'Bo', '2026-12-01', 'SWP3');
  mk(s2, 'Not started', '', '2026-02-01');
  const p = M.progress(st.subs[0].segments[0].sheets);
  assert.deepStrictEqual(p.counts, { 'Not started': 0, 'In progress': 1, 'In review': 1, 'Done': 1 });
  assert.strictEqual(p.pct, 73.3); // (1+0.4+0.8)/3
  assert.strictEqual(p.donePct, 33.3);
  assert.deepStrictEqual(M.progress([]), { total: 0, counts: { 'Not started': 0, 'In progress': 0, 'In review': 0, 'Done': 0 }, done: 0, pct: 0, donePct: 0 });
  const S = M.summary(st, '2026-10-28');
  assert.strictEqual(S.overall.total, 4);
  assert.strictEqual(S.overall.pct, 55);
  assert.deepStrictEqual(S.subs.map((x) => x.total), [3, 1, 0, 0]);
  assert.deepStrictEqual(S.overdue.map((r) => r.sh.status), ['In progress', 'Not started']);
  const ana = S.workload.find((w) => w.owner === 'Ana');
  assert.deepStrictEqual([ana.open, ana.done, ana.overdue], [1, 1, 1]);
  assert(S.workload.some((w) => w.owner === '(unassigned)'));
  const rows = M.allSheets(st);
  assert.strictEqual(M.filterRows(rows, { discipline: 'SWP3' }).length, 1);
  assert.strictEqual(M.filterRows(rows, { owner: 'Ana', status: 'Done' }).length, 1);
  assert.strictEqual(M.filterRows(rows, { owner: '(unassigned)' }).length, 1);
  assert.strictEqual(M.filterRows(rows, { q: 'ih 45' }).length, 3);
  assert.strictEqual(M.filterRows(rows, { overdue: true }, '2026-10-28').length, 2);
  assert.strictEqual(M.filterRows(rows, { sub: B.id }).length, 1);
});
t('CSV export quoting and formula guard', () => {
  const st = M.newState();
  const s = M.addSegment(st, st.subs[0].id, { name: 'Main, north', road: 'FM "529"', start: '10+00', end: '25+50' }).seg;
  M.addSheet(st, s.id, { title: '=HYPERLINK("x")', notes: 'line1\nline2' });
  const csv = M.toCSV(M.allSheets(st));
  const lines = csv.split('\r\n');
  assert.strictEqual(lines[0], 'Sub-project,Segment,Road,Start Sta,End Sta,Sheet,Discipline,Status,Owner,Due,Notes');
  assert(lines[1].startsWith('A,"Main, north","FM ""529""",10+00,25+50,"\'=HYPERLINK(""x"")",Drainage,Not started,,,"line1\nline2"'));
});

// ---- crypto ----
const ITER = 1000; // fast for most tests; one test uses the real default
t('crypto round trip (default 600k iterations)', async () => {
  assert(C.ITER >= 600000);
  const st = M.newState('Secret Project X');
  const { env } = await C.seal('correct horse battery', st, 'vault');
  assert.strictEqual(env.iter, C.ITER);
  assert(!JSON.stringify(env).includes('Secret Project'));
  const { data } = await C.open('correct horse battery', env, 'vault');
  assert.deepStrictEqual(data, st);
});
t('wrong passphrase fails gracefully', async () => {
  const { env } = await C.seal('right passphrase', { a: 1 }, 'vault', ITER);
  await assert.rejects(C.open('wrong passphrase', env, 'vault'), (e) => e.code === 'DECRYPT' && /Wrong passphrase/.test(e.message));
});
t('tamper detection (ciphertext, iv, kind swap)', async () => {
  const { env } = await C.seal('pass phrase 123', { a: 1, b: 'hello' }, 'vault', ITER);
  const ct = C.unb64(env.ct); ct[3] ^= 1;
  await assert.rejects(C.open('pass phrase 123', { ...env, ct: C.b64(ct) }, 'vault'), /modified/);
  const iv = C.unb64(env.iv); iv[0] ^= 1;
  await assert.rejects(C.open('pass phrase 123', { ...env, iv: C.b64(iv) }, 'vault'), /modified/);
  await assert.rejects(C.open('pass phrase 123', { ...env, fmt: 'pm-backup' }, 'backup'), /modified/);
  await assert.rejects(C.open('pass phrase 123', { ...env, iter: 999 }, 'vault'), /modified/);
  await assert.rejects(C.open('pass phrase 123', { nope: 1 }, 'vault'), /Not a recognized/);
});
t('fresh IV and salt every seal; same key reseal uses new IV', async () => {
  const a = await C.seal('pass phrase 123', { a: 1 }, 'vault', ITER);
  const b = await C.seal('pass phrase 123', { a: 1 }, 'vault', ITER);
  assert.notStrictEqual(a.env.salt, b.env.salt);
  const e1 = await C.sealWithKey(a.key, a.salt, ITER, { a: 2 }, 'vault');
  const e2 = await C.sealWithKey(a.key, a.salt, ITER, { a: 2 }, 'vault');
  assert.notStrictEqual(e1.iv, e2.iv);
  assert.strictEqual(e1.salt, a.env.salt);
  assert.deepStrictEqual((await C.open('pass phrase 123', e2, 'vault')).data, { a: 2 });
});
t('passphrase guidance', () => {
  assert.strictEqual(C.passIssues('short').length, 1);
  assert.strictEqual(C.passIssues('long enough pass', 'long enough pass').length, 0);
  assert.match(C.passIssues('long enough pass', 'other').join(), /match/);
});
t('backup export/import round trip with normalize', async () => {
  const st = M.newState('Proj');
  const s = M.addSegment(st, st.subs[3].id, { name: 'D1', start: '1+00', end: '2+00' }).seg;
  M.bulkAddTemplates(st, s.id);
  st.lastBackup = '2026-10-28T10:00:00.000Z';
  const file = JSON.stringify((await C.seal('backup pass 1', st, 'backup', ITER)).env);
  const back = M.normalize((await C.open('backup pass 1', JSON.parse(file), 'backup')).data);
  assert.deepStrictEqual(back, st);
  await assert.rejects(C.open('backup pass 2', JSON.parse(file), 'backup'), /Wrong passphrase/);
  await assert.rejects(C.open('backup pass 1', JSON.parse(file), 'vault'), /Not a recognized/);
  assert.throws(() => M.normalize({ foo: 1 }), /not a PM project/);
});

(async () => {
  for (const [name, fn] of tests) {
    try { await fn(); passed++; } catch (e) { console.error('FAIL', name, e); process.exit(1); }
  }
  console.log('ok', passed, 'tests');
})();
