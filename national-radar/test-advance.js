// Advance-notice sources: normalizers + how the PS&E lens treats them (required from test.js). Run alone: node national-radar/test-advance.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const PS = require('./pse.js');
const A = require('./advance.js');
const AS_OF = '2026-10-26';
const fx = (n) => fs.readFileSync(path.join(__dirname, 'test-fixtures', n), 'utf8');
const ev = (c) => PS.evaluatePse(c, { asOf: AS_OF });
const rec = (c) => { const e = ev(c); return e.lens ? PS.toRecordPse(c, e, AS_OF) : null; };

// ---- helpers
assert.strictEqual(A.dateOf('11/5/2026'), '2026-11-05');
assert.strictEqual(A.dateOf('11/2026'), '2026-11', 'month-only stays month-only (no invented day)');
assert.strictEqual(A.dateOf('TBD'), null);
assert.strictEqual(A.dateOf('4th Quarter 2026'), null, 'a quarter is never turned into a date');
assert.strictEqual(A.dateOf('13/40/2026'), null);
assert.strictEqual(A.money('$24,329,395.21'), 24329395.21);
assert.strictEqual(A.money('TBD'), null);
assert.strictEqual(A.money('$0'), null);
assert.strictEqual(A.money('about $5 million'), null, 'only a plain dollar cell counts');
assert.throws(() => A.normWssc('<html><body><table><tr><td>x</td></tr></table></body></html>'), /layout changed/, 'a changed page fails loudly');

// ---- WSSC: structured projected contract value; program code decides engineering
const w = A.normWssc(fx('wssc.html'));
assert.strictEqual(w.asOf, '2026-09-17'); assert.strictEqual(w.rows, 10);
const wk = w.cands.filter((c) => !c.skip), ws = w.cands.filter((c) => c.skip);
assert.strictEqual(ws.length, 3, 'Goods and Services / Construction programs are skipped'); assert.strictEqual(wk.length, 7);
const byTitle = (list, t) => list.find((c) => c.title.indexOf(t) === 0);
const boa = byTitle(wk, 'Sanitary Sewer Evaluation Survey');
assert.strictEqual(boa.amounts[0].v, 3000000); assert.strictEqual(boa.dates.est, '2026-11-05'); assert.strictEqual(boa.advance, true); assert.strictEqual(boa.engOverride.level, 'strong');
const e1 = ev(boa); assert.strictEqual(e1.lens, 'advance', 'a $3M projected value is below the floor: advance lens, display-only');
const r1 = PS.toRecordPse(boa, e1, AS_OF); assert.strictEqual(r1.amt, null, 'sub-floor value is never r.amt'); assert.strictEqual(r1.statedValue.v, 3000000); assert.ok(r1.badges.indexOf('Stated value below $5M') >= 0);
const sso = rec(byTitle(wk, 'Sanitary Sewer Overflow'));
assert.ok(sso && sso.lens === 'fee' && sso.amt.v === 6000000, 'a stated $6M value is a normal fee-lens record (source states it)');
const flow = ev(byTitle(wk, 'Flow Monitoring')); assert.ok(flow.lens === null || flow.lens === 'fee' || flow.lens === 'advance');
const ctr = byTitle(wk, 'Construction of Automated'); assert.strictEqual(ev(ctr).lens, null, 'a construction title stays out even with an A&E program code');
const cm = byTitle(wk, 'Construction Management Services'); assert.strictEqual(ev(cm).lens, null, 'construction management is not design');
const reg = byTitle(wk, 'Regional Water Supply'); assert.strictEqual(reg.engOverride.level, 'weak', 'Professional Services (not A&E) => engineering unclear'); assert.strictEqual(ev(reg).lens, null, 'a pre-qualification (RFQu) with no design wording is not design services');
const boa0 = byTitle(wk, 'Metallic Main'); assert.strictEqual(ev(boa0).lens, null, 'an A&E program code alone is not a scope: no drainage / water / design wording => no-scope-match'); assert.ok(ev(boa0).excl.indexOf('no-scope-match') >= 0);

// ---- CDOT: no fee column at all
const c = A.normCdot(fx('codot.html')); assert.strictEqual(c.rows, 5);
c.cands.forEach((x) => assert.deepStrictEqual(x.amounts, [], 'CDOT states no fee, so no amount is ever attached'));
assert.strictEqual(c.cands[0].srcId, '26973'); assert.strictEqual(c.cands[0].dates.est, '2026-10-15'); assert.strictEqual(c.cands[0].dates.due, '2026-11-05');
assert.strictEqual(c.cands[3].dates.est, null, 'TBD stays unknown'); assert.strictEqual(c.cands[3].dates.due, null);
assert.strictEqual(ev(c.cands[0]).lens, null, 'CM, CI & MT (construction management / inspection / testing) is not design');
const des = byTitle(c.cands, 'R4 PS I-25 Segment 3B');
const rd = rec(des); assert.ok(rd && rd.lens === 'advance' && rd.amt === null && rd.statedValue === null, 'design engineering row -> Advance notice, no figure');
assert.ok(rd.badges.indexOf('Fee not stated') >= 0 && rd.badges.indexOf('Advance notice') >= 0); assert.strictEqual(rd.stage, 'forecast');
assert.ok(rd.rules.some((r) => r.k === 'advance' && /no fee/i.test(r.t)));

