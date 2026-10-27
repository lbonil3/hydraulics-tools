// PS&E / H&H lens tests (required from test.js). Run alone: node national-radar/test-pse.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const M = require('./model.js');
const PS = require('./pse.js');
const AS_OF = '2026-10-26';
const cand = (over) => Object.assign({ src: 't', srcId: '1', url: 'https://example.test/1', title: 'Drainage and PS&E design services, IH 10 Houston', desc: '', agency: 'TxDOT', subagency: null, state: 'TX', naics: '541330', psc: 'C219', status: 'upcoming', noticeType: 'Presolicitation', dates: {}, engOverride: { level: 'strong', why: 'test' }, amounts: [{ v: 6000000, kind: 'maxvalue', field: 'Test fee field' }] }, over || {});
const ev = (c) => PS.evaluatePse(c, { asOf: AS_OF });
const rec = (c) => { const e = ev(c); return e.lens ? PS.toRecordPse(c, e, AS_OF) : null; };
const amt = (v, kind, field) => [{ v, kind: kind || 'maxvalue', field: field || 'Test fee field' }];

// ---- strict > semantics, data floor, >= toggle
assert.strictEqual(PS.DEFAULT_FEE, 5000000);
assert.strictEqual(ev(cand({ amounts: amt(4999999.99) })).lens, null, 'below the $5M floor is not kept');
assert.ok(ev(cand({ amounts: amt(4999999.99) })).excl.indexOf('fee-below-5m') >= 0);
const e5 = ev(cand({ amounts: amt(5000000) })); assert.strictEqual(e5.lens, 'fee'); assert.strictEqual(e5.flags.exact5, true); assert.ok(e5.badges.indexOf('Exactly $5M') >= 0);
const R5 = rec(cand({ srcId: 'a', amounts: amt(5000000) })), R5b = rec(cand({ srcId: 'b', amounts: amt(5000000.01) })), R9 = rec(cand({ srcId: 'c', amounts: amt(9000000) }));
const all = [R5, R5b, R9];
const ids = (f) => PS.filterPse(all, f, {}).map((r) => r.srcId).sort().join(',');
assert.strictEqual(ids({}), 'b,c', 'default: strictly > $5,000,000, exactly $5M is out');
assert.strictEqual(ids({ feeMin: 5000000 }), 'b,c');
assert.strictEqual(ids({ feeMin: 5000000, inclusive: true }), 'a,b,c', '>= toggle brings exactly $5M in');
assert.strictEqual(ids({ feeMin: 9000000 }), '', 'strict at the editable threshold too');
assert.strictEqual(ids({ feeMin: 9000000, inclusive: true }), 'c');
assert.strictEqual(ids({ feeMin: 20000000 }), '');
assert.strictEqual(PS.exactAtThreshold(all, {}, {}).length, 1, 'exact-$5M note finds the $5M row');
assert.strictEqual(PS.exactAtThreshold(all, { feeMin: 9000000 }, {})[0].srcId, 'c', 'note follows the editable threshold');
assert.strictEqual(PS.exactAtThreshold(all, { inclusive: true }, {}).length, 0, 'no note when >= is on');

// ---- badges: Confirmed vs Unconfirmed; they are badges, not gates
const conf = rec(cand({}));
assert.strictEqual(conf.conf, 'confirmed'); assert.ok(conf.badges.indexOf('Confirmed') >= 0);
const tp = rec(cand({ amounts: amt(7000000, 'estvalue', 'Description text') }));
assert.strictEqual(tp.conf, 'unconfirmed'); assert.ok(tp.badges.indexOf('Text-parsed') >= 0); assert.strictEqual(tp.textParsed, true, 'text-parsed amounts are shown, with a badge');
const dsc = rec(cand({ title: 'On-call engineering services', desc: 'Includes hydrology and hydraulics studies for the corridor.' }));
assert.ok(dsc && dsc.conf === 'unconfirmed' && dsc.badges.indexOf('Inferred sector') >= 0, 'scope only in the description => Inferred sector');
const weak = rec(cand({ engOverride: { level: 'weak', why: 'test weak' } })); assert.ok(weak && weak.conf === 'unconfirmed');
const unc = rec(cand({ status: 'weird' })); assert.ok(unc && unc.badges.indexOf('Status unclear') >= 0 && unc.stage === 'unclear');
const aw = rec(cand({ status: 'awarded', dates: { award: '2026-03-01' } })); assert.strictEqual(aw.stage, 'awarded'); assert.ok(aw.badges.indexOf('Awarded') >= 0);
const lst = [conf, tp, dsc, aw];
assert.strictEqual(PS.filterPse(lst, { hideUnconfirmed: true }, {}).length, 2, 'hide-unconfirmed keeps Confirmed only');
assert.strictEqual(PS.filterPse(lst, {}, {}).length, 4, 'default shows unconfirmed too');
assert.strictEqual(PS.filterPse(lst, { noText: true }, {}).indexOf(tp), -1);
assert.strictEqual(PS.sortPse(lst, 'conf')[0].conf, 'confirmed', 'sorted by confidence then fee');
// stage tabs
assert.strictEqual(PS.filterPse(lst, { tab: 'awarded' }, {}).length, 1);
assert.strictEqual(PS.filterPse(lst, { tab: 'open' }, {}).length, 3);
const fc = rec(cand({ src: 'txdot-pcl', srcId: 'f' })); assert.strictEqual(fc.stage, 'forecast'); assert.strictEqual(PS.filterPse([fc, conf], { tab: 'forecast' }, {}).length, 1);
// closed solicitations: deadline passed
const cl = rec(cand({ status: 'open', dates: { due: '2026-01-01' } })); assert.strictEqual(cl.stage, 'closed'); assert.ok(cl.badges.indexOf('Closed') >= 0);

