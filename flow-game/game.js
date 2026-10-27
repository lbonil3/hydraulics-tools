/* Storm Designer - rendering, input and game flow. Hydraulics live in sim.js (window.FlowSim).
 * Engine patterns (geometry snapping, quality tiers, LOD, picking, painter queue, settings) adapted from swp3-game/game.js. */
(function () {
  'use strict';
  var S = window.FlowSim, P = window.SWP3Pick, A = window.SWP3Art, FA = window.FlowArt, SOLS = window.FlowSolutions;
  var TW = A.TW, TH = A.TH, BASE = A.BASE, U = TW / 32;
  var SAVE_KEY = 'flow-game-v1', SB_KEY = 'flow-game-sandbox-v1', SET_KEY = 'flow-game-settings';
  var $ = function (id) { return document.getElementById(id); };
  var HDM = 'TxDOT Hydraulic Design Manual (9/2019)';

  // ---------- tools ----------
  var TOOLS = [
    { id: 'inspect', icon: '🔍', label: 'Inspect' },
    { id: 'inlet', icon: '▭', label: 'Inlet', rule: 'Curb inlet pair (both gutters) on a curbed street tile. On grade some flow runs past (bypass/carryover); at a low point (sag) it takes everything that ponds there. Aim: spread within the limit and bypass leaving the project under about 0.5 cfs.',
      basis: HDM + ' Ch.10 Sec.4 (spread limits, inlets at all low points), Eq 10-5..10-13 curb inlet on grade; TxDOT PCO curb inlet 5 ft, 9.5 ft (+1 ext), 14 ft (+2 ext) from the TxDOT standard sheets (drainage/txdot-inlets.js).', game: 'Game rule: bypass leaving the project under 0.5 cfs (office practice target).' },
    { id: 'pipe', icon: '═', label: 'Pipe', rule: 'Drag from an inlet toward the outfall to lay RCP storm sewer, one 50-ft tile at a time (or tap start, then tap each next tile). Manholes are added automatically at junctions, bends and ends. Pick the size; slope comes from cover and self-cleaning velocity.',
      basis: HDM + ' Ch.10 Sec.2: non-pressure (gravity) flow, HGL below inlet throats/manhole tops, velocity 3–12 ft/s, cover 3 ft where possible. HGL and junction losses: storm/calc.js (HEC-22 method).', game: 'Game: invert design is automatic; cost = Item 464 RCP $/LF x 50 ft.' },
    { id: 'ditch', icon: '⋁', label: 'Ditch', rule: 'Roadside ditch on open ground: drag along the road to the creek. Pick the lining: the shear stress (62.4 x depth x slope) must stay below the lining\u2019s permissible shear.',
      basis: HDM + ' Ch.7 Sec.3 (Eq 7-2, permissible shear table: grass retardance D 0.60, synthetic mat 2.00, rock D50 6 in 2.50 lb/sf); FHWA HEC-15.', game: 'Game: 2-ft bottom, 3:1 sides, 1.5 ft deep; concrete permissible shear is a game value.' },
    { id: 'culvert', icon: '◯', label: 'Culvert', rule: 'Place on the road-over-creek tile. Pick barrel size and count: the design-storm headwater must stay below the road edge, or the road overtops.',
      basis: HDM + ' Ch.8 Sec.2 (allowable headwater below the roadway), Table 4-2 design frequency; FHWA HDS-5 inlet/outlet control via culvert/calc.js.', game: 'Game: 80-ft RCP barrels, square edge with headwall.' },
    { id: 'pond', icon: '▢', label: 'Pond', rule: 'Detention pond blocks (50x50 ft, 4 ft deep) on open lawn. Blocks that touch edge-to-edge make ONE pond (one basin, one water level). It must include the flagged outfall tile. Then add its one outlet structure.',
      basis: HDM + ' Ch.10 Sec.3 Detention: detention changes the rate, not the volume; consider it to avoid damage to adjacent properties.', game: 'Game: post-development peak must not exceed pre-development (common local rule); modified-rational routing.' },
    { id: 'outlet', icon: '▮', label: 'Outlet', rule: 'One outlet riser per pond: tap any block of the outfall pond. It sits on the rim facing the creek (nearest the block you tap) and pipes to the outfall. An orifice controls small releases; a weir (crest 3 ft) passes big storms; above 4 ft the pond spills over the rim there.',
      basis: 'Orifice Q = 0.6 A √(2gh), weir Q = 3.0 L H^1.5 (standard hydraulics; FHWA HEC-22 detention chapter).', game: 'Game: outlet cost $8,000.' },
    { id: 'demolish', icon: '✖', label: 'Remove' }
  ];
  var SB_TOOLS = [
    { id: 'raise', icon: '⬆', label: 'Raise', help: '<b>Raise:</b> tap a tile to raise it 0.5 ft.' },
    { id: 'lower', icon: '⬇', label: 'Lower', help: '<b>Lower:</b> tap a tile to lower it 0.5 ft.' },
    { id: 'p:G', paint: 'G', icon: '🟩', label: 'Lawn', help: '<b>Lawn / open</b>, C = 0.15.' },
    { id: 'p:T', paint: 'T', icon: '🌳', label: 'Trees', help: '<b>Park / trees</b>, C = 0.15.' },
    { id: 'p:H', paint: 'H', icon: '🏠', label: 'House', help: '<b>House lot</b>, C = 0.45. Must not flood.' },
    { id: 'p:P', paint: 'P', icon: '🅿', label: 'Paving', help: '<b>Parking / pavement</b>, C = 0.90.' },
    { id: 'p:R', paint: 'R', icon: '🛣', label: 'Street', help: '<b>Curbed street</b> (curb &amp; gutter), C = 0.90.' },
    { id: 'p:Q', paint: 'Q', icon: '🚜', label: 'Rural rd', help: '<b>Rural road</b> (no curb): needs a ditch.' },
    { id: 'p:C', paint: 'C', icon: '🌊', label: 'Creek', help: '<b>Creek</b> (outfall).' }
  ];
  function findTool(id) { return TOOLS.concat(SB_TOOLS).filter(function (x) { return x.id === id; })[0]; }
  var TYPE_NAME = { G: 'Lawn / open', T: 'Park / trees', H: 'House lot', P: 'Parking / pavement', R: 'Curbed street', Q: 'Rural road (no curb)', C: 'Creek', X: 'Road over creek' };
  var LIN_NAMES = { grass: 'Grass', mat: 'Mat', rock: 'Rock', conc: 'Concrete' };

  // ---------- state ----------
  var G = { level: null, L: null, controls: [], history: [], tool: 'inspect', phase: 'plan', zoom: 2, panX: 0, panY: 0, flowView: false, ug: false,
    opt: { len: 10, dia: 24, lining: 'grass', cdia: 48, cbar: 1, orif: 12, weir: 4 }, live: null, scoreRes: null, stormT: 0, stormDur: 10, speed: 1, born: {}, selTile: -1, editTile: -1, hoverTile: -1, round: 0, chainFrom: -1, sugLeft: 0 };
  var progress = (function () { try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || { stars: {} }; } catch (e) { return { stars: {} }; } })();
  function saveProgress() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(progress)); } catch (e) { /* private mode */ } }

  // ---------- canvas / geometry (as swp3-game) ----------
  var view = $('view'), vctx = view.getContext('2d');
  var buf = document.createElement('canvas'), bctx = buf.getContext('2d');
  var terrain = document.createElement('canvas'), tctx = terrain.getContext('2d');
  var geo = null, dpr = 1, QUAL = { low: 1, medium: 1.5, high: 2 }, RQ = 1, baseRQ = 1, lodTimer = 0, frameMs = [], frameIdx = 0;
  function resize() { dpr = Math.min(window.devicePixelRatio || 1, 3); var r = view.getBoundingClientRect(); view.width = Math.max(1, Math.round(r.width * dpr)); view.height = Math.max(1, Math.round(r.height * dpr)); }
  function buildGeometry(L, q) {
    q = q || RQ; var minH = Infinity, maxH = -Infinity, i;
    for (i = 0; i < L.heights.length; i++) { minH = Math.min(minH, L.heights[i]); maxH = Math.max(maxH, L.heights[i]); }
    var zs = Math.min(1.5 * U, 90 * U / Math.max(1, maxH - minH)); // 3 px/ft: every land tile centre stays visible (pickable)
    var z = L.heights.map(function (h) { return Math.round((h - minH) * zs * q) / q; });
    var maxZ = Math.max.apply(null, z);
    var w = (L.W + L.H) * TW / 2 + 16, h = Math.ceil(((L.W + L.H) * TH / 2 + maxZ + BASE + 40) * q) / q;
    return { z: z, zs: zs, minH: minH, w: w, h: h, ox: L.H * TW / 2 + 8, oy: Math.round((maxZ + 30) * q) / q, q: q };
  }
  function tileTop(x, y) { var i = y * G.L.W + x; return { x: geo.ox + (x - y) * TW / 2, y: geo.oy + (x + y) * TH / 2 - geo.z[i] }; }
  function tp(i) { return tileTop(i % G.L.W, (i / G.L.W) | 0); }
  function tileCenter(i) { var p = tp(i); return { x: p.x, y: p.y + TH / 2 }; }
  function alongY(i) { var L = G.L, W = L.W, x = i % W, y = (i / W) | 0, rd = function (xx, yy) { return xx >= 0 && yy >= 0 && xx < W && yy < L.H && /[RQX]/.test(L.types[yy * W + xx]); }; return (rd(x, y - 1) || rd(x, y + 1)) && !(rd(x - 1, y) || rd(x + 1, y)); }
  function drawTerrain() {
    var L = G.L, q = geo.q || 1; terrain.width = Math.round(geo.w * q); terrain.height = Math.round(geo.h * q);
    A.setQuality(q);
    FA.drawTerrain(tctx, { W: L.W, H: L.H, types: L.types, z: geo.z.map(function (v) { return Math.round(v * q); }), ox: Math.round(geo.ox * q), oy: Math.round(geo.oy * q), w: terrain.width, h: terrain.height, TW: TW * q, TH: TH * q, BASE: BASE * q });
    G.creekTiles = []; for (var i = 0; i < L.types.length; i++) if (L.types[i] === 'C') G.creekTiles.push(i);
    buildScenery();
  }
  // static scenery (houses, trees) as painter-queue items; skipped on tiles that hold a pond/ditch
  // a lot whose house can hide a street or gutter tile behind it (the tile up-screen: x-1, y-1 or the diagonal) or that borders a street
  function nearStreet(i) { var L = G.L, W = L.W, x = i % W, y = (i / W) | 0;
    for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) { var xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= L.H) continue; if (/[RQPX]/.test(L.types[yy * W + xx])) return true; } return false; }
  // x-ray: fade houses/trees by streets so gutter spread, inlets and pipes read clearly (setting: auto / always show)
  function xray() { if (G.houses === 'show') return false; if (G.houses === 'xray') return true; return G.phase !== 'plan' || /^(inlet|pipe|inspect)$/.test(G.tool); }
  function buildScenery() {
    var L = G.L, sc = [], r = S.rng(77 + (L.id || 0)), i, k;
    for (i = 0; i < L.types.length; i++) {
      var t = L.types[i], p = tp(i);
      var nr = nearStreet(i);
      if (t === 'H') sc.push({ i: i, kind: 'house', y: p.y + TH / 2 + 4, seed: i, near: nr });
      if (t === 'H' && r() < 0.35) { var a = A.at(p, 0.85, 0.2); sc.push({ i: i, kind: 'tree', x: a.x, y: a.y, seed: i * 3, near: nr }); }
      if (t === 'T') for (k = 0; k < 2; k++) { var b = A.at(p, 0.25 + 0.5 * r(), 0.25 + 0.5 * r()); sc.push({ i: i, kind: 'tree', x: b.x, y: b.y, seed: i * 5 + k, near: nr }); }
    }
    G.scen = sc;
    G.cars = []; var roads = []; for (i = 0; i < L.types.length; i++) if (/[RQ]/.test(L.types[i])) roads.push(i);
    for (k = 0; k < Math.min(3, Math.floor(roads.length / 6)); k++) G.cars.push({ i: roads[(r() * roads.length) | 0], t: r(), seed: k + (L.id || 0), sp: 0.25 + 0.2 * r() });
  }

  // ---------- frame ----------
  var lastT = 0;
  function Q(y, f) { G.q.push({ y: y, f: f }); }
  function frame(t) {
    var dt = Math.min(0.05, (t - (lastT || t)) / 1000); lastT = t;
    if (!G.L) { requestAnimationFrame(frame); return; }
    var t0 = performance.now();
    if (buf.width !== terrain.width || buf.height !== terrain.height) { buf.width = terrain.width; buf.height = terrain.height; }
    var ctx = bctx; ctx.setTransform(geo.q, 0, 0, geo.q, 0, 0); ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, geo.w, geo.h); ctx.drawImage(terrain, 0, 0, geo.w, geo.h);
    if (G.phase === 'storm') stepStorm(G.paused ? 0 : dt * G.speed);
    var f = stormF();
    drawCreek(ctx, t, f); drawCulvertFarWater(ctx, t, f);
    if (G.phase !== 'plan') drawWater(ctx, t, f);
    G.post = []; drawFlatControls(ctx, t, f);
    if (G.flowView) drawFlowView(ctx);
    G.q = [];
    drawScenery(ctx, t, dt, f);
    drawTallControls(ctx, t, f);
    G.q.sort(function (a, b) { return a.y - b.y; }).forEach(function (e) { e.f(); });
    G.post.forEach(function (fn) { fn(); });
    if (G.ug) drawUnderground(ctx, t, f);
    if (G.phase === 'report' || (G.phase === 'storm' && f > 0.75)) drawMarks(ctx, t);
    if (G.phase === 'plan') {
      if (G.ghost) drawGhost(ctx, t);
      if (G.solGhost) drawSolGhost(ctx, t);
      if (G.hintTiles) G.hintTiles.forEach(function (i) { outlineTile(ctx, i, Math.floor(t / 350) % 2 ? '#ffd23a' : '#fff59a'); });
      if (G.chainFrom >= 0) outlineTile(ctx, G.chainFrom, Math.floor(t / 250) % 2 ? '#7fc6e6' : '#fff');
      if (G.hoverTile >= 0 && G.hoverTile !== G.selTile) outlineTile(ctx, G.hoverTile, 'rgba(255,255,160,.85)');
      if (G.selTile >= 0) outlineTile(ctx, G.selTile, '#fff');
    }
    if (G.phase === 'report' && G.scoreRes) drawFailures(ctx, t);
    if (G.focus && t < G.focus.until) outlineTile(ctx, G.focus.tile, Math.floor(t / 200) % 2 ? '#ff3b2f' : '#fff');
    vctx.setTransform(1, 0, 0, 1, 0, 0);
    vctx.fillStyle = G.phase === 'storm' ? '#4a5f70' : '#8fc0dc'; vctx.fillRect(0, 0, view.width, view.height);
    var sc = G.zoom * dpr; vctx.imageSmoothingEnabled = sc / geo.q < 0.999; if (vctx.imageSmoothingEnabled) vctx.imageSmoothingQuality = 'high';
    vctx.setTransform(sc, 0, 0, sc, Math.round(view.width / 2 + G.panX * dpr), Math.round(view.height / 2 + G.panY * dpr));
    vctx.drawImage(buf, -geo.w / 2, -geo.h / 2, geo.w, geo.h);
    vctx.setTransform(1, 0, 0, 1, 0, 0);
    if (G.phase === 'storm') { var rf = rainF(f); vctx.fillStyle = 'rgba(28,38,58,' + (0.22 * rf).toFixed(3) + ')'; vctx.fillRect(0, 0, view.width, view.height); drawRain(t, rf); drawLightning(t); }
    if (G.phase === 'storm' || G.phase === 'report') drawChart(f);
    frameMs[frameIdx++ % 120] = performance.now() - t0;
    requestAnimationFrame(frame);
  }
  function outlineTile(ctx, i, col) {
    var p = tp(i), lw = 1.5, ins = lw; ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath();
    ctx.moveTo(p.x, p.y + ins / 2); ctx.lineTo(p.x + TW / 2 - ins, p.y + TH / 2); ctx.lineTo(p.x, p.y + TH - ins / 2); ctx.lineTo(p.x - TW / 2 + ins, p.y + TH / 2); ctx.closePath(); ctx.stroke(); ctx.restore();
  }
  // culvert geometry: which way the creek runs through the road tile, the visible (near) face and how deep the bed is below the road
  function culvertGeo(i) { var L = G.L, W = L.W, x = i % W, y = (i / W) | 0, wat = function (xx, yy) { return xx >= 0 && yy >= 0 && xx < W && yy < L.H && S.isWater(L.types[yy * W + xx]); };
    var axis = (wat(x - 1, y) || wat(x + 1, y)) ? 'u' : 'v', near = axis === 'u' ? (x + 1 < W ? i + 1 : -1) : (y + 1 < L.H ? i + W : -1), far = axis === 'u' ? (x > 0 ? i - 1 : -1) : (y > 0 ? i - W : -1);
    var bedTile = near >= 0 && S.isWater(L.types[near]) ? near : far, drop = bedTile >= 0 ? geo.z[i] - geo.z[bedTile] : 12;
    if (near < 0) drop = geo.z[i] + BASE - 2; // map edge: the face runs down the side of the block
    var upNear = near >= 0 && far >= 0 && L.heights[near] > L.heights[far] + 1e-9;
    return { axis: axis, near: near, far: far, drop: Math.max(4, drop), zs: geo.zs, upNear: upNear, bedEl: bedTile >= 0 ? L.heights[bedTile] : L.heights[i] - drop / geo.zs }; }
  // headwater (upstream) and tailwater (downstream) depths in px above the bed at this moment of the storm
  function culvertWater(g, f) { var L = G.L, r = res(), cv = r && r.culvert, q = G.phase === 'plan' ? 0 : qf(f); if (!cv || q <= 0) return { up: 0, dn: 0 };
    var d = L.culvert.design || L.design, base = 0.6, hw = cv.HW != null ? cv.HW : L.culvert.roadEl + 1.5, tw = L.culvert.tw ? L.culvert.tw[d] : g.bedEl + 1;
    var cap = (L.culvert.roadEl - g.bedEl) * g.zs + 3, up = Math.min(cap, (base + Math.max(0, hw - g.bedEl - base) * q) * g.zs), dn = Math.min(cap, (base + Math.max(0, tw - g.bedEl - base) * q) * g.zs);
    return { up: up, dn: dn }; }
  function culvertOpts(c, k, t, f) { var g = culvertGeo(c.tile); return { dia: c.dia, barrels: c.barrels, axis: g.axis, drop: g.drop, zs: g.zs, prog: k == null ? 1 : prog(k, t, 1400), t: t, flow: G.phase === 'storm' ? qf(f) : 0 }; }
  // far-side water against the embankment: clipped so it never paints over the road tile's top or faces
  // water standing in a creek tile, clipped so it never paints over the down-screen neighbours (banks, the road block) that hide it
  function bankCap(i) { var L = G.L, W = L.W, x = i % W, y = (i / W) | 0, m = Infinity; [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) { var xx = x + d[0], yy = y + d[1]; if (xx < 0 || yy < 0 || xx >= W || yy >= L.H) return; var j = yy * W + xx; if (!S.isWater(L.types[j]) && L.types[j] !== 'X') m = Math.min(m, geo.z[j] - geo.z[i]); }); return m === Infinity ? 99 : Math.max(0, m - 0.5); }
  function drawSlotWater(ctx, i, depth, t, seed) { depth = Math.min(depth, bankCap(i)); if (depth <= 0.3) return; var L = G.L, W = L.W, x = i % W, y = (i / W) | 0, nb = []; // the slot holds the water; overtopping shows on the road
    if (x + 1 < W) nb.push(i + 1); if (y + 1 < L.H) nb.push(i + W); if (x + 1 < W && y + 1 < L.H) nb.push(i + W + 1);
    ctx.save(); ctx.beginPath(); ctx.rect(-50, -50, geo.w + 100, geo.h + 100);
    nb.forEach(function (j) { if (S.isWater(L.types[j]) || geo.z[j] <= geo.z[i] + depth - 0.5) return; var p = tp(j), a0 = A.at(p, 0, 0), a1 = A.at(p, 1, 0), a2 = A.at(p, 1, 1), a3 = A.at(p, 0, 1), dz = geo.z[j] + BASE;
      ctx.moveTo(a0.x, a0.y); ctx.lineTo(a3.x, a3.y); ctx.lineTo(a3.x, a3.y + dz); ctx.lineTo(a2.x, a2.y + dz); ctx.lineTo(a1.x, a1.y + dz); ctx.lineTo(a1.x, a1.y); ctx.closePath(); });
    ctx.clip('evenodd'); FA.drawCreekWater(ctx, tp(i), depth, t, seed); ctx.restore(); }
  function drawCulvertFarWater(ctx, t, f) { var L = G.L; if (!L.culvert || G.phase === 'plan') return; var i = L.culvert.tile, g = culvertGeo(i); if (g.far < 0 || !S.isWater(L.types[g.far])) return;
    var w = culvertWater(g, f); drawSlotWater(ctx, g.far, g.upNear ? w.dn : w.up, t, 7); }
  function drawCreek(ctx, t, f) {
    var lvl = G.phase === 'plan' ? 0 : f;
    for (var k = 0; k < G.creekTiles.length; k++) {
      var i = G.creekTiles[k], p = tp(i);
      if (lvl > 0) A.diamond(ctx, p, 0.05, 'rgba(120,100,70,' + (0.35 * Math.sin(Math.PI * Math.min(1, lvl))).toFixed(2) + ')');
      for (var q = 0; q < 3; q++) { var ph = ((t / (1600 - 900 * lvl) + A.hash(i, q, 51)) % 1), w = A.at(p, 0.15 + 0.7 * ph, 0.2 + 0.6 * A.hash(i, q, 52)), a = Math.sin(ph * Math.PI);
        ctx.fillStyle = 'rgba(200,232,255,' + (0.55 * a).toFixed(2) + ')'; ctx.fillRect(Math.round(w.x) - 3, Math.round(w.y), 6, 1); }
    }
  }
  // ---------- storm timing ----------
  function stormF() { return G.phase === 'storm' ? Math.min(1, G.stormT / G.stormDur) : G.phase === 'report' ? 1 : 0; }
  function rainF(f) { return f < 0.05 ? f / 0.05 : f < 0.45 ? 1 : Math.max(0, 1 - (f - 0.45) / 0.25); }
  function hydro(f) { return f < 0.4 ? f / 0.4 : Math.max(0, 1 - (f - 0.4) / 0.45); } // rational (triangular) hydrograph shape
  function qf(f) { return G.phase === 'report' ? 0.15 : hydro(f); }
  function res() { return G.phase === 'plan' ? G.live && G.live.result : G.showRes || (G.scoreRes && G.scoreRes.result); }
  // ---------- water ----------
  function drawWater(ctx, t, f) {
    var r = res(); if (!r) return; var L = G.L, W = L.W, q = qf(f), rf = G.phase === 'storm' ? rainF(f) : 0, k;
    var flooded = {}; (G.scoreRes ? G.scoreRes.evals : []).forEach(function (e) { if (e.status === 'flooded lot') flooded[e.tile] = 1; });
    if (G.showCheck) G.showCheck.wet.forEach(function (w) { flooded[w.tile] = 1; });
    for (var i = 0; i < L.types.length; i++) {
      var ty = L.types[i], p = tp(i); if (ty === 'C') continue;
      if (rf > 0.05) A.diamond(ctx, p, 0.08, 'rgba(170,200,230,' + (0.12 * rf * (/[RPQX]/.test(ty) ? 1.6 : 0.8)).toFixed(3) + ')'); // wet sheen
      var g = r.gut[i];
      if (g && (ty === 'R' || ty === 'X')) { // gutter flow band from each curb, width = spread
        var spread = (g.T || 0) * q, fr = Math.min(0.5, 0.06 + spread / 32), over = g.T > L.Tallow + 1e-9 && q > 0.6, ay = alongY(i);
        var col = over ? 'rgba(230,90,70,.55)' : g.kind === 'sag' ? 'rgba(90,150,220,.75)' : 'rgba(90,160,230,.6)';
        for (var s2 = 0; s2 < 2; s2++) { var a0 = s2 ? 1 - fr : 0.04, a1 = s2 ? 0.96 : fr, P0 = ay ? [A.at(p, a0, 0), A.at(p, a1, 0), A.at(p, a1, 1), A.at(p, a0, 1)] : [A.at(p, 0, a0), A.at(p, 1, a0), A.at(p, 1, a1), A.at(p, 0, a1)];
          ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(P0[0].x, P0[0].y); for (k = 1; k < 4; k++) ctx.lineTo(P0[k].x, P0[k].y); ctx.closePath(); ctx.fill(); }
        if (spread > 0.5) for (k = 0; k < 3; k++) { var ph = (t / 700 + A.hash(i, k, 61)) % 1, d = r.dir[i], dxs = d >= 0 ? Math.sign((d % W) - (i % W)) : 0, dys = d >= 0 ? Math.sign(((d / W) | 0) - ((i / W) | 0)) : 0;
          var uu = ay ? 0.08 + 0.8 * fr * A.hash(i, k, 62) : 0.5 + dxs * (ph - 0.5), vv = ay ? 0.5 + dys * (ph - 0.5) : 0.08 + 0.8 * fr * A.hash(i, k, 62), w = A.at(p, uu, vv);
          ctx.fillStyle = 'rgba(235,248,255,.75)'; ctx.fillRect(Math.round(w.x) - 2, Math.round(w.y), 4, 1); }
        if (over && Math.floor(t / 300) % 2) outlineTile(ctx, i, '#ff6a4a');
        if (g.kind === 'sag' && (g.ponded || over) && q > 0.4) { A.diamond(ctx, p, 0.02, 'rgba(70,130,210,' + (0.55 + 0.12 * Math.sin(t / 260)).toFixed(2) + ')'); // water standing across the lanes
          for (k = 0; k < 4; k++) { var rp = ((t / 900) + k / 4) % 1, cc0 = tileCenter(i); ctx.strokeStyle = 'rgba(220,240,255,' + (0.7 * (1 - rp)).toFixed(2) + ')'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(cc0.x + (A.hash(i, k, 5) - 0.5) * 20, cc0.y + (A.hash(i, k, 6) - 0.5) * 8, 2 + rp * 9, 1 + rp * 4.5, 0, 0, Math.PI * 2); ctx.stroke(); } }
      }
      if (flooded[i] && (q > 0.3 || G.phase === 'report')) A.diamond(ctx, p, 0.06, 'rgba(70,120,190,' + (0.45 + 0.15 * Math.sin(t / 300)).toFixed(2) + ')');
    }
    if (rf > 0.1) { var n = Math.round(30 * rf); for (k = 0; k < n; k++) { var seed = Math.floor(t / 120) * 131 + k, ti = (A.hash(seed, 1, 71) * L.types.length) | 0, pp = tp(ti), sp = A.at(pp, A.hash(seed, 2, 71), A.hash(seed, 3, 71)), fr2 = (t % 120) / 120, rad = 1 + Math.round(fr2 * 3);
      ctx.fillStyle = 'rgba(220,240,255,' + (0.8 * (1 - fr2)).toFixed(2) + ')'; ctx.fillRect(Math.round(sp.x) - rad, Math.round(sp.y), 1, 1); ctx.fillRect(Math.round(sp.x) + rad, Math.round(sp.y), 1, 1); } }
  }
  function drawRain(t, rf) {
    if (rf <= 0.02) return; vctx.strokeStyle = 'rgba(200,220,255,' + (0.55 * rf).toFixed(2) + ')'; vctx.lineWidth = Math.max(1, dpr); vctx.beginPath();
    var n = Math.round((60 + 50 * Math.min(2, (G.stormYr || 10) / 25)) * rf), W = view.width, H = view.height;
    for (var k = 0; k < n; k++) { var x = ((k * 97 + t * 0.35 * (1 + k % 3)) % (W + 60)) - 30, y = ((k * 53 + t * 0.9 * (1 + (k % 4) * 0.2)) % (H + 40)) - 20; vctx.moveTo(x, y); vctx.lineTo(x - 5 * dpr, y + 14 * dpr); }
    vctx.stroke();
  }
  function drawLightning(t) {
    if (!G.bigStorm) return;
    if (!G.boltAt || t > G.boltAt + 1400) { G.boltAt = t + 1500 + Math.random() * 2500; G.thunderDone = false; }
    var d = t - G.boltAt; if (d < 0) return;
    if (!G.thunderDone && d > 250) { G.thunderDone = true; snd('thunder'); }
    var a = d < 90 ? 0.5 : d < 150 ? 0.1 : d < 230 ? 0.35 : Math.max(0, 0.35 - (d - 230) / 500); if (G.reduced) a = Math.min(a, 0.06); if (a <= 0) return;
    vctx.fillStyle = 'rgba(235,240,255,' + a.toFixed(2) + ')'; vctx.fillRect(0, 0, view.width, view.height);
  }
  // ---------- controls ----------
  function hasNoBuild() { return G.L.nobuild && Object.keys(G.L.nobuild).length > 0; }
  function utilKnown() { return hasUtil() && (G.round > 0 || G.utilShown); }
  function hasUtil() { return G.L.util && Object.keys(G.L.util).length > 0; }
  function evalFor(k, el) { var r = G.phase === 'plan' ? G.live : G.scoreRes; if (!r) return null; var e = r.evals.filter(function (x) { return x.k === k && (!el || x.el === el); }); return e.filter(function (x) { return x.status !== 'ok'; })[0] || e[0] || null; }
  function prog(k, t, ms) { var b = G.born[k]; return b == null ? 1 : Math.max(0, Math.min(1, (t - b) / (ms || 900))); }
  // ---------- ponds: edge-adjacent blocks are one body with one water surface and one outlet ----------
  function pondTiles(cs) { return (cs || G.controls).filter(function (c) { return c.type === 'pond'; }).map(function (c) { return c.tile; }); }
  function pondCells(g) { var W = G.L.W; return g.tiles.map(function (i) { var x = i % W; return { p: tp(i), n: { u0: x > 0 && !!g.set[i - 1], u1: x < W - 1 && !!g.set[i + 1], v0: !!g.set[i - W], v1: !!g.set[i + W] } }; }); }
  function pondState(f) { // bodies, the outfall body, its outlet control and where the outlet structure sits; level 0..1.2 of 4 ft
    var L = G.L, tiles = pondTiles(), key = tiles.join(','), ps = G._ponds;
    if (!ps || ps.key !== key || ps.L !== L) { var gs = S.pondGroups(L, tiles), body = null; gs.forEach(function (g) { if (L.pondSite != null && g.set[L.pondSite]) body = g; }); ps = G._ponds = { key: key, L: L, groups: gs, body: body }; }
    var oc = null; G.controls.forEach(function (c) { if (c.type === 'outlet') oc = c; });
    var r = res(), pd = r && r.pond, lv = 0, storm = G.phase !== 'plan'; if (pd && pd.hasPond && storm) lv = pondLevel(pd, f);
    var spot = ps.body && oc ? S.outletSpot(L, ps.body, oc.tile) : null;
    return { groups: ps.groups, body: ps.body, oc: oc, spot: spot, level: lv, local: storm ? Math.min(0.3, 0.3 * qf(f)) : 0 };
  }
  function drawPonds(ctx, t, f) {
    var st = pondState(f); if (!st.groups.length) return;
    st.groups.forEach(function (g, k) { FA.drawPondBody(ctx, pondCells(g), { level: g === st.body ? st.level : st.local, t: t, seed: k + 1 }); });
    if (st.spot) FA.drawOutletFlat(ctx, tp(st.spot.tile), st.spot.edge, { t: t, water: st.spot.water, flow: G.phase === 'storm' ? Math.min(1, st.level * 1.6) : 0, over: G.phase !== 'plan' && st.level > 1.0 });
  }
  function drawFlatControls(ctx, t, f) {
    var r = res(), L = G.L, W = L.W, q = qf(f);
    drawPonds(ctx, t, f);
    G.controls.forEach(function (c, k) {
      if (c.type === 'ditch') { var d = r ? r.dir[c.tile] : -1, alongV = d >= 0 ? Math.abs(d - c.tile) === W : true; FA.drawDitch(ctx, tp(c.tile), { lining: c.lining, alongV: alongV, prog: prog(k, t) });
        var dr = r && r.ditches[c.tile]; if (dr && G.phase !== 'plan') { var dd = Math.min(1.6, dr.d) * q, cen = tileCenter(c.tile); ctx.fillStyle = 'rgba(80,150,220,' + Math.min(0.85, 0.3 + dd * 0.5).toFixed(2) + ')';
          var ww = Math.max(1, Math.round(dd * 6)); for (var s2 = 0; s2 < 30; s2++) { var l = s2 / 30; for (var w = -ww; w <= ww; w++) { var pt = alongV ? A.at(tp(c.tile), 0.5 + w / 26, l) : A.at(tp(c.tile), l, 0.5 + w / 26); ctx.fillRect(Math.round(pt.x), Math.round(pt.y + 1), 2, 1); } }
          var e = evalFor(k, 'ditch'); if (e && e.status !== 'ok' && q > 0.5) { spray(ctx, cen.x, cen.y, t, k, e.status === 'scoured' ? '#a87444' : '#dff2ff');
            if (e.status === 'overtopped' || e.status === 'dead end') { A.diamond(ctx, tp(c.tile), 0.0, 'rgba(70,130,210,.5)'); [-1, 1].forEach(function (sd) { var nb = alongV ? c.tile + sd : c.tile + sd * W; if (nb >= 0 && nb < L.types.length && L.types[nb] !== 'C') A.diamond(ctx, tp(nb), 0.15, 'rgba(70,130,210,' + (0.25 + 0.1 * Math.sin(t / 250 + sd)).toFixed(2) + ')'); }); } } } }
      if (c.type === 'inlet') { var g = r && r.gut[c.tile]; FA.drawInlet(ctx, tp(c.tile), { len: c.len, alongY: alongY(c.tile), t: t, prog: prog(k, t), flow: G.phase === 'storm' && g ? Math.min(1, (g.Qi || 0) / 3) * q : 0, box: true });
        var e2 = evalFor(k, 'inlet'); if (e2 && G.phase === 'storm' && e2.Qb > 0.05 && q > 0.3) { var cc = tileCenter(c.tile), dn = r.dir[c.tile] >= 0 ? tileCenter(r.dir[c.tile]) : cc, ph = (t / 600) % 1; ctx.fillStyle = e2.Qb > 0.5 ? '#ff9a3a' : '#bfe6ff'; ctx.fillRect(Math.round(cc.x + (dn.x - cc.x) * ph) - 2, Math.round(cc.y + (dn.y - cc.y) * ph) - 4, 4, 2); } }
    });
    if (L.pondSite != null && G.phase === 'plan' && !G.controls.some(function (c) { return c.type === 'pond' && c.tile === L.pondSite; })) { var c0 = tileCenter(L.pondSite); A.rect(ctx, c0.x - 1, c0.y - 18, 1, 18, '#fff'); A.rect(ctx, c0.x, c0.y - 18, 7, 5, '#2f7a3d'); }
    if (hasNoBuild()) Object.keys(L.nobuild).forEach(function (i) { FA.drawNoBuild(ctx, tp(+i)); });
    if (hasUtil() && (G.round > 0 || G.utilShown)) Object.keys(L.util).forEach(function (i) { FA.drawUtility(ctx, tp(+i), t); });
    var nr = r && r.net; if (nr && nr.nodes && !G.ug) Object.keys(nr.nodes).forEach(function (k2) { var nd = nr.nodes[k2], cc2 = tileCenter(+k2), sur = G.phase === 'storm' && nd.surch && q > 0.5;
      if (nd.kind === 'junction' || nd.kind === 'bend' || nd.kind === 'end') FA.drawLid(ctx, cc2.x + 8, cc2.y + 2, sur, t); else if (nd.kind === 'inlet' && sur) FA.drawLid(ctx, cc2.x, cc2.y, true, t);
      if (sur) G.post.push(function () { geyser(ctx, cc2.x + (nd.kind === 'inlet' ? 0 : 8), cc2.y + 2, t, +k2); }); });
  }
  // the creek pouring over the road: brown-blue sheet, moving streaks across the lanes, spray on the downstream edge
  function overtop(ctx, i, t, k) { var L = G.L, W = L.W, ay = alongY(i), tiles = [i]; // the road tile over the creek and the road tiles either side
    [ay ? -W : -1, ay ? W : 1].forEach(function (d) { var j = i + d; if (j >= 0 && j < L.types.length && /[QRX]/.test(L.types[j])) tiles.push(j); });
    tiles.forEach(function (ti, n) { var p = tp(ti); A.diamond(ctx, p, 0.0, 'rgba(84,130,170,' + ((n ? 0.45 : 0.78) + 0.1 * Math.sin(t / 200 + n)).toFixed(2) + ')');
      for (var s = 0; s < 16; s++) { var ph = ((t / 480) + A.hash(ti, s, 33)) % 1, w = A.hash(ti, s, 34), pt = ay ? A.at(p, ph, w) : A.at(p, w, ph); ctx.fillStyle = 'rgba(235,246,255,' + (0.9 * (1 - Math.abs(ph - 0.5) * 1.6)).toFixed(2) + ')'; ctx.fillRect(Math.round(pt.x) - 4, Math.round(pt.y), 8, 2); } });
    var c = tileCenter(i); for (var m = 0; m < 3; m++) spray(ctx, c.x + (m - 1) * 14, c.y + 6, t + m * 170, k + m, m === 1 ? '#ffffff' : '#cfe8ff');
    if (Math.floor(t / 400) % 2) outlineTile(ctx, i, '#ff6a4a'); }
  // a geyser out of a surcharged manhole/inlet lid
  function geyser(ctx, x, y, t, k) { var h = 16 + 5 * Math.sin(t / 140 + k); ctx.fillStyle = 'rgba(200,230,255,.85)'; ctx.fillRect(Math.round(x) - 1, Math.round(y - h), 3, Math.round(h));
    for (var f2 = 0; f2 < 12; f2++) { var ph = ((t / 420) + A.hash(k, f2, 81)) % 1, dx = (A.hash(k, f2, 82) - 0.5) * 22 * ph; ctx.fillStyle = f2 % 3 ? '#cfe8ff' : '#ffffff'; ctx.fillRect(Math.round(x + dx), Math.round(y - h + h * ph * ph * 1.1), 2, 2); } }
  // ✓ / ✗ badges over every checked element once the storm has peaked; passing ones pulse green
  var MARK_EL = { inlet: 1, pipe: 1, ditch: 1, culvert: 1, detention: 1, street: 1, node: 1, lot: 1, check: 1, pond: 1 };
  function drawMarks(ctx, t) { var r = G.scoreRes || G.live; if (!r) return; var by = {};
    r.evals.forEach(function (e) { if (!MARK_EL[e.el] || e.tile == null || e.tile < 0) return; if (e.el === 'street' && e.status === 'ok') return; var bad = e.status !== 'ok' && !e.warn; var cur = by[e.tile]; if (!cur || (bad && !cur.bad)) by[e.tile] = { bad: bad }; });
    var age = G.reportAt ? t - G.reportAt : 0, pulse = 0.5 + 0.5 * Math.sin(t / 220);
    Object.keys(by).forEach(function (k) { var m = by[k], c = tileCenter(+k), y = c.y - 20 - (G.phase === 'report' ? Math.max(0, 6 - age / 80) : 0);
      if (!m.bad) { ctx.strokeStyle = 'rgba(80,230,120,' + (0.35 + 0.4 * pulse).toFixed(2) + ')'; ctx.lineWidth = 1.5; outlineTile(ctx, +k, ctx.strokeStyle); }
      ctx.fillStyle = m.bad ? '#e8463a' : '#2fbf5b'; ctx.beginPath(); ctx.arc(c.x, y, 6, 0, Math.PI * 2); ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = '#fff'; ctx.stroke();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); if (m.bad) { ctx.moveTo(c.x - 2.5, y - 2.5); ctx.lineTo(c.x + 2.5, y + 2.5); ctx.moveTo(c.x + 2.5, y - 2.5); ctx.lineTo(c.x - 2.5, y + 2.5); } else { ctx.moveTo(c.x - 3, y); ctx.lineTo(c.x - 1, y + 2.5); ctx.lineTo(c.x + 3, y - 2.5); } ctx.stroke(); }); }
  function spray(ctx, x, y, t, k, col) { for (var f2 = 0; f2 < 10; f2++) { var ph = ((t / 500) + A.hash(k, f2, 91)) % 1; ctx.fillStyle = f2 % 3 ? col : '#ffffff'; ctx.fillRect(Math.round(x + (A.hash(k, f2, 92) - 0.5) * 30), Math.round(y - 12 * (1 - ph) * (1 - ph) + 8 * ph), 2, 2); } }
  function pondLevel(pd, f) { var ser = pd.ser; if (!ser || !ser.length) return 0; var tEnd = ser[ser.length - 1][0], tm = f * tEnd, k = 0; while (k < ser.length - 1 && ser[k + 1][0] < tm) k++; return Math.min(1.2, (ser[k][3] || 0) / 4); }
  function big(ctx, x, y, f) { ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.scale(1.5, 1.5); f(); ctx.restore(); }
  function nextRoad(i, prev) { var L = G.L, W = L.W, x = i % W, y = (i / W) | 0, c = []; [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) { var xx = x + d[0], yy = y + d[1]; if (xx >= 0 && yy >= 0 && xx < W && yy < L.H && /[RQX]/.test(L.types[yy * W + xx])) c.push(yy * W + xx); });
    var f = c.filter(function (j) { return j !== prev; }); if (!f.length) return prev != null ? prev : i; return f[(i * 7 + (prev || 0)) % f.length]; }
  function drawScenery(ctx, t, dt, f) {
    var busy = {}; G.controls.forEach(function (c) { if (c.type === 'pond' || c.type === 'ditch') busy[c.tile] = 1; });
    var wind = G.phase === 'storm' ? rainF(f) : 0.15;
    var xr = xray(), fa = xr ? 0.3 : 1;
    (G.scen || []).forEach(function (s) { if (busy[s.i]) return; var al = s.near ? fa : 1; if (s.kind === 'house') { var p = tp(s.i); Q(s.y, function () { if (al < 1) ctx.globalAlpha = al; FA.drawHouse(ctx, p, s.seed); ctx.globalAlpha = 1; }); } else Q(s.y, function () { if (al < 1) ctx.globalAlpha = al; FA.drawTree(ctx, s.x, s.y, s.seed, G.reduced ? 0 : t, wind); ctx.globalAlpha = 1; }); });
    (G.cars || []).forEach(function (c) {
      if (G.phase !== 'storm' && !G.reduced) { c.t += dt * c.sp; while (c.t >= 1) { c.t -= 1; var nx = nextRoad(c.i, c.prev); c.prev = c.i; c.i = nx; } }
      var a = tileCenter(c.i), b = tileCenter(nextRoad(c.i, c.prev)), x = a.x + (b.x - a.x) * c.t, y = a.y + (b.y - a.y) * c.t, dirX = (b.x - a.x) * (b.y - a.y) >= 0 ? 1 : -1;
      Q(y, function () { FA.drawCar(ctx, x, y - 2, dirX, c.seed, G.phase === 'storm'); });
    });
    var shown = 0;
    for (var j = G.controls.length - 1; j >= 0 && shown < 2; j--) { var bt = G.born[j], cc = G.controls[j]; if (bt == null || t - bt > 1300 || t < bt) continue; shown++;
      var cp = tileCenter(cc.type === 'pipe' ? cc.b : cc.tile), fr = Math.floor(t / 140);
      (function (cp, fr) { Q(cp.y + 4, function () { big(ctx, cp.x - 18, cp.y + 4, function () { A.drawWorker(ctx, 0, 0, fr, 'hammer', 1); }); }); })(cp, fr);
      if (G.lastHammer !== fr && fr % 2 === 0) { G.lastHammer = fr; snd('hammer'); } }
  }
  function drawTallControls(ctx, t, f) {
    var q = qf(f), hasCulv = false;
    G.controls.forEach(function (c, k) {
      if (c.type === 'culvert') { hasCulv = true; var p = tp(c.tile), cen = tileCenter(c.tile); Q(cen.y + 2, function () { var o = culvertOpts(c, k, t, f), g = culvertGeo(c.tile); FA.drawCulvert(ctx, p, o);
        if (g.near >= 0 && S.isWater(G.L.types[g.near]) && G.phase !== 'plan') { var w = culvertWater(g, f); drawSlotWater(ctx, g.near, g.upNear ? w.up : w.dn, t, 5); }
        var e = evalFor(k, 'culvert'); if (e && e.status === 'overtopped' && G.phase !== 'plan' && q > 0.4) overtop(ctx, c.tile, t, k); }); }
    });
    var ps = pondState(f); if (ps.spot) { var sp = ps.spot, p3 = tp(sp.tile), og = FA.outletGeo(p3, sp.edge); Q(og.base.y + 2, function () { FA.drawOutlet(ctx, p3, { edge: sp.edge, t: t, level: ps.level, orif: ps.oc.orif, weir: ps.oc.weir }); }); }
    if (G.L.culvert && !hasCulv && G.phase !== 'plan' && q > 0.3) Q(tileCenter(G.L.culvert.tile).y + 3, function () { overtop(ctx, G.L.culvert.tile, t, 99); });
  }
  // ---------- underground view: pipes, structures, HGL ----------
  function pipeList() { var r = res(); return r && r.net && r.net.pipes ? Object.keys(r.net.pipes).map(function (k) { return r.net.pipes[k]; }) : []; }
  function drawUnderground(ctx, t, f) {
    var r = res(), q = G.phase === 'plan' ? 0 : qf(f), drawn = {}; ctx.save(); ctx.globalCompositeOperation = 'source-atop'; ctx.fillStyle = 'rgba(40,28,18,.55)'; ctx.fillRect(0, 0, geo.w, geo.h); ctx.restore(); // tint only the site, never the sky
    pipeList().forEach(function (pp) {
      var a = tileCenter(pp.a), b = tileCenter(pp.b), w = Math.max(2, Math.round(pp.dia / 9)), full = pp.Qfull ? pp.Q / pp.Qfull : 0, over = full > 1.001, dep = 6;
      drawn[pp.a + ':' + pp.b] = 1; ctx.lineCap = 'round';
      ctx.strokeStyle = pp.existing ? '#8a8a8a' : '#c8c8c0'; ctx.lineWidth = w + 2; ctx.beginPath(); ctx.moveTo(a.x, a.y + dep); ctx.lineTo(b.x, b.y + dep); ctx.stroke();
      ctx.strokeStyle = '#2a2a2e'; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(a.x, a.y + dep); ctx.lineTo(b.x, b.y + dep); ctx.stroke();
      if (G.phase !== 'plan') { var fill = Math.min(1, full * q); ctx.strokeStyle = over && q > 0.6 ? 'rgba(240,80,60,.95)' : 'rgba(80,160,240,' + (0.4 + 0.6 * fill).toFixed(2) + ')'; ctx.lineWidth = Math.max(1, w * Math.min(1, fill + 0.1)); ctx.beginPath(); ctx.moveTo(a.x, a.y + dep); ctx.lineTo(b.x, b.y + dep); ctx.stroke();
        for (var k = 0; k < 3; k++) { var ph = (t / 500 + k / 3) % 1; ctx.fillStyle = '#e0f4ff'; ctx.fillRect(Math.round(a.x + (b.x - a.x) * ph) - 1, Math.round(a.y + dep + (b.y - a.y) * ph) - 1, 2, 2); }
        if (pp.HGLup != null) { var ha = (pp.HGLup - G.L.heights[pp.a]) * geo.zs * q, hb = (pp.HGLdn - G.L.heights[pp.b]) * geo.zs * q; ctx.strokeStyle = 'rgba(120,220,255,.95)'; ctx.lineWidth = 1; ctx.setLineDash([3, 2]); ctx.beginPath(); ctx.moveTo(a.x, a.y - ha); ctx.lineTo(b.x, b.y - hb); ctx.stroke(); ctx.setLineDash([]); } }
      else { ctx.fillStyle = pp.existing ? '#c8c8c8' : '#ffe08a'; ctx.font = '7px monospace'; ctx.fillText(pp.dia + '"', Math.round((a.x + b.x) / 2) + 3, Math.round((a.y + b.y) / 2) + dep - 3); }
    });
    G.controls.forEach(function (c) { if (c.type === 'pipe' && !drawn[c.a + ':' + c.b] && !drawn[c.b + ':' + c.a]) { var a = tileCenter(c.a), b = tileCenter(c.b); ctx.strokeStyle = 'rgba(255,120,90,.8)'; ctx.lineWidth = 2; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(a.x, a.y + 6); ctx.lineTo(b.x, b.y + 6); ctx.stroke(); ctx.setLineDash([]); } });
    var nr = r && r.net; if (nr && nr.nodes) Object.keys(nr.nodes).forEach(function (k) { var nd = nr.nodes[k], c = tileCenter(+k); if (nd.kind === 'joint') return; A.rect(ctx, c.x - 3, c.y + 1, 6, 9, nd.kind === 'outfall' ? '#2f7a3d' : nd.surch && G.phase !== 'plan' ? '#e0533a' : '#9a9a94'); A.rect(ctx, c.x - 3, c.y + 1, 6, 1, '#d8d8d0'); });
    if (hasUtil() && (G.round > 0 || G.utilShown)) Object.keys(G.L.util).forEach(function (i) { var c = tileCenter(+i); ctx.strokeStyle = '#ffd400'; ctx.lineWidth = 2; ctx.setLineDash([2, 2]); ctx.beginPath(); ctx.moveTo(c.x - 16, c.y - 8); ctx.lineTo(c.x + 16, c.y + 8); ctx.stroke(); ctx.setLineDash([]); });
  }
  function drawFlowView(ctx) {
    var r = res(); if (!r) return;
    for (var i = 0; i < r.dir.length; i++) { if (G.L.types[i] === 'C') continue; var Qc = r.CA[i] * r.i, c = tileCenter(i), j = r.dir[i]; ctx.fillStyle = Qc > 10 ? '#e0533a' : Qc > 3 ? '#ff9a3a' : '#cfe8ff';
      if (j < 0) { ctx.fillRect(Math.round(c.x) - 2, Math.round(c.y) - 2, 5, 5); continue; }
      var d = tileCenter(j), dx = d.x - c.x, dy = d.y - c.y; for (var q = 0; q < 10; q++) ctx.fillRect(Math.round(c.x + dx * q / 24), Math.round(c.y + dy * q / 24), 2, 2); ctx.fillRect(Math.round(c.x + dx * 10 / 24) - 2, Math.round(c.y + dy * 10 / 24) - 2, 5, 5); }
  }
  function drawFailures(ctx, t) { var on = Math.floor(t / 300) % 2 === 0; G.scoreRes.fails.forEach(function (e) { if (e.tile < 0) return; outlineTile(ctx, e.tile, on ? '#ff3b2f' : '#ffd23a'); var c = tileCenter(e.tile); FA.drawFlag(ctx, c.x, c.y, '#ff3b2f'); }); }
  // ---------- live strip chart ----------
  function drawChart(f) {
    var cv = $('chart'), r = res(); if (!r) return; var c = cv.getContext('2d'), w = cv.width, h = cv.height; c.clearRect(0, 0, w, h);
    var series = [], pre = null, label = '', pd = r.pond, k;
    if (pd && pd.hasPond && pd.ser && pd.ser.length) { var tEnd = pd.ser[pd.ser.length - 1][0]; series.push({ col: '#7fc6e6', pts: pd.ser.map(function (s) { return [s[0] / tEnd, s[1]]; }) }); series.push({ col: '#5dff7a', pts: pd.ser.map(function (s) { return [s[0] / tEnd, s[2]]; }) }); pre = pd.pre.Q; label = 'Pond inflow / release (cfs)'; }
    else { var peak = 0; if (r.net && r.net.Qout) Object.keys(r.net.Qout).forEach(function (k2) { peak += r.net.Qout[k2]; }); Object.keys(r.ditches || {}).forEach(function (k2) { if (G.L.types[r.dir[k2]] === 'C') peak += r.ditches[k2].Q; });
      Object.keys(r.gut).forEach(function (k2) { if (r.gut[k2].leaves) peak += r.gut[k2].leaves; }); if (r.culvert) peak = Math.max(peak, r.culvert.Q);
      var pts = []; for (k = 0; k <= 40; k++) pts.push([k / 40, peak * hydro(k / 40)]); series.push({ col: '#7fc6e6', pts: pts }); label = r.culvert ? 'Creek at the culvert (cfs)' : 'Flow leaving the site (cfs)'; if (pd && pd.pre) pre = pd.pre.Q; }
    var ymax = 1; series.forEach(function (s) { s.pts.forEach(function (p) { ymax = Math.max(ymax, p[1]); }); }); if (pre) ymax = Math.max(ymax, pre); ymax *= 1.15;
    var X = function (x) { return 6 + x * (w - 12); }, Y = function (y) { return h - 14 - y / ymax * (h - 28); };
    c.strokeStyle = 'rgba(255,255,255,.15)'; c.lineWidth = 1; c.beginPath(); c.moveTo(6, Y(0)); c.lineTo(w - 6, Y(0)); c.stroke();
    if (pre) { c.strokeStyle = '#ffd23a'; c.setLineDash([4, 3]); c.beginPath(); c.moveTo(6, Y(pre)); c.lineTo(w - 6, Y(pre)); c.stroke(); c.setLineDash([]); c.fillStyle = '#ffd23a'; c.font = '10px system-ui'; c.fillText('pre-dev ' + pre.toFixed(1), w - 76, Y(pre) - 3); }
    series.forEach(function (s) { c.strokeStyle = s.col; c.lineWidth = 2; c.beginPath(); var st = false; s.pts.forEach(function (p) { if (p[0] > f + 1e-9) return; if (!st) { c.moveTo(X(p[0]), Y(p[1])); st = true; } else c.lineTo(X(p[0]), Y(p[1])); }); c.stroke(); });
    c.fillStyle = '#e8f0f8'; c.font = '10px system-ui'; c.fillText(label + ' · peak ' + series.map(function (s) { return Math.max.apply(null, s.pts.map(function (p) { return p[1]; })).toFixed(1); }).join(' / '), 6, 11);
    c.fillStyle = 'rgba(255,255,255,.6)'; c.fillRect(X(f), h - 12, 1, 10);
  }
  // ---------- storm ----------
  function runStorm() {
    if (G.phase !== 'plan') return;
    if (!G.controls.length) toast('Nothing built — let\u2019s see what the storm does…');
    G.scoreRes = S.score(G.L, plain(), { round: G.round }); G.showRes = G.scoreRes.result; G.showCheck = null; G.stormYr = G.L.design;
    G.phase = 'storm'; G.stormT = 0; G.speed = 1; $('speedBtn').textContent = '1×'; G.bigStorm = G.L.design >= 25; G.checkStage = false; G.ghost = null; $('tileTip').classList.add('hidden');
    $('chart').classList.remove('hidden'); $('infoCard').classList.add('hidden'); $('opts').innerHTML = ''; $('tileInfo').classList.add('hidden');
    $('stormHud').classList.remove('hidden'); $('stormLabel').textContent = '🌧 ' + G.L.design + '-yr storm (' + S.intensity(G.L.design, 10).toFixed(1) + ' in/hr)';
    if (window.FlowSound) FlowSound.rain(Math.min(2, G.L.design / 25 + 0.4)); updateHud();
    if (hasUtil() && !G.round) setTimeout(function () { if (G.phase === 'storm') { G.utilShown = true; banner('⚠ Surprise: utility locate!<br><small>A gas line runs under the yellow flags.</small>'); snd('alarm'); } }, 1200);
  }
  function stepStorm(dt) {
    G.stormT += dt;
    if (G.stormT >= G.stormDur) {
      if (G.L.check && !G.checkStage && G.scoreRes.check && !G.replay) { // surprise: the 100-yr storm (TxDOT: evaluate all facilities to the 1% AEP)
        G.checkStage = true; G.stormT = 0; G.showRes = G.scoreRes.check.res; G.showCheck = G.scoreRes.check; G.bigStorm = true; G.stormYr = G.L.check;
        $('stormLabel').textContent = '⚡ ' + G.L.check + '-yr storm!'; banner('⚡ Surprise! The ' + G.L.check + '-yr storm hits<br><small>Bigger than the ' + G.L.design + '-yr design storm: do the houses stay dry?</small>'); if (window.FlowSound) FlowSound.rain(2); return;
      }
      endStorm();
    }
  }
  function endStorm() {
    if (G.phase !== 'storm') return; G.phase = 'report'; $('stormHud').classList.add('hidden'); if (window.FlowSound) FlowSound.rain(0);
    var r = G.scoreRes, L = G.L, wasReplay = G.replay; if (!wasReplay) G.round = (G.round || 0) + 1;
    G.reportAt = performance.now(); setTimeout(function () { snd(r.stars >= 3 ? 'win' : r.stars >= 2 ? 'jingle' : 'fail'); }, 200);
    if (!L.sandbox && !wasReplay && r.stars > (progress.stars[L.id] || 0)) { progress.stars[L.id] = r.stars; saveProgress(); }
    G.replay = false; showReport();
  }
  function evLabel(e) { return ({ street: 'Street', inlet: 'Inlet', pipe: 'Pipe', node: 'Structure', ditch: 'Ditch', culvert: 'Culvert', pond: 'Pond', detention: 'Detention', lot: 'Lot', check: '100-yr check', budget: 'Budget', outlet: 'Outlet' })[e.el] || e.el; }
  function basisTag(b) { b = b || ''; var tx = /TxDOT/.test(b), fh = /HEC|HDS|FHWA/.test(b); return tx ? 'TxDOT' + (fh ? ' + FHWA' : '') : fh ? 'FHWA' : 'game rule'; }
  function showReport() {
    var r = G.scoreRes, L = G.L, st = '', k; for (k = 1; k <= 3; k++) st += k <= r.stars ? '★' : '<span class="off">★</span>';
    var row = function (e, cls) { return '<div class="ev ' + cls + '" data-tile="' + e.tile + '"><div class="st">' + evLabel(e) + ' · ' + e.status + (e.tile >= 0 ? ' (' + (e.tile % L.W) + ',' + ((e.tile / L.W) | 0) + ') ›' : '') + '</div>' + e.reason + '<small>Basis (' + basisTag(e.basis) + '): ' + (e.basis || 'game rule') + '</small></div>'; };
    var fails = r.fails.map(function (e) { return row(e, 'bad'); }).join(''), warns = r.warns.map(function (e) { return row(e, 'warn'); }).join(''), oks = r.evals.filter(function (e) { return e.status === 'ok'; });
    var html = '<h2>Report — ' + L.name + '</h2><div class="stars">' + st + '</div><p><b>Score ' + r.score + '/100</b> · ' + r.fails.length + ' fail' + (r.fails.length === 1 ? '' : 's') + ', ' + r.warns.length + ' warning' + (r.warns.length === 1 ? '' : 's') + '</p>' +
      '<div class="stat"><span>Design storm</span><b>' + L.design + '-yr · ' + S.intensity(L.design, 10).toFixed(2) + ' in/hr (10 min)</b>' +
      (L.culvert && L.culvert.design !== L.design ? '<span>Culvert storm</span><b>' + L.culvert.design + '-yr</b>' : '') + (L.detDesign && L.detDesign !== L.design ? '<span>Detention storm</span><b>' + L.detDesign + '-yr</b>' : '') + (L.check ? '<span>Check storm</span><b>' + L.check + '-yr (1% AEP)</b>' : '') +
      '<span>Cost</span><b>$' + r.cost.toLocaleString() + ' / $' + r.budget.toLocaleString() + '</b></div>' +
      '<h3>What went wrong?</h3>' + (fails || '<div class="ev">Nothing failed. 🎉</div>') + (warns ? '<h3>Warnings</h3>' + warns : '') +
      '<details class="more"><summary>All ' + oks.length + ' checks that passed</summary>' + oks.map(function (e) { return row(e, ''); }).join('') + '</details>' +
      '<details class="more"><summary>Cost breakdown</summary><table class="costs">' + costBreakdown() + '</table></details>' +
      '<div class="tip">💡 ' + (L.tip || '') + '</div>' +
      '<div class="btns"><button type="button" data-act="view">See site</button><button type="button" data-act="replay">Replay storm</button><button type="button" data-act="retry">Revise plan</button>' +
      (L.sandbox ? '<button type="button" class="primary" data-act="sbstorm">Change storm</button>' : (r.stars < 3 ? '<button type="button" data-act="solask">Show solution</button>' : '') + (L.id < S.LEVEL_COUNT ? '<button type="button" class="primary" data-act="next">Next level</button>' : '<button type="button" class="primary" data-act="levels">Levels</button>')) + '</div>';
    openPanel(html);
  }
  function costBreakdown() {
    var by = {}, cs = plain(); cs.forEach(function (c) { var key = c.type === 'ditch' ? 'ditch tile (' + c.lining + ')' : c.type === 'pipe' ? c.dia + '-in RCP x 50 ft' : c.type === 'culvert' ? c.barrels + ' x ' + c.dia + '-in culvert' : c.type === 'inlet' ? c.len + '-ft inlet pair' : c.type === 'pond' ? 'pond block' : c.type; by[key] = by[key] || { n: 0, cost: 0, type: c.type }; by[key].n++; by[key].cost += S.controlCost(c); });
    var src = { inlet: 'TxDOT bid Item 465 inlet (PCO)(5FT) $8,557 each side; extensions = game cost', pipe: 'TxDOT bid Item 464 RCP CL III $/LF', ditch: 'Item 110 channel excavation + lining (Item 169 mat / Item 432 riprap; grass = game cost)', culvert: 'Item 464 RCP x 80 ft + Item 466 headwalls', pond: 'game cost', outlet: 'game cost' };
    var rows = Object.keys(by).map(function (k) { return '<tr><td>' + by[k].n + ' × ' + k + '<br><small>' + (src[by[k].type] || '') + '</small></td><td>$' + by[k].cost.toLocaleString() + '</td></tr>'; });
    var mh = G.scoreRes.cost - cs.reduce(function (s, c) { return s + S.controlCost(c); }, 0); if (mh > 0) rows.push('<tr><td>Manholes / junction boxes<br><small>TxDOT bid Item 465 MANH (PRM)(48 IN) $7,939</small></td><td>$' + mh.toLocaleString() + '</td></tr>');
    return rows.join('') + '<tr><td><b>Total</b> <small>(bid prices: statewide averages from bid-cost/prices.json)</small></td><td><b>$' + G.scoreRes.cost.toLocaleString() + '</b></td></tr>';
  }
  function backToPlan() {
    var cut = G.L.budgetCut && G.round > 0 && !G.cutShown; G.phase = 'plan'; G.scoreRes = null; G.showRes = null; G.showCheck = null; $('chart').classList.add('hidden');
    refresh(); selectTool(G.tool);
    if (cut) { G.cutShown = true; setTimeout(function () { banner('✂ Budget cut!<br><small>The client cut the budget to $' + G.L.budgetCut.toLocaleString() + '</small>'); snd('alarm'); }, 300); }
  }
  function replayStorm() { if (!G.scoreRes) return; G.phase = 'storm'; G.stormT = 0; G.showRes = G.scoreRes.result; G.showCheck = null; G.checkStage = false; G.replay = true; G.bigStorm = G.L.design >= 25; $('chart').classList.remove('hidden'); $('stormHud').classList.remove('hidden'); $('stormLabel').textContent = '↻ ' + G.L.design + '-yr storm'; if (window.FlowSound) FlowSound.rain(1); }
  function banner(html) { var b = $('banner'); b.innerHTML = html; b.classList.remove('hidden'); clearTimeout(banner.t); banner.t = setTimeout(function () { b.classList.add('hidden'); }, 2800); }

  // ---------- input: tap / drag-draw / pan / pinch / wheel ----------
  var pointers = {}, gesture = null, DRAG_TOOLS = { pipe: 1, ditch: 1, pond: 1 };
  view.addEventListener('pointerdown', function (e) {
    view.setPointerCapture && view.setPointerCapture(e.pointerId); pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    G.lastTouch = e.pointerType !== 'mouse';
    var ids = Object.keys(pointers);
    if (ids.length === 1) gesture = { type: 'maybeTap', sx: e.clientX, sy: e.clientY, px: G.panX, py: G.panY };
    if (ids.length === 1 && G.phase === 'plan' && DRAG_TOOLS[G.tool] && !e.shiftKey && e.button === 0) { var t0 = screenToTile(e.clientX, e.clientY); if (t0 >= 0) gesture = { type: 'maybeDraw', start: t0, last: t0, n: 0, sx: e.clientX, sy: e.clientY, px: G.panX, py: G.panY, touch: e.pointerType !== 'mouse', t0: performance.now() }; }
    else if (ids.length === 2) { if (gesture && gesture.type === 'draw') endDraw(); var a = pointers[ids[0]], b = pointers[ids[1]]; gesture = { type: 'pinch', d0: dist(a, b), z0: G.zoom }; }
    e.preventDefault();
  });
  view.addEventListener('pointermove', function (e) {
    if (e.pointerType === 'mouse' && !pointers[e.pointerId]) { var h = screenToTile(e.clientX, e.clientY); G.hoverTile = h; updateGhost(h); $('tileTip').innerHTML = G.ghost ? G.ghost.msg : ''; $('tileTip').classList.toggle('hidden', !G.ghost); return; }
    if (!pointers[e.pointerId]) return; pointers[e.pointerId] = { x: e.clientX, y: e.clientY }; if (!gesture) return;
    var moved = Math.hypot(e.clientX - gesture.sx, e.clientY - gesture.sy);
    if (gesture.type === 'maybeDraw' && moved > 8) { // touch: quick swipe pans; hold-then-drag (or mouse) draws
      if (gesture.touch && performance.now() - gesture.t0 < 220) gesture.type = 'pan';
      else { gesture.type = 'draw'; if (G.tool === 'pipe') G.chainFrom = gesture.start; else if (placeAt(gesture.start, true)) gesture.n++; }
    }
    if (gesture.type === 'draw') { var ft = screenToTile(e.clientX, e.clientY); if (ft >= 0 && ft !== gesture.last) { stepDraw(ft); gesture.last = ft; } e.preventDefault(); return; }
    if (gesture.type === 'maybeTap' && moved > 8) gesture.type = 'pan';
    if (gesture.type === 'pan') { G.hoverTile = -1; G.panX = gesture.px + (e.clientX - gesture.sx); G.panY = gesture.py + (e.clientY - gesture.sy); clampPan(); }
    else if (gesture.type === 'pinch') { var ids = Object.keys(pointers); if (ids.length < 2) return; setZoom(gesture.z0 * dist(pointers[ids[0]], pointers[ids[1]]) / Math.max(1, gesture.d0)); }
    e.preventDefault();
  });
  function stepDraw(ft) {
    if (G.tool === 'pipe') gridPath(G.chainFrom, ft).forEach(function (j) { if (gesture.stop) return; var had = G.controls.some(function (c) { return c.type === 'pipe' && ((c.a === G.chainFrom && c.b === j) || (c.b === G.chainFrom && c.a === j)); });
      if (addPipe(G.chainFrom, j, true)) gesture.n++; else if (!had) { gesture.stop = true; gesture.why = S.isWater(G.L.types[G.chainFrom]) ? null : (hasNoBuild() && G.L.nobuild[j]) ? '⛔ Client no-build lot: no pipe through it' : (utilKnown() && G.L.util[j]) ? '⚠ Buried gas line: route the pipe around it' : null; if (gesture.why) snd('buzz'); return; } G.chainFrom = j; });
    else gridPath(gesture.last, ft).forEach(function (j) { if (placeAt(j, true)) gesture.n++; else if (!gesture.why) gesture.why = placeBlock(G.tool, j); });
  }
  function endDraw() { if (gesture.n > 0) { refresh(); if (G.tool === 'pipe') { showPipeInfo(); if (G.chainFrom >= 0 && S.isWater(G.L.types[G.chainFrom])) toast('✓ Outfall: the pipe run ends in the creek'); } else toast(gesture.n + ' placed (drag)'); } else if (gesture.why) toast(gesture.why); if (G.tool === 'pipe') G.chainFrom = -1; }
  function gridPath(a, b) { var W = G.L.W, x = a % W, y = (a / W) | 0, x1 = b % W, y1 = (b / W) | 0, o = []; while (x !== x1 || y !== y1) { if (Math.abs(x1 - x) >= Math.abs(y1 - y)) x += Math.sign(x1 - x); else y += Math.sign(y1 - y); o.push(y * W + x); } return o; }
  function endPointer(e) {
    if (!pointers[e.pointerId]) return; delete pointers[e.pointerId];
    if (gesture && (gesture.type === 'maybeTap' || gesture.type === 'maybeDraw') && Object.keys(pointers).length === 0) onTap(e.clientX, e.clientY);
    if (gesture && gesture.type === 'draw') endDraw();
    if (Object.keys(pointers).length === 0) gesture = null; else if (gesture && gesture.type === 'pinch') gesture = { type: 'pan', sx: e.clientX, sy: e.clientY, px: G.panX, py: G.panY };
  }
  view.addEventListener('pointerup', endPointer);
  view.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') { G.hoverTile = -1; G.ghost = null; $('tileTip').classList.add('hidden'); } });
  view.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  view.addEventListener('pointercancel', function (e) { delete pointers[e.pointerId]; gesture = null; });
  view.addEventListener('wheel', function (e) { e.preventDefault(); setZoom(G.zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15)); }, { passive: false });
  document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function setZoom(z) { G.zoom = Math.max(0.4, Math.min(3.5, z)); clampPan(); scheduleLOD(); }
  function clampPan() { if (!geo) return; var lim = geo.w * G.zoom / 2 + 50; G.panX = Math.max(-lim, Math.min(lim, G.panX)); G.panY = Math.max(-lim, Math.min(lim, G.panY)); }
  function fitView() { var r = view.getBoundingClientRect(), zw = r.width / geo.w, zh = r.height / geo.h, z = Math.min(zw, zh) * 0.98; if (r.width < 600 && zh > zw) z = Math.min(zh * 0.98, zw * 1.22); G.zoom = Math.max(0.4, Math.min(2.5, z)); G.panX = 0; G.panY = 0; } // portrait phone: fill more of the screen, edges pan
  function screenToTile(cx, cy) { // single pick function for hover and tap (pick.js)
    if (!geo || !G.L) return -1;
    var b = P.clientToBuffer(cx, cy, { rect: view.getBoundingClientRect(), viewW: view.width, viewH: view.height, zoom: G.zoom, panX: G.panX, panY: G.panY, dpr: dpr, geoW: geo.w, geoH: geo.h });
    return P.pickTile({ W: G.L.W, H: G.L.H, z: geo.z, ox: geo.ox, oy: geo.oy, TW: TW, TH: TH, BASE: BASE }, b.x, b.y);
  }
  function wantQ() { var q = baseRQ; if (settings.lod !== false && q < 2 && G.zoom * dpr / q > 1.5) q = q < 1.5 ? 1.5 : 2; return q; }
  function setRenderQuality(q) { if (!G.L || (geo && geo.q === q)) { RQ = q; return; } RQ = q; geo = buildGeometry(G.L, q); drawTerrain(); }
  function scheduleLOD() { clearTimeout(lodTimer); lodTimer = setTimeout(function () { var q = wantQ(); if (geo && q !== geo.q) setRenderQuality(q); }, 250); }
  // test / debug hooks (same contract as the swp3-game hooks)
  window.__flowFrameStats = function () { var a = frameMs.slice().sort(function (x, y) { return x - y; }); return { n: a.length, avg: a.reduce(function (s, v) { return s + v; }, 0) / Math.max(1, a.length), p95: a[Math.floor(a.length * 0.95)] || 0, q: geo && geo.q, buf: buf.width + 'x' + buf.height }; };
  window.__flowResetFrames = function () { frameMs = []; frameIdx = 0; };
  window.__flowLoad = function (n) { closePanel(); if (n === 0) loadSandbox(true); else loadLevel(n, true); };
  window.__flowPick = function (cx, cy) { return screenToTile(cx, cy); };
  window.__flowTileClient = function (i) { var c = tileCenter(i); return P.bufferToClient(c.x, c.y, { rect: view.getBoundingClientRect(), viewW: view.width, viewH: view.height, zoom: G.zoom, panX: G.panX, panY: G.panY, dpr: dpr, geoW: geo.w, geoH: geo.h }); };
  window.__flowState = function () { return { level: G.L.id, phase: G.phase, sel: G.selTile, hover: G.hoverTile, n: G.L.W * G.L.H, controls: G.controls.length, zoom: G.zoom, q: geo.q, stars: G.scoreRes && G.scoreRes.stars, score: G.scoreRes && G.scoreRes.score, live: G.live && { score: G.live.score, stars: G.live.stars, cost: G.live.cost } }; };
  window.__flowSolve = function () { closePanel(); trySolution(); };
  window.__flowRun = function () { closePanel(); runStorm(); };
  window.__flowSkip = function () { if (G.phase !== 'storm') return; G.stormT = G.stormDur; stepStorm(0); if (G.phase === 'storm') { G.stormT = G.stormDur; stepStorm(0); } };
  window.__flowSeek = function (f) { if (G.phase === 'storm') { G.stormT = f * G.stormDur; G.paused = true; } };
  window.__flowUG = function (on) { setUG(on); };
  window.__flowTool = function (id) { selectTool(id); };

  // ---------- gameplay ----------
  function plain1(c) { var o = {}; for (var k in c) if (k !== 'round') o[k] = c[k]; return o; }
  function plain() { return G.controls.map(plain1); }
  function refresh() { G.live = S.score(G.L, plain(), { round: G.round }); G.ghostKey = null; updateHud(); }
  function onTap(cx, cy) {
    if (G.phase !== 'plan') return;
    var i = screenToTile(cx, cy); if (i < 0) return; G.selTile = i;
    var tool = G.tool, st = findTool(tool);
    if (tool === 'inspect') { showTileInfo(i); return; }
    if (st && (st.paint || tool === 'raise' || tool === 'lower')) {
      var oh = G.L.heights[i], ot = G.L.types[i];
      if (!S.editTile(G.L, i, st.paint ? 'paint' : tool, st.paint)) { toast(st.paint ? 'Already ' + TYPE_NAME[ot] : 'Height limit'); return; }
      G.history.push({ op: 'terrain', i: i, h: oh, t: ot }); snd('click'); terrainChanged(); showTileInfo(i, true); return;
    }
    if (G.lastTouch && TW * G.zoom < 72 && /^(inlet|ditch|pond|culvert|outlet|demolish)$/.test(tool) && G.pendTile !== i) { // small tiles under a finger: first tap aims, second tap places
      G.pendTile = i; updateGhost(i); G.hoverTile = i; var gm = G.ghost ? G.ghost.msg : ''; $('tileTip').innerHTML = (gm ? gm + '<br>' : '') + '<b>Tap again to ' + (tool === 'demolish' ? 'remove' : 'place') + '</b> (' + (i % G.L.W) + ',' + ((i / G.L.W) | 0) + ')'; $('tileTip').classList.remove('hidden'); snd('click'); return; }
    G.pendTile = -1; G.hoverTile = -1; $('tileTip').classList.add('hidden');
    if (tool === 'demolish') { removeAt(i); return; }
    if (tool === 'pipe') {
      if (G.chainFrom < 0) { G.chainFrom = i; toast('Pipe starts at (' + (i % G.L.W) + ',' + ((i / G.L.W) | 0) + '): tap the next tiles toward the outfall'); return; }
      if (i === G.chainFrom) { G.chainFrom = -1; toast('Pipe run ended'); return; }
      var n = 0, blocked = false; gridPath(G.chainFrom, i).forEach(function (j) { if (blocked) return; if (addPipe(G.chainFrom, j, false)) n++; else if (!G.controls.some(function (c) { return c.type === 'pipe' && ((c.a === G.chainFrom && c.b === j) || (c.b === G.chainFrom && c.a === j)); })) { blocked = true; return; } G.chainFrom = j; }); refresh(); if (n) showPipeInfo();
      if (G.chainFrom >= 0 && S.isWater(G.L.types[G.chainFrom])) { G.chainFrom = -1; toast('✓ Outfall: the pipe run ends in the creek'); }
      return;
    }
    if (placeAt(i, false)) refresh();
  }
  function removeAt(i) {
    for (var k = G.controls.length - 1; k >= 0; k--) { var c = G.controls[k]; if (c.preset) continue; if (c.tile === i || (c.type === 'pipe' && (c.a === i || c.b === i))) { G.controls.splice(k, 1); G.history.push({ op: 'remove', c: c, k: k }); toast('Removed ' + c.type + ' (+$' + S.controlCost(plain1(c)).toLocaleString() + ')'); snd('dirt'); G.born = {}; refresh(); return; } }
    toast('Nothing to remove here');
  }
  function placeBlock(tool, i) {
    var L = G.L, ty = L.types[i];
    if (hasNoBuild() && L.nobuild[i]) return '⛔ Client no-build lot: nothing can be built here';
    if (tool === 'inlet' && ty !== 'R') return 'Curb inlets go on curbed street tiles';
    if (tool === 'ditch' && !/[GT]/.test(ty) && !(L.sandbox && ty === 'H')) return 'Ditches go on open ground (lawn or trees) beside the road';
    if (tool === 'pond' && (L.sandbox ? /[RQXC]/.test(ty) : ty !== 'G')) return 'Pond blocks go on open lawn';
    if (tool === 'culvert' && (!L.culvert || i !== L.culvert.tile)) return 'Culverts go on the road-over-creek tile';
    if (tool === 'outlet') { var bd = S.pondBody(L, pondTiles()); if (!bd) return 'Build a pond block on the outfall tile (green flag) first'; if (!bd.set[i]) return 'Tap a block of the pond that holds the outfall (green flag): its one outlet sits on that pond\u2019s rim'; }
    return null;
  }
  function makeCtl(tool, i) {
    var o = G.opt;
    if (tool === 'inlet') return { type: 'inlet', tile: i, len: o.len };
    if (tool === 'ditch') return { type: 'ditch', tile: i, lining: o.lining };
    if (tool === 'pond') return { type: 'pond', tile: i };
    if (tool === 'culvert') return { type: 'culvert', tile: i, dia: o.cdia, barrels: o.cbar };
    if (tool === 'outlet') return { type: 'outlet', tile: i, orif: o.orif, weir: o.weir };
    return null;
  }
  function placeAt(i, quiet) {
    var tool = G.tool, why = placeBlock(tool, i); if (why) { if (!quiet) { toast(why); snd('buzz'); } return false; }
    var c = makeCtl(tool, i); if (!c) return false;
    var same = -1; G.controls.forEach(function (x, k) { if (x.type === tool && (x.tile === i || tool === 'outlet')) same = k; }); // one outlet per pond: placing again moves/edits it
    if (same >= 0) { var prev = G.controls[same]; if (JSON.stringify(plain1(prev)) === JSON.stringify(c)) { if (!quiet) { G.editTile = i; toast('Selected this ' + tool + ': option changes now edit it'); } return false; } G.history.push({ op: 'set', k: same, c: prev }); G.controls[same] = Object.assign({ round: G.round }, c); if (!quiet) toast('Changed ' + tool); }
    else { if (!quiet) G.editTile = -1; G.controls.push(Object.assign({ round: G.round }, c)); G.history.push({ op: 'add' }); G.born[G.controls.length - 1] = performance.now(); }
    snd({ inlet: 'grate', ditch: 'dirt', pond: 'dirt', culvert: 'concrete', outlet: 'concrete' }[tool] || 'thunk');
    if (navigator.vibrate) try { navigator.vibrate(8); } catch (e) { /* ignore */ }
    if (!quiet) { refresh(); showElementInfo(i, tool); }
    return true;
  }
  function addPipe(a, b, quiet) {
    var L = G.L, W = L.W; if (a < 0 || b < 0 || a === b) return false;
    if (!(Math.abs(a - b) === W || (Math.abs(a - b) === 1 && ((a / W) | 0) === ((b / W) | 0)))) return false;
    if (S.isWater(L.types[a])) { if (!quiet) toast('The pipe already ends in the creek (outfall). Start a new run at an inlet.'); return false; }
    if (hasNoBuild() && (L.nobuild[a] || L.nobuild[b])) { if (!quiet) { toast('⛔ Client no-build lot: no pipe through it'); snd('buzz'); } return false; }
    if (utilKnown() && (L.util[a] || L.util[b])) { if (!quiet) { toast('⚠ Buried gas line: route the pipe around the yellow tiles'); snd('buzz'); } return false; }
    if ((L.existing || []).some(function (e) { return (e[0] === a && e[1] === b) || (e[0] === b && e[1] === a); })) { if (!quiet) toast('An existing pipe is already here'); return false; }
    var k0 = -1; G.controls.forEach(function (c, k) { if (c.type === 'pipe' && ((c.a === a && c.b === b) || (c.a === b && c.b === a))) k0 = k; });
    if (!G.chainStart || performance.now() - G.chainStart > 2500) G.lastChain = []; G.chainStart = performance.now();
    if (k0 >= 0) { if (G.controls[k0].dia === G.opt.dia) { G.lastChain.push(k0); return false; } G.history.push({ op: 'set', k: k0, c: G.controls[k0] }); G.controls[k0] = Object.assign({}, G.controls[k0], { dia: G.opt.dia }); G.lastChain.push(k0); return true; }
    G.controls.push({ type: 'pipe', a: a, b: b, dia: G.opt.dia, round: G.round }); G.history.push({ op: 'add' }); G.born[G.controls.length - 1] = performance.now(); snd('pipe');
    G.lastChain.push(G.controls.length - 1); return true;
  }
  function undo() {
    if (G.phase !== 'plan') return; var h = G.history.pop(); if (!h) { toast('Nothing to undo'); return; }
    if (h.op === 'terrain') { G.L.heights[h.i] = h.h; G.L.types[h.i] = h.t; terrainChanged(); return; }
    if (h.op === 'replace') G.controls = h.prev; else if (h.op === 'add') G.controls.pop(); else if (h.op === 'set') G.controls[h.k] = h.c; else G.controls.splice(h.k, 0, h.c);
    G.born = {}; refresh();
  }
  // ghost preview: would this element work here? (same scoring as Run Storm, design storm)
  function updateGhost(i) {
    var tool = G.tool; if (i < 0 || G.phase !== 'plan' || !/^(inlet|ditch|pond|culvert|outlet|pipe)$/.test(tool)) { G.ghost = null; return; }
    var key = tool + ':' + i + ':' + G.controls.length + ':' + JSON.stringify(G.opt) + ':' + G.chainFrom; if (G.ghostKey === key) return; G.ghostKey = key;
    var why = tool === 'pipe' ? null : placeBlock(tool, i), ok = !why, msg = why || '', cs = plain(), c, idx = -1;
    if (tool === 'pipe') { if (G.chainFrom < 0 || gridPath(G.chainFrom, i).length !== 1) { G.ghost = { tile: i, type: tool, ok: true, msg: G.chainFrom < 0 ? 'Drag (or tap) from the inlet where the pipe starts' : 'Next tile: one step toward the outfall' }; return; } c = { type: 'pipe', a: G.chainFrom, b: i, dia: G.opt.dia }; }
    else c = makeCtl(tool, i);
    if (!why) { cs.forEach(function (x, k) { if (x.type === tool && x.tile === i && tool !== 'pipe') idx = k; }); if (idx >= 0) cs[idx] = c; else { cs.push(c); idx = cs.length - 1; }
      var r = S.score(G.L, cs, { round: G.round }), es = r.evals.filter(function (e) { return e.k === idx || ((tool === 'pond' || tool === 'outlet') && e.el === 'detention'); }), bad = es.filter(function (e) { return e.status !== 'ok'; });
      if (tool === 'inlet') bad = bad.concat(r.evals.filter(function (e) { return e.el === 'street' && e.status !== 'ok'; }).slice(0, 1));
      ok = !bad.filter(function (e) { return !e.warn; }).length; var e0 = bad[0] || es[0];
      msg = (ok ? '✓ ' : '✗ ' + (e0 ? e0.status + ': ' : '')) + (e0 ? e0.reason : 'OK') + ' <small>(plan score ' + r.score + ', $' + r.cost.toLocaleString() + ')</small>'; }
    G.ghost = { tile: i, type: tool, ok: ok, msg: msg, c: c };
  }
  function drawGhost(ctx, t) {
    var g = G.ghost, p = tp(g.tile); ctx.globalAlpha = 0.65; drawGhostCtl(ctx, g.c, t); ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + TW / 2, p.y + TH / 2); ctx.lineTo(p.x, p.y + TH); ctx.lineTo(p.x - TW / 2, p.y + TH / 2); ctx.closePath();
    ctx.fillStyle = g.ok ? 'rgba(60,220,90,.3)' : 'rgba(240,50,40,.38)'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = g.ok ? '#5dff7a' : '#ff4a3a'; ctx.stroke();
  }
  function drawGhostCtl(ctx, c, t) {
    if (!c) return;
    if (c.type === 'pipe') { var a = tileCenter(c.a), b = tileCenter(c.b); ctx.strokeStyle = '#7fc6e6'; ctx.lineWidth = Math.max(2, c.dia / 9); ctx.beginPath(); ctx.moveTo(a.x, a.y + 6); ctx.lineTo(b.x, b.y + 6); ctx.stroke(); return; }
    var p = tp(c.tile);
    if (c.type === 'inlet') FA.drawInlet(ctx, p, { len: c.len, alongY: alongY(c.tile), t: t });
    else if (c.type === 'ditch') FA.drawDitch(ctx, p, { lining: c.lining, alongV: true });
    else if (c.type === 'pond') { var gs = S.pondGroups(G.L, pondTiles().concat([c.tile])); gs.forEach(function (g) { if (g.set[c.tile]) FA.drawPondBody(ctx, pondCells(g), {}); }); }
    else if (c.type === 'culvert') FA.drawCulvert(ctx, p, culvertOpts(c, null, t, 0));
    else if (c.type === 'outlet') { var bd = S.pondBody(G.L, pondTiles()), sp = bd && S.outletSpot(G.L, bd, c.tile); if (sp) { var p4 = tp(sp.tile); FA.drawOutletFlat(ctx, p4, sp.edge, { water: sp.water }); FA.drawOutlet(ctx, p4, { edge: sp.edge, orif: c.orif, weir: c.weir }); } else FA.drawOutlet(ctx, p, {}); }
  }
  function drawSolGhost(ctx, t) {
    var pulse = 0.35 + 0.25 * Math.sin(t / 300), gp = G.solGhost.filter(function (c) { return c.type === 'pond'; }).map(function (c) { return c.tile; });
    if (gp.length) { ctx.globalAlpha = 0.7; S.pondGroups(G.L, pondTiles().concat(gp)).forEach(function (g) { if (gp.some(function (i) { return g.set[i]; })) FA.drawPondBody(ctx, pondCells(g), {}); }); ctx.globalAlpha = 1; } // ghost blocks shown as the merged pond
    G.solGhost.forEach(function (c, k) { if (c.type !== 'pipe') A.diamond(ctx, tp(c.tile), 0.04, 'rgba(80,200,255,' + pulse.toFixed(2) + ')'); ctx.globalAlpha = 0.7; if (c.type !== 'pond') drawGhostCtl(ctx, c, t); ctx.globalAlpha = 1;
      var n = G.solNum && G.solNum[k]; if (n) { var cc = c.type === 'pipe' ? tileCenter(c.a) : tileCenter(c.tile); ctx.fillStyle = '#0c3a5a'; ctx.fillRect(Math.round(cc.x) - 6, Math.round(cc.y) - 18, 12, 11); ctx.fillStyle = '#fff'; ctx.font = 'bold 9px system-ui'; ctx.fillText(String(n), Math.round(cc.x) - 3, Math.round(cc.y) - 9); } });
  }
  // ---------- info ----------
  function showTileInfo(i, brief) {
    var el = $('tileInfo'), L = G.L, ty = L.types[i], r = G.live.result, h = '<b>' + TYPE_NAME[ty] + '</b> (' + (i % L.W) + ',' + ((i / L.W) | 0) + ')<br>El. ' + L.heights[i].toFixed(2) + ' ft';
    var lu = S.LAND[ty]; if (lu && lu.C < 1) h += ' · C ' + lu.C;
    if (r.CA[i] > 0) h += '<br>Runoff here: ' + (r.CA[i] * r.i).toFixed(2) + ' cfs (' + L.design + '-yr, ΣCA ' + r.CA[i].toFixed(2) + ' ac)';
    var g = r.gut[i]; if (g) h += '<br>Gutter: ' + (g.Q / 2).toFixed(2) + ' cfs per side, spread ' + (g.T || 0).toFixed(1) + ' ft (limit ' + L.Tallow + ' ft), grade ' + (g.SL * 100).toFixed(2) + '%' + (g.kind === 'sag' ? ' · <b>SAG (low point)</b>' : '');
    var d = r.ditches[i]; if (d) h += '<br>Ditch: ' + d.Q.toFixed(2) + ' cfs, depth ' + d.d.toFixed(2) + ' ft, shear ' + d.tau.toFixed(2) + ' lb/sf (lining limit ' + d.tp + ')';
    if (L.culvert && i === L.culvert.tile) h += '<br>Creek: ' + L.culvert.Q[L.culvert.design] + ' cfs at the ' + L.culvert.design + '-yr storm; road edge El. ' + L.culvert.roadEl;
    if (i === L.pondSite && L.pre) h += '<br>Pond outfall · pre-development peak ' + S.preDev(L, L.detDesign || L.design).Q.toFixed(1) + ' cfs';
    if (L.util && L.util[i] && (G.round > 0 || G.utilShown)) h += '<br>⚠ Buried gas line: no pipes here';
    if (L.nobuild && L.nobuild[i]) h += '<br>⛔ Client no-build lot';
    var nd = r.net && r.net.nodes && r.net.nodes[i]; if (nd) h += '<br>Structure: ' + nd.kind + (nd.HGL != null ? ', HGL El. ' + nd.HGL.toFixed(2) + ' (rim ' + nd.rim.toFixed(2) + ')' : '');
    el.innerHTML = h; el.classList.remove('hidden'); clearTimeout(showTileInfo.t); showTileInfo.t = setTimeout(function () { el.classList.add('hidden'); }, brief ? 2200 : 6000);
  }
  function showElementInfo(i, tool) { var e = G.live.evals.filter(function (x) { return x.tile === i && (x.el === tool || (tool === 'pond' && x.el === 'detention')); }); e = e.filter(function (x) { return x.status !== 'ok'; })[0] || e[0]; if (e) toast((e.status === 'ok' ? '✓ ' : '✗ ') + e.reason.slice(0, 120)); }
  function showPipeInfo() { var bad = G.live.evals.filter(function (e) { return (e.el === 'pipe' || e.el === 'node') && e.status !== 'ok' && !e.warn; }); toast(bad.length ? '✗ ' + bad[0].status + ': ' + bad[0].reason.slice(0, 110) : '✓ Pipes OK so far'); }
  function toast(msg) { var el = $('toast'); el.textContent = msg; el.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(function () { el.classList.remove('show'); }, 2400); }
  function updateHud() {
    var L = G.L, r = G.live, budget = L.budgetCut && G.round > 0 ? L.budgetCut : L.budget, cost = r ? r.cost : 0, left = budget - cost;
    $('budgetLeft').textContent = L.sandbox ? cost.toLocaleString() : left.toLocaleString();
    document.querySelector('.chip.money').classList.toggle('low', left < 0 && !L.sandbox);
    $('undoBtn').disabled = G.phase !== 'plan' || !G.history.length; $('runBtn').disabled = G.phase !== 'plan' && !G.reviseMode;
    if (L.sandbox) saveSandbox();
  }
  function terrainChanged() { geo = buildGeometry(G.L, RQ); drawTerrain(); refresh(); }
  // ---------- toolbar + option bar ----------
  function buildToolbar() {
    var wrap = $('tools'); wrap.innerHTML = '';
    var list = TOOLS.filter(function (t) { return G.L.tools.indexOf(t.id) >= 0; }); if (G.L.sandbox) list = [list[0]].concat(SB_TOOLS, list.slice(1));
    list.forEach(function (t) { var b = document.createElement('button'); b.type = 'button'; b.className = 'tool'; b.dataset.tool = t.id; b.setAttribute('aria-label', t.label);
      var s = document.createElement('span'); s.textContent = t.icon || ''; b.appendChild(s); var l = document.createElement('small'); l.textContent = t.label; b.appendChild(l);
      b.addEventListener('click', function () { selectTool(t.id); }); wrap.appendChild(b); });
  }
  function optBtns(label, key, vals, fmt) { return '<span class="optlbl">' + label + '</span>' + vals.map(function (v) { return '<button type="button" class="opt' + (G.opt[key] === v ? ' sel' : '') + '" data-opt="' + key + '" data-v="' + v + '">' + (fmt ? fmt(v) : v) + '</button>'; }).join(''); }
  function buildOpts() {
    var t = G.tool, h = '';
    if (t === 'inlet') h = optBtns('Length', 'len', [5, 10, 15], function (v) { return v + ' ft'; });
    if (t === 'pipe') { h = optBtns('RCP', 'dia', S.PIPE_IN, function (v) { return v + '"'; }); if (G.L.suggests) h += '<button type="button" class="opt sug" data-opt="suggest">Suggest size (' + G.sugLeft + ' left)</button>'; }
    if (t === 'ditch') h = optBtns('Lining', 'lining', ['grass', 'mat', 'rock', 'conc'], function (v) { return LIN_NAMES[v]; });
    if (t === 'culvert') h = optBtns('Barrel', 'cdia', [36, 42, 48, 54, 60, 72], function (v) { return v + '"'; }) + optBtns('Barrels', 'cbar', [1, 2, 3]);
    if (t === 'outlet') h = optBtns('Orifice', 'orif', [6, 9, 12, 15, 18], function (v) { return v + '"'; }) + optBtns('Weir', 'weir', [2, 4, 6, 8], function (v) { return v + ' ft'; });
    $('opts').innerHTML = h;
  }
  $('opts').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return; var k = b.dataset.opt;
    if (k === 'suggest') { doSuggest(); return; }
    var v = b.dataset.v; G.opt[k] = isNaN(+v) ? v : +v; buildOpts(); G.ghostKey = null;
    var i = G.editTile; // only a piece the player picked (tapped again with the same tool) is edited; new pieces use the new option
    if (i >= 0 && G.tool !== 'pipe' && G.controls.some(function (c) { return c.type === G.tool && c.tile === i; })) { if (placeAt(i, true)) { refresh(); toast('Changed the ' + G.tool + ' at (' + (i % G.L.W) + ',' + ((i / G.L.W) | 0) + ') to ' + b.innerText); } }
    else toast('New ' + (findTool(G.tool) || {}).label + 's: ' + b.innerText);
  });
  function doSuggest() {
    if (G.sugLeft <= 0) { toast('No sizing suggestions left on this level'); snd('buzz'); return; }
    var ks = (G.lastChain || []).filter(function (k) { return G.controls[k] && G.controls[k].type === 'pipe'; }); if (!ks.length) { toast('Draw a pipe run first, then ask for a size'); return; }
    var cs = plain(), prev = G.controls.slice(); ks.forEach(function (k) { var d = S.suggest(G.L, cs, k); if (d) cs[k].dia = d; });
    G.history.push({ op: 'replace', prev: prev }); G.controls = cs.map(function (c, k) { return Object.assign({ round: prev[k].round }, c); }); G.sugLeft--; refresh(); buildOpts();
    toast('Sized your last pipe run: ' + ks.map(function (k) { return cs[k].dia + '"'; }).join(', ') + ' (smallest that is not overloaded)'); snd('pipe');
  }
  function selectTool(id) {
    G.tool = id; G.chainFrom = -1; G.editTile = -1; G.pendTile = -1; G.ghost = null; Array.prototype.forEach.call(document.querySelectorAll('.tool'), function (b) { b.classList.toggle('sel', b.dataset.tool === id); });
    if (id === 'pipe' && !G.ug) { setUG(true); G.autoUG = true; } else if (id !== 'pipe' && id !== 'inspect' && G.ug && G.autoUG) setUG(false);
    if (G.phase === 'plan') buildOpts();
    var t = findTool(id), card = $('infoCard');
    var head, body;
    if (t.help) { head = t.label; body = t.help + ' <small>(Undo works for terrain too.)</small>'; }
    else if (!t.rule) { head = id === 'inspect' ? 'Inspect: tap a tile' : 'Remove: tap a piece'; body = id === 'inspect' ? 'Tap a tile for its runoff, gutter spread, ditch shear or HGL. ⛏ shows pipes underground; ≋ shows flow arrows; 🏠 fades the houses by the streets.' : 'Tap a tile to remove the last element on it (full refund while planning).'; }
    else { head = t.label + ': ' + (t.rule.split('. ')[0].replace(/\.$/, '') + '.'); body = '<div>' + t.rule + '</div><div class="basis"><b>Basis:</b> ' + t.basis + '<br><span class="game">' + t.game + '</span></div>'; }
    card.innerHTML = '<button type="button" class="ichead" aria-expanded="' + !infoCollapsed() + '"><span class="ictitle">' + head + '</span><span class="ictog">' + (infoCollapsed() ? 'Details ▾' : 'Hide ▴') + '</span></button><div class="icbody">' + body + '</div>';
    card.classList.toggle('collapsed', infoCollapsed()); card.classList.remove('hidden');
  }
  function infoCollapsed() { if (settings.info === 'open') return false; if (settings.info === 'closed') return true; return !!(G.L && (G.L.sandbox || G.L.id > 1)); } // collapsed by default after level 1
  $('infoCard').addEventListener('click', function (e) { if (!e.target.closest('.ichead')) return; settings.info = infoCollapsed() ? 'open' : 'closed'; try { localStorage.setItem(SET_KEY, JSON.stringify(settings)); } catch (er) { /* ignore */ } selectTool(G.tool); });
  function setUG(on) { G.ug = !!on; G.autoUG = false; $('ugBtn').classList.toggle('on', G.ug); }

  // ---------- levels ----------
  function loadLevel(n, quiet) {
    setupLevel(S.makeLevel(n), n);
    $('lvlName').textContent = 'Level ' + n + ': ' + G.L.name; selectTool(G.L.tools[1] || 'inspect');
    if (!quiet) showBrief();
  }
  function setupLevel(L, n, controls) {
    G.hintLevel = 0; G.hintTiles = null; G.solGhost = null; G.ghost = null; G.paused = false; G.utilShown = false; G.cutShown = false; G.lastChain = []; G.focus = null;
    if (window.FlowSound) FlowSound.rain(0);
    G.level = n; G.L = L; RQ = baseRQ; geo = buildGeometry(G.L, RQ);
    G.editTile = -1; G.controls = (controls || S.presetControls(L)).map(function (c) { return Object.assign({ round: 0 }, c); }); G.history = []; G.born = {}; G.phase = 'plan'; G.scoreRes = null; G.showRes = null; G.selTile = -1; G.hoverTile = -1; G.round = 0; G.sugLeft = L.suggests || 0;
    drawTerrain(); resize(); fitView(); scheduleLOD(); setUG(false);
    $('lvlGoal').textContent = L.goal || ''; $('forecastLabel').textContent = L.design + '-yr';
    $('stormHud').classList.add('hidden'); $('banner').classList.add('hidden'); $('chart').classList.add('hidden');
    G.tool = 'inspect'; buildToolbar(); refresh(); G.reviseMode = false; $('runBtn').textContent = '🌧 Run Storm';
  }
  function showBrief() {
    var L = G.L, i = S.intensity(L.design, 10);
    openPanel('<h2>' + L.name + '</h2><div class="forecast"><div class="big">⛈</div><div><b>Design storm: ' + L.design + '-yr</b> · ' + i.toFixed(2) + ' in/hr at 10 min (Harris Co., TxDOT EBDLKUP-2019)' +
      (L.culvert && L.culvert.design !== L.design ? '<br>Culvert: ' + L.culvert.design + '-yr' : '') + (L.detDesign && L.detDesign !== L.design ? '<br>Detention: ' + L.detDesign + '-yr' : '') + (L.check ? '<br>Check: ' + L.check + '-yr (1% AEP)' : '') + '</div></div>' +
      '<p><b>Your job:</b> ' + (L.goal || '') + '</p>' + (L.lesson ? '<p class="lesson"><b>Lesson:</b> ' + L.lesson + '</p>' : '') +
      '<p>Budget: <b>$' + L.budget.toLocaleString() + '</b> · Spread limit ' + L.Tallow + ' ft' + (hasNoBuild() ? '<br>⛔ <b>Client surprise:</b> the red-hatched lots are now no-build.' : '') + '</p>' +
      '<div class="btns"><button type="button" class="primary" data-act="close">Start designing</button></div>');
    if (hasNoBuild()) snd('alarm');
  }
  function showLevels() {
    var html = '<h2>Storm Designer</h2><p>You are the drainage engineer. Design inlets, storm sewers, ditches, culverts and detention for Houston storms, then run the storm. All levels are open.</p>', rec = 0, n;
    for (n = 1; n <= S.LEVEL_COUNT; n++) if (!rec && !(progress.stars[n] >= 1)) rec = n;
    for (n = 1; n <= S.LEVEL_COUNT; n++) { var L = S.makeLevel(n), s = progress.stars[n] || 0, st = ''; for (var k = 1; k <= 3; k++) st += k <= s ? '★' : '☆';
      html += '<button type="button" class="lvl" data-act="lvl' + n + '"><b>' + n + '. ' + L.name + (n === rec ? ' <span class="tag rec">next</span>' : '') + ((progress.sol || {})[n] ? ' <span class="tag">solution used</span>' : '') + '</b><span>' + st + '</span></button>'; }
    html += '<button type="button" class="lvl" data-act="sandbox"><b>🧪 Sandbox</b><span>build your own site</span></button>';
    html += '<div class="btns">' + (G.L ? '<button type="button" data-act="close">Back</button>' : '') + '<button type="button" data-act="settings">⚙ Settings</button><button type="button" data-act="reset">Reset progress</button></div>';
    openPanel(html);
  }
  // ---------- sandbox ----------
  function saveSandbox() { try { localStorage.setItem(SB_KEY, JSON.stringify(S.sandboxData(G.L, plain()))); } catch (e) { /* private mode */ } }
  function loadSandbox(fresh) {
    var d = null; if (!fresh) try { d = JSON.parse(localStorage.getItem(SB_KEY) || 'null'); } catch (e) { d = null; }
    var L = S.makeSandbox(d), N = L.W * L.H;
    var ctl = (d && Array.isArray(d.controls) ? d.controls : []).filter(function (c) { return c && /^(inlet|pipe|ditch|culvert|pond|outlet)$/.test(c.type) && (c.type === 'pipe' ? c.a >= 0 && c.a < N && c.b >= 0 && c.b < N : c.tile >= 0 && c.tile < N); });
    setupLevel(L, 0, ctl); $('lvlName').textContent = 'Sandbox'; selectTool('inspect'); if (!fresh) showStormPicker();
  }
  function showStormPicker() {
    var L = G.L, h = '<h2>Sandbox storm</h2><p>Pick the storm for Run Storm (Harris County IDF, TxDOT EBDLKUP-2019).</p>';
    [2, 5, 10, 25, 100].forEach(function (y) { h += '<button type="button" class="lvl' + (y === L.design ? ' sel' : '') + '" data-act="storm:' + y + '"><b>' + y + '-yr storm</b><span>' + S.intensity(y, 10).toFixed(2) + ' in/hr at 10 min</span></button>'; });
    h += '<p><small>Shape the site with ⬆ ⬇ and the paint tools, place anything, then 🌧 Run Storm. Saved on this device.</small></p><div class="btns"><button type="button" data-act="sbreset">Reset site</button><button type="button" data-act="levels">Levels</button><button type="button" class="primary" data-act="close">Build</button></div>';
    openPanel(h);
  }
  // ---------- hints & solutions ----------
  function showHint() {
    if (G.L.sandbox) { toast('No hints in the sandbox'); return; }
    var hs = G.L.hints || [], k = G.hintLevel || 0; G.hintTiles = G.L.hintTiles || null;
    if (k < hs.length) { G.hintLevel = k + 1; openPanel('<h2>Hint ' + (k + 1) + ' of ' + hs.length + '</h2><p>' + hs[k] + '</p>' + (G.hintTiles ? '<p><small>Key tiles blink yellow on the map.</small></p>' : '') + '<div class="btns"><button type="button" class="primary" data-act="close">Got it</button>' + (k + 1 >= hs.length ? '<button type="button" data-act="solask">Show solution</button>' : '') + '</div>'); }
    else askSolution();
  }
  function askSolution() { openPanel('<h2>Show solution?</h2><p>This reveals a 3-star plan as numbered blue ghosts, with why each piece is there and its basis. The level gets a small “solution used” tag.</p><div class="btns"><button type="button" data-act="close">Not yet</button><button type="button" class="primary" data-act="solshow">Reveal</button></div>'); }
  function solControls() { return SOLS.build(G.L, SOLS.solutionPlan(G.L.id)); }
  function showSolution() {
    var n = G.L.id, sol = SOLS.SOL[n]; if (!sol) return; progress.sol = progress.sol || {}; progress.sol[n] = true; saveProgress();
    if (G.phase !== 'plan') backToPlan();
    G.solGhost = solControls(); G.solNum = []; var idx = 0; sol.steps.forEach(function (st, s) { var cs = SOLS.build(G.L, st.place); for (var k = 0; k < cs.length; k++) { G.solNum[idx] = k === 0 ? s + 1 : 0; idx++; } });
    var r = S.score(G.L, S.presetControls(G.L).concat(G.solGhost), { round: G.round });
    openPanel('<h2>Solution — ' + G.L.name + '</h2><ol class="sollist">' + sol.steps.map(function (st) { return '<li>' + st.why + '<br><small>Basis: ' + st.basis + '</small></li>'; }).join('') + '</ol><p>This plan: score ' + r.score + ', ' + r.stars + '★, $' + r.cost.toLocaleString() + ' of $' + r.budget.toLocaleString() + '. Shown as numbered blue ghosts.</p>' +
      '<div class="btns"><button type="button" data-act="solmap">Show on map</button><button type="button" class="primary" data-act="soltry">Use it</button></div>');
  }
  function trySolution() {
    var cs = S.presetControls(G.L).concat(solControls()), now = performance.now(); G.history.push({ op: 'replace', prev: G.controls.slice() });
    G.controls = cs.map(function (c) { return Object.assign({ round: G.round }, c); }); G.born = {}; G.controls.forEach(function (c, k) { G.born[k] = now + k * 40; });
    G.solGhost = null; snd('thunk'); refresh(); toast('Solution placed. Press 🌧 Run Storm (Undo restores your plan).');
  }
  // ---------- settings ----------
  var settings = (function () { try { return JSON.parse(localStorage.getItem(SET_KEY)) || {}; } catch (e) { return {}; } })();
  if (settings.volume == null) settings.volume = 0.6;
  function defaultQuality() { var coarse = window.matchMedia && matchMedia('(pointer: coarse)').matches, mem = navigator.deviceMemory; return coarse || (mem && mem <= 4) ? 'medium' : 'high'; }
  if (!QUAL[settings.quality]) settings.quality = defaultQuality();
  function saveSettings() { try { localStorage.setItem(SET_KEY, JSON.stringify(settings)); } catch (e) { /* ignore */ } applySettings(); }
  function applySettings() { if (window.FlowSound && FlowSound.setVolume) FlowSound.setVolume(settings.volume); G.reduced = !!settings.reduced; baseRQ = QUAL[settings.quality] || 1; if (G.L) setRenderQuality(wantQ()); else RQ = baseRQ; }
  function showSettings() {
    var m = window.FlowSound && FlowSound.isMuted();
    openPanel('<h2>Settings</h2><label class="setrow"><input type="checkbox" id="setSound"' + (m ? '' : ' checked') + '> Sound</label>' +
      '<label class="setrow">Volume <input type="range" id="setVol" min="0" max="1" step="0.05" value="' + settings.volume + '"></label>' +
      '<label class="setrow">Quality <select id="setQuality">' + ['low', 'medium', 'high'].map(function (k) { return '<option value="' + k + '"' + (settings.quality === k ? ' selected' : '') + '>' + k[0].toUpperCase() + k.slice(1) + ' (' + 64 * QUAL[k] + '×' + 32 * QUAL[k] + ' tiles)</option>'; }).join('') + '</select></label>' +
      '<label class="setrow"><input type="checkbox" id="setLod"' + (settings.lod !== false ? ' checked' : '') + '> Sharper tiles when zoomed in</label>' +
      '<label class="setrow"><input type="checkbox" id="setReduced"' + (settings.reduced ? ' checked' : '') + '> Reduced motion</label>' +
      '<p><small>Keys: 1–9 tools · Z undo · R run storm · U underground · F flow view · H hint · Space pause · +/− zoom · arrows pan · M mute · Esc close. Drag with Pipe, Ditch or Pond to draw (touch: hold, then drag). Shift-drag pans.</small></p>' +
      '<div class="btns"><button type="button" class="primary" data-act="levels">Done</button></div>');
    $('setSound').addEventListener('change', function () { FlowSound.setMuted(!this.checked); syncMute(); });
    $('setVol').addEventListener('input', function () { settings.volume = +this.value; saveSettings(); });
    $('setReduced').addEventListener('change', function () { settings.reduced = this.checked; saveSettings(); });
    $('setQuality').addEventListener('change', function () { settings.quality = this.value; saveSettings(); toast('Quality: ' + this.value); });
    $('setLod').addEventListener('change', function () { settings.lod = this.checked; saveSettings(); });
  }
  // ---------- overlay ----------
  function openPanel(html) { $('panel').innerHTML = html; $('overlay').classList.remove('hidden'); $('panel').scrollTop = 0; }
  function closePanel() { $('overlay').classList.add('hidden'); }
  function centerOn(i) { var c = tileCenter(i); G.panX = -(c.x - geo.w / 2) * G.zoom; G.panY = -(c.y - geo.h / 2) * G.zoom; clampPan(); G.focus = { tile: i, until: performance.now() + 3500 }; }
  $('panel').addEventListener('click', function (e) {
    var f = e.target.closest('.ev'); if (f && +f.dataset.tile >= 0) { closePanel(); centerOn(+f.dataset.tile); showReviseBar(); return; }
    var b = e.target.closest('button'); if (!b || b.disabled) return; var a = b.dataset.act;
    if (a === 'close') closePanel();
    else if (a && a.indexOf('lvl') === 0) { closePanel(); loadLevel(+a.slice(3)); }
    else if (a === 'retry') { closePanel(); backToPlan(); }
    else if (a === 'view') { closePanel(); toast('Failed elements have red flags. Press ✎ Revise when ready.'); showReviseBar(); }
    else if (a === 'next') { closePanel(); if (G.L.id < S.LEVEL_COUNT) loadLevel(G.L.id + 1); else showLevels(); }
    else if (a === 'levels') showLevels();
    else if (a === 'settings') showSettings();
    else if (a === 'solask') askSolution();
    else if (a === 'solshow') showSolution();
    else if (a === 'solmap') { closePanel(); toast('Blue ghosts = the 3-star plan; numbers match the steps.'); }
    else if (a === 'soltry') { closePanel(); trySolution(); }
    else if (a === 'replay') { closePanel(); replayStorm(); }
    else if (a === 'sbstorm') { backToPlan(); showStormPicker(); }
    else if (a === 'sandbox') { closePanel(); loadSandbox(false); }
    else if (a === 'sbreset') { if (confirm('Reset the sandbox site and everything built on it?')) { closePanel(); loadSandbox(true); saveSandbox(); } }
    else if (a && a.indexOf('storm:') === 0) { G.L.design = +a.slice(6); if (G.L.culvert) G.L.culvert.design = G.L.design; $('forecastLabel').textContent = G.L.design + '-yr'; refresh(); showStormPicker(); }
    else if (a === 'reset') { progress = { stars: {} }; saveProgress(); showLevels(); }
  });
  function showReviseBar() { $('runBtn').disabled = false; $('runBtn').textContent = '✎ Revise plan'; G.reviseMode = true; }
  function snd(n) { if (window.FlowSound) FlowSound.play(n); }
  $('runBtn').addEventListener('click', function () { if (G.reviseMode) { G.reviseMode = false; $('runBtn').textContent = '🌧 Run Storm'; backToPlan(); return; } runStorm(); });
  $('undoBtn').addEventListener('click', undo);
  document.addEventListener('keydown', function (e) {
    if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    var k = e.key, open = !$('overlay').classList.contains('hidden');
    if ((e.ctrlKey || e.metaKey) && (k === 'z' || k === 'Z')) { e.preventDefault(); undo(); return; }
    if (k === 'Escape') { if (open) closePanel(); G.solGhost = null; G.hintTiles = null; G.chainFrom = -1; return; }
    if (open || e.metaKey || e.altKey || e.ctrlKey) return;
    if (/^[1-9]$/.test(k)) { var b = document.querySelectorAll('.tool')[+k - 1]; if (b) { b.click(); b.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } }
    else if (k === 'z' || k === 'Z') { undo(); e.preventDefault(); }
    else if (k === 'r' || k === 'R') $('runBtn').click();
    else if (k === 'u' || k === 'U') $('ugBtn').click();
    else if (k === 'x' || k === 'X') $('houseBtn').click();
    else if (k === 'm' || k === 'M') $('muteBtn').click();
    else if (k === ' ') { if (G.phase === 'storm') { G.paused = !G.paused; $('speedBtn').textContent = G.paused ? '❚❚' : G.speed + '×'; } e.preventDefault(); }
    else if (k === '+' || k === '=') setZoom(G.zoom * 1.25);
    else if (k === '-' || k === '_') setZoom(G.zoom / 1.25);
    else if (k === 'f' || k === 'F') $('flowView').click();
    else if (k === 'h' || k === 'H') $('hintBtn').click();
    else if (k.indexOf('Arrow') === 0) { var st = 60; if (k === 'ArrowLeft') G.panX += st; if (k === 'ArrowRight') G.panX -= st; if (k === 'ArrowUp') G.panY += st; if (k === 'ArrowDown') G.panY -= st; clampPan(); e.preventDefault(); }
  });
  applySettings();
  $('hintBtn').addEventListener('click', function () { if (G.solGhost) showSolution(); else showHint(); });
  document.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('button') && !e.target.closest('#runBtn')) snd('click'); });
  function syncMute() { var m = window.FlowSound && FlowSound.isMuted(), b = $('muteBtn'); b.textContent = m ? '🔇' : '🔊'; b.setAttribute('aria-pressed', m ? 'true' : 'false'); b.setAttribute('aria-label', m ? 'Sound off' : 'Sound on'); }
  $('muteBtn').addEventListener('click', function () { if (!window.FlowSound) return; FlowSound.setMuted(!FlowSound.isMuted()); syncMute(); });
  syncMute();
  $('zoomIn').addEventListener('click', function () { setZoom(G.zoom * 1.25); });
  $('zoomOut').addEventListener('click', function () { setZoom(G.zoom / 1.25); });
  function setHouses(m) { G.houses = m; settings.houses = m; try { localStorage.setItem(SET_KEY, JSON.stringify(settings)); } catch (e) { /* ignore */ } $('houseBtn').classList.toggle('on', m !== 'show'); $('houseBtn').setAttribute('aria-pressed', m !== 'show' ? 'true' : 'false'); }
  $('houseBtn').addEventListener('click', function () { setHouses(G.houses === 'show' ? 'auto' : 'show'); toast(G.houses === 'show' ? 'Houses: always shown' : 'Houses by the streets fade during the storm and with the inlet/pipe tools'); });
  setHouses(settings.houses === 'show' ? 'show' : 'auto');
  $('ugBtn').addEventListener('click', function () { setUG(!G.ug); toast(G.ug ? 'Underground: pipes, structures, HGL (dashed)' : 'Surface view'); });
  $('flowView').addEventListener('click', function () { G.flowView = !G.flowView; this.classList.toggle('on', G.flowView); if (G.flowView) toast('Flow arrows: orange > 3 cfs, red > 10 cfs'); });
  $('speedBtn').addEventListener('click', function () { G.speed = G.speed === 1 ? 2 : G.speed === 2 ? 4 : 1; G.paused = false; this.textContent = G.speed + '×'; });
  $('skipBtn').addEventListener('click', function () { window.__flowSkip(); });
  $('btnLevels').addEventListener('click', showLevels);
  $('forecastChip').addEventListener('click', function () { if (G.phase === 'plan') { if (G.L.sandbox) showStormPicker(); else showBrief(); } });
  window.addEventListener('resize', function () { resize(); scheduleLOD(); });
  window.addEventListener('orientationchange', function () { setTimeout(function () { resize(); scheduleLOD(); }, 150); });
  if (window.visualViewport) visualViewport.addEventListener('resize', function () { resize(); });
  (function watchDpr() { if (!window.matchMedia) return; var mq = matchMedia('(resolution: ' + (window.devicePixelRatio || 1) + 'dppx)'); var h = function () { resize(); scheduleLOD(); watchDpr(); }; if (mq.addEventListener) mq.addEventListener('change', h, { once: true }); })();
  // ---------- boot ----------
  resize();
  var h0 = location.hash.slice(1);
  if (h0 === 'sandbox') loadSandbox(false); else loadLevel(Math.min(S.LEVEL_COUNT, Math.max(1, +h0 || 1)), !h0);
  if (!h0) showLevels();
  requestAnimationFrame(frame);
  window.__flow = G;
})();
