// National Radar tests. Run: node national-radar/test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const M = require('./model.js');
const AS_OF = '2026-10-26';

// a candidate that passes every rule except the one under test
function base(over) {
  return Object.assign({
    src: 't', srcId: '1', url: 'https://example.test/1', title: 'Stormwater drainage master plan engineering services', desc: '', agency: 'Test Agency', naics: '541330', psc: 'C219', status: 'open', noticeType: 'Solicitation',
    amounts: [{ v: 25000000, kind: 'capacity', field: 'Test fee field' }], dates: { due: '2026-12-01' }
  }, over || {});
}
const ev = (c) => M.evaluate(c, { asOf: AS_OF });
const fee = (v, kind) => [{ v, kind: kind || 'capacity', field: 'Test fee field' }];

// ---- fee strictness: strictly greater than $20,000,000
assert.strictEqual(M.FEE_THRESHOLD, 20000000);
assert.strictEqual(M.passesFee(19990000), false, '$19.99M is excluded');
assert.strictEqual(M.passesFee(20000000), false, 'exactly $20,000,000.00 is excluded');
assert.strictEqual(M.passesFee(20000000.01), true, '$20,000,000.01 is included');
assert.strictEqual(ev(base({ amounts: fee(19990000) })).bucket, 'excluded');
assert.strictEqual(ev(base({ amounts: fee(20000000) })).bucket, 'excluded');
assert.ok(ev(base({ amounts: fee(20000000) })).excl.indexOf('fee-not-above-20m') >= 0);
assert.strictEqual(ev(base({ amounts: fee(20000000) })).flags.exact20, true);
assert.strictEqual(ev(base({ amounts: fee(20000000.01) })).bucket, 'opp');
assert.strictEqual(ev(base({ amounts: fee(150000000, 'nte') })).bucket, 'opp');
// every fee kind behaves the same way
['capacity', 'maxvalue', 'nte', 'estvalue', 'options', 'award', 'obligated'].forEach((k) => {
  assert.strictEqual(M.isFeeKind(k), true, k + ' is a fee kind');
  assert.strictEqual(ev(base({ status: k === 'award' ? 'awarded' : 'open', amounts: fee(20000000, k) })).bucket, 'excluded', k + ' at exactly $20M');
});

// ---- a project / construction cost never satisfies the fee rule
assert.strictEqual(M.isFeeKind('project_cost'), false);
let r = ev(base({ amounts: [{ v: 900000000, kind: 'project_cost', field: 'Construction cost field' }] }));
assert.strictEqual(r.bucket, 'nofee', 'only a project cost: kept apart as "fee not stated", never in the main list');
assert.strictEqual(r.flags.fee, 'cost-only');
assert.notStrictEqual(r.bucket, 'opp');
assert.strictEqual(r.projectCost.v, 900000000, 'cost is kept, labeled separately');
assert.strictEqual(r.amt, null, 'cost is not the stated fee');
r = ev(base({ amounts: [{ v: 900000000, kind: 'project_cost', field: 'c' }, { v: 5000000, kind: 'capacity', field: 'f' }] }));
assert.strictEqual(r.bucket, 'excluded', 'a $5M fee beside a $900M cost is a $5M fee');
r = ev(base({ amounts: [] })); assert.strictEqual(r.bucket, 'nofee'); assert.strictEqual(r.amt, null);

// ---- amounts found in notice text: classify by the nearest keyword
const ex = (t) => M.extractAmounts(t).map((x) => [x.v, x.cls, x.kind]);
assert.deepStrictEqual(ex('The total shared capacity is $500,000,000.00 for all MATOC holders.'), [[500000000, 'fee', 'capacity']]);
assert.deepStrictEqual(ex('The magnitude of construction is between $25,000,000 and $100,000,000.').map((x) => x[1]), ['cost', 'cost']);
assert.strictEqual(ex('Not-to-exceed $249.5 million over the ordering period')[0][1], 'fee');
assert.strictEqual(ex('The small business size standard is $25.5 million in average annual receipts.')[0][1], 'ignore');
assert.notStrictEqual(ex('Minimum guarantee of $5,000,000 per task order')[0][1], 'fee', 'minimum / per-task-order amounts are not the fee');
assert.strictEqual(M.extractAmounts('no money here').length, 0);
assert.strictEqual(M.extractAmounts('valued between $1,000,000 and $5,000,000 million? 5.')[1].v, 5000000, 'a unit word after full-dollar digits is ignored');
assert.strictEqual(M.extractAmounts('estimated value of $25 million')[0].v, 25000000);

