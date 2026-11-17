/* Crossing view in the Storm Designer isometric style (culvert/iso-art.js).
   x runs along the barrel, y along the road. The crest is centered on the barrel
   and both faces step down to a continuous channel. */
(function () {
  const cardId = 'isocard';
  const FT = 8;
  const SKY = '#8fc0dc';
  let canvas, ctx, terrain, tctx, built = false, failed = false, latest = null;
  let zoom = 0, rot = 0, panX = 0, panY = 0, focus = null, showLines = true, ug = false, presetName = 'rot0';
  let model = null, drag = null, raf = 0;

  function el(html) { const d = document.createElement('div'); d.innerHTML = html; return d.firstElementChild; }
  function card(anchor) {
    let host = document.getElementById(cardId);
    if (host) return host;
    host = el(`<div class="card" id="${cardId}"><h3>Crossing <small>(Storm Designer tiles)</small></h3>
      <div id="v3bar">
        <button type="button" data-v3="rot0">North</button>
        <button type="button" data-v3="rot1">East</button>
        <button type="button" data-v3="rot2">South</button>
        <button type="button" data-v3="rot3">West</button>
        <button type="button" data-v3="z1">1×</button>
        <button type="button" data-v3="z2">2×</button>
        <button type="button" data-v3="z3">3×</button>
        <button type="button" data-v3="ug" title="Underground: barrel and HGL">⛏</button>
        <button type="button" data-v3="reset">Reset</button>
        <label><input id="v3lines" type="checkbox" checked> HGL / EGL</label>
      </div>
      <div id="v3wrap"><div id="v3fallback">Loading crossing…</div><svg id="v3leaders"></svg><div id="v3labels"></div><div id="v3note" hidden></div></div></div>`);
    anchor.after(host);
    host.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b || !b.dataset.v3) return;
      const k = b.dataset.v3;
      if (k === 'reset') { zoom = 0; rot = 0; panX = panY = 0; focus = null; ug = false; presetName = 'rot0'; showLines = true; const c = document.getElementById('v3lines'); if (c) c.checked = true; if (latest) rebuild(latest); }
      else if (k === 'ug') { ug = !ug; b.classList.toggle('on', ug); }
      else if (k[0] === 'z') { zoom = +k.slice(1); markZoom(); }
      else if (k.slice(0, 3) === 'rot') { rot = +k.slice(3); focus = null; panX = panY = 0; presetName = k; markRot(); if (latest) rebuild(latest); }
    });
    host.addEventListener('input', e => { if (e.target.id === 'v3lines') showLines = e.target.checked; });
    return host;
  }
  function markRot() { document.querySelectorAll('#v3bar button').forEach(b => b.classList.toggle('on', b.dataset.v3 === ('rot' + rot) || (b.dataset.v3 === 'ug' && ug))); }
  function markZoom() { document.querySelectorAll('#v3bar [data-v3^="z"]').forEach(b => b.classList.toggle('on', b.dataset.v3 === 'z' + zoom)); }
  function showFallback(msg) { failed = true; const w = document.getElementById('v3wrap'); if (!w) return; w.innerHTML = `<div id="v3fallback">The crossing view could not be drawn. The profile above is still drawn to the computed elevations. ${msg ? '(' + msg + ')' : ''}</div>`; }
  function endKind(p) { const id = (p.inlet && p.inlet.id) || '', name = (p.inlet && p.inlet.name) || ''; if (/mit/.test(id) || /miter/i.test(name)) return 'miter'; if (/_pr|project/i.test(id) || /project/i.test(name)) return 'project'; return 'headwall'; }
  function metalOf(p) { return p.material === 'cmp' || p.material === 'spiral'; }
  function barrelsOf(data) {
    const p = data.p, r = data.r;
    if (r.crossing && r.crossing.parts && r.crossing.parts.length) {
      const extras = (typeof state !== 'undefined' && state.extras) || [];
      return r.crossing.parts.map((pt, i) => {
        const ex = i === 0 ? null : extras[i - 1];
        const shape = i === 0 ? p.shape : (ex && ex.shape) || p.shape;
        const rr = pt.r || r;
        return { shape, B: rr.B || p.span, D: rr.D || p.rise, circ: shape === 'circular' || (shape !== 'box' && shape !== 'sdbox') };
      });
    }
    const N = Math.max(1, r.N || 1);
    const circ = p.shape === 'circular' || (p.shape !== 'box' && p.shape !== 'sdbox');
    return Array.from({ length: N }, () => ({ shape: p.shape, B: r.B, D: r.D, circ }));
  }
  function rebuild(data) {
    if (!window.CulvertIso || !window.CrossingFrame) { showFallback('art'); return; }
    const p = data.p, r = data.r, ro = data.ro, L = Math.max(p.length, 1);
    const bars = barrelsOf(data).filter(b => b.D > 0);
    if (!bars.length) return;
    const rise = Math.max.apply(null, bars.map(b => b.D));
    let crest = Math.max(p.invIn, p.invOut) + rise * 1.8 + 2;
    if (ro && window.Culvert && Culvert.crestMin) crest = Culvert.crestMin(ro);
    const bedIn = p.invIn, bedOut = p.invOut;
    let fp = Math.min(crest - 3.5, Math.max(bedIn, bedOut) + Math.max(rise + 2, 6));
    if (!(fp > Math.max(bedIn, bedOut) + 1)) fp = Math.max(bedIn, bedOut) + 1.5;
    if (!(crest > fp + 2)) fp = crest - 2.5;
    let roadLen = 120;
    try { const cl = +document.getElementById('crestLen').value; if (cl > 48) roadLen = cl; } catch (e) {}
    roadLen = Math.max(80, Math.min(roadLen, Math.max(96, Math.min(160, L * 1.1))));
    let pave = 28;
    if (ro && ro.Lr > 12) pave = Math.max(16, Math.min(40, ro.Lr));
    let fillZ = 4;
    try { const z = +document.getElementById('fillZ').value; if (z >= 2 && z <= 6) fillZ = z; } catch (e) {}
    const lay = CrossingFrame.crossingLayout({
      L, crest, fp, bedIn, bedOut, crestLen: roadLen, paveW: pave,
      halfBot: Math.max(18, rise * 2.2), halfBank: Math.max(28, rise * 3),
      sideRun: Math.max(12, (crest - fp) * fillZ)
    });
    const approach = 28;
    const xIn = Math.max(2, Math.round(approach / FT));
    const xLen = Math.max(6, Math.round(L / FT));
    const xOut = xIn + xLen;
    const nX = xOut + xIn;
    const nY = Math.max(10, Math.round(roadLen / FT));
    const yMid = (nY - 1) / 2;
    const yHalf = Math.max(1, Math.round(lay.halfBot / FT));
    const crestTiles = Math.max(1, Math.min(xLen - 4, Math.round(pave / FT)));
    const xC0 = xIn + Math.floor((xLen - crestTiles) / 2);
    const xC1 = xC0 + crestTiles;
    const zs = 4;
    const bed = Math.min(bedIn, bedOut);
    const types = new Array(nX * nY), elev = new Array(nX * nY);
    for (let y = 0; y < nY; y++) for (let x = 0; x < nX; x++) {
      const s = (x - xIn + 0.5) * (L / xLen);
      const t = (y - yMid) * FT;
      const z = CrossingFrame.groundAt(lay, s, t);
      const ch = Math.abs(y - yMid) <= yHalf + 0.2 && (s < 1 || s > L - 1);
      types[y * nX + x] = ch ? 'C' : (x >= xC0 && x < xC1 ? 'R' : (hash(x, y) > 0.82 && s > 2 && s < L - 2 ? 'T' : 'G'));
      elev[y * nX + x] = ch ? (s < 1 ? Math.min(r.EL, fp - 0.4) : Math.min(p.twMode === 'const' ? Math.max(p.twElev, bedOut + 0.2) : bedOut + 0.5, fp - 0.4)) : z;
    }
    const ck = CrossingFrame.layoutCheck(lay);
    model = { p, r, lay, bars, types, elev, nX, nY, xIn, xOut, xC0, xC1, yMid, yHalf, zs, bed, L, xLen, ck, fillZ, metal: metalOf(p), kind: endKind(p),
      hw: r.EL, tw: p.twMode === 'const' ? Math.max(p.twElev, bedOut + 0.15) : bedOut + 0.6,
      apron: Math.max(1, Math.min(3, Math.round((rise * 2) / FT))) };
    focus = null; panX = panY = 0; zoom = 0;
    const note = document.getElementById('v3note');
    if (note) { note.hidden = false; note.textContent = (model.kind === 'headwall' ? 'Headwall and wingwalls' : model.kind) + ' · ' + (model.metal ? 'corrugated metal' : 'concrete') + ' · road across the barrel' + (ck.ok ? ' · crest centered' : '') + ' · ' + fillZ + ':1'; }
    built = true;
  }
  function hash(x, y) { let n = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263); n = (n ^ (n >>> 13)) >>> 0; return n / 4294967296; }
  function orient(x, y) {
    const W = model.nX, H = model.nY;
    if (rot === 1) return { x: y, y: W - 1 - x, W: H, H: W, axis: 'v' };
    if (rot === 2) return { x: W - 1 - x, y: H - 1 - y, W, H, axis: 'u' };
    if (rot === 3) return { x: H - 1 - y, y: x, W: H, H: W, axis: 'v' };
    return { x, y, W, H, axis: 'u' };
  }
  function sceneGeom() {
    const M = model, A = CulvertIso, z = new Array(M.nX * M.nY), types = new Array(M.nX * M.nY);
    let maxZ = 0;
    for (let y = 0; y < M.nY; y++) for (let x = 0; x < M.nX; x++) {
      const o = orient(x, y);
      const i = o.y * o.W + o.x;
      const zp = Math.round((M.elev[y * M.nX + x] - M.bed) * M.zs);
      z[i] = zp; types[i] = M.types[y * M.nX + x];
      if (zp > maxZ) maxZ = zp;
    }
    const W = rot % 2 ? M.nY : M.nX, H = rot % 2 ? M.nX : M.nY;
    const w = (W + H) * A.TW / 2 + 24, h = (W + H) * A.TH / 2 + maxZ + A.BASE + 48;
    return { W, H, types, z, w, h, ox: H * A.TW / 2 + 12, oy: maxZ + 28, maxZ, axis: rot % 2 ? 'v' : 'u' };
  }
  function tileTop(g, x, y) { const i = y * g.W + x; return { x: g.ox + (x - y) * CulvertIso.TW / 2, y: g.oy + (x + y) * CulvertIso.TH / 2 - g.z[i] }; }
  function paint(gctx, gw, gh) {
    const A = CulvertIso, g = sceneGeom();
    if (terrain.width !== g.w || terrain.height !== g.h) { terrain.width = g.w; terrain.height = g.h; }
    tctx.setTransform(1, 0, 0, 1, 0, 0);
    A.drawTerrain(tctx, { W: g.W, H: g.H, types: g.types, z: g.z, ox: g.ox, oy: g.oy, w: g.w, h: g.h, TW: A.TW, TH: A.TH, BASE: A.BASE });
    gctx.setTransform(1, 0, 0, 1, 0, 0);
    gctx.fillStyle = SKY; gctx.fillRect(0, 0, gw, gh);
    gctx.drawImage(terrain, 0, 0);
    const M = model, t = performance.now();
    for (let y = 0; y < M.nY; y++) for (let x = 0; x < M.nX; x++) {
      if (M.types[y * M.nX + x] !== 'C') continue;
      const o = orient(x, y), p = tileTop(g, o.x, o.y);
      A.drawCreekWater(gctx, p, 1.5, t, x + y * 3);
      if (x >= M.xOut && x < M.xOut + M.apron) A.drawRiprap(gctx, p);
    }
    const shape = M.bars[0].circ ? 'round' : 'box';
    const dia = Math.round(M.bars[0].D * 12);
    function wall(x, y, side) {
      const o = orient(x, y);
      const creekX = side === 'far' ? x - 1 : x + 1;
      if (creekX < 0 || creekX >= M.nX) return;
      const zo = orient(creekX, y);
      const drop = Math.max(10, g.z[o.y * g.W + o.x] - g.z[zo.y * g.W + zo.x]);
      A.drawHeadwall(gctx, tileTop(g, o.x, o.y), { axis: g.axis, side: rot % 2 ? (side === 'far' ? 'near' : 'far') : side, drop, dia, barrels: M.bars.length, shape, metal: M.metal, zs: M.zs, flow: side === 'near' ? 0.8 : 0, t });
    }
    for (let k = -M.yHalf; k <= M.yHalf; k++) {
      const y = Math.round(M.yMid + k);
      if (y < 0 || y >= M.nY) continue;
      if (k === 0) { wall(M.xIn, y, 'far'); wall(M.xOut - 1, y, 'near'); }
    }
    for (let y = 0; y < M.nY; y++) for (let x = 0; x < M.nX; x++) {
      const tp = M.types[y * M.nX + x];
      const o = orient(x, y), p = tileTop(g, o.x, o.y);
      if (tp === 'T' && hash(x, y) > 0.55) A.drawTree(gctx, p.x + 8, p.y + A.TH / 2, x * 5 + y, t);
      if (tp === 'R' && Math.abs(y - M.yMid) < 0.6 && (x === M.xC0 || x === M.xC1 - 1)) {
        const c = CulvertIso.at(p, 0.5, ((t / 900) + (x === M.xC0 ? 0.15 : 0.7)) % 1);
        A.drawCar(gctx, c.x, c.y, x === M.xC0 ? 1 : -1, x);
      }
    }
    if (ug) drawUnderground(gctx, g, t);
    else if (showLines && M.r.hgl) drawHGL(gctx, g);
    return g;
  }
  function drawHGL(ctx, g) {
    const M = model, inv = s => M.p.invIn + (M.p.invOut - M.p.invIn) * (s / M.L);
    ctx.strokeStyle = '#7dffb0'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]); ctx.beginPath();
    let pen = false;
    (M.r.hgl || []).forEach(q => {
      if (!isFinite(q[1])) { pen = false; return; }
      const s = q[0], z = inv(s) + q[1];
      const x = M.xIn + (s / M.L) * (M.xLen - 1);
      const o = orient(Math.max(0, Math.min(M.nX - 1, x)), M.yMid);
      const p = tileTop(g, o.x, o.y);
      const y = p.y + CulvertIso.TH / 2 - (z - M.bed) * M.zs;
      if (!pen) { ctx.moveTo(p.x, y); pen = true; } else ctx.lineTo(p.x, y);
    });
    ctx.stroke(); ctx.setLineDash([]);
  }
  function drawUnderground(ctx, g, t) {
    ctx.save(); ctx.globalCompositeOperation = 'source-atop'; ctx.fillStyle = 'rgba(40,28,18,.45)'; ctx.fillRect(0, 0, g.w, g.h); ctx.restore();
    const M = model, pts = [];
    for (let x = M.xIn; x < M.xOut; x++) {
      const o = orient(x, M.yMid), p = tileTop(g, o.x, o.y);
      pts.push({ x: p.x, y: p.y + CulvertIso.TH / 2 + 8 });
    }
    if (pts.length > 1) {
      const w = Math.max(3, Math.round(M.bars[0].D * M.zs * 0.7));
      ctx.lineCap = 'round'; ctx.strokeStyle = M.metal ? '#b7c0c8' : '#c8c8c0'; ctx.lineWidth = w + 3;
      ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); pts.forEach(q => ctx.lineTo(q.x, q.y)); ctx.stroke();
      ctx.strokeStyle = '#14181d'; ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); pts.forEach(q => ctx.lineTo(q.x, q.y)); ctx.stroke();
      for (let k = 0; k < 3; k++) { const ph = (t / 500 + k / 3) % 1, i = Math.min(pts.length - 1, Math.floor(ph * (pts.length - 1))); ctx.fillStyle = '#e0f4ff'; ctx.fillRect(pts[i].x - 1, pts[i].y - 1, 2, 2); }
    }
    if (showLines) drawHGL(ctx, g);
  }
  function boxOf(g) { return { w: g.w, h: g.h }; }
  let lastG = null;
  function renderAt(iw, ih) {
    const g = sceneGeom();
    lastG = g;
    const z = zoom || 1;
    const dw = g.w * z, dh = g.h * z;
    const ox = iw / 2 - dw / 2 + panX;
    const oy = ih / 2 - dh / 2 + panY;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = SKY; ctx.fillRect(0, 0, iw, ih);
    ctx.imageSmoothingEnabled = z !== 1;
    ctx.drawImage(paintBuffer(g), ox, oy, dw, dh);
    return { x: ox, y: oy, z, g };
  }
  let buf = null, bctx = null;
  function paintBuffer(g) {
    if (!buf) buf = document.createElement('canvas');
    if (buf.width !== g.w || buf.height !== g.h) { buf.width = g.w; buf.height = g.h; }
    if (!bctx) bctx = buf.getContext('2d');
    paint(bctx, g.w, g.h);
    return buf;
  }
  function chooseZoom() {
    if (zoom) return;
    const wrap = document.getElementById('v3wrap');
    const g = sceneGeom();
    const W = wrap.clientWidth || 800, H = wrap.clientHeight || 420;
    let z = 1;
    while (z < 3 && g.w * (z + 1) <= W - 8 && g.h * (z + 1) <= H - 8) z++;
    zoom = z; markZoom();
  }
  function resize() {
    const wrap = document.getElementById('v3wrap'); if (!wrap || !canvas) return;
    const z = zoom || 1;
    const iw = Math.max(160, Math.floor((wrap.clientWidth || 640)));
    const ih = Math.max(120, Math.floor((wrap.clientHeight || 360)));
    if (canvas.width !== iw || canvas.height !== ih) { canvas.width = iw; canvas.height = ih; }
    canvas.style.width = iw + 'px'; canvas.style.height = ih + 'px';
    void z;
  }
  function frame() {
    if (!model || !ctx) return;
    if (!zoom) chooseZoom();
    resize();
    const origin = renderAt(canvas.width, canvas.height);
    placeLabels(origin);
    markRot();
  }
  function boot() {
    if (canvas || failed) return;
    const wrap = document.getElementById('v3wrap'); if (!wrap) return;
    canvas = document.createElement('canvas');
    ctx = canvas.getContext('2d', { alpha: false });
    terrain = document.createElement('canvas');
    tctx = terrain.getContext('2d', { willReadFrequently: true });
    if (!ctx || !tctx) { showFallback('no canvas'); return; }
    const fb = wrap.querySelector('#v3fallback'); if (fb) fb.remove();
    wrap.appendChild(canvas);
    canvas.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', e => { if (!drag) return; panX += e.clientX - drag.x; panY += e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY; });
    canvas.addEventListener('pointerup', () => { drag = null; });
    new ResizeObserver(() => {}).observe(wrap);
    (function loop() { raf = requestAnimationFrame(loop); if (built) frame(); })();
  }
  function labelAnchors() {
    if (!model) return [];
    const M = model, unit = M.r.US !== false ? 'ft' : 'm', fmt = x => isFinite(x) ? (+x).toFixed(2) : '—';
    const mid = (M.xC0 + M.xC1 - 1) / 2;
    return [
      { text: 'Road ' + fmt(M.lay.crest) + ' ' + unit, x: mid, y: M.yMid },
      { text: 'HW ' + fmt(M.hw) + ' ' + unit, x: Math.max(0, M.xIn - 2), y: M.yMid },
      { text: 'TW ' + fmt(M.tw) + ' ' + unit, x: Math.min(M.nX - 1, M.xOut + 1), y: M.yMid }
    ];
  }
  function placeLabels(origin) {
    const host = document.getElementById('v3labels'), svg = document.getElementById('v3leaders');
    if (!host || !svg || !canvas || !origin || !origin.g) return;
    const g = origin.g, boxes = [];
    labelAnchors().forEach(lb => {
      const o = orient(lb.x, lb.y), p = tileTop(g, Math.round(o.x), Math.round(o.y));
      const ax = origin.x + p.x * (origin.z || 1), ay = origin.y + (p.y + CulvertIso.TH / 2) * (origin.z || 1);
      const tw = Math.max(72, lb.text.length * 7.2 + 14), th = 18;
      let x = ax + 8, y = ay - 28;
      if (lb.text.indexOf('Road') === 0) { x = ax - tw / 2; y = ay - 36; }
      if (lb.text.indexOf('TW') === 0) x = ax - tw - 8;
      x = Math.max(2, Math.min(canvas.width - tw - 2, x));
      y = Math.max(2, Math.min(canvas.height - th - 2, y));
      boxes.push({ x, y, w: tw, h: th, ax, ay, text: lb.text });
    });
    host.innerHTML = boxes.map(b => `<span style="left:${b.x | 0}px;top:${b.y | 0}px">${b.text}</span>`).join('');
    svg.setAttribute('viewBox', `0 0 ${canvas.width} ${canvas.height}`);
    svg.setAttribute('width', canvas.width); svg.setAttribute('height', canvas.height);
    svg.innerHTML = boxes.map(b => `<line x1="${b.ax | 0}" y1="${b.ay | 0}" x2="${(b.x + 8) | 0}" y2="${(b.y + 9) | 0}" stroke="#f3e9d8" stroke-width="1"/>`).join('');
  }
  function snapshot() {
    if (!model || !terrain) return null;
    const saved = { zoom, panX, panY, focus, rot, preset: presetName, ug };
    if (presetName === 'inlet') { /* keep full crossing; the close-up crops below */ }
    const g = sceneGeom();
    const src = paintBuffer(g);
    const fitW = 1400, fitH = 780;
    const out = document.createElement('canvas'); out.width = fitW; out.height = fitH;
    const o = out.getContext('2d'); o.fillStyle = SKY; o.fillRect(0, 0, fitW, fitH);
    let dx, dy, sc;
    if (presetName === 'inlet') {
      const or = orient(Math.round(model.xIn), Math.round(model.yMid)), ip = tileTop(g, or.x, or.y);
      const cw = Math.min(g.w, 640), ch = Math.min(g.h, 420);
      const sx = Math.max(0, Math.min(g.w - cw, ip.x - cw * 0.45));
      const sy = Math.max(0, Math.min(g.h - ch, ip.y - ch * 0.45));
      sc = Math.min(fitW / cw, fitH / ch);
      dx = (fitW - cw * sc) / 2; dy = (fitH - ch * sc) / 2;
      o.imageSmoothingEnabled = false;
      o.drawImage(src, sx, sy, cw, ch, dx, dy, cw * sc, ch * sc);
      dx -= sx * sc; dy -= sy * sc;
    } else {
      sc = Math.min(fitW / g.w, fitH / g.h);
      dx = (fitW - g.w * sc) / 2; dy = (fitH - g.h * sc) / 2;
      o.imageSmoothingEnabled = sc < 0.99;
      o.drawImage(src, dx, dy, g.w * sc, g.h * sc);
    }
    o.font = '700 13px ui-monospace, Menlo, Consolas, monospace'; o.textBaseline = 'middle';
    labelAnchors().forEach(lb => {
      const or = orient(lb.x, lb.y), p = tileTop(g, Math.round(or.x), Math.round(or.y));
      const ax = dx + p.x * sc, ay = dy + (p.y + CulvertIso.TH / 2) * sc;
      const tw = Math.max(72, lb.text.length * 7.2 + 12), th = 18;
      let x = ax + 10, y = ay - 26;
      if (lb.text.indexOf('Road') === 0) { x = ax - tw / 2; y = ay - 34; }
      if (lb.text.indexOf('TW') === 0) x = ax - tw - 8;
      x = Math.max(4, Math.min(fitW - tw - 4, x)); y = Math.max(4, Math.min(fitH - th - 4, y));
      o.strokeStyle = '#f3e9d8'; o.lineWidth = 1; o.beginPath(); o.moveTo(ax, ay); o.lineTo(x + 6, y + 9); o.stroke();
      o.fillStyle = 'rgba(20,24,30,.9)'; o.fillRect(x, y, tw, th);
      o.strokeStyle = '#3f5a73'; o.strokeRect(x + 0.5, y + 0.5, tw - 1, th - 1);
      o.fillStyle = '#f3e9d8'; o.fillText(lb.text, x + 6, y + th / 2 + 0.5);
    });
    zoom = saved.zoom; panX = saved.panX; panY = saved.panY; focus = saved.focus; rot = saved.rot; presetName = saved.preset; ug = saved.ug;
    try { return out.toDataURL('image/jpeg', 0.86); } catch (e) { return null; }
  }
  function frameInlet() { presetName = 'inlet'; zoom = 2; panX = panY = 0; }

  window.View3D = {
    update(anchor, data) { latest = data; card(anchor); if (failed) return; if (!canvas) boot(); rebuild(data); },
    snapshot, frameInlet,
    ready() { return !!canvas && built; }
  };
})();
