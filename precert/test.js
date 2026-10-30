// Unit tests for the TxDOT Precertification helper model. Run: node precert/test.js
const assert = require('assert');
const M = require('./model.js'), C = require('./categories.json'), ix = M.catIndex(C);
const tests = []; const t = (n, f) => tests.push([n, f]);

t('categories data: source, verified date, groups 1-24, drainage categories', () => {
  assert.ok(/txdot\.gov/.test(C.source) && /^\d{4}-\d{2}-\d{2}$/.test(C.verified));
  assert.strictEqual(C.groups.length, 24); assert.ok(C.categories.length > 150);
  for (const k of ['10.1.1', '10.2.1', '10.3.1', '10.8.1', '4.2.1', '3.7.1', '4.7.1']) assert.ok(ix[k], k);
  assert.strictEqual(ix['10.2.1'].name, 'Roadway Hydraulic Design');
  assert.ok(C.categories.every((c) => /^\d+\.\d+\.\d+$/.test(c.code) && c.name && c.requirements.length));
  assert.deepStrictEqual(M.TRAINING_UPLOAD, C.trainingUpload);
  assert.ok(M.isHydro(ix['10.2.1']) && !M.isHydro(ix['1.1.1']));
});
t('requirements: minimum years, checklist, template has blanks only', () => {
  assert.strictEqual(M.minYears(ix['10.1.1']), 5); assert.strictEqual(M.minYears(ix['4.2.1']), 3);
  const L = M.checklist(ix['10.2.1']); assert.strictEqual(L.filter((x) => x.kind === 'req').length, 1); assert.ok(L.some((x) => x.kind === 'scope' && /detention/.test(x.text)));
  assert.ok(!M.checklist(ix['2.4.2']).some((x) => /must employ one person that has:$/.test(x.text)), 'lead-in lines are not checklist items');
  const T = M.template(ix['10.2.1']); assert.ok(M.blanksLeft(T) > 3 && /I ____/.test(T));
  assert.ok(M.firstPerson('I computed the runoff using the Rational Method') && !M.firstPerson('Runoff was computed'));
  assert.strictEqual(M.words(' a b  c '), 3);
});
t('SSN guard', () => { assert.ok(M.looksLikeSSN('123-45-6789') && M.looksLikeSSN('123456789')); assert.ok(!M.looksLikeSSN('E-1042') && !M.looksLikeSSN('')); });
t('coverage, overlap-aware years and gaps', () => {
  const st = M.newState();
  const a = M.addProject(st, { name: 'SH 249', begin: '2018-01-01', end: '2021-01-01' }), b = M.addProject(st, { name: 'FM 1960', begin: '2020-01-01', end: '2023-01-01' });
  const ea = M.addEntry(st, a.id, '10.2.1', C), eb = M.addEntry(st, b.id, '10.2.1', C);
  assert.deepStrictEqual(st.targets, ['10.2.1']); assert.throws(() => M.addEntry(st, a.id, '99.9.9', C));
  assert.ok(Math.abs(M.years(st, '10.2.1') - 5) < 0.1, 'overlap counted once: ' + M.years(st, '10.2.1'));
  let cv = M.coverage(st, ix['10.2.1']); assert.strictEqual(cv.pct, 0); assert.ok(!cv.ready && cv.gaps.some((g) => /Requirement not addressed/.test(g)) && cv.gaps.some((g) => /P\.E\./.test(g)));
  ea.text = 'I designed the storm drain system and I computed the runoff using the Rational Method considering the 10-yr storm.'; eb.text = 'I analyzed the culverts with HY-8.';
  M.toggleCover(st, a.id, ea.id, 'r0', true); st.profile.peNumber = '123456';
  cv = M.coverage(st, ix['10.2.1']); assert.strictEqual(cv.pct, 100); assert.strictEqual(cv.rows[0].by.length, 1); assert.ok(cv.ready, cv.gaps.join('; '));
  M.toggleCover(st, a.id, ea.id, 'r0', false); assert.strictEqual(M.coverage(st, ix['10.2.1']).reqDone, 0);
  eb.text = 'I ____ the culverts'; M.toggleCover(st, a.id, ea.id, 'r0', true); assert.ok(M.coverage(st, ix['10.2.1']).gaps.some((g) => /blank/.test(g)));
  const f = M.coverage(st, ix['10.8.1']); assert.ok(f.gaps.some((g) => /CFM/.test(g)));
  const tr = M.coverage(st, ix['4.7.1']); assert.ok(tr.gaps.some((g) => /Training certificate/.test(g)));
  st.profile.last = 'Bonilla'; st.profile.first = 'Luis'; assert.strictEqual(M.certFileName(st, { category: '4.7.1', completion: '2024-01-10' }), 'Bonilla.Luis.4.7.1.2024-01-10.PDF');
});
t('CCIS checklist progress', () => { const st = M.newState(); assert.strictEqual(M.ccisProgress(st).done, 0); st.ccis.access = true; st.ccis.submit = true; assert.deepStrictEqual(M.ccisProgress(st), { done: 2, total: M.CCIS_STEPS.length }); assert.ok(M.CCIS_STEPS.some((s) => /January 1 and March 31/.test(s.text)) && M.CCIS_STEPS.some((s) => /60 days/.test(s.text))); });
t('export text and JSON backup / restore', () => {
  const st = M.newState(); st.profile.first = 'Luis'; st.profile.last = 'Bonilla';
  const p = M.addProject(st, { name: 'SH 249', begin: '2019-03-01', end: '2021-06-30', location: 'Houston', desc: 'Widening', fees: '1250000', cost: '45,000,000' });
  const e = M.addEntry(st, p.id, '10.2.1', C); e.text = 'I designed the storm sewer.'; st.ccis.access = true;
  const tx = M.projectText(st, p, C); assert.ok(/Estimated project fees: \$1,250,000/.test(tx) && /Work group: 10 {3}Work category: 10\.2\.1 Roadway Hydraulic Design/.test(tx) && /Work category description: I designed/.test(tx));
  assert.ok(/WORK CATEGORIES/.test(M.summaryText(st, C)) && /Luis Bonilla/.test(M.summaryText(st, C)));
  const back = M.importJSON(M.exportJSON(st)); assert.deepStrictEqual(back.projects, st.projects); assert.deepStrictEqual(back.profile, st.profile); assert.ok(back.ccis.access);
  const raw = M.importJSON(JSON.stringify({ profile: { first: 'X', formerTxdot: 1, evil: 'y' }, targets: ['10.2.1', '10.2.1', 'bad'], projects: [{ name: 'P', cats: [{ code: '10.1.1', covers: ['r0'] }] }] }));
  assert.strictEqual(raw.profile.formerTxdot, true); assert.ok(!('evil' in raw.profile)); assert.deepStrictEqual(raw.targets, ['10.2.1']); assert.ok(raw.projects[0].id && raw.projects[0].cats[0].id);
  assert.throws(() => M.importJSON('null')); assert.throws(() => M.importJSON('{bad'));
});
t('v1.1 example: fictional, flagged, gap visible, exports watermarked', () => {
  const ex = M.exampleState();
  assert.ok(M.isExampleState(ex) && !M.hasRealData(ex), 'example is not real data');
  assert.ok(ex.profile.isExample && /EXAMPLE/.test(ex.profile.peNumber) && ex.projects.every((p) => p.isExample && /^EXAMPLE/.test(p.name) && p.cats.every((e) => e.isExample && /^SAMPLE TEXT/.test(e.text) && M.firstPerson(e.text))));
  assert.deepStrictEqual(ex.targets.slice(0, 3), ['10.1.1', '10.2.1', '4.2.1']);
  const R = M.readiness(ex, C); assert.ok(R.some((r) => r.ready) && R.some((r) => !r.ready && r.gaps.length), 'both satisfied and gap');
  assert.ok(M.ccisProgress(ex).done > 0 && M.ccisProgress(ex).done < M.CCIS_STEPS.length);
  assert.ok(M.summaryText(ex, C).startsWith(M.EXAMPLE_HEAD)); assert.ok(M.projectText(ex, ex.projects[0], C).startsWith(M.EXAMPLE_HEAD));
  assert.strictEqual(M.summaryText(ex, C).split(M.EXAMPLE_HEAD).length, 2, 'one header line in the summary');
  assert.ok(JSON.parse(M.exportJSON(ex)).example); assert.ok(!JSON.parse(M.exportJSON(M.newState())).example);
  const back = M.importJSON(M.exportJSON(ex)); assert.ok(M.isExampleState(back) && back.projects[1].cats[0].isExample);
});
t('v1.1 example: clear keeps real records, no data loss', () => {
  const real = M.newState(); real.profile.first = 'Real'; const rp = M.addProject(real, { name: 'Mine' }); M.addEntry(real, rp.id, '10.2.1', C);
  assert.ok(M.hasRealData(real) && !M.isExampleState(real) && M.hasRealData(M.newState()) === false);
  const ex = M.exampleState();
  const mine = M.addProject(ex, { name: 'Added during example' }); M.addEntry(ex, mine.id, '10.1.1', C);
  M.addEntry(ex, 'ex-p1', '10.3.1', C); /* a real write-up on an example project */
  assert.ok(M.hasRealData(ex));
  const cl = M.clearExample(ex);
  assert.ok(!M.isExampleState(cl) && !cl.profile.isExample && cl.profile.first === '');
  assert.deepStrictEqual(cl.projects.map((p) => p.name).sort(), ['Added during example', 'EXAMPLE: FM 0000 widening (fictional)'].sort());
  assert.ok(cl.projects.every((p) => p.cats.every((e) => !e.isExample)) && cl.degrees.length === 0 && cl.certs.length === 0);
  assert.deepStrictEqual(cl.targets.sort(), ['10.1.1', '10.3.1']); assert.deepStrictEqual(cl.ccis, {});
  assert.ok(ex.projects.length === 4, 'clearExample does not mutate its input');
  const fresh = M.clearExample(M.exampleState()); assert.ok(!fresh.projects.length && !M.hasRealData(fresh));
  assert.strictEqual(M.PRE_EXAMPLE_KEY, 'precert.data.v1.pre-example');
});

(async () => { let n = 0; for (const [name, f] of tests) { try { await f(); n++; } catch (e) { console.error('FAIL', name, e); process.exit(1); } } console.log('ok', n, 'tests'); })();