// ---- forecast ranges use the lower bound; a range that starts at exactly $20M goes to review
assert.strictEqual(M.rangeLowText('$50M - $100M'), 50000000);
assert.strictEqual(M.rangeLowText('$20M - $49M'), 20000000);
assert.strictEqual(M.rangeLow('$20M to $50M'), 20000000);
assert.strictEqual(M.rangeLow('Over $100M'), 100000000);
r = ev(base({ amounts: [{ v: 20000000, kind: 'range', field: 'dollar_range = "$20M - $49M" (lower bound)' }] }));
assert.strictEqual(r.bucket, 'review'); assert.ok(r.review.join(' ').indexOf('exactly $20,000,000') >= 0);
assert.strictEqual(ev(base({ amounts: [{ v: 50000000, kind: 'range', field: 'f' }] })).bucket, 'opp');
assert.strictEqual(ev(base({ amounts: [{ v: 10000000, kind: 'range', field: 'f' }] })).bucket, 'excluded');

// ---- engineering consultant services only
assert.strictEqual(ev(base({ naics: '237110' })).bucket, 'excluded');
assert.ok(ev(base({ naics: '237110', psc: 'Y1AA' })).excl.indexOf('construction-naics') >= 0);
assert.strictEqual(ev(base({ naics: '333914', psc: '4320' })).bucket, 'excluded');
assert.strictEqual(M.engineering('541330', 'C219').level, 'strong');
assert.strictEqual(M.engineering('541370', '').level, 'strong');
assert.strictEqual(M.engineering('541330', 'R425', 'Water and sewer conservation systems\u0001').level, 'weak', 'engineering NAICS with a non-A&E PSC and no engineering words in the title needs review');
assert.strictEqual(M.engineering('541330', 'R425', 'Sewer design services\u0001').level, 'strong');
assert.strictEqual(M.engineering('541310', '').level, 'weak');
assert.strictEqual(M.engineering('541620', '', 'Program support services for EPA\u0001').level, 'weak', 'environmental consulting without engineering words needs review');
assert.strictEqual(M.engineering('541620', '', 'Drainage engineering study\u0001').level, 'strong');
assert.strictEqual(ev(base({ naics: '541310' })).bucket, 'review', 'architecture-only NAICS is uncertain, never silently included');
assert.strictEqual(ev(base({ titleSuggestsConstruction: true })).bucket, 'excluded');
assert.strictEqual(ev(base({ foreign: true })).bucket, 'excluded');
assert.ok(ev(base({ foreign: true })).excl.indexOf('outside-us') >= 0);

// ---- sector keywords
assert.strictEqual(M.classifySector('Stormwater master plan', '').level, 'title');
assert.strictEqual(M.classifySector('Wastewater treatment plant design', '').level, 'title');
assert.strictEqual(M.classifySector('Chilled water plant repair', '').level, 'none', 'chilled water is HVAC');
assert.strictEqual(M.classifySector('Energy savings performance contract: hot water boilers', '').level, 'none');
assert.strictEqual(M.classifySector('Design services', 'Includes a one-time mention of civil works near the end.').level, 'weak');
assert.strictEqual(ev(base({ title: 'Architect-engineer services for aircraft hangars' })).bucket, 'excluded');
assert.ok(ev(base({ title: 'Ship channel flood study', amounts: fee(30000000) })).bucket === 'opp', '"ship channel" is a waterway, not a vessel');
assert.ok(ev(base({ title: 'Energy savings performance contract (ESPC) stormwater retrofits' })).excl.indexOf('non-civil-context') >= 0, 'ESPC titles are excluded');
r = ev(base({ title: 'Submarine base engineering services', desc: 'Work includes stormwater drainage, flood wall and wastewater upgrades.' }));
assert.strictEqual(r.bucket, 'excluded', 'non-civil title with sector words only in the description is excluded, never listed');
assert.ok(r.excl.indexOf('non-civil-context') >= 0);

// ---- status
assert.strictEqual(ev(base({ dates: { due: '2026-10-25' } })).bucket, 'closed', 'deadline before the snapshot date: closed, not an opportunity');
assert.strictEqual(ev(base({ dates: { due: '2026-10-26' } })).bucket, 'opp', 'due on the snapshot date is still open');
assert.strictEqual(ev(base({ status: 'upcoming', dates: {} })).bucket, 'opp');
assert.strictEqual(ev(base({ status: 'awarded', amounts: fee(40000000, 'award'), dates: { award: '2026-06-01' } })).bucket, 'award');
assert.strictEqual(ev(base({ status: 'inactive' })).bucket, 'excluded');

