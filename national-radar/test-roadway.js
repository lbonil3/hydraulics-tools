// Roadway + drainage lane tests (required from test.js). Run alone: node national-radar/test-roadway.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const M = require('./model.js');
const R = require('./roadway.js');
const C = require('./cost.js');
const AS_OF = '2026-10-26';
const PRICES = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'bid-cost', 'prices.json'), 'utf8')).rows.reduce((o, r) => { if (C.PRICE_CODES.indexOf(r.bid_code) >= 0) o[r.bid_code] = r; return o; }, {});

function rc(over) {
  return Object.assign({ src: 't', srcId: '1', url: 'https://example.test/1', title: 'Drainage design services, IH 10 Houston', desc: '', agency: 'TxDOT', naics: '541330', psc: 'C219', status: 'upcoming', dates: {},
    engOverride: { level: 'strong', why: 'test' }, amounts: [{ v: 6000000, kind: 'maxvalue', field: 'Test fee field' }] }, over || {});
}
const ev = (c) => R.evaluateRoadway(c, { asOf: AS_OF });
const amt = (v, kind) => [{ v, kind: kind || 'maxvalue', field: 'Test fee field' }];

// ---- $5,000,000 drainage-specific threshold is STRICT
assert.strictEqual(R.DRAIN_MIN, 5000000);
assert.strictEqual(R.passesDrain(5000000), false, 'exactly $5,000,000.00 is excluded');
assert.strictEqual(R.passesDrain(5000000.01), true, '$5,000,000.01 is included');
assert.strictEqual(R.passesDrain(4999999.99), false);
assert.strictEqual(ev(rc({ amounts: amt(5000000) })).bucket, 'excluded');
assert.ok(ev(rc({ amounts: amt(5000000) })).excl.indexOf('drain-fee-not-above-5m') >= 0);
assert.strictEqual(ev(rc({ amounts: amt(5000000) })).flags.exact5, true);
assert.strictEqual(ev(rc({ amounts: amt(5000000.01) })).bucket, 'opp');
assert.strictEqual(ev(rc({ amounts: amt(5000000.01) })).rw, 'drain');
['capacity', 'maxvalue', 'nte', 'estvalue', 'options', 'award', 'obligated'].forEach((k) => {
  assert.strictEqual(ev(rc({ amounts: amt(5000000, k) })).bucket, 'excluded', k + ' at exactly $5M');
  assert.strictEqual(ev(rc({ amounts: amt(5000000.01, k) })).rw, 'drain', k + ' just above $5M');
});
// a forecast range that starts at exactly $5M goes to review, never a silent pass or drop
const rng = ev(rc({ amounts: amt(5000000, 'range') })); assert.strictEqual(rng.bucket, 'review');

// ---- TOTAL fee bucket: strictly > $20M AND explicit drainage wording; drainage share never estimated
const tot = (over) => rc(Object.assign({ title: 'Engineering services for SH 36 reconstruction, Fort Bend County', desc: 'Roadway design including drainage, culvert and storm drain design.', amounts: amt(25000000, 'capacity') }, over || {}));
assert.strictEqual(R.passesTotal(20000000), false); assert.strictEqual(R.passesTotal(20000000.01), true);
assert.strictEqual(ev(tot()).rw, 'total'); assert.strictEqual(ev(tot()).bucket, 'opp');
assert.strictEqual(ev(tot({ amounts: amt(20000000, 'capacity') })).bucket, 'excluded', 'exactly $20M total fails');
assert.strictEqual(ev(tot({ amounts: amt(20000000.01, 'capacity') })).rw, 'total');
const nodr = ev(tot({ desc: 'Roadway design, structures, signing and pavement markings.' })); assert.strictEqual(nodr.bucket, 'excluded'); assert.ok(nodr.excl.indexOf('scope-does-not-name-drainage') >= 0, 'total fee without drainage wording is excluded');
['flood', 'hydraulics', 'stormwater', 'storm drain', 'culvert', 'drainage'].forEach((w) => assert.strictEqual(ev(tot({ desc: 'Roadway design with ' + w + ' analysis.' })).rw, 'total', w));
const t1 = ev(tot()); assert.ok(t1.rules.some((x) => /total fee, drainage share unknown/.test(x.t)), 'labeled total fee, drainage share unknown');
assert.strictEqual(t1.feeBasis, 'total');
// a total fee is never presented as a drainage fee: a $12M total with drainage named is NOT in the $5M drainage bucket
const t2 = ev(tot({ amounts: amt(12000000, 'capacity') })); assert.strictEqual(t2.bucket, 'excluded'); assert.strictEqual(t2.rw, null);
// no percent-of-fee or scaled drainage share exists anywhere in the roadway code
const src = fs.readFileSync(path.join(__dirname, 'roadway.js'), 'utf8'); assert.ok(!/rule[- ]of[- ]thumb|share\s*[*]|\*\s*0\.\d+\s*;\s*\/\/\s*drain/i.test(src.replace(/drainage share (?:is )?(?:unknown|not stated)/gi, '')), 'no drainage share estimation');
// the record for the total bucket carries no estimated drainage amount
const trec = R.toRecordRw(tot(), t1, AS_OF, PRICES); assert.strictEqual(trec.amt.v, 25000000); assert.strictEqual(trec.rw, 'total'); assert.ok(!('drainShare' in trec) && !('drainEstimate' in trec));

