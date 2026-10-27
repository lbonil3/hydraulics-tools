/* Storm Designer - pure drainage simulation (no DOM; node-testable).
 * Hydraulics REUSE Luis's Drainage Studio code directly (same numbers as the tools):
 *   gutter spread + curb inlets ........ drainage/calc.js  (DR: HEC-22 Eq 5.4, TxDOT HDM Eq 10-1..10-13, sag Eq 7.16-7.19)
 *   storm sewer capacity, HGL, junctions storm/calc.js     (StormCalc.analyzeNetwork, suggestSizePipe, HEC-22 approx K)
 *   culvert headwater .................. culvert/calc.js   (Culvert.analyze, HDS-5 inlet/outlet control)
 *   ditch normal depth ................. drainage/calc.js  (DR.chanDepth, Manning trapezoid, HDM Eq 6-3)
 *   Tc (Kerby-Kirpich) + IDF intensity . rational/calc.js  (Tc.kerby, Tc.kirpich, Tc.intensity; HDM Eq 4-14, 4-15, 4-21)
 * Rainfall: TxDOT EBDLKUP-2019 PDS coefficients for Harris County (copied verbatim from rational/idf-data.js).
 * Every rule/value and its source: rules-sources.md. */
(function (root) {
  'use strict';
  var isNode = typeof module !== 'undefined' && module.exports;
  var DR = isNode ? require('../drainage/calc.js') : root.DR;
  var SC = isNode ? require('../storm/calc.js') : root.StormCalc;
  var CV = isNode ? (require('../culvert/calc.js').Culvert || require('../culvert/calc.js')) : root.Culvert;
  if (isNode && !root.Tc) require('../rational/calc.js');
  var TC = root.Tc || (typeof globalThis !== 'undefined' && globalThis.Tc);

  // ---------- constants ----------
  var TILE_FT = 50, TILE_AC = TILE_FT * TILE_FT / 43560, G = 32.2, GAMMA = 62.4;
  // Harris County, Zone-1, PDS [e, b, d] for 2,5,10,25,50,100-yr (EBDLKUP-2019, via rational/idf-data.js)
  var HARRIS = { 2: [0.7853943051, 66.7210130864, 12.7017785251], 5: [0.7623082354, 76.7585407171, 12.3866033567], 10: [0.7445109354, 84.7764052929, 12.3575786444],
    25: [0.7243265387, 96.1543309634, 12.5173087539], 50: [0.7088313133, 103.9212398834, 12.6201749023], 100: [0.6962711223, 113.6760484508, 13.1641522909] };
  var STORMS = [2, 5, 10, 25, 50, 100];
  function intensity(yr, tc) { var k = HARRIS[yr]; tc = Math.max(TC ? TC.TC_MIN : 10, tc); return TC ? TC.intensity({ e: k[0], b: k[1], d: k[2] }, tc) : k[1] / Math.pow(tc + k[2], k[0]); }

  // Runoff coefficient C by land use (TxDOT HDM Table 4-10 ranges; value picked inside each range)
  var LAND = {
    G: { name: 'Lawn / open (heavy soil, flat)', C: 0.15, range: 'lawns, heavy soil, flat 2%: 0.13-0.17' },
    T: { name: 'Park / trees', C: 0.15, range: 'parks, cemeteries: 0.10-0.25' },
    H: { name: 'House lot (single-family)', C: 0.45, range: 'residential single-family: 0.30-0.50' },
    P: { name: 'Parking / pavement', C: 0.90, range: 'streets, asphaltic: 0.85-0.95' },
    R: { name: 'Curbed street (curb & gutter)', C: 0.90, range: 'streets, asphaltic: 0.85-0.95' },
    Q: { name: 'Rural road (no curb)', C: 0.90, range: 'streets, asphaltic: 0.85-0.95' },
    C: { name: 'Creek', C: 1, range: 'water' },
    X: { name: 'Road over creek (culvert site)', C: 0.90, range: 'streets' }
  };
  var RULES = {
    Tc: 10,              // min, TxDOT HDM Ch.4 Sec.12 minimum Tc (rational/calc.js TC_MIN)
    Sx: 0.02, nGutter: 0.016, curbFt: 0.5, // cross slope (game), n rough asphalt (HDM Table 10-1), 6-in curb (game)
    inletA: 3, inletW: 2, inletH: 0.5,     // TxDOT PCO/CGT: 3-in depression over 2 ft, 6-in throat (drainage/txdot-inlets.js)
    QbTarget: 0.5,       // cfs, Luis's curb inlet bypass target
    minSL: 0.002,        // game: flattest gutter slope used in the gutter equations
    coverFt: 3.0,        // TxDOT HDM Ch.10 Sec.2: min cover 3.0 ft where possible
    minPipeS: 0.001, maxOutS: 0.02, nPipe: 0.013, // game slopes; RCP n 0.013 (storm/ tool default)
    vMin: 3, vMax: 12,   // fps, TxDOT HDM Ch.10 Sec.2 (f)
    ditch: { B: 2, z: 3, depth: 2, fb: 0.5 }, // game standard section; 0.5 ft freeboard (Luis's ditch-table check)
    pondDepth: 4, pondWeirZ: 3, orifC: 0.6, weirC: 3.0, // game pond geometry, orifice/weir coefficients (HEC-22 Ch.10 typical)
    lotPad: 1.0,         // game: house pads 1 ft above the gutter/ditch
    culvLen: 80, culvN: 0.012
  };
  var LININGS = {
    grass: { name: 'Grass (Retardance D)', tp: 0.60, n: 0.035, cost: 300, costNote: 'game cost (seeding)' },
    mat: { name: 'Synthetic mat', tp: 2.00, n: 0.030, cost: 1290, costNote: 'Item 169 SOIL RETENTION BLANKETS (CL 2)(TY E) $6/SY x 81 SY + seeding' },
    rock: { name: 'Rock riprap D50 6 in', tp: 2.50, n: 0.040, cost: 7600, costNote: 'Item 432 RIPRAP (STONE PROTECTION)(12 IN) $282/CY x 27 CY' },
    conc: { name: 'Concrete lining', tp: Infinity, n: 0.015, cost: 7960, costNote: 'Item 432 RIPRAP (CONC)(4 IN) $884/CY x 9 CY' }
  };
  var PIPE_IN = [18, 24, 30, 36, 42, 48, 54, 60, 72];
  var RCP = { 18: 122, 24: 156, 30: 162, 36: 253, 42: 348, 48: 357, 54: 415, 60: 429, 72: 661 }; // Item 464 RC PIPE (CL III), statewide low-bid avg $/LF
  var COST = {
    inlet5: 8557 * 2,   // pair; Item 465 INLET (COMPL)(PCO)(5FT)(NONE) statewide avg $8,557 each
    inletExt: 2500 * 2, // game cost per 4.5-ft extension (pair)
    manhole: 7939,      // Item 465 MANH (COMPL)(PRM)(48IN) statewide avg
    ditchExc: 800,      // Item 110 EXCAVATION (CHANNEL) $27/CY x 29.6 CY per 50 ft of standard ditch
    pond: 10000,        // Item 110 EXCAVATION (CHANNEL) $27/CY x 370 CY per pond block
    outlet: 8000,       // game cost (outlet structure)
    headwall: 13273     // Item 466 HEADWALL (CH-PW-0)(24 IN) statewide avg, each end
  };
  var INLET_LEN = { 5: 5, 10: 9.5, 15: 14 }; // TxDOT PCO main 5 ft (+1 ext 9.5, +2 ext 14) (drainage/txdot-inlets.js)
  function inletCost(len) { return COST.inlet5 + (len === 15 ? 2 : len === 10 ? 1 : 0) * COST.inletExt; }
  function pipeCost(dia) { return RCP[dia] * TILE_FT; }
  function culvertCost(dia, n) { return RCP[dia] * RULES.culvLen * n + 2 * COST.headwall; }
  function ditchCost(lin) { return COST.ditchExc + LININGS[lin || 'grass'].cost; }
  function controlCost(c) {
    if (c.type === 'inlet') return inletCost(c.len);
    if (c.type === 'pipe') return pipeCost(c.dia);
    if (c.type === 'ditch') return ditchCost(c.lining);
    if (c.type === 'culvert') return culvertCost(c.dia, c.barrels || 1);
    if (c.type === 'pond') return COST.pond;
    if (c.type === 'outlet') return COST.outlet;
    return 0;
  }

  // ---------- helpers ----------
  // game layout: lay each pipe at least at the slope that gives 3 ft/s flowing full (HDM 3 fps minimum velocity)
  function selfCleanS(D) { var R = D / 4; return Math.max(RULES.minPipeS, Math.pow(RULES.vMin * RULES.nPipe / (1.486 * Math.pow(R, 2 / 3)), 2)); }
  function rng(seed) { var s = seed >>> 0 || 1; return function () { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; }; }
  function nb(L, i) { var W = L.W, x = i % W, y = (i / W) | 0, o = []; if (y > 0) o.push(i - W); if (x < W - 1) o.push(i + 1); if (y < L.H - 1) o.push(i + W); if (x > 0) o.push(i - 1); return o; }
  function onEdge(L, i) { var x = i % L.W, y = (i / L.W) | 0; return x === 0 || y === 0 || x === L.W - 1 || y === L.H - 1; }
  function isWater(t) { return t === 'C' || t === 'X'; }
  function isRoad(t) { return t === 'R'; }
  function index(controls) {
    var ix = { inlet: {}, ditch: {}, pond: {}, culvert: {}, outlet: null, pipes: [] };
    controls.forEach(function (c, k) {
      if (c.type === 'pipe') ix.pipes.push({ a: c.a, b: c.b, dia: c.dia, k: k });
      else if (c.type === 'outlet') ix.outlet = Object.assign({ k: k }, c);
      else ix[c.type][c.tile] = Object.assign({ k: k }, c);
    });
    return ix;
  }

  // ---------- surface routing ----------
  // dir[i]: next tile for surface water; kind[i]: what the tile is in the flow network.
  function route(L, ix) {
    var n = L.W * L.H, dir = new Array(n), kind = new Array(n), h = L.heights, t = L.types, i;
    for (i = 0; i < n; i++) {
      dir[i] = -1;
      if (isWater(t[i])) { kind[i] = 'creek'; continue; }
      if (ix.pond[i]) { kind[i] = 'pond'; continue; }
      var ns = nb(L, i), best = -1, bd = 0;
      if (isRoad(t[i])) { // gutter runs along the street to the lowest lower street neighbour
        kind[i] = 'gutter';
        ns.forEach(function (j) { if (isRoad(t[j]) && h[i] - h[j] > bd + 1e-9) { bd = h[i] - h[j]; best = j; } });
        if (best >= 0) { dir[i] = best; continue; }
        var rn = ns.filter(function (j) { return isRoad(t[j]); }).length;
        kind[i] = rn >= 2 ? 'sag' : 'end';
        if (kind[i] === 'end') { ns.forEach(function (j) { if (!isRoad(t[j]) && h[i] - h[j] > bd - 1e-9 && (isWater(t[j]) || h[j] < h[i])) { bd = h[i] - h[j]; best = j; } }); dir[i] = best; }
        continue;
      }
      if (ix.ditch[i]) { // ditch: steepest to another ditch / creek / pond (not up the bank)
        kind[i] = 'ditch';
        ns.forEach(function (j) { if ((ix.ditch[j] || isWater(t[j]) || ix.pond[j]) && h[i] - h[j] >= bd - 1e-9 && h[j] <= h[i] + 1e-9) { var d = h[i] - h[j] + (isWater(t[j]) || ix.pond[j] ? 0.01 : 0); if (d > bd || best < 0) { bd = d; best = j; } } });
        dir[i] = best; if (best < 0) kind[i] = 'pit';
        continue;
      }
      // overland: steepest descent; ties favour ditch / pond / street / creek (they are the low edge)
      kind[i] = 'land';
      ns.forEach(function (j) { var d = h[i] - h[j] + (ix.ditch[j] || ix.pond[j] ? 0.02 : isRoad(t[j]) ? 0.01 : 0); if (d > bd + 1e-9) { bd = d; best = j; } });
      if (t[i] === 'Q') { ns.forEach(function (j) { if (ix.ditch[j] && h[j] <= h[i] + 1e-9) best = j; }); }
      dir[i] = best;
      if (best < 0) kind[i] = onEdge(L, i) ? 'offsite' : 'pit';
    }
    return { dir: dir, kind: kind };
  }
  function topoOrder(dir) { // upstream first
    var n = dir.length, indeg = new Array(n).fill(0), q = [], out = [], i;
    for (i = 0; i < n; i++) if (dir[i] >= 0) indeg[dir[i]]++;
    for (i = 0; i < n; i++) if (!indeg[i]) q.push(i);
    while (q.length) { var a = q.shift(); out.push(a); var b = dir[a]; if (b >= 0 && --indeg[b] === 0) q.push(b); }
    return out;
  }

  // ---------- design storm evaluation ----------
  // Returns everything the report and the animation need for ONE storm.
  function simulate(L, controls, opts) {
    opts = opts || {}; var yr = opts.storm || L.design;
    var ix = index(controls), R = route(L, ix), dir = R.dir, kind = R.kind, n = dir.length, t = L.types, h = L.heights;
    var i10 = intensity(yr, RULES.Tc), evals = [], order = topoOrder(dir);
    var CA = new Array(n).fill(0), roadCA = new Array(n).fill(0); // C*A (ac) arriving at each tile (surface)
    for (var k = 0; k < order.length; k++) {
      var i = order[k]; if (kind[i] === 'creek') continue;
      var own = (ix.pond[i] ? 1 : LAND[t[i]].C) * TILE_AC; if (L.offsite && L.offsite[i]) own += L.offsite[i];
      CA[i] += own; if (t[i] === 'R' || t[i] === 'Q' || t[i] === 'P') roadCA[i] += own;
      if (kind[i] === 'gutter' || kind[i] === 'sag' || kind[i] === 'end') continue; // streets handled below
      var j = dir[i]; if (j >= 0) { CA[j] += CA[i]; roadCA[j] += roadCA[i]; }
    }
    // ---- streets: gutter spread, inlets on grade / in sag, carryover (bypass) down the street ----
    var gut = {}, toNet = {}, Tall = L.Tallow || 12, carry = new Array(n).fill(0), sumIn = 0;
    var streetOrder = order.filter(function (i) { return kind[i] === 'gutter' || kind[i] === 'sag' || kind[i] === 'end'; });
    var spreadBad = [];
    streetOrder.forEach(function (i) {
      var Qloc = i10 * CA[i], Q = Qloc + carry[i], q = Q / 2; // crowned street: two gutters share the flow (game)
      var upR = streetOrder.filter(function (j) { return dir[j] === i; })[0];
      var SL = Math.max(RULES.minSL, kind[i] === 'gutter' ? (h[i] - h[dir[i]]) / TILE_FT : kind[i] === 'end' && upR != null ? (h[upR] - h[i]) / TILE_FT : RULES.minSL);
      var g = { type: 'uniform', n: RULES.nGutter, SL: SL, Sx: RULES.Sx };
      var inl = ix.inlet[i], rec = { tile: i, Q: Q, SL: SL, kind: kind[i] };
      if (L.autoInlets) { var gs0 = q > 1e-6 ? DR.gutter(g, { Q: Math.min(q, 1.2) }) : { T: 0, d: 0 }; rec.T = gs0.T; rec.d = gs0.d; rec.Qi = Q; rec.Qb = 0; rec.auto = true; gut[i] = rec; toNet[i] = Q; sumIn += Q; return; } // existing street system (designed by others)
      if (kind[i] === 'sag') {
        if (inl) { var sd = DR.curbSagDepth(q, { L: INLET_LEN[inl.len], h: RULES.inletH, a: RULES.inletA, W: RULES.inletW, throat: 'vertical' });
          rec.d = Math.max(0, sd.d); rec.T = rec.d / RULES.Sx; rec.Qi = Q; rec.Qb = 0; rec.regime = sd.regime;
        } else { rec.d = q > 0.05 ? 1.0 + q * 0.05 : 0; rec.T = q > 0.05 ? 99 : 0; rec.Qi = 0; rec.Qb = 0; rec.ponded = q > 0.05; }
      } else {
        var s = q > 1e-6 ? DR.gutter(g, { Q: q }) : { T: 0, d: 0, V: 0 };
        rec.T = s.T; rec.d = s.d; rec.V = s.V;
        if (inl) { var cg = DR.curbGrade(g, q, { L: INLET_LEN[inl.len], a: RULES.inletA, W: RULES.inletW, method: 'TxDOT' }); rec.Qi = 2 * cg.Qi; rec.Qb = 2 * cg.Qb; rec.LT = cg.LT; rec.E = cg.E; }
        else { rec.Qi = 0; rec.Qb = Q; }
        if (kind[i] === 'gutter') carry[dir[i]] += rec.Qb; else rec.leaves = rec.Qb;
      }
      gut[i] = rec; if (rec.Qi > 0) { toNet[i] = rec.Qi; sumIn += rec.Qi; }
      if (rec.T > Tall + 1e-9 || rec.d > RULES.curbFt + 1e-9) spreadBad.push(i);
    });
    // street evaluations (one per offending tile group, plus every inlet)
    var badSet = {}; spreadBad.forEach(function (i) { badSet[i] = true; });
    spreadBad.forEach(function (i) {
      var r = gut[i], up = streetOrder.some(function (j) { return dir[j] === i && badSet[j] && !ix.inlet[j]; });
      if (up) return; // one report per run of over-spread street
      if (r.ponded) evals.push({ el: 'street', tile: i, status: 'ponded', reason: 'Low point (sag) with no inlet: water stands across the lanes. Inlets should be placed at all low points.', basis: 'TxDOT HDM Ch.10 Sec.4 Ponding: "Inlets should be placed at all low points in the roadway."' });
      else if (r.d > RULES.curbFt + 1e-9) evals.push({ el: 'street', tile: i, status: 'over curb', reason: 'Gutter depth ' + r.d.toFixed(2) + ' ft is over the 6-in curb (' + r.Q.toFixed(1) + ' cfs here).', basis: 'TxDOT HDM Ch.10 Sec.4 Ponding: depth of flow should not exceed the curb height.' });
      else evals.push({ el: 'street', tile: i, status: 'spread', reason: 'Spread ' + r.T.toFixed(1) + ' ft is wider than the ' + Tall + ' ft allowed (' + (r.Q / 2).toFixed(2) + ' cfs per gutter). Add or move an inlet upstream.', basis: L.TallowBasis || 'TxDOT HDM Ch.10 Sec.4 Ponding: limit ponding to the width of the outer lane (major highways).' });
    });
    Object.keys(ix.inlet).forEach(function (key) {
      var i = +key, c = ix.inlet[i], r = gut[i];
      if (!r) { evals.push({ el: 'inlet', k: c.k, tile: i, status: 'wasted', reason: 'Curb inlets go on a curbed street tile.', basis: 'game rule' }); return; }
      var e = { el: 'inlet', k: c.k, tile: i, status: 'ok', Q: r.Q, Qi: r.Qi, Qb: r.Qb, T: r.T, d: r.d, sag: r.kind === 'sag',
        reason: (r.kind === 'sag' ? 'Sag inlet: takes all ' + r.Q.toFixed(2) + ' cfs; depth ' + r.d.toFixed(2) + ' ft, spread ' + r.T.toFixed(1) + ' ft.' : 'On grade: catches ' + r.Qi.toFixed(2) + ' of ' + r.Q.toFixed(2) + ' cfs (L ' + INLET_LEN[c.len] + ' ft vs ' + (r.LT || 0).toFixed(1) + ' ft for 100%), bypass ' + r.Qb.toFixed(2) + ' cfs.'),
        basis: r.kind === 'sag' ? 'HEC-22 Eq 7.16-7.19 / TxDOT HDM Eq 10-17 (drainage/calc.js curbSagDepth)' : 'TxDOT HDM Eq 10-5..10-13 curb inlet on grade (drainage/calc.js curbGrade, TxDOT method)' };
      if (r.kind !== 'sag' && r.Qb > RULES.QbTarget + 1e-9) { e.status = 'bypass'; e.warn = true; e.reason += ' Over Luis\u2019s 0.5 cfs bypass target: the next inlet downstream must pick it up.'; e.basis = 'Luis\u2019s TxDOT curb inlet approach: trial and error until bypass is under about 0.5 cfs.'; }
      evals.push(e);
    });
    streetOrder.forEach(function (i) { var r = gut[i]; if (r.kind === 'end' && r.leaves > RULES.QbTarget + 1e-9) evals.push({ el: 'street', tile: i, status: 'bypass leaves', reason: r.leaves.toFixed(2) + ' cfs runs past the last inlet and off the project (target under 0.5 cfs).', basis: 'Luis\u2019s TxDOT curb inlet approach: bypass under about 0.5 cfs; TxDOT HDM Ch.10 Sec.4: inlets at suitable intervals to prevent excessive gutter flow.' }); });

    // ---- storm sewer network (StormCalc) ----
    var net = network(L, ix, toNet, yr, evals);
    // ---- ditches ----
    var ditches = {};
    order.forEach(function (i) {
      if (kind[i] !== 'ditch' && !(kind[i] === 'pit' && ix.ditch[i])) return;
      var c = ix.ditch[i], lin = LININGS[c.lining || 'grass'], Q = i10 * CA[i], j = dir[i];
      if (j < 0) { ditches[i] = { Q: Q, d: 9, tau: 0 }; evals.push({ el: 'ditch', k: c.k, tile: i, status: 'dead end', reason: 'The ditch has no lower outlet here: water ponds and spills onto the lots. Run it down to the creek, a culvert or the pond.', basis: 'TxDOT HDM Ch.7: analyze outlet points; provide a positive outlet (game rule: ditch must reach an outlet).' }); return; }
      var S = Math.max(0.0005, (h[i] - h[j]) / TILE_FT);
      if (isWater(L.types[j])) { var up = -1; for (var u = 0; u < n; u++) if (dir[u] === i && ix.ditch[u]) up = u; if (up >= 0) S = Math.min(S, Math.max(0.0005, (h[up] - h[i]) / TILE_FT)); } // game rule: the drop into the creek is a protected outfall (apron)
      var ch = DR.chanDepth(Math.max(0.01, Q), { B: RULES.ditch.B, z1: RULES.ditch.z, z2: RULES.ditch.z, n: lin.n, S: S });
      var tau = GAMMA * ch.d * S, rec = { Q: Q, d: ch.d, V: ch.V, S: S, tau: tau, tp: lin.tp };
      ditches[i] = rec;
      var e = { el: 'ditch', k: c.k, tile: i, status: 'ok', Q: Q, d: ch.d, tau: tau, reason: lin.name + ': ' + Q.toFixed(1) + ' cfs, depth ' + ch.d.toFixed(2) + ' ft, V ' + ch.V.toFixed(1) + ' ft/s, shear ' + tau.toFixed(2) + ' of ' + (isFinite(lin.tp) ? lin.tp.toFixed(2) : 'n/a') + ' lb/sf (grade ' + (S * 100).toFixed(1) + '%).', basis: 'Manning (drainage/calc.js chanDepth); shear = 62.4 d S (TxDOT HDM Ch.7 Eq 7-2); permissible shear: TxDOT HDM Ch.7 Sec.3 table.' };
      if (ch.d > RULES.ditch.depth - RULES.ditch.fb + 1e-9) { e.status = 'overtopped'; e.reason = 'Depth ' + ch.d.toFixed(2) + ' ft leaves less than 0.5 ft freeboard in the 2-ft ditch (' + Q.toFixed(1) + ' cfs). A smoother lining carries more.'; e.basis = 'Luis\u2019s Ditch tool freeboard check (0.5 ft); Manning capacity, TxDOT HDM Ch.6/7.'; }
      else if (tau > lin.tp + 1e-9) { e.status = 'scoured'; e.reason = 'Shear ' + tau.toFixed(2) + ' lb/sf beats the ' + lin.name.toLowerCase() + ' limit of ' + lin.tp.toFixed(2) + ' lb/sf at ' + (S * 100).toFixed(1) + '% grade: the lining erodes. Use a tougher lining here.'; e.basis = 'TxDOT HDM Ch.7 Sec.3 step 5: if design shear >= permissible shear, choose a more resistant lining (Permissible Shear Stresses table).'; }
      evals.push(e);
    });
    // ---- culvert ----
    var culv = null;
    if (L.culvert) {
      var ct = L.culvert.tile, cc = ix.culvert[ct], Qc = L.culvert.Q[yr], cr = { Q: Qc, roadEl: L.culvert.roadEl };
      if (!cc) { cr.HW = L.culvert.roadEl + 1.5; cr.over = true;
        evals.push({ el: 'culvert', tile: ct, status: 'overtopped', reason: 'No culvert: the road embankment dams the creek (' + Qc.toFixed(0) + ' cfs) and water goes over the road.', basis: 'TxDOT HDM Ch.8 Sec.2 Allowable Headwater: the headwater at the design discharge must be below the roadway.' }); }
      else {
        var inl = CV.INLETS.circular.filter(function (x) { return x.id === 'c_sq_hw'; })[0], D = cc.dia / 12;
        var r = CV.analyze({ units: 'US', shape: 'circular', rise: D, span: D, barrels: cc.barrels || 1, length: RULES.culvLen, invIn: L.culvert.invIn, invOut: L.culvert.invIn - 0.4, n: RULES.culvN, inlet: inl, Q: Qc, twMode: 'const', twElev: L.culvert.tw[yr] });
        cr.HW = r.EL; cr.HWD = r.HW / D; cr.V = r.Vout; cr.control = r.control; cr.over = r.EL > L.culvert.roadEl + 1e-9;
        var e2 = { el: 'culvert', k: cc.k, tile: ct, status: 'ok', reason: (cc.barrels || 1) + ' x ' + cc.dia + '-in RCP: ' + Qc.toFixed(0) + ' cfs, headwater El. ' + r.EL.toFixed(2) + ' (road edge El. ' + L.culvert.roadEl.toFixed(1) + '), HW/D ' + cr.HWD.toFixed(2) + ', ' + r.control + ' control.', basis: 'FHWA HDS-5 inlet/outlet control (culvert/calc.js analyze, concrete pipe square edge with headwall); allowable HW: TxDOT HDM Ch.8 Sec.2.' };
        if (cr.over) { e2.status = 'overtopped'; e2.reason = 'Headwater El. ' + r.EL.toFixed(2) + ' is above the road edge El. ' + L.culvert.roadEl.toFixed(1) + ': the road overtops at ' + Qc.toFixed(0) + ' cfs. Add barrels or go bigger.'; e2.basis = 'TxDOT HDM Ch.8 Sec.2 Allowable Headwater: headwater at the design discharge must be below the roadway (edge of pavement is a critical elevation).'; }
        evals.push(e2);
      }
      culv = cr;
    }
    // ---- detention pond ----
    var pond = detention(L, ix, CA, kind, net, yr, evals);
    // ---- client no-build lots (surprise) ----
    if (L.nobuild) controls.forEach(function (c, k) { var tl = c.type === 'pipe' ? (L.nobuild[c.a] ? c.a : L.nobuild[c.b] ? c.b : -1) : L.nobuild[c.tile] ? c.tile : -1; if (tl >= 0) evals.push({ el: c.type, k: k, tile: tl, status: 'no-build lot', reason: 'The client kept this lot out of the project: nothing can be built on it. Move this piece.', basis: 'game rule (client constraint)' }); });
    // ---- lots flooded by public runoff (no street/ditch to carry it) ----
    for (var li = 0; li < n; li++) if (t[li] === 'H' && roadCA[li] > 1e-9 && kind[li] !== 'gutter') { evals.push({ el: 'lot', tile: li, status: 'flooded lot', reason: 'Road runoff (' + (i10 * roadCA[li]).toFixed(1) + ' cfs) drains across this house lot. Catch it in a ditch or street first.', basis: 'game rule (TxDOT HDM: potential damage to adjacent property is a primary concern; Ch.10 Sec.3 Detention: avoid damage to adjacent properties).' }); break; }
    for (li = 0; li < n; li++) if (t[li] === 'H' && kind[li] === 'pit' && CA[li] > 3 * TILE_AC * 0.45) { evals.push({ el: 'lot', tile: li, status: 'flooded lot', reason: 'Water collects in a low lot with no way out.', basis: 'game rule' }); break; }
    return { yr: yr, i: i10, dir: dir, kind: kind, CA: CA, gut: gut, toNet: toNet, net: net, ditches: ditches, culvert: culv, pond: pond, evals: evals, ix: ix };
  }

  // Storm sewer: tiles touched by pipes are nodes; one outfall (creek or pond tile) per network.
  function network(L, ix, toNet, yr, evals) {
    var edges = (L.existing || []).map(function (p) { return { a: p[0], b: p[1], dia: p[2], existing: true }; }).concat(ix.pipes);
    var res = { nodes: {}, pipes: [], ok: true, Qout: {}, outfalls: [] };
    if (!edges.length) {
      Object.keys(toNet).forEach(function (k) { if (ix.inlet[k]) evals.push({ el: 'inlet', k: ix.inlet[k].k, tile: +k, status: 'not connected', reason: 'This inlet is not connected to a storm sewer: the water it catches has nowhere to go. Draw a pipe to the outfall.', basis: 'game rule (an inlet needs an outlet pipe)' }); });
      return res;
    }
    var adj = {}, t = L.types, h = L.heights;
    ix.pipes.forEach(function (e) { if (L.util[e.a] || L.util[e.b]) evals.push({ el: 'pipe', k: e.k, tile: L.util[e.a] ? e.a : e.b, tile2: e.b, status: 'utility conflict', reason: 'This pipe runs into the gas line found by the utility locate. Route the pipe around it.', basis: 'Surprise: utility conflict (game rule: pipes cannot cross the marked utility).' }); });
    edges.forEach(function (e, k) { e.id = 'p' + k; (adj[e.a] = adj[e.a] || []).push(e); (adj[e.b] = adj[e.b] || []).push(e); });
    var seen = {}, comps = [];
    Object.keys(adj).forEach(function (s) {
      if (seen[s]) return; var comp = [], st = [+s]; seen[s] = true;
      while (st.length) { var a = st.pop(); comp.push(a); adj[a].forEach(function (e) { var b = e.a === a ? e.b : e.a; if (!seen[b]) { seen[b] = true; st.push(b); } }); }
      comps.push(comp);
    });
    var pondIx = ix.pond;
    comps.forEach(function (comp) {
      var outs = comp.filter(function (a) { return isWater(t[a]) || pondIx[a] || L.pondSite === a; });
      var compEdges = edges.filter(function (e) { return comp.indexOf(e.a) >= 0; });
      if (!outs.length) {
        compEdges.forEach(function (e) { if (!e.existing) evals.push({ el: 'pipe', k: e.k, tile: e.a, tile2: e.b, status: 'no outfall', reason: 'This pipe run does not reach the creek (or the pond). Every storm sewer needs an outfall.', basis: 'TxDOT HDM Ch.10 Sec.2 (outfall considerations); game rule' }); });
        comp.forEach(function (a) { if (ix.inlet[a] && toNet[a]) evals.push({ el: 'inlet', k: ix.inlet[a].k, tile: a, status: 'not connected', reason: 'The pipe from this inlet never reaches an outfall.', basis: 'game rule' }); });
        res.ok = false; return;
      }
      outs.sort(function (a, b) { return h[a] - h[b]; }); var of = outs[0];
      // BFS from the outfall gives the flow direction (tree); extra edges = loops
      var par = {}, pe = {}, q = [of], vis = {}, bfs = []; vis[of] = true;
      while (q.length) { var a = q.shift(); bfs.push(a); adj[a].forEach(function (e) { var b = e.a === a ? e.b : e.a; if (!vis[b]) { vis[b] = true; par[b] = a; pe[b] = e; q.push(b); } }); }
      compEdges.forEach(function (e) { if (pe[e.a] !== e && pe[e.b] !== e) { evals.push({ el: 'pipe', k: e.k, tile: e.a, tile2: e.b, status: 'loop', reason: 'This pipe closes a loop. Storm sewers branch like a tree toward one outfall.', basis: 'storm/ tool topology check (one outgoing pipe per node)' }); res.ok = false; } });
      // inverts (game layout rules): each pipe starts as shallow as 3 ft of cover allows, never flatter than the min slope,
      // crowns match where pipes join (HEC-22 practice), and the last pipe drops to the outfall flowline.
      var inv = {}, ofInv = pondIx[of] || L.pondSite === of ? L.pondBottom : L.outfallInv, nodes = [], pipes = [], ieDnOf = {};
      var post = bfs.slice().reverse(), kidsOf = {};
      bfs.forEach(function (b) { if (b !== of) (kidsOf[par[b]] = kidsOf[par[b]] || []).push(b); });
      post.forEach(function (a) {
        if (a === of) return;
        var e = pe[a], D = e.dia / 12, dn = par[a], ieUp = h[a] - RULES.coverFt - D;
        (kidsOf[a] || []).forEach(function (b) { var Db = pe[b].dia / 12; ieUp = Math.min(ieUp, ieDnOf[b] + Db - D, ieDnOf[b]); });
        var Smin = selfCleanS(D);
        var ieDn = dn === of ? Math.max(ofInv, ieUp - RULES.maxOutS * TILE_FT) : Math.min(ieUp - Smin * TILE_FT, h[dn] - RULES.coverFt - D);
        if (ieUp < ieDn + Smin * TILE_FT) ieUp = ieDn + Smin * TILE_FT;
        inv[a] = ieUp; ieDnOf[a] = ieDn; e.cover = h[a] - ieUp - D; e.ieUp = ieUp; e.ieDn = ieDn;
      });
      inv[of] = ofInv;
      bfs.forEach(function (a) {
        var kids = kidsOf[a] || [], bend = null;
        if (a !== of && kids.length === 1) bend = (kids[0] - a) === (a - par[a]) ? 0 : 90;
        var kindN = a === of ? 'outfall' : ix.inlet[a] ? 'inlet' : kids.length >= 2 ? 'junction' : bend === 90 ? 'bend' : kids.length ? 'joint' : 'end';
        nodes.push(SC.emptyNode({ id: 'n' + a, name: '' + a, kind: kindN === 'bend' || kindN === 'joint' || kindN === 'end' ? 'manhole' : kindN, rim: a === of ? (isWater(t[a]) ? h[a] + 3 : h[a]) : h[a], invert: inv[a], Qin: toNet[a] || 0, bendDeg: kindN === 'junction' ? null : bend }));
        nodes[nodes.length - 1].gameKind = kindN;
        if (a === of) return;
        var e = pe[a];
        pipes.push(SC.emptyPipe({ id: e.id, fromId: 'n' + a, toId: 'n' + par[a], shape: 'circular', diameter: e.dia / 12, n: RULES.nPipe, length: TILE_FT, ieUp: e.ieUp, ieDn: e.ieDn }));
      });
      var tw = pondIx[of] ? (L.pondTW && L.pondTW[yr]) || (L.pondBottom + 1) : L.pondSite === of ? L.pondBottom + 0.5 : L.tw[yr];
      var an = SC.analyzeNetwork(nodes, pipes, tw);
      res.outfalls.push(of); res.Qout[of] = an.networkQ != null ? an.networkQ : nodes.reduce(function (s, nn) { return s + (nn.Qin || 0); }, 0);
      var gk = {}; nodes.forEach(function (nn) { gk[nn.name] = nn.gameKind; });
      an.nodes.forEach(function (nn) { res.nodes[+nn.name] = { HGL: nn.HGL, rim: nn.rim, kind: gk[nn.name] || nn.kind, inv: inv[+nn.name], surch: nn.surcharge }; });
      an.pipes.forEach(function (p) {
        var e = edges.filter(function (x) { return x.id === p.id; })[0], up = +p.fromId.slice(1), dn = +p.toId.slice(1);
        var rec = { a: up, b: dn, dia: e.dia, Q: p.Q || 0, Qfull: p.Qfull, V: p.V, HGLup: p.HGLup, HGLdn: p.HGLdn, ieUp: p.ieUp, ieDn: p.ieDn, existing: !!e.existing, k: e.k, cover: e.cover, S: (p.ieUp - p.ieDn) / TILE_FT };
        res.pipes.push(rec);
        var nm = (e.existing ? 'Existing ' : '') + e.dia + '-in RCP';
        var ev = { el: 'pipe', k: e.k, tile: up, tile2: dn, status: 'ok', existing: !!e.existing, reason: nm + ': ' + rec.Q.toFixed(1) + ' cfs of ' + (p.Qfull || 0).toFixed(1) + ' full, V ' + (p.V || 0).toFixed(1) + ' ft/s, slope ' + (rec.S * 100).toFixed(2) + '%, HGL El. ' + (p.HGLup || 0).toFixed(2) + ' vs gutter El. ' + h[up].toFixed(2) + '.', basis: 'Manning full flow, HGL with HEC-22 approx. structure losses (storm/calc.js analyzeNetwork).' };
        if (rec.Q > (p.Qfull || 0) + 1e-9) { ev.status = 'overloaded'; ev.reason = nm + ' carries ' + rec.Q.toFixed(1) + ' cfs but holds only ' + (p.Qfull || 0).toFixed(1) + ' cfs flowing full: it runs under pressure. Go up a size.'; ev.basis = 'TxDOT HDM Ch.10 Sec.2 (c): standard practice is a non-pressure flow network (Manning full-flow capacity, storm/calc.js).'; }
        else if (rec.Q > 0.1 && p.V != null && p.V < RULES.vMin) { ev.status = 'slow'; ev.warn = true; ev.reason = nm + ': V ' + p.V.toFixed(1) + ' ft/s is under 3 ft/s, sediment will settle. A smaller pipe or steeper slope helps.'; ev.basis = 'TxDOT HDM Ch.10 Sec.2 (f): velocities no less than 3 fps.'; }
        else if (p.V != null && p.V > RULES.vMax) { ev.status = 'fast'; ev.warn = true; ev.reason = nm + ': V ' + p.V.toFixed(1) + ' ft/s is over 12 ft/s.'; ev.basis = 'TxDOT HDM Ch.10 Sec.2 (f): no greater than about 12 fps.'; }
        if (e.cover < RULES.coverFt - 0.05 && ev.status === 'ok') { ev.status = 'shallow'; ev.warn = true; ev.reason += ' Cover only ' + e.cover.toFixed(1) + ' ft (3 ft min where possible).'; ev.basis = 'TxDOT HDM Ch.10 Sec.2 (g): minimum cover 3.0 ft where possible.'; }
        if (!e.existing || (ev.status !== 'ok' && !ev.warn)) evals.push(ev);
      });
      an.nodes.forEach(function (nn) {
        var a = +nn.name; if (nn.kind === 'outfall' || nn.HGL == null || gk[nn.name] === 'joint') return; // straight joints are sealed pipe, not structures
        if (nn.HGL > h[a] + 1e-9) { res.ok = false;
          evals.push({ el: 'node', k: ix.inlet[a] ? ix.inlet[a].k : undefined, tile: a, status: 'surcharged', HGL: nn.HGL, reason: 'HGL El. ' + nn.HGL.toFixed(2) + ' is above the ' + (ix.inlet[a] ? 'gutter' : 'manhole rim') + ' El. ' + h[a].toFixed(2) + ': water bubbles out onto the street. Bigger pipes downstream lower the HGL.', basis: 'TxDOT HDM Ch.10 Sec.2 (d): the hydraulic grade line must not exceed the critical elevation (inlet throats, manhole tops) at any point.' }); }
      });
      comp.forEach(function (a) { if (ix.inlet[a] && !vis[a]) evals.push({ el: 'inlet', k: ix.inlet[a].k, tile: a, status: 'not connected', reason: 'not connected', basis: 'game rule' }); });
      res.inv = Object.assign(res.inv || {}, inv);
    });
    Object.keys(toNet).forEach(function (k) { if (!adj[k] && ix.inlet[k]) evals.push({ el: 'inlet', k: ix.inlet[k].k, tile: +k, status: 'not connected', reason: 'This inlet is not connected to a storm sewer: the water it catches has nowhere to go. Draw a pipe from it toward the outfall.', basis: 'game rule (an inlet needs an outlet pipe)' }); });
    return res;
  }

  // ---------- detention (modified rational hydrographs + level-pool routing) ----------
  function preDev(L, yr) {
    var p = L.pre, tc = TC ? TC.kerby(p.Lov, p.N, TC.lowSlope(p.S)) + TC.kirpich(p.Lch, TC.lowSlope(p.S)) : 30;
    return { tc: tc, i: intensity(yr, tc), Q: p.C * intensity(yr, tc) * p.A };
  }
  function detention(L, ix, CA, kind, net, yr, evals) {
    if (!L.pre) return null;
    if (L.preOptional && !Object.keys(ix.pond).length) return null;
    var pre = preDev(L, yr), pondTiles = Object.keys(ix.pond).map(Number), site = L.pondSite;
    var CAp = 0, CAd = 0, n = CA.length;
    // runoff reaching the pond: surface flow into pond tiles + pipes ending at the pond site
    pondTiles.forEach(function (i) { CAp += CA[i]; });
    var netQ = 0; (net.outfalls || []).forEach(function (o) { if (ix.pond[o] || o === site) netQ += net.Qout[o] || 0; });
    var i10 = intensity(yr, RULES.Tc), CAnet = netQ / i10;
    var hasPond = pondTiles.length > 0 && ix.pond[site];
    // undetained: everything else leaving the site to the creek
    var CAsite = L.pre.A * 0 + 0; for (var i = 0; i < n; i++) if (kind[i] === 'creek' && L.types[i] === 'C') {} // (creek tiles collect offsite flow too; we use the level's site CA)
    CAsite = L.siteCA != null ? L.siteCA : 0;
    var CAin = hasPond ? CAp + CAnet : 0; CAd = Math.max(0, (L.postCA != null ? L.postCA : CAsite) - CAin);
    var area = pondTiles.length * TILE_FT * TILE_FT, oc = ix.outlet || { orif: 12, weir: 4 };
    var orA = Math.PI * Math.pow(oc.orif / 12, 2) / 4, Dor = oc.orif / 12;
    function out(hh) { var q = 0; if (hh > 0) q += hh >= Dor ? RULES.orifC * orA * Math.sqrt(2 * G * (hh - Dor / 2)) : RULES.orifC * orA * Math.sqrt(2 * G * Math.max(0, hh / 2)) * (hh / Dor);
      if (hh > RULES.pondWeirZ) q += RULES.weirC * oc.weir * Math.pow(hh - RULES.pondWeirZ, 1.5); return q; }
    var best = { Qpeak: 0 }, durs = [10, 15, 20, 30, 45, 60, 90, 120, 180, 240];
    durs.forEach(function (Td) {
      var ii = intensity(yr, Td), Qin = CAin * ii, Qd = CAd * intensity(yr, RULES.Tc), tc = RULES.Tc, dt = 0.5, T = Td + tc + 360, st = 0, hh = 0, peak = 0, hmax = 0, ser = [], qdd;
      for (var tm = 0; tm <= T; tm += dt) {
        var f = tm < tc ? tm / tc : tm < Td ? 1 : tm < Td + tc ? 1 - (tm - Td) / tc : 0;
        var qi = Qin * f, qo = hasPond ? out(hh) : qi;
        if (hasPond) { st = Math.max(0, st + (qi - qo) * dt * 60); hh = st / area; }
        qdd = Qd * (tm < tc ? tm / tc : tm < 2 * tc ? 1 - (tm - tc) / tc : 0) * (Td === 10 ? 1 : ii / intensity(yr, RULES.Tc)); // undetained runoff (its own short storm)
        var tot = qo + qdd; if (tot > peak) peak = tot; if (hh > hmax) hmax = hh;
        if (Math.round(tm / dt) % 4 === 0) ser.push([tm, qi + qdd, tot, hh]);
      }
      if (peak > best.Qpeak) best = { Qpeak: peak, Td: Td, hmax: hmax, ser: ser };
    });
    var r = { pre: pre, post: best.Qpeak, Td: best.Td, hmax: best.hmax || 0, ser: best.ser, hasPond: hasPond, area: area, orif: oc.orif, weir: oc.weir, CAin: CAin, CAd: CAd };
    var tileP = site;
    if (!hasPond) {
      if (pondTiles.length && !ix.pond[site]) evals.push({ el: 'pond', tile: pondTiles[0], status: 'missed', reason: 'The pond must include the outfall tile where the storm sewer ends (marked on the map).', basis: 'game rule' });
      evals.push({ el: 'detention', tile: tileP, status: 'peak up', reason: 'Post-development peak ' + best.Qpeak.toFixed(1) + ' cfs is higher than the pre-development ' + pre.Q.toFixed(1) + ' cfs. Detain it.', basis: L.detBasis || 'Level rule (typical local detention criterion: post-development peak \u2264 pre-development peak). TxDOT HDM Ch.10 Sec.3: consider detention to avoid damage to adjacent properties.' });
    } else {
      var e = { el: 'detention', tile: tileP, status: 'ok', reason: 'Peak out ' + best.Qpeak.toFixed(1) + ' cfs vs pre-development ' + pre.Q.toFixed(1) + ' cfs (Tc ' + pre.tc.toFixed(0) + ' min); pond peaks at ' + (best.hmax || 0).toFixed(2) + ' ft of ' + RULES.pondDepth + ' ft (critical duration ' + best.Td + ' min).', basis: 'Modified rational hydrographs + level-pool routing (game method); Kerby-Kirpich Tc, HDM Eq 4-14/4-15 (rational/calc.js).' };
      if ((best.hmax || 0) > RULES.pondDepth + 1e-9) { e.status = 'overtopped'; e.reason = 'The pond overtops its banks (' + best.hmax.toFixed(2) + ' ft > ' + RULES.pondDepth + ' ft). More storage or a longer weir.'; e.basis = 'game rule (pond banks at 4 ft)'; }
      else if (best.Qpeak > pre.Q + 1e-9) { e.status = 'peak up'; e.reason = 'Still ' + best.Qpeak.toFixed(1) + ' cfs out vs ' + pre.Q.toFixed(1) + ' cfs pre-development. Smaller orifice, shorter weir, or more storage.'; e.basis = L.detBasis || 'Level rule: post-development peak \u2264 pre-development peak.'; }
      evals.push(e);
    }
    return r;
  }

  // ---------- scoring ----------
  // Design storms per element come from the level (TxDOT HDM Table 4-2); L.check runs the 1% AEP check.
  function score(L, controls, opts) {
    opts = opts || {};
    var res = simulate(L, controls, { storm: L.design }), all = res.evals.slice(), runs = [res];
    if (L.culvert && L.culvert.design && L.culvert.design !== L.design) { var rc = simulate(L, controls, { storm: L.culvert.design }); rc.evals.forEach(function (e) { if (e.el === 'culvert') { all = all.filter(function (x) { return x.el !== 'culvert'; }); all.push(e); } }); res.culvert = rc.culvert; }
    if (L.pre && L.detDesign && L.detDesign !== L.design) { var rd = simulate(L, controls, { storm: L.detDesign }); all = all.filter(function (x) { return x.el !== 'detention' && x.el !== 'pond'; }).concat(rd.evals.filter(function (e) { return e.el === 'detention' || e.el === 'pond'; })); res.pond = rd.pond; }
    var check = null;
    if (L.check) { // all facilities evaluated to the 1% AEP: houses must stay dry
      var r100 = simulate(L, controls, { storm: L.check }), wet = [];
      Object.keys(r100.gut).forEach(function (k) { var g = r100.gut[k]; if (g.kind === 'sag' && g.d > RULES.lotPad + 1e-9) wet.push({ tile: +k, why: 'street sag ' + (g.ponded ? 'with no inlet' : g.d.toFixed(2) + ' ft deep') }); });
      Object.keys(r100.net.nodes || {}).forEach(function (k) { var nn = r100.net.nodes[k]; if (nn.kind !== 'outfall' && nn.HGL != null && nn.HGL > L.heights[k] + RULES.lotPad) wet.push({ tile: +k, why: 'manhole/inlet spilling ' + (nn.HGL - L.heights[k]).toFixed(1) + ' ft above the rim' }); });
      Object.keys(r100.ditches).forEach(function (k) { var d = r100.ditches[k]; if (d.d > RULES.ditch.depth + RULES.lotPad) wet.push({ tile: +k, why: 'ditch overflowing' }); });
      if (r100.culvert && r100.culvert.HW > (L.culvert.houseEl || 1e9)) wet.push({ tile: L.culvert.tile, why: 'creek backed up to El. ' + r100.culvert.HW.toFixed(1) });
      if (r100.pond && r100.pond.hasPond && r100.pond.hmax > RULES.pondDepth + 0.5) wet.push({ tile: L.pondSite, why: 'pond overtopping' });
      check = { yr: L.check, wet: wet, res: r100 };
      all.push(wet.length ? { el: 'check', tile: wet[0].tile, status: 'flooded lots', reason: L.check + '-yr check: houses flood (' + wet.slice(0, 3).map(function (w) { return w.why; }).join('; ') + ').', basis: 'TxDOT HDM Table 4-2 note: all facilities must be evaluated to the 1% AEP flood event. House pads 1 ft above the gutter (game rule).' }
        : { el: 'check', tile: -1, status: 'ok', reason: L.check + '-yr check: every house stays dry.', basis: 'TxDOT HDM Table 4-2 note: all facilities must be evaluated to the 1% AEP flood event.' });
    }
    var cost = controls.reduce(function (s, c) { return s + controlCost(c); }, 0) + manholeCost(L, res);
    var budget = opts.round > 0 && L.budgetCut ? L.budgetCut : L.budget;
    var fails = all.filter(function (e) { return e.status !== 'ok' && !e.warn; }), warns = all.filter(function (e) { return e.warn; });
    if (cost > budget) fails.push({ el: 'budget', tile: -1, status: 'over budget', reason: 'Plan costs $' + cost.toLocaleString() + ' but the budget is $' + budget.toLocaleString() + (opts.round > 0 && L.budgetCut ? ' (after the client\u2019s budget cut)' : '') + '.', basis: 'project budget' });
    var s = 100 - 14 * fails.length - 4 * warns.length;
    var ratio = cost / budget; if (ratio > 0.8) s -= Math.round((ratio - 0.8) * 30);
    s = Math.max(0, Math.min(100, Math.round(s)));
    var stars = fails.length === 0 && s >= 80 ? 3 : fails.length <= 1 && s >= 55 ? 2 : s >= 25 && controls.length ? 1 : 0;
    if (!controls.length) stars = 0;
    return { score: s, stars: stars, fails: fails, warns: warns, evals: all, cost: cost, budget: budget, result: res, check: check };
  }
  function manholeCost(L, res) { var c = 0; Object.keys(res.net.nodes || {}).forEach(function (k) { var nn = res.net.nodes[k]; if (nn.kind === 'junction' || nn.kind === 'bend' || nn.kind === 'end') { if (!(L.existingNodes && L.existingNodes[k])) c += COST.manhole; } }); return c; }

  // Smallest standard size that passes for one pipe (storm/ tool's suggestSizePipe), used by the Suggest helper.
  function suggest(L, controls, k) {
    var c = controls[k]; if (!c || c.type !== 'pipe') return null;
    for (var s = 0; s < PIPE_IN.length; s++) {
      var cs = controls.slice(); cs[k] = Object.assign({}, c, { dia: PIPE_IN[s] });
      var r = simulate(L, cs, { storm: L.design }), bad = r.evals.some(function (e) { return (e.el === 'pipe' && e.k === k && (e.status === 'overloaded')) || (e.el === 'node' && (e.tile === c.a || e.tile === c.b)); });
      if (!bad) return PIPE_IN[s];
    }
    return PIPE_IN[PIPE_IN.length - 1];
  }

  // ---------- levels ----------
  function grid(W, H, f) { var a = []; for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) a.push(f(x, y)); return a; }
  function base(id, name, W, H, typeF, hF) { return { id: id, name: name, W: W, H: H, types: grid(W, H, typeF), heights: grid(W, H, hF), design: 10, Tallow: 12, tw: {}, existing: [], budget: 100000, util: {}, nobuild: {}, tools: ['inspect', 'inlet', 'pipe', 'demolish'] }; }
  function tws(v) { var o = {}; STORMS.forEach(function (y, k) { o[y] = v + k * 0.4; }); return o; }
  var LEVELS = {};
  LEVELS[1] = function () { // single street, two curb inlets (spread)
    var W = 11, H = 7, road = 3;
    var L = base(1, 'Main Street spread', W, H, function (x, y) { return x === W - 1 ? 'C' : y === road ? 'R' : y === 0 || y === H - 1 ? 'T' : 'H'; },
      function (x, y) { if (x === W - 1) return 94; var r = 100 - 0.25 * x; return y === road ? r : y === 0 || y === H - 1 ? r + 0.6 : r + 0.5 + 0.25 * (Math.abs(y - road) - 1); });
    for (var x = 0; x < W - 1; x++) { /* trees drain away from the street */ }
    L.heights = L.heights.map(function (h, i) { var y = (i / W) | 0; return (y === 0 || y === H - 1) && (i % W) < W - 1 ? h - 1.2 : h; });
    for (x = 1; x < W - 1; x++) L.existing.push([road * W + x, road * W + x - 1 < road * W + 1 ? road * W + x : road * W + x + 1, 36]);
    L.existing = []; for (x = 1; x < W - 1; x++) L.existing.push([road * W + x, road * W + x + 1, 36]);
    L.existingNodes = {}; for (x = 1; x < W; x++) L.existingNodes[road * W + x] = true;
    L.outfallInv = 92; L.tw = tws(93);
    L.tools = ['inspect', 'inlet', 'demolish']; L.budget = 60000; L.design = 10;
    L.goal = 'Keep the spread on Main Street within one 12-ft lane with curb inlets.';
    L.lesson = 'Runoff from the lots builds up in the gutter as it runs downhill (left to right). The wider the water spreads, the more of the lane it blocks. Place curb inlets where the spread reaches the limit. An existing 36-in trunk sewer runs under the street, so any inlet on the street connects to it.';
    L.tip = 'Inlets go where the spread reaches the limit, not at the top of the hill. The last inlet should leave less than 0.5 cfs bypassing.';
    L.hints = ['Tap ≋ or Inspect a street tile: spread grows toward the creek. Without inlets it reaches about 15 ft.', 'One inlet in the middle of the block (around the 5th street tile) resets the gutter flow.', 'Put a second inlet on the last street tile before the creek so less than 0.5 cfs bypasses off the project. 10-ft inlets catch nearly everything on this grade.'];
    L.hintTiles = [road * W + 4, road * W + 9];
    L.tutorial = true;
    return L;
  };
  LEVELS[2] = function () { // inlets on grade, carryover
    var W = 16, H = 7, road = 3;
    var L = base(2, 'Carryover down the hill', W, H, function (x, y) { return x === W - 1 ? 'C' : y === road ? 'R' : y === 0 || y === H - 1 ? 'T' : Math.abs(y - road) === 2 ? 'H' : 'P'; },
      function (x, y) { if (x === W - 1) return 88; var r = 100 - 0.75 * x; return y === road ? r : y === 0 || y === H - 1 ? r - 0.6 : r + 0.9 + 0.8 * (Math.abs(y - road) - 1); });
    L.existing = []; for (var x = 1; x < W - 1; x++) L.existing.push([road * W + x, road * W + x + 1, 42]);
    L.existingNodes = {}; for (x = 1; x < W; x++) L.existingNodes[road * W + x] = true;
    L.outfallInv = 84; L.tw = tws(86);
    L.tools = ['inspect', 'inlet', 'demolish']; L.budget = 68000; L.design = 10;
    L.goal = 'Commercial strip on a 1.5% grade: use curb inlets on grade and let the bypass carry to the next one.';
    L.lesson = 'An inlet on grade never catches everything: some flow runs past (bypass or carryover) and joins the next block\u2019s runoff. Short inlets bypass more. TxDOT practice (Luis\u2019s approach): try lengths and spacing until the spread passes and the final bypass is under about 0.5 cfs.';
    L.tip = 'A 5-ft inlet that lets 1 cfs through is fine if the next inlet downstream catches it. Watch the very last one.';
    L.hints = ['Parking lots (C 0.90) pour runoff in fast. Inspect street tiles to see Q and spread.', 'Try three inlets spaced about 4 tiles apart. Bypass from each one adds to the next block.', 'Make the last inlet a 15-ft one so bypass off the project is under 0.5 cfs.'];
    L.hintTiles = [road * W + 4, road * W + 9, road * W + 14];
    return L;
  };
  LEVELS[3] = function () { // sag inlet + pipe to outfall, HGL below gutter
    var W = 11, H = 9, road = 2, sag = 5;
    var L = base(3, 'The sag and the outfall', W, H, function (x, y) { return y === H - 1 ? 'C' : y === road ? 'R' : y === 0 ? 'H' : y === 1 ? 'H' : 'G'; },
      function (x, y) { var r = 100 + 0.3 * Math.abs(x - sag); if (y === H - 1) return 91; if (y === road) return r; if (y < road) return r + 0.6 + 0.3 * (road - y); return 99.6 - 0.9 * (y - road - 1) + 0.05 * Math.abs(x - sag); });
    L.outfallInv = 89.5; L.tw = { 2: 96.4, 5: 97.0, 10: 97.6, 25: 98.2, 50: 98.7, 100: 99.2 };
    L.tools = ['inspect', 'inlet', 'pipe', 'demolish']; L.budget = 100000; L.suggests = 1;
    L.goal = 'Drain the low point of the street with a sag inlet and size the pipe to the creek so the HGL stays below the gutter.';
    L.lesson = 'At a sag there is nowhere for the water to go: TxDOT says put inlets at all low points. The sag inlet takes all the flow, so the pipe from it must be big enough. The creek is high during the storm (tailwater), which pushes the hydraulic grade line (HGL) up the pipe; the HGL must stay below the gutter.';
    L.tip = 'Small pipe = big friction slope = high HGL. Check the HGL against the gutter, not just the full-flow capacity.';
    L.hints = ['Put an inlet on the lowest street tile (the middle, where both gutters meet).', 'Pick a pipe size, then drag a pipe from the sag inlet straight down to the creek (bottom row).', 'An 18-in pipe surcharges with the high creek. Try 24 in or bigger, or add inlets on the approaches to split the flow.'];
    L.hintTiles = [road * W + sag];
    return L;
  };
  LEVELS[4] = function () { // branched network, junction losses, utility conflict
    var W = 12, H = 9, main = 2, side = 5;
    var L = base(4, 'Branches and a junction', W, H, function (x, y) { if (x === W - 1) return 'C'; if (y === main || (x === side && y > main && y < H - 1)) return 'R'; return y === 0 || y === H - 1 ? 'T' : 'H'; }, function () { return 100; });
    var hm = function (x) { return 100 - 0.16 * x; }, hs = function (y) { return hm(side) + 0.18 * (y - main); };
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) { var i = y * W + x, t = L.types[i];
      if (t === 'C') L.heights[i] = 91; else if (y === main) L.heights[i] = hm(x); else if (t === 'R') L.heights[i] = hs(y);
      else { var toMain = Math.abs(y - main), toSide = y > main ? Math.abs(x - side) : 99, near = toMain <= toSide ? hm(x) : hs(y), d = Math.min(toMain, toSide); L.heights[i] = t === 'T' ? near - 0.4 : near + 0.35 + 0.25 * d; } }
    L.outfallInv = 90.5; L.tw = { 2: 96.3, 5: 96.8, 10: 97.3, 25: 97.8, 50: 98.2, 100: 98.6 };
    L.util = {}; [main - 1, main].forEach(function (y2) { L.util[y2 * W + 8] = true; });
    L.tools = ['inspect', 'inlet', 'pipe', 'demolish']; L.budget = 235000; L.suggests = 2;
    L.goal = 'Two streets meet. Catch both, branch the pipes into a junction box and run one trunk to the creek.';
    L.lesson = 'A storm sewer is a tree: branches from each inlet join at junction boxes and the trunk grows downstream. Where pipes join, the flow turns and loses energy (junction loss, HEC-22), so the HGL jumps up at the junction. Watch out: a utility locate may find lines in the way.';
    L.tip = 'Size the trunk for the sum of both branches; junction losses add HGL at the box.';
    L.hints = ['Both streets slope toward the intersection. Inlets on the side street and on the main street, a few tiles before the corner.', 'Bring both branches to a junction near the corner, then run one trunk east to the creek. A gas line was found under columns 10-11 near the street: go around it (a row further south).', 'Branches 24 in, trunk 36 in is a safe start; check the HGL at the junction.'];
    L.hintTiles = [main * W + 4, 8 * W + side];
    return L;
  };
  LEVELS[5] = function () { // roadside ditch, lining & grade (HEC-15)
    var W = 8, H = 15, road = 2, ditch = 3;
    var L = base(5, 'Roadside ditch', W, H, function (x, y) { if (y === H - 1) return 'C'; if (x === road) return 'Q'; if (x < road) return 'G'; return x >= 5 ? 'H' : 'G'; },
      function (x, y) { var prof = y < 5 ? 110 - 0.15 * y * 1 : y < 10 ? 109.25 - 1.6 * (y - 5) : 101.25 - 0.4 * (y - 10); if (y === H - 1) return prof + 0.15; if (x === road) return prof + 0.8; if (x < road) return prof + 1.0 + 0.3 * (road - x); if (x === ditch) return prof + 0.3; return prof + 0.2 - 0.35 * (x - ditch); });
    L.design = 10; L.budget = 55000; L.tools = ['inspect', 'ditch', 'demolish']; L.Tallow = 12;
    L.goal = 'Carry the rural road and field runoff to the creek in a roadside ditch; choose a lining that will not scour on the steep part.';
    L.lesson = 'Without curbs, the road sheds water sideways. A roadside ditch catches it and carries it to the creek. On flat ground grass is fine. On a steep grade the water is fast and its shear stress (62.4 × depth × slope) tears out grass: line the steep part with a mat or rock, but don\u2019t pay for concrete where grass works.';
    L.tip = 'Inspect a ditch tile after a run: it shows shear vs the lining\u2019s permissible shear (TxDOT HDM Ch. 7).';
    L.hints = ['Paint ditch tiles in the strip just east of the road (column 4), all the way down to the creek.', 'The middle stretch is steep (3.2%). Grass scours there.', 'Use synthetic mat or rock on the steep tiles and grass on the flat ones.'];
    L.hintTiles = [7 * W + ditch];
    return L;
  };
  LEVELS[6] = function () { // culvert at creek crossing
    var W = 14, H = 11, cr = 5, rx = 7;
    var L = base(6, 'Creek crossing', W, H, function (x, y) { if (y === cr && x === rx) return 'X'; if (y === cr) return 'C'; if (x === rx) return 'R'; return Math.abs(x - rx) <= 2 ? 'G' : 'T'; },
      function (x, y) { var bank = 96 + 0.7 * Math.abs(y - cr); if (y === cr) return x === rx ? 96.5 : 91 - 0.05 * x; if (x === rx) return Math.max(96.5, 96 + 0.4 * Math.abs(y - cr)); return bank + 0.02 * x; });
    // road drains along itself to the creek ends: make it a crest at the crossing (flows away) - culvert only level
    L.culvert = { tile: cr * W + rx, invIn: 90.0, roadEl: 96.0, design: 25, houseEl: 99.5, Q: { 2: 95, 5: 140, 10: 175, 25: 225, 50: 265, 100: 310 }, tw: { 2: 92.6, 5: 93.2, 10: 93.7, 25: 94.3, 50: 94.8, 100: 95.3 } };
    L.design = 25; L.budget = 140000; L.budgetCut = 100000; L.tools = ['inspect', 'culvert', 'demolish'];
    L.types = L.types.map(function (t2) { return t2 === 'R' ? 'Q' : t2; });
    L.goal = 'Size the culvert where the new road crosses the creek: the 25-yr headwater must stay below the road edge.';
    L.lesson = 'A culvert backs water up on its upstream side (headwater). Too small and the creek goes over the road. TxDOT Table 4-2 recommends the 25-yr (4% AEP) storm for culverts on principal arterials, and the allowable headwater must be below the roadway. Several smaller barrels can do what one big one does. Surprise: the client may cut the budget after your first run.';
    L.tip = 'Compare 1 big barrel vs 2-3 smaller ones: same headwater, different cost.';
    L.hints = ['Inspect the crossing: 225 cfs at the 25-yr storm, road edge El. 96.0.', 'One 72-in barrel is not enough and 2 x 48 in is just short. Try 2 x 54 in or 2 x 60 in.', 'After the budget cut ($100k), 3 barrels no longer fit: two 54-60 in barrels do.'];
    L.hintTiles = [cr * W + rx];
    return L;
  };
  LEVELS[7] = function () { // detention pond sizing with outlet
    var W = 14, H = 11, road = 2, sx = 9;
    var L = base(7, 'Detention: hold the peak', W, H, function (x, y) { if (x === W - 1) return 'C'; if (y === road) return 'R'; if (x >= sx && y >= 5) return 'G'; return y === 0 ? 'T' : 'H'; },
      function (x, y) { if (x === W - 1) return 93; if (y === road) return 100 - 0.1 * x; if (x >= sx && y >= 5) return 98.2 - 0.02 * x - 0.02 * y; return 100.6 - 0.1 * x + 0.15 * Math.abs(y - road); });
    // lots below the street drain to it; pond area is lower and gets the trunk outfall
    L.existing = []; for (var x = 0; x < W - 3; x++) L.existing.push([road * W + x, road * W + x + 1, x < 6 ? 36 : 48]);
    for (x = W - 2; x > W - 3; x--) L.existing.push([road * W + x, road * W + x - 1, 24]);
    L.existing.push([road * W + W - 3, 3 * W + W - 3, 48]); L.existing.push([3 * W + W - 3, 4 * W + W - 3, 48]); L.existing.push([4 * W + W - 3, 5 * W + W - 3, 48]);
    L.existingNodes = {}; L.existing.forEach(function (p) { L.existingNodes[p[0]] = L.existingNodes[p[1]] = true; });
    L.autoInlets = true;
    L.pondSite = 5 * W + W - 3; L.needPond = true; L.pondBottom = 94.2; L.pondTW = { 2: 95, 5: 95.5, 10: 96, 25: 96.5, 50: 97, 100: 97.5 };
    L.nobuild = {}; [5 * W + 9, 6 * W + 9, 5 * W + 10, 6 * W + 10].forEach(function (i) { L.nobuild[i] = true; });
    L.pre = { C: 0.15, A: 9 * 11 * TILE_AC + 0.5, Lov: 300, N: 0.40, S: 0.004, Lch: 600 };
    L.design = 25; L.detDesign = 25; L.budget = 120000; L.tools = ['inspect', 'pond', 'outlet', 'demolish'];
    L.goal = 'The new subdivision raises the 25-yr peak. Build a detention pond at the trunk outfall and pick its outlet so the peak leaving the site is no higher than before development.';
    L.lesson = 'Detention does not reduce the runoff volume, it slows the release (TxDOT HDM Ch. 10). Store the extra water, then let it out through a small orifice; a weir passes big storms safely. Too big an orifice and the peak goes straight through; too small and the pond overtops.';
    L.tip = 'The pre-development peak uses a long Tc (Kerby-Kirpich on grass), so it is much lower than the paved post-development peak.';
    L.hints = ['Pond blocks go on the open area at the bottom right; one block must be on the trunk outfall tile (marked).', 'The client says the two lots next to the creek (striped) cannot be used.', 'About 8 pond blocks with a 12-in orifice and a 4-ft weir works. A bigger pond allows a bigger orifice.'];
    L.hintTiles = [L.pondSite];
    return L;
  };
  LEVELS[8] = function () { // full subdivision
    var W = 16, H = 14, road = 2, side = 5, cr = 10, col = 12;
    var L = base(8, 'The full subdivision', W, H, function (x, y) {
      if (y === cr && x === col) return 'X'; if (y === cr) return 'C';
      if (x === col) return 'Q';
      if (y > cr) return 'T';
      if (x === col + 1) return 'G'; if (x > col + 1) return y === 0 ? 'T' : 'H';
      if (y === road) return 'R'; if (x === side && y > road && y < cr - 1) return 'R';
      if (y === 0) return 'T';
      if (x >= side + 2 && x < col - 1 && y >= 6 && y < cr) return 'G';
      return 'H'; }, function () { return 100; });
    var hm = function (x) { return 101 - 0.15 * x; }, hs = function (y) { return hm(side) - 0.1 * (y - road); };
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) { var i = y * W + x, t = L.types[i];
      if (t === 'C') L.heights[i] = 93 - 0.04 * x;
      else if (t === 'X') L.heights[i] = 101;
      else if (x === col) L.heights[i] = 101 + 0.25 * Math.abs(y - cr);
      else if (y > cr) L.heights[i] = 97 + 0.5 * (y - cr);
      else if (x === col + 1) L.heights[i] = 100.4 + 0.25 * (cr - y);
      else if (x > col + 1) L.heights[i] = 100.0 + 0.25 * (cr - y) - 0.4 * (x - col - 1) + (y === 0 ? -0.5 : 0);
      else if (t === 'R') L.heights[i] = y === road ? hm(x) : hs(y);
      else if (t === 'G') L.heights[i] = 98.3 - 0.03 * x - 0.03 * y;
      else { var dm = Math.abs(y - road), ds = y > road ? Math.abs(x - side) : 99, near = dm <= ds ? hm(Math.min(x, col - 1)) : hs(Math.min(y, cr - 2)), d = Math.min(dm, ds); L.heights[i] = t === 'T' ? near - 0.5 : near + 0.4 + 0.15 * Math.min(d, 4);
      if (x === col - 1 && t !== 'R') L.heights[i] = 101 + 0.25 * Math.abs(y - cr) + 0.3; } }
    L.Tallow = 12; L.TallowBasis = "TxDOT HDM Ch.10 Sec.4 Ponding: minor highway, keep one lane per direction passable (game: 12 ft spread).";;
    L.outfallInv = 91; L.tw = { 2: 93.5, 5: 94, 10: 94.5, 25: 95, 50: 95.5, 100: 96 };
    L.culvert = { tile: cr * W + col, invIn: 91.5, roadEl: 100.0, design: 25, houseEl: 101, Q: { 2: 70, 5: 100, 10: 125, 25: 160, 50: 190, 100: 220 }, tw: { 2: 93.5, 5: 94, 10: 94.5, 25: 95, 50: 95.5, 100: 96 } };
    L.pondSite = 9 * W + 8; L.pondBottom = 94.3; L.pondTW = { 2: 95, 5: 95.5, 10: 96, 25: 96.5, 50: 97, 100: 97.5 };
    L.pre = { C: 0.15, A: 12 * 10 * TILE_AC, Lov: 300, N: 0.40, S: 0.004, Lch: 700 };
    L.design = 10; L.detDesign = 25; L.check = 100; L.budget = 560000; L.suggests = 1;
    L.tools = ['inspect', 'inlet', 'pipe', 'ditch', 'culvert', 'pond', 'outlet', 'demolish'];
    L.goal = 'Design it all: street inlets and storm sewer to a detention pond, a roadside ditch on the collector, the creek culvert, and a 100-yr check that keeps every house dry.';
    L.lesson = 'Real projects combine every piece. Inlets and pipes are designed for the 10-yr storm, the culvert for the 25-yr, the pond for the 25-yr peak match, and TxDOT says all facilities must be evaluated to the 1% AEP (100-yr) flood. Surprise: the forecast says 10-yr, but the 100-yr check is coming.';
    L.tip = 'The 100-yr check is about houses, not spread: deep sags and overflowing manholes flood lots.';
    L.hints = ['Streets: inlets near the low end of the main street and the side street, and at any sag.', 'Pipes: branch to a junction and run the trunk to the pond outfall tile (marked) inside the open area; pond blocks around it with an outlet to the creek.', 'Ditch the collector road (column 12) on its west side down to the creek; culvert 2 x 48 in or bigger at the crossing.'];
    L.detIn = function (x, y) { return x < col && y < cr; };
    L.hintTiles = [L.pondSite, cr * W + col];
    return L;
  };
  var LEVEL_COUNT = 8;
  function finishLevel(L) {
    // site runoff totals for detention (post = everything on the site, at the design C values)
    if (L.pre) { var ca = 0; for (var i = 0; i < L.types.length; i++) if (!isWater(L.types[i]) && (!L.detIn || L.detIn(i % L.W, (i / L.W) | 0))) ca += LAND[L.types[i]].C * TILE_AC; L.postCA = ca; }
    if (L.inlets) { L.preInlets = L.inlets.slice(); }
    L.forecast = L.forecast || { yr: L.design, label: L.design + '-yr storm' };
    return L;
  }
  function makeLevel(n) { var L = finishLevel(LEVELS[n]()); L.id = n; return L; }
  function presetControls(L) { return (L.preInlets || []).map(function (t) { return { type: 'inlet', tile: t, len: 10, preset: true }; }); }

  // ---------- sandbox ----------
  function makeSandbox(d) {
    var W = 14, H = 12, L;
    if (d && d.W === W && d.H === H && Array.isArray(d.types) && d.types.length === W * H) {
      L = base(0, 'Sandbox', W, H, function (x, y) { return d.types[y * W + x]; }, function (x, y) { return +d.heights[y * W + x]; });
    } else {
      L = base(0, 'Sandbox', W, H, function (x, y) { return x === W - 1 ? (y === 3 ? 'X' : 'C') : y === 3 ? 'R' : y === 0 ? 'T' : 'H'; }, function (x, y) { return x === W - 1 ? (y === 3 ? 97.6 : 92 - 0.05 * y) : y === 3 ? 100 - 0.2 * x : 100.5 - 0.2 * x + 0.2 * Math.abs(y - 3) - (y === 0 ? 1 : 0); });
    }
    L.sandbox = true; L.design = d && HARRIS[d.storm] ? d.storm : 10; L.outfallInv = 90.5; L.tw = tws(93); L.budget = 999999;
    L.tools = ['inspect', 'inlet', 'pipe', 'ditch', 'culvert', 'pond', 'outlet', 'demolish'];
    L.culvert = { tile: 3 * W + W - 1, invIn: 89.5, roadEl: 97.4, design: L.design, houseEl: 99.5, Q: { 2: 70, 5: 100, 10: 125, 25: 160, 50: 190, 100: 220 }, tw: { 2: 92, 5: 92.5, 10: 93, 25: 93.5, 50: 94, 100: 94.5 } };
    if (L.types[L.culvert.tile] !== 'X') L.culvert = null;
    L.pondSite = (H - 2) * W + W - 3; L.preOptional = true; L.detDesign = null;
    L.pre = { C: 0.15, A: W * H * TILE_AC, Lov: 300, N: 0.40, S: 0.004, Lch: 600 };
    L.goal = 'Sandbox: shape the site, paint land use, place anything, pick a storm and run it.';
    L.tip = 'Try the same plan at the 2-yr and the 100-yr storm.'; L.hints = [];
    return finishLevel(L);
  }
  function sandboxData(L, controls) { return { W: L.W, H: L.H, types: L.types, heights: L.heights, storm: L.design, controls: controls }; }
  function editTile(L, i, op, paint) {
    if (op === 'raise') { if (L.heights[i] >= 115) return false; L.heights[i] = Math.round((L.heights[i] + 0.5) * 100) / 100; return true; }
    if (op === 'lower') { if (L.heights[i] <= 88) return false; L.heights[i] = Math.round((L.heights[i] - 0.5) * 100) / 100; return true; }
    if (op === 'paint') { if (L.types[i] === paint) return false; L.types[i] = paint; return true; }
    return false;
  }

  var api = { TILE_FT: TILE_FT, TILE_AC: TILE_AC, HARRIS: HARRIS, STORMS: STORMS, LAND: LAND, RULES: RULES, LININGS: LININGS, PIPE_IN: PIPE_IN, RCP: RCP, COST: COST, INLET_LEN: INLET_LEN,
    intensity: intensity, route: route, simulate: simulate, score: score, suggest: suggest, controlCost: controlCost, inletCost: inletCost, pipeCost: pipeCost, culvertCost: culvertCost, ditchCost: ditchCost, preDev: preDev,
    makeLevel: makeLevel, presetControls: presetControls, LEVEL_COUNT: LEVEL_COUNT, makeSandbox: makeSandbox, sandboxData: sandboxData, editTile: editTile, rng: rng, nb: nb, isWater: isWater };
  if (isNode) module.exports = api; else root.FlowSim = api;
})(typeof window !== 'undefined' ? window : globalThis);