// ---- exclusions that remain: construction, no scope, non engineering, non-US
assert.strictEqual(ev(cand({ engOverride: { level: 'construction', why: 'x' } })).lens, null);
assert.ok(ev(cand({ engOverride: { level: 'construction', why: 'x' } })).excl.indexOf('construction') >= 0);
assert.ok(ev(cand({ title: 'Janitorial services', desc: 'office cleaning' })).excl.indexOf('no-scope-match') >= 0);
assert.ok(ev(cand({ engOverride: { level: 'none', why: 'x' }, naics: '', psc: '' })).excl.indexOf('not-engineering') >= 0);
assert.ok(ev(cand({ foreign: true })).excl.indexOf('outside-us') >= 0);
assert.ok(ev(cand({ title: 'Hydraulic hose assemblies, flood light kit', desc: 'supply of hydraulic hose' })).lens === null, 'hydraulic hose is not H&H');

const dbc0 = (over) => cand(Object.assign({ src: 'sam', srcId: 'dbx', title: 'Design-Build, Drainage and Roadway Improvements, SH 6', desc: '', naics: '237310', psc: 'Y1JZ', engOverride: undefined, amounts: [{ v: 240000000, kind: 'estvalue', field: 'Description text' }] }, over || {}));
// ---- non-design services and buildings stay out; hydraulic-noise phrases are not H&H
assert.ok(ev(cand({ title: 'Construction management services for the Hillview outfall' })).excl.indexOf('not-design-services') >= 0, 'CM / inspection is not PS&E');
assert.ok(ev(cand({ title: 'Technical and administrative support for stormwater programs' })).excl.indexOf('not-design-services') >= 0);
assert.ok(ev(cand({ title: 'Stormwater and drainage design for courthouse facade' })).lens === 'fee', 'drainage in the title keeps a building-site design job');
assert.ok(ev(cand({ title: 'Courthouse facade A-E services', desc: 'architect engineer' })).lens === null);
assert.ok(ev(cand({ title: 'Reconstruction of the main pump system' })).excl.indexOf('construction') >= 0, 'construction title with no design word');
assert.strictEqual(ev(cand({ title: 'Thermal hydraulic code development and user support', desc: 'nuclear safety code' })).lens, null);
assert.strictEqual(ev(dbc0({ title: 'Design-build barracks and multi-use training facility', naics: '237990', desc: 'site drainage' })).lens, null, 'DB buildings are out');
// ---- pipeline lens: project cost is never a fee
const pc = (over) => cand(Object.assign({ projectList: true, src: 'txdot-pi', srcId: 'p1', engOverride: { level: 'none', why: 'x' }, naics: '', psc: '', title: 'IH 45 drainage improvements, culverts and storm drain', desc: 'PS&E stage', amounts: [{ v: 120000000, kind: 'project_cost', field: 'project_estimate_low_bid' }] }, over || {}));
const pe = ev(pc({})); assert.strictEqual(pe.lens, 'pipeline');
const pr = PS.toRecordPse(pc({}), pe, AS_OF);
assert.strictEqual(pr.amt, null, 'pipeline records carry no fee'); assert.strictEqual(pr.projectCost.v, 120000000);
assert.strictEqual(pr.illustrative.low, 7200000); assert.strictEqual(pr.illustrative.high, 12000000); assert.ok(/Estimate/.test(pr.illustrative.label)); assert.ok(/codeofarrules\.arkansas\.gov/.test(pr.illustrative.url));
const prEdge = PS.toRecordPse(pc({ srcId: 'p2', amounts: [{ v: 50000000, kind: 'project_cost', field: 'f' }] }), ev(pc({ srcId: 'p2', amounts: [{ v: 50000000, kind: 'project_cost', field: 'f' }] })), AS_OF);
const feeRec = rec(cand({ srcId: 'x', amounts: amt(40000000) }));
for (const thr of [0, 5000000, 20000000, 100000000]) for (const incl of [false, true]) {
  assert.strictEqual(PS.filterPse([pr, prEdge, feeRec], { feeMin: thr, inclusive: incl }, {}).filter((r) => r.lens !== 'fee').length, 0, 'pipeline never reaches fee tabs');
  for (const tab of ['open', 'awarded', 'forecast']) assert.strictEqual(PS.filterPse([pr, prEdge], { tab, feeMin: 0, inclusive: true }, {}).length, 0);
}
assert.strictEqual(PS.filterPse([pr, prEdge], { tab: 'pipeline', costMin: 50000000 }, {}).length, 1, 'pipeline cost threshold is strict > and separate');
assert.strictEqual(PS.filterPse([pr, prEdge], { tab: 'pipeline', costMin: 20000000 }, {}).length, 2);
assert.strictEqual(PS.PIPE_DEFAULT, 50000000);
assert.strictEqual(ev(pc({ title: 'IH 10 resurfacing', desc: 'overlay' })).lens, null, 'no drainage / H&H words => not in the pipeline');
assert.strictEqual(ev(pc({ amounts: [{ v: 10000000, kind: 'project_cost', field: 'f' }] })).lens, null, 'below the pipeline data floor');
// a notice with only a project cost (no fee) never becomes a fee record
assert.notStrictEqual(ev(cand({ amounts: [{ v: 90000000, kind: 'project_cost', field: 'construction cost' }] })).lens, 'fee');

