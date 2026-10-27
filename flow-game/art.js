/* Storm Designer - procedural isometric pixel art (no image files). Terrain raster modeled on swp3-game/art.js
 * (same diamond geometry as swp3-game/pick.js); sprites use the shared SWP3Art helpers (rect/fine/shadow/at). */
(function (root) {
  'use strict';
  var B = root.SWP3Art, TW = B.TW, TH = B.TH, r = B.rect, fd = B.fine, at = B.at, hash = B.hash;
  function hex(h) { var n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function ramp(a) { return a.map(hex); }
  var R = {
    G: ramp(['#94d063', '#72b44a', '#589739', '#41742b']),
    T: ramp(['#7cb854', '#5e9a3e', '#4a7f31', '#365f24']),
    H: ramp(['#8fcb5e', '#6daf47', '#548f37', '#3e6d29']),
    P: ramp(['#7a7a80', '#66666c', '#55555a', '#444449']),
    R: ramp(['#6c6c73', '#5a5a61', '#4b4b51', '#3c3c41']),
    Q: ramp(['#707076', '#5e5e64', '#4e4e54', '#3e3e43']),
    X: ramp(['#6c6c73', '#5a5a61', '#4b4b51', '#3c3c41']),
    C: ramp(['#5aa0dc', '#3f80c0', '#336aa3', '#27558a']),
    wallSoil: ramp(['#8a6038', '#74502e', '#5e4024', '#47301b']),
    wallSoil2: ramp(['#94683e', '#7d5733', '#664628', '#4e351e']),
    wallCreek: ramp(['#3a74ad', '#2f6194', '#264f7a', '#1d3e61']),
    wallRoad: ramp(['#8a8a90', '#76767c', '#606066', '#4a4a50'])
  };
  var BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  function tone(n, b, bias) { var s = 0.4 * n + 0.3 * b + 0.15 + bias; return s < 0.24 ? 0 : s < 0.6 ? 1 : s < 0.78 ? 2 : 3; }
  function cn(x, y, s) { return 0.65 * hash(x >> 1, y >> 1, s) + 0.35 * hash(x, y, s + 100); }
  var ROAD = { R: 1, Q: 1, X: 1, P: 0 };
  // g: {W,H,types,z,ox,oy,w,h,TW,TH,BASE}
  function drawTerrain(ctx, g) {
    var TW = g.TW || 64, TH = g.TH || TW / 2, BASE = g.BASE != null ? g.BASE : 20, Q = TW / 64;
    var img = ctx.createImageData(g.w, g.h), d = new Uint32Array(img.data.buffer), W = g.W, H = g.H;
    function put(x, y, c, k) { if (x < 0 || y < 0 || x >= g.w || y >= g.h) return; k = k == null ? 1 : k; d[y * g.w + x] = (255 << 24) | (Math.min(255, c[2] * k) << 16) | (Math.min(255, c[1] * k) << 8) | Math.min(255, c[0] * k); }
    function T(x, y) { return x < 0 || y < 0 || x >= W || y >= H ? null : g.types[y * W + x]; }
    function isRoad(t) { return !!ROAD[t]; }
    for (var s = 0; s <= W + H - 2; s++) for (var ty = 0; ty < H; ty++) {
      var tx = s - ty; if (tx < 0 || tx >= W) continue;
      var i = ty * W + tx, t = g.types[i], px0 = g.ox + (tx - ty) * TW / 2, py0 = g.oy + (tx + ty) * TH / 2 - g.z[i];
      var depth = g.z[i] + BASE, wall = t === 'C' ? R.wallCreek : isRoad(t) || t === 'P' ? R.wallRoad : null;
      for (var side = 0; side < 2; side++) for (var c = 0; c < TW / 2; c++) {
        var x = side ? px0 + c : px0 - TW / 2 + c, yTop = side ? py0 + TH - (c + 0.5) * 0.5 : py0 + TH / 2 + (c + 0.5) * 0.5;
        var y0 = Math.ceil(yTop - 0.5), lit = side ? 0.78 : 1.0;
        for (var y = y0; y + 0.5 <= yTop + depth; y++) {
          var dd = y - yTop, n = cn(x, y, 7), b = BAYER[(y & 3) * 4 + (x & 3)] / 16, col;
          if (dd < 3 * Q && (t === 'G' || t === 'T' || t === 'H')) col = R.G[dd < 1.5 * Q ? 2 : 3];
          else if (wall) col = wall[tone(n, b, dd < 4 * Q ? 0.25 : 0)];
          else { var layer = Math.floor((y - py0 + (side ? -c : c) * 0.5 + g.z[i]) / (7 * Q)) & 1; col = (layer ? R.wallSoil2 : R.wallSoil)[tone(n, b, 0.05)]; }
          var k = lit;
          if (dd < 4 * Q && dd >= Q) k *= 0.82 + dd / Q * 0.04;
          if (dd > depth - 5 * Q) k *= 0.8 + (depth - dd) / Q * 0.04;
          if (side && c === 0) k *= 1.1; if (!side && c === TW / 2 - 1) k *= 1.12;
          put(x, y, col, Math.min(1.15, k));
        }
      }
      var rn = function (x2, y2) { return isRoad(T(x2, y2)); };
      var alongY = (rn(tx, ty - 1) || rn(tx, ty + 1)) && !(rn(tx - 1, ty) || rn(tx + 1, ty));
      var inter = (rn(tx, ty - 1) || rn(tx, ty + 1)) && (rn(tx - 1, ty) || rn(tx + 1, ty));
      var zi = g.z[i], Z = function (x2, y2) { return x2 < 0 || y2 < 0 || x2 >= W || y2 >= H ? -1e9 : g.z[y2 * W + x2]; };
      var stepR = Z(tx + 1, ty) < zi - 0.5, stepB = Z(tx, ty + 1) < zi - 0.5, stepL = Z(tx - 1, ty) < zi - 0.5, stepT = Z(tx, ty - 1) < zi - 0.5;
      var diffR = T(tx + 1, ty) !== t, diffB = T(tx, ty + 1) !== t;
      for (var py = 0; py < TH; py++) for (var px = -TW / 2; px < TW / 2; px++) {
        var dx = px + 0.5, dy = py + 0.5, u = dy / TH + dx / TW, v = dy / TH - dx / TW;
        if (u < 0 || u >= 1 || v < 0 || v >= 1) continue;
        var X = px0 + px, Y = py0 + py, nn = Q > 1 ? 0.75 * cn(Math.floor(X / Q), Math.floor(Y / Q), 1) + 0.25 * hash(X, Y, 2) : cn(X, Y, 1), bb = BAYER[(Y & 3) * 4 + (X & 3)] / 16, rp = R[t] || R.G, bias = (u + v) * 0.08 - 0.04, cc;
        var a = alongY ? u : v, l = alongY ? v : u; // a = across the road, l = along
        if (t === 'G' || t === 'T' || t === 'H') { cc = rp[tone(nn, bb, bias)]; if (hash(X, Y, 3) > 0.95) cc = rp[0]; else if (hash(X, Y - 1, 3) > 0.95) cc = rp[3];
          if (t === 'G' && hash(X, Y, 4) > 0.996) cc = hash(X, Y, 5) > 0.5 ? [240, 220, 90] : [240, 240, 240];
          if (t === 'T' && hash(X >> 2, Y >> 2, 6) > 0.8) cc = [86, 70, 44];
          if (t === 'H') { var fu = Math.abs(u - 0.5), fv = Math.abs(v - 0.5); if (Math.max(fu, fv) > 0.47 && (Math.floor((u + v) * 16) % 2)) cc = [196, 176, 140]; } } // lot fence
        else if (t === 'P') { cc = rp[tone(nn, bb, bias * 0.5)]; if ((Math.abs((u * 4) % 1 - 0.5) < 0.03) && v > 0.15 && v < 0.55) cc = [230, 230, 230]; }
        else if (t === 'R' || t === 'X') { cc = rp[tone(nn, bb, bias * 0.4)]; if (nn > 0.975) cc = rp[0];
          if (!inter) {
            if (a < 0.07 || a > 0.93) cc = a < 0.035 || a > 0.965 ? [206, 204, 196] : [168, 166, 160]; // curb top / face
            else if (a < 0.17 || a > 0.83) cc = (Math.floor(l * 8) % 2) ? [150, 148, 144] : [142, 140, 136]; // concrete gutter pan
            else if (Math.abs(a - 0.5) < 0.025 && Math.floor(l * 4) % 2 === 0) cc = [232, 196, 72]; // centerline
          } else if (Math.min(u, v, 1 - u, 1 - v) < 0.1) cc = [150, 148, 144];
          if (t === 'X' && (a < 0.06 || a > 0.94)) cc = [196, 196, 200]; }
        else if (t === 'Q') { cc = rp[tone(nn, bb, bias * 0.4)]; if (a < 0.14 || a > 0.86) cc = hash(X, Y, 7) > 0.5 ? [168, 150, 110] : [140, 124, 90]; // gravel shoulder
          else if (Math.abs(a - 0.5) < 0.025 && Math.floor(l * 4) % 2 === 0) cc = [232, 232, 232]; }
        else if (t === 'C') { cc = rp[tone(nn, bb, 0.1 + (Math.abs(a - 0.5) < 0.3 ? 0.15 : 0))]; }
        else cc = rp[1];
        if (u < 0.035 && stepL) cc = rp[0];
        else if (v < 0.035 && stepT) cc = rp[0];
        else if ((u > 0.965 && stepR) || (v > 0.965 && stepB)) cc = rp[3];
        else if ((u > 0.965 && diffR) || (v > 0.965 && diffB)) cc = rp[2];
        put(X, Y, cc, 1);
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  // ---------- scenery sprites ----------
  var ROOFS = ['#a8443a', '#6a4a8a', '#3a5a8a', '#8a6a3a', '#4a7a5a'], WALLS = ['#e8dcc0', '#d8c8a8', '#f0e8d8', '#c8b898', '#e0d0c8'];
  function drawHouse(ctx, p, seed) {
    var c = at(p, 0.5, 0.5), cx = Math.round(c.x), cy = Math.round(c.y), k = (seed * 7) % 5, w = 18, h = 12;
    B.shadow(ctx, cx, cy + 2, 24, 10, 0.25);
    // left wall, right wall, roof
    ctx.fillStyle = WALLS[k]; ctx.beginPath(); ctx.moveTo(cx - w, cy - 2); ctx.lineTo(cx, cy + 7); ctx.lineTo(cx, cy + 7 - h); ctx.lineTo(cx - w, cy - 2 - h); ctx.closePath(); ctx.fill();
    ctx.fillStyle = shade(WALLS[k], 0.8); ctx.beginPath(); ctx.moveTo(cx, cy + 7); ctx.lineTo(cx + w, cy - 2); ctx.lineTo(cx + w, cy - 2 - h); ctx.lineTo(cx, cy + 7 - h); ctx.closePath(); ctx.fill();
    ctx.fillStyle = ROOFS[k]; ctx.beginPath(); ctx.moveTo(cx - w - 2, cy - 2 - h); ctx.lineTo(cx, cy + 8 - h); ctx.lineTo(cx + 2, cy - 4 - h - 8); ctx.lineTo(cx - w + 2, cy - 13 - h - 4); ctx.closePath(); ctx.fill();
    ctx.fillStyle = shade(ROOFS[k], 0.75); ctx.beginPath(); ctx.moveTo(cx, cy + 8 - h); ctx.lineTo(cx + w + 2, cy - 1 - h); ctx.lineTo(cx + w - 2 + 2, cy - 13 - h - 4 + 2); ctx.lineTo(cx + 2, cy - 4 - h - 8); ctx.closePath(); ctx.fill();
    r(ctx, cx - 12, cy - 9, 4, 4, '#5a7ea8'); r(ctx, cx - 6, cy - 6, 3, 6, '#6a4a2a'); r(ctx, cx + 5, cy - 8, 4, 4, '#4a6e98'); r(ctx, cx + 12, cy - 11, 4, 4, '#4a6e98');
    fd(ctx, cx - 12, cy - 9, 2, 2, '#bfe0ff'); fd(ctx, cx + 5, cy - 8, 2, 2, '#bfe0ff');
  }
  function shade(h, k) { var c = hex(h); return 'rgb(' + Math.round(c[0] * k) + ',' + Math.round(c[1] * k) + ',' + Math.round(c[2] * k) + ')'; }
  function drawTree(ctx, x, y, seed, t, wind) {
    x = Math.round(x); y = Math.round(y); var s = 0.8 + 0.4 * hash(seed, 1, 9), sw = Math.round(Math.sin((t || 0) / 500 + seed) * (wind || 0) * 2);
    B.shadow(ctx, x, y, 9 * s, 3.5 * s, 0.3);
    r(ctx, x - 1, y - 8 * s, 3, 8 * s, '#6a4a2a'); fd(ctx, x - 1, y - 8 * s, 1, 8 * s, '#8a6a4a');
    var g = ['#2f6a2a', '#3f8a35', '#55a845', '#7cc860'];
    [[0, -18, 8], [-5, -13, 6], [5, -13, 6], [0, -11, 7]].forEach(function (b, k) { var bx = x + b[0] * s + sw * (k === 0 ? 1 : 0.5), by = y + b[1] * s, rr = b[2] * s;
      ctx.fillStyle = g[k === 3 ? 0 : 1]; ctx.beginPath(); ctx.arc(bx, by, rr, 0, 6.283); ctx.fill(); ctx.fillStyle = g[2]; ctx.beginPath(); ctx.arc(bx - rr * 0.3, by - rr * 0.3, rr * 0.55, 0, 6.283); ctx.fill(); });
    r(ctx, x - 3 * s + sw, y - 22 * s, 2, 2, g[3]);
  }
  var CARS = ['#d83a2a', '#2a6ad8', '#e8e8e8', '#f0c020', '#2a2a2a', '#3aa860'];
  function drawCar(ctx, x, y, dirX, seed, wet) { // dirX: +1 travels along +x screen-right-down, -1 along +y (screen-left-down)
    x = Math.round(x); y = Math.round(y); var col = CARS[seed % CARS.length];
    B.shadow(ctx, x, y + 1, 10, 4, 0.35);
    var ax = dirX > 0 ? 1 : -1;
    for (var k = -6; k <= 6; k++) { var yy = y + Math.round(k * 0.5) * ax; r(ctx, x + k, yy - 5, 1, 5, k > 3 || k < -3 ? shade(col, 0.85) : col); }
    for (k = -3; k <= 2; k++) { var y2 = y + Math.round(k * 0.5) * ax; r(ctx, x + k, y2 - 8, 1, 3, k === -3 || k === 2 ? '#2a3440' : '#8ab8d8'); }
    r(ctx, x - 5, y - 1 - 3 * ax, 2, 2, '#1a1a1a'); r(ctx, x + 4, y - 1 + 3 * ax, 2, 2, '#1a1a1a');
    if (wet) { ctx.fillStyle = 'rgba(220,240,255,.7)'; ctx.fillRect(x - 8, y + 1, 3, 1); ctx.fillRect(x + 6, y + 1, 3, 1); }
  }
  // ---------- drainage sprites ----------
  // inlet pair on a curbed street tile. o.alongY: road runs along y. o.len 5/10/15. o.flow 0..1 intake animation.
  function drawInlet(ctx, p, o) {
    var len = o.len || 10, f = len / 15 * 0.6 + 0.2, l0 = 0.5 - f / 2, l1 = 0.5 + f / 2, t = o.t || 0, prog = o.prog == null ? 1 : o.prog;
    [0.06, 0.94].forEach(function (a, side) {
      var A0 = o.alongY ? at(p, a, l0) : at(p, l0, a), A1 = o.alongY ? at(p, a, l0 + (l1 - l0) * prog) : at(p, l0 + (l1 - l0) * prog, a);
      var n = Math.max(2, Math.round(Math.hypot(A1.x - A0.x, A1.y - A0.y)));
      for (var q = 0; q <= n; q++) { var x = A0.x + (A1.x - A0.x) * q / n, y = A0.y + (A1.y - A0.y) * q / n;
        r(ctx, x, y - 3, 1, 3, '#d8d6cc'); r(ctx, x, y, 1, 1, '#1a1a1e'); if (q % 3 === 0) r(ctx, x, y - 2, 1, 1, '#a8a69c'); } // inlet top slab + throat
      if (o.flow > 0.05) for (var k = 0; k < 4; k++) { var ph = (t / 400 + k / 4 + side * 0.3) % 1, pt = o.alongY ? at(p, a + (side ? -1 : 1) * 0.1 * (1 - ph), 0.5 + (k - 1.5) * f / 5) : at(p, 0.5 + (k - 1.5) * f / 5, a + (side ? -1 : 1) * 0.1 * (1 - ph));
        ctx.fillStyle = 'rgba(200,235,255,' + (0.8 * o.flow * (1 - ph)).toFixed(2) + ')'; ctx.fillRect(Math.round(pt.x) - 1, Math.round(pt.y), 2, 1); }
    });
    // manhole lid behind the curb
    var m = o.alongY ? at(p, 0.5, 0.5) : at(p, 0.5, 0.5); if (o.box) drawLid(ctx, m.x, m.y + 1);
  }
  function drawLid(ctx, x, y, surch, t) {
    x = Math.round(x); y = Math.round(y);
    ctx.fillStyle = '#2a2a2e'; ctx.beginPath(); ctx.ellipse(x, y, 5, 2.5, 0, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#5a5a60'; ctx.beginPath(); ctx.ellipse(x, y - 0.5, 4, 2, 0, 0, 6.283); ctx.fill();
    r(ctx, x - 2, y - 1, 4, 1, '#3a3a40'); fd(ctx, x - 3, y - 2, 2, 1, '#8a8a90');
    if (surch) { var ph = ((t || 0) / 300) % 1; ctx.fillStyle = 'rgba(200,235,255,.9)'; for (var k = 0; k < 6; k++) { var ang = k / 6 * 6.283; ctx.fillRect(Math.round(x + Math.cos(ang) * (2 + 6 * ph)), Math.round(y - 3 - 6 * Math.sin(ph * 3.14) + Math.sin(ang) * 2), 2, 2); } }
  }
  var LIN = { grass: ['#5e9a3e', '#7cb854', '#41742b'], mat: ['#b89a5a', '#d8c080', '#8a7040'], rock: ['#8a8a86', '#b8b8b2', '#5a5a56'], conc: ['#b8b8b4', '#d0d0cc', '#9a9a96'] };
  function drawDitch(ctx, p, o) { // V-ditch along the flow direction (o.dirU: 1 along u, 0 along v)
    var pal = LIN[o.lining || 'grass'], prog = o.prog == null ? 1 : o.prog;
    for (var s2 = 0; s2 < 30 * prog; s2++) { var l = s2 / 30;
      for (var w = -6; w <= 6; w++) { var a = 0.5 + w / 26, pt = o.alongV ? at(p, a, l) : at(p, l, a), k = Math.abs(w) / 6;
        var col = k > 0.85 ? '#3e6d29' : k < 0.25 ? (o.lining === 'conc' ? '#a0a09c' : '#3f6a8a') : pal[(s2 + w + (o.lining === 'rock' ? (hash(s2, w, 3) * 3 | 0) : 0)) % 3 === 0 ? 2 : (o.lining === 'mat' && (s2 + w) % 4 === 0) ? 1 : 0];
        if (o.lining === 'grass' && k >= 0.25 && hash(s2, w, 5) > 0.7) col = pal[1];
        ctx.fillStyle = col; ctx.fillRect(Math.round(pt.x), Math.round(pt.y + 2 - 2 * (1 - k)), 2, 1); } }
  }
  // Road-over-creek culvert in the isometric view (fix: barrels in the embankment faces, aligned with the creek, under the road).
  // p = top vertex of the road tile; o.axis 'u' (creek runs along +x) or 'v' (along +y); o.drop = px from road top down to the creek
  // bed on the visible (near) side; o.zs = px per ft vertically; o.dia (in), o.barrels; o.near/o.far = water depth px above the bed
  // on the near / far creek tile (headwater or tailwater). Only the near face is visible in this projection (faces +x/+y point at
  // the viewer); the far end shows as a parapet cap along the far road edge, the far barrels are hidden by the road fill.
  function culvertFace(p, axis) { return axis === 'u' ? { a: at(p, 1, 0), b: at(p, 1, 1), out: { x: TW / 2, y: TH / 2 }, fa: at(p, 0, 0), fb: at(p, 0, 1) }
    : { a: at(p, 0, 1), b: at(p, 1, 1), out: { x: -TW / 2, y: TH / 2 }, fa: at(p, 0, 0), fb: at(p, 1, 0) }; }
  function quad(ctx, pts, col) { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); for (var k = 1; k < pts.length; k++) ctx.lineTo(pts[k].x, pts[k].y); ctx.closePath(); ctx.fill(); }
  // barrels are drawn round at the game's (exaggerated) vertical scale so 36" vs 72" reads clearly; all shrink together to fit the face
  function culvertBarrels(o, len) { var n = Math.max(1, o.barrels || 1), Dft = (o.dia || 48) / 12, rv = Math.min(Dft * (o.zs || 3) / 2, (o.drop - 3) / 2), rh = rv * 0.95, gap = Math.max(1.5, rh * 0.4);
    var tot = n * 2 * rh + (n - 1) * gap, sc = tot > len * 0.8 ? len * 0.8 / tot : 1; rh *= sc; rv *= sc; gap *= sc; tot *= sc; rv = Math.max(1.5, rv); rh = Math.max(1.5, rh);
    var c = []; for (var k = 0; k < n; k++) c.push((len - tot) / 2 + rh + k * (2 * rh + gap)); return { rh: rh, rv: rv, c: c }; }
  function drawCulvertFar(ctx, p, o) { // parapet along the far road edge (drawn with the road tile, before anything in front)
    var f = culvertFace(p, o.axis), up = 2; quad(ctx, [f.fa, f.fb, { x: f.fb.x, y: f.fb.y - up }, { x: f.fa.x, y: f.fa.y - up }], '#d6d6cf');
    quad(ctx, [{ x: f.fa.x, y: f.fa.y - up }, { x: f.fb.x, y: f.fb.y - up }, { x: f.fb.x, y: f.fb.y - up - 1 }, { x: f.fa.x, y: f.fa.y - up - 1 }], '#efefe9'); }
  function drawCulvert(ctx, p, o) {
    var f = culvertFace(p, o.axis), drop = Math.max(4, o.drop || 12), prog = o.prog == null ? 1 : o.prog, a = f.a, b = f.b;
    var ex = b.x - a.x, ey = b.y - a.y, len = Math.sqrt(ex * ex + ey * ey), ux = ex / len, uy = ey / len, dn = function (q, d) { return { x: q.x, y: q.y + d }; };
    var rise = (1 - prog) * drop; // build animation: the wall rises out of the bed
    drawCulvertFar(ctx, p, o);
    // wingwalls flaring onto the near creek tile, top sloping down to the bed
    [a, b].forEach(function (q, s2) { var flare = s2 ? 1 : -1, side = { x: q.x + f.out.x * 0.16 + ux * flare * 2, y: q.y + f.out.y * 0.16 + uy * flare * 2 }; // short wingwalls, top sloping to the bed
      quad(ctx, [dn(q, Math.max(rise, drop * 0.35)), dn(q, drop), dn(side, drop), dn(side, Math.max(rise, drop * 0.8))], s2 ? '#a3a39c' : '#b3b3ac'); });
    // headwall: the whole near face of the embankment, concrete, with a light cap
    quad(ctx, [dn(a, rise), dn(b, rise), dn(b, drop), dn(a, drop)], '#c4c4bd');
    quad(ctx, [dn(a, rise), dn(b, rise), dn(b, rise + 2), dn(a, rise + 2)], '#e2e2dc');
    quad(ctx, [dn(a, drop - 1), dn(b, drop - 1), dn(b, drop), dn(a, drop)], '#8d8d86');
    if (prog < 0.6) return;
    var g = culvertBarrels({ dia: o.dia, barrels: o.barrels, zs: o.zs, drop: drop }, len);
    g.c.forEach(function (d) { var cx = a.x + ux * d, cy = a.y + uy * d + drop - g.rv - 0.5;
      ctx.save(); ctx.translate(cx, cy); ctx.transform(ux, uy, 0, 1, 0, 0);
      ctx.fillStyle = '#8a8a84'; ctx.beginPath(); ctx.ellipse(0, 0, g.rh + 1, g.rv + 1, 0, 0, Math.PI * 2); ctx.fill(); // concrete ring
      ctx.fillStyle = '#14181d'; ctx.beginPath(); ctx.ellipse(0, 0, g.rh, g.rv, 0, 0, Math.PI * 2); ctx.fill();          // dark bore
      ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.beginPath(); ctx.ellipse(-g.rh * 0.25, -g.rv * 0.35, g.rh * 0.45, g.rv * 0.3, 0, 0, Math.PI * 2); ctx.fill();
      if (o.flow > 0.02) { var t = o.t || 0; for (var k = 0; k < 4; k++) { var ph = (t / 260 + k / 4) % 1; ctx.fillStyle = 'rgba(205,235,255,' + (0.8 * (1 - ph)).toFixed(2) + ')'; ctx.fillRect(-g.rh * 0.7 + k * g.rh * 0.45, g.rv * (0.9 - Math.min(0.9, o.flow) * 0.9) + ph * 2, Math.max(1, g.rh * 0.3), 1); } }
      ctx.restore(); });
  }
  // water standing on a creek tile at depth px above its bed (headwater against the far wall / tailwater at the near outlet)
  function drawCreekWater(ctx, p, depth, t, seed, col) { if (depth <= 0.3) return; var q = { x: p.x, y: p.y - depth };
    B.diamond(ctx, q, 0.0, col || 'rgba(78,128,178,.78)'); for (var k = 0; k < 3; k++) { var ph = ((t || 0) / 900 + hash(k, seed || 0, 9)) % 1, w = at(q, 0.2 + 0.6 * ph, 0.2 + 0.6 * hash(k, 3, seed || 0)); ctx.fillStyle = 'rgba(225,242,255,' + (0.6 * Math.sin(ph * 3.14)).toFixed(2) + ')'; ctx.fillRect(Math.round(w.x) - 3, Math.round(w.y), 6, 1); }
  }
  function drawPond(ctx, p, o) { // excavated basin; o.level 0..1 water depth fraction
    B.diamond(ctx, p, 0.04, '#7d5733'); B.diamond(ctx, p, 0.1, '#5a9a48'); B.diamond(ctx, p, 0.2, '#6a8a4a');
    var lv = o.level || 0; if (lv > 0.01) { B.diamond(ctx, p, 0.2 - 0.14 * Math.min(1, lv), 'rgba(70,130,190,' + (0.6 + 0.3 * lv).toFixed(2) + ')');
      var t = o.t || 0; for (var k = 0; k < 3; k++) { var ph = (t / 1400 + hash(k, o.seed || 0, 3)) % 1, w = at(p, 0.3 + 0.4 * hash(k, 2, o.seed || 0), 0.3 + 0.4 * ph); ctx.fillStyle = 'rgba(220,240,255,' + (0.6 * Math.sin(ph * 3.14)).toFixed(2) + ')'; ctx.fillRect(Math.round(w.x) - 3, Math.round(w.y), 6, 1); } }
  }
  function drawOutlet(ctx, p, o) { // concrete riser with orifice + weir notch
    var c = at(p, 0.5, 0.5), x = Math.round(c.x), y = Math.round(c.y); B.shadow(ctx, x, y, 8, 3, 0.3);
    r(ctx, x - 5, y - 14, 10, 14, '#c8c8c2'); r(ctx, x - 5, y - 14, 10, 2, '#e8e8e2'); r(ctx, x + 2, y - 14, 3, 14, '#a8a8a2');
    r(ctx, x - 2, y - 12, 4, 2, '#2a2e34'); ctx.fillStyle = '#1a1e24'; ctx.beginPath(); ctx.arc(x - 1, y - 4, 2, 0, 6.283); ctx.fill();
    if (o.flow > 0.05) { var t = o.t || 0; for (var k = 0; k < 5; k++) { var ph = (t / 300 + k / 5) % 1; ctx.fillStyle = 'rgba(200,235,255,.8)'; ctx.fillRect(Math.round(x + 6 + ph * 10), Math.round(y - 3 + ph * ph * 6), 2, 1); } }
  }
  function drawUtility(ctx, p, t) { var c = at(p, 0.5, 0.5), x = Math.round(c.x), y = Math.round(c.y); r(ctx, x, y - 12, 1, 12, '#ddd'); r(ctx, x + 1, y - 12, 6, 4, Math.floor((t || 0) / 400) % 2 ? '#ffd400' : '#ffb000'); r(ctx, x - 8, y - 1, 16, 1, 'rgba(255,212,0,.8)'); }
  function drawNoBuild(ctx, p) { for (var k = 0; k < 8; k++) { var a = at(p, 0.1 + k * 0.1, 0.1), b = at(p, 0.1, 0.1 + k * 0.1); ctx.strokeStyle = 'rgba(230,60,40,.7)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); } }
  function drawFlag(ctx, x, y, col) { x = Math.round(x); y = Math.round(y); r(ctx, x, y - 26, 1, 26, '#5a0e08'); r(ctx, x + 1, y - 26, 8, 6, col || '#ff3b2f'); }
  root.FlowArt = { drawTerrain: drawTerrain, drawHouse: drawHouse, drawTree: drawTree, drawCar: drawCar, drawInlet: drawInlet, drawLid: drawLid, drawDitch: drawDitch,
    drawCulvert: drawCulvert, drawCulvertFar: drawCulvertFar, culvertFace: culvertFace, culvertBarrels: culvertBarrels, drawCreekWater: drawCreekWater, drawPond: drawPond, drawOutlet: drawOutlet, drawUtility: drawUtility, drawNoBuild: drawNoBuild, drawFlag: drawFlag, LIN: LIN, R: R };
})(this);