// ---- engineering only, roadway context, status
assert.strictEqual(ev(rc({ engOverride: null, naics: '237310', psc: 'Y1LB' })).bucket, 'excluded', 'construction NAICS is excluded');
assert.strictEqual(ev(rc({ title: 'Drainage design for dam spillway repair', agency: 'USACE' , roadAgency: null, desc: '' })).bucket, 'excluded', 'no roadway context');
assert.strictEqual(ev(rc({ title: 'Hydrology analysis for 8 dams, 2 canals, 10 bridges', roadAgency: null, agency: 'US Air Force' })).bucket, 'excluded', 'dam/canal titles are not roadway');
assert.strictEqual(ev(rc({ status: 'open', dates: { due: '2026-10-25' } })).bucket, 'closed', 'deadline passed goes to closed, not opp');
assert.strictEqual(ev(rc({ status: 'open', dates: { due: '2026-10-26' } })).bucket, 'opp');
assert.strictEqual(ev(rc({ status: 'awarded' })).bucket, 'award');
assert.strictEqual(ev(rc({ amounts: [{ v: 80000000, kind: 'project_cost', field: 'Construction cost' }] })).bucket, 'excluded', 'a project cost alone never passes');
// structured sources: TxDOT discipline row and Caltrans type of work
const pcl = M.normPcl({ id: 'x', url: 'u', title: 'Houston District hydraulic services', work: 'Hydraulics / Hydrological', cost: 5000000, district: 'Houston', date: '2027-03-01', extra: [] }); R.decorateRw(pcl);
assert.strictEqual(R.evaluateRoadway(pcl, { asOf: AS_OF }).bucket, 'excluded', 'TxDOT hydraulics row at exactly $5,000,000 is excluded');
pcl.amounts[0].v = 5000001; assert.strictEqual(R.evaluateRoadway(pcl, { asOf: AS_OF }).rw, 'drain');
const calt = { src: 'caltrans-lar', srcId: 'c', title: 'Stormwater Permits Regulatory Support Services', desc: '', agency: 'Caltrans', naics: '541330', status: 'upcoming', dates: {}, amounts: amt(6700000, 'estvalue'), engOverride: { level: 'strong', why: 't' } }; R.decorateRw(calt);
const ce = R.evaluateRoadway(calt, { asOf: AS_OF }); assert.strictEqual(ce.bucket, 'review', 'stormwater permit-support program goes to review'); assert.ok(ce.review.some((x) => /program/i.test(x)));
// subaward normalizer: construction subs are not engineering consultants
const subC = R.normUsaSub({ id: 's1', amount: 6008557, description: 'THE SUBCONTRACTOR WILL PERFORM TRAIL RECONSTRUCTION INCLUDING EXCAVATION AND INSTALLATION OF DRAINAGE COMPONENTS', subawardee: 'X', date: '2024-01-01', url: 'u' }, { piid: 'P', agency: 'USDA', title: '' });
assert.strictEqual(R.evaluateRoadway(subC, { asOf: AS_OF }).bucket, 'excluded');
const subE = R.normUsaSub({ id: 's2', amount: 6100000, description: 'Highway drainage and hydraulic engineering design services for I-35 corridor', subawardee: 'Y', date: '2024-01-01', url: 'u' }, { piid: 'P', agency: 'Department of Transportation', title: '' });
assert.strictEqual(R.evaluateRoadway(subE, { asOf: AS_OF }).rw, 'drain');
// text-derived drainage figures only ever reach review
const txt = ev(rc({ title: 'A-E services for SH 99 widening', desc: 'Roadway and bridge design. The drainage design is estimated at $6,500,000. Total NTE $30,000,000.', amounts: amt(30000000, 'nte') }));
assert.strictEqual(txt.bucket, 'review', 'drainage figure parsed from text goes to review'); assert.strictEqual(txt.feeBasis, 'drain-text');
assert.deepStrictEqual(R.extractDrainageAmounts('Total capacity is $30,000,000 including drainage design and roadway design.'), [], 'a total that merely mentions drainage is not a drainage figure');