// ---- toRecord: recompete watch is awards only, end date within 18 months, labeled inferred
const aw = (end, endInferred) => base({ status: 'awarded', amounts: fee(40000000, 'award'), dates: { award: '2026-01-01', end, endInferred } });
const rr = (c) => M.toRecord(c, ev(c), AS_OF);
assert.strictEqual(rr(aw('2027-12-31')).recompete, true);
assert.strictEqual(rr(aw('2028-04-26')).recompete, true, 'exactly 18 months out is inside the window');
assert.ok(!rr(aw('2028-04-27')).recompete, 'past 18 months');
assert.ok(!rr(aw('2026-10-25')).recompete, 'already ended');
assert.ok(rr(aw('2027-12-31')).rules.some((x) => x.k === 'recompete' && /INFERRED/.test(x.t)));
assert.ok(!rr(base({ dates: { end: '2027-12-31', due: '2026-12-01' } })).recompete, 'open solicitations are not recompetes');

// ---- record shape: source link, rules, source field names
const rec = rr(base());
assert.ok(rec.url && rec.rules.length >= 3 && rec.amt.field === 'Test fee field' && rec.amt.kind === 'capacity');
assert.ok(rec.rules.some((x) => x.k === 'fee' && /strictly greater than \$20,000,000/.test(x.t)));

// ---- dedupe
const mk = (o) => M.toRecord(base(o), ev(base(o)), AS_OF);
let d = M.dedupe([mk({ src: 'sam', srcId: 'a', solNum: 'W912DR26R0001', title: 'Stormwater drainage master plan engineering services' }), mk({ src: 'sam', srcId: 'b', status: 'awarded', amounts: fee(30000000, 'award'), dates: { award: '2026-09-01' }, awardNum: 'W912DR26R0001', solNum: 'W912DR26R0001' }), mk({ src: 'usa', srcId: 'c', title: 'Something else entirely in the Gulf', awardNum: 'ZZZ' })]);
assert.strictEqual(d.length, 2, 'same solicitation / award number merges');
assert.strictEqual(d[0].also.length, 1);
assert.strictEqual(d._merged, 1);
d = M.dedupe([mk({ src: 'x', srcId: '1', title: 'Hillview Reservoir stormwater engineering design services', agency: 'NYC DDC' }), mk({ src: 'y', srcId: '2', title: 'Hillview Reservoir stormwater engineering design services', agency: 'NYC DDC' })]);
assert.strictEqual(d.length, 1, 'identical title + agency + amount merges');
d = M.dedupe([mk({ src: 'x', srcId: '1', title: 'Hillview Reservoir stormwater engineering design services', agency: 'NYC DDC' }), mk({ src: 'y', srcId: '2', title: 'Hillview Reservoir stormwater engineering design services', agency: 'NYC DDC', amounts: fee(31000000) })]);
assert.strictEqual(d.length, 2, 'different amounts are different records');
d = M.dedupe([mk({ srcId: '1', awardNum: 'AB1', title: 'Alpha stormwater design' }), mk({ srcId: '2', awardNum: 'AB1x', title: 'Beta drainage plan' })]);
assert.strictEqual(d.length, 2, 'short or different numbers do not merge');
// chain: A shares a number with B, B shares a title key with C: one group
d = M.dedupe([mk({ srcId: '1', awardNum: 'CHAIN-001', title: 'Chain one stormwater design alpha', amounts: fee(41000000) }), mk({ srcId: '2', awardNum: 'CHAIN-001', title: 'Other words here for chain two', amounts: fee(42000000) }), mk({ srcId: '3', awardNum: 'NONE-9999', title: 'Other words here for chain two', amounts: fee(42000000) })]);
assert.strictEqual(d.length, 1, 'transitive merges');