// ---- design-build lens
const dbc = (over) => cand(Object.assign({ src: 'sam', srcId: 'db1', title: 'Design-Build, Drainage and Roadway Improvements, SH 6', desc: 'The design-build contract value is estimated at $240,000,000. Stipend of $1,500,000 will be paid.', naics: '237310', psc: 'Y1JZ', engOverride: undefined, amounts: [{ v: 240000000, kind: 'estvalue', field: 'Description text' }] }, over || {}));
const de = ev(dbc({})); assert.strictEqual(de.lens, 'db');
const dr = PS.toRecordPse(dbc({}), de, AS_OF);
assert.strictEqual(dr.amt, null, 'DB value is never in amt'); assert.strictEqual(dr.dbValue.v, 240000000); assert.strictEqual(dr.projectCost, null);
assert.strictEqual(dr.stipend.v, 1500000, 'stipend is shown, labeled, not counted'); assert.strictEqual(dr.designFee, null);
assert.strictEqual(dr.dbRole, 'sub', 'construction NAICS => design-subconsultant to a DB team (inferred)'); assert.ok(/inferred/i.test(dr.dbRoleLabel));
assert.strictEqual(PS.toRecordPse(dbc({ naics: '541330' }), ev(dbc({ naics: '541330' })), AS_OF).dbRole, 'prime');
for (const thr of [0, 5000000, 100000000, 500000000]) for (const incl of [false, true]) for (const tab of [null, 'open', 'awarded', 'forecast']) {
  assert.strictEqual(PS.filterPse([dr], { tab, feeMin: thr, inclusive: incl }, {}).length, 0, 'DB value never satisfies a fee filter');
}
assert.strictEqual(PS.filterPse([dr], { tab: 'db' }, {}).length, 1);
assert.strictEqual(PS.filterPse([dr], { tab: 'db', dbMin: 240000000 }, {}).length, 0, 'DB value threshold is strict >');
assert.strictEqual(PS.filterPse([dr], { tab: 'db', dbMin: 239999999 }, {}).length, 1);
assert.strictEqual(PS.filterPse([dr], { tab: 'db', dbRoles: ['prime'] }, {}).length, 0); assert.strictEqual(PS.filterPse([dr], { tab: 'db', dbRoles: ['sub'] }, {}).length, 1);
// DB with a separately stated design fee
const dfc = dbc({ srcId: 'db2', desc: 'The design-build value is $300,000,000. The design portion is estimated at $12,000,000.', amounts: [{ v: 300000000, kind: 'estvalue', field: 'Description text' }, { v: 12000000, kind: 'estvalue', field: 'Description text' }] });
const dfe = ev(dfc); assert.strictEqual(dfe.designFee.v, 12000000);
const dfr = PS.designFeeRecord(dfc, dfe, AS_OF); assert.strictEqual(dfr.lens, 'fee'); assert.strictEqual(dfr.amt.v, 12000000); assert.ok(dfr.badges.indexOf('Text-parsed') >= 0 && dfr.badges.indexOf('Unconfirmed') >= 0);
assert.ok(dfr.id.endsWith(':design-fee') && dfr.id !== PS.toRecordPse(dfc, dfe, AS_OF).id);
assert.strictEqual(PS.filterPse([dfr], {}, {}).length, 1, 'a stated design fee over $5M counts');
assert.strictEqual(PS.filterPse([dfr], { feeMin: 12000000 }, {}).length, 0);
assert.strictEqual(PS.designFeeRecord(dbc({ desc: 'Design portion is $3,000,000.' }), { designFee: { v: 3000000, ctx: 'x' } }, AS_OF), null, 'design fee below $5M makes no fee record');
assert.strictEqual(PS.extractDesignFee('The total project is $300,000,000.'), null, 'a total is not a design fee');
assert.strictEqual(PS.dbTypeOf('Progressive Design-Build for the plant'), 'Progressive design-build');
assert.ok(/CMGC/.test(PS.dbTypeOf('CMGC services')));
assert.ok(ev(dbc({ title: 'Design-build of a parking garage', desc: 'garage', naics: '236220', amounts: amt(80000000, 'estvalue') })).excl.indexOf('db-not-civil-scope') >= 0, 'non-civil DB is out');
// DB records and fee records with the same ids are not merged by the builder's per-lens dedupe
const both = [dr, dfr]; assert.strictEqual(M.dedupe(both.filter((r) => r.lens === 'db')).length, 1); assert.strictEqual(M.dedupe(both.filter((r) => r.lens === 'fee')).length, 1);

