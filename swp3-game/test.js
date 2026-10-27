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

t('inlet protection: ok at forecast and the 10-yr on level 3, overtopped above 5 ac (bigger storm)', () => {
  const L = S.makeLevel(3), inl = L.types.indexOf('I');
  assert.strictEqual(S.simulate(L, [{ type: 'inlet', tile: inl }], { intensity: 1 }).evals[0].status, 'ok');
  assert.strictEqual(S.simulate(L, [{ type: 'inlet', tile: inl }]).evals[0].status, 'ok');
  assert.strictEqual(S.simulate(L, [{ type: 'inlet', tile: inl }], { intensity: 2.0 }).evals[0].status, 'overtopped');
});

t('construction exit stops tracking; seeding reduces erosion', () => {
  const L = S.makeLevel(1), a = L.types.indexOf('A');
  assert.ok(S.simulate(L, []).out.tracked > 0);
  assert.strictEqual(S.simulate(L, [{ type: 'exit', tile: a }]).out.tracked, 0);
  assert.strictEqual(S.simulate(L, [{ type: 'exit', tile: id(5, 5) }]).evals[0].status, 'wasted');
  const r0 = S.simulate(L, []), r1 = S.simulate(L, [{ type: 'seed', tile: id(6, 6) }]);
  assert.ok(r1.gen[id(6, 6)] < r0.gen[id(6, 6)]);
});

t('seeding grows in over storms: weaker when new, full 40% after 2 storms', () => {
  const L = S.makeLevel(1), i = id(6, 6), r0 = S.simulate(L, []);
  const g = age => S.simulate(L, [{ type: 'seed', tile: i, age }]).gen[i] / r0.gen[i];
  assert.ok(Math.abs(g(0) - 0.80) < 1e-9 && Math.abs(g(1) - 0.60) < 1e-9 && Math.abs(g(2) - 0.40) < 1e-9 && Math.abs(g(9) - 0.40) < 1e-9);
  assert.ok(Math.abs(S.simulate(L, [{ type: 'seed', tile: i }]).gen[i] / r0.gen[i] - 0.80) < 1e-9); // no age = just placed
});

t('sediment basin: 3,600 cf/ac sizing, low point only, undersized overtops, creek = violation', () => {
  const L = S.makeLevel(2), f = S.flowDirections(L), acc = S.flowAccumulation(L, f.dir);
  const ac = i => acc[i] * S.TILE_AC;
  let small = -1, big = -1, mid = -1;
  for (let i = 0; i < acc.length; i++) { if (L.types[i] === 'C' || L.types[i] === 'R' || L.types[i] === 'I') continue;
    if (ac(i) < 0.5 && small < 0) small = i; if (ac(i) > 3.2 && big < 0) big = i; if (ac(i) >= 1 && ac(i) <= 2.8 && mid < 0) mid = i; }
  assert.ok(small >= 0 && big >= 0 && mid >= 0);
  const ev = t => S.simulate(L, [{ type: 'basin', tile: t }], { intensity: 1 }).evals[0];
  assert.strictEqual(ev(small).status, 'wasted');
  assert.strictEqual(ev(mid).status, 'ok'); assert.ok(Math.abs(ev(mid).requiredCf - 3600 * ac(mid)) < 1e-6);
  assert.strictEqual(ev(big).status, 'undersized'); assert.ok(ev(big).requiredCf > S.RULES.basinCapCf);
  assert.ok(S.simulate(L, [{ type: 'basin', tile: mid }], { intensity: 1 }).discharge < S.simulate(L, [], { intensity: 1 }).discharge);
  const L3 = S.makeLevel(3); assert.strictEqual(S.simulate(L3, [{ type: 'basin', tile: L3.types.indexOf('C') }]).evals[0].status, 'violation');
});

