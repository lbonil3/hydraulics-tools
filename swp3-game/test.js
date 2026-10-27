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

t('sandbox: default site is playable, edits are pure, save/load round-trips, storms scale load', () => {
  const L = S.makeSandbox(null);
  assert.ok(L.sandbox && L.W === 16 && S.simulate(L, []).discharge > 0);
  const i = 5 * 16 + 5, h0 = L.heights[i];
  assert.ok(S.editTile(L, i, 'raise') && L.heights[i] === h0 + 1);
  assert.ok(S.editTile(L, i, 'lower') && S.editTile(L, i, 'lower') && L.heights[i] === h0 - 1);
  assert.ok(S.editTile(L, i, 'paint', 'D') && L.types[i] === 'D');
  assert.ok(!S.editTile(L, i, 'paint', 'D') && !S.editTile(L, i, 'paint', 'X') && !S.editTile(L, -1, 'raise'));
  L.stormKey = '25-yr';
  const saved = JSON.parse(JSON.stringify(S.sandboxData(L, [{ type: 'fence', tile: 40, round: 1 }])));
  const L2 = S.makeSandbox(saved);
  assert.deepStrictEqual(L2.types, L.types); assert.deepStrictEqual(L2.heights, L.heights);
  assert.strictEqual(L2.actual.intensity, 1.9); assert.strictEqual(saved.controls[0].tile, 40);
  const d2 = S.simulate(S.makeSandbox(Object.assign({}, saved, { storm: '2-yr' })), []).discharge;
  assert.ok(S.simulate(L2, []).discharge > d2);
  // corrupt saves fall back to the default site
  assert.strictEqual(S.makeSandbox({ W: 3, H: 3, types: [], heights: [] }).W, 16);
  assert.strictEqual(S.makeSandbox(Object.assign({}, saved, { types: saved.types.map(() => 'Z') })).types[0], 'G');
  assert.deepStrictEqual(S.STORMS.map(s => s.key), ['2-yr', '5-yr', '10-yr', '25-yr']);
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

t('pick: real terrain of levels 1-' + S.LEVEL_COUNT + ' + sandbox: painter owner == picked tile at every tile centre and 2,000 random points', () => {
  const levels = []; for (let n = 1; n <= S.LEVEL_COUNT; n++) levels.push(S.makeLevel(n)); levels.push(S.makeSandbox(null));
  for (const L of levels) {
    const W = L.W, H = L.H, mn = Math.min(...L.heights), range = Math.max(1, Math.max(...L.heights) - mn), zs = Math.min(4, 110 / range);
    const g = geom(W, H, L.heights.map(h => Math.round((h - mn) * zs)));
    const painter = (px, py) => { let o = -1; for (let s2 = 0; s2 <= W + H - 2; s2++) for (let y = 0; y < H; y++) { const x = s2 - y; if (x >= 0 && x < W && PK.hitBlock(g, x, y, px, py)) o = y * W + x; } return o; };
    let vis = 0;
    for (let i = 0; i < W * H; i++) { const c = centre(g, i), o = painter(c.x, c.y); assert.strictEqual(PK.pickTile(g, c.x, c.y), o, (L.name) + ' tile ' + i); if (o === i) vis++; }
    const rr = S.rng(7); for (let k = 0; k < 2000; k++) { const px = rr() * g.w, py = rr() * g.h; assert.strictEqual(PK.pickTile(g, px, py), painter(px, py)); }
    assert.ok(vis > W * H * 0.5, L.name + ' visible ' + vis);
  }
});
t('art.js draws exactly the block pick.js hit-tests (64x32, 96x48, 128x64 tiles, every pixel, several heights)', () => {
  const ART = require('./art.js');
  for (const q of [1, 1.5, 2]) for (const zv of [0, 7, 30]) {
    const g = { W: 1, H: 1, types: ['S'], z: [Math.round(zv * q)], ox: 40 * q, oy: Math.round((zv + 6) * q), TW: ART.TW * q, TH: ART.TH * q, BASE: ART.BASE * q };
    g.w = 80 * q; g.h = g.oy + g.TH + g.BASE + 10;
    let out = null;
    const ctx = { createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }), putImageData: img => { out = img; } };
    ART.drawTerrain(ctx, g);
    let both = 0;
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
      const drawn = out.data[(y * g.w + x) * 4 + 3] === 255, hit = !!PK.hitBlock(g, 0, 0, x + 0.5, y + 0.5);
      assert.strictEqual(drawn, hit, `z=${zv} pixel ${x},${y} drawn=${drawn} hit=${hit}`); if (hit) both++;
    }
    assert.ok(both > g.TW * g.TH / 2);
  }
});
// Same construction as game.js buildGeometry(L, q) + drawTerrain(): base-unit geometry snapped so that x q is whole pixels.
function qualityGeoms(L, q) {
  const mn = Math.min(...L.heights), range = Math.max(1, Math.max(...L.heights) - mn), zs = Math.min(8, 220 / range);
  const zB = L.heights.map(h => Math.round((h - mn) * zs * q) / q), maxZ = Math.max(...zB);
  const base = { W: L.W, H: L.H, z: zB, ox: L.H * 32 + 8, oy: Math.round((maxZ + 12) * q) / q, TW: 64, TH: 32, BASE: 20 };
  base.w = (L.W + L.H) * 32 + 16; base.h = Math.ceil(((L.W + L.H) * 16 + maxZ + 20 + 24) * q) / q;
  const pix = { W: L.W, H: L.H, types: L.types, z: zB.map(v => Math.round(v * q)), ox: Math.round(base.ox * q), oy: Math.round(base.oy * q), TW: 64 * q, TH: 32 * q, BASE: 20 * q, w: Math.round(base.w * q), h: Math.round(base.h * q) };
  return { base, pix };
}
t('quality tiers: levels 1-' + S.LEVEL_COUNT + ' + sandbox at 64x32 / 96x48 / 128x64 - art pixels == pick, base-unit pick == scaled pick', () => {
  const ART = require('./art.js');
  const levels = []; for (let n = 1; n <= S.LEVEL_COUNT; n++) levels.push(S.makeLevel(n)); levels.push(S.makeSandbox(null));
  for (const q of [1, 1.5, 2]) for (const L of levels) {
    const { base, pix } = qualityGeoms(L, q);
    for (const k of ['ox', 'oy', 'w', 'h']) assert.ok(Math.abs(base[k] * q - Math.round(base[k] * q)) < 1e-9, k + ' not whole pixels at q=' + q);
    pix.z.forEach((v, i) => assert.ok(Math.abs(base.z[i] * q - v) < 1e-9));
    let out = null; const ctx = { createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }), putImageData: img => { out = img; } };
    ART.drawTerrain(ctx, pix);
    const rr = S.rng(11 + q * 10);
    for (let k = 0; k < 1500; k++) {
      const px = Math.floor(rr() * pix.w), py = Math.floor(rr() * pix.h);
      const pp = PK.pickTile(pix, px + 0.5, py + 0.5), pb = PK.pickTile(base, (px + 0.5) / q, (py + 0.5) / q);
      assert.strictEqual(pb, pp, L.name + ' q=' + q + ' base vs pixel pick at ' + px + ',' + py);
      assert.strictEqual(out.data[(py * pix.w + px) * 4 + 3] === 255, pp >= 0, L.name + ' q=' + q + ' drawn vs pick at ' + px + ',' + py);
    }
    for (let i = 0; i < L.W * L.H; i++) { const c = PK.tileTop(base, i % L.W, (i / L.W) | 0); const pb = PK.pickTile(base, c.x, c.y + 16); assert.strictEqual(PK.pickTile(pix, (c.x) * q, (c.y + 16) * q), pb); }
  }
});

