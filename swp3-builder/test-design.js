/* Tests for design.js and recommend.js. Run: node swp3-builder/test-design.js
   Every expected value below is a hand calculation (shown in the comment above the assertion). */
'use strict';
global.window = globalThis;
var assert = require('assert');
var fs = require('fs'), path = require('path');
var D = require('./design.js'), R = require('./recommend.js'), DATA = require('./data.js'), LSD = require('./lsdata.js');
require('../rational/idf-data.js');
function near(a, b, tol, msg) { assert.ok(Math.abs(a - b) <= tol, (msg || '') + ' expected ' + b + ' +/- ' + tol + ' got ' + a); }

// ---- 1 runoff ----
// i = b/(tc+d)^e with b=80, d=10, e=0.8, tc=15: 25^0.8 = e^(0.8 ln 25) = e^2.5751 = 13.1326; i = 80/13.1326 = 6.0916 in/hr; Q = 0.5 x 6.0916 x 4 = 12.183 cfs
var q = D.rational({ C: 0.5, A: 4, tc: 15, k: { b: 80, d: 10, e: 0.8 } });
near(q.i, 6.0916, 0.001); near(q.Q, 12.183, 0.005);
// tc 6 min is raised to the HDM 10-min minimum: 20^0.8 = e^(0.8 ln 20) = e^2.3966 = 10.9856, i = 7.2825, Q = 0.5 x 7.2825 x 4 = 14.565
near(D.rational({ C: 0.5, A: 4, tc: 6, k: { b: 80, d: 10, e: 0.8 } }).Q, 14.565, 0.005);
assert.strictEqual(D.rational({ C: 0.5, A: 250, tc: 20, iOverride: 4 }).warn.length, 1);   // over 200 ac warning
// override intensity 5 in/hr: Q = 0.6 x 5 x 3 = 9
near(D.rational({ C: 0.6, A: 3, tc: 20, iOverride: 5 }).Q, 9, 1e-9);
// composite C = (0.9x1 + 0.3x3)/4 = 0.45
near(D.compositeC([{ c: 0.9, a: 1 }, { c: 0.3, a: 3 }]).C, 0.45, 1e-9);
// IDF table lookup returns the row as written (county, zone, [e,b,d] per storm)
var row = window.IDF_PDS[0]; var k25 = D.idfLookup(window.IDF_PDS, row[0], row[1], 25);
assert.deepStrictEqual([k25.e, k25.b, k25.d], row[2 + 3]);
assert.strictEqual(D.idfLookup(window.IDF_PDS, row[0], row[1], 3), null);
// Curve number, CN 86, P 4.0 in: S = 1000/86 - 10 = 1.6279; Ia = 0.3256; Q = (4 - 0.3256)^2/(4 + 1.3023) = 13.5013/5.3023 = 2.5463 in; 5 ac: 2.5463/12 x 5 x 43,560 = 46,215 cu ft
var cn = D.cnRunoff({ P: 4, CN: 86, A: 5 });
near(cn.S, 1.6279, 0.0005); near(cn.Qin, 2.5463, 0.001); near(cn.volCf, 46215, 15);
assert.strictEqual(D.cnRunoff({ P: 0.2, CN: 70 }).Qin, 0);   // P below Ia: S = 4.2857, Ia = 0.857 > 0.2, no runoff
assert.deepStrictEqual(D.CN_NEW_GRADED, { A: 77, B: 86, C: 91, D: 94 });

