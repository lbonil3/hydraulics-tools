/* SWP3 Designer - rendering, input and game flow. Logic lives in sim.js (window.SWP3). */
(function () {
  'use strict';
  var S = window.SWP3;
  var TW = 32, TH = 16, BASE = 10; // iso tile size in low-res pixels, slab thickness
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
    { id: 'seed', label: 'Seed', rule: 'Temporary seeding + straw mulch on bare soil. Cheap; cuts erosion on that tile.',
      basis: 'TxDOT 2024 Spec Item 506.4.3.2: initiate stabilization of disturbed areas no more than 14 days after work there stops (per TPDES CGP TXR150000). Prices from TxDOT bid tabs (Items 164 / 162).',
      game: 'Game rule: seeded+mulched tile erodes at 40% of bare soil, effective immediately.' },
    { id: 'demolish', icon: '✖', label: 'Remove' }
  ];

  // ---------- state ----------
  var G = {
    level: null, L: null, controls: [], history: [], tool: 'fence', phase: 'plan',
    zoom: 2, panX: 0, panY: 0, flowView: false, sim: null, scoreRes: null,
    particles: [], deposits: [], speed: 1, stormT: 0, stormDur: 9, born: {}, selTile: -1, flash: 0
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
    var zs = Math.min(4, 110 / Math.max(1, maxH - minH));
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
    var ctx = tctx; ctx.imageSmoothingEnabled = false; ctx.clearRect(0, 0, geo.w, geo.h);
    var r = S.rng(77 + L.id), bottomY = function (x, y) { return geo.oy + (x + y) * TH / 2; };
    for (var s = 0; s <= L.W + L.H - 2; s++) {
      for (var y = 0; y < L.H; y++) {
        var x = s - y; if (x < 0 || x >= L.W) continue;
        var i = y * L.W + x, ty = L.types[i], p = tileTop(x, y), pal = PAL[ty];
        var gz = geo.oy + BASE; // slab base (z = -BASE)
        // side faces down to slab base
        var lb = bottomY(x, y) + TH / 2 + BASE, depth = lb - (p.y + TH / 2);
        poly(ctx, [p.x - TW / 2, p.y + TH / 2, p.x, p.y + TH, p.x, p.y + TH + depth, p.x - TW / 2, p.y + TH / 2 + depth], ty === 'C' ? '#2e6194' : '#6b4a2c');
        poly(ctx, [p.x + TW / 2, p.y + TH / 2, p.x, p.y + TH, p.x, p.y + TH + depth, p.x + TW / 2, p.y + TH / 2 + depth], ty === 'C' ? '#244c75' : '#553a22');
        // grass/soil lip on side faces
        poly(ctx, [p.x - TW / 2, p.y + TH / 2, p.x, p.y + TH, p.x, p.y + TH + 2, p.x - TW / 2, p.y + TH / 2 + 2], pal[1]);
        poly(ctx, [p.x + TW / 2, p.y + TH / 2, p.x, p.y + TH, p.x, p.y + TH + 2, p.x + TW / 2, p.y + TH / 2 + 2], pal[2]);
        // strata lines on deep faces
        ctx.fillStyle = 'rgba(0,0,0,.18)';
        for (var d = 6; d < depth; d += 5) { ctx.fillRect(p.x - TW / 2 + 2, Math.round(p.y + TH / 2 + d), 1, 1); ctx.fillRect(p.x + TW / 2 - 3, Math.round(p.y + TH / 2 + d + 2), 1, 1); }
        // top face
        poly(ctx, [p.x, p.y, p.x + TW / 2, p.y + TH / 2, p.x, p.y + TH, p.x - TW / 2, p.y + TH / 2], pal[0]);
        // texture specks inside diamond
        var sp = SPECK[ty];
        for (var k = 0; k < 14; k++) {
          var u = r(), v = r(); var px = Math.round(p.x + (u - v) * TW / 2 * 0.9), py = Math.round(p.y + TH / 2 + (u + v - 1) * TH / 2 * 0.9);
          ctx.fillStyle = sp[(r() * sp.length) | 0]; ctx.fillRect(px, py, 1, 1);
        }
        if (ty === 'G') { ctx.fillStyle = '#3d6230'; for (k = 0; k < 3; k++) { var gx = Math.round(p.x - 8 + r() * 16), gy = Math.round(p.y + 4 + r() * 8); ctx.fillRect(gx, gy, 1, 2); ctx.fillRect(gx + 2, gy + 1, 1, 1); } }
        if (ty === 'S' || ty === 'A') { ctx.fillStyle = 'rgba(70,40,20,.35)'; for (k = -2; k <= 2; k++) ctx.fillRect(Math.round(p.x - 6 + k * 3), Math.round(p.y + 6 + k * 1.5), 6, 1); }
        if (ty === 'R') { ctx.fillStyle = '#d9c35a'; if ((x + y) % 2 === 0 && L.id !== 3) ctx.fillRect(Math.round(p.x) - 1, Math.round(p.y + TH / 2), 3, 1); }
        if (ty === 'D') { ctx.fillStyle = '#5a7d36'; ctx.fillRect(Math.round(p.x - 10), Math.round(p.y + 7), 3, 1); ctx.fillRect(Math.round(p.x + 7), Math.round(p.y + 9), 3, 1); ctx.fillStyle = '#4a3a20'; ctx.fillRect(Math.round(p.x - 1), Math.round(p.y + 3), 2, 10); }
        if (ty === 'C') { ctx.fillStyle = '#a8d0f0'; ctx.fillRect(Math.round(p.x - 6 + r() * 8), Math.round(p.y + 6 + r() * 4), 4, 1); }
        if (ty === 'I') { ctx.fillStyle = '#222'; ctx.fillRect(Math.round(p.x - 5), Math.round(p.y + 6), 10, 4); ctx.fillStyle = '#666'; for (k = 0; k < 5; k++) ctx.fillRect(Math.round(p.x - 4 + k * 2), Math.round(p.y + 6), 1, 4); }
        if (ty === 'A') { // orange access cones + tire tracks
          ctx.fillStyle = '#5a3a1c'; ctx.fillRect(Math.round(p.x - 3), Math.round(p.y + 3), 1, 10); ctx.fillRect(Math.round(p.x + 3), Math.round(p.y + 3), 1, 10);
          drawCone(ctx, p.x - 9, p.y + 8); drawCone(ctx, p.x + 9, p.y + 8);
        }
        // edge highlight (top-left light)
        ctx.fillStyle = 'rgba(255,255,255,.12)';
        for (k = 0; k < TW / 2; k += 2) ctx.fillRect(Math.round(p.x - TW / 2 + k), Math.round(p.y + TH / 2 - k / 2), 2, 1);
      }
    }
  }
  function drawCone(ctx, x, y) { x = Math.round(x); y = Math.round(y); ctx.fillStyle = '#ff7a1a'; ctx.fillRect(x, y - 4, 1, 1); ctx.fillRect(x - 1, y - 3, 3, 2); ctx.fillStyle = '#fff'; ctx.fillRect(x - 1, y - 2, 3, 1); ctx.fillStyle = '#ff7a1a'; ctx.fillRect(x - 2, y - 1, 5, 1); }

  // ---------- control sprites ----------
  function edgeCorners(i, j) {
    var W = G.L.W, x = i % W, y = (i / W) | 0, p = tileTop(x, y);
    var T = [p.x, p.y], R = [p.x + TW / 2, p.y + TH / 2], B = [p.x, p.y + TH], Lf = [p.x - TW / 2, p.y + TH / 2];
    var d = j - i;
    if (d === -W) return [T, R]; if (d === 1) return [R, B]; if (d === W) return [Lf, B]; if (d === -1) return [T, Lf];
    return [Lf, B];
  }
  function drawControl(ctx, c, k, t) {
    var i = c.tile, cen = tileCenter(i), bornAt = G.born[k], lift = 0;
    if (bornAt != null) { var a = (t - bornAt) / 260; if (a < 1) lift = Math.round(-8 * Math.sin(a * Math.PI) * (1 - a)); }
    var x = Math.round(cen.x), y = Math.round(cen.y) + lift, n, q;
    if (c.type === 'fence') {
      var dir = G.simDir[i]; var e = edgeCorners(i, dir >= 0 ? dir : i + G.L.W);
      var x0 = e[0][0], y0 = e[0][1] + lift, x1 = e[1][0], y1 = e[1][1] + lift;
      // pull fence slightly inside the tile
      var mx = cen.x - (x0 + x1) / 2, my = cen.y - (y0 + y1) / 2; x0 += mx * 0.2; x1 += mx * 0.2; y0 += my * 0.2; y1 += my * 0.2;
      n = 10;
      for (q = 0; q <= n; q++) { var fx = Math.round(x0 + (x1 - x0) * q / n), fy = Math.round(y0 + (y1 - y0) * q / n); ctx.fillStyle = '#1d1d1d'; ctx.fillRect(fx, fy - 4, 1, 4); ctx.fillStyle = '#333'; ctx.fillRect(fx, fy - 4, 1, 1); }
      for (q = 0; q <= 2; q++) { var px = Math.round(x0 + (x1 - x0) * q / 2), py = Math.round(y0 + (y1 - y0) * q / 2); ctx.fillStyle = '#7a5428'; ctx.fillRect(px, py - 6, 1, 7); }
    } else if (c.type === 'dam') {
      var rocks = [[-7, 0], [-4, -2], [-1, -3], [2, -2], [5, -1], [-5, 1], [-1, 0], [3, 1], [7, 1], [-2, -5], [1, -5]];
      rocks.forEach(function (rk, m) { ctx.fillStyle = m % 3 ? '#9a9a9a' : '#bdbdbd'; ctx.fillRect(x + rk[0] - 1, y + rk[1] - 1, 3, 2); ctx.fillStyle = '#5e5e5e'; ctx.fillRect(x + rk[0] - 1, y + rk[1] + 1, 3, 1); });
    } else if (c.type === 'inlet') {
      ctx.fillStyle = '#c99a4a'; ctx.fillRect(x - 9, y - 3, 18, 2); ctx.fillRect(x - 9, y + 2, 18, 2); ctx.fillStyle = '#8a6430'; ctx.fillRect(x - 9, y - 1, 18, 1); ctx.fillRect(x - 9, y + 4, 18, 1);
    } else if (c.type === 'exit') {
      for (q = 0; q < 26; q++) { var gx = x - 10 + ((q * 7) % 21), gy = y - 4 + ((q * 5) % 9); ctx.fillStyle = q % 2 ? '#cfcfcf' : '#8f8f8f'; ctx.fillRect(gx, gy, 2, 1); }
    } else if (c.type === 'seed') {
      for (q = 0; q < 12; q++) { var sx = x - 9 + ((q * 5) % 19), sy = y - 4 + ((q * 3) % 9); ctx.fillStyle = q % 3 ? '#e6cf7a' : '#7fbf5f'; ctx.fillRect(sx, sy, q % 3 ? 2 : 1, 1); if (q % 3 === 0) ctx.fillRect(sx, sy - 1, 1, 1); }
    }
  }

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
    if (Math.floor(t / 400) % 2 === 0) { ctx.fillStyle = 'rgba(200,230,255,.25)'; for (var i = 0; i < G.L.types.length; i++) if (G.L.types[i] === 'C' && (i * 7 + Math.floor(t / 800)) % 5 === 0) { var cc = tileCenter(i); ctx.fillRect(Math.round(cc.x) - 3, Math.round(cc.y) - 1, 5, 1); } }
    if (G.flowView) drawFlowView(ctx);
    // controls in depth order
    var order = G.controls.map(function (c, k) { return k; }).sort(function (a, b) { return depth(G.controls[a].tile) - depth(G.controls[b].tile); });
    order.forEach(function (k) { drawControl(ctx, G.controls[k], k, t); });
    if (G.phase === 'report' && G.scoreRes) drawFailures(ctx, t);
    if (G.selTile >= 0 && G.phase === 'plan') outlineTile(ctx, G.selTile, '#fff');
    if (G.phase === 'storm') stepStorm(dt * G.speed);
    if (G.phase === 'storm' || G.phase === 'report') drawParticles(ctx);
    // blit
    vctx.setTransform(1, 0, 0, 1, 0, 0);
    vctx.fillStyle = G.phase === 'storm' ? '#5a6f80' : '#87b7d6'; vctx.fillRect(0, 0, view.width, view.height);
    vctx.imageSmoothingEnabled = false;
    var sc = G.zoom * dpr;
    vctx.setTransform(sc, 0, 0, sc, Math.round(view.width / 2 + G.panX * dpr), Math.round(view.height / 2 + G.panY * dpr));
    vctx.drawImage(buf, -geo.w / 2, -geo.h / 2);
    vctx.setTransform(1, 0, 0, 1, 0, 0);
    if (G.phase === 'storm') drawRain(t);
    requestAnimationFrame(frame);
  }
  function depth(i) { var W = G.L.W; return (i % W) + ((i / W) | 0); }
  function outlineTile(ctx, i, col) {
    var p = tileTop(i % G.L.W, (i / G.L.W) | 0); ctx.fillStyle = col;
    for (var k = 0; k <= TW / 2; k += 1) {
      ctx.fillRect(Math.round(p.x - k), Math.round(p.y + k / 2), 1, 1); ctx.fillRect(Math.round(p.x + k), Math.round(p.y + k / 2), 1, 1);
      ctx.fillRect(Math.round(p.x - k), Math.round(p.y + TH - k / 2), 1, 1); ctx.fillRect(Math.round(p.x + k), Math.round(p.y + TH - k / 2), 1, 1);
    }
  }
  function drawFlowView(ctx) {
    var sim = G.sim; if (!sim) return;
    for (var i = 0; i < sim.dir.length; i++) {
      var ac = sim.acc[i] * S.TILE_AC, c = tileCenter(i), col = ac > 5 ? '#e0533a' : ac > 2 ? '#ff9a3a' : '#cfe8ff';
      if (G.L.types[i] === 'C') continue;
      var j = sim.dir[i]; ctx.fillStyle = col;
      if (j < 0) { ctx.fillRect(Math.round(c.x) - 1, Math.round(c.y) - 1, 3, 3); continue; }
      var d = tileCenter(j), dx = (d.x - c.x), dy = (d.y - c.y);
      for (var q = 0; q < 5; q++) ctx.fillRect(Math.round(c.x + dx * q / 12), Math.round(c.y + dy * q / 12), 1, 1);
      ctx.fillRect(Math.round(c.x + dx * 5 / 12) - 1, Math.round(c.y + dy * 5 / 12) - 1, 3, 3);
    }
  }
  function drawFailures(ctx, t) {
    var on = Math.floor(t / 300) % 2 === 0;
    G.scoreRes.failed.forEach(function (f) {
      var tile = f.control ? f.control.tile : G.L.types.indexOf('A');
      if (tile < 0) return;
      outlineTile(ctx, tile, on ? '#ff3b2f' : '#ffd23a');
      var c = tileCenter(tile); ctx.fillStyle = '#ff3b2f'; ctx.fillRect(Math.round(c.x) - 1, Math.round(c.y) - 18, 3, 7); ctx.fillRect(Math.round(c.x) - 1, Math.round(c.y) - 9, 3, 2);
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
    while (G.spawnAcc > 1 && G.particles.length < 900) {
      G.spawnAcc -= 1; var i = pickTile(), c = tileCenter(i);
      G.particles.push({ i: i, t: G.prng(), x: c.x, y: c.y, ox: (G.prng() - 0.5) * 10, oy: (G.prng() - 0.5) * 5, sed: G.L.types[i] !== 'R' });
      if (G.prng() < 0.5) { var w = (G.prng() * G.L.types.length) | 0; if (G.L.types[w] !== 'C') { var cw = tileCenter(w); G.particles.push({ i: w, t: 0, x: cw.x, y: cw.y, ox: (G.prng() - 0.5) * 10, oy: (G.prng() - 0.5) * 5, sed: false }); } }
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
    for (var d = 0; d < G.deposits.length; d++) { var q = G.deposits[d]; ctx.fillStyle = q.plume ? 'rgba(150,100,50,.85)' : (d % 2 ? '#4a2c10' : '#c08040'); ctx.fillRect(Math.round(q.x + (d % 7) - 3), Math.round(q.y + (d % 5) - 2 - 2), q.plume ? 2 : 1, 1); }
    for (var k = 0; k < G.particles.length; k++) {
      var p = G.particles[k], px = Math.round(p.x + p.ox * 0.6), py = Math.round(p.y + p.oy * 0.6) - 1;
      if (p.sed) { ctx.fillStyle = '#3a2008'; ctx.fillRect(px, py, 2, 2); ctx.fillStyle = '#d08a3a'; ctx.fillRect(px, py, 1, 1); }
      else { ctx.fillStyle = '#e8f6ff'; ctx.fillRect(px, py, 2, 1); ctx.fillStyle = '#3f7fbf'; ctx.fillRect(px, py + 1, 2, 1); }
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
    if (!pointers[e.pointerId]) return;
    pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    if (!gesture) return;
    if (gesture.type === 'maybeTap' && Math.hypot(e.clientX - gesture.sx, e.clientY - gesture.sy) > 8) gesture.type = 'pan';
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
  view.addEventListener('pointercancel', function (e) { delete pointers[e.pointerId]; gesture = null; });
  view.addEventListener('wheel', function (e) { e.preventDefault(); setZoom(G.zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15)); }, { passive: false });
  document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function setZoom(z) { G.zoom = Math.max(0.8, Math.min(7, z)); clampPan(); }
  function clampPan() { if (!geo) return; var lim = geo.w * G.zoom / 2 + 50; G.panX = Math.max(-lim, Math.min(lim, G.panX)); G.panY = Math.max(-lim, Math.min(lim, G.panY)); }
  function fitView() {
    var r = view.getBoundingClientRect();
    G.zoom = Math.max(0.8, Math.min(5, Math.min(r.width / geo.w, r.height / geo.h) * 0.98)); G.panX = 0; G.panY = 0;
  }

  function screenToTile(cx, cy) {
    var r = view.getBoundingClientRect();
    var bx = (cx - r.left - r.width / 2 - G.panX) / G.zoom + geo.w / 2, by = (cy - r.top - r.height / 2 - G.panY) / G.zoom + geo.h / 2;
    var L = G.L, best = -1;
    for (var s = L.W + L.H - 2; s >= 0 && best < 0; s--) { // front to back
      for (var y = 0; y < L.H; y++) {
        var x = s - y; if (x < 0 || x >= L.W) continue;
        var p = tileTop(x, y), dx = Math.abs(bx - p.x) / (TW / 2), dy = Math.abs(by - (p.y + TH / 2)) / (TH / 2);
        if (dx + dy <= 1) { best = y * L.W + x; break; }
      }
    }
    return best;
  }

  // ---------- gameplay ----------
  var TYPE_NAME = { G: 'Grass (undisturbed)', S: 'Disturbed soil', A: 'Site access (trucks exit)', R: 'Road', D: 'Ditch (concentrated flow)', C: 'Creek (waters of the state)', I: 'Storm inlet' };
  function onTap(cx, cy) {
    if (G.phase !== 'plan') return;
    var i = screenToTile(cx, cy); if (i < 0) return;
    G.selTile = i;
    var tool = G.tool;
    if (tool === 'inspect') { showTileInfo(i); return; }
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
    G.controls.push({ type: tool, tile: i });
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
    if (id === 'seed') { for (q = 0; q < 12; q++) { x.fillStyle = q % 3 ? '#e6cf7a' : '#7fbf5f'; x.fillRect(8 + (q * 5) % 16, 9 + (q * 3) % 7, 2, 1); } }
    void save; return c;
  }
  function buildToolbar() {
    var wrap = $('tools'); wrap.innerHTML = '';
    TOOLS.forEach(function (t) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'tool'; b.dataset.tool = t.id;
      b.setAttribute('aria-label', t.label);
      if (t.icon) { var s = document.createElement('span'); s.textContent = t.icon; b.appendChild(s); }
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
    var t = TOOLS.filter(function (x) { return x.id === id; })[0], card = $('infoCard');
    if (!t.rule) {
      card.innerHTML = id === 'inspect' ? '<b>Inspect:</b> tap any tile to see its slope, drainage area and outlet. Tip: ≋ shows flow arrows (orange &gt; 2 ac, red &gt; 5 ac).' : '<b>Remove:</b> tap a tile to remove its last control (full refund while planning).';
    } else {
      var C = S.CONTROLS[id];
      card.innerHTML = '<h3>' + C.name + ' — $' + C.cost + ' <small>(' + C.qty + ')</small></h3><div>' + t.rule + '</div>' +
        '<div class="basis"><b>TxDOT basis:</b> ' + t.basis + '<br><span class="game">' + t.game + '</span><br><small>Cost: ' + C.unitNote + ' (TxDOT bid tabs, statewide low-bid avg).</small></div>';
    }
    card.classList.remove('hidden');
  }

  // ---------- levels / flow ----------
  function loadLevel(n) {
    G.level = n; G.L = S.makeLevel(n); geo = buildGeometry(G.L);
    G.controls = []; G.history = []; G.born = {}; G.phase = 'plan'; G.scoreRes = null; G.particles = []; G.deposits = []; G.selTile = -1;
    G.sim = S.simulate(G.L, [], { intensity: G.L.forecast.intensity }); G.simDir = G.sim.dir;
    drawTerrain(); resize(); fitView();
    $('lvlName').textContent = 'Level ' + n + ': ' + G.L.name; $('lvlGoal').textContent = G.L.goal;
    $('forecastLabel').textContent = G.L.forecast.label;
    $('stormHud').classList.add('hidden'); $('banner').classList.add('hidden');
    buildToolbar(); selectTool(n === 1 ? 'fence' : 'inspect'); updateHud();
    if (G.L.tutorial && !progress.tutDone) showTutorial(0); else showForecast();
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
    G.scoreRes = S.score(G.L, G.controls);
    G.sim = G.scoreRes.result; G.phase = 'storm'; G.speed = 1; $('speedBtn').textContent = '1×';
    startStormParticles(); updateHud();
    $('infoCard').classList.add('hidden'); $('tileInfo').classList.add('hidden');
    $('stormHud').classList.remove('hidden'); $('stormLabel').textContent = '🌧 ' + G.L.actual.label;
    if (G.L.actual.intensity !== G.L.forecast.intensity) banner('⚡ Surprise! ' + G.L.actual.label + '<br><small>Bigger than the ' + G.L.forecast.label + ' forecast</small>');
  }
  function banner(html) { var b = $('banner'); b.innerHTML = html; b.classList.remove('hidden'); setTimeout(function () { b.classList.add('hidden'); }, 2600); }
  function endStorm() {
    if (G.phase !== 'storm') return;
    G.phase = 'report'; $('stormHud').classList.add('hidden');
    var r = G.scoreRes, L = G.L, prev = progress.stars[L.id] || 0;
    if (r.stars > prev) { progress.stars[L.id] = r.stars; saveProgress(); }
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
      '<span>Trapped by your controls</span><b>' + res.out.trapped.toFixed(0) + '</b>' +
      '<span>Cost</span><b>$' + res.cost.toLocaleString() + ' / $' + L.budget.toLocaleString() + '</b>' +
      '<span>Storm</span><b>' + L.actual.label + '</b></div><small>Sediment in game units.</small>' +
      '<h3>What went wrong?</h3>' + (items || '<div class="fail okitem">Nothing! All ' + okCount + ' controls performed.</div>') +
      '<div class="tip">💡 ' + L.tip + '</div>' +
      '<div class="btns"><button type="button" data-act="view">See site</button><button type="button" data-act="retry">Revise plan</button>' +
      (L.id < S.LEVEL_COUNT ? '<button type="button" class="primary" data-act="next"' + (r.stars < 1 ? ' disabled' : '') + '>Next level</button>' : '<button type="button" class="primary" data-act="levels">Levels</button>') + '</div>';
    openPanel(html);
  }
  function backToPlan() {
    G.phase = 'plan'; G.particles = []; G.deposits = []; G.scoreRes = null;
    G.sim = S.simulate(G.L, G.controls, { intensity: G.L.forecast.intensity }); updateHud(); selectTool(G.tool);
  }
  function showLevels() {
    var html = '<h2>SWP3 Designer</h2><p>You are the engineer designing the erosion &amp; sediment control plan. Place controls, then run the storm.</p>';
    for (var n = 1; n <= S.LEVEL_COUNT; n++) {
      var L = S.makeLevel(n), s = progress.stars[n] || 0, locked = n > 1 && !(progress.stars[n - 1] >= 1);
      var st = ''; for (var k = 1; k <= 3; k++) st += k <= s ? '★' : '☆';
      html += '<button type="button" class="lvl" data-act="lvl' + n + '"' + (locked ? ' disabled' : '') + '><b>' + n + '. ' + L.name + '</b><span>' + (locked ? '🔒' : st) + '</span></button>';
    }
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
  $('forecastChip').addEventListener('click', function () { if (G.phase === 'plan') showForecast(); });
  window.addEventListener('resize', function () { resize(); });
  window.addEventListener('keydown', function (e) { if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undo(); } });

  // ---------- boot ----------
  resize();
  loadLevel(Math.min(S.LEVEL_COUNT, Math.max(1, +(location.hash.slice(1)) || 1)));
  if (!location.hash) showLevels();
  requestAnimationFrame(frame);
  window.__swp3 = G; // for debugging
})();