// ---- Louisiana DOTD: quarter text only; CE&I rows are non-design
const l = A.normLa(fx('la-dotd.html')); assert.strictEqual(l.rows, 8);
l.cands.forEach((x) => { assert.deepStrictEqual(x.amounts, []); assert.strictEqual(x.dates.est, undefined, 'a quarter is kept as text, never as a date'); });
const tiger = l.cands.find((x) => x.srcId === 'H.016206'); assert.strictEqual(tiger.dates.estText, '4th Quarter 2026'); assert.strictEqual(tiger.dates.posted, '2026-09-29');
const ceis = l.cands.filter((x) => x.nonDesign); assert.strictEqual(ceis.length, 3, 'CE&I / CEI rows flagged non-design');
ceis.forEach((x) => assert.strictEqual(ev(x).lens, null));
const rt = rec(tiger); assert.ok(rt && rt.lens === 'advance' && rt.amt === null, 'pavement design services -> advance');
assert.ok(l.cands.some((x) => x.srcId === '44-36954-H.015561'), 'odd project-number cells are cleaned');

// ---- DC OCP PASS Forecast: ArcGIS attributes; empty amount fields, FUNDINGSOURCE bucket never read
const dc = JSON.parse(fx('dc-pass.json')).features.map((f) => A.normDcPass(f.attributes));
dc.forEach((x) => { assert.deepStrictEqual(x.amounts, [], 'DC amount fields are empty; the FUNDINGSOURCE bucket is not read as a fee'); assert.strictEqual(x.state, 'DC'); assert.ok(/query\?where=OBJECTID%3D\d+/.test(x.url)); });
const sy = dc.find((x) => /RiverSmart/.test(x.title)); assert.strictEqual(sy.engOverride.level, 'strong'); assert.ok(/^20\d\d-\d\d-\d\d$/.test(sy.dates.est));
const site = dc.find((x) => /site prep/.test(x.title)); assert.strictEqual(ev(site).lens, null, 'a construction line is not design, even under an engineering commodity code'); assert.ok(!/commodity:/.test(sy.desc), 'the commodity code is not pasted into the text the rules read');
const it = dc.find((x) => x.title === 'IT Equipment'); assert.strictEqual(ev(it).lens, null, 'non-engineering commodity is excluded');

// ---- San Diego County: Socrata rows, no amounts
const sd = JSON.parse(fx('sd-forecast.json')).map((r) => A.normSdForecast(r, null)).filter(Boolean);
sd.forEach((x) => assert.deepStrictEqual(x.amounts, []));
const geo = sd.find((x) => /Geotechnical/.test(x.title)); assert.strictEqual(geo.dates.est, '2026-10-01'); assert.strictEqual(geo.state, 'CA');
const dgs = sd.find((x) => /Structural Repair|Construction Management Services for Non/.test(x.desc)); if (dgs) assert.strictEqual(ev(dgs).lens, null, 'maintenance / repair / CM lines are not design');
const lib = sd.find((x) => /Library Cards/.test(x.title)); assert.strictEqual(ev(lib).lens, null, 'library cards are not engineering');
assert.strictEqual(sd.filter((x) => x.srcId.length).length, sd.length);

// ---- the rule that matters: advance records can never be read by any fee filter
const adv = [boa, des, tiger, sy, geo].map((cn) => rec(cn)).filter((r) => r && r.lens === 'advance');
assert.ok(adv.length >= 3, 'fixtures yield advance records'); adv.forEach((r) => assert.strictEqual(r.amt, null));
const all = adv.concat([sso].filter(Boolean));
const ids = (f) => PS.filterPse(all, f, {}).map((r) => r.lens).join(',');
assert.strictEqual(ids({}), 'fee', 'default view: only fee-lens rows');
assert.strictEqual(ids({ feeMin: 0 }), 'fee', 'even a $0 threshold never pulls in advance notices');
assert.strictEqual(ids({ feeMin: 0, inclusive: true }), 'fee');
assert.strictEqual(PS.filterPse(all, { tab: 'forecast', feeMin: 0 }, {}).filter((r) => r.lens === 'advance').length, 0);
assert.strictEqual(PS.filterPse(all, { tab: 'pipeline', costMin: 0 }, {}).length, 0, 'not in Large projects');
assert.strictEqual(PS.filterPse(all, { tab: 'db' }, {}).length, 0);
assert.strictEqual(PS.filterPse(all, { tab: 'advance' }, {}).length, adv.length, 'Advance tab lists exactly them');
assert.strictEqual(PS.filterPse(all, { tab: 'advance', feeMin: 50000000 }, {}).length, adv.length, 'a fee threshold does not hide or include advance notices');
assert.strictEqual(PS.exactAtThreshold(all, { feeMin: 0 }, {}).length, 0);
const csv = PS.toCSVPse(adv, '2026-10-26'); const head = csv.split(/\r?\n/)[0].split(','); const iFee = head.indexOf('fee_value'), iAdv = head.indexOf('advance_stated_value_NOT_IN_FEE_FILTERS');
assert.ok(iFee >= 0 && iAdv >= 0, 'CSV has a separate advance column');
const rowOf = (t) => csv.split(/\r?\n/).find((r) => r.indexOf(t) >= 0).split(','); assert.strictEqual(rowOf('Sanitary Sewer Evaluation')[iFee], '', 'a display-only advance value is not in the fee_value column'); assert.strictEqual(rowOf('Sanitary Sewer Evaluation')[iAdv], '3000000');
// stage: advance notices with a past due date are closed, so they leave the advance lens
const old = Object.assign({}, des, { dates: Object.assign({}, des.dates, { due: '2026-10-01' }) }); assert.strictEqual(ev(old).lens, null, 'a response date already passed drops it');
console.log('national-radar advance-source tests passed');
