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

t('v1.2 form: dates, field mapping, mandatory check, migration', () => {
  assert.strictEqual(M.fmtDate('2024-01-10', false), '01/10/2024'); assert.strictEqual(M.fmtDate('2024-01-10', true), '01/10/24'); assert.strictEqual(M.fmtDate('', true), ''); assert.strictEqual(M.fmtDate('Jan 2024'), 'Jan 2024');
  const st = M.newState();
  let ck = M.formCheck(st, C); assert.ok(!ck.ok); ['Firm name*', 'Firm sequence number*', 'First name*', 'Last name*'].forEach((k) => assert.ok(ck.missing.includes(k), k)); assert.ok(!ck.missing.includes('Employment status*'), 'default Employed');
  assert.ok(ck.missing.some((m) => /Work Group\*/.test(m)));
  Object.assign(st.profile, { first: 'Luis', last: 'Bonilla', firm: 'F', firmSeq: '123', peNumber: '99999', peDate: '2015-02-03', employeeSeq: '77' });
  st.degrees.push({ id: 'd', type: 'B.S.', field: 'Civil Engineering', school: 'UH', date: '2010-05-01' });
  st.certs.push({ id: 'c', kind: 'training', type: 'HSM training', number: 'N1', agency: 'NHI', issue: '', exp: '2027-01-01', completion: '2024-01-10', category: '4.7.1', note: '', degreeType: '', trainingType: 'engineering', trainingDate: '2024-01-10', code: '' });
  const p = M.addProject(st, { name: 'SH 249', begin: '2019-03-01', end: '', fees: '1250000', cost: '' }); const e = M.addEntry(st, p.id, '10.2.1', C); e.text = 'I designed it.'; M.addEntry(st, p.id, '4.7.1', C); st.targets.push('10.1.1');
  const F = M.formData(st, C);
  assert.deepStrictEqual(F.firm, { name: 'F', seq: '123' }); assert.strictEqual(F.emp.seq, '77'); assert.strictEqual(F.emp.formerTxdot, false);
  assert.deepStrictEqual(F.precerts, [{ group: 4, cats: ['4.7.1'] }, { group: 10, cats: ['10.1.1', '10.2.1'] }]);
  assert.strictEqual(F.certs[0].certType, 'P.E.'); assert.strictEqual(F.certs[0].agency, 'TBPELS'); assert.strictEqual(F.certs[0].issue, '02/03/15');
  assert.strictEqual(F.certs[1].degreeType, 'B.S.'); assert.strictEqual(F.certs[1].trainingType, 'Civil Engineering');
  assert.deepStrictEqual([F.certs[2].category, F.certs[2].trainingDate, F.certs[2].completion, F.certs[2].exp], ['4.7.1', '01/10/2024', '01/10/24', '01/01/27']);
  assert.strictEqual(F.projects[0].begin, '03/01/2019'); assert.strictEqual(F.projects[0].fees, '$1,250,000'); assert.deepStrictEqual(F.projects[0].cats.map((c) => [c.group, c.code]), [[10, '10.2.1'], [4, '4.7.1']]);
  ck = M.formCheck(st, C); assert.ok(ck.ok, ck.missing.join()); assert.ok(ck.warnings.some((w) => /4\.7\.1 work category description is blank/.test(w)));
  const T = M.formText(st, C); assert.ok(/^Precertification Application Form/.test(T) && /Firm sequence number\*: 123/.test(T) && /Middle name \(if applicable\): \(not entered\)/.test(T) && /Work Group\*: 10 {3}Work Category\*: 10\.1\.1, 10\.2\.1/.test(T) && /Certification training date \(format: MM\/DD\/YYYY\): 01\/10\/2024/.test(T));
  assert.ok(M.formText(M.exampleState(), C).startsWith(M.EXAMPLE_HEAD));
  /* migration: v1 / v1.1 saved data without the new fields loads with blanks */
  const old = JSON.parse(JSON.stringify(st)); delete old.profile.employeeSeq; delete old.profile.peAgency; delete old.certs[0].trainingDate; delete old.certs[0].degreeType;
  const mig = M.importJSON(JSON.stringify(old)); assert.strictEqual(mig.profile.employeeSeq, ''); assert.strictEqual(mig.certs[0].trainingDate, ''); assert.strictEqual(mig.profile.first, 'Luis'); assert.deepStrictEqual(mig.projects, st.projects);
});
t('v1.2 docx: zip round trip, fill official template, valid XML, values present (PDF via soffice when available)', () => {
  const D = require('./docx.js'), fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
  const tpl = fs.readFileSync(path.join(__dirname, 'form-template.docx'));
  const files = D.unzip(tpl); assert.ok(files.length > 20); const z = D.unzip(D.zip(files)); assert.deepStrictEqual(z.map((f) => f.name), files.map((f) => f.name)); assert.ok(z.every((f, i) => Buffer.compare(Buffer.from(f.data), Buffer.from(files[i].data)) === 0));
  assert.strictEqual(D.crc32(new TextEncoder().encode('123456789')), 0xCBF43926);
  const st = M.exampleState(); st.projects[0].cats[0].text += ' <&> "quotes"';
  const out = D.buildDocx(tpl, M.formData(st, C)), doc = new TextDecoder().decode(D.unzip(out).find((f) => f.name === 'word/document.xml').data);
  const xmlOk = (x) => { const st2 = []; const re = /<(\/?)([\w:]+)[^>]*?(\/?)>/g; let m; while ((m = re.exec(x))) { if (m[0].startsWith('<?')) continue; if (m[3]) continue; if (m[1]) { if (st2.pop() !== m[2]) return false; } else st2.push(m[2]); } return !st2.length; };
  assert.ok(xmlOk(doc.slice(doc.indexOf('<w:document'))), 'document.xml well-formed (tag balance)');
  ['Example Engineering Co. (fictional)', 'Alex', 'EX-0001', 'EXAMPLE-000000', 'TBPELS', '02/01/2015', '$38,000,000', '10.2.1', 'Certification 5', 'Project 3', M.EXAMPLE_HEAD, '&lt;&amp;&gt;'].forEach((v) => assert.ok(doc.includes(v.replace(/&(?!amp;|lt;|gt;)/g, '&amp;')), 'value in docx: ' + v));
  assert.ok(!doc.includes('Certification 6') && !doc.includes('Project 4'), 'blocks trimmed to the actual count');
  let so = null; try { so = cp.execSync('command -v soffice').toString().trim(); } catch (e) { so = null; }
  if (so) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pcform-')); fs.writeFileSync(path.join(dir, 'f.docx'), out);
    cp.execSync('soffice --headless --convert-to pdf --outdir ' + dir + ' ' + path.join(dir, 'f.docx'), { stdio: 'ignore', timeout: 120000 });
    const txt = cp.execSync('pdftotext ' + path.join(dir, 'f.pdf') + ' -').toString();
    ['Example Engineering Co. (fictional)', 'EX-0001', 'EXAMPLE-000000', '02/01/2015', '$38,000,000', '10.8.1', 'EXAMPLE DATA'].forEach((v) => assert.ok(txt.includes(v), 'PDF text has ' + v));
  } else console.log('  (soffice not found: PDF conversion check skipped)');
});