// ---- cost base: stated vs estimate vs insufficient scope
const sc = C.parseScope('Widen SH 36 from 2 to 4 lanes', 'The project consists of 6.5 miles of widening from 2 to 4 lanes.');
assert.strictEqual(sc.type, 'widen'); assert.strictEqual(sc.lengthMi, 6.5); assert.strictEqual(sc.lanesAdded, 2);
const e1 = C.estimate({ type: 'widen', lengthMi: 5, lanes: 2 }, PRICES);
assert.strictEqual(e1.status, 'estimated'); assert.ok(e1.low < e1.base && e1.base < e1.high); assert.strictEqual(e1.label, 'Estimate (not from source)');
assert.ok(e1.lines.length >= 8 && e1.lines.every((l) => l.code && l.unit && l.qty > 0 && (l.price === null || l.amount === l.qty * l.price)), 'line by line quantities x unit prices');
const sumLines = e1.lines.reduce((a, l) => a + l.amount, 0); assert.ok(Math.abs(e1.scenarios.base.direct - sumLines) < 1e-6);
// editable assumptions and overrides change the result predictably
const e2 = C.estimate({ type: 'widen', lengthMi: 5, lanes: 2, trafficControlPct: 0, mobilizationPct: 0, contingencyBasePct: 0 }, PRICES); assert.ok(Math.abs(e2.base - sumLines) < 1e-6, 'with all add-ons at 0% the base equals the direct subtotal');
const e3 = C.estimate({ type: 'widen', lengthMi: 5, lanes: 2 }, PRICES, { '247-7125': 100 }); assert.ok(e3.base > e1.base, 'unit price override is applied');
const e4 = C.estimate({ type: 'widen', lengthMi: 5, lanes: 2, escalationPct: 10 }, PRICES); assert.ok(Math.abs(e4.base / e1.base - 1.1) < 1e-9, 'escalation is a plain user percentage, default 0'); assert.strictEqual(C.DEFAULTS.escalationPct, 0);
assert.ok(C.estimate({ type: 'widen', lengthMi: 10, lanes: 2 }, PRICES).base > e1.base * 1.9, 'cost scales with length');
['', null, 'bridge'].forEach((t) => assert.strictEqual(C.estimate({ type: t, lengthMi: 3, lanes: 4 }, PRICES).status, 'insufficient', 'unsupported type: ' + t));
assert.strictEqual(C.estimate({ type: 'recon', lengthMi: 0, lanes: 4 }, PRICES).status, 'insufficient');
assert.ok(/insufficient scope/.test(C.estimate({ type: 'recon', lanes: 4 }, PRICES).reason));
assert.strictEqual(C.baseFor({ title: 'Engineering services for the I-45 bridge replacement', desc: '', projectCost: null }, PRICES).status, 'insufficient', 'bridge work is never estimated');
assert.strictEqual(C.baseFor({ title: 'Roadway engineering services', desc: 'Various roadway projects in the county.', projectCost: null }, PRICES).status, 'insufficient');
const stated = C.baseFor({ title: 'Widen SH 36, 6.5 miles', desc: '', projectCost: { v: 90000000, field: 'Magnitude of construction (SAM description)' }, dates: { posted: '2026-09-01' } }, PRICES);
assert.strictEqual(stated.status, 'stated'); assert.strictEqual(stated.stated.v, 90000000); assert.strictEqual(stated.est, null, 'no estimate when the source states a cost');
const estd = C.baseFor({ title: 'Widen SH 36 from 2 to 4 lanes', desc: '6.5 miles of widening from 2 to 4 lanes', projectCost: null }, PRICES); assert.strictEqual(estd.status, 'estimated'); assert.strictEqual(estd.stated, null);

