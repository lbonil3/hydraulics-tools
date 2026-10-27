// node flow-game/test.js  - Storm Designer: hydraulics, scoring, solutions and picking tests
const assert = require('assert');
const path = require('path'), fs = require('fs'), vm = require('vm');
const S = require('./sim.js');
const SOL = require('./solutions.js');
const DR = require('../drainage/calc.js');
let n = 0;
function t(name, fn) { fn(); n++; console.log('ok -', name); }
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, (msg || '') + ' ' + a + ' vs ' + b);
const run = (L, plan, opts) => S.score(L, S.presetControls(L).concat(SOL.build(L, plan)), opts || {});

// ---------- hydrology ----------
t('IDF: Harris County TxDOT EBDLKUP-2019 intensity at Tc = 10 min', () => {
  near(S.intensity(10, 10), 8.387, 0.01, 'i10');
  near(S.intensity(100, 10), 12.75, 0.02, 'i100');
  assert.ok(S.intensity(2, 10) < S.intensity(5, 10) && S.intensity(25, 10) < S.intensity(100, 10));
  assert.ok(S.intensity(10, 60) < S.intensity(10, 10));
});
t('rational method: gutter Q = i x sum(C A) + carryover from the upstream gutter (level 1)', () => {
  const L = S.makeLevel(1), r = S.simulate(L, []);
  Object.keys(r.gut).forEach(k => { const up = Object.keys(r.gut).filter(j => r.dir[j] === +k).reduce((s, j) => s + r.gut[j].Qb, 0); near(r.gut[k].Q, r.i * r.CA[k] + up, 1e-9); });
  const anyLot = L.types.indexOf('H'); assert.ok(anyLot >= 0); near(S.LAND.H.C, 0.45, 0); near(S.LAND.R.C, 0.9, 0);
  near(r.i, S.intensity(10, 10), 1e-12);
});
t('pre-development Tc: Kerby + Kirpich (rational/calc.js), never below 10 min', () => {
  const L = S.makeLevel(7), p = S.preDev(L, 25);
  assert.ok(p.tc >= 10 && p.tc < 120); near(p.Q, L.pre.C * p.i * L.pre.A, 1e-9); near(p.i, S.intensity(25, p.tc), 1e-9);
});
// ---------- streets ----------
t('spread: per-gutter flow uses drainage/calc.js DR.gutter (HEC-22 Eq 5.4, n 0.016, Sx 0.02)', () => {
  const L = S.makeLevel(1), r = S.simulate(L, []);
  const k = Object.keys(r.gut).find(k => r.gut[k].kind === 'gutter' && r.gut[k].Q > 0.5), g = r.gut[k];
  const ref = DR.gutter({ n: 0.016, Sx: 0.02, SL: g.SL }, { Q: g.Q / 2 });
  near(g.T, ref.T, 0.05, 'spread');
});
t('inlet on grade: captured + bypass = gutter flow; longer inlet bypasses less', () => {
  const L = S.makeLevel(2), W = L.W, tile = 3 * W + 9;
  const by = len => { const r = S.simulate(L, [{ type: 'inlet', tile, len }]); const e = r.evals.find(e => e.el === 'inlet'); near(e.Qi + e.Qb, e.Q, 1e-6); return e.Qb; };
  const b5 = by(5), b10 = by(10), b15 = by(15); assert.ok(b5 > b10 && b10 >= b15, [b5, b10, b15].join(','));
});
t('sag inlet takes all the flow; a sag with no inlet ponds (fail)', () => {
  const L = S.makeLevel(3), W = L.W, sag = 2 * W + 5;
  const none = S.simulate(L, []); assert.strictEqual(none.gut[sag].kind, 'sag');
  assert.ok(none.evals.some(e => e.tile === sag && e.status !== 'ok'));
  const r = S.simulate(L, [{ type: 'inlet', tile: sag, len: 15 }]), e = r.evals.find(e => e.el === 'inlet');
  near(e.Qi, e.Q, 1e-9); near(e.Qb, 0, 1e-9); assert.ok(e.sag);
});
// ---------- storm sewer ----------
t('pipe capacity (Manning full flow) and HGL from storm/calc.js', () => {
  const L = S.makeLevel(3), r = run(L, SOL.solutionPlan(3)).result, p = Object.values(r.net.pipes)[0];
  const D = p.dia / 12, A = Math.PI * D * D / 4, R = D / 4, Qf = 1.486 / 0.013 * A * Math.pow(R, 2 / 3) * Math.sqrt(p.S);
  near(p.Qfull, Qf, Qf * 0.03, 'Qfull');
  assert.ok(p.HGLup >= p.HGLdn - 1e-9, 'HGL falls downstream'); assert.ok(p.Q <= p.Qfull);
  const small = S.simulate(L, SOL.build(L, SOL.SOL[3].naive)); assert.ok(small.evals.some(e => e.status === 'overloaded'));
});
t('branched network: junction structure + bigger trunk; utility conflict fails', () => {
  const L = S.makeLevel(4), r = run(L, SOL.solutionPlan(4));
  assert.strictEqual(r.stars, 3); assert.ok(Object.values(r.result.net.nodes).some(nd => nd.kind === 'junction'));
  const W = L.W, through = SOL.solutionPlan(4).filter(p => p.type !== 'pipe' || p.dia !== 30).concat([{ type: 'pipe', pts: [[7, 2], [8, 2], [9, 2], [10, 2], [11, 2]], dia: 30 }]);
  assert.ok(run(L, through).fails.some(f => f.status === 'utility conflict'));
  void W;
});
// ---------- ditches ----------
t('ditch: shear = 62.4 d S; grass scours on the steep reach, a mat holds', () => {
  const L = S.makeLevel(5), grass = S.simulate(L, SOL.build(L, SOL.SOL[5].naive)), sol = S.simulate(L, SOL.build(L, SOL.solutionPlan(5)));
  Object.values(sol.ditches).forEach(d => { if (d.S) near(d.tau, 62.4 * d.d * d.S, 1e-9); });
  assert.ok(grass.evals.some(e => e.status === 'scoured')); assert.ok(!sol.evals.some(e => e.el === 'ditch' && e.status !== 'ok' && !e.warn));
  assert.strictEqual(S.LININGS.grass.tp, 0.6); assert.strictEqual(S.LININGS.mat.tp, 2.0); assert.strictEqual(S.LININGS.rock.tp, 2.5);
});
t('ditch capacity: depth grows with Q (DR.chanDepth, Manning trapezoid)', () => {
  const a = DR.chanDepth(2, { B: 2, z1: 3, z2: 3, n: 0.035, S: 0.01 }), b = DR.chanDepth(8, { B: 2, z1: 3, z2: 3, n: 0.035, S: 0.01 });
  assert.ok(b.d > a.d && a.d > 0);
});
// ---------- culverts ----------
t('culvert headwater (culvert/calc.js HDS-5): more barrels -> lower HW; none -> road overtops', () => {
  const L = S.makeLevel(6), hw = (d, b) => S.simulate(L, [{ type: 'culvert', tile: L.culvert.tile, dia: d, barrels: b }], { storm: 25 }).culvert.HW;
  assert.ok(hw(48, 1) > hw(48, 2) && hw(48, 2) > hw(48, 3)); assert.ok(hw(54, 2) < hw(48, 2));
  assert.ok(S.simulate(L, [], { storm: 25 }).evals.some(e => e.el === 'culvert' && e.status === 'overtopped'));
  const r = run(L, SOL.solutionPlan(6)); assert.ok(r.result.culvert.HW < L.culvert.roadEl);
});
// ---------- detention ----------
t('detention routing: post peak <= pre peak with the solution; a small pond does not; more storage lowers the release', () => {
  const L = S.makeLevel(7), sol = run(L, SOL.solutionPlan(7)).result.pond, small = run(L, SOL.SOL[7].naive).result.pond;
  assert.ok(sol.post <= sol.pre.Q + 1e-9, sol.post + ' > ' + sol.pre.Q); assert.ok(small.post > small.pre.Q);
  // level-pool: outflow peak below inflow peak, volume conserved (rate not volume)
  const ser = sol.ser, qin = Math.max(...ser.map(s => s[1])), qout = Math.max(...ser.map(s => s[2])); assert.ok(qout < qin);
  let vin = 0, vout = 0; for (let k = 1; k < ser.length; k++) { const dt = (ser[k][0] - ser[k - 1][0]) * 60; vin += ser[k][1] * dt; vout += ser[k][2] * dt; }
  assert.ok(vout > 0.6 * vin && vout <= vin * 1.05, 'volume ' + vin + ' ' + vout);
});
// ---------- scoring ----------
t('scoring: empty plan 0 stars; over budget fails; budget cut applies after round 1', () => {
  for (let k = 1; k <= S.LEVEL_COUNT; k++) assert.strictEqual(S.score(S.makeLevel(k), S.presetControls(S.makeLevel(k))).stars, 0, 'level ' + k);
  const L = S.makeLevel(6), big = [{ type: 'culvert', tile: L.culvert.tile, dia: 72, barrels: 2 }];
  assert.strictEqual(S.score(L, big).stars, 3); const cut = S.score(L, big, { round: 1 }); assert.ok(cut.fails.some(f => f.status === 'over budget'));
  const r = run(L, SOL.solutionPlan(6)); assert.ok(r.score >= 80 && r.score <= 100);
});
t('client no-build lots fail when built on (level 7)', () => {
  const L = S.makeLevel(7), nb = +Object.keys(L.nobuild)[0];
  assert.ok(S.score(L, [{ type: 'pond', tile: nb }]).fails.some(f => f.status === 'no-build lot'));
});
t('scoring v2: doing nothing scores 0 on every level; critical failures cap at 1 star; no-outfall counts once per network', () => {
  for (let k = 1; k <= S.LEVEL_COUNT; k++) { const L = S.makeLevel(k), r = S.score(L, S.presetControls(L), {}); assert.strictEqual(r.score, 0, 'L' + k + ' empty score'); assert.strictEqual(r.stars, 0, 'L' + k + ' empty stars'); }
  // L6: road overtopped (no culvert / too small) -> at most 1 star
  const L6 = S.makeLevel(6), r6 = S.score(L6, [{ type: 'culvert', tile: L6.culvert.tile, dia: 48, barrels: 1 }], {});
  assert.ok(r6.fails.some(e => e.status === 'overtopped') && r6.stars <= 1, 'overtopped road caps at 1 star, got ' + r6.stars);
  // L3: sag with no inlet ponds -> at most 1 star
  const L3 = S.makeLevel(3), W = L3.W, mid = 2 * W + 5;
  const rp = S.score(L3, [{ type: 'inlet', tile: 2 * W + 1, len: 15 }, ...[1, 2, 3, 4, 5, 6].map(y => ({ type: 'pipe', a: (y + 1) * W + 1, b: (y + 2) * W + 1, dia: 24 })), { type: 'pipe', a: 2 * W + 1, b: 3 * W + 1, dia: 24 }], {});
  assert.ok(rp.fails.some(e => e.status === 'ponded') && rp.stars <= 1, 'ponded sag caps at 1 star');
  // a 6-piece pipe run that stops one tile short of the creek: ONE "no outfall" failure, 1 star at most
  const pts = [2, 3, 4, 5, 6, 7].map(y => y * W + 5), short = [{ type: 'inlet', tile: mid, len: 15 }];
  for (let i = 0; i + 1 < pts.length; i++) short.push({ type: 'pipe', a: pts[i], b: pts[i + 1], dia: 24 });
  const rs = S.score(L3, short, {});
  assert.strictEqual(rs.fails.filter(e => e.status === 'no outfall').length, 1, 'no outfall once per network');
  assert.strictEqual(rs.fails.filter(e => e.status === 'not connected').length, 0, 'inlets in that network are not double counted');
  assert.ok(rs.stars <= 1);
  // ...and the same run extended onto the creek tile (what the pipe tool now allows) earns 3 stars
  const full = short.concat([{ type: 'pipe', a: 7 * W + 5, b: 8 * W + 5, dia: 24 }]);
  assert.strictEqual(S.score(L3, full, {}).stars, 3, 'pipe ending on the creek tile is an outfall');
});
t('scoring v2: bypass that the next inlet catches is not penalised; bypass leaving the project is', () => {
  const L = S.makeLevel(2), W = L.W, inl = (x, len) => ({ type: 'inlet', tile: 3 * W + x, len });
  const r = S.score(L, [inl(5, 10), inl(10, 10), inl(14, 15)], {});
  assert.ok(r.evals.some(e => e.el === 'inlet' && e.reason.indexOf('runs on to the next inlet') >= 0), 'upstream inlet reports its bypass');
  assert.strictEqual(r.warns.filter(e => e.status === 'bypass').length, 0, 'no warning for caught bypass');
  const r2 = S.score(L, [inl(5, 10), inl(10, 10), inl(14, 5)], {});
  assert.ok(r2.fails.some(e => e.status === 'bypass leaves'), 'bypass leaving the project still fails');
});
t('no-build: only levels with real no-build tiles have them; building on one fails in every tool', () => {
  for (let k = 1; k <= S.LEVEL_COUNT; k++) { const L = S.makeLevel(k); if (k !== 7) assert.ok(!L.nobuild || Object.keys(L.nobuild).length === 0, 'L' + k + ' should have no no-build tiles'); }
  const L = S.makeLevel(7), nb = Object.keys(L.nobuild).map(Number); assert.ok(nb.length > 0);
  const r = S.score(L, S.presetControls(L).concat([{ type: 'pond', tile: nb[0] }]), {});
  assert.ok(r.fails.some(e => e.status === 'no-build lot'), 'pond on a no-build tile fails');
});
t('player text never names a person; detention basis cites TxDOT HDM + HCFCD', () => {
  ['sim.js', 'game.js', 'solutions.js'].forEach(f => assert.ok(!/Luis/.test(fs.readFileSync(path.join(__dirname, f), 'utf8')), f));
  const L = S.makeLevel(7), e = S.score(L, S.presetControls(L).concat([{ type: 'pond', tile: L.pondSite }, { type: 'outlet', tile: L.pondSite, orif: 18, weir: 8 }]), {}).evals.find(x => x.el === 'detention' && x.status === 'peak up');
  assert.ok(e && /TxDOT HDM Ch.10 Sec.3/.test(e.basis) && /HCFCD/.test(e.basis), e && e.basis);
});
t('100-yr check (level 8): solution keeps houses dry; no culvert floods them', () => {
  const L = S.makeLevel(8), r = run(L, SOL.solutionPlan(8)); assert.ok(r.check && r.check.wet.length === 0);
  const noC = run(L, SOL.solutionPlan(8).filter(p => p.type !== 'culvert')); assert.ok(noC.fails.some(f => f.el === 'check'));
});
// ---------- solutions ----------
t('every level 1-' + S.LEVEL_COUNT + ': stored solution earns 3 stars within budget (and after a budget cut)', () => {
  for (let k = 1; k <= S.LEVEL_COUNT; k++) {
    const L = S.makeLevel(k), r = run(L, SOL.solutionPlan(k));
    assert.strictEqual(r.stars, 3, 'level ' + k + ' ' + r.score + ' ' + JSON.stringify(r.fails.map(f => f.status)));
    assert.ok(r.cost <= L.budget); if (L.budgetCut) assert.strictEqual(run(L, SOL.solutionPlan(k), { round: 1 }).stars, 3, 'cut ' + k);
    SOL.SOL[k].steps.forEach(st => assert.ok(st.why && st.basis && st.place.length));
  }
});
t('every level: a second, different plan also earns 3 stars; the naive plan does not', () => {
  for (let k = 1; k <= S.LEVEL_COUNT; k++) {
    const L = S.makeLevel(k), a = SOL.SOL[k].alt, sol = SOL.solutionPlan(k);
    assert.notStrictEqual(JSON.stringify(SOL.build(L, a)), JSON.stringify(SOL.build(L, sol)), 'alt equals solution ' + k);
    const ra = run(L, a); assert.strictEqual(ra.stars, 3, 'alt ' + k + ' ' + ra.score + JSON.stringify(ra.fails.map(f => f.status)));
    const rn = run(L, SOL.SOL[k].naive); assert.ok(rn.stars < 3, 'naive ' + k + ' got ' + rn.stars);
  }
});
t('sandbox: default site scores, culvert + pond optional, editTile edits terrain', () => {
  const L = S.makeSandbox(null); assert.ok(L.culvert && L.pondSite >= 0);
  const r = S.score(L, []); assert.ok(!r.fails.some(f => f.el === 'detention'));
  assert.ok(S.editTile(L, 5, 'raise')); assert.ok(S.editTile(L, 5, 'paint', 'P')); assert.strictEqual(L.types[5], 'P');
  const d = S.sandboxData(L, []); assert.strictEqual(S.makeSandbox(JSON.parse(JSON.stringify(d))).types[5], 'P');
});
t('suggest helper: returns the smallest pipe that is not overloaded', () => {
  const L = S.makeLevel(3), cs = SOL.build(L, SOL.solutionPlan(3)).map(c => c.type === 'pipe' ? Object.assign({}, c, { dia: 18 }) : c);
  const k = cs.findIndex(c => c.type === 'pipe'), d = S.suggest(L, cs, k); assert.ok(d >= 24, 'suggested ' + d);
});
// ---------- picking (shared swp3-game/pick.js) + flow art ----------
const PK = require('../swp3-game/pick.js');
global.SWP3Art = require('../swp3-game/art.js');
vm.runInThisContext(fs.readFileSync(path.join(__dirname, 'art.js'), 'utf8'));
const FA = global.FlowArt;
function qualityGeoms(L, q) { // same construction as game.js buildGeometry(L, q)
  const mn = Math.min(...L.heights), range = Math.max(1, Math.max(...L.heights) - mn), zs = Math.min(3, 180 / range);
  const zB = L.heights.map(h => Math.round((h - mn) * zs * q) / q), maxZ = Math.max(...zB);
  const base = { W: L.W, H: L.H, z: zB, ox: L.H * 32 + 8, oy: Math.round((maxZ + 30) * q) / q, TW: 64, TH: 32, BASE: 20 };
  base.w = (L.W + L.H) * 32 + 16; base.h = Math.ceil(((L.W + L.H) * 16 + maxZ + 20 + 40) * q) / q;
  const pix = { W: L.W, H: L.H, types: L.types, z: zB.map(v => Math.round(v * q)), ox: Math.round(base.ox * q), oy: Math.round(base.oy * q), TW: 64 * q, TH: 32 * q, BASE: 20 * q, w: Math.round(base.w * q), h: Math.round(base.h * q) };
  return { base, pix };
}
t('picking: levels 1-' + S.LEVEL_COUNT + ' + sandbox at Low/Medium/High (64x32, 96x48, 128x64): drawn pixels == pick, base pick == pixel pick, tile centres pick themselves', () => {
  const levels = []; for (let k = 1; k <= S.LEVEL_COUNT; k++) levels.push(S.makeLevel(k)); levels.push(S.makeSandbox(null));
  for (const q of [1, 1.5, 2]) for (const L of levels) {
    const { base, pix } = qualityGeoms(L, q);
    for (const k of ['ox', 'oy', 'w', 'h']) assert.ok(Math.abs(base[k] * q - Math.round(base[k] * q)) < 1e-9, k + ' not whole pixels at q=' + q);
    let out = null; const ctx = { createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }), putImageData: img => { out = img; } };
    FA.drawTerrain(ctx, pix);
    const rr = S.rng(11 + q * 10);
    for (let k = 0; k < 1500; k++) {
      const px = Math.floor(rr() * pix.w), py = Math.floor(rr() * pix.h), pp = PK.pickTile(pix, px + 0.5, py + 0.5), pb = PK.pickTile(base, (px + 0.5) / q, (py + 0.5) / q);
      assert.strictEqual(pb, pp, L.name + ' q=' + q + ' base vs pixel pick at ' + px + ',' + py);
      assert.strictEqual(out.data[(py * pix.w + px) * 4 + 3] === 255, pp >= 0, L.name + ' q=' + q + ' drawn vs pick at ' + px + ',' + py);
    }
    for (let i = 0; i < L.W * L.H; i++) { if (L.types[i] === 'C') continue; const c = PK.tileTop(base, i % L.W, (i / L.W) | 0); assert.strictEqual(PK.pickTile(base, c.x, c.y + 16), i, L.name + ' q=' + q + ': land tile ' + i + ' centre must pick itself'); }
  }
});
t('picking: client<->buffer round trip at desktop 1280x800 and iPhone 390x844 DPR 3', () => {
  const L = S.makeLevel(8), { base } = qualityGeoms(L, 2);
  for (const v of [{ rect: { left: 0, top: 60, width: 1280, height: 560 }, viewW: 1280, viewH: 560, zoom: 0.6, panX: 0, panY: 0, dpr: 1 }, { rect: { left: 0, top: 70, width: 390, height: 600 }, viewW: 1170, viewH: 1800, zoom: 0.4, panX: 12, panY: -30, dpr: 3 }]) {
    Object.assign(v, { geoW: base.w, geoH: base.h });
    for (let i = 0; i < L.W * L.H; i += 5) { const c = PK.tileTop(base, i % L.W, (i / L.W) | 0), cl = PK.bufferToClient(c.x, c.y + 16, v), b = PK.clientToBuffer(cl.x, cl.y, v);
      near(b.x, c.x, 1e-6); near(b.y, c.y + 16, 1e-6); }
  }
});
// ---------- culvert sprite: ordering/geometry regression (recording mock canvas) ----------
function recCtx() { const ops = []; let m = [1, 0, 0, 1, 0, 0], st = [], path = [], fill = '';
  const T = (x, y) => ({ x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] });
  return { ops, set fillStyle(v) { fill = v; }, get fillStyle() { return fill; }, strokeStyle: '', lineWidth: 1, globalAlpha: 1,
    save() { st.push(m.slice()); }, restore() { m = st.pop(); }, translate(x, y) { m[4] += m[0] * x + m[2] * y; m[5] += m[1] * x + m[3] * y; },
    transform(a, b, c, d, e, f) { const n = [m[0] * a + m[2] * b, m[1] * a + m[3] * b, m[0] * c + m[2] * d, m[1] * c + m[3] * d, m[0] * e + m[2] * f + m[4], m[1] * e + m[3] * f + m[5]]; m = n; },
    beginPath() { path = []; }, moveTo(x, y) { path.push(T(x, y)); }, lineTo(x, y) { path.push(T(x, y)); }, closePath() {},
    ellipse(x, y, rx, ry) { const c = T(x, y); path.push({ x: c.x, y: c.y, ell: true, rx, ry, top: T(x, y - ry), bot: T(x, y + ry) }); }, arc(x, y, r) { path.push(T(x, y)); },
    fill() { ops.push({ fill, pts: path.slice() }); }, fillRect(x, y, w, h) { ops.push({ fill, pts: [T(x, y), T(x + w, y + h)], rect: true }); }, stroke() {} };
}
t('culvert sprite: barrels sit in the near embankment face under the road, count/size match, nothing paints over the road deck', () => {
  const p = { x: 200, y: 100 }, TW2 = 32, TH2 = 16;
  for (const axis of ['u', 'v']) for (const [dia, n] of [[36, 1], [48, 3], [60, 2], [72, 1], [72, 3]]) {
    const ctx = recCtx(), drop = 18; FA.drawCulvert(ctx, p, { dia, barrels: n, axis, drop, zs: 3, prog: 1 });
    const f = FA.culvertFace(p, axis), bores = ctx.ops.filter(o => o.fill === '#14181d');
    assert.strictEqual(bores.length, n, axis + ' ' + dia + 'x' + n + ' barrel count');
    const lo = Math.min(f.a.x, f.b.x) - 0.01, hi = Math.max(f.a.x, f.b.x) + 0.01;
    let prevR = 0; bores.forEach(o => { const e = o.pts[0]; assert.ok(e.x >= lo && e.x <= hi, 'barrel inside the face width');
      const edgeY = f.a.y + (e.x - f.a.x) * (f.b.y - f.a.y) / (f.b.x - f.a.x); // road edge above this point
      assert.ok(e.top.y > edgeY + 2, 'barrel top is below the road edge (under the embankment)'); assert.ok(e.bot.y <= edgeY + drop + 0.01, 'barrel bottom at or above the bed'); prevR = e.ry; });
    // the road deck (top diamond) is never painted except the 2-px far parapet strip along the far edge
    const top = [FA.R ? null : null]; const inDeck = q => { const u = ((q.x - p.x) / TW2 + (q.y - p.y) / TH2) / 2, v = ((q.y - p.y) / TH2 - (q.x - p.x) / TW2) / 2; return u > 0.12 && u < 0.88 && v > 0.12 && v < 0.88; };
    ctx.ops.forEach(o => o.pts.forEach(q => assert.ok(!inDeck(q), axis + ' ' + dia + 'x' + n + ': culvert paints inside the road deck at ' + JSON.stringify(q))));
  }
  // bigger pipe -> bigger bore (single barrel)
  const r = d => { const c = recCtx(); FA.drawCulvert(c, p, { dia: d, barrels: 1, axis: 'u', drop: 24, zs: 3 }); return c.ops.find(o => o.fill === '#14181d').pts[0].ry; };
  assert.ok(r(36) < r(48) && r(48) < r(72), 'bore grows with diameter');
});