t('v1.3 suggestions: deterministic keyword scoring, excludes existing, explains why', () => {
  const S = require('./suggest.js');
  const p = { name: 'IH 10 frontage drainage', desc: 'Replaced a box culvert and designed storm drain inlets; checked with HY-8 and the TxDOT Hydraulic Design Manual. Prepared a FEMA no-rise and CLOMR.', cats: [] };
  const r = S.suggest(p, C), codes = r.map((x) => x.code);
  assert.strictEqual(codes[0], '10.2.1'); assert.ok(codes.includes('10.8.1')); assert.ok(!codes.includes('10.6.1'));
  assert.ok(r[0].why.some((w) => /HY-8/.test(w))); assert.deepStrictEqual(S.suggest(p, C), r, 'deterministic');
  p.cats.push({ code: '10.2.1', text: '' }); assert.ok(!S.suggest(p, C).some((x) => x.code === '10.2.1'), 'already on project');
  assert.deepStrictEqual(S.suggest({ name: '', desc: '', cats: [] }, C), []);
  assert.ok(S.suggest({ name: 'Road widening', desc: 'horizontal alignment, typical sections, plan and profile sheets', cats: [] }, C).some((x) => x.code === '4.2.1'));
  assert.ok(S.suggest({ name: 'x', desc: 'Section 404 individual permit with wetland mitigation', cats: [] }, C).some((x) => x.code === '2.4.2'));
  assert.ok(/not a determination/.test(S.NOTE));
});
(async () => { let n = 0; for (const [name, f] of tests) { try { await f(); n++; } catch (e) { console.error('FAIL', name, e); process.exit(1); } } console.log('ok', n, 'tests'); })();
