const assert = require('assert');
const D = require('./data.js');
const M = require('./model.js');

// ---- data integrity: every generated line carries a known source badge, every URL is https and registered
const badges = Object.keys(D.BADGES);
function checkPairs(arr, where) { arr.forEach(function (p) { assert.ok(Array.isArray(p) && badges.includes(p[0]) && typeof p[1] === 'string' && p[1].length > 5, 'bad pair in ' + where); }); }
assert.strictEqual(D.BMPS.length, 25);
const seen = {};
D.BMPS.forEach(function (b) {
  assert.ok(!seen[b.id], 'dup id ' + b.id); seen[b.id] = 1;
  assert.ok(D.CATS[b.cat], 'cat ' + b.id);
  assert.ok(badges.includes(b.badge), 'badge ' + b.id);
  ['purpose', 'where', 'install', 'maint', 'triggers'].forEach(function (k) { assert.ok(Array.isArray(b[k]), k + ' ' + b.id); checkPairs(b[k], b.id + '.' + k); });
  assert.ok(b.purpose.length && b.where.length && (b.triggers.length || b.id === 'permanent_controls'), 'missing content ' + b.id);
});
Object.keys(D.SOURCES).forEach(function (k) {
  const s = D.SOURCES[k];
  assert.ok(/^https:\/\//.test(s.url), 'https ' + k);
  assert.ok(badges.includes(s.badge) && ['read', 'linked'].includes(s.status), 'source meta ' + k);
});
D.FLAGS.forEach(function (f) { assert.ok(f.txdot && f.tceq && f.resolution && f.title, 'flag ' + f.id); });
assert.strictEqual(D.PERMIT.effective, 'March 5, 2023');
assert.strictEqual(D.PERMIT.expires, 'March 5, 2028');

// ---- permit determination
function det(over) { const f = M.defaultForm('txdot'); Object.assign(f, over); return M.permitDetermination(f); }
assert.strictEqual(det({}).tier, 'unknown');
assert.strictEqual(det({ acres: '0.4' }).tier, 'none');
assert.strictEqual(det({ acres: '0.4' }).txdotSwp3, true, 'TxDOT still needs SWP3 under 1 ac');
assert.strictEqual(M.permitDetermination(Object.assign(M.defaultForm('private'), { acres: '0.4' })).txdotSwp3, false);
assert.strictEqual(det({ acres: '1' }).tier, 'small');
assert.strictEqual(det({ acres: '4.99' }).tier, 'small');
assert.strictEqual(det({ acres: '5' }).tier, 'large');
assert.strictEqual(det({ acres: '5' }).noi, true);
assert.strictEqual(det({ acres: '3', supportAcres: '2' }).tier, 'large', 'support acres count');
assert.strictEqual(det({ acres: '2', commonPlan: true, planAcres: '12' }).tier, 'large', 'common plan');
assert.strictEqual(det({ acres: '0.5', commonPlan: true, planAcres: '1.5' }).tier, 'small');
assert.strictEqual(det({ acres: '20', routine: true }).tier, 'exempt');
assert.strictEqual(det({ acres: '5' }).siteNotice, 'Form 20961');
assert.strictEqual(det({ acres: '2' }).siteNotice, 'Form 20963');
assert.ok(det({ acres: '2', city: 'Houston' }).notes.some(function (n) { return n[0] === 'HOU'; }));
assert.ok(det({ acres: '2', county: 'Travis' }).notes.some(function (n) { return /Edwards/.test(n[1]); }));
assert.ok(det({ acres: '2', end: '2029-01-01' }).notes.some(function (n) { return /expires March 5, 2028/.test(n[1]); }));
det({ acres: '8' }).steps.concat(det({ acres: '2' }).steps).forEach(function (s) { assert.ok(badges.includes(s[0])); });

// ---- deadlines
let f = M.defaultForm('txdot'); f.acres = '8'; f.start = '2026-11-10'; f.end = '2027-05-01';
let dl = M.deadlines(f);
assert.ok(dl.some(function (d) { return d.date === '2026-11-08' && /MS4/.test(d.label); }), 'MS4 copy 2 days before');
assert.ok(dl.some(function (d) { return d.date === '2026-11-03' && /Paper NOI/.test(d.label); }), 'paper NOI 7 days before');
assert.ok(dl.some(function (d) { return d.date === '2027-05-31' && /NOT/.test(d.label); }), 'NOT 30 days after');
f.acres = '2'; dl = M.deadlines(f);
assert.ok(dl.some(function (d) { return d.date === '2026-11-08' && /Small Construction/.test(d.label); }));
assert.strictEqual(M.addDays('2026-02-27', 2), '2026-03-01');
assert.strictEqual(M.addDays('2028-02-28', 1), '2028-02-29');

// ---- basin test
f = M.defaultForm('txdot'); f.openAcres = '12';
let b = M.basinCheck(f);
assert.strictEqual(b.required, true); assert.strictEqual(b.permitNoCalcCf, 43200); assert.strictEqual(b.txdotTrapCf, null);
f.openAcres = '10'; assert.strictEqual(M.basinCheck(f).required, true, '10 acres triggers');
f.openAcres = '9.9'; assert.strictEqual(M.basinCheck(f).required, false);
f.openAcres = '4'; b = M.basinCheck(f); assert.strictEqual(b.txdotTrapCf, 7200);
f.openAcres = ''; assert.strictEqual(M.basinCheck(f).band, 'unknown');

// ---- BMP recommendations adapt to the form
let p = M.newProject({ name: 'T' }); p.form.acres = '12'; p.form.openAcres = '12';
let rec = M.recommendBmps(p.form);
assert.strictEqual(rec.sediment_basin.level, 'required');
assert.strictEqual(rec.sediment_fence.level, 'required');
assert.strictEqual(rec.vertical_tracking.level, 'optional');
p.form.act = { slopes: true, exits: true, concrete: true, dewatering: true, surfaceWater: true, outfalls: true, steep: true };
p.form.steepest = '2.5';
rec = M.recommendBmps(p.form);
assert.strictEqual(rec.vertical_tracking.level, 'required');
assert.strictEqual(rec.rock_exit.level, 'required');
assert.strictEqual(rec.concrete_washout.level, 'required');
assert.strictEqual(rec.dewatering_controls.level, 'required');
assert.strictEqual(rec.vegetated_buffer.level, 'required');
assert.strictEqual(rec.outlet_protection.level, 'required');
assert.strictEqual(rec.erosion_blanket.level, 'recommended');
assert.ok(rec.erosion_blanket.why.some(function (w) { return w[0] === 'ROT'; }), 'slope cut-off labeled rule of thumb');
p.form.openAcres = '4'; p.form.acres = '4'; rec = M.recommendBmps(p.form);
assert.strictEqual(rec.sediment_basin.level, 'optional');
// non-TxDOT: exit is recommended, not required
const pp = M.newProject({ name: 'Priv', type: 'private' }); pp.form.acres = '3'; pp.form.act = { exits: true, slopes: true };
assert.strictEqual(M.recommendBmps(pp.form).rock_exit.level, 'recommended');
assert.strictEqual(pp.form.inspMode, 'd14');
assert.strictEqual(M.newProject({}).form.inspMode, 'd7');
// every rec has valid badges
Object.keys(rec).forEach(function (k) { checkPairs(rec[k].why, 'rec ' + k); assert.ok(['required', 'recommended', 'optional'].includes(rec[k].level)); });
// selection warnings
p.form.openAcres = '12'; p.form.acres = '12'; p.sel = { sediment_basin: false };
assert.ok(M.checkSelection(p.form, p.sel).some(function (w) { return w.bmp === 'sediment_basin'; }), 'unchecked required basin warns');
p.form.basinInfeasible = true; p.form.basinWhy = '';
assert.ok(M.checkSelection(p.form, p.sel).some(function (w) { return /no reason/.test(w.t); }), 'needs reason');
p.form.basinWhy = 'ROW too narrow';
assert.ok(!M.checkSelection(p.form, p.sel).some(function (w) { return w.bmp === 'sediment_basin'; }));
assert.ok(M.sealFlags(p.form, p.sel).length >= 1, 'seal flag when infeasible');
assert.strictEqual(M.sealFlags(Object.assign({}, p.form, { type: 'private' }), p.sel).length, 0);
M.applySuggestions(p); assert.strictEqual(typeof p.sel.sediment_fence, 'boolean');

// ---- TxDOT vs permit flags
const flags = M.flagsFor(M.defaultForm('txdot'), {});
assert.ok(flags.some(function (x) { return x.id === 'daily'; }), 'stricter TxDOT item shown for TxDOT type');
assert.ok(!M.flagsFor(M.defaultForm('private'), {}).some(function (x) { return x.id === 'daily'; }));

// ---- inspections
assert.strictEqual(M.inspectionDue('d7', '2026-10-05', [], '2026-10-10').due, '2026-10-12');
let d = M.inspectionDue('d14', '2026-10-05', [], '2026-10-10'); assert.strictEqual(d.due, '2026-10-19'); assert.strictEqual(d.overdue, false);
d = M.inspectionDue('d14', '2026-10-05', [{ date: '2026-10-08', inches: 0.6 }], '2026-10-10');
assert.strictEqual(d.due, '2026-10-09'); assert.strictEqual(d.overdue, true);
d = M.inspectionDue('d14', '2026-10-05', [{ date: '2026-10-08', inches: 0.49 }], '2026-10-10'); assert.strictEqual(d.due, '2026-10-19', 'under 0.5 does not trigger');
d = M.inspectionDue('d7', '2026-10-05', [{ date: '2026-10-06', inches: 2 }], '2026-10-10'); assert.strictEqual(d.due, '2026-10-12', '7-day ignores rain');
d = M.inspectionDue('d14', '2026-10-05', [{ date: '2026-10-01', inches: 3 }], '2026-10-10'); assert.strictEqual(d.due, '2026-10-19', 'storm before last inspection ignored');
assert.strictEqual(M.inspectionDue('d14', '', [], '2026-10-10').due, '');
assert.ok(M.inspectionPlan(M.defaultForm('txdot')).rules.some(function (r) { return r[0] === 'TXDOT' && /Form 2118/.test(r[1]); }));
assert.ok(M.inspectionPlan(Object.assign(M.defaultForm('linear'), { inspMode: 'd14lin' })).rules.some(function (r) { return /0\.25 mile/.test(r[1]); }));

// ---- outline: permit element order, disclaimers, sources
p = M.newProject({ name: 'FM 1960 <b>widening</b>' }); p.form.acres = '6'; p.form.openAcres = '6'; p.form.owner = 'TxDOT Houston District';
const secs = M.generateOutline(p);
assert.strictEqual(secs.length, 21);
assert.deepStrictEqual(secs.map(function (s) { return s.n; }), secs.map(function (_, i) { return i + 1; }));
assert.ok(/Project and site description/.test(secs[0].title) && /Responsible parties/.test(secs[20].title));
secs.forEach(function (s) { checkPairs(s.refs, 'refs ' + s.title); s.blocks.forEach(function (bl) { if (bl.k === 'p') assert.ok(badges.includes(bl.b), 'p badge ' + s.title); if (bl.k === 'ul') checkPairs(bl.items, 'ul ' + s.title); }); });
const html = M.outlineToHtml(p, secs);
assert.ok(html.includes('Draft for engineer review'), 'disclaimer in html');
assert.ok(html.includes('FM 1960 &lt;b&gt;widening&lt;/b&gt;') && !html.includes('<b>widening</b>'), 'escaped');
assert.ok(html.includes('March 5, 2023') && html.includes('March 5, 2028'));
assert.ok(html.includes('Signature ____'), 'blank signature lines');
const md = M.outlineToMarkdown(p, secs);
assert.ok(md.includes('Draft for engineer review') && md.includes('## 21. Responsible parties') && md.includes('[TxDOT]') && md.includes('[TCEQ]'));
Object.keys(D.SOURCES).forEach(function (k) { assert.ok(md.includes(D.SOURCES[k].url), 'source listed ' + k); });
assert.ok(M.outlineToDoc(p, secs).startsWith('<html'));
const ck = M.checklistToHtml(p);
assert.ok(ck.includes('Inspection Checklist') && ck.includes('Draft for engineer review') && ck.includes('Form 2118'));

// ---- save / load
const st = { projects: [p, M.newProject({ name: 'B' })], activeId: p.id };
const json = M.backup(st);
const st2 = { projects: [], activeId: '' };
const r = M.restore(json, st2);
assert.ok(r.ok && st2.projects.length === 2 && st2.projects[0].form.acres === '6');
assert.strictEqual(M.restore(json, st2).n, 2); assert.strictEqual(st2.projects.length, 4); assert.strictEqual(new Set(st2.projects.map(function (x) { return x.id; })).size, 4, 'ids stay unique');
assert.strictEqual(M.restore('not json', st2).ok, false);
assert.strictEqual(M.restore('{"a":1}', st2).ok, false);
const junk = M.sanitizeProject({ name: 5, form: { acres: 7, type: 'zzz', inspMode: 'q', act: 3, phases: [null, { name: 'x' }] }, sel: { nope: true, sediment_fence: 1 }, inspLog: [{ date: 'bad' }, { date: '2026-01-02' }], rainLog: [{ date: '2026-01-02', inches: 'x' }] });
assert.strictEqual(junk.form.type, 'txdot'); assert.strictEqual(junk.form.acres, ''); assert.strictEqual(junk.form.inspMode, 'd7');
assert.deepStrictEqual(junk.sel, { sediment_fence: true }); assert.strictEqual(junk.inspLog.length, 1); assert.strictEqual(junk.rainLog.length, 0); assert.strictEqual(junk.form.phases.length, 2);
assert.strictEqual(M.sanitizeProject(null), null);

console.log('ok');