// ---- 2 basin ----
// 12 ac drained, no rainfall data: permit 3,600 x 12 = 43,200; TxDOT (over 10 ac) 3,600 x 12 = 43,200; governs 43,200
var b12 = D.basinStorage({ A: 12 }); near(b12.requiredCf, 43200, 0.5); assert.strictEqual(b12.governs.id, 'TCEQ');
// 8 ac, permit not required: TxDOT 1,800 x 8 = 14,400 governs; if used as the permit alternative: 3,600 x 8 = 28,800 governs and a flag says permit > TxDOT
near(D.basinStorage({ A: 8 }).requiredCf, 14400, 0.5);
var b8 = D.basinStorage({ A: 8, permitBasin: true }); near(b8.requiredCf, 28800, 0.5); assert.ok(b8.flags.join(' ').indexOf('permit value') >= 0);
// 5 ac with P2 = 4.0 and CN 86 (disturbed 5 ac): permit value 46,215 (calculated) vs 3,600 default 18,000; iSWM = 46,215 + 1,000 = 47,215 when selected
var b5 = D.basinStorage({ A: 5, P2: 4, CN: 86, permitBasin: true, useISWM: true });
near(b5.items[0].cf, 46215, 15); near(b5.requiredCf, 47215, 15);
// dimensions: V = 18,000, D = 4, Z = 3, surface ratio 4:1. Solver gives Wt = 41.164, Lt = 164.655, Lb = 140.655, Wb = 17.164.
// Independent check with the prismoidal formula V = D/6 (Ab + 4 Am + At): Ab = 140.655 x 17.164 = 2,414.3; Am = (140.655 + 12)(17.164 + 12) = 4,452.0; At = 164.655 x 41.164 = 6,777.9; V = 4/6 (2,414.3 + 17,808.0 + 6,777.9) = 18,000
var bd = D.basinDims({ V: 18000, D: 4, Z: 3, A: 5 });
near(bd.Wt, 41.164, 0.01); near(bd.Lt, 164.655, 0.02); near(bd.Wb, 17.164, 0.01); near(bd.Lb, 140.655, 0.02);
near(4 / 6 * (bd.Lb * bd.Wb + 4 * (bd.Lb + 12) * (bd.Wb + 12) + bd.Lt * bd.Wt), 18000, 2);
// 50% clean-out depth d with V(d) = 9,000: V(2.4635) = 2,414.3 x 2.4635 + 157.819 x 3 x 2.4635^2 + 12 x 2.4635^3 = 5,947.6 + 2,873.4 + 179.4 = 9,000.4
near(bd.cleanoutDepth, 2.4635, 0.005);
// checks: top area 6,778 sq ft vs 1% of 5 ac = 2,178 sq ft passes; D + 1 ft freeboard = 5 ft passes; Z 3 passes
assert.ok(bd.checks.every(function (c) { return c.ok; }));
assert.ok(!D.basinDims({ V: 18000, D: 4, Z: 2, ratio: 4, A: 5, freeboard: 2 }).checks.filter(function (c) { return c.id === 'embank'; })[0].ok);   // 4 + 2 = 6 ft > 5 ft
// skimmer: Q = 18,000 / (40 x 3,600) = 0.125 cfs = 56.1 gpm; orifice at 0.2 ft head: A = 0.125 / (0.67 sqrt(2 x 32.2 x 0.2)) = 0.125/(0.67 x 3.5889) = 0.05198 sq ft = 7.485 sq in; d = sqrt(4 x 7.485/pi) = 3.087 in
var sk = D.skimmer({ V: 18000, hours: 40, head: 0.2 });
near(sk.Q, 0.125, 1e-6); near(sk.gpm, 56.10, 0.05); near(sk.orificeArea * 144, 7.485, 0.01); near(sk.orificeDiaIn, 3.087, 0.01);
assert.ok(D.skimmer({ V: 1000, hours: 30 }).notes.join(' ').indexOf('36-hour') >= 0);
// spillway: L = 20 / (3.0 x 1^1.5) = 6.667 ft; capacity of 8 ft at H = 1.0: 3 x 8 = 24 cfs
near(D.spillway({ Q: 20, H: 1 }).Lreq, 6.6667, 1e-3); var sp = D.spillway({ Q: 20, H: 1, L: 8 }); near(sp.cap, 24, 1e-9); assert.ok(sp.ok);
// riser: perimeter 12 ft, area 7 sq ft, head 1 ft: weir 3 x 6 x 1 = 18 cfs; orifice 0.67 x 3.5 x sqrt(64.4) = 0.67 x 3.5 x 8.025 = 18.82; governs weir 18
var rc = D.riserCapacity({ perimeter: 12, area: 7, head: 1 }); near(rc.Qw, 18, 1e-9); near(rc.Qo, 18.82, 0.01); assert.strictEqual(rc.governs, 'weir');