const SOLN = require('./solutions.js');
t('every level has a stored solution that earns 3 stars (levels 1-' + S.LEVEL_COUNT + ')', () => {
  for (let n = 1; n <= S.LEVEL_COUNT; n++) {
    const L = S.makeLevel(n), r = S.score(L, SOLN.controlsFor(n, L.W));
    assert.strictEqual(r.stars, 3, `level ${n}: ${r.score} ${JSON.stringify(r.failed)}`);
    assert.ok(r.result.cost <= L.budget, `level ${n} over budget`);
    SOLN.SOL[n].forEach(st => assert.ok(st.why && st.basis && Array.isArray(st.place)));
    assert.ok(SOLN.SOL[n].some(st => st.place.length));
  }
});
t('levels 4-7: two distinct 3-star plans each; naive plan falls short', () => {
  const { row, col } = SOLN;
  const P = (n, list) => { const L = S.makeLevel(n); return S.score(L, list.map(([t, x, y]) => ({ type: t, tile: y * L.W + x }))); };
  const cases = {
    4: { alt: [...col('fence', 1, 3, 14), ...col('fence', 18, 3, 14), ['exit', 9, 17], ['washout', 6, 6]], naive: [...row('fence', 14, 2, 17), ['exit', 9, 16], ['washout', 12, 10]] },
    5: { alt: [...col('dam', 13, 0, 7, 2), ...col('dam', 13, 8, 13), ...col('fence', 12, 13, 19), ['exit', 12, 4]], naive: [...col('dam', 13, 1, 19, 3), ['exit', 12, 4]] },
    6: { alt: [...row('fence', 8, 1, 18), ...row('fence', 6, 5, 14), ['exit', 13, 9]], naive: [['inlet', 2, 11], ['inlet', 10, 11], ['inlet', 17, 11], ['exit', 13, 9]] },
    7: { alt: [['basin', 9, 10], ['basin', 9, 10], ...row('fence', 14, 1, 5), ...row('fence', 14, 13, 18), ...col('fence', 8, 11, 14), ...col('fence', 10, 11, 14), ['exit', 18, 1]], naive: [...row('fence', 14, 1, 18), ['exit', 18, 1]] }
  };
  for (const n of [4, 5, 6, 7]) {
    const sol = SOLN.SOL[n].flatMap(s => s.place), alt = cases[n].alt;
    assert.notDeepStrictEqual(JSON.stringify(sol.slice().sort()), JSON.stringify(alt.slice().sort()));
    assert.strictEqual(P(n, sol).stars, 3, 'solution ' + n);
    const a = P(n, alt); assert.strictEqual(a.stars, 3, 'alt ' + n + ' ' + a.score + JSON.stringify(a.failed));
    const nv = P(n, cases[n].naive); assert.ok(nv.stars < 3, 'naive ' + n + ' got ' + nv.stars);
  }
  // level 7 rule: 10+ ac disturbed requires a working basin; one block is undersized
  const L7 = S.makeLevel(7), one = S.score(L7, [{ type: 'basin', tile: 15 * 20 + 9 }]);
  assert.ok(one.failed.some(f => f.status === 'undersized') && one.failed.some(f => f.index === -3));
});