t('pond bodies: edge-adjacent blocks merge into one pond (L shape), diagonal blocks do not, adding/removing re-merges/splits', () => {
  const L = S.makeLevel(7), W = L.W, s0 = L.pondSite;
  const g1 = S.pondGroups(L, [s0, s0 + 1, s0 + W, s0 + 2 * W, s0 + 2 * W + 1]); assert.strictEqual(g1.length, 1, 'L shape is one pond'); assert.strictEqual(g1[0].area, 5 * 2500);
  const g2 = S.pondGroups(L, [s0, s0 + W + 1]); assert.strictEqual(g2.length, 2, 'diagonal touch is not a connection');
  assert.strictEqual(S.pondGroups(L, [s0, s0 + W + 1, s0 + 1]).length, 1, 'adding the bridging block merges them');
  const split = S.pondGroups(L, [s0, s0 + W, s0 + 2 * W].filter(i => i !== s0 + W)); assert.strictEqual(split.length, 2, 'removing the middle block splits the pond');
  assert.ok(S.pondBody(L, [s0, s0 + 1]).set[s0] && !S.pondBody(L, [s0 + 1 + W]), 'the outfall body is the one holding the flagged tile');
});
t('pond storage: only the outfall body is routed (V = N x 2500 sf x h); a separate pond is a warning, not storage', () => {
  const L = S.makeLevel(7), W = L.W, s0 = L.pondSite, base = S.presetControls(L), ol = { type: 'outlet', tile: s0, orif: 12, weir: 4 };
  const body = [s0, s0 + 1, s0 + W, s0 + W + 1].map(i => ({ type: 'pond', tile: i })), lone = { type: 'pond', tile: s0 + 3 * W };
  const a = S.score(L, base.concat(body, [ol])).result.pond, b = S.score(L, base.concat(body, [lone, ol]));
  assert.strictEqual(a.area, 4 * 2500); assert.strictEqual(b.result.pond.area, 4 * 2500, 'separate block adds no storage'); assert.strictEqual(b.result.pond.groups, 2);
  assert.ok(b.evals.some(e => e.el === 'pond' && e.status === 'separate' && e.warn), 'separate pond flagged as a warning');
  // the stage series drawn on the map is the routed stage h = V / area
  const pk = a.ser.reduce((m, r) => Math.max(m, r[3]), 0); assert.ok(pk <= a.hmax + 1e-9 && a.hmax - pk < 0.02, "sampled stage matches the routed peak");
});
t('pond routing equals the old per-block model for every stored (contiguous) plan', () => {
  const golden = { '7sol': [3, 5.2042, 2.3938], '7alt': [3, 4.2224, 3.1476], '7naive': [2, 12.9914, 3.6494], '8sol': [3, 4.0675, 1.6568], '8alt': [3, 3.0855, 0.8179] };
  Object.keys(golden).forEach(key => { const n = +key[0], k = key.slice(1), L = S.makeLevel(n), plan = k === 'sol' ? SOL.solutionPlan(n) : SOL.SOL[n][k], r = run(L, plan), p = r.result.pond;
    assert.strictEqual(p.groups, 1, key + ' is one pond'); assert.strictEqual(p.cells, plan.filter(x => x.type === 'pond').length);
    assert.strictEqual(r.stars, golden[key][0], key + ' stars'); near(p.post, golden[key][1], 1e-3, key + ' post'); near(p.hmax, golden[key][2], 1e-3, key + ' hmax'); });
});
t('one outlet per pond: sits on the rim facing the creek, nearest the tapped block; falls back to the lowest ground', () => {
  const L = S.makeLevel(7), W = L.W, s0 = L.pondSite, plan = run(L, SOL.solutionPlan(7)).result.pond.spot;
  assert.ok(plan.water && L.types[plan.out] === 'C', 'L7 outlet discharges to the creek'); assert.strictEqual(plan.edge, 'u1');
  const tiles = SOL.build(L, SOL.solutionPlan(7)).filter(c => c.type === 'pond').map(c => c.tile), body = S.pondBody(L, tiles);
  const low = S.outletSpot(L, body, s0 + 3 * W); assert.ok(low.water && Math.abs(((low.tile / W) | 0) - (((s0 + 3 * W) / W) | 0)) <= 0, 'tapping a lower block moves the outlet along the creek side');
  const Lb = S.makeSandbox(null), sb = Lb.pondSite, bb = S.pondBody(Lb, [sb, sb - 1, sb - Lb.W]), sp = S.outletSpot(Lb, bb, sb);
  assert.ok(bb.set[sp.tile] && !bb.set[sp.out], 'outlet on a perimeter edge'); const outs = [];
  bb.tiles.forEach(i => S.nb(Lb, i).forEach(j => { if (!bb.set[j] && !S.isWater(Lb.types[j])) outs.push(Lb.heights[j]); }));
  assert.ok(sp.water || Lb.heights[sp.out] <= Math.min.apply(null, outs) + 1e-9, 'no creek next to it: lowest ground outside');
});
console.log('\n' + n + ' tests passed');