// ---- 3 fence, rock dam, check dams ----
// 0.5 ac: L >= 0.5/0.0025 = 200 ft; flow-through for 1.2 cfs, H = 2 ft: 1.2 x 448.831/(100 x 2) = 2.69 ft; so 200 governs
var sf = D.siltFence({ A: 0.5, Q: 1.2, H: 2, L: 150, flowDist: 120, slopePct: 4 });
assert.strictEqual(sf.Lmin, 200); near(sf.Lflow, 2.693, 0.001);
// with 150 ft: 0.5/1.5 = 0.333 ac/100 LF > 0.25 fails; 1.2 cfs / (150/20) = 0.16 cfs per 20 ft passes; fence passes 100 x 2 x 150/448.831 = 66.8 cfs
var cid = function (r, id) { return r.checks.filter(function (c) { return c.id === id; })[0]; };
assert.ok(!cid(sf, 'apl').ok); assert.ok(cid(sf, 'per20').ok); assert.ok(cid(sf, 'thru').ok); assert.ok(cid(sf, 'area').ok);
assert.ok(!cid(D.siltFence({ A: 3 }), 'area').ok);                 // 3 ac > 2 ac
assert.ok(!cid(D.siltFence({ A: 0.1, flowDist: 60, slopePct: 12 }), 'dist').ok);   // slope > 10%: must be under 50 ft
assert.ok(cid(D.siltFence({ A: 0.1, flowDist: 60, slopePct: 8 }), 'dist').ok);
// rock dam Type 1, h = 1.5 ft: A = 1.5 x (2 + 2 x 1.5) = 7.5 sq ft (top 2 ft, 2:1 sides: bottom 8 ft); 7.5/27 = 0.2778 cu yd/LF; W = 6 ft: 60 x 6 x 1.5/448.831 = 1.203 cfs
var rd = D.rockDam({ Q2: 1.0, width: 6, height: 1.5, velocity: 5 });
near(rd.areaFt2, 7.5, 1e-9); near(rd.cyPerLf, 0.27778, 1e-4); near(rd.cap, 1.2031, 0.001); assert.ok(rd.checks.every(function (c) { return c.ok; }));
assert.ok(!cid(D.rockDam({ Q2: 1, width: 6, height: 1.5, velocity: 9 }), 'vel').ok);   // Type 1 at 9 ft/s
// check dams: L = h/S = 1.5/0.04 = 37.5 ft; 300 ft reach: ceil(300/37.5) = 8 dams; h < depth/3 = 2/3 = 0.667 fails for 1.5 ft
var cd = D.checkDams({ h: 1.5, S: 0.04, depth: 2, reach: 300 }); near(cd.spacing, 37.5, 1e-9); assert.strictEqual(cd.count, 8); assert.ok(!cid(cd, 'third').ok);

// ---- 4 ditch lining (HEC-15 via ditch/calc.js) ----
// B = 4 ft, Z = 3, S = 0.02, n = 0.035, Q = 10 cfs. Manning at d = 0.5: A = 2.75, P = 7.162, R = 0.384, Q = 42.57 x 2.75 x 0.5282 x 0.1414 = 8.75 cfs; at d = 0.55: 10.42 cfs; interpolate d = 0.5375 ft; td = 62.4 x 0.5375 x 0.02 = 0.671 lb/sq ft
var dl = D.ditchLining({ Q: 10, S: 0.02, B: 4, Z: 3, n: 0.035, lining: 'Retardance Class C vegetation' });
near(dl.depth, 0.5375, 0.01); near(dl.td, 0.671, 0.015); assert.ok(dl.ok);                                  // tp 1.00 >= 0.671
assert.ok(!D.ditchLining({ Q: 10, S: 0.02, B: 4, Z: 3, n: 0.035, lining: 'Retardance Class D vegetation' }).ok);   // tp 0.60 < 0.671
assert.ok(!D.ditchLining({ Q: 10, S: 0.02, B: 4, Z: 3, n: 0.035, lining: 'Jute net', SF: 1 }).ok);              // 0.45 < 0.671
// the permissible-shear table matches the Ditch tool's table
var dt = fs.readFileSync(path.join(__dirname, '..', 'ditch', 'app.js'), 'utf8');
assert.ok(dt.indexOf("'Straw w/ net':1.45") >= 0 && D.TXT_TP['Straw w/ net'] === 1.45 && D.TXT_TP['Rock D50 = 12 in'] === 5.00 && D.TXT_TP['Retardance Class A vegetation'] === 3.70);

