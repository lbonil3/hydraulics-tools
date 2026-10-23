const assert = require('assert');
const M = require('./model.js');
const DT = require('../ditch/calc.js');

assert.strictEqual(M.parseStation('1123+00'), 112300);
assert.strictEqual(M.formatStation(112300), '1123+00');
assert.strictEqual(M.parseStation('1123+50'), 112350);
assert.ok(Math.abs(M.gradeFromElevs(17.07, 15.80, 100) - 0.0127) < 1e-9);
assert.strictEqual(M.topWidth(2.5, 6, 5, 1), 2.5 + 11);
assert.strictEqual(M.topWidth(0, 6, 5, 2), 22);

const row = M.emptyRow();
row.B = 2.5; row.Z1 = 6; row.Z2 = 5; row.flFrom = 17.07; row.flTo = 15.80;
row.length = 100; row.Dd = 2; row.n = 0.035; row.Q = 20;
const g = M.goalSeekRow(M.computeRow(row));
assert.ok(g.flowDepth > 0 && g.flowDepth < g.Dd);
assert.ok(Math.abs(DT.qAt(M.shapeFromRow(g), {type:'fixed', n:g.n}, g.flowDepth) - 20) < 0.05);
assert.ok(g.Qfull > g.Q);
assert.ok(Math.abs(g.freeboard - (g.flTo + g.Dd - (g.flTo + g.flowDepth))) < 1e-9);

const over = M.goalSeekRow(M.computeRow(Object.assign(M.emptyRow(), {
  B: 2.5, Z1: 6, Z2: 5, flFrom: 17, flTo: 16.9, length: 100, Dd: 1, n: 0.035, Q: 500
})));
assert.strictEqual(over.flowDepth, null);
assert.ok(over.err);

assert.ok(/capacity/i.test(over.err));
const re = M.computeRow(over);
assert.strictEqual(re.flowDepth, null);
assert.ok(/capacity/i.test(re.err));

const inc = M.goalSeekRow(M.computeRow(Object.assign(M.emptyRow(), {
  B: 2.5, Z1: 6, Z2: 5, flFrom: 17, flTo: null, length: 100, Dd: 2, n: 0.035, Q: 20
})));
assert.strictEqual(inc.flowDepth, null);
assert.ok(/Incomplete/i.test(inc.err));

// Trapezoid B=4, Z=2/2, S=0.01, n=0.013, Q=50 — depth from DT must match goalSeekRow
const r2 = M.goalSeekRow(Object.assign(M.emptyRow(), {
  B: 4, Z1: 2, Z2: 2, flFrom: 10, flTo: 9, length: 100, Dd: 5, n: 0.013, Q: 50
}));
assert.ok(Math.abs(r2.flowDepth - DT.normalDepth(M.shapeFromRow(r2), {type:'fixed', n:0.013}, 50).d) < 1e-6);
assert.strictEqual(r2.passCap, true);

// (1) Clearing flowDepth drops V/freeboard (stale-depth path after Q/geom edits)
const solved = Object.assign({}, g);
assert.ok(solved.flowDepth != null && solved.V != null);
const cleared = M.computeRow(Object.assign({}, solved, { flowDepth: null }));
assert.strictEqual(cleared.flowDepth, null);
assert.strictEqual(cleared.V, null);
assert.strictEqual(cleared.freeboard, null);
assert.ok(cleared.Qfull > 0);
assert.ok(M.DEPTH_INVALIDATING.Q && M.DEPTH_INVALIDATING.B && M.DEPTH_INVALIDATING.gradePct);

// (2) Grade clear restores override false; elev-based grade returns
const overridden = M.applyGradeInput(Object.assign(M.emptyRow(), {
  flFrom: 10, flTo: 9, length: 100, Dd: 2, n: 0.035, gradeOverride: false
}), '5');
assert.strictEqual(overridden.gradeOverride, true);
assert.ok(Math.abs(overridden.grade - 0.05) < 1e-12);
const clearedGrade = M.applyGradeInput(overridden, '');
assert.strictEqual(clearedGrade.gradeOverride, false);
assert.strictEqual(clearedGrade.grade, null);
const restored = M.computeRow(clearedGrade);
assert.strictEqual(restored.gradeOverride, false);
assert.ok(Math.abs(restored.grade - 0.01) < 1e-12);

// Invalid / ≤0 override grade surfaces a clear err
const badGrade = M.computeRow(Object.assign(M.emptyRow(), {
  flFrom: 10, flTo: 9, length: 100, Dd: 2, n: 0.035, gradeOverride: true, grade: 0
}));
assert.ok(/Grade must be > 0/i.test(badGrade.err));
assert.strictEqual(badGrade.V, null);
const nullOverride = M.computeRow(Object.assign(M.emptyRow(), {
  flFrom: 10, flTo: 9, length: 100, Dd: 2, n: 0.035, gradeOverride: true, grade: null
}));
assert.ok(/Grade must be > 0/i.test(nullOverride.err));

// (4) emptyRow preserves slope, not absolute ΔFL, when prev.length ≠ new length
const prevLong = Object.assign(M.emptyRow(), {
  staFrom: '0+00', staTo: '2+00', flFrom: 20, flTo: 18, length: 200,
  Z1: 3, B: 2, Z2: 3, Dd: 2, n: 0.035
});
const next = M.emptyRow(prevLong);
assert.strictEqual(next.length, 100);
assert.strictEqual(next.flFrom, 18);
// slope = (20-18)/200 = 0.01 → flTo = 18 - 0.01*100 = 17 (not 18-2=16)
assert.ok(Math.abs(next.flTo - 17) < 1e-9);
assert.ok(Math.abs(M.gradeFromElevs(next.flFrom, next.flTo, next.length) - 0.01) < 1e-12);

console.log('ok');
