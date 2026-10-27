// node swp3-game/test.js
const assert = require('assert');
const S = require('./sim.js');
const id = (x, y, W = 20) => y * W + x;
let n = 0;
function t(name, fn) { fn(); n++; console.log('ok -', name); }

function plane(W, H, gx, gy) {
  const L = { W, H, types: [], heights: [], budget: 10000, actual: { intensity: 1 }, forecast: { intensity: 1 } };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { L.types.push('S'); L.heights.push(100 - gx * x - gy * y); }
  return L;
}

t('flow direction: steepest descent picks the lower neighbor', () => {
  const L = plane(5, 5, 0.5, 1.0); // falls south faster than east
  const f = S.flowDirections(L);
  assert.strictEqual(f.dir[id(2, 2, 5)], id(2, 3, 5));
  const L2 = plane(5, 5, 2.0, 1.0);
  assert.strictEqual(S.flowDirections(L2).dir[id(2, 2, 5)], id(3, 2, 5));
});

t('flow direction: boundary tile drains off-site, sinks stop', () => {
  const L = plane(5, 5, 0, 1.0);
  const f = S.flowDirections(L);
  assert.strictEqual(f.dir[id(2, 4, 5)], -1);
  assert.strictEqual(f.sink[id(2, 4, 5)], 'offsite');
  L.types[id(2, 3, 5)] = 'C';
  assert.strictEqual(S.flowDirections(L).sink[id(2, 3, 5)], 'creek');
});

t('flow accumulation counts upstream tiles', () => {
  const L = plane(4, 6, 0, 1.0);
  const f = S.flowDirections(L), acc = S.flowAccumulation(L, f.dir);
  for (let y = 0; y < 6; y++) assert.strictEqual(acc[id(1, y, 4)], y + 1);
});

t('levels: no pits; level 2 ditch collects the site', () => {
  for (let k = 1; k <= 3; k++) {
    const L = S.makeLevel(k), r = S.simulate(L, []);
    assert.strictEqual(r.sink.filter(s => s === 'pond').length, 0, 'level ' + k);
    assert.ok(r.discharge > 0);
  }
  const L2 = S.makeLevel(2), r2 = S.simulate(L2, []);
  assert.ok(r2.acc[id(15, 19)] * S.TILE_AC > 10, 'ditch drains >10 ac');
});

t('silt fence works on sheet flow (< 2 ac, TxDOT EC(1))', () => {
  const L = S.makeLevel(1);
  const c = [{ type: 'fence', tile: id(8, 14) }];
  const r = S.simulate(L, c);
  assert.strictEqual(r.evals[0].status, 'ok');
  assert.ok(r.acc[id(8, 14)] * S.TILE_AC < S.RULES.fenceMaxAc);
  assert.ok(Math.abs(r.trappedBy[0] - (r.passed[id(8, 14)] / (1 - S.RULES.fenceTrap)) * S.RULES.fenceTrap) < 1e-9);
});

t('silt fence fails in concentrated flow: ditch tile = undercut, >2 ac = overtopped', () => {
  const L = S.makeLevel(2);
  assert.strictEqual(S.simulate(L, [{ type: 'fence', tile: id(15, 10) }]).evals[0].status, 'undercut');
  const P = plane(3, 60, 0, 1.0); // 60-tile column ~3.4 ac
  P.types = P.types.map(() => 'S');
  assert.strictEqual(S.simulate(P, [{ type: 'fence', tile: id(1, 50, 3) }]).evals[0].status, 'overtopped');
  assert.strictEqual(S.simulate(P, [{ type: 'fence', tile: id(1, 10, 3) }]).evals[0].status, 'ok');
});

t('rock filter dam spacing = 18 in. / ditch slope', () => {
  const L = S.makeLevel(2); // ditch slope 1.5% -> max spacing 100 ft = 2 tiles
  const ok = S.simulate(L, [{ type: 'dam', tile: id(15, 13) }, { type: 'dam', tile: id(15, 15) }]);
  assert.ok(Math.abs(ok.evals[0].maxSpacingFt - 100) < 2);
  assert.strictEqual(ok.evals[0].status, 'ok');
  assert.strictEqual(ok.evals[1].status, 'ok'); // last dam in the chain
  const far = S.simulate(L, [{ type: 'dam', tile: id(15, 11) }, { type: 'dam', tile: id(15, 15) }]);
  assert.strictEqual(far.evals[0].status, 'spacing');
  assert.strictEqual(far.evals[0].spacingFt, 200);
});

t('rock filter dam: sheet flow = wasted, creek = violation, steep ditch = blown out', () => {
  const L = S.makeLevel(2);
  assert.strictEqual(S.simulate(L, [{ type: 'dam', tile: id(8, 8) }]).evals[0].status, 'wasted');
  const L3 = S.makeLevel(3);
  assert.strictEqual(S.simulate(L3, [{ type: 'dam', tile: id(5, 18) }]).evals[0].status, 'violation');
  const P = plane(3, 10, 0, 4.0); P.types[id(1, 5, 3)] = 'D'; P.types[id(1, 6, 3)] = 'D';
  assert.strictEqual(S.simulate(P, [{ type: 'dam', tile: id(1, 5, 3) }]).evals[0].status, 'blown out');
});

t('inlet protection: ok at forecast, overtopped by surprise 10-yr (5 ac guideline)', () => {
  const L = S.makeLevel(3), inl = L.types.indexOf('I');
  assert.strictEqual(S.simulate(L, [{ type: 'inlet', tile: inl }], { intensity: 1 }).evals[0].status, 'ok');
  assert.strictEqual(S.simulate(L, [{ type: 'inlet', tile: inl }]).evals[0].status, 'overtopped');
});

t('construction exit stops tracking; seeding reduces erosion', () => {
  const L = S.makeLevel(1), a = L.types.indexOf('A');
  assert.ok(S.simulate(L, []).out.tracked > 0);
  assert.strictEqual(S.simulate(L, [{ type: 'exit', tile: a }]).out.tracked, 0);
  assert.strictEqual(S.simulate(L, [{ type: 'exit', tile: id(5, 5) }]).evals[0].status, 'wasted');
  const r0 = S.simulate(L, []), r1 = S.simulate(L, [{ type: 'seed', tile: id(6, 6) }]);
  assert.ok(Math.abs(r1.gen[id(6, 6)] - r0.gen[id(6, 6)] * S.RULES.seedFactor) < 1e-9);
});

t('scoring: no controls is poor, a good plan earns 3 stars, violations hurt', () => {
  const L = S.makeLevel(1);
  const none = S.score(L, []);
  assert.ok(none.score < 40 && none.stars === 0);
  const plan = [];
  for (let x = 4; x < 16; x++) plan.push({ type: 'fence', tile: id(x, 14) });
  plan.push({ type: 'exit', tile: L.types.indexOf('A') });
  const good = S.score(L, plan);
  assert.ok(good.score >= 85 && good.stars === 3, JSON.stringify([good.score, good.stars]));
  const L3 = S.makeLevel(3);
  const bad = S.score(L3, [{ type: 'dam', tile: id(5, 18) }]);
  assert.ok(bad.violations === 1 && bad.failed.some(f => f.status === 'violation'));
  assert.ok(bad.score <= S.score(L3, []).score);
});

t('deterministic', () => {
  const a = S.score(S.makeLevel(3), [{ type: 'fence', tile: id(5, 12) }]);
  const b = S.score(S.makeLevel(3), [{ type: 'fence', tile: id(5, 12) }]);
  assert.strictEqual(a.score, b.score); assert.strictEqual(a.result.discharge, b.result.discharge);
});

console.log(n + ' tests passed');