// ---- filters
const recs = [
  mk({ srcId: '1', state: 'TX', agency: 'A', amounts: fee(20000000.01) }),
  mk({ srcId: '2', state: 'CA', agency: 'B', amounts: fee(60000000), title: 'Coastal flood protection engineering study' }),
  mk({ srcId: '3', state: 'TX', agency: 'B', amounts: fee(150000000, 'nte'), status: 'upcoming', dates: {}, title: 'Wastewater plant design services' }),
  mk({ srcId: '4', state: 'NY', agency: 'C', amounts: [{ v: 80000000, kind: 'project_cost', field: 'cost' }], title: 'Water main engineering study' })
];
assert.deepStrictEqual(recs.map((x) => x.bucket), ['opp', 'opp', 'opp', 'nofee']);
const F = (f, w) => M.filterRecords(recs, f, w).map((x) => x.srcId);
assert.deepStrictEqual(F({ tab: 'opp' }), ['1', '2', '3']);
assert.deepStrictEqual(F({ tab: 'nofee' }), ['4']);
assert.deepStrictEqual(F({ tab: 'opp', states: ['TX'] }), ['1', '3']);
assert.deepStrictEqual(F({ tab: 'opp', agencies: ['B'] }), ['2', '3']);
assert.deepStrictEqual(F({ tab: 'opp', statuses: ['upcoming'] }), ['3']);
assert.deepStrictEqual(F({ tab: 'opp', feeMin: 20000000 }), ['1', '2', '3']);
assert.deepStrictEqual(F({ tab: 'opp', feeMin: 20000000.01 }), ['2', '3'], 'feeMin is strictly greater than');
assert.deepStrictEqual(F({ tab: 'opp', feeMin: 60000000 }), ['3'], 'feeMin is strictly greater than: $60M is not > $60M');
assert.deepStrictEqual(F({ tab: 'opp', feeMin: 50000000, feeMax: 100000000 }), ['2']);
assert.deepStrictEqual(F({ tab: 'opp', sectors: ['coastal'] }), ['2']);
assert.deepStrictEqual(F({ tab: 'opp', q: 'wastewater' }), ['3']);
assert.deepStrictEqual(F({ tab: 'opp', q: 'texas' }).length, 0, 'text search matches the stored fields only');
assert.deepStrictEqual(F({ tab: 'opp', states: ['TX'], agencies: ['B'], feeMin: 100000000 }), ['3'], 'filters combine');
assert.deepStrictEqual(F({ tab: 'nofee', feeMin: 20000000 }), [], 'a record without a stated fee never passes a fee filter');
assert.deepStrictEqual(F({ tab: 'nofee', costMin: 50000000 }), ['4'], 'project-cost toggle only filters records that state a cost');
assert.deepStrictEqual(F({ tab: 'nofee', costMin: 80000000 }), [], 'project cost filter is strictly greater too');
assert.deepStrictEqual(F({ tab: 'opp', costMin: 50000000 }), [], 'cost toggle never promotes a record that has a fee but no cost');
assert.deepStrictEqual(F({ watchOnly: true }, { [recs[1].id]: true }), ['2']);
assert.deepStrictEqual(M.sortRecords(recs.slice(0, 3), 'fee').map((x) => x.srcId), ['3', '2', '1']);

// ---- formatting and CSV
assert.strictEqual(M.fmtMoney(20000000), '$20M'); assert.strictEqual(M.fmtMoney(249500000), '$249.5M'); assert.strictEqual(M.fmtMoney(1250000000), '$1.25B'); assert.strictEqual(M.fmtMoney(null), 'n/a');
assert.strictEqual(M.fmtMoneyFull(20000000.01), '$20,000,000.01');
const csv = M.toCSV([recs[0]], AS_OF); const lines = csv.trim().split('\r\n');
assert.strictEqual(lines.length, 2); assert.ok(/fee_source_field/.test(lines[0]) && /project_cost_not_fee/.test(lines[0]) && /snapshot_as_of/.test(lines[0]));
assert.ok(lines[1].indexOf('Test fee field') > 0 && lines[1].indexOf(AS_OF) > 0);
assert.ok(M.toCSV([Object.assign({}, recs[0], { title: 'a "quoted", title' })], AS_OF).indexOf('"a ""quoted"", title"') > 0);