t('BMP v5: diversion dike, erosion control blanket, pipe slope drain + outlet protection', () => {
  const L = S.makeLevel(8), W = L.W, T = (x, y) => y * W + x, sc = list => S.score(L, list.map(([t, x, y]) => ({ type: t, tile: T(x, y) })));
  const { row, col } = SOLN, sol = SOLN.SOL[8].flatMap(s => s.place);
  // EC(7)-16 size table and 5 ac limit
  assert.strictEqual(S.psdSize(0.5), 12); assert.strictEqual(S.psdSize(1.4), 18); assert.strictEqual(S.psdSize(3.5), 24); assert.strictEqual(S.psdSize(4.9), 30); assert.strictEqual(S.psdSize(5.2), 0);
  // dike: diverts clean run-on, so the drainage area at the pad low point drops below 5 ac
  const f = S.flowDirections(L), acc = S.flowAccumulation(L, f.dir), low = T(10, 9);
  const before = acc[low] * S.TILE_AC * L.actual.intensity;
  const dk = S.applyDikes(L, f, acc, row('dike', 4, 6, 14).map(([t, x, y]) => ({ type: t, tile: T(x, y) })), L.actual.intensity);
  const after = dk.acc[low] * S.TILE_AC * L.actual.intensity;
  assert.ok(before > 5 && after < 5, before + ' -> ' + after);
  const dikeOnSoil = S.simulate(L, [{ type: 'dike', tile: T(8, 6) }]).evals[0]; assert.strictEqual(dikeOnSoil.status, 'wasted');
  // pipe slope drain: overtopped without dikes, scour without riprap, ok with both
  const psdOnly = S.simulate(L, [{ type: 'psd', tile: low }]).evals[0]; assert.strictEqual(psdOnly.status, 'overtopped');
  const withDikes = row('dike', 4, 6, 14).concat([['psd', 10, 9]]);
  const r1 = sc(withDikes); assert.ok(r1.failed.some(x => x.status === 'scour'));
  const r2 = sc(withDikes.concat([['apron', 10, 11], ['exit', 14, 5]])); assert.ok(!r2.failed.length, JSON.stringify(r2.failed));
  assert.ok(r2.result.evals[9].diameter === 24);
  // gully: pipe removes it; scour adds load at the outlet
  const g0 = S.simulate(L, row('dike', 4, 6, 14).map(([t, x, y]) => ({ type: t, tile: T(x, y) }))), g1 = S.simulate(L, withDikes.concat([['apron', 10, 11]]).map(([t, x, y]) => ({ type: t, tile: T(x, y) })));
  assert.ok(g0.gen[T(10, 10)] > 3 * g1.gen[T(10, 10)], 'gully removed by pipe');
  assert.ok(S.simulate(L, withDikes.map(([t, x, y]) => ({ type: t, tile: T(x, y) }))).gen[T(10, 11)] > g1.gen[T(10, 11)] + 10, 'scour at unprotected outlet');
  assert.strictEqual(S.simulate(L, [{ type: 'apron', tile: T(3, 3) }]).evals[0].status, 'wasted');
  // blanket vs seed on a slope steeper than 3:1; silt fence there is undercut
  const steepT = T(7, 10); assert.ok(S.slopeOf(L, f.dir, steepT) > 1 / 3);
  assert.strictEqual(S.simulate(L, [{ type: 'seed', tile: steepT }]).evals[0].status, 'washed out');
  const both = S.simulate(L, [{ type: 'blanket', tile: steepT }, { type: 'seed', tile: steepT }]);
  assert.strictEqual(both.evals[1].status, 'ok'); assert.ok(both.gen[steepT] < 0.2 * S.simulate(L, []).gen[steepT]);
  assert.strictEqual(S.simulate(L, [{ type: 'fence', tile: steepT }]).evals[0].status, 'undercut');
  // each new BMP is needed for 3 stars on level 8; a second distinct plan also earns 3 stars
  const drop = type => sol.filter(p => p[0] !== type);
  for (const ty of ['dike', 'psd', 'apron', 'blanket']) { const r = sc(drop(ty)); assert.ok(r.stars < 3, 'without ' + ty + ': ' + r.stars); }
  const alt = row('dike', 4, 6, 14).concat([['psd', 10, 9], ['apron', 10, 11]], row('blanket', 9, 6, 14), row('blanket', 10, 6, 14), [6, 7, 8, 12, 13, 14].map(x => ['blanket', x, 11]), col('fence', 9, 5, 8), col('fence', 11, 5, 8), row('fence', 8, 6, 8), row('fence', 8, 12, 14), [['exit', 14, 5]]);
  const ra = sc(alt); assert.strictEqual(ra.stars, 3, ra.score + JSON.stringify(ra.failed));
  assert.notDeepStrictEqual(JSON.stringify(alt.slice().sort()), JSON.stringify(sol.slice().sort()));
  const naive = sc(row('fence', 8, 6, 14).concat(row('seed', 9, 6, 14), row('seed', 10, 6, 14), [['exit', 14, 5]])); assert.ok(naive.stars < 3);
});