// ---- 5 slope drain, inlet ----
// 18 in. pipe: Af = pi (1.5)^2/4 = 1.7671 sq ft; slope 0.33, n 0.013: Q = 1.49/0.013 x 1.7671 x (0.375)^(2/3) x sqrt(0.33) = 114.62 x 1.7671 x 0.5200 x 0.5745 = 60.5 cfs
// inlet control with dike 1 ft: h = 1 + 0.75 = 1.75 ft; Q = 0.67 x 1.7671 x sqrt(2 x 32.2 x 1.75) = 1.1840 x 10.616 = 12.57 cfs
var sd = D.slopeDrain({ Q: 8, A: 1.2, D: 18, S: 0.33, dike: 1 });
near(sd.Qfull, 60.5, 0.3); near(sd.Qin, 12.57, 0.05); assert.ok(sd.checks.every(function (c) { return c.ok; })); near(sd.apron.length, 9, 1e-9);   // 6D = 9 ft
assert.strictEqual(sd.minD, 18);                                                       // iSWM Table 2.2: 1.2 ac needs 18 in.
assert.ok(!cid(D.slopeDrain({ A: 2, D: 18 }), 'dia').ok);                              // 2 ac needs 21 in.
assert.ok(!cid(D.slopeDrain({ A: 6, D: 30 }), 'area').ok);                             // over 5 ac
assert.ok(!cid(D.slopeDrain({ Q: 15, D: 18, dike: 1 }), 'inlet').ok);                  // 15 > 12.57
// grate inlet in a sump: P = 8, A = 4, h = 0.5: weir 3 x 4 x 0.3536 = 4.243; orifice 0.67 x 2 x 5.6745 = 7.604; capacity 4.243; with 0.5 blockage 2.121; Q = 3: bypass 0.879
var ic = D.inletCapacity({ perimeter: 8, area: 4, head: 0.5, Q: 3, clog: 0.5 });
near(D.inletCapacity({ perimeter: 8, area: 4, head: 0.5 }).cap, 4.243, 0.002); near(D.inletCapacity({ perimeter: 8, area: 4, head: 0.5 }).Qo, 7.604, 0.01); near(ic.cap, 2.1213, 0.002); near(ic.bypass, 0.8787, 0.002);