// ---- CSV labels
const csv = PS.toCSVPse([dr, pr, conf], AS_OF);
assert.ok(/design_build_contract_value_NOT_A_FEE/.test(csv.split('\r\n')[0]) && /project_cost_NOT_A_FEE/.test(csv.split('\r\n')[0]) && /illustrative_fee_low_ESTIMATE/.test(csv.split('\r\n')[0]));
const row = (r) => csv.split('\r\n').filter((l) => l.indexOf(r.id) === 0)[0];
assert.ok(row(dr).split(',')[PS.CSV_COLS.indexOf('fee_value')] === '', 'DB rows have an empty fee column');

// ---- built file invariants
const fp = path.join(__dirname, 'data', 'pse.json');
if (fs.existsSync(fp)) {
  const D = JSON.parse(fs.readFileSync(fp, 'utf8'));
  assert.strictEqual(D.counts.total, D.records.length);
  const seen = {}; D.records.forEach((r) => { assert.ok(!seen[r.id], 'unique ids: ' + r.id); seen[r.id] = 1; assert.ok(r.url && /^https?:\/\//.test(r.url), 'source link on every record: ' + r.id); assert.ok(r.title && r.badges && r.stage && r.lens); });
  D.records.forEach((r) => {
    if (r.lens === 'fee') { assert.ok(r.amt && r.amt.v >= 5000000 && r.amt.field, 'fee record has a labeled amount >= $5M: ' + r.id); assert.ok(r.badges.indexOf('Confirmed') >= 0 || r.badges.indexOf('Unconfirmed') >= 0); assert.ok(['project_cost', 'db_value'].indexOf(r.amt.kind) < 0, 'fee amount is never a cost or DB value: ' + r.id); }
    if (r.lens === 'db') { assert.ok(!r.amt); assert.ok(!r.projectCost); assert.ok(r.dbRoleLabel && /inferred/i.test(r.dbRoleLabel)); if (r.dbValue) assert.ok(r.dbValue.field); }
    if (r.lens === 'pipeline') { assert.ok(!r.amt); assert.ok(r.projectCost && r.projectCost.v >= PS.PIPE_FLOOR && r.projectCost.field); assert.ok(r.illustrative && /Estimate/.test(r.illustrative.label)); }
  });
  const gt = D.records.filter((r) => r.lens === 'fee' && r.amt.v > 5000000).length; assert.strictEqual(D.counts.fee.strictGt5, gt);
  // the strict filter over the built data equals the stored count, and default tabs never contain DB or pipeline rows
  assert.strictEqual(PS.filterPse(D.records, {}, {}).length, gt);
  assert.strictEqual(PS.filterPse(D.records, {}, {}).filter((r) => r.lens !== 'fee').length, 0);
}
console.log('national-radar PS&E tests passed');