t('floating turbidity curtain (level 9): water only, velocity/depth limits, closed ring, deploy first', () => {
  const L = S.makeLevel(9), W = L.W, T = (x, y) => y * W + x, cs = list => list.map(([t, x, y, r]) => ({ type: t, tile: T(x, y), round: r || 0 }));
  const sc = list => S.score(L, cs(list)), { row } = SOLN;
  const ev = list => S.simulate(L, cs(list)).evals;
  assert.strictEqual(ev([['curtain', 8, 4]])[0].status, 'wasted');            // on land
  assert.strictEqual(ev([['curtain', 8, 8]])[0].status, 'wasted');            // on the work tile
  assert.strictEqual(ev([['curtain', 8, 12]])[0].status, 'washed out');       // 6.5 ft/s channel > 5 ft/s (SS5129)
  assert.strictEqual(ev([['curtain', 11, 10]])[0].status, 'too deep');        // 9 ft hole
  assert.strictEqual(S.simulate(S.makeLevel(3), [{ type: 'curtain', tile: S.makeLevel(3).types.indexOf('C') }]).evals[0].status, 'wasted'); // no in-water work
  const ring = [['curtain', 6, 8], ['curtain', 10, 8], ['curtain', 7, 9], ['curtain', 8, 9], ['curtain', 9, 9]];
  const shore = row('fence', 7, 5, 11).concat([['exit', 8, 1]]);
  const a = sc(ring.concat(shore)); assert.strictEqual(a.stars, 3, a.score + JSON.stringify(a.failed));
  const b = sc(row('curtain', 9, 5, 11).concat([['exit', 8, 1]])); assert.strictEqual(b.stars, 3, 'whole-cove plan ' + b.score + JSON.stringify(b.failed));
  // gap -> violation + missing
  const g = sc(ring.slice(1).concat(shore)); assert.ok(g.violations > 0 && g.failed.some(f => f.index === -4) && g.stars < 3);
  // deployed after work started (placed in a later round) -> late, no 3 stars
  const late = sc(ring.map(c => c.concat([1])).concat(shore)); assert.ok(late.failed.some(f => f.status === 'late') && late.stars < 3);
  // naive plans: shore silt fence only; curtain across the fast channel; line across the deep mouth
  for (const nv of [shore, row('curtain', 11, 4, 12).concat(shore), row('curtain', 10, 5, 11).concat([['exit', 8, 1]])]) assert.ok(sc(nv).stars < 3);
  // the curtain is what earns the stars
  const sol = SOLN.SOL[9].flatMap(s => s.place); assert.ok(sc(sol.filter(p => p[0] !== 'curtain')).stars < 3);
});

console.log(n + ' tests passed');
