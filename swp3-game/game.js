/* SWP3 Designer - rendering, input and game flow. Logic lives in sim.js (window.SWP3). */
(function () {
  'use strict';
  var S = window.SWP3;
  var P = window.SWP3Pick;
  var A = window.SWP3Art, TW = A.TW, TH = A.TH, BASE = A.BASE, U = TW / 32; // iso tile size in art pixels (64x32), slab thickness; U = art scale vs v1
  var SAVE_KEY = 'swp3-game-v1';
  var $ = function (id) { return document.getElementById(id); };

  // ---------- palette ----------
  var PAL = {
    G: ['#6aa84f', '#4f7d3a', '#3d6230'], S: ['#a87444', '#7d5432', '#634126'], A: ['#a87444', '#7d5432', '#634126'],
    R: ['#7b7b80', '#5c5c61', '#48484c'], D: ['#8a6a3c', '#6a502c', '#523e22'], C: ['#3f7fbf', '#2e6194', '#244c75'],
    I: ['#7b7b80', '#5c5c61', '#48484c']
  };
  var SPECK = { G: ['#7fbf5f', '#55913f', '#9ccf6a'], S: ['#b98552', '#8f6038', '#c79a62'], A: ['#b98552', '#8f6038'],
    R: ['#8a8a8f', '#6a6a70'], D: ['#9c7a48', '#73572f', '#6a8a44'], C: ['#6aa6e0', '#2e6194', '#a8d0f0'], I: ['#8a8a8f'] };

  // ---------- tool definitions (info card text; numbers verified in rules-sources.md) ----------
  var TOOLS = [
    { id: 'inspect', icon: '🔍', label: 'Inspect' },
    { id: 'fence', label: 'Fence', rule: 'Place on a tile: the fence snaps to the tile edge water flows across (downslope edge, perpendicular to flow). Works for SHEET flow only. Fails in a ditch (undercut) or when drainage area is over 2 ac (overtopped).',
      basis: 'TxDOT EC(1)-16 Sediment Control Fence Usage Guidelines: place near the downstream perimeter along a contour for overland (sheet) runoff; not recommended for drainage area larger than 2 acres; size for 100 GPM/ft²; 2-yr storm may be used. TxDOT 2024 Spec Item 506.4.4.8: posts 6–8 ft apart.',
      game: 'Game rule: a working fence traps 85% of passing sediment, a failed one 5%.' },
    { id: 'dam', label: 'Rock dam', rule: 'Place in DITCH tiles (concentrated flow). Spacing rule: next dam downstream no farther than dam height ÷ ditch slope (18 in. dam at 1.5% → 100 ft = 2 tiles). Too far apart = sediment scours between dams. On sheet flow = wasted. In the creek = violation.',
      basis: 'TxDOT 2024 Spec Item 506.4.4.1: Types 1 & 2 at least 18 in. high, 2 ft top width, slopes 2:1 or flatter. TxDOT EC(2)-16: Type 2 (18 in., wire mesh) for ditches and swale outlets; Type 1 recommended for ≤5 ac; Type 1 not for high velocity (~8 ft/s); Type 3 (36 in.) for stream flow only as shown on plans.',
      game: 'Game rule: spacing = height ÷ slope (downstream dam top level with upstream toe, common check-dam practice); trap 75% ok / 35% too far; blown out above 6% ditch slope; any dam in the creek is a violation in this game.' },
    { id: 'inlet', label: 'Inlet', rule: 'Place on the storm INLET tile. Holds sediment if the inlet\u2019s drainage area is 5 ac or less; bigger areas (or bigger storms) bypass it.',
      basis: 'TxDOT EC(9)-16 Erosion Control Log: logs at drop/curb inlets; log sediment trap drainage area should not exceed 5 acres; trap capacity 1,800 CF/ac.',
      game: 'Game rule: traps 60% when ok, 15% when overtopped. Drainage area is scaled by storm size vs. the 2-yr design storm.' },
    { id: 'exit', label: 'Exit', rule: 'Place on the orange SITE ACCESS tile where trucks leave. Without it, mud is tracked onto the road.',
      basis: 'TxDOT 2024 Spec Item 506.4.4: construction exits at least 14 ft wide one-way / 20 ft two-way; Type 1 at least 8 in. deep crushed aggregate. TxDOT EC(3)-16: Type 1 length not less than 50 ft, graded to drain to a sediment trapping device.',
      game: 'Game rule: a missing exit adds a fixed tracked-mud load.' },
    { id: 'seed', label: 'Seed', rule: 'Temporary seeding + straw mulch on bare soil. Cheap, but it GROWS IN: mulch only at first, full grass cover after 2 storms. Seed early, then revise around it.',
      basis: 'TxDOT 2024 Spec Item 506.4.3.2: initiate stabilization of disturbed areas no more than 14 days after work there stops (per TPDES CGP TXR150000). Prices from TxDOT bid tabs (Items 164 / 162).',
      game: 'Game rule: erosion is 80% of bare soil on the first storm, 60% on the second, 40% once grown in (each Rain Check counts as a storm).' },
    { id: 'basin', label: 'Basin', rule: 'Dig at a LOW POINT where flow collects (at least 0.75 ac). Handles big concentrated flows the fences cannot, but it is expensive. Size: 3,600 cf per acre drained; one basin holds 10,800 cf (3 ac). Bigger drainage area (or a bigger storm) = undersized and overtopped.',
      basis: 'TxDOT 2024 Spec Item 506.4.4.5.1: sediment basins provide 3,600 cf of storage per acre drained (required where 10 or more acres are disturbed at one time). Cost from TxDOT bid tabs (Item 506 earthwork for erosion & sediment control).',
      game: 'Game rule: one basin block = 10,800 cf; traps 85% when sized OK, 20% when undersized; needs at least 0.75 ac draining to it; in the creek = violation.' },
    { id: 'washout', label: 'Washout', rule: 'Concrete truck washout pit. Needed on sites with concrete work. Keep it at least 50 ft (1 tile, diagonals too) away from storm inlets, ditches and the creek.',
      basis: 'No TxDOT number verified for this. EPA Stormwater BMP fact sheet "Concrete Washout" (epa.gov): washout facilities should not be placed within 50 ft of storm drains, open ditches, or waterbodies.',
      game: 'Game rule: a missing or too-close washout adds a fixed washwater load; cost $650 is a game value.' },
    { id: 'demolish', icon: '✖', label: 'Remove' }
  ];

  var SB_TOOLS = [
    { id: 'raise', icon: '⬆', label: 'Raise', help: '<b>Raise:</b> tap a tile to raise it 1 ft. Water flows to the lowest neighbor (flow view ≋ updates).' },
    { id: 'lower', icon: '⬇', label: 'Lower', help: '<b>Lower:</b> tap a tile to lower it 1 ft. Dig a low point to collect flow for a basin.' },
    { id: 'p:S', paint: 'S', label: 'Pad', help: '<b>Paint disturbed soil (pad):</b> bare soil erodes.' },
    { id: 'p:G', paint: 'G', label: 'Grass', help: '<b>Paint grass:</b> undisturbed, barely erodes.' },
    { id: 'p:D', paint: 'D', label: 'Ditch', help: '<b>Paint ditch:</b> concentrated flow; rock filter dams go here. Lower the tiles so water follows it.' },
    { id: 'p:R', paint: 'R', label: 'Road', help: '<b>Paint road.</b>' },
    { id: 'p:C', paint: 'C', label: 'Creek', help: '<b>Paint creek:</b> water of the state; flow that reaches it is discharged.' },
    { id: 'p:I', paint: 'I', label: 'Inlet', help: '<b>Paint storm inlet:</b> flow that reaches it is discharged unless protected.' },
    { id: 'p:A', paint: 'A', label: 'Access', help: '<b>Paint site access:</b> trucks leave here; needs a construction exit.' }
  ];
  function findTool(id) { return TOOLS.concat(SB_TOOLS).filter(function (x) { return x.id === id; })[0]; }

  // ---------- state ----------
  var G = {
    level: null, L: null, controls: [], history: [], tool: 'fence', phase: 'plan',
    zoom: 2, panX: 0, panY: 0, flowView: false, sim: null, scoreRes: null,
    particles: [], deposits: [], speed: 1, stormT: 0, stormDur: 9, born: {}, selTile: -1, hoverTile: -1, flash: 0
  };
  var progress = loadProgress();

  function loadProgress() {
    try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || { stars: {} }; } catch (e) { return { stars: {} }; }
  }
  function saveProgress() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(progress)); } catch (e) { /* private mode */ } }

  // ---------- canvas ----------
  var view = $('view'), vctx = view.getContext('2d');
  var buf = document.createElement('canvas'), bctx = buf.getContext('2d');
  var terrain = document.createElement('canvas'), tctx = terrain.getContext('2d');
  var geo = null; // per-level geometry
  var dpr = 1;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    var r = view.getBoundingClientRect();
    view.width = Math.max(1, Math.round(r.width * dpr));
    view.height = Math.max(1, Math.round(r.height * dpr));
  }

  function buildGeometry(L) {
    var minH = Infinity, maxH = -Infinity, i;
    for (i = 0; i < L.heights.length; i++) { minH = Math.min(minH, L.heights[i]); maxH = Math.max(maxH, L.heights[i]); }
    var zs = Math.min(4 * U, 110 * U / Math.max(1, maxH - minH));
    var z = L.heights.map(function (h) { return Math.round((h - minH) * zs); });
    var maxZ = Math.max.apply(null, z);
    var w = (L.W + L.H) * TW / 2 + 16, h = (L.W + L.H) * TH / 2 + maxZ + BASE + 24;
    return { z: z, zs: zs, w: w, h: h, ox: L.H * TW / 2 + 8, oy: maxZ + 12 };
  }
  function tileTop(x, y) { // top corner of a tile's top face
    var i = y * G.L.W + x;
    return { x: geo.ox + (x - y) * TW / 2, y: geo.oy + (x + y) * TH / 2 - geo.z[i] };
  }
  function tileCenter(i) { var p = tileTop(i % G.L.W, (i / G.L.W) | 0); return { x: p.x, y: p.y + TH / 2 }; }

  function poly(ctx, pts, fill) { ctx.fillStyle = fill; ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); for (var k = 2; k < pts.length; k += 2) ctx.lineTo(pts[k], pts[k + 1]); ctx.closePath(); ctx.fill(); }

  function drawTerrain() {
    var L = G.L; terrain.width = geo.w; terrain.height = geo.h;
    A.drawTerrain(tctx, { W: L.W, H: L.H, types: L.types, z: geo.z, ox: geo.ox, oy: geo.oy, w: geo.w, h: geo.h });
    G.creekTiles = []; G.accessTiles = [];
    for (var i = 0; i < L.types.length; i++) { if (L.types[i] === 'C') G.creekTiles.push(i); if (L.types[i] === 'A') G.accessTiles.push(i); }
  }
  function drawCreek(ctx, t) { // animated pixel ripples
    for (var k = 0; k < G.creekTiles.length; k++) {
      var i = G.creekTiles[k], p = tileTop(i % G.L.W, (i / G.L.W) | 0);
      for (var q = 0; q < 3; q++) {
        var ph = ((t / 1600 + A.hash(i, q, 51)) % 1), u = 0.15 + 0.7 * ph, v = 0.2 + 0.6 * A.hash(i, q, 52), w = A.at(p, u, v);
        var a = Math.sin(ph * Math.PI); ctx.fillStyle = 'rgba(200,232,255,' + (0.55 * a).toFixed(2) + ')'; ctx.fillRect(Math.round(w.x) - 3, Math.round(w.y), 6, 1);
        ctx.fillStyle = 'rgba(30,70,120,' + (0.35 * a).toFixed(2) + ')'; ctx.fillRect(Math.round(w.x) - 2, Math.round(w.y) + 1, 4, 1);
      }
    }
  }

  // ---------- control sprites ----------
  function edgeCorners(i, j) {
    var W = G.L.W, x = i % W, y = (i / W) | 0, p = tileTop(x, y);
    var T = [p.x, p.y], R = [p.x + TW / 2, p.y + TH / 2], B = [p.x, p.y + TH], Lf = [p.x - TW / 2, p.y + TH / 2];
    var d = j - i;
    if (d === -W) return [T, R]; if (d === 1) return [R, B]; if (d === W) return [Lf, B]; if (d === -1) return [T, Lf];
    return [Lf, B];
  }
  function drawControl(ctx, c, k, t) {
    var i = c.tile, W = G.L.W, p = tileTop(i % W, (i / W) | 0), bornAt = G.born[k], prog = 1;
    if (bornAt != null) prog = Math.max(0, Math.min(1, (t - bornAt) / buildMs(c.type)));
    var o = { prog: prog, t: t, age: (G.round || 0) - (c.round || 0) };
    if (c.type === 'fence') { var dir = G.simDir[i]; o.edge = edgeCorners(i, dir >= 0 ? dir : i + W); }
    A.drawControl(ctx, c.type, p, o);
  }
  // ---------- live storm water (visual; driven by the sim result) ----------
  function wetness() {
    if (G.phase === 'report') return 0.35;
    var f = G.stormT / G.stormDur; return f < 0.3 ? f / 0.3 : f < 0.75 ? 1 : Math.max(0.35, 1 - (f - 0.75) * 2);
  }
  function prepWater() {
    var sim = G.sim, n = sim.acc.length, conc = new Array(n), mx = 1e-9, i;
    for (i = 0; i < n; i++) { conc[i] = sim.passed[i] / Math.max(0.2, sim.acc[i] * sim.intensity); if (G.L.types[i] !== 'C') mx = Math.max(mx, conc[i]); }
    for (i = 0; i < n; i++) conc[i] = Math.min(1, conc[i] / mx * 1.4);
    G.wConc = conc; G.wSim = sim;
  }
  function drawWater(ctx, t) {
    if (G.wSim !== G.sim) prepWater();
    var sim = G.sim, L = G.L, W = L.W, wet = wetness(), conc = G.wConc;
    for (var i = 0; i < L.types.length; i++) {
      var ty = L.types[i]; if (ty === 'C') continue;
      var flow = sim.acc[i] * S.TILE_AC * sim.intensity, a = wet * Math.min(0.72, 0.3 + 0.24 * Math.log(1 + flow * 8));
      if (ty === 'G') a *= 0.45; if (a < 0.03) continue;
      var c = conc[i], rr = Math.round(70 + 100 * c), gg = Math.round(130 - 40 * c), bb = Math.round(200 - 140 * c), p = tileTop(i % W, (i / W) | 0);
      A.diamond(ctx, p, 0.1, 'rgba(' + rr + ',' + gg + ',' + bb + ',' + a.toFixed(2) + ')');
      // sheet-flow shimmer moving downslope
      var j = sim.dir[i]; if (j < 0 || a < 0.12) continue;
      var dx = (j % W) - (i % W), dy = ((j / W) | 0) - ((i / W) | 0);
      for (var q = 0; q < 2; q++) { var ph = (t / 900 + A.hash(i, q, 61)) % 1, u = 0.5 + dx * (ph - 0.5) * 0.8 + (dy ? (A.hash(i, q, 62) - 0.5) * 0.6 : 0), v = 0.5 + dy * (ph - 0.5) * 0.8 + (dx ? (A.hash(i, q, 63) - 0.5) * 0.6 : 0), w = A.at(p, u, v);
        ctx.fillStyle = 'rgba(230,245,255,' + (0.7 * Math.sin(ph * Math.PI) * wet).toFixed(2) + ')'; ctx.fillRect(Math.round(w.x) - 2, Math.round(w.y), 4, 1); }
    }
    // rain splashes on the ground
    if (G.phase === 'storm' && G.stormT < G.stormDur * 0.75) {
      var n = Math.round(40 * sim.intensity);
      for (var k = 0; k < n; k++) { var seed = Math.floor(t / 120) * 131 + k, ti = (A.hash(seed, 1, 71) * L.types.length) | 0, pp = tileTop(ti % W, (ti / W) | 0), sp = A.at(pp, A.hash(seed, 2, 71), A.hash(seed, 3, 71)), fr = (t % 120) / 120;
        ctx.fillStyle = 'rgba(220,240,255,' + (0.8 * (1 - fr)).toFixed(2) + ')'; var rad = 1 + Math.round(fr * 3); ctx.fillRect(Math.round(sp.x) - rad, Math.round(sp.y), 1, 1); ctx.fillRect(Math.round(sp.x) + rad, Math.round(sp.y), 1, 1); ctx.fillRect(Math.round(sp.x), Math.round(sp.y) - 1 - Math.round(fr * 2), 1, 1); }
    }
  }
  // ponding behind controls + overtopping / blowout / undercut effects matching each control's sim status
  function drawControlWater(ctx, t) {
    var sim = G.sim, ev = sim.evals || {}, wet = wetness(), W = G.L.W;
    G.controls.forEach(function (c, k) {
      var e = ev[k]; if (!e || ['fence', 'dam', 'basin', 'inlet'].indexOf(c.type) < 0) return;
      var p = tileTop(c.tile % W, (c.tile / W) | 0), cen = tileCenter(c.tile), lvl = Math.min(1, wet * (0.4 + Math.min(0.6, sim.acc[c.tile] * S.TILE_AC * sim.intensity / 3)));
      if (e.status === 'wasted' || e.status === 'violation') return;
      var mud = e.status === 'ok' ? 0.9 : 0.6;
      if (c.type !== 'inlet') { A.diamond(ctx, p, 0.42 - 0.3 * lvl, 'rgba(' + Math.round(120 + 40 * mud) + ',' + Math.round(96 + 10 * mud) + ',' + Math.round(70) + ',' + (0.55 + 0.25 * lvl).toFixed(2) + ')');
        for (var q = 0; q < 3; q++) { var ph = (t / 1100 + q / 3) % 1, w = A.at(p, 0.3 + 0.4 * A.hash(k, q, 81), 0.3 + 0.4 * ph); ctx.fillStyle = 'rgba(240,220,190,.6)'; ctx.fillRect(Math.round(w.x) - 2, Math.round(w.y), 4, 1); } }
      var dir = sim.dir[c.tile], dn = dir >= 0 ? tileCenter(dir) : { x: cen.x - 10, y: cen.y + 10 }, ex = (cen.x + dn.x) / 2, ey = (cen.y + dn.y) / 2;
      var bad = e.status === 'overtopped' || e.status === 'undersized' || e.status === 'blown out' || e.status === 'undercut' || e.status === 'spacing';
      if (!bad || G.phase !== 'storm') return;
      for (var f = 0; f < 14; f++) { // spill / jets over the downstream edge
        var ph2 = ((t / 500) + A.hash(k, f, 91)) % 1, ox = (A.hash(k, f, 92) - 0.5) * 30, x = ex + ox + (dn.x - cen.x) * 0.4 * ph2, y = ey + (dn.y - cen.y) * 0.4 * ph2 - (e.status === 'undercut' ? -2 : 8 * (1 - ph2) * (1 - ph2));
        ctx.fillStyle = f % 3 ? 'rgba(250,250,255,.85)' : 'rgba(170,120,70,.9)'; ctx.fillRect(Math.round(x), Math.round(y), 2, 1);
      }
      if (e.status === 'blown out') for (f = 0; f < 6; f++) { var ph3 = ((t / 900) + f / 6) % 1; ctx.fillStyle = '#a9a9a4'; ctx.fillRect(Math.round(cen.x + (dn.x - cen.x) * ph3 + (f - 3) * 4), Math.round(cen.y + (dn.y - cen.y) * ph3 - 3 * Math.sin(ph3 * Math.PI)), 3, 2); }
    });
  }

  // ---------- site crew (visual only; capped sprite count) ----------
  function initCrew() {
    var L = G.L, pad = [], i; G.crew = []; G.mud = []; G.truck = null; G.truckNext = performance.now() + 2500;
    for (i = 0; i < L.types.length; i++) if (L.types[i] === 'S') pad.push(i);
    G.pad = pad; var r = S.rng(99 + L.id);
    for (var k = 0; k < Math.min(3, pad.length); k++) { var c = tileCenter(pad[(r() * pad.length) | 0]); G.crew.push({ x: c.x, y: c.y, tx: c.x, ty: c.y, wait: r() * 2, f: 0, act: 'idle', face: 1, vest: ['#ff7a1a', '#d9ff3a', '#ff7a1a'][k] }); }
    var a = G.accessTiles[0], park = -1;
    if (a != null) { var W = L.W, cand = [a - W, a - 1, a + 1, a + W, a - 2 * W]; for (k = 0; k < cand.length; k++) if (cand[k] >= 0 && L.types[cand[k]] === 'S') { park = cand[k]; break; } }
    if (park < 0 && pad.length) park = pad[(pad.length / 3) | 0];
    G.exPark = park; G.crewRng = r;
  }
  function exitOk() { var a = G.accessTiles; return G.controls.some(function (c) { return c.type === 'exit' && a.indexOf(c.tile) >= 0; }); }
  function drawCrew(ctx, t, dt) {
    if (!G.crew) initCrew();
    var k, w, r = G.crewRng;
    G.accessTiles.forEach(function (a) { var pp = tileTop(a % G.L.W, (a / G.L.W) | 0), c1 = A.at(pp, 0.2, 0.2), c2 = A.at(pp, 0.8, 0.8); A.drawCone(ctx, c1.x, c1.y); A.drawCone(ctx, c2.x, c2.y); });
    // excavator: parked near the access, digging idly; swings faster while building big items
    var busy = false;
    G.controls.forEach(function (c, j) { var b = G.born[j]; if (b != null && t - b < buildMs(c.type) && (c.type === 'basin' || c.type === 'dam' || c.type === 'exit')) busy = c; });
    if (busy) { var bp = tileCenter(busy.tile); A.drawExcavator(ctx, bp.x - 30, bp.y + 4, t / 160); }
    else if (G.exPark >= 0) { var ep = tileCenter(G.exPark); A.drawExcavator(ctx, ep.x, ep.y + 4, t / 900); }
    // build crews: two workers hammering at each control under construction (max 3 builds shown)
    var shown = 0;
    for (var j = G.controls.length - 1; j >= 0 && shown < 3; j--) {
      var b = G.born[j], c = G.controls[j]; if (b == null || t - b > buildMs(c.type)) continue; shown++;
      var cp = tileCenter(c.tile), fr = Math.floor(t / 140);
      A.drawWorker(ctx, cp.x - 20, cp.y + 2, fr, 'hammer', 1); A.drawWorker(ctx, cp.x + 20, cp.y - 2, fr + 1, 'hammer', -1, '#d9ff3a');
      if (G.lastHammer !== fr && fr % 2 === 0 && G.phase === 'plan') { G.lastHammer = fr; if (window.SWP3Sound) SWP3Sound.play('hammer'); }
    }
    // idle crew wander the pad (they shelter during the storm)
    for (k = 0; k < (G.phase === 'storm' ? 0 : G.crew.length); k++) {
      w = G.crew[k]; var dx = w.tx - w.x, dy = w.ty - w.y, d = Math.hypot(dx, dy);
      if (d > 1) { var sp = Math.min(d, 18 * dt); w.x += dx / d * sp; w.y += dy / d * sp; w.act = 'walk'; w.face = dx >= 0 ? 1 : -1; }
      else { w.act = w.wait > 1.2 && k === 1 ? 'hammer' : 'idle'; w.wait -= dt; if (w.wait <= 0 && G.pad.length) { var c2 = tileCenter(G.pad[(r() * G.pad.length) | 0]); var m = Math.min(1, 70 / Math.max(1, Math.hypot(c2.x - w.x, c2.y - w.y))); w.tx = w.x + (c2.x - w.x) * m; w.ty = w.y + (c2.y - w.y) * m; w.wait = 1 + r() * 3; } }
      A.drawWorker(ctx, w.x, w.y, Math.floor(t / 180) + k, w.act, w.face, w.vest);
    }
    // dump truck tracks mud out when there is no stabilized exit (matches the sim's tracked-mud penalty)
    var noExit = G.accessTiles.length && !exitOk();
    if (!G.truck && noExit && G.phase !== 'storm' && t > G.truckNext) {
      var a = G.accessTiles[0], ac = tileCenter(a), best = -1, bd = 1e9;
      for (var i = 0; i < G.L.types.length; i++) if (G.L.types[i] === 'R') { var rc = tileCenter(i), dd = Math.hypot(rc.x - ac.x, rc.y - ac.y); if (dd < bd) { bd = dd; best = i; } }
      if (best >= 0) { var rc2 = tileCenter(best); G.truck = { x0: ac.x, y0: ac.y, x1: ac.x + (rc2.x - ac.x) * 2.6, y1: ac.y + (rc2.y - ac.y) * 2.6, rx: rc2.x, ry: rc2.y, t0: t }; }
    }
    if (G.truck) {
      var T = G.truck, f2 = (t - T.t0) / 4200;
      if (f2 >= 1 || !noExit) { G.truck = null; G.truckNext = t + 6000; }
      else { var tx = T.x0 + (T.x1 - T.x0) * f2, ty = T.y0 + (T.y1 - T.y0) * f2;
        var pastRoad = Math.hypot(tx - T.x0, ty - T.y0) > Math.hypot(T.rx - T.x0, T.ry - T.y0) * 0.6;
        if (pastRoad && G.mud.length < 60 && Math.floor(t / 90) !== T.lastDrop) { T.lastDrop = Math.floor(t / 90); G.mud.push({ x: tx + (r() - 0.5) * 8, y: ty + (r() - 0.5) * 3, t: t }); }
        ctx.globalAlpha = f2 > 0.85 ? (1 - f2) / 0.15 : 1; A.drawTruck(ctx, tx, ty, T.x1 >= T.x0 ? 1 : -1, true); ctx.globalAlpha = 1; }
    }
    for (k = G.mud.length - 1; k >= 0; k--) { var m2 = G.mud[k], age = (t - m2.t) / 9000; if (age > 1 || !noExit) { G.mud.splice(k, 1); continue; }
      ctx.fillStyle = 'rgba(106,68,34,' + (0.8 * (1 - age)).toFixed(2) + ')'; ctx.fillRect(Math.round(m2.x) - 2, Math.round(m2.y), 4, 2); ctx.fillRect(Math.round(m2.x) - 1, Math.round(m2.y) - 1, 2, 1); }
  }
  function buildMs(type) { return type === 'basin' ? 2200 : type === 'exit' || type === 'dam' ? 1600 : 1100; }


  // ---------- frame ----------
  var lastT = 0;
  function frame(t) {
    var dt = Math.min(0.05, (t - (lastT || t)) / 1000); lastT = t;
    if (!G.L) { requestAnimationFrame(frame); return; }
    if (buf.width !== geo.w || buf.height !== geo.h) { buf.width = geo.w; buf.height = geo.h; }
    var ctx = bctx; ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, geo.w, geo.h);
    ctx.drawImage(terrain, 0, 0);
    // creek shimmer
    if (Math.floor(t / 400) % 2 === 0) { ctx.fillStyle = 'rgba(200,230,255,.25)'; for (var i = 0; i < G.L.types.length; i++) if (G.L.types[i] === 'C' && (i * 7 + Math.floor(t / 800)) % 5 === 0) { var cc = tileCenter(i); ctx.fillRect(Math.round(cc.x) - 6, Math.round(cc.y) - 2, 10, 2); } }
    drawCreek(ctx, t);
    if (G.phase === 'storm' || G.phase === 'report') drawWater(ctx, t);
    if (G.flowView) drawFlowView(ctx);
    // controls in depth order
    var order = G.controls.map(function (c, k) { return k; }).sort(function (a, b) { return depth(G.controls[a].tile) - depth(G.controls[b].tile); });
    order.forEach(function (k) { drawControl(ctx, G.controls[k], k, t); });
    if (G.phase === 'storm' || G.phase === 'report') drawControlWater(ctx, t);
    drawCrew(ctx, t, dt);
    if (G.phase === 'report' && G.scoreRes) drawFailures(ctx, t);
    if (G.hoverTile >= 0 && G.hoverTile !== G.selTile && G.phase === 'plan') outlineTile(ctx, G.hoverTile, 'rgba(255,255,160,.85)');
    if (G.selTile >= 0 && G.phase === 'plan') outlineTile(ctx, G.selTile, '#fff');
    if (G.phase === 'storm') stepStorm(dt * G.speed);
    if (G.phase === 'storm' || G.phase === 'report') drawParticles(ctx);
    // blit
    vctx.setTransform(1, 0, 0, 1, 0, 0);
    vctx.fillStyle = G.phase === 'storm' ? '#5a6f80' : '#87b7d6'; vctx.fillRect(0, 0, view.width, view.height);
    var sc = G.zoom * dpr;
    vctx.imageSmoothingEnabled = sc < 0.999; // magnify: crisp nearest-neighbour; minify: smooth (avoids dropped pixels/shimmer)
    if (vctx.imageSmoothingEnabled) vctx.imageSmoothingQuality = 'high';
    vctx.setTransform(sc, 0, 0, sc, Math.round(view.width / 2 + G.panX * dpr), Math.round(view.height / 2 + G.panY * dpr));
    vctx.drawImage(buf, -geo.w / 2, -geo.h / 2);
    vctx.setTransform(1, 0, 0, 1, 0, 0);
    if (G.phase === 'storm') { drawRain(t); drawLightning(t); }
    requestAnimationFrame(frame);
  }
  function depth(i) { var W = G.L.W; return (i % W) + ((i / W) | 0); }
  function outlineTile(ctx, i, col) {
    var p = tileTop(i % G.L.W, (i / G.L.W) | 0); ctx.fillStyle = col;
    for (var k = 0; k <= TW / 2; k += 1) {
      ctx.fillRect(Math.round(p.x - k), Math.floor(p.y + k / 2), 1, 2); ctx.fillRect(Math.round(p.x + k), Math.floor(p.y + k / 2), 1, 2);
      ctx.fillRect(Math.round(p.x - k), Math.floor(p.y + TH - k / 2) - 1, 1, 2); ctx.fillRect(Math.round(p.x + k), Math.floor(p.y + TH - k / 2) - 1, 1, 2);
    }
  }
  function drawFlowView(ctx) {
    var sim = G.sim; if (!sim) return;
    for (var i = 0; i < sim.dir.length; i++) {
      var ac = sim.acc[i] * S.TILE_AC, c = tileCenter(i), col = ac > 5 ? '#e0533a' : ac > 2 ? '#ff9a3a' : '#cfe8ff';
      if (G.L.types[i] === 'C') continue;
      var j = sim.dir[i]; ctx.fillStyle = col;
      if (j < 0) { ctx.fillRect(Math.round(c.x) - 2, Math.round(c.y) - 2, 5, 5); continue; }
      var d = tileCenter(j), dx = (d.x - c.x), dy = (d.y - c.y);
      for (var q = 0; q < 10; q++) ctx.fillRect(Math.round(c.x + dx * q / 24), Math.round(c.y + dy * q / 24), 2, 2);
      ctx.fillRect(Math.round(c.x + dx * 10 / 24) - 2, Math.round(c.y + dy * 10 / 24) - 2, 5, 5);
    }
  }
  function drawFailures(ctx, t) {
    var on = Math.floor(t / 300) % 2 === 0;
    G.scoreRes.failed.forEach(function (f) {
      var tile = f.control ? f.control.tile : G.L.types.indexOf('A');
      if (tile < 0) return;
      outlineTile(ctx, tile, on ? '#ff3b2f' : '#ffd23a');
      var c = tileCenter(tile), bx = Math.round(c.x), by = Math.round(c.y) - 30; ctx.fillStyle = '#5a0e08'; ctx.fillRect(bx - 4, by - 1, 9, 22); ctx.fillStyle = '#ff3b2f'; ctx.fillRect(bx - 3, by, 7, 13); ctx.fillRect(bx - 3, by + 15, 7, 5); ctx.fillStyle = '#ff9a8a'; ctx.fillRect(bx - 3, by, 2, 13);
    });
  }

  // ---------- storm animation ----------
  function startStormParticles() {
    var sim = G.sim, cum = [], tot = 0, i;
    for (i = 0; i < sim.gen.length; i++) { tot += sim.gen[i]; cum.push(tot); }
    G.particles = []; G.deposits = []; G.cum = cum; G.cumTot = tot; G.spawnAcc = 0; G.stormT = 0;
    G.prng = S.rng(4242 + G.L.id);
    G.ctlAt = {}; G.fenceAt = {};
    G.controls.forEach(function (c, k) { var e = sim.evals[k]; if (c.type === 'fence') G.fenceAt[c.tile] = (G.fenceAt[c.tile] || 0) + e.trap; else if (c.type === 'dam' || c.type === 'inlet') G.ctlAt[c.tile] = (G.ctlAt[c.tile] || 0) + e.trap; });
  }
  function pickTile() { var u = G.prng() * G.cumTot, lo = 0, hi = G.cum.length - 1; while (lo < hi) { var m = (lo + hi) >> 1; if (G.cum[m] < u) lo = m + 1; else hi = m; } return lo; }
  function stepStorm(dt) {
    G.stormT += dt;
    var rate = G.stormT < G.stormDur * 0.7 ? 90 * G.sim.intensity : 0;
    G.spawnAcc += rate * dt;
    while (G.spawnAcc > 1 && G.particles.length < 500) {
      G.spawnAcc -= 1; var i = pickTile(), c = tileCenter(i);
      G.particles.push({ i: i, t: G.prng(), x: c.x, y: c.y, ox: (G.prng() - 0.5) * 10 * U, oy: (G.prng() - 0.5) * 5 * U, sed: G.L.types[i] !== 'R' });
      if (G.prng() < 0.5) { var w = (G.prng() * G.L.types.length) | 0; if (G.L.types[w] !== 'C') { var cw = tileCenter(w); G.particles.push({ i: w, t: 0, x: cw.x, y: cw.y, ox: (G.prng() - 0.5) * 10 * U, oy: (G.prng() - 0.5) * 5 * U, sed: false }); } }
    }
    var dir = G.sim.dir, keep = [];
    for (var k = 0; k < G.particles.length; k++) {
      var p = G.particles[k]; p.t += dt * 3;
      while (p.t >= 1) {
        p.t -= 1; var j = dir[p.i];
        if (p.sed) {
          var tr = (G.ctlAt[p.i] || 0);
          if (tr && G.prng() < tr) { G.deposits.push({ x: p.x, y: p.y }); p.dead = true; break; }
          if (j >= 0 && G.fenceAt[p.i] && G.prng() < G.fenceAt[p.i]) { G.deposits.push({ x: p.x, y: p.y }); p.dead = true; break; }
        }
        if (j < 0) { if (p.sed && G.L.types[p.i] === 'C') G.deposits.push({ x: p.x, y: p.y, plume: true }); p.dead = true; break; }
        p.i = j;
      }
      if (p.dead) continue;
      var a = tileCenter(p.i), nj = dir[p.i], b = nj >= 0 ? tileCenter(nj) : a;
      p.x = a.x + (b.x - a.x) * p.t; p.y = a.y + (b.y - a.y) * p.t;
      keep.push(p);
    }
    G.particles = keep;
    if (G.deposits.length > 1500) G.deposits.splice(0, G.deposits.length - 1500);
    if (G.stormT >= G.stormDur && G.particles.length === 0 || G.stormT >= G.stormDur * 1.6) endStorm();
  }
  function drawParticles(ctx) {
    for (var d = 0; d < G.deposits.length; d++) { var q = G.deposits[d]; ctx.fillStyle = q.plume ? 'rgba(150,100,50,.85)' : (d % 2 ? '#4a2c10' : '#c08040'); ctx.fillRect(Math.round(q.x + (d % 13) - 6), Math.round(q.y + (d % 7) - 5), q.plume ? 3 : 2, 2); }
    for (var k = 0; k < G.particles.length; k++) {
      var p = G.particles[k], px = Math.round(p.x + p.ox * 0.6), py = Math.round(p.y + p.oy * 0.6) - 1;
      if (p.sed) { ctx.fillStyle = '#3a2008'; ctx.fillRect(px, py, 3, 3); ctx.fillStyle = '#d08a3a'; ctx.fillRect(px, py, 2, 2); }
      else { ctx.fillStyle = '#e8f6ff'; ctx.fillRect(px, py, 3, 1); ctx.fillStyle = '#3f7fbf'; ctx.fillRect(px, py + 1, 3, 1); }
    }
  }
  function drawLightning(t) {
    var surprise = G.L.actual.intensity > G.L.forecast.intensity || G.L.actual.intensity >= 1.5;
    if (!surprise) return;
    if (!G.boltAt || t > G.boltAt + 1400) { G.boltAt = t + 1500 + Math.random() * 2500; G.thunderDone = false; }
    var d = t - G.boltAt; if (d < 0) return;
    if (!G.thunderDone && d > 250) { G.thunderDone = true; if (window.SWP3Sound) SWP3Sound.play('thunder'); }
    var a = d < 90 ? 0.55 : d < 150 ? 0.1 : d < 230 ? 0.4 : Math.max(0, 0.4 - (d - 230) / 500);
    if (a <= 0) return;
    vctx.fillStyle = 'rgba(235,240,255,' + a.toFixed(2) + ')'; vctx.fillRect(0, 0, view.width, view.height);
    if (d < 230) { // bolt
      var x = view.width * (0.2 + 0.6 * A.hash(Math.floor(G.boltAt), 1, 5)), y = 0; vctx.strokeStyle = '#fffbe0'; vctx.lineWidth = 3 * dpr; vctx.beginPath(); vctx.moveTo(x, y);
      for (var k = 1; k < 9; k++) { x += (A.hash(Math.floor(G.boltAt), k, 6) - 0.5) * 60 * dpr; y += view.height * 0.06; vctx.lineTo(x, y); } vctx.stroke();
    }
  }
  function drawRain(t) {
    vctx.strokeStyle = 'rgba(200,220,255,.55)'; vctx.lineWidth = Math.max(1, dpr);
    vctx.beginPath();
    var n = Math.round(90 * (G.sim ? G.sim.intensity : 1)), W = view.width, H = view.height;
    for (var k = 0; k < n; k++) {
      var x = ((k * 97 + t * 0.35 * (1 + k % 3)) % (W + 60)) - 30, y = ((k * 53 + t * 0.9 * (1 + (k % 4) * 0.2)) % (H + 40)) - 20;
      vctx.moveTo(x, y); vctx.lineTo(x - 5 * dpr, y + 14 * dpr);
    }
    vctx.stroke();
  }

  // ---------- input: tap / drag-pan / pinch / wheel ----------
  var pointers = {}, gesture = null;
  view.addEventListener('pointerdown', function (e) {
    view.setPointerCapture && view.setPointerCapture(e.pointerId);
    pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    var ids = Object.keys(pointers);
    if (ids.length === 1) gesture = { type: 'maybeTap', sx: e.clientX, sy: e.clientY, px: G.panX, py: G.panY };
    else if (ids.length === 2) { var a = pointers[ids[0]], b = pointers[ids[1]]; gesture = { type: 'pinch', d0: dist(a, b), z0: G.zoom, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, px: G.panX, py: G.panY }; }
    e.preventDefault();
  });
  view.addEventListener('pointermove', function (e) {
    if (e.pointerType === 'mouse' && !pointers[e.pointerId]) { var h = screenToTile(e.clientX, e.clientY); G.hoverTile = h; return; }
    if (!pointers[e.pointerId]) return;
    pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    if (!gesture) return;
    if (gesture.type === 'maybeTap' && Math.hypot(e.clientX - gesture.sx, e.clientY - gesture.sy) > 8) gesture.type = 'pan';
    if (gesture.type !== 'maybeTap') G.hoverTile = -1;
    else if (e.pointerType === 'mouse') G.hoverTile = screenToTile(e.clientX, e.clientY);
    if (gesture.type === 'pan') { G.panX = gesture.px + (e.clientX - gesture.sx); G.panY = gesture.py + (e.clientY - gesture.sy); clampPan(); }
    else if (gesture.type === 'pinch') {
      var ids = Object.keys(pointers); if (ids.length < 2) return;
      var a = pointers[ids[0]], b = pointers[ids[1]];
      setZoom(gesture.z0 * dist(a, b) / Math.max(1, gesture.d0));
    }
    e.preventDefault();
  });
  function endPointer(e) {
    if (!pointers[e.pointerId]) return;
    delete pointers[e.pointerId];
    if (gesture && gesture.type === 'maybeTap' && Object.keys(pointers).length === 0) onTap(e.clientX, e.clientY);
    if (Object.keys(pointers).length === 0) gesture = null;
    else if (gesture && gesture.type === 'pinch') gesture = { type: 'pan', sx: e.clientX, sy: e.clientY, px: G.panX, py: G.panY, dead: true };
  }
  view.addEventListener('pointerup', endPointer);
  view.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') G.hoverTile = -1; });
  view.addEventListener('pointercancel', function (e) { delete pointers[e.pointerId]; gesture = null; });
  view.addEventListener('wheel', function (e) { e.preventDefault(); setZoom(G.zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15)); }, { passive: false });
  document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function setZoom(z) { G.zoom = Math.max(0.4, Math.min(3.5, z)); clampPan(); }
  function clampPan() { if (!geo) return; var lim = geo.w * G.zoom / 2 + 50; G.panX = Math.max(-lim, Math.min(lim, G.panX)); G.panY = Math.max(-lim, Math.min(lim, G.panY)); }
  function fitView() {
    var r = view.getBoundingClientRect();
    G.zoom = Math.max(0.4, Math.min(2.5, Math.min(r.width / geo.w, r.height / geo.h) * 0.98)); G.panX = 0; G.panY = 0;
  }

  // Single pick function used by BOTH hover highlight and click/tap (see pick.js).
  function screenToTile(cx, cy) {
    if (!geo || !G.L) return -1;
    var b = P.clientToBuffer(cx, cy, { rect: view.getBoundingClientRect(), viewW: view.width, viewH: view.height, zoom: G.zoom, panX: G.panX, panY: G.panY, dpr: dpr, geoW: geo.w, geoH: geo.h });
    return P.pickTile({ W: G.L.W, H: G.L.H, z: geo.z, ox: geo.ox, oy: geo.oy, TW: TW, TH: TH, BASE: BASE }, b.x, b.y);
  }
  window.__swp3Load = function (n) { if (n === 0) loadSandbox(false); else loadLevel(n); $('overlay').classList.add('hidden'); selectTool('inspect'); };
  window.__swp3State = function () { return { sel: G.selTile, hover: G.hoverTile, n: G.L.W * G.L.H, controls: G.controls.length, zoom: G.zoom }; };
  window.__swp3Center = function (i) { centerOn(i); };
  window.__swp3Pick = function (cx, cy) { return screenToTile(cx, cy); }; // debug/test hook
  window.__swp3TileClient = function (i) { // client coords of tile i top-face centre (test hook)
    var c = tileCenter(i); return P.bufferToClient(c.x, c.y, { rect: view.getBoundingClientRect(), viewW: view.width, viewH: view.height, zoom: G.zoom, panX: G.panX, panY: G.panY, dpr: dpr, geoW: geo.w, geoH: geo.h });
  };

  // ---------- gameplay ----------
  var TYPE_NAME = { G: 'Grass (undisturbed)', S: 'Disturbed soil', A: 'Site access (trucks exit)', R: 'Road', D: 'Ditch (concentrated flow)', C: 'Creek (waters of the state)', I: 'Storm inlet' };
  function onTap(cx, cy) {
    if (G.phase !== 'plan') return;
    var i = screenToTile(cx, cy); if (i < 0) return;
    G.selTile = i;
    var tool = G.tool;
    if (tool === 'inspect') { showTileInfo(i); return; }
    var st = findTool(tool);
    if (st && (st.paint || tool === 'raise' || tool === 'lower')) {
      var oh = G.L.heights[i], ot = G.L.types[i];
      if (!S.editTile(G.L, i, st.paint ? 'paint' : tool, st.paint)) { toast(st.paint ? 'Already ' + TYPE_NAME[ot] : 'Height limit'); return; }
      G.history.push({ op: 'terrain', i: i, h: oh, t: ot }); terrainChanged(); showTileInfo(i, true); return;
    }
    if (tool === 'demolish') {
      for (var k = G.controls.length - 1; k >= 0; k--) if (G.controls[k].tile === i) { var c = G.controls.splice(k, 1)[0]; G.history.push({ op: 'remove', c: c, k: k }); toast('Removed ' + S.CONTROLS[c.type].name + ' (+$' + S.CONTROLS[c.type].cost + ')'); rebornIndex(); updateHud(); return; }
      toast('Nothing to remove here'); return;
    }
    var ty = G.L.types[i];
    if (G.controls.some(function (c) { return c.tile === i && c.type === tool; })) { toast('Already a ' + S.CONTROLS[tool].name.toLowerCase() + ' here'); return; }
    if (tool === 'fence' && G.sim.dir[i] < 0) { toast(ty === 'C' ? 'Keep fences out of the creek' : 'Water does not leave this tile to a neighbor; nowhere to put a fence'); return; }
    if ((tool === 'seed' || tool === 'exit' || tool === 'inlet' || tool === 'fence') && ty === 'C') { toast('Not in the creek'); return; }
    var cost = S.CONTROLS[tool].cost;
    if (spent() + cost > G.L.budget) { toast('Over budget! $' + (G.L.budget - spent()) + ' left'); flashMoney(); return; }
    G.controls.push({ type: tool, tile: i, round: G.round || 0 });
    G.born[G.controls.length - 1] = performance.now();
    G.history.push({ op: 'add' });
    if (navigator.vibrate) try { navigator.vibrate(8); } catch (e) { /* ignore */ }
    updateHud(); showTileInfo(i, true);
  }
  function rebornIndex() { G.born = {}; }
  function spent() { return G.controls.reduce(function (a, c) { return a + S.CONTROLS[c.type].cost; }, 0); }
  function undo() {
    if (G.phase !== 'plan') return;
    var h = G.history.pop(); if (!h) { toast('Nothing to undo'); return; }
    if (h.op === 'terrain') { G.L.heights[h.i] = h.h; G.L.types[h.i] = h.t; terrainChanged(); return; }
    if (h.op === 'add') G.controls.pop(); else G.controls.splice(h.k, 0, h.c);
    rebornIndex(); updateHud();
  }
  function showTileInfo(i, brief) {
    var el = $('tileInfo'), sim = G.sim, ty = G.L.types[i];
    var ac = sim.acc[i] * S.TILE_AC, sl = S.slopeOf(G.L, sim.dir, i) * 100;
    var here = G.controls.filter(function (c) { return c.tile === i; }).map(function (c) { return S.CONTROLS[c.type].name; });
    el.innerHTML = '<b>' + TYPE_NAME[ty] + '</b><br>Slope ' + sl.toFixed(1) + '% · Drains ' + ac.toFixed(2) + ' ac' +
      (sim.dir[i] < 0 ? '<br>Outlet: ' + sim.sink[i] : '') + (here.length ? '<br>Has: ' + here.join(', ') : '') +
      (ty === 'D' ? '<br>Max dam spacing: ' + Math.round(S.RULES.damHeightFt / Math.max(0.001, sl / 100)) + ' ft (game rule)' : '');
    el.classList.remove('hidden');
    clearTimeout(showTileInfo.t); showTileInfo.t = setTimeout(function () { el.classList.add('hidden'); }, brief ? 1800 : 4500);
  }
  function toast(msg) { var el = $('toast'); el.textContent = msg; el.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(function () { el.classList.remove('show'); }, 1800); }
  function flashMoney() { var m = document.querySelector('.chip.money'); m.classList.add('low'); setTimeout(function () { m.classList.remove('low'); }, 600); }
  function updateHud() {
    $('budgetLeft').textContent = (G.L.budget - spent()).toLocaleString();
    $('undoBtn').disabled = G.phase !== 'plan' || !G.history.length;
    $('runBtn').disabled = G.phase !== 'plan';
    if (G.L.sandbox) saveSandbox();
  }
  function terrainChanged() {
    G.crew = null; // keep the view steady while geometry is rebuilt
    var oldW = geo.w, oldH = geo.h; geo = buildGeometry(G.L); drawTerrain();
    void oldW; void oldH;
    G.sim = S.simulate(G.L, agedControls(), { intensity: G.L.forecast.intensity }); G.simDir = G.sim.dir; updateHud();
  }
  var SB_KEY = 'swp3-game-sandbox-v1';
  function saveSandbox() { try { localStorage.setItem(SB_KEY, JSON.stringify(S.sandboxData(G.L, G.controls))); } catch (e) { /* private mode */ } }
  function loadSandbox(fresh) {
    var d = null; if (!fresh) try { d = JSON.parse(localStorage.getItem(SB_KEY) || 'null'); } catch (e) { d = null; }
    var L = S.makeSandbox(d);
    var ctl = (d && Array.isArray(d.controls) ? d.controls : []).filter(function (c) { return c && S.CONTROLS[c.type] && c.tile >= 0 && c.tile < L.W * L.H; })
      .map(function (c) { return { type: c.type, tile: c.tile | 0, round: c.round | 0 }; });
    setupLevel(L, 0, ctl);
    $('lvlName').textContent = 'Sandbox'; selectTool('inspect'); showStormPicker();
  }
  function showStormPicker() {
    var L = G.L, h = '<h2>Sandbox storm</h2><p>Pick the storm for Rain Check. <small>Rainfall depths and storm factors are <b>game values</b>, not TxDOT/NOAA data. TxDOT EC sheets size controls for a 2-yr storm.</small></p><div class="storms">';
    S.STORMS.forEach(function (st) { h += '<button type="button" class="lvl' + (st.key === L.stormKey ? ' sel' : '') + '" data-act="storm:' + st.key + '"><b>' + st.label + '</b><span>' + st.rainIn + ' in · ×' + st.intensity + ' (game)</span></button>'; });
    h += '</div><label class="chk"><input type="checkbox" id="sbConcrete"' + (L.concrete ? ' checked' : '') + '> Concrete work on site (needs a washout)</label>' +
      '<p><small>Edit terrain with ⬆ ⬇ and the paint tools in the toolbar, place controls, then 🌧 Rain Check. Saved automatically on this device.</small></p>' +
      '<div class="btns"><button type="button" data-act="sbreset">Reset site</button><button type="button" data-act="levels">Levels</button><button type="button" class="primary" data-act="close">Build</button></div>';
    openPanel(h);
    $('sbConcrete').addEventListener('change', function () { G.L.concrete = this.checked; buildToolbar(); selectTool(G.tool === 'washout' && !G.L.concrete ? 'inspect' : G.tool); terrainChanged(); });
  }

  // ---------- toolbar ----------
  function toolIcon(id) {
    var c = document.createElement('canvas'); c.width = 32; c.height = 24; var x = c.getContext('2d');
    poly(x, [16, 6, 30, 13, 16, 20, 2, 13], id === 'inlet' ? '#7b7b80' : id === 'dam' ? '#8a6a3c' : id === 'seed' ? '#a87444' : '#a87444');
    poly(x, [2, 13, 16, 20, 16, 23, 2, 16], '#6b4a2c'); poly(x, [30, 13, 16, 20, 16, 23, 30, 16], '#553a22');
    var save = { G: G.L, geo: geo };
    if (id === 'fence') { x.fillStyle = '#1d1d1d'; x.fillRect(6, 7, 20, 4); x.fillStyle = '#7a5428'; [6, 16, 25].forEach(function (p) { x.fillRect(p, 5, 1, 8); }); }
    if (id === 'dam') { x.fillStyle = '#bdbdbd'; [[9, 10], [13, 8], [17, 8], [21, 10], [11, 12], [15, 11], [19, 12]].forEach(function (r) { x.fillRect(r[0], r[1], 3, 2); }); }
    if (id === 'inlet') { x.fillStyle = '#222'; x.fillRect(12, 11, 8, 3); x.fillStyle = '#c99a4a'; x.fillRect(8, 9, 16, 2); x.fillRect(8, 14, 16, 2); }
    if (id === 'exit') { x.fillStyle = '#cfcfcf'; for (var q = 0; q < 16; q++) x.fillRect(8 + (q * 5) % 16, 9 + (q * 3) % 7, 2, 1); }
    if (id === 'basin') { poly(x, [16, 9, 25, 13, 16, 17, 7, 13], '#4a7fa8'); x.fillStyle = '#5a3a1c'; x.fillRect(7, 13, 18, 1); }
    if (id === 'washout') { x.fillStyle = '#222'; x.fillRect(9, 8, 14, 8); x.fillStyle = '#bdbdbd'; x.fillRect(10, 9, 12, 5); x.fillStyle = '#ffd400'; x.fillRect(9, 7, 14, 1); }
    if (id === 'seed') { for (q = 0; q < 12; q++) { x.fillStyle = q % 3 ? '#e6cf7a' : '#7fbf5f'; x.fillRect(8 + (q * 5) % 16, 9 + (q * 3) % 7, 2, 1); } }
    void save; return c;
  }
  function paintIcon(ty) {
    var c = document.createElement('canvas'); c.width = 32; c.height = 24; var x = c.getContext('2d'), pal = PAL[ty];
    poly(x, [16, 6, 30, 13, 16, 20, 2, 13], pal[0]); poly(x, [2, 13, 16, 20, 16, 23, 2, 16], pal[1]); poly(x, [30, 13, 16, 20, 16, 23, 30, 16], pal[2]);
    if (ty === 'I') { x.fillStyle = '#222'; x.fillRect(12, 11, 8, 3); }
    if (ty === 'A') { x.fillStyle = '#ff7a1a'; x.fillRect(10, 10, 2, 3); x.fillRect(20, 10, 2, 3); }
    return c;
  }
  function buildToolbar() {
    var wrap = $('tools'); wrap.innerHTML = '';
    var list = G.L.sandbox ? [TOOLS[0]].concat(SB_TOOLS, TOOLS.slice(1)) : TOOLS;
    list.forEach(function (t) {
      if (t.id === 'washout' && !G.L.concrete) return;
      var b = document.createElement('button'); b.type = 'button'; b.className = 'tool'; b.dataset.tool = t.id;
      b.setAttribute('aria-label', t.label);
      if (t.icon) { var s = document.createElement('span'); s.textContent = t.icon; b.appendChild(s); }
      else if (t.paint) b.appendChild(paintIcon(t.paint));
      else b.appendChild(toolIcon(t.id));
      var l = document.createElement('small'); l.textContent = t.label; b.appendChild(l);
      if (S.CONTROLS[t.id]) { var pr = document.createElement('small'); pr.className = 'price'; pr.textContent = '$' + S.CONTROLS[t.id].cost; b.appendChild(pr); }
      b.addEventListener('click', function () { selectTool(t.id); });
      wrap.appendChild(b);
    });
  }
  function selectTool(id) {
    G.tool = id;
    Array.prototype.forEach.call(document.querySelectorAll('.tool'), function (b) { b.classList.toggle('sel', b.dataset.tool === id); });
    var t = findTool(id), card = $('infoCard');
    if (t.help) card.innerHTML = t.help + ' <small>(Undo works for terrain too.)</small>';
    else if (!t.rule) {
      card.innerHTML = id === 'inspect' ? '<b>Inspect:</b> tap any tile to see its slope, drainage area and outlet. Tip: ≋ shows flow arrows (orange &gt; 2 ac, red &gt; 5 ac).' : '<b>Remove:</b> tap a tile to remove its last control (full refund while planning).';
    } else {
      var C = S.CONTROLS[id];
      card.innerHTML = '<h3>' + C.name + ' — $' + C.cost + ' <small>(' + C.qty + ')</small></h3><div>' + t.rule + '</div>' +
        '<div class="basis"><b>' + (t.id === 'washout' ? 'Basis (EPA; no TxDOT number verified)' : 'TxDOT basis') + ':</b> ' + t.basis + '<br><span class="game">' + t.game + '</span><br><small>Cost: ' + C.unitNote + ' ' + (/^game/.test(C.unitNote) ? '' : ' (TxDOT bid tabs, statewide low-bid avg)') + '.</small></div>';
    }
    card.classList.remove('hidden');
  }

  // ---------- levels / flow ----------
  function loadLevel(n) {
    setupLevel(S.makeLevel(n), n, []);
    $('lvlName').textContent = 'Level ' + n + ': ' + G.L.name;
    selectTool(n === 1 ? 'fence' : 'inspect');
    if (G.L.tutorial && !progress.tutDone) showTutorial(0); else showForecast();
  }
  function setupLevel(L, n, controls) {
    G.crew = null;
    G.level = n; G.L = L; geo = buildGeometry(G.L);
    G.controls = controls; G.history = []; G.born = {}; G.phase = 'plan'; G.scoreRes = null; G.particles = []; G.deposits = []; G.selTile = -1; G.hoverTile = -1; G.round = 0;
    G.sim = S.simulate(G.L, controls, { intensity: G.L.forecast.intensity }); G.simDir = G.sim.dir;
    drawTerrain(); resize(); fitView();
    $('lvlGoal').textContent = G.L.goal;
    $('forecastLabel').textContent = G.L.forecast.label;
    $('stormHud').classList.add('hidden'); $('banner').classList.add('hidden');
    G.tool = 'inspect'; buildToolbar(); updateHud();
    G.reviseMode = false; $('runBtn').textContent = '🌧 Rain Check';
  }
  function showForecast() {
    var f = G.L.forecast;
    openPanel('<h2>Storm forecast</h2><div class="forecast"><div class="big">⛈</div><div><b>' + f.label + '</b> expected in 3 days.<br>' +
      '<small>TxDOT EC(1)/EC(2) sheets: a 2-year storm may be used to calculate the flow rate to be filtered.</small></div></div>' +
      '<p><b>Your job:</b> ' + G.L.goal + '</p><p>Budget: <b>$' + G.L.budget.toLocaleString() + '</b></p>' +
      '<div class="btns"><button type="button" class="primary" data-act="close">Start planning</button></div>');
  }
  var TUT = [
    ['You are the engineer', 'Design the SWP3 erosion &amp; sediment controls for this site. Brown tiles are disturbed soil. Water runs downhill (south-west, toward the bottom of the screen).'],
    ['Build', 'Pick a control in the bottom toolbar, then <b>tap a tile</b> to place it. <b>Drag</b> to pan, pinch or +/− to zoom. Tap ≋ to see where water flows.'],
    ['Silt fence', 'Silt fence goes on <b>sheet flow</b> near the downstream edge of the disturbed area, along the contour. Put a row across the bottom of the brown pad, add a construction exit on the orange access tile, then press <b>🌧 Rain Check</b>.']
  ];
  function showTutorial(k) {
    openPanel('<h2>' + TUT[k][0] + ' <small>(' + (k + 1) + '/' + TUT.length + ')</small></h2><p>' + TUT[k][1] + '</p><div class="btns">' +
      (k < TUT.length - 1 ? '<button type="button" data-act="skiptut">Skip</button><button type="button" class="primary" data-act="tut' + (k + 1) + '">Next</button>' : '<button type="button" class="primary" data-act="endtut">Let\u2019s build</button>') + '</div>');
  }
  function runStorm() {
    if (G.phase !== 'plan') return;
    if (!G.controls.length) toast('No controls placed — let\u2019s see what happens…');
    G.scoreRes = S.score(G.L, agedControls());
    G.sim = G.scoreRes.result; G.phase = 'storm'; G.speed = 1; $('speedBtn').textContent = '1×';
    startStormParticles(); updateHud();
    $('infoCard').classList.add('hidden'); $('tileInfo').classList.add('hidden');
    $('stormHud').classList.remove('hidden'); $('stormLabel').textContent = '🌧 ' + G.L.actual.label;
    if (G.L.actual.intensity !== G.L.forecast.intensity) banner('⚡ Surprise! ' + G.L.actual.label + '<br><small>Bigger than the ' + G.L.forecast.label + ' forecast</small>');
  }
  function agedControls() { return G.controls.map(function (c) { return { type: c.type, tile: c.tile, age: (G.round || 0) - (c.round || 0) }; }); }
  function banner(html) { var b = $('banner'); b.innerHTML = html; b.classList.remove('hidden'); setTimeout(function () { b.classList.add('hidden'); }, 2600); }
  function endStorm() {
    if (G.phase !== 'storm') return;
    G.phase = 'report'; $('stormHud').classList.add('hidden'); G.round = (G.round || 0) + 1; // each storm grows seeded tiles in
    var r = G.scoreRes, L = G.L, prev = progress.stars[L.id] || 0;
    if (r.stars > prev && !L.sandbox) { progress.stars[L.id] = r.stars; saveProgress(); }
    var st = ''; for (var k = 1; k <= 3; k++) st += k <= r.stars ? '★' : '<span class="off">★</span>';
    var res = r.result, base = r.baseline;
    var items = r.failed.map(function (f) {
      return '<div class="fail" data-tile="' + (f.control ? f.control.tile : L.types.indexOf('A')) + '"><div class="st">' + (f.control ? S.CONTROLS[f.control.type].name + ' · ' : '') + f.status + '</div>' + f.reason + '</div>';
    }).join('');
    var okCount = Object.keys(res.evals).filter(function (k) { return res.evals[k].status === 'ok'; }).length;
    var html = '<h2>Report — ' + L.name + '</h2><div class="stars">' + st + '</div><p><b>Score ' + r.score + '/100</b> · ' + Math.round(r.reduction * 100) + '% less sediment than no plan</p>' +
      '<div class="stat"><span>Sediment leaving site</span><b>' + res.discharge.toFixed(0) + ' (no plan: ' + base.discharge.toFixed(0) + ')</b>' +
      '<span>· to creek / inlet / off-site</span><b>' + res.out.creek.toFixed(0) + ' / ' + res.out.inlet.toFixed(0) + ' / ' + res.out.offsite.toFixed(0) + '</b>' +
      '<span>· tracked onto road</span><b>' + res.out.tracked.toFixed(0) + '</b>' +
      (L.concrete ? '<span>· concrete washwater</span><b>' + res.out.washout.toFixed(0) + '</b>' : '') +
      '<span>Trapped by your controls</span><b>' + res.out.trapped.toFixed(0) + '</b>' +
      '<span>Cost</span><b>$' + res.cost.toLocaleString() + ' / $' + L.budget.toLocaleString() + '</b>' +
      '<span>Storm</span><b>' + L.actual.label + '</b></div><small>Sediment in game units.</small>' +
      '<h3>What went wrong?</h3>' + (items || '<div class="fail okitem">Nothing! All ' + okCount + ' controls performed.</div>') +
      '<div class="tip">💡 ' + L.tip + '</div>' +
      '<div class="btns"><button type="button" data-act="view">See site</button><button type="button" data-act="retry">Revise plan</button>' +
      (L.sandbox ? '<button type="button" class="primary" data-act="sbstorm">Change storm</button>' : L.id < S.LEVEL_COUNT ? '<button type="button" class="primary" data-act="next"' + (r.stars < 1 ? ' disabled' : '') + '>Next level</button>' : '<button type="button" class="primary" data-act="levels">Levels</button>') + '</div>';
    openPanel(html);
  }
  function backToPlan() {
    G.phase = 'plan'; G.particles = []; G.deposits = []; G.scoreRes = null;
    G.sim = S.simulate(G.L, agedControls(), { intensity: G.L.forecast.intensity }); updateHud(); selectTool(G.tool);
  }
  function showLevels() {
    var html = '<h2>SWP3 Designer</h2><p>You are the engineer designing the erosion &amp; sediment control plan. Place controls, then run the storm.</p>';
    for (var n = 1; n <= S.LEVEL_COUNT; n++) {
      var L = S.makeLevel(n), s = progress.stars[n] || 0, locked = n > 1 && !(progress.stars[n - 1] >= 1);
      var st = ''; for (var k = 1; k <= 3; k++) st += k <= s ? '★' : '☆';
      html += '<button type="button" class="lvl" data-act="lvl' + n + '"' + (locked ? ' disabled' : '') + '><b>' + n + '. ' + L.name + '</b><span>' + (locked ? '🔒' : st) + '</span></button>';
    }
    html += '<button type="button" class="lvl" data-act="sandbox"><b>🧪 Sandbox</b><span>build your own site</span></button>';
    html += '<div class="btns">' + (G.L ? '<button type="button" data-act="close">Back</button>' : '') + '<button type="button" data-act="reset">Reset progress</button></div>';
    openPanel(html);
  }

  // ---------- overlay ----------
  function openPanel(html) { $('panel').innerHTML = html; $('overlay').classList.remove('hidden'); }
  function closePanel() { $('overlay').classList.add('hidden'); }
  $('panel').addEventListener('click', function (e) {
    var f = e.target.closest('.fail');
    if (f && f.dataset.tile >= 0) { closePanel(); centerOn(+f.dataset.tile); return; }
    var b = e.target.closest('button'); if (!b || b.disabled) return;
    var a = b.dataset.act;
    if (a === 'close') closePanel();
    else if (a === 'skiptut' || a === 'endtut') { progress.tutDone = true; saveProgress(); showForecast(); }
    else if (a && a.indexOf('tut') === 0) showTutorial(+a.slice(3));
    else if (a && a.indexOf('lvl') === 0) { closePanel(); loadLevel(+a.slice(3)); }
    else if (a === 'retry') { closePanel(); backToPlan(); }
    else if (a === 'view') { closePanel(); toast('Failed controls blink red. Tap ☰ for the report menu, or Revise.'); showReviseBar(); }
    else if (a === 'next') { closePanel(); loadLevel(G.L.id + 1); }
    else if (a === 'levels') showLevels();
    else if (a === 'sbstorm') { backToPlan(); showStormPicker(); }
    else if (a === 'sandbox') { closePanel(); loadSandbox(false); }
    else if (a === 'sbreset') { if (confirm('Reset the sandbox site and controls?')) { closePanel(); loadSandbox(true); saveSandbox(); } }
    else if (a && a.indexOf('storm:') === 0) { var st = S.stormByKey(a.slice(6)); G.L.stormKey = st.key; G.L.forecast = { label: st.label, intensity: st.intensity }; G.L.actual = { label: st.label, intensity: st.intensity }; $('forecastLabel').textContent = st.label; terrainChanged(); showStormPicker(); }
    else if (a === 'reset') { progress = { stars: {} }; saveProgress(); showLevels(); }
  });
  function showReviseBar() { $('runBtn').disabled = false; $('runBtn').textContent = '✎ Revise plan'; G.reviseMode = true; }
  function centerOn(i) { var c = tileCenter(i); G.panX = -(c.x - geo.w / 2) * G.zoom; G.panY = -(c.y - geo.h / 2) * G.zoom; clampPan(); }

  // ---------- buttons ----------
  $('runBtn').addEventListener('click', function () {
    if (G.reviseMode) { G.reviseMode = false; $('runBtn').textContent = '🌧 Rain Check'; backToPlan(); return; }
    runStorm();
  });
  $('undoBtn').addEventListener('click', undo);
  $('zoomIn').addEventListener('click', function () { setZoom(G.zoom * 1.25); });
  $('zoomOut').addEventListener('click', function () { setZoom(G.zoom / 1.25); });
  $('flowView').addEventListener('click', function () { G.flowView = !G.flowView; this.classList.toggle('on', G.flowView); if (G.flowView) toast('Flow view: arrows show runoff; orange > 2 ac, red > 5 ac'); });
  $('speedBtn').addEventListener('click', function () { G.speed = G.speed === 1 ? 2 : G.speed === 2 ? 4 : 1; this.textContent = G.speed + '×'; });
  $('skipBtn').addEventListener('click', function () { G.stormT = G.stormDur * 2; G.particles = []; endStorm(); });
  $('btnLevels').addEventListener('click', showLevels);
  $('forecastChip').addEventListener('click', function () { if (G.phase === 'plan') { if (G.L.sandbox) showStormPicker(); else showForecast(); } });
  window.addEventListener('resize', function () { resize(); });
  window.addEventListener('keydown', function (e) { if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undo(); } });

  // ---------- boot ----------
  resize();
  loadLevel(Math.min(S.LEVEL_COUNT, Math.max(1, +(location.hash.slice(1)) || 1)));
  if (!location.hash) showLevels();
  requestAnimationFrame(frame);
  window.__swp3 = G; // for debugging
})();