// ---- 6 RUSLE / iSWM site rating ----
// iSWM Eq 1.4 for L = 100 ft, slope 0.10: theta = 5.711 deg, sin = 0.09950, M = 0.6 (1 - e^-3.5835) = 0.5833, (100/72.6)^0.5833 = 1.2054, bracket = 65.41 x 0.009901 + 4.56 x 0.0995 + 0.065 = 1.1663; LS = 1.406 (iSWM Table 1.5 prints 1.41)
near(D.lsISWM(100, 0.10), 1.406, 0.003);
// L = 200 ft, slope 0.05: M = 0.5, (200/72.6)^0.5 = 1.6598, bracket 0.4558, LS = 0.757 (Table 1.5: 0.76)
near(D.lsISWM(200, 0.05), 0.757, 0.003);
// AH-703 high-rill table values at grid points are returned verbatim: 5% slope, 100 ft = 0.68; 10%, 200 ft = 2.34
near(D.lsTable(LSD, 'high', 100, 5), 0.68, 1e-9); near(D.lsTable(LSD, 'high', 200, 10), 2.34, 1e-9);
// midpoint in slope between 8% (1.10 at 100 ft) and 10% (1.46) is 1.28 at 9%
near(D.lsTable(LSD, 'high', 100, 9), 1.28, 1e-9);
// Z = R K LS C P = 300 x 0.34 x 1.41 x 1 x 1 = 143.82 t/ac/yr; 5 ac: 719.1 t/yr
var ru = D.rusle({ R: 300, K: 0.34, LS: 1.41, C: 1, A: 5 }); near(ru.Z, 143.82, 0.005); near(ru.ZA, 719.1, 0.05);
// controls in series Fe 0.5 and 0.9: 1 - 0.5 x 0.1 = 0.95; retained 683.1; SR 0.95 passes; Fe 0.5 alone fails the 0.70 guideline
var sr = D.siteRating({ R: 300, K: 0.34, LS: 1.41, C: 1, A: 5, fe: [0.5, 0.9] });
near(sr.feTotal, 0.95, 1e-9); near(sr.retained, 683.1, 0.1); assert.ok(sr.ok); assert.ok(!D.siteRating({ R: 300, K: 0.34, LS: 1.41, C: 1, A: 5, fe: [0.5] }).ok);

// ---- 7 exit and takeoff ----
// 3 ac disturbed, one-way: width max(14, iSWM 25) = 25 ft; length max(50, 50) = 50 ft; thickness 8 in.; SY = 25 x 50/9 = 138.9; CY = 25 x 50 x (8/12)/27 = 30.86
var ex = D.rockExit({ disturbed: 3 }); assert.strictEqual(ex.W, 25); assert.strictEqual(ex.L, 50); near(ex.SY, 138.89, 0.01); near(ex.CY, 30.86, 0.01);
// 0.5 ac two-way: width max(20, 15) = 20; length max(50, 20) = 50
var ex2 = D.rockExit({ disturbed: 0.5, twoWay: true }); assert.strictEqual(ex2.W, 20); assert.strictEqual(ex2.L, 50);
// takeoff with the repo's bid data: 1,000 LF fence install at Houston 4.052822 (n=45) + remove at 1.365711 = 4,052.82 + 1,365.71 = 5,418.53
var BC = require('../bid-cost/lookup.js'), prices = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'bid-cost', 'prices.json'), 'utf8'));
var byCode = {}; prices.rows.forEach(function (x) { byCode[x.bid_code] = x; });
var pf = function (code) { return byCode[code] ? BC.resolvePrice(byCode[code]) : null; };
D.BID.silt_fence.concat(D.BID.erosion_log, D.BID.rock_dam, D.BID.construction_exit, D.BID.inlet_protection, D.BID.basin_excavation).forEach(function (b) { assert.ok(byCode[b[0]], b[0] + ' in prices.json'); assert.strictEqual(byCode[b[0]].unit, b[2], b[0] + ' unit'); });
var tk = D.takeoff(D.quantityLines({ silt_fence: 1000 }), pf); near(tk.total, 5418.53, 0.05); assert.strictEqual(tk.lines[0].source, 'Houston');
// statewide fallback: 506-7002 (rock dam Ty 2) has no Houston price in some rows; override replaces: 100 LF x 50 = 5,000 install; remove 100 x Houston 15.4665 = 1,546.65
var tk2 = D.takeoff([{ code: '506-7002', desc: 'x', unit: 'LF', qty: 100, override: 50 }, { code: '506-7011', desc: 'y', unit: 'LF', qty: 100 }], pf); near(tk2.total, 6546.65, 0.01);
assert.strictEqual(D.takeoff([{ code: 'nope', desc: 'z', unit: 'EA', qty: 2 }], pf).missing, 1);

