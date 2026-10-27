/* SWP3 Designer - pure simulation logic (no DOM). Deterministic given level + controls.
 * Units: tile = 50 ft x 50 ft (game scale). Heights in ft. Sediment in "game tons" (relative units).
 * Every rule is tagged with its basis in RULES (TxDOT first, then "game rule"). See rules-sources.md.
 */
(function (root) {
  'use strict';

  var TILE_FT = 50;
  var TILE_AC = TILE_FT * TILE_FT / 43560; // 0.0574 ac

  // ---- Rule constants (basis documented in rules-sources.md) ----
  var RULES = {
    fenceMaxAc: 2,          // TxDOT EC(1)-16 usage guidelines: not recommended for drainage area > 2 ac
    fenceTrap: 0.85,        // game rule
    fenceFailTrap: 0.05,    // game rule
    damHeightFt: 1.5,       // TxDOT Item 506 4.4.1.2 / EC(2)-16: Type 2 at least 18 in. high
    damTrap: 0.75,          // game rule
    damSpacingTrap: 0.35,   // game rule (too-wide spacing)
    damSheetTrap: 0.10,     // game rule (placed outside a ditch)
    damBlowoutSlope: 0.06,  // game rule (stand-in for EC(2) note on ~8 ft/s high velocity flows)
    inletMaxAc: 5,          // TxDOT EC(9)-16 log trap guideline: drainage area should not exceed 5 ac
    inletTrap: 0.60,        // game rule
    inletOverTrap: 0.15,    // game rule
    seedFactor: 0.40,       // game rule: seeded + mulched soil erodes at 40% of bare soil
    trackLoad: 15,          // game rule: mud tracked onto the road with no construction exit
    designStorm: '2-yr', goodReduction: 0.90, // game rule: 85% sediment reduction = full marks    // TxDOT EC(1)/EC(2): a 2-year storm may be used to calculate the flow rate
    tilePerAc: 1 / TILE_AC
  };

  // Costs: TxDOT low-bid statewide averages (Bid Tabulations on data.texas.gov, lets 2024-09 to 2026-10,
  // as already compiled in ../bid-cost/prices.json) times a game quantity per block.
  var CONTROLS = {
    fence: { name: 'Silt fence', short: 'Fence', cost: 285, qty: '50 LF', unitNote: '506 Temp Sedmt Cont Fence ~$5.71/LF x 50 LF' },
    dam: { name: 'Rock filter dam', short: 'Rock dam', cost: 985, qty: '20 LF', unitNote: '506 Rock Filter Dams Ty 2 ~$49.27/LF x 20 LF (game ditch width)' },
    inlet: { name: 'Inlet protection', short: 'Inlet', cost: 150, qty: '20 LF', unitNote: '506 Biodeg Erosn Cont Logs 12in ~$7.29/LF x 20 LF' },
    exit: { name: 'Construction exit', short: 'Exit', cost: 3430, qty: '111 SY', unitNote: '506 Construction Exits Ty 1 ~$30.87/SY x 50 ft x 20 ft' },
    seed: { name: 'Temp seeding + mulch', short: 'Seed', cost: 280, qty: '278 SY', unitNote: '164 temp seed ~$0.35/SY + 162 straw mulch ~$0.66/SY' }
  };

  // ---- Seeded RNG ----
  function rng(seed) {
    var s = (seed >>> 0) || 1;
    return function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  }

  var DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0]; // N E S W (grid y grows "south")

  // ---- Levels ----
  // types: G grass, S disturbed soil, R road, D ditch, C creek, I inlet, A site access (soil where trucks exit)
  function makeLevel(n) {
    var W = 20, H = 20, t = [], h = [], i, x, y;
    var r = rng(1000 + n);
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) { t.push('G'); h.push(0); }
    function set(x, y, ty) { t[y * W + x] = ty; }
    var L = { id: n, W: W, H: H, types: t, heights: h };
    if (n === 1) {
      // Gentle 2% plane sloping south. Disturbed pad in the middle, grass buffer, road at north.
      for (y = 0; y < H; y++) for (x = 0; x < W; x++) h[y * W + x] = 30 - y * 1.0 + (x % 2) * 0.01 + r() * 0.02;
      for (y = 3; y < 15; y++) for (x = 4; x < 16; x++) set(x, y, 'S');
      for (x = 0; x < W; x++) set(x, 0, 'R');
      set(9, 2, 'A'); set(9, 1, 'A');
      L.name = 'Pad on a gentle slope'; L.budget = 10000;
      L.forecast = { label: '2-yr storm', intensity: 1.0 }; L.actual = { label: '2-yr storm', intensity: 1.0 };
      L.goal = 'Stop sheet flow from leaving the south edge.';
      L.tip = 'Silt fence works for sheet flow on small drainage areas. TxDOT EC(1)-16: not recommended for more than 2 acres.';
      L.tutorial = true;
    } else if (n === 2) {
      // Site slopes east (4%) toward a roadside ditch running south at 1.5%. Road east of ditch.
      for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
        var base = 30 - y * 0.75;
        h[y * W + x] = x <= 14 ? base + (14 - x) * 2.0 + 1.0 : (x === 15 ? base : base + 1.2);
      }
      for (y = 0; y < H; y++) { set(15, y, 'D'); set(16, y, 'R'); set(17, y, 'R'); }
      for (y = 2; y < 18; y++) for (x = 2; x < 14; x++) set(x, y, 'S');
      set(14, 9, 'A');
      L.name = 'Roadside ditch'; L.budget = 14000;
      L.forecast = { label: '2-yr storm', intensity: 1.0 }; L.actual = { label: '2-yr storm', intensity: 1.0 };
      L.goal = 'The pad drains to a roadside ditch. Space rock filter dams so the ditch holds the sediment.';
      L.tip = 'Rock filter dam spacing depends on ditch slope: spacing = dam height / slope (game rule: top of the downstream dam level with the toe of the upstream dam).';
    } else {
      // Steep 8% slope south to a road with a curb inlet, then a grass bank down to a creek.
      for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
        var z;
        if (y < 13) z = 60 - y * 4.0;
        else if (y === 13) z = 8.0;
        else if (y === 14) z = (x >= 8 && x <= 12) ? 6.6 + 0.05 * Math.abs(x - 10) : (x === 7 || x === 13 ? 7.0 : 6.2);
        else if (y === 15) z = (x >= 8 && x <= 12) ? 7.3 : 5.0;
        else z = 4.5 - (y - 16) * 1.5;
        h[y * W + x] = z + r() * 0.02;
      }
      for (y = 1; y < 13; y++) for (x = 3; x < 17; x++) set(x, y, 'S');
      for (x = 0; x < W; x++) { set(x, 13, 'R'); set(x, 14, 'R'); }
      set(10, 14, 'I'); h[14 * W + 10] = 6.3;
      for (x = 0; x < W; x++) { set(x, 18, 'C'); set(x, 19, 'C'); }
      set(10, 12, 'A');
      L.name = 'Steep slope above a creek'; L.budget = 16000;
      L.forecast = { label: '2-yr storm', intensity: 1.0 }; L.actual = { label: '10-yr storm', intensity: 1.5 };
      L.goal = 'Protect the inlet and the creek. Watch the drainage areas on this steep slope.';
      L.tip = 'TxDOT sheets size these controls with a 2-yr storm. Bigger storms load every device harder, so leave margin on drainage area.';
    }
    return L;
  }

  // ---- Flow direction (D4 steepest descent) ----
  function isSink(type) { return type === 'C' || type === 'I'; }

  function flowDirections(L) {
    var W = L.W, H = L.H, n = W * H, dir = new Array(n), sink = new Array(n);
    for (var i = 0; i < n; i++) {
      var x = i % W, y = (i / W) | 0;
      if (isSink(L.types[i])) { dir[i] = -1; sink[i] = L.types[i] === 'C' ? 'creek' : 'inlet'; continue; }
      var best = -1, bestDrop = 0, d, nx, ny;
      for (var d = 0; d < 4; d++) {
        nx = x + DX[d]; ny = y + DY[d];
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        var j = ny * W + nx, drop = L.heights[i] - L.heights[j];
        if (drop > bestDrop + 1e-9) { bestDrop = drop; best = j; }
      }
      // Boundary: a virtual outside neighbor continues the inward gradient, so runoff can leave the grid.
      for (d = 0; d < 4; d++) {
        nx = x + DX[d]; ny = y + DY[d];
        if (nx >= 0 && ny >= 0 && nx < W && ny < H) continue;
        var ox = x - DX[d], oy = y - DY[d];
        if (ox < 0 || oy < 0 || ox >= W || oy >= H) continue;
        var odrop = L.heights[oy * W + ox] - L.heights[i];
        if (odrop > bestDrop + 1e-9) { bestDrop = odrop; best = -2; }
      }
      if (best === -2) { dir[i] = -1; sink[i] = 'offsite'; continue; }
      dir[i] = best;
      if (best < 0) sink[i] = (x === 0 || y === 0 || x === W - 1 || y === H - 1) ? 'offsite' : 'pond';
    }
    return { dir: dir, sink: sink };
  }

  function topoOrder(L) {
    var idx = [];
    for (var i = 0; i < L.W * L.H; i++) idx.push(i);
    idx.sort(function (a, b) { return (L.heights[b] - L.heights[a]) || (a - b); });
    return idx;
  }

  // Number of tiles (incl. itself) draining through each tile
  function flowAccumulation(L, dir) {
    var acc = new Array(L.W * L.H).fill(1), ord = topoOrder(L);
    for (var k = 0; k < ord.length; k++) { var i = ord[k]; if (dir[i] >= 0) acc[dir[i]] += acc[i]; }
    return acc;
  }

  function slopeOf(L, dir, i) {
    if (dir[i] < 0) return 0;
    return Math.max(0, (L.heights[i] - L.heights[dir[i]]) / TILE_FT);
  }

  function erosion(L, dir, i, intensity, seeded) {
    var ty = L.types[i], s = slopeOf(L, dir, i) * 100; // percent
    var k = ty === 'S' || ty === 'A' ? 1 : ty === 'G' ? 0.03 : ty === 'D' ? 0.6 : 0; // game rule: freshly graded, unlined ditch
    if (!k) return 0;
    var e = k * intensity * (0.5 + s / 4);
    if (seeded && (ty === 'S' || ty === 'A')) e *= RULES.seedFactor;
    return e;
  }

  // ---- Control evaluation ----
  // controls: array of {type, tile}. fence acts on edge tile -> dir[tile].
  function evalControls(L, f, acc, controls, intensity) {
    var dir = f.dir, ev = {};
    var damAt = {};
    controls.forEach(function (c) { if (c.type === 'dam') damAt[c.tile] = true; });
    controls.forEach(function (c, k) {
      var i = c.tile, ty = L.types[i], effAc = acc[i] * TILE_AC * intensity, r = { status: 'ok', trap: 0, reason: '' };
      if (c.type === 'fence') {
        if (dir[i] < 0) { r.status = 'wasted'; r.reason = 'No runoff crosses here.'; }
        else if (ty === 'D') { r.status = 'undercut'; r.trap = RULES.fenceFailTrap; r.reason = 'Silt fence in a ditch sees concentrated flow and gets undercut. Use a rock filter dam (TxDOT EC(2)).'; }
        else if (effAc > RULES.fenceMaxAc) { r.status = 'overtopped'; r.trap = RULES.fenceFailTrap; r.reason = 'Drainage area to this fence is ' + effAc.toFixed(1) + ' ac' + (intensity > 1 ? ' (storm-adjusted)' : '') + '. TxDOT EC(1)-16 does not recommend silt fence above 2 ac; flow overtopped it.'; }
        else { r.trap = RULES.fenceTrap; r.reason = 'Sheet flow, ' + effAc.toFixed(2) + ' ac drainage area: fence holds.'; }
      } else if (c.type === 'dam') {
        if (ty === 'C') { r.status = 'violation'; r.reason = 'Placed in the creek. Game rule: no in-stream controls without a permit and plan detail (EC(2) Type 3 is only for stream use when shown on plans).'; }
        else if (ty !== 'D') { r.status = 'wasted'; r.trap = RULES.damSheetTrap; r.reason = 'Rock filter dam on sheet flow is wasted money; silt fence or seeding is the cheaper fit here.'; }
        else {
          var s = Math.max(slopeOf(L, dir, i), 0.001), maxSp = RULES.damHeightFt / s;
          r.slope = s; r.maxSpacingFt = maxSp;
          if (s > RULES.damBlowoutSlope) { r.status = 'blown out'; r.trap = 0.05; r.reason = 'Ditch slope ' + (s * 100).toFixed(1) + '% is too steep; high velocity washed the rock out (game rule; see EC(2)-16 note on ~8 ft/s flows).'; }
          else {
            // distance to the next dam downstream along the ditch
            var j = dir[i], steps = 1, found = false;
            while (j >= 0 && L.types[j] === 'D') { if (damAt[j]) { found = true; break; } j = dir[j]; steps++; }
            r.spacingFt = found ? steps * TILE_FT : null;
            if (found && steps * TILE_FT > maxSp + 1e-6) { r.status = 'spacing'; r.trap = RULES.damSpacingTrap; r.reason = 'Next dam is ' + steps * TILE_FT + ' ft downstream; at ' + (s * 100).toFixed(1) + '% slope an 18 in. dam only backs water ' + Math.round(maxSp) + ' ft. Sediment scoured between dams.'; }
            else { r.trap = RULES.damTrap; r.reason = 'Concentrated flow in a ditch, spacing OK (max ' + Math.round(maxSp) + ' ft at ' + (s * 100).toFixed(1) + '%).'; }
          }
        }
      } else if (c.type === 'inlet') {
        if (ty !== 'I') { r.status = 'wasted'; r.reason = 'Inlet protection only works on an inlet.'; }
        else if (effAc > RULES.inletMaxAc) { r.status = 'overtopped'; r.trap = RULES.inletOverTrap; r.reason = 'Drainage area ' + effAc.toFixed(1) + ' ac exceeds the 5 ac log-trap guideline (TxDOT EC(9)-16); flow bypassed.'; }
        else { r.trap = RULES.inletTrap; r.reason = 'Inlet protected (' + effAc.toFixed(1) + ' ac).'; }
      } else if (c.type === 'exit') {
        if (ty !== 'A') { r.status = 'wasted'; r.reason = 'Construction exits go where trucks leave the site (marked access tile).'; }
        else r.reason = 'Trucks leave clean; no mud tracked onto the road.';
      } else if (c.type === 'seed') {
        if (ty !== 'S' && ty !== 'A') { r.status = 'wasted'; r.reason = 'Only bare disturbed soil needs temporary seeding.'; }
        else r.reason = 'Seed + mulch cut erosion on this tile.';
      }
      ev[k] = r;
    });
    return ev;
  }

  function simulate(L, controls, opts) {
    opts = opts || {};
    controls = controls || [];
    var intensity = opts.intensity != null ? opts.intensity : L.actual.intensity;
    var n = L.W * L.H, f = flowDirections(L), dir = f.dir, acc = flowAccumulation(L, dir);
    var ev = evalControls(L, f, acc, controls, intensity);
    var seeded = {}, tileCtl = {}, fenceCtl = {}, exitOK = false;
    controls.forEach(function (c, k) {
      if (c.type === 'seed') seeded[c.tile] = true;
      else if (c.type === 'fence') (fenceCtl[c.tile] = fenceCtl[c.tile] || []).push(k);
      else if (c.type === 'exit') { if (ev[k].status === 'ok') exitOK = true; }
      else (tileCtl[c.tile] = tileCtl[c.tile] || []).push(k);
    });
    var load = new Array(n).fill(0), passed = new Array(n).fill(0), gen = new Array(n).fill(0);
    var out = { creek: 0, inlet: 0, offsite: 0, pond: 0, trapped: 0, tracked: 0 };
    var trappedBy = {};
    var ord = topoOrder(L);
    for (var q = 0; q < ord.length; q++) {
      var i = ord[q];
      gen[i] = erosion(L, dir, i, intensity, seeded[i]);
      var s = load[i] + gen[i];
      (tileCtl[i] || []).forEach(function (k) { var t = s * ev[k].trap; trappedBy[k] = (trappedBy[k] || 0) + t; s -= t; });
      if (dir[i] >= 0) {
        (fenceCtl[i] || []).forEach(function (k) { var t = s * ev[k].trap; trappedBy[k] = (trappedBy[k] || 0) + t; s -= t; });
        passed[i] = s; load[dir[i]] += s;
      } else { passed[i] = s; out[f.sink[i]] += s; }
    }
    var hasAccess = L.types.indexOf('A') >= 0;
    if (hasAccess && !exitOK) out.tracked = RULES.trackLoad * intensity;
    for (var k in trappedBy) out.trapped += trappedBy[k];
    var discharge = out.creek + out.inlet + out.offsite + out.tracked;
    var cost = controls.reduce(function (a, c) { return a + CONTROLS[c.type].cost; }, 0);
    return { dir: dir, sink: f.sink, acc: acc, gen: gen, passed: passed, out: out, discharge: discharge,
      evals: ev, trappedBy: trappedBy, cost: cost, intensity: intensity };
  }

  function score(L, controls, opts) {
    var res = simulate(L, controls, opts);
    var base = simulate(L, [], opts);
    var R = base.discharge > 0 ? Math.max(0, 1 - res.discharge / base.discharge) : 1;
    var budgetLeft = Math.max(0, 1 - res.cost / L.budget);
    var violations = 0, wasted = 0, failed = [];
    for (var k in res.evals) {
      var e = res.evals[k];
      if (e.status === 'violation') violations++;
      if (e.status === 'wasted') wasted++;
      if (e.status !== 'ok') failed.push({ index: +k, control: controls[k], status: e.status, reason: e.reason });
    }
    if (res.out.tracked > 0) failed.push({ index: -1, control: null, status: 'missing', reason: 'No construction exit: trucks tracked mud onto the road (TxDOT Item 506 4.4.4 construction exits).' });
    var sc = Math.round(90 * Math.min(1, R / RULES.goodReduction) + 10 * budgetLeft) - 25 * violations - 3 * wasted - 4 * (failed.length - violations - wasted - (res.out.tracked > 0 ? 1 : 0)) - (res.out.tracked > 0 ? 8 : 0);
    if (res.cost > L.budget) sc -= 20;
    sc = Math.max(0, Math.min(100, sc));
    var stars = sc >= 85 && failed.length === 0 ? 3 : sc >= 85 ? 2 : sc >= 65 ? 2 : sc >= 40 ? 1 : 0;
    return { score: sc, stars: stars, reduction: R, result: res, baseline: base, failed: failed, violations: violations, wasted: wasted };
  }

  var api = { TILE_FT: TILE_FT, TILE_AC: TILE_AC, RULES: RULES, CONTROLS: CONTROLS, rng: rng, makeLevel: makeLevel,
    flowDirections: flowDirections, flowAccumulation: flowAccumulation, slopeOf: slopeOf, erosion: erosion,
    evalControls: evalControls, simulate: simulate, score: score, topoOrder: topoOrder, LEVEL_COUNT: 3 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SWP3 = api;
})(this);