// ---- normalizers (field names kept in the record)
const pcl = M.normPcl ? M.normPcl : null; assert.ok(pcl);
const sam = M.normSam({ NoticeId: 'abc123', Title: 'Stormwater engineering services IDIQ', Description: 'The total shared capacity is $75,000,000.00. The magnitude of construction is $500,000,000.', Type: 'Combined Synopsis/Solicitation', NaicsCode: '541330', ClassificationCode: 'C219', PostedDate: '2026-10-01 10:00:00', ResponseDeadLine: '2026-11-15 17:00:00', 'Department/Ind.Agency': 'DEPT OF DEFENSE', 'Sub-Tier': 'DEPT OF THE ARMY', PopState: 'TX', PopCountry: 'USA', Link: 'https://sam.gov/workspace/contract/opp/abc123/view', 'Sol#': 'W912ABC26R0001' });
let sr = M.toRecord(sam, ev(sam), AS_OF);
assert.strictEqual(sr.bucket, 'opp'); assert.strictEqual(sr.amt.v, 75000000); assert.strictEqual(sr.projectCost.v, 500000000, 'construction magnitude stays a cost');
assert.strictEqual(sr.url, 'https://sam.gov/workspace/contract/opp/abc123/view'); assert.strictEqual(sr.dates.due, '2026-11-15');
const sam2 = M.normSam(Object.assign({}, { NoticeId: 'def', Title: 'Stormwater engineering services IDIQ', Description: 'The magnitude of construction is $500,000,000.', Type: 'Solicitation', NaicsCode: '541330', ClassificationCode: 'C219', PostedDate: '2026-10-01', ResponseDeadLine: '2026-11-15', 'Department/Ind.Agency': 'X', PopState: 'TX', PopCountry: 'USA' }));
sr = M.toRecord(sam2, ev(sam2), AS_OF); assert.strictEqual(sr.bucket, 'nofee', 'SAM notice with only a construction magnitude never passes the fee rule');
const samAward = M.normSam({ NoticeId: 'ghi', Title: 'Stormwater flood A-E services', Description: '', Type: 'Award Notice', NaicsCode: '541330', ClassificationCode: 'C219', PostedDate: '2026-09-01', AwardDate: '2026-08-30', 'Award$': '$20,000,000.00', Awardee: 'ACME', 'Department/Ind.Agency': 'X', PopState: 'FL', PopCountry: 'USA' });
assert.strictEqual(ev(samAward).bucket, 'excluded', 'SAM Award$ of exactly $20,000,000.00 is excluded');
assert.strictEqual(M.normSam({ Type: 'Justification', NoticeId: 'z' }), null, 'notice types not used are dropped');
const cal = M.normCaltransLar([4, 'T1', 46153, 46356, 'Planning', null, null, 5, 'A&E on-call stormwater drainage design', 20000000, 'x', 'New', 'n/a', null, null, '541330', '']);
assert.strictEqual(ev(cal).bucket, 'excluded', 'Caltrans look-ahead Amount of exactly $20,000,000 is excluded');
const cal2 = M.normCaltransLar([4, 'T2', 46153, 46356, 'Planning', null, null, 5, 'A&E on-call stormwater drainage design', 20000001, 'x', 'New', 'n/a', null, null, '541330', '']);
assert.strictEqual(ev(cal2).bucket, 'opp'); assert.ok(/Look Ahead/.test(M.toRecord(cal2, ev(cal2), AS_OF).amt.field));

// ---- built data: structure and invariants
const dataFile = path.join(__dirname, 'data', 'national.json');
if (fs.existsSync(dataFile)) {
  const D = JSON.parse(fs.readFileSync(dataFile, 'utf8')); const ids = {};
  assert.strictEqual(D.feeThreshold, 20000000); assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(D.asOfDate)); assert.ok(D.sources.length >= 5);
  D.records.forEach((x) => {
    assert.ok(!ids[x.id], 'unique id ' + x.id); ids[x.id] = 1;
    assert.ok(/^https?:\/\//.test(x.url || ''), 'source link on ' + x.id);
    assert.ok(x.rules && x.rules.length, 'rule recorded on ' + x.id);
    assert.ok(['opp', 'review', 'nofee', 'award', 'closed'].indexOf(x.bucket) >= 0);
    if (x.bucket === 'opp' || x.bucket === 'award') { assert.ok(x.amt && M.passesFee(x.amt.v), 'strictly > $20M on ' + x.id); assert.ok(M.isFeeKind(x.amt.kind) && x.amt.field, 'fee kind and source field on ' + x.id); }
    if (x.amt) assert.ok(x.amt.kind !== 'project_cost', 'a project cost is never the fee on ' + x.id);
    if (x.bucket === 'opp') assert.ok(x.status === 'open' || x.status === 'upcoming');
    if (x.bucket === 'award') assert.strictEqual(x.status, 'awarded');
    if (x.recompete) assert.ok(x.bucket === 'award' && x.rules.some((y) => y.k === 'recompete' && /INFERRED/.test(y.t)));
    if (x.bucket === 'nofee') assert.ok(!x.amt, 'nofee records state no fee: ' + x.id);
  });
  assert.strictEqual(D.counts.total, D.records.length);
}
require('./test-roadway.js');
console.log('national-radar tests passed');