// ---- Recommender selection logic ----
var ids = {}; DATA.BMPS.forEach(function (b) { ids[b.id] = b; });
var expectPrimary = { steep: 'vertical_tracking', long: 'slope_drain', perimeter: 'sediment_fence', inlet: 'inlet_protection', ditch: 'erosion_blanket', culvert: 'outlet_protection', water: 'vegetated_buffer', stockpile: 'stockpile', exit: 'rock_exit', washout: 'concrete_washout', fuel: 'chemical_material', dewater: 'dewatering_controls', inwater: 'turbidity_barrier', trench: 'sediment_fence', staging: 'sediment_fence', winter: 'seeding_sod', final: 'seeding_sod' };
assert.strictEqual(R.SITUATIONS.length, 17);
R.SITUATIONS.forEach(function (s) {
  var r = R.recommend(s.id, {});
  assert.ok(r.items.length >= 3, s.id + ' has several options');
  assert.strictEqual(r.items[0].rank, 'primary'); assert.strictEqual(r.items[0].id, expectPrimary[s.id], s.id + ' primary');
  r.items.forEach(function (x) { assert.ok(ids[x.id], x.id + ' is a known BMP'); assert.ok(x.why.length > 0, x.id + ' has a WHY'); x.why.forEach(function (w) { assert.ok(DATA.BADGES[w[0]], 'badge ' + w[0]); }); });
  for (var k = 1; k < r.items.length; k++) assert.ok(r.items[k - 1].score >= r.items[k].score, 'sorted');
});
// slope 40% (2.5H:1V) on the steep slope: blanket becomes the primary (62 + 12 = 74 > 70 for tracking)
var st = R.recommend('steep', { slope: 40 }); assert.strictEqual(st.items[0].id, 'erosion_blanket');
// perimeter, 12 ac: basin becomes primary (score 95) and a >5 ac trap is dropped with a reason
var pm = R.recommend('perimeter', { area: 12 }); assert.strictEqual(pm.items[0].id, 'sediment_basin'); assert.ok(pm.excluded.some(function (e) { return e.id === 'sediment_trap'; }));
// perimeter, 3 ac: more than 2 ac to one fence run, so the trap (52 + 18) ranks above the fence (80 - 30)
var p3 = R.recommend('perimeter', { area: 3 }); assert.strictEqual(p3.items[0].id, 'sediment_trap'); assert.ok(p3.items.filter(function (x) { return x.id === 'sediment_fence'; })[0].avoid[0].indexOf('2 ac') >= 0);
// inlet on grade: ponding-type protection drops from 78 to 38 and the log (66) leads
var og = R.recommend('inlet', { inletMode: 'ongrade' }); assert.strictEqual(og.items[0].id, 'erosion_log');
// ditch flatter than 0.4%: the rock dam gets a pool-spacing warning and loses 10 points
var dd = R.recommend('ditch', { slope: 0.2 }); assert.ok(dd.items.filter(function (x) { return x.id === 'rock_filter_dam'; })[0].score === 56);
// dormant season, inactive site: blanket (70 + 14 = 84) ahead of seed (76 - 14 = 62)
var wn = R.recommend('winter', { season: 'dormant' }); assert.strictEqual(wn.items[0].id, 'erosion_blanket');
// receiving water raises the buffer on a perimeter case by 6
assert.strictEqual(R.recommend('perimeter', { recv: 'stream' }).items.filter(function (x) { return x.id === 'vegetated_buffer'; })[0].score, 60);
// one-tap add: selection map merges and keeps existing entries; take-off seeds only where a length was entered
var sel = R.applyToSelection({ a: false, rock_exit: false }, ['rock_exit', 'sediment_fence']); assert.deepStrictEqual(sel, { a: false, rock_exit: true, sediment_fence: true });
assert.deepStrictEqual(R.takeoffSeeds(['sediment_fence', 'rock_exit', 'erosion_log'], { fenceLf: 800, exitSy: 140 }), { silt_fence: 800, construction_exit: 140 });
assert.strictEqual(R.recommend('nope').error, 'Unknown situation.');
console.log('design + recommender tests ok');