t('concrete washout: needed only with concrete work, 50 ft (1 tile) from inlet/ditch/creek', () => {
  const L = plane(8, 8, 0, 1); L.types[id(2, 7, 8)] = 'C'; L.types[id(6, 3, 8)] = 'I';
  assert.strictEqual(S.simulate(L, []).out.washout, 0);
  L.concrete = true;
  assert.ok(S.simulate(L, []).out.washout > 0);
  assert.strictEqual(S.simulate(L, [{ type: 'washout', tile: id(1, 1, 8) }]).out.washout, 0);
  assert.strictEqual(S.simulate(L, [{ type: 'washout', tile: id(5, 4, 8) }]).evals[0].status, 'too close'); // diagonal to inlet
  assert.strictEqual(S.simulate(L, [{ type: 'washout', tile: id(2, 6, 8) }]).evals[0].status, 'too close'); // next to creek
  assert.ok(S.simulate(L, [{ type: 'washout', tile: id(2, 6, 8) }]).out.washout > 0);
  assert.strictEqual(S.simulate(L, [{ type: 'washout', tile: id(4, 4, 8) }]).evals[0].status, 'ok');
  assert.ok(S.score(L, []).failed.some(f => f.index === -2));
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

t('level 3 retune: inlet protection survives the surprise 10-yr; two distinct plans earn 3 stars; naive fence row does not', () => {
  const L = S.makeLevel(3), inl = L.types.indexOf('I');
  assert.strictEqual(S.simulate(L, [{ type: 'inlet', tile: inl }]).evals[0].status, 'ok');
  const base = [{ type: 'exit', tile: L.types.indexOf('A') }, { type: 'inlet', tile: inl }, { type: 'washout', tile: id(5, 5) }];
  const row = (y, x0, x1) => { const r = []; for (let x = x0; x <= x1; x++) r.push({ type: 'fence', tile: id(x, y) }); return r; };
  const naive = S.score(L, [...base, ...row(12, 3, 16)]);
  assert.ok(naive.stars < 3 && naive.failed.some(f => f.status === 'overtopped'), JSON.stringify([naive.score, naive.stars]));
  const fencesOnly = S.score(L, [...base, ...row(12, 3, 15), { type: 'fence', tile: id(16, 5) }]); // split the swale flow upslope
  const basin = S.score(L, [...base, ...row(12, 3, 15), { type: 'basin', tile: id(16, 12) }]);      // catch it in a basin
  assert.strictEqual(fencesOnly.stars, 3, JSON.stringify([fencesOnly.score, fencesOnly.failed]));
  assert.strictEqual(basin.stars, 3, JSON.stringify([basin.score, basin.failed]));
  assert.strictEqual(basin.result.evals[3 + 13].status, 'ok');
  assert.ok(S.score(L, []).stars === 0 && S.score(L, [{ type: 'inlet', tile: inl }]).stars === 0);
  // no washout on a concrete site costs the 3rd star
  assert.ok(S.score(L, [base[0], base[1], ...row(12, 3, 15), { type: 'fence', tile: id(16, 5) }]).stars < 3);
});

// ---------- picking ----------
const PK = require('./pick.js');
function geom(W, H, z) { const maxZ = Math.max(...z); return { W, H, z, ox: H * 16 + 8, oy: maxZ + 12, TW: 32, TH: 16, BASE: 10, w: (W + H) * 16 + 16, h: (W + H) * 8 + maxZ + 10 + 24 }; }
const centre = (g, i) => { const p = PK.tileTop(g, i % g.W, (i / g.W) | 0); return { x: p.x, y: p.y + g.TH / 2 }; };

t('pick: flat grid, every tile centre picks itself', () => {
  const g = geom(6, 5, new Array(30).fill(0));
  for (let i = 0; i < 30; i++) { const c = centre(g, i); assert.strictEqual(PK.pickTile(g, c.x, c.y), i); }
});
t('pick: slopes + stepped heights match a painter-order rasterizer at every pixel', () => {
  const W = 8, H = 7, z = []; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) z.push(Math.max(0, Math.round(60 - 4 * x - 6 * y + ((x * 7 + y * 3) % 5) * 3)));
  const g = geom(W, H, z), owner = new Map();
  for (let s = 0; s <= W + H - 2; s++) for (let y = 0; y < H; y++) { const x = s - y; if (x < 0 || x >= W) continue;
    for (let py = 0; py < g.h; py++) for (let px = 0; px < g.w; px++) if (PK.hitBlock(g, x, y, px + 0.5, py + 0.5)) owner.set(px + ',' + py, y * W + x); }
  let checked = 0;
  for (let py = 0; py < g.h; py++) for (let px = 0; px < g.w; px++) { const o = owner.has(px + ',' + py) ? owner.get(px + ',' + py) : -1; assert.strictEqual(PK.pickTile(g, px + 0.5, py + 0.5), o); checked++; }
  // every tile with a visible top-face centre picks itself there
  for (let i = 0; i < W * H; i++) { const c = centre(g, i); if (owner.get(Math.floor(c.x) + ',' + Math.floor(c.y)) === i) assert.strictEqual(PK.pickTile(g, c.x, c.y), i); }
  assert.ok(checked > 1000);
});
t('pick: visible side face of a raised front tile belongs to that tile, not the hidden one behind', () => {
  const z = new Array(9).fill(0); z[4] = 30; // centre of 3x3 is a tall block
  const g = geom(3, 3, z); const p = PK.tileTop(g, 1, 1);
  // point on its left side face, below the top diamond (flat projection would say tile (0,2) / (1,2) etc.)
  assert.strictEqual(PK.pickTile(g, p.x - 8, p.y + 20), 4);
  assert.strictEqual(PK.pickTile(g, p.x + 8, p.y + 30), 4);
  // a front tile on the same column, at its own top, still wins over the raised block's side
  const f = centre(g, 8); assert.strictEqual(PK.pickTile(g, f.x, f.y), 8);
  // outside the map
  assert.strictEqual(PK.pickTile(g, -50, -50), -1);
});
t('pick: client<->buffer round trip with zoom, pan, dpr, page offset and CSS != backing size', () => {
  const z = []; for (let i = 0; i < 20 * 16; i++) z.push(2 * (20 - i % 20) + 3 * (16 - ((i / 20) | 0)) + (i % 3));
  const g = geom(20, 16, z);
  for (const v of [
    { rect: { left: 0, top: 0, width: 1280, height: 800 }, viewW: 1280, viewH: 800, zoom: 1.7, panX: 0, panY: 0, dpr: 1 },
    { rect: { left: 13, top: 57, width: 1280, height: 743 }, viewW: 2560, viewH: 1486, zoom: 3.3, panX: -121, panY: 47, dpr: 2 },
    { rect: { left: 0, top: 44.5, width: 390, height: 700 }, viewW: 1170, viewH: 2100, zoom: 0.93, panX: 33.3, panY: -10, dpr: 3 },
    { rect: { left: 0, top: 0, width: 1000, height: 600 }, viewW: 1251, viewH: 751, zoom: 2.2, panX: 5, panY: 5, dpr: 1.25 } ]) {
    Object.assign(v, { geoW: g.w, geoH: g.h });
    for (let i = 0; i < 320; i += 7) { const c = centre(g, i), cl = PK.bufferToClient(c.x, c.y, v), b = PK.clientToBuffer(cl.x, cl.y, v);
      assert.ok(Math.abs(b.x - c.x) < 1e-6 && Math.abs(b.y - c.y) < 1e-6); assert.strictEqual(PK.pickTile(g, b.x, b.y), i); }
  }
});

console.log(n + ' tests passed');