// ---- estimated cost NEVER feeds the fee filters
const big = rc({ amounts: [], title: 'Drainage design for SH 36 widening, 6.5 miles, from 2 to 4 lanes', desc: '' });
const evBig = ev(big); assert.strictEqual(evBig.bucket, 'excluded', 'no stated fee: an estimated cost cannot create one'); assert.ok(evBig.excl.indexOf('no-stated-fee') >= 0);
const huge = rc({ amounts: amt(4000000), desc: 'Widen 500 miles from 2 to 8 lanes' }); assert.strictEqual(ev(huge).bucket, 'excluded', 'a large scope does not lift a $4M drainage fee over $5M');
const withCost = rc({ amounts: [{ v: 900000000, kind: 'project_cost', field: 'c' }, { v: 4000000, kind: 'maxvalue', field: 'f' }] }); assert.strictEqual(ev(withCost).bucket, 'excluded');
const recA = R.toRecordRw(rc({ amounts: amt(6000000), title: 'Drainage design, SH 36 widening from 2 to 4 lanes, 6.5 miles' }), ev(rc({ amounts: amt(6000000), title: 'Drainage design, SH 36 widening from 2 to 4 lanes, 6.5 miles' })), AS_OF, PRICES);
assert.strictEqual(recA.cost.status, 'estimated'); assert.strictEqual(recA.amt.v, 6000000, 'the fee stays the source fee'); assert.ok(recA.cost.est.base > 6000000);
// filters work on the fee, never on the estimate
const recs = [recA, Object.assign({}, recA, { id: 'b', amt: { v: 5000001, kind: 'maxvalue', field: 'f' } }), Object.assign({}, recA, { id: 'c', amt: { v: 5000000, kind: 'maxvalue', field: 'f' } })];
assert.deepStrictEqual(R.filterRoadway(recs, { tab: 'drain', feeMin: 5000000 }).map((r) => r.id).sort(), [recA.id, 'b'].sort(), 'feeMin is strict and uses the fee, not the cost estimate');
assert.strictEqual(R.filterRoadway(recs, { tab: 'drain', feeMin: 7000000 }).length, 0, 'a $90M+ estimate does not satisfy a fee filter');
assert.strictEqual(R.filterRoadway(recs, { tab: 'total' }).length, 0);

// ---- CSV has separate stated vs estimated columns and the label
const csv = R.toCSVRoadway([recA], AS_OF); const head = csv.split('\r\n')[0].split(',');
['stated_construction_cost', 'stated_cost_field', 'estimated_cost_low_NOT_FROM_SOURCE', 'estimated_cost_base_NOT_FROM_SOURCE', 'estimated_cost_high_NOT_FROM_SOURCE', 'construction_cost_status', 'fee_basis'].forEach((h) => assert.ok(head.indexOf(h) >= 0, 'csv column ' + h));
assert.ok(/Estimate \(not from source\)/.test(csv));

// ---- dedupe works on roadway records too
const d = M.dedupe([Object.assign({}, recA, { id: 'x1', awardNum: 'A1', src: 'usaspending-rw' }), Object.assign({}, recA, { id: 'x2', awardNum: 'A1', src: 'usaspending' })]); assert.strictEqual(d.length, 1);

// ---- the built file obeys every rule
const f = path.join(__dirname, 'data', 'roadway.json');
if (fs.existsSync(f)) {
  const D = JSON.parse(fs.readFileSync(f, 'utf8')); assert.strictEqual(D.thresholds.drain, 5000000); assert.strictEqual(D.thresholds.total, 20000000);
  const ids = new Set(); D.records.forEach((x) => {
    assert.ok(!ids.has(x.id), 'unique id ' + x.id); ids.add(x.id);
    assert.ok(x.url && /^https?:\/\//.test(x.url), 'source link on ' + x.id); assert.ok(x.rules && x.rules.length, 'rules on ' + x.id);
    assert.ok(['opp', 'review', 'award', 'closed'].indexOf(x.bucket) >= 0);
    assert.ok(x.cost && ['stated', 'estimated', 'insufficient'].indexOf(x.cost.status) >= 0, 'cost status on ' + x.id);
    if (x.bucket === 'opp') { assert.ok(x.rw === 'drain' ? R.passesDrain(x.amt.v) : R.passesTotal(x.amt.v), 'strict threshold on ' + x.id); assert.ok(M.isFeeKind(x.amt.kind) && x.amt.field); assert.strictEqual(x.feeBasis, x.rw); }
    if (x.rw === 'total') assert.ok(x.rules.some((y) => /drainage share unknown/.test(y.t)), 'total label on ' + x.id);
    if (x.cost.status === 'estimated') { assert.strictEqual(x.cost.est.label, 'Estimate (not from source)'); assert.ok(!x.cost.stated); assert.ok(x.amt === undefined || x.amt.v !== x.cost.est.base); }
    if (x.cost.status === 'stated') assert.ok(x.cost.stated.field && x.cost.stated.v > 0);
    if (x.cost.status === 'insufficient') assert.ok(x.cost.est && /insufficient scope/.test(x.cost.est.reason));
  });
  assert.strictEqual(D.counts.total, D.records.length);
}
console.log('roadway lane tests passed');
